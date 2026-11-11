import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { AlertCircle, BarChart3, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, Eye, FileText, Filter, Home, LoaderCircle, MapPinned, Minus, Plus, RotateCcw, Save, ShieldCheck, UsersRound, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { CensusWriteConfirmation } from '../CensusWriteConfirmation'
import { getLotFillColor } from '../mapLogic'
import type { QuestionnaireRecord } from '../questionnaires/questionnaireTypes'
import { QuestionnaireResponseForm } from './QuestionnaireResponseForm'
import type { QuestionnaireAnswers } from './questionnaireResponseLogic'
import { useCensusDialogFocus } from './useCensusDialogFocus'
import { getMapLotCode } from './lotDisplay'
import './CensusTerritory.css'

type Point = [number, number]
type Bbox = { minX: number; minY: number; maxX: number; maxY: number }
type TerritoryLot = { id: string; source_handle: string; label: string | null; layer_name: string; geometry: Point[]; area: number | null; is_valid: boolean; zone_number: number | null; zone_id: string | null }
type CensusZone = { id: string; name: string; color: string; active: boolean }
type MapImport = { id: string; file_name: string; status: 'DRAFT' | 'PUBLISHED' | 'ERROR'; bbox: Bbox | null; updated_at: string; division_saved_at: string }
type Household = { id: string; lot_id: string; label: string; active: boolean; created_at: string }
type LotAcs = { acs_id: string; full_name: string; scope: 'LOTE' | 'ZONA' }
type AcsOption = { id: string; full_name: string; email: string | null; active: boolean }
type HouseholdSummary = { household_id: string; lot_id: string; visit_count: number; last_visit_date: string | null; submitted_questionnaire_count: number; resident_count: number | null; income_band: string | null }
type Visit = { id: string; household_id: string; visit_date: string; status: 'IN_PROGRESS' | 'COMPLETED' | 'NO_CONTACT' | 'CANCELLED'; notes: string; created_at: string; completed_at: string | null; acs_id: string | null }
type FormSnapshot = Pick<QuestionnaireRecord, 'id' | 'slug' | 'title' | 'subtitle' | 'description' | 'version' | 'form_schema'>
type ResponseMeta = { id: string; visit_id: string; questionnaire_id: string; status: 'DRAFT' | 'SUBMITTED'; submitted_at: string | null; created_at: string; questionnaire_version: number; questionnaire_snapshot: FormSnapshot }
type MapMode = 'zones' | 'questionnaire' | 'visits'
type CoverageStatus = 'answered' | 'partial' | 'draft' | 'questionnaire_pending' | 'in_progress' | 'no_contact' | 'no_visit' | 'no_activity' | 'cancelled'
type VisitMapStatus = 'completed' | 'in_progress' | 'no_contact' | 'no_visit' | 'no_activity' | 'cancelled'
type MapTooltip = { lotId: string; x: number; y: number }
type LotActivity = { householdCount: number; visitCount: number; latestVisit: Visit | null }
type ResponseEditorState = { responseId: string | null; visitId: string; form: FormSnapshot; answers: QuestionnaireAnswers; status: 'DRAFT' | 'SUBMITTED'; readOnly: boolean }
type VisitDraft = { household: Household; visitDate: string; notes: string; questionnaireId: string }
type PendingWrite =
  | { kind: 'household'; lot: TerritoryLot; lotCode: string; label: string }
  | { kind: 'lot-acs'; lot: TerritoryLot; lotCode: string; acsId: string; acsName: string }
  | { kind: 'visit'; draft: VisitDraft }
  | { kind: 'response'; editor: ResponseEditorState; answers: QuestionnaireAnswers; status: 'DRAFT' | 'SUBMITTED' }
type NoticeTone = 'success' | 'error' | 'info'
type PageResult<T> = { data: T[] | null; error: { message: string } | null }

const mapSelect = 'id,source_handle,label,layer_name,geometry,area,is_valid,zone_number,zone_id'
const formSelect = 'id,slug,title,subtitle,description,status,version,form_schema,created_at,updated_at'
const statusLabels = { IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluída', NO_CONTACT: 'Sem contato', CANCELLED: 'Cancelada' } as const
const PAGE_SIZE = 1000
const UNASSIGNED_ZONE_FILTER = '__unassigned__'

async function fetchAllPages<T>(loadPage: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await loadPage(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

function splitIntoBatches<T>(values: T[], size = 200): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < values.length; index += size) batches.push(values.slice(index, index + size))
  return batches
}

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return 'Ainda não registrada'
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(date)
}

function dateToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formSnapshot(form: QuestionnaireRecord): FormSnapshot {
  return { id: form.id, slug: form.slug, title: form.title, subtitle: form.subtitle, description: form.description, version: form.version, form_schema: form.form_schema }
}

export function CensusTerritory({ onOpenQuestionnaires }: { onOpenQuestionnaires: () => void }) {
  const [mapImport, setMapImport] = useState<MapImport | null>(null)
  const [lots, setLots] = useState<TerritoryLot[]>([])
  const [zones, setZones] = useState<CensusZone[]>([])
  const [activeForms, setActiveForms] = useState<QuestionnaireRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [mapError, setMapError] = useState('')
  const [mapMode, setMapMode] = useState<MapMode>('zones')
  const [zoneFilterIds, setZoneFilterIds] = useState<string[]>([])
  const [coverageFormId, setCoverageFormId] = useState('')
  const [questionnaireStatusFilter, setQuestionnaireStatusFilter] = useState<'all' | CoverageStatus>('all')
  const [coverageHouseholds, setCoverageHouseholds] = useState<Household[]>([])
  const [coverageVisits, setCoverageVisits] = useState<Visit[]>([])
  const [coverageResponses, setCoverageResponses] = useState<ResponseMeta[]>([])
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [selectedLot, setSelectedLot] = useState<TerritoryLot | null>(null)
  const [mapTooltip, setMapTooltip] = useState<MapTooltip | null>(null)
  const [panelError, setPanelError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [households, setHouseholds] = useState<Household[]>([])
  const [summaries, setSummaries] = useState<HouseholdSummary[]>([])
  const [lotAcs, setLotAcs] = useState<LotAcs[]>([])
  const [acsOptions, setAcsOptions] = useState<AcsOption[]>([])
  const [canManageAcs, setCanManageAcs] = useState(false)
  const [showAcsForm, setShowAcsForm] = useState(false)
  const [selectedAcsId, setSelectedAcsId] = useState('')
  const [visits, setVisits] = useState<Visit[]>([])
  const [responses, setResponses] = useState<ResponseMeta[]>([])
  const [authorized, setAuthorized] = useState(false)
  const [showHouseholdForm, setShowHouseholdForm] = useState(false)
  const [householdLabel, setHouseholdLabel] = useState('')
  const [visitDraft, setVisitDraft] = useState<VisitDraft | null>(null)
  const [responseEditor, setResponseEditor] = useState<ResponseEditorState | null>(null)
  const [pendingWrite, setPendingWrite] = useState<PendingWrite | null>(null)
  const [writing, setWriting] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<NoticeTone>('info')
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const panStartRef = useRef({ x: 0, y: 0, startX: 0, startY: 0 })
  const pointerMapRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null)
  const pinchWasActiveRef = useRef(false)
  const pendingLotRef = useRef<TerritoryLot | null>(null)
  const movedRef = useRef(false)
  const requestRef = useRef(0)
  const closeVisitDialog = useCallback(() => setVisitDraft(null), [])
  const visitDialogRef = useCensusDialogFocus(Boolean(visitDraft), closeVisitDialog)

  const loadMap = useCallback(async () => {
    const db = supabase
    if (!db) { setMapError('O serviço de dados da Saúde da Família/ACS não está disponível nesta sessão.'); setLoading(false); return }
    setLoading(true)
    setMapError('')
    try {
      const [importsResult, zonesResult, formsResult] = await Promise.all([
        db.from('census_territory_map_imports').select('id,file_name,status,bbox,updated_at,division_saved_at').order('division_saved_at', { ascending: false }).order('updated_at', { ascending: false }).limit(1),
        db.from('census_zones').select('id,name,color,active').order('created_at').limit(500),
        db.from('census_questionnaires').select(formSelect).eq('status', 'ACTIVE').order('updated_at', { ascending: false }).limit(100),
      ])
      if (importsResult.error) throw new Error(`Não foi possível localizar o mapa salvo: ${importsResult.error.message}`)
      if (zonesResult.error) throw new Error(`Não foi possível carregar as zonas: ${zonesResult.error.message}`)
      if (formsResult.error) throw new Error(`Não foi possível carregar os questionários ativos: ${formsResult.error.message}`)
      const current = (importsResult.data?.[0] || null) as MapImport | null
      setMapImport(current)
      setZones((zonesResult.data || []) as CensusZone[])
      setActiveForms((formsResult.data || []) as QuestionnaireRecord[])
      if (!current) { setLots([]); return }
      const lotRows = await fetchAllPages<TerritoryLot>((from, to) => db.from('census_territory_map_lots').select(mapSelect).eq('import_id', current.id).order('source_handle').order('id').range(from, to))
      setLots(lotRows)
      const lotIds = lotRows.map((lot) => lot.id)
      const householdRows = (await Promise.all(splitIntoBatches(lotIds).map((batch) => fetchAllPages<Household>((from, to) => db.from('census_households').select('id,lot_id,label,active,created_at').in('lot_id', batch).eq('active', true).order('created_at').order('id').range(from, to))))).flat()
      setCoverageHouseholds(householdRows)
      const householdIds = householdRows.map((item) => item.id)
      const visitRows = householdIds.length ? (await Promise.all(splitIntoBatches(householdIds).map((batch) => fetchAllPages<Visit>((from, to) => db.from('census_visits').select('id,household_id,visit_date,status,notes,created_at,completed_at,acs_id').in('household_id', batch).order('visit_date', { ascending: false }).order('id').range(from, to))))).flat() : []
      setCoverageVisits(visitRows)
      const visitIds = visitRows.map((item) => item.id)
      const responseRows = visitIds.length ? (await Promise.all(splitIntoBatches(visitIds).map((batch) => fetchAllPages<ResponseMeta>((from, to) => db.from('census_questionnaire_responses').select('id,visit_id,questionnaire_id,status,submitted_at,created_at,questionnaire_version,questionnaire_snapshot').in('visit_id', batch).order('created_at', { ascending: false }).order('id').range(from, to))))).flat() : []
      setCoverageResponses(responseRows)
      if (!coverageFormId && formsResult.data?.[0]?.id) setCoverageFormId(formsResult.data[0].id)
    } catch (error) {
      setMapError(error instanceof Error ? error.message : 'Não foi possível carregar o mapa territorial.')
      setMapImport(null)
      setLots([])
      setCoverageHouseholds([]); setCoverageVisits([]); setCoverageResponses([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadMap() }, [loadMap])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      setMapTooltip(null)
      setZoom((current) => Math.min(24, Math.max(0.65, current * (event.deltaY < 0 ? 1.15 : 1 / 1.15))))
    }
    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [loading])

  const bbox = useMemo<Bbox | null>(() => {
    if (mapImport?.bbox) return mapImport.bbox
    if (!lots.length) return null
    const points = lots.flatMap((lot) => lot.geometry)
    return { minX: Math.min(...points.map((point) => point[0])), minY: Math.min(...points.map((point) => point[1])), maxX: Math.max(...points.map((point) => point[0])), maxY: Math.max(...points.map((point) => point[1])) }
  }, [mapImport, lots])
  const svgPoint = useCallback((point: Point): Point => {
    if (!bbox) return [0, 0]
    const width = Math.max(bbox.maxX - bbox.minX, 1)
    const height = Math.max(bbox.maxY - bbox.minY, 1)
    return [((point[0] - bbox.minX) / width) * 1000, ((bbox.maxY - point[1]) / height) * 1000]
  }, [bbox])
  const toSvg = useCallback((point: Point) => svgPoint(point).join(','), [svgPoint])

  const loadDossier = useCallback(async (lot: TerritoryLot) => {
    const db = supabase
    if (!db) return
    const requestId = ++requestRef.current
    setDetailLoading(true)
    setPanelError('')
    setNotice('')
    setHouseholds([]); setSummaries([]); setVisits([]); setResponses([]); setAuthorized(false)
    setLotAcs([]); setAcsOptions([]); setCanManageAcs(false); setShowAcsForm(false); setSelectedAcsId('')
    try {
      const { data: canAccess, error: accessError } = await db.rpc('census_user_can_access_lot', { p_lot_id: lot.id })
      if (accessError) throw new Error(`Não foi possível verificar o acesso ao lote: ${accessError.message}`)
      if (canAccess !== true) {
        if (requestId === requestRef.current) setPanelError('Este lote não está associado à sua zona de atuação. Se você acredita que deveria ter acesso, fale com o administrador do módulo Saúde da Família/ACS.')
        return
      }
      const [lotAcsResult, managerResult] = await Promise.all([
        db.rpc('census_get_lot_acs', { p_lot_id: lot.id }),
        db.rpc('census_can_manage_lot_acs'),
      ])
      if (lotAcsResult.error) throw new Error(`Não foi possível carregar o ACS responsável: ${lotAcsResult.error.message}`)
      if (managerResult.error) throw new Error(`Não foi possível verificar a permissão de vínculo: ${managerResult.error.message}`)
      const isManager = managerResult.data === true
      let options: AcsOption[] = []
      if (isManager) {
        const optionsResult = await db.from('census_acs').select('id,full_name,email,active').eq('active', true).order('full_name').limit(500)
        if (optionsResult.error) throw new Error(`Não foi possível carregar o catálogo de ACS: ${optionsResult.error.message}`)
        options = (optionsResult.data || []) as AcsOption[]
      }
      const householdRows = await fetchAllPages<Household>((from, to) => db.from('census_households').select('id,lot_id,label,active,created_at').eq('lot_id', lot.id).eq('active', true).order('created_at').order('id').range(from, to))
      let summaryRows: HouseholdSummary[] = []
      let visitRows: Visit[] = []
      let responseRows: ResponseMeta[] = []
      if (householdRows.length) {
        const householdIds = householdRows.map((item) => item.id)
        const [summaryResult, visitResult] = await Promise.all([
          fetchAllPages<HouseholdSummary>((from, to) => db.from('census_household_map_summary').select('household_id,lot_id,visit_count,last_visit_date,submitted_questionnaire_count,resident_count,income_band').eq('lot_id', lot.id).order('household_id').range(from, to)),
          Promise.all(splitIntoBatches(householdIds).map((householdBatch) => fetchAllPages<Visit>((from, to) => db.from('census_visits').select('id,household_id,visit_date,status,notes,created_at,completed_at,acs_id').in('household_id', householdBatch).order('visit_date', { ascending: false }).order('id').range(from, to)))).then((batches) => batches.flat()),
        ])
        summaryRows = summaryResult.map((row) => ({ household_id: row.household_id, lot_id: row.lot_id, visit_count: row.visit_count ?? 0, last_visit_date: row.last_visit_date, submitted_questionnaire_count: row.submitted_questionnaire_count ?? 0, resident_count: row.resident_count, income_band: row.income_band })) as HouseholdSummary[]
        visitRows = visitResult as Visit[]
        if (visitRows.length) {
          responseRows = (await Promise.all(splitIntoBatches(visitRows.map((visit) => visit.id)).map((visitBatch) => fetchAllPages<ResponseMeta>((from, to) => db.from('census_questionnaire_responses').select('id,visit_id,questionnaire_id,status,submitted_at,created_at,questionnaire_version,questionnaire_snapshot').in('visit_id', visitBatch).order('created_at', { ascending: false }).order('id').range(from, to))))).flat()
        }
      }
      if (requestId !== requestRef.current) return
      setAuthorized(true); setLotAcs((lotAcsResult.data || []) as LotAcs[]); setCanManageAcs(isManager); setAcsOptions(options); setHouseholds(householdRows); setSummaries(summaryRows); setVisits(visitRows); setResponses(responseRows)
    } catch (error) {
      if (requestId === requestRef.current) setPanelError(error instanceof Error ? error.message : 'Não foi possível carregar o dossiê deste lote.')
    } finally {
      if (requestId === requestRef.current) setDetailLoading(false)
    }
  }, [])

  function selectLot(lot: TerritoryLot) {
    setMapTooltip(null)
    setSelectedLot(lot)
    setShowHouseholdForm(false)
    setVisitDraft(null)
    setResponseEditor(null)
    void loadDossier(lot)
  }

  const summariesById = useMemo(() => new Map(summaries.map((item) => [item.household_id, item])), [summaries])
  const visitsByHousehold = useMemo(() => {
    const grouped = new Map<string, Visit[]>()
    for (const visit of visits) grouped.set(visit.household_id, [...(grouped.get(visit.household_id) || []), visit])
    return grouped
  }, [visits])
  const responsesByVisit = useMemo(() => {
    const grouped = new Map<string, ResponseMeta[]>()
    for (const response of responses) grouped.set(response.visit_id, [...(grouped.get(response.visit_id) || []), response])
    return grouped
  }, [responses])
  const coverageByLot = useMemo(() => {
    const householdByLot = new Map<string, Household[]>()
    for (const household of coverageHouseholds) householdByLot.set(household.lot_id, [...(householdByLot.get(household.lot_id) || []), household])
    const visitsByHousehold = new Map<string, Visit[]>()
    for (const visit of coverageVisits) visitsByHousehold.set(visit.household_id, [...(visitsByHousehold.get(visit.household_id) || []), visit])
    const responsesByVisit = new Map<string, ResponseMeta[]>()
    for (const response of coverageResponses) responsesByVisit.set(response.visit_id, [...(responsesByVisit.get(response.visit_id) || []), response])
    const result = new Map<string, CoverageStatus>()
    for (const lot of lots) {
      const households = householdByLot.get(lot.id) || []
      if (!households.length) { result.set(lot.id, 'no_activity'); continue }
      const states = households.map((household) => {
        const householdVisits = visitsByHousehold.get(household.id) || []
        const formResponses = householdVisits.flatMap((visit) => responsesByVisit.get(visit.id) || []).filter((response) => response.questionnaire_id === coverageFormId)
        if (formResponses.some((response) => response.status === 'SUBMITTED')) return 'answered' as const
        if (formResponses.some((response) => response.status === 'DRAFT')) return 'draft' as const
        const latest = householdVisits[0]
        if (!latest) return 'no_visit' as const
        if (latest.status === 'IN_PROGRESS') return 'in_progress' as const
        if (latest.status === 'NO_CONTACT') return 'no_contact' as const
        if (latest.status === 'COMPLETED') return 'questionnaire_pending' as const
        return 'cancelled' as const
      })
      if (states.every((state) => state === 'answered')) result.set(lot.id, 'answered')
      else if (states.some((state) => state === 'answered')) result.set(lot.id, 'partial')
      else if (states.some((state) => state === 'draft')) result.set(lot.id, 'draft')
      else if (states.some((state) => state === 'in_progress')) result.set(lot.id, 'in_progress')
      else if (states.some((state) => state === 'questionnaire_pending')) result.set(lot.id, 'questionnaire_pending')
      else if (states.some((state) => state === 'no_contact')) result.set(lot.id, 'no_contact')
      else if (states.some((state) => state === 'no_visit')) result.set(lot.id, 'no_visit')
      else result.set(lot.id, 'cancelled')
    }
    return result
  }, [coverageFormId, coverageHouseholds, coverageResponses, coverageVisits, lots])
  const visitStatusByLot = useMemo(() => {
    const householdByLot = new Map<string, Household[]>()
    for (const household of coverageHouseholds) householdByLot.set(household.lot_id, [...(householdByLot.get(household.lot_id) || []), household])
    const visitsByHousehold = new Map<string, Visit[]>()
    for (const visit of coverageVisits) visitsByHousehold.set(visit.household_id, [...(visitsByHousehold.get(visit.household_id) || []), visit])
    const result = new Map<string, VisitMapStatus>()
    for (const lot of lots) {
      const visits = (householdByLot.get(lot.id) || []).flatMap((household) => visitsByHousehold.get(household.id) || []).sort((a, b) => `${b.visit_date}-${b.created_at}`.localeCompare(`${a.visit_date}-${a.created_at}`))
      const latest = visits[0]
      result.set(lot.id, !(householdByLot.get(lot.id) || []).length ? 'no_activity' : !latest ? 'no_visit' : latest.status === 'IN_PROGRESS' ? 'in_progress' : latest.status === 'NO_CONTACT' ? 'no_contact' : latest.status === 'CANCELLED' ? 'cancelled' : 'completed')
    }
    return result
  }, [coverageHouseholds, coverageVisits, lots])
  const activityByLot = useMemo(() => {
    const result = new Map<string, LotActivity>()
    const lotByHousehold = new Map<string, string>()
    for (const household of coverageHouseholds) {
      lotByHousehold.set(household.id, household.lot_id)
      const current = result.get(household.lot_id) || { householdCount: 0, visitCount: 0, latestVisit: null }
      current.householdCount += 1
      result.set(household.lot_id, current)
    }
    for (const visit of coverageVisits) {
      const lotId = lotByHousehold.get(visit.household_id)
      if (!lotId) continue
      const current = result.get(lotId) || { householdCount: 0, visitCount: 0, latestVisit: null }
      current.visitCount += 1
      const visitTime = `${visit.visit_date}-${visit.created_at}`
      const latestTime = current.latestVisit ? `${current.latestVisit.visit_date}-${current.latestVisit.created_at}` : ''
      if (!current.latestVisit || visitTime > latestTime) current.latestVisit = visit
      result.set(lotId, current)
    }
    return result
  }, [coverageHouseholds, coverageVisits])
  const mapStatus = (lot: TerritoryLot): CoverageStatus => coverageByLot.get(lot.id) || 'no_visit'
  const mapVisitStatus = (lot: TerritoryLot): VisitMapStatus => visitStatusByLot.get(lot.id) || 'no_visit'
  const mapStatusLabels: Record<CoverageStatus, string> = { answered: 'Respondido', partial: 'Parcial', draft: 'Rascunho', questionnaire_pending: 'Questionário pendente', in_progress: 'Em andamento', no_contact: 'Sem contato', no_visit: 'Sem visita', no_activity: 'Sem cadastro e sem atividade', cancelled: 'Cancelada' }
  const statusColors: Record<CoverageStatus, string> = { answered: 'var(--acs-chart-completed)', partial: 'var(--acs-chart-partial)', draft: 'var(--acs-chart-progress)', questionnaire_pending: 'var(--acs-chart-progress)', in_progress: 'var(--acs-chart-progress)', no_contact: 'var(--acs-chart-no-contact)', no_visit: 'var(--acs-chart-no-visit)', no_activity: 'var(--acs-chart-no-activity)', cancelled: 'var(--acs-chart-cancelled)' }
  const visitStatusLabels: Record<VisitMapStatus, string> = { completed: 'Visita concluída', in_progress: 'Em andamento', no_contact: 'Sem contato', no_visit: 'Sem visita', no_activity: 'Sem cadastro e sem atividade', cancelled: 'Cancelada' }
  const visitStatusColors: Record<VisitMapStatus, string> = { completed: 'var(--acs-chart-completed)', in_progress: 'var(--acs-chart-progress)', no_contact: 'var(--acs-chart-no-contact)', no_visit: 'var(--acs-chart-no-visit)', no_activity: 'var(--acs-chart-no-activity)', cancelled: 'var(--acs-chart-cancelled)' }
  const activeMapForm = activeForms.find((form) => form.id === coverageFormId)
  const visibleLots = mapMode === 'zones'
    ? lots.filter((lot) => !zoneFilterIds.length || zoneFilterIds.includes(lot.zone_id || UNASSIGNED_ZONE_FILTER))
    : mapMode === 'questionnaire' && coverageFormId && questionnaireStatusFilter !== 'all'
      ? lots.filter((lot) => mapStatus(lot) === questionnaireStatusFilter)
      : lots
  const lotIndexById = useMemo(() => {
    const indexes = new Map<string, number>()
    lots.forEach((lot, index) => indexes.set(lot.id, index))
    return indexes
  }, [lots])
  const mapMetrics = useMemo(() => {
    const coverageStatuses = lots.map((lot) => mapStatus(lot))
    const visitStatuses = lots.map((lot) => mapVisitStatus(lot))
    const answered = coverageStatuses.filter((status) => status === 'answered').length
    const pending = coverageStatuses.length - answered
    const visited = visitStatuses.filter((status) => !['no_visit', 'no_activity'].includes(status)).length
    const noContact = visitStatuses.filter((status) => status === 'no_contact').length
    const inProgress = visitStatuses.filter((status) => status === 'in_progress').length
    const completed = visitStatuses.filter((status) => status === 'completed').length
    return { answered, pending, visited, noContact, inProgress, completed, noVisit: visitStatuses.filter((status) => status === 'no_visit').length, noActivity: visitStatuses.filter((status) => status === 'no_activity').length, coverage: coverageStatuses.length ? Math.round((answered / coverageStatuses.length) * 1000) / 10 : 0 }
  }, [coverageByLot, lots, visitStatusByLot])

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    setMapTooltip(null)
    const target = event.target instanceof Element ? event.target.closest('[data-lot-id]') : null
    const targetLot = target ? lots.find((lot) => lot.id === target.getAttribute('data-lot-id')) || null : null
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointerMapRef.current.size === 2) {
      const points = [...pointerMapRef.current.values()]
      pinchRef.current = { distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y), zoom }
      pinchWasActiveRef.current = true
      movedRef.current = true
      setDragging(false)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    pendingLotRef.current = targetLot
    movedRef.current = false
    panStartRef.current = { x: event.clientX, y: event.clientY, startX: pan.x, startY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!pointerMapRef.current.has(event.pointerId)) return
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointerMapRef.current.size >= 2 && pinchRef.current) {
      const points = [...pointerMapRef.current.values()]
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      if (pinchRef.current.distance > 0) setZoom(Math.min(24, Math.max(0.65, pinchRef.current.zoom * distance / pinchRef.current.distance)))
      return
    }
    const distance = Math.hypot(event.clientX - panStartRef.current.x, event.clientY - panStartRef.current.y)
    if (distance < 8) return
    if (!dragging) setDragging(true)
    movedRef.current = true
    setPan({ x: panStartRef.current.startX + event.clientX - panStartRef.current.x, y: panStartRef.current.startY + event.clientY - panStartRef.current.y })
  }
  function finishPan(event: ReactPointerEvent<HTMLDivElement>) {
    const lot = pendingLotRef.current
    const wasTap = !movedRef.current && !pinchWasActiveRef.current && pointerMapRef.current.size === 1
    pointerMapRef.current.delete(event.pointerId)
    if (wasTap && lot) selectLot(lot)
    if (pointerMapRef.current.size < 2) pinchRef.current = null
    if (!pointerMapRef.current.size) pinchWasActiveRef.current = false
    pendingLotRef.current = null
    movedRef.current = false
    setDragging(false)
  }
  function resetMap() { setZoom(1); setPan({ x: 0, y: 0 }) }
  function toggleZoneFilter(zoneId: string) {
    setMapTooltip(null)
    setZoneFilterIds((current) => current.includes(zoneId) ? current.filter((id) => id !== zoneId) : [...current, zoneId])
  }
  function resetZoneFilter() { setMapTooltip(null); setZoneFilterIds([]) }

  function showMapTooltip(lotId: string, element: SVGPolygonElement) {
    const viewport = viewportRef.current
    if (!viewport) return
    const lotRect = element.getBoundingClientRect()
    const viewportRect = viewport.getBoundingClientRect()
    const x = lotRect.left + lotRect.width / 2 - viewportRect.left
    setMapTooltip({ lotId, x: Math.max(8, Math.min(viewportRect.width - 8, x)), y: Math.max(8, lotRect.top - viewportRect.top - 8) })
  }

  function requestHouseholdSave() {
    if (!selectedLot || !householdLabel.trim()) return
    setPendingWrite({ kind: 'household', lot: selectedLot, lotCode: getMapLotCode(selectedLot.label, selectedLot.source_handle, selectedIndex), label: householdLabel.trim() })
  }

  function openAcsForm() {
    setSelectedAcsId(lotAcs.find((item) => item.scope === 'LOTE')?.acs_id || '')
    setShowAcsForm(true)
  }

  function requestAcsSave() {
    const option = acsOptions.find((item) => item.id === selectedAcsId)
    if (!selectedLot || !option?.email?.trim()) return
    setPendingWrite({ kind: 'lot-acs', lot: selectedLot, lotCode: getMapLotCode(selectedLot.label, selectedLot.source_handle, selectedIndex), acsId: option.id, acsName: option.full_name })
  }

  function openVisitDialog(household: Household, questionnaireId = '') {
    setVisitDraft({ household, visitDate: dateToday(), notes: '', questionnaireId })
  }

  function requestVisitSave() {
    if (!visitDraft) return
    setPendingWrite({ kind: 'visit', draft: visitDraft })
  }

  async function openResponse(response: ResponseMeta) {
    const db = supabase
    if (!db) return
    setWriting(true); setPanelError('')
    try {
      const { data, error } = await db.from('census_questionnaire_responses').select('id,visit_id,status,questionnaire_version,questionnaire_snapshot,answers').eq('id', response.id).single()
      if (error) throw new Error(error.message)
      const snapshot = data.questionnaire_snapshot as FormSnapshot
      if (!snapshot?.form_schema?.sections) throw new Error('O snapshot desta resposta está incompleto e não pode ser exibido.')
      setResponseEditor({ responseId: data.id, visitId: data.visit_id, form: snapshot, answers: (data.answers || {}) as QuestionnaireAnswers, status: data.status as 'DRAFT' | 'SUBMITTED', readOnly: data.status === 'SUBMITTED' })
    } catch (error) { setPanelError(`Não foi possível abrir a resposta: ${error instanceof Error ? error.message : 'tente novamente.'}`) }
    finally { setWriting(false) }
  }

  function requestResponseSave(answers: QuestionnaireAnswers, status: 'DRAFT' | 'SUBMITTED') {
    if (!responseEditor || responseEditor.readOnly) return
    setPendingWrite({ kind: 'response', editor: responseEditor, answers, status })
  }

  const confirmation = pendingWrite?.kind === 'household'
    ? { title: 'Cadastrar este domicílio?', description: `“${pendingWrite.label}” será vinculado ao lote ${pendingWrite.lotCode}.`, confirmLabel: 'Cadastrar domicílio' }
    : pendingWrite?.kind === 'lot-acs'
      ? { title: 'Vincular ACS a este lote?', description: `${pendingWrite.acsName} será o ACS responsável pelo lote ${pendingWrite.lotCode}. Este vínculo não remove os acessos já concedidos pela zona.`, confirmLabel: 'Vincular ACS' }
    : pendingWrite?.kind === 'visit'
      ? { title: 'Registrar esta visita?', description: `A visita de ${formatDate(pendingWrite.draft.visitDate)} será registrada para “${pendingWrite.draft.household.label}”. As informações ficarão vinculadas a este domicílio.`, confirmLabel: 'Registrar visita' }
      : pendingWrite?.kind === 'response'
        ? { title: pendingWrite.status === 'SUBMITTED' ? 'Enviar estas respostas?' : 'Salvar este rascunho?', description: pendingWrite.status === 'SUBMITTED' ? 'As respostas ficarão vinculadas à visita e à versão atual do questionário. Depois do envio, elas não poderão ser alteradas.' : 'O rascunho ficará salvo e poderá ser continuado depois por um usuário autorizado para esta zona.', confirmLabel: pendingWrite.status === 'SUBMITTED' ? 'Enviar respostas' : 'Salvar rascunho' }
        : null

  async function confirmPendingWrite() {
    const action = pendingWrite
    setPendingWrite(null)
    if (!action || !supabase) return
    setWriting(true); setNotice(''); setPanelError('')
    try {
      if (action.kind === 'household') {
        const { error } = await supabase.from('census_households').insert({ lot_id: action.lot.id, label: action.label })
        if (error) throw new Error(error.message)
        setHouseholdLabel(''); setShowHouseholdForm(false)
        await loadDossier(action.lot)
        setNoticeTone('success'); setNotice('Domicílio cadastrado com sucesso.')
      }
      if (action.kind === 'lot-acs') {
        const { error } = await supabase.rpc('census_assign_acs_to_lot', { p_lot_id: action.lot.id, p_acs_id: action.acsId })
        if (error) throw new Error(error.message)
        setShowAcsForm(false); setSelectedAcsId('')
        await loadDossier(action.lot)
        setNoticeTone('success'); setNotice(`ACS ${action.acsName} vinculado ao lote ${action.lotCode}.`)
      }
      if (action.kind === 'visit') {
        const { draft } = action
        const { data, error } = await supabase.from('census_visits').insert({ household_id: draft.household.id, visit_date: draft.visitDate, notes: draft.notes.trim(), status: 'IN_PROGRESS' }).select('id').single()
        if (error) throw new Error(error.message)
        setVisitDraft(null)
        if (draft.questionnaireId) {
          const form = activeForms.find((item) => item.id === draft.questionnaireId)
          if (form) setResponseEditor({ responseId: null, visitId: data.id, form: formSnapshot(form), answers: {}, status: 'DRAFT', readOnly: false })
        }
        if (selectedLot) await loadDossier(selectedLot)
        await loadMap()
        setNoticeTone('success'); setNotice('Visita registrada. Preencha o questionário ou continue depois pelo histórico.')
      }
      if (action.kind === 'response') {
        const payload = { answers: action.answers, status: action.status }
        const result = action.editor.responseId
          ? await supabase.from('census_questionnaire_responses').update(payload).eq('id', action.editor.responseId).select('id').single()
          : await supabase.from('census_questionnaire_responses').insert({ visit_id: action.editor.visitId, questionnaire_id: action.editor.form.id, questionnaire_version: action.editor.form.version, ...payload }).select('id').single()
        if (result.error) throw new Error(result.error.message)
        let visitWarning = ''
        if (action.status === 'SUBMITTED') {
          const visitUpdate = await supabase.from('census_visits').update({ status: 'COMPLETED' }).eq('id', action.editor.visitId)
          if (visitUpdate.error) visitWarning = ' A resposta foi enviada, mas não foi possível atualizar a situação da visita.'
        }
        setResponseEditor(null)
        if (selectedLot) await loadDossier(selectedLot)
        await loadMap()
        setNoticeTone(visitWarning ? 'info' : 'success')
        setNotice(`${action.status === 'SUBMITTED' ? 'Respostas enviadas' : 'Rascunho salvo'} com sucesso.${visitWarning}`)
      }
    } catch (error) {
      setNoticeTone('error')
      setNotice(`Não foi possível concluir a gravação: ${error instanceof Error ? error.message : 'tente novamente.'}`)
    } finally { setWriting(false) }
  }

  const selectedZone = selectedLot ? zones.find((zone) => zone.id === selectedLot.zone_id) : null
  const selectedIndex = selectedLot ? lots.findIndex((lot) => lot.id === selectedLot.id) + 1 : 0
  const lotLabel = selectedLot ? getMapLotCode(selectedLot.label, selectedLot.source_handle, selectedIndex) : ''
  const tooltipLot = mapTooltip ? lots.find((lot) => lot.id === mapTooltip.lotId) || null : null
  const tooltipIndex = tooltipLot ? lots.findIndex((lot) => lot.id === tooltipLot.id) + 1 : 0
  const tooltipZone = tooltipLot ? zones.find((zone) => zone.id === tooltipLot.zone_id) : null
  const tooltipActivity = tooltipLot ? activityByLot.get(tooltipLot.id) : null
  const tooltipStatus = tooltipLot ? (mapMode === 'zones' ? tooltipZone ? `Zona: ${tooltipZone.name}` : 'Sem zona' : mapMode === 'visits' ? visitStatusLabels[mapVisitStatus(tooltipLot)] : mapStatusLabels[mapStatus(tooltipLot)]) : ''
  const tooltipStatusColor = tooltipLot ? (mapMode === 'zones' ? tooltipZone?.color || 'var(--acs-chart-no-activity)' : mapMode === 'visits' ? visitStatusColors[mapVisitStatus(tooltipLot)] : statusColors[mapStatus(tooltipLot)]) : ''
  const selectedStatus = selectedLot ? (mapMode === 'zones' ? selectedZone ? `Zona: ${selectedZone.name}` : 'Sem zona' : mapMode === 'visits' ? visitStatusLabels[mapVisitStatus(selectedLot)] : mapStatusLabels[mapStatus(selectedLot)]) : ''
  const selectedStatusColor = selectedLot ? (mapMode === 'zones' ? selectedZone?.color || 'var(--acs-chart-no-activity)' : mapMode === 'visits' ? visitStatusColors[mapVisitStatus(selectedLot)] : statusColors[mapStatus(selectedLot)]) : ''

  return <section className="census-territory" aria-busy={loading || writing}>
    <div className="census-territory-heading"><div className="census-territory-badges"><span><MapPinned size={15} />{lots.length.toLocaleString('pt-BR')} lotes</span><span><UsersRound size={15} />{zones.length} zonas</span></div></div>
    {notice && <div className={`census-territory-notice ${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'}>{noticeTone === 'error' ? <AlertCircle size={16} /> : noticeTone === 'success' ? <CheckCircle2 size={16} /> : <ClipboardCheck size={16} />}{notice}</div>}
    {writing && <div className="census-write-progress" role="status"><LoaderCircle className="spin" size={18} /><span>Gravando dados de Saúde da Família/ACS… Aguarde.</span></div>}
    <section className="census-map-insights" aria-label="Filtros e cobertura do mapa">
      <div className="census-map-mode-tabs acs-filter-segmented" role="group" aria-label="Modo de visualização do mapa">
        <button type="button" aria-pressed={mapMode === 'zones'} data-state="territory" className={mapMode === 'zones' ? 'active' : ''} onClick={() => { setMapTooltip(null); setMapMode('zones') }}><MapPinned size={15} />Divisão por zonas</button>
        <button type="button" aria-pressed={mapMode === 'questionnaire'} data-state="questionnaire" className={mapMode === 'questionnaire' ? 'active' : ''} onClick={() => { setMapTooltip(null); setMapMode('questionnaire') }}><BarChart3 size={15} />Cobertura do questionário</button>
        <button type="button" aria-pressed={mapMode === 'visits'} data-state="visits" className={mapMode === 'visits' ? 'active' : ''} onClick={() => { setMapTooltip(null); setMapMode('visits') }}><ClipboardCheck size={15} />Situação das visitas</button>
      </div>
      {mapMode === 'zones' && <div className="census-map-zone-filters" role="group" aria-label="Filtrar lotes por zona">
        <div className="census-map-zone-filter-options"><span className="census-map-filter-caption"><Filter size={14} />Zonas exibidas</span><button type="button" className={`census-map-zone-chip all${zoneFilterIds.length === 0 ? ' active' : ''}`} aria-pressed={zoneFilterIds.length === 0} onClick={resetZoneFilter}>Todas as zonas</button>{zones.map((zone) => <button type="button" key={zone.id} className={`census-map-zone-chip${zoneFilterIds.includes(zone.id) ? ' active' : ''}`} aria-pressed={zoneFilterIds.includes(zone.id)} onClick={() => toggleZoneFilter(zone.id)}><i style={{ background: zone.color }} />{zone.name}</button>)}<button type="button" className={`census-map-zone-chip${zoneFilterIds.includes(UNASSIGNED_ZONE_FILTER) ? ' active' : ''}`} aria-pressed={zoneFilterIds.includes(UNASSIGNED_ZONE_FILTER)} onClick={() => toggleZoneFilter(UNASSIGNED_ZONE_FILTER)}><i className="unassigned" />Sem zona</button></div>
        <small className="census-map-filter-count">Exibindo {visibleLots.length.toLocaleString('pt-BR')} de {lots.length.toLocaleString('pt-BR')} lotes</small>
      </div>}
      {mapMode === 'questionnaire' && <div className="census-map-filter-row">
        <label className="census-map-filter-control acs-filter-select" data-tone="questionnaire"><span className="acs-filter-caption"><FileText size={14} />Questionário</span><select value={coverageFormId} onChange={(event) => { setMapTooltip(null); setCoverageFormId(event.target.value) }}><option value="">Selecione</option>{activeForms.map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}</select></label>
        <label className="census-map-filter-control acs-filter-select" data-tone="questionnaire"><span className="acs-filter-caption"><Filter size={14} />Situação do questionário</span><select value={questionnaireStatusFilter} onChange={(event) => { setMapTooltip(null); setQuestionnaireStatusFilter(event.target.value as 'all' | CoverageStatus) }} disabled={!coverageFormId}><option value="all">Todas as situações</option>{Object.entries(mapStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
        <small className="census-map-filter-count">Exibindo {visibleLots.length.toLocaleString('pt-BR')} de {lots.length.toLocaleString('pt-BR')} lotes</small>
      </div>}
      {mapMode === 'questionnaire' && coverageFormId && <div className="census-map-metrics" aria-label={`Indicadores por lote, total de ${lots.length.toLocaleString('pt-BR')} lotes`}><div className="coverage"><strong>{mapMetrics.coverage}%<small>{lots.length.toLocaleString('pt-BR')} lotes</small></strong><span>Cobertura</span></div><div className="completed"><strong>{mapMetrics.answered.toLocaleString('pt-BR')}<small>/ {lots.length.toLocaleString('pt-BR')}</small></strong><span>Lotes respondidos</span></div><div className="pending"><strong>{mapMetrics.pending.toLocaleString('pt-BR')}<small>/ {lots.length.toLocaleString('pt-BR')}</small></strong><span>Lotes sem resposta enviada</span></div><div className="no-contact"><strong>{mapMetrics.noContact.toLocaleString('pt-BR')}<small>/ {lots.length.toLocaleString('pt-BR')}</small></strong><span>Lotes sem contato</span></div></div>}
      {mapMode === 'visits' && <div className="census-map-metrics" aria-label={`Indicadores por lote, total de ${lots.length.toLocaleString('pt-BR')} lotes`}><div className="recorded"><strong>{mapMetrics.visited.toLocaleString('pt-BR')}<small>/ {lots.length.toLocaleString('pt-BR')}</small></strong><span>Lotes com visita registrada</span></div><div className="no-visit"><strong>{mapMetrics.noVisit.toLocaleString('pt-BR')}<small>/ {lots.length.toLocaleString('pt-BR')}</small></strong><span>Domicílio cadastrado, sem visita</span></div><div className="no-activity"><strong>{mapMetrics.noActivity.toLocaleString('pt-BR')}<small>/ {lots.length.toLocaleString('pt-BR')}</small></strong><span>Sem cadastro e sem atividade</span></div><div className="in-progress"><strong>{mapMetrics.inProgress.toLocaleString('pt-BR')}<small>/ {lots.length.toLocaleString('pt-BR')}</small></strong><span>Lotes em andamento</span></div><div className="completed"><strong>{mapMetrics.completed.toLocaleString('pt-BR')}<small>/ {lots.length.toLocaleString('pt-BR')}</small></strong><span>Lotes com visita concluída</span></div></div>}
      {mapMode === 'questionnaire' && !coverageFormId && <div className="census-map-empty-filter"><Eye size={16} />Selecione um questionário para colorir o mapa pela cobertura.</div>}
    </section>
    <div className={`census-territory-workspace${selectedLot ? ' with-panel' : ''}`}>
      <div className="census-territory-map-card">
        <div className="census-territory-toolbar"><span><MapPinned size={15} />{mapMode === 'zones' ? 'Cores representam zonas' : mapMode === 'visits' ? 'Cores representam a situação das visitas' : activeMapForm ? `Cobertura de ${activeMapForm.title}` : 'Selecione um questionário'} · clique para abrir o dossiê · arraste para mover</span><div><button type="button" onClick={() => setZoom((current) => Math.min(24, current * 1.25))} aria-label="Aumentar zoom" disabled={loading || !lots.length}><Plus size={16} /></button><b>{Math.round(zoom * 100)}%</b><button type="button" onClick={() => setZoom((current) => Math.max(0.65, current / 1.25))} aria-label="Reduzir zoom" disabled={loading || !lots.length}><Minus size={16} /></button><button type="button" onClick={resetMap} aria-label="Restaurar mapa" disabled={loading || !lots.length}><RotateCcw size={15} /></button></div></div>
        <div ref={viewportRef} className={`census-territory-viewport${dragging ? ' dragging' : ''}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={finishPan} onPointerCancel={finishPan}>
          {loading ? <div className="census-territory-empty"><LoaderCircle className="spin" size={23} /><strong>Carregando o mapa preparado…</strong></div> : mapError ? <div className="census-territory-empty error"><AlertCircle size={24} /><strong>Não foi possível abrir o mapa</strong><span>{mapError}</span><button type="button" className="fleet-secondary-button" onClick={() => void loadMap()}>Tentar novamente</button></div> : !mapImport ? <div className="census-territory-empty"><MapPinned size={25} /><strong>Nenhum mapa preparado</strong><span>Importe e salve a divisão em Preparar mapa para iniciar o trabalho territorial.</span></div> : !lots.length ? <div className="census-territory-empty"><ShieldCheck size={25} /><strong>Nenhum lote disponível para esta conta</strong><span>Confirme se o mapa foi salvo e se sua conta está vinculada a uma zona ativa.</span></div> : <>
            <svg className="census-territory-svg" viewBox="0 0 1000 1000" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} role="list" aria-label="Mapa territorial com lotes autorizados">
              {visibleLots.map((lot) => {
                const zone = zones.find((item) => item.id === lot.zone_id)
                const status = mapStatus(lot)
                const visitStatus = mapVisitStatus(lot)
                const index = lotIndexById.get(lot.id) ?? 0
                const isSelected = selectedLot?.id === lot.id
                const mapCode = getMapLotCode(lot.label, lot.source_handle, index + 1)
                const visualLabel = mapMode === 'visits' ? visitStatusLabels[visitStatus] : mapStatusLabels[status]
                const fill = mapMode === 'zones' ? (lot.zone_id ? getLotFillColor(lot, zones) : 'var(--acs-chart-no-activity)') : mapMode === 'visits' ? visitStatusColors[visitStatus] : statusColors[status]
                const fillOpacity = 1
                return <polygon key={lot.id} data-lot-id={lot.id} points={lot.geometry.map(toSvg).join(' ')} fill={fill} style={{ fill }} fillOpacity={fillOpacity} vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-label={`${mapCode}, ${zone?.name || 'sem zona'}${mapMode !== 'zones' ? `, ${visualLabel}` : ''}`} className={isSelected ? 'selected' : ''} aria-describedby={mapTooltip?.lotId === lot.id ? 'territory-map-tooltip' : undefined} onPointerEnter={(event) => showMapTooltip(lot.id, event.currentTarget)} onPointerLeave={() => setMapTooltip((current) => current?.lotId === lot.id ? null : current)} onFocus={(event) => showMapTooltip(lot.id, event.currentTarget)} onBlur={() => setMapTooltip((current) => current?.lotId === lot.id ? null : current)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLot(lot) } }}><title>{`${mapCode} · ${zone?.name || 'sem zona'}${mapMode !== 'zones' ? ` · ${visualLabel}` : ''}`}</title></polygon>
              })}
            </svg>
            {visibleLots.length === 0 && <div className="census-territory-empty-filter" role="status"><Filter size={20} /><strong>Nenhum lote corresponde aos filtros</strong><span>Ajuste o filtro de zona ou de situação do questionário.</span></div>}
            {mapTooltip && tooltipLot && <div id="territory-map-tooltip" className={`census-map-tooltip${mapTooltip.y < 100 ? ' below' : ''}`} role="tooltip" style={{ left: mapTooltip.x, top: mapTooltip.y }}>
              <strong>{getMapLotCode(tooltipLot.label, tooltipLot.source_handle, tooltipIndex)}{mapMode !== 'zones' ? ` · ${tooltipZone?.name || 'Sem zona'}` : ''}</strong>
              <span className="census-map-tooltip-status"><i style={{ background: tooltipStatusColor }} />{tooltipStatus}</span>
              {mapMode !== 'zones' && <>
                <span>{tooltipActivity?.householdCount ? `${tooltipActivity.householdCount.toLocaleString('pt-BR')} ${tooltipActivity.householdCount === 1 ? 'domicílio ativo' : 'domicílios ativos'} · ${tooltipActivity.visitCount.toLocaleString('pt-BR')} ${tooltipActivity.visitCount === 1 ? 'visita registrada' : 'visitas registradas'}` : null}</span>
                {mapMode === 'questionnaire' && activeMapForm && <span>Questionário: {activeMapForm.title}</span>}
                {tooltipActivity?.latestVisit && <span>{tooltipActivity.latestVisit.status === 'NO_CONTACT' ? 'Última tentativa' : tooltipActivity.latestVisit.status === 'CANCELLED' ? 'Último registro' : 'Última visita'}: {formatDate(tooltipActivity.latestVisit.visit_date)}</span>}
              </>}
            </div>}
            <div className="census-territory-legend">{mapMode === 'zones' ? <>{zones.map((zone) => <span key={zone.id}><i style={{ background: zone.color }} />{zone.name}{zone.active ? '' : ' · inativa'}</span>)}<span><i className="unassigned" />Sem zona</span></> : mapMode === 'visits' ? Object.entries(visitStatusLabels).map(([status, label]) => <span key={status}><i style={{ background: visitStatusColors[status as VisitMapStatus] }} />{label}</span>) : Object.entries(mapStatusLabels).map(([status, label]) => <span key={status}><i style={{ background: statusColors[status as CoverageStatus] }} />{label}</span>)}</div>
          </>}
        </div>
      </div>

      {selectedLot && <aside className="census-territory-panel" aria-label={`Dossiê do ${lotLabel}`}>
        <header className="census-territory-panel-header"><div><span className="fleet-kicker">DOSSIÊ TERRITORIAL</span><h3>{lotLabel}</h3><span className="census-territory-zone"><i style={{ background: selectedZone?.color || 'var(--acs-chart-no-activity)' }} />{selectedZone?.name || 'Sem zona'}</span><span className="census-territory-selected-status" style={{ borderColor: selectedStatusColor }}><i style={{ background: selectedStatusColor }} />{selectedStatus}</span></div><button type="button" className="census-icon-button" onClick={() => { setSelectedLot(null); setResponseEditor(null); setVisitDraft(null) }} aria-label="Fechar dossiê"><X size={18} /></button></header>
        {panelError && <div className="census-territory-panel-error" role="alert"><AlertCircle size={16} />{panelError}</div>}
        {detailLoading ? <div className="census-territory-panel-loading"><LoaderCircle className="spin" size={19} />Carregando dossiê…</div> : authorized && <div className="census-territory-panel-scroll">
          <div className="census-territory-lot-meta"><span><small>Código do lote</small><strong>{lotLabel}</strong></span><span><small>Domicílios ativos</small><strong>{households.length.toLocaleString('pt-BR')}</strong></span></div>
          <section className="census-territory-acs-card" aria-label="ACS responsável pelo lote">
            <div className="census-territory-acs-heading"><UsersRound size={17} /><div><strong>ACS responsável</strong><small>{lotAcs.some((item) => item.scope === 'LOTE') ? 'Vínculo específico deste lote' : lotAcs.length ? 'ACS vinculado à zona deste lote' : 'Sem vínculo de ACS ativo'}</small></div></div>
            {lotAcs.length ? <div className="census-territory-acs-list">{lotAcs.map((item) => <div key={`${item.scope}-${item.acs_id}`}><span className="census-territory-acs-avatar">{item.full_name.trim().charAt(0).toUpperCase() || 'A'}</span><span><strong>{item.full_name}</strong><small>{item.scope === 'LOTE' ? 'Vinculado a este lote' : 'Vinculado à zona'}</small></span></div>)}</div> : <p className="census-territory-acs-empty">Nenhum ACS ativo está vinculado a este lote ou à sua zona.</p>}
            {canManageAcs && !showAcsForm && <button type="button" className="census-territory-acs-link" onClick={openAcsForm} disabled={writing}>{lotAcs.some((item) => item.scope === 'LOTE') ? 'Alterar ACS deste lote' : lotAcs.length ? 'Vincular ACS específico a este lote' : 'Vincular ACS ao lote'}</button>}
            {showAcsForm && <div className="census-territory-acs-form"><label>ACS ativo com e-mail cadastrado<select value={selectedAcsId} onChange={(event) => setSelectedAcsId(event.target.value)} disabled={writing}><option value="">Selecione um ACS</option>{acsOptions.map((option) => <option key={option.id} value={option.id} disabled={!option.email?.trim()}>{option.full_name}{option.email?.trim() ? ` · ${option.email}` : ' · sem e-mail cadastrado'}</option>)}</select></label>{!acsOptions.length && <small>Nenhum ACS ativo está disponível no catálogo.</small>}<div><button type="button" className="fleet-secondary-button" onClick={() => setShowAcsForm(false)} disabled={writing}>Cancelar</button><button type="button" className="fleet-primary-button" onClick={requestAcsSave} disabled={writing || !acsOptions.find((option) => option.id === selectedAcsId)?.email?.trim()}><UsersRound size={14} />Confirmar vínculo</button></div></div>}
          </section>
          {notice && <div className={`census-territory-panel-notice ${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'}>{noticeTone === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}{notice}</div>}
          {writing && <div className="census-territory-panel-saving"><LoaderCircle className="spin" size={16} />Gravando…</div>}
          {!households.length && !showHouseholdForm && <div className="census-territory-empty-dossier"><Home size={22} /><strong>Nenhum domicílio cadastrado</strong><span>Cadastre um ou mais domicílios neste lote para registrar visitas e questionários.</span><button type="button" className="fleet-primary-button" onClick={() => { setHouseholdLabel(`Domicílio ${households.length + 1}`); setShowHouseholdForm(true) }} disabled={writing}><Home size={15} />Cadastrar domicílio</button></div>}
          {showHouseholdForm && <div className="census-territory-inline-form"><strong>Novo domicílio</strong><label>Identificação<input value={householdLabel} onChange={(event) => setHouseholdLabel(event.target.value)} maxLength={100} placeholder="Ex.: Casa principal" disabled={writing} /></label><div><button type="button" className="fleet-secondary-button" onClick={() => setShowHouseholdForm(false)} disabled={writing}>Cancelar</button><button type="button" className="fleet-primary-button" onClick={requestHouseholdSave} disabled={writing || !householdLabel.trim()}><Save size={14} />Salvar domicílio</button></div></div>}
          {households.map((household, index) => {
            const summary = summariesById.get(household.id)
            const householdVisits = visitsByHousehold.get(household.id) || []
            const receivedQuestionnaireIds = new Set(householdVisits.flatMap((visit) => responsesByVisit.get(visit.id) || []).map((response) => response.questionnaire_id))
            const pendingForms = activeForms.filter((form) => !receivedQuestionnaireIds.has(form.id))
            return <article className="census-household-card" key={household.id}>
              <header><span className="census-household-icon"><Home size={16} /></span><div><strong>{household.label || `Domicílio ${index + 1}`}</strong><small>Cadastrado em {formatDate(household.created_at)}</small></div></header>
              <div className="census-household-summary"><span><b>{summary?.resident_count ?? '—'}</b><small>moradores</small></span><span><b>{summary?.submitted_questionnaire_count ?? 0}</b><small>questionários enviados</small></span><span><b>{summary?.visit_count ?? 0}</b><small>visitas registradas</small></span></div>
              <div className="census-household-meta"><span><CalendarDays size={14} />Última visita: {summary?.last_visit_date ? formatDate(summary.last_visit_date) : 'Sem visita registrada'}</span>{summary?.income_band && <span><span className="census-income-dot" />Renda: {summary.income_band}</span>}</div>
              <section className="census-household-available-forms"><div><strong>Aplicar questionário</strong><small>{pendingForms.length ? 'Selecione um questionário ativo para este domicílio.' : 'Todos os questionários ativos já foram respondidos; você ainda pode iniciar uma nova visita.'}</small></div>{activeForms.length ? <select aria-label={`Aplicar questionário ao ${household.label || `Domicílio ${index + 1}`}`} defaultValue="" onChange={(event) => { const form = activeForms.find((item) => item.id === event.target.value); if (form) openVisitDialog(household, form.id); event.currentTarget.value = '' }} disabled={writing}><option value="">Selecione um questionário ativo…</option>{activeForms.map((form) => <option key={form.id} value={form.id}>{form.title}{pendingForms.some((item) => item.id === form.id) ? ' · pendente' : ' · respondido'}</option>)}</select> : <button type="button" className="census-link-button" onClick={onOpenQuestionnaires}>Ative um questionário para aplicar</button>}</section>
              {activeForms.length > 0 && pendingForms.length === 0 && <p className="census-household-all-forms-received">Todos os questionários ativos já foram recebidos. Consulte o histórico para ver as respostas.</p>}

              <details className="census-household-history"><summary><span><ChevronDown size={15} />Histórico e respostas</span><b>{householdVisits.length}</b></summary>
                {!householdVisits.length ? <p className="census-household-empty-history">Ainda não há visitas registradas.</p> : householdVisits.map((visit) => {
                  const visitResponses = responsesByVisit.get(visit.id) || []
                  return <div className="census-visit-row" key={visit.id}>
                    <div className="census-visit-row-heading"><span><strong>{formatDate(visit.visit_date)}</strong><small>{statusLabels[visit.status]}</small></span><span className={`census-visit-status ${visit.status.toLowerCase()}`}>{visit.status === 'COMPLETED' ? 'Concluída' : visit.status === 'NO_CONTACT' ? 'Sem contato' : visit.status === 'CANCELLED' ? 'Cancelada' : 'Em andamento'}</span></div>
                    {visit.notes && <p className="census-visit-notes">{visit.notes}</p>}
                    {visitResponses.map((response) => <button type="button" className="census-response-history-link" key={response.id} onClick={() => void openResponse(response)} disabled={writing}><FileText size={14} /><span><strong>{response.questionnaire_snapshot.title}</strong><small>Versão {response.questionnaire_version} · {response.status === 'SUBMITTED' ? `Enviado ${formatDate(response.submitted_at, true)}` : 'Rascunho salvo'}</small></span><span>{response.status === 'SUBMITTED' ? 'Ver' : 'Continuar'}</span></button>)}
                    <div className="census-visit-actions">{activeForms.filter((form) => !visitResponses.some((response) => response.questionnaire_id === form.id)).length ? <select aria-label={`Adicionar questionário à visita de ${formatDate(visit.visit_date)}`} defaultValue="" onChange={(event) => { const form = activeForms.find((item) => item.id === event.target.value); if (form) setResponseEditor({ responseId: null, visitId: visit.id, form: formSnapshot(form), answers: {}, status: 'DRAFT', readOnly: false }); event.currentTarget.value = '' }} disabled={writing}><option value="">+ Adicionar questionário</option>{activeForms.filter((form) => !visitResponses.some((response) => response.questionnaire_id === form.id)).map((form) => <option key={form.id} value={form.id}>{form.title}</option>)}</select> : !activeForms.length ? <button type="button" className="census-link-button" onClick={onOpenQuestionnaires}>Ative um questionário para preencher</button> : <span className="census-visit-all-forms">Todos os questionários ativos já foram vinculados</span>}</div>
                  </div>
                })}
              </details>
            </article>
          })}
          {!!households.length && <button type="button" className="census-add-household-button" onClick={() => { setHouseholdLabel(`Domicílio ${households.length + 1}`); setShowHouseholdForm((current) => !current) }} disabled={writing}><Home size={15} />Adicionar domicílio</button>}
          {!activeForms.length && <div className="census-no-active-form"><FileText size={17} /><span>Não há questionários ativos. A ficha inicial ainda está em rascunho.</span><button type="button" onClick={onOpenQuestionnaires}>Abrir Questionários</button></div>}
        </div>}
      </aside>}
    </div>

    {visitDraft && <div className="census-visit-dialog-backdrop"><section ref={visitDialogRef} tabIndex={-1} className="census-visit-dialog" role="dialog" aria-modal="true" aria-labelledby="census-visit-dialog-title"><header><div><span className="fleet-kicker">NOVA VISITA</span><h3 id="census-visit-dialog-title">{visitDraft.household.label}</h3><p className="census-visit-dialog-context">Lote {lotLabel} · {selectedZone?.name || 'Sem zona'}</p></div><button type="button" className="census-icon-button" onClick={() => setVisitDraft(null)} aria-label="Fechar"><X size={18} /></button></header><label>Data da visita<input type="date" autoFocus value={visitDraft.visitDate} max={dateToday()} onChange={(event) => setVisitDraft((current) => current ? { ...current, visitDate: event.target.value } : current)} /></label><label>Observação breve<textarea rows={3} maxLength={2000} value={visitDraft.notes} onChange={(event) => setVisitDraft((current) => current ? { ...current, notes: event.target.value } : current)} placeholder="Opcional — não registre informações médicas neste campo." /></label><label>Questionário para preencher<select value={visitDraft.questionnaireId} onChange={(event) => setVisitDraft((current) => current ? { ...current, questionnaireId: event.target.value } : current)}><option value="">Registrar visita sem questionário agora</option>{activeForms.map((form) => <option value={form.id} key={form.id}>{form.title}</option>)}</select></label>{!activeForms.length && <p className="census-visit-dialog-tip">A ficha inicial ainda está em rascunho. Você pode registrar a visita agora e preencher um formulário depois de ativá-lo.</p>}<footer><button type="button" className="fleet-secondary-button" onClick={() => setVisitDraft(null)}>Cancelar</button><button type="button" className="fleet-primary-button" onClick={requestVisitSave} disabled={!visitDraft.visitDate}><CalendarDays size={15} />Registrar visita</button></footer></section></div>}

    {responseEditor && <QuestionnaireResponseForm key={`${responseEditor.responseId || responseEditor.visitId}-${responseEditor.form.id}`} form={responseEditor.form} initialAnswers={responseEditor.answers} readOnly={responseEditor.readOnly} saving={writing} responseStatus={responseEditor.status} contextLabel={`Lote ${lotLabel} · ${selectedZone?.name || 'Sem zona'}`} onSave={requestResponseSave} onClose={() => setResponseEditor(null)} />}
    {confirmation && <CensusWriteConfirmation {...confirmation} onCancel={() => setPendingWrite(null)} onConfirm={() => void confirmPendingWrite()} />}
  </section>
}
