import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { AlertCircle, CalendarDays, CheckCircle2, ChevronDown, ClipboardCheck, FileText, Home, LoaderCircle, MapPinned, Minus, Plus, RotateCcw, Save, ShieldCheck, UsersRound, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { CensusWriteConfirmation } from '../CensusWriteConfirmation'
import { getLotFillColor } from '../mapLogic'
import type { QuestionnaireRecord } from '../questionnaires/questionnaireTypes'
import { QuestionnaireResponseForm } from './QuestionnaireResponseForm'
import type { QuestionnaireAnswers } from './questionnaireResponseLogic'
import { useCensusDialogFocus } from './useCensusDialogFocus'
import './CensusTerritory.css'

type Point = [number, number]
type Bbox = { minX: number; minY: number; maxX: number; maxY: number }
type TerritoryLot = { id: string; source_handle: string; label: string | null; layer_name: string; geometry: Point[]; area: number | null; is_valid: boolean; zone_number: number | null; zone_id: string | null }
type CensusZone = { id: string; name: string; color: string; active: boolean }
type MapImport = { id: string; file_name: string; status: 'DRAFT' | 'PUBLISHED' | 'ERROR'; bbox: Bbox | null; updated_at: string; division_saved_at: string }
type Household = { id: string; lot_id: string; label: string; active: boolean; created_at: string }
type HouseholdSummary = { household_id: string; lot_id: string; visit_count: number; last_visit_date: string | null; submitted_questionnaire_count: number; resident_count: number | null; income_band: string | null }
type Visit = { id: string; household_id: string; visit_date: string; status: 'IN_PROGRESS' | 'COMPLETED' | 'NO_CONTACT' | 'CANCELLED'; notes: string; created_at: string; completed_at: string | null; acs_id: string | null }
type FormSnapshot = Pick<QuestionnaireRecord, 'id' | 'slug' | 'title' | 'subtitle' | 'description' | 'version' | 'form_schema'>
type ResponseMeta = { id: string; visit_id: string; questionnaire_id: string; status: 'DRAFT' | 'SUBMITTED'; submitted_at: string | null; created_at: string; questionnaire_version: number; questionnaire_snapshot: FormSnapshot }
type ResponseEditorState = { responseId: string | null; visitId: string; form: FormSnapshot; answers: QuestionnaireAnswers; status: 'DRAFT' | 'SUBMITTED'; readOnly: boolean }
type VisitDraft = { household: Household; visitDate: string; notes: string; questionnaireId: string }
type PendingWrite =
  | { kind: 'household'; lot: TerritoryLot; label: string }
  | { kind: 'visit'; draft: VisitDraft }
  | { kind: 'response'; editor: ResponseEditorState; answers: QuestionnaireAnswers; status: 'DRAFT' | 'SUBMITTED' }
type NoticeTone = 'success' | 'error' | 'info'

const mapSelect = 'id,source_handle,label,layer_name,geometry,area,is_valid,zone_number,zone_id'
const formSelect = 'id,slug,title,subtitle,description,status,version,form_schema,created_at,updated_at'
const statusLabels = { IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluída', NO_CONTACT: 'Sem contato', CANCELLED: 'Cancelada' } as const

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
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [selectedLot, setSelectedLot] = useState<TerritoryLot | null>(null)
  const [panelError, setPanelError] = useState('')
  const [detailLoading, setDetailLoading] = useState(false)
  const [households, setHouseholds] = useState<Household[]>([])
  const [summaries, setSummaries] = useState<HouseholdSummary[]>([])
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
  const requestRef = useRef(0)
  const closeVisitDialog = useCallback(() => setVisitDraft(null), [])
  const visitDialogRef = useCensusDialogFocus(Boolean(visitDraft), closeVisitDialog)

  const loadMap = useCallback(async () => {
    const db = supabase
    if (!db) { setMapError('O banco do Censo não está disponível nesta sessão.'); setLoading(false); return }
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
      const lotsResult = await db.from('census_territory_map_lots').select(mapSelect).eq('import_id', current.id).order('source_handle').limit(5000)
      if (lotsResult.error) throw new Error(`Não foi possível abrir os lotes autorizados deste território: ${lotsResult.error.message}`)
      setLots((lotsResult.data || []) as TerritoryLot[])
    } catch (error) {
      setMapError(error instanceof Error ? error.message : 'Não foi possível carregar o mapa territorial.')
      setMapImport(null)
      setLots([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void loadMap() }, [loadMap])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
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
    try {
      const { data: canAccess, error: accessError } = await db.rpc('census_user_can_access_lot', { p_lot_id: lot.id })
      if (accessError) throw new Error(`Não foi possível verificar o acesso ao lote: ${accessError.message}`)
      if (canAccess !== true) {
        if (requestId === requestRef.current) setPanelError('Este lote não está associado à sua zona de atuação. Se você acredita que deveria ter acesso, fale com o administrador do Censo.')
        return
      }
      const householdResult = await db.from('census_households').select('id,lot_id,label,active,created_at').eq('lot_id', lot.id).eq('active', true).order('created_at').limit(100)
      if (householdResult.error) throw new Error(`Não foi possível abrir os domicílios: ${householdResult.error.message}`)
      const householdRows = (householdResult.data || []) as Household[]
      let summaryRows: HouseholdSummary[] = []
      let visitRows: Visit[] = []
      let responseRows: ResponseMeta[] = []
      if (householdRows.length) {
        const householdIds = householdRows.map((item) => item.id)
        const [summaryResult, visitResult] = await Promise.all([
          db.from('census_household_map_summary').select('household_id,lot_id,visit_count,last_visit_date,submitted_questionnaire_count,resident_count,income_band').eq('lot_id', lot.id).limit(100),
          db.from('census_visits').select('id,household_id,visit_date,status,notes,created_at,completed_at,acs_id').in('household_id', householdIds).order('visit_date', { ascending: false }).limit(500),
        ])
        if (summaryResult.error) throw new Error(`Não foi possível carregar o resumo dos domicílios: ${summaryResult.error.message}`)
        if (visitResult.error) throw new Error(`Não foi possível carregar o histórico de visitas: ${visitResult.error.message}`)
        summaryRows = (summaryResult.data || []).map((row) => ({ household_id: row.household_id, lot_id: row.lot_id, visit_count: row.visit_count ?? 0, last_visit_date: row.last_visit_date, submitted_questionnaire_count: row.submitted_questionnaire_count ?? 0, resident_count: row.resident_count, income_band: row.income_band })) as HouseholdSummary[]
        visitRows = (visitResult.data || []) as Visit[]
        if (visitRows.length) {
          const responseResult = await db.from('census_questionnaire_responses').select('id,visit_id,questionnaire_id,status,submitted_at,created_at,questionnaire_version,questionnaire_snapshot').in('visit_id', visitRows.map((visit) => visit.id)).order('created_at', { ascending: false }).limit(1000)
          if (responseResult.error) throw new Error(`Não foi possível carregar o histórico de questionários: ${responseResult.error.message}`)
          responseRows = (responseResult.data || []) as ResponseMeta[]
        }
      }
      if (requestId !== requestRef.current) return
      setAuthorized(true); setHouseholds(householdRows); setSummaries(summaryRows); setVisits(visitRows); setResponses(responseRows)
    } catch (error) {
      if (requestId === requestRef.current) setPanelError(error instanceof Error ? error.message : 'Não foi possível carregar o dossiê deste lote.')
    } finally {
      if (requestId === requestRef.current) setDetailLoading(false)
    }
  }, [])

  function selectLot(lot: TerritoryLot) {
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

  function startPan(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('[data-lot-id]')) return
    setDragging(true)
    panStartRef.current = { x: event.clientX, y: event.clientY, startX: pan.x, startY: pan.y }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  function movePan(event: ReactPointerEvent<HTMLDivElement>) {
    if (!dragging) return
    setPan({ x: panStartRef.current.startX + event.clientX - panStartRef.current.x, y: panStartRef.current.startY + event.clientY - panStartRef.current.y })
  }
  function finishPan() { setDragging(false) }
  function resetMap() { setZoom(1); setPan({ x: 0, y: 0 }) }

  function requestHouseholdSave() {
    if (!selectedLot || !householdLabel.trim()) return
    setPendingWrite({ kind: 'household', lot: selectedLot, label: householdLabel.trim() })
  }

  function openVisitDialog(household: Household) {
    setVisitDraft({ household, visitDate: dateToday(), notes: '', questionnaireId: '' })
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
    ? { title: 'Cadastrar este domicílio?', description: `“${pendingWrite.label}” será vinculado ao ${pendingWrite.lot.label || `lote ${String(lots.findIndex((lot) => lot.id === pendingWrite.lot.id) + 1).padStart(4, '0')}`}.`, confirmLabel: 'Cadastrar domicílio' }
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
  const lotLabel = selectedLot?.label?.trim() || `Lote ${String(selectedIndex).padStart(4, '0')}`

  return <section className="census-territory" aria-busy={loading || writing}>
    <div className="census-territory-heading"><div><span className="fleet-kicker">MAPA DE CAMPO</span><h2>Mapa territorial</h2><p>Escolha um lote para abrir o dossiê do território. O mapa mostra somente lotes permitidos para sua conta.</p></div><div className="census-territory-badges"><span><MapPinned size={15} />{lots.length.toLocaleString('pt-BR')} lotes</span><span><UsersRound size={15} />{zones.length} zonas</span></div></div>
    {notice && <div className={`census-territory-notice ${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'}>{noticeTone === 'error' ? <AlertCircle size={16} /> : noticeTone === 'success' ? <CheckCircle2 size={16} /> : <ClipboardCheck size={16} />}{notice}</div>}
    {writing && <div className="census-write-progress" role="status"><LoaderCircle className="spin" size={18} /><span>Gravando no Censo Municipal… Aguarde.</span></div>}
    <div className={`census-territory-workspace${selectedLot ? ' with-panel' : ''}`}>
      <div className="census-territory-map-card">
        <div className="census-territory-toolbar"><span><MapPinned size={15} />Clique em um lote · arraste para mover · role para ampliar</span><div><button type="button" onClick={() => setZoom((current) => Math.min(24, current * 1.25))} aria-label="Aumentar zoom" disabled={loading || !lots.length}><Plus size={16} /></button><b>{Math.round(zoom * 100)}%</b><button type="button" onClick={() => setZoom((current) => Math.max(0.65, current / 1.25))} aria-label="Reduzir zoom" disabled={loading || !lots.length}><Minus size={16} /></button><button type="button" onClick={resetMap} aria-label="Restaurar mapa" disabled={loading || !lots.length}><RotateCcw size={15} /></button></div></div>
        <div ref={viewportRef} className={`census-territory-viewport${dragging ? ' dragging' : ''}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={finishPan} onPointerCancel={finishPan}>
          {loading ? <div className="census-territory-empty"><LoaderCircle className="spin" size={23} /><strong>Carregando o mapa preparado…</strong></div> : mapError ? <div className="census-territory-empty error"><AlertCircle size={24} /><strong>Não foi possível abrir o mapa</strong><span>{mapError}</span><button type="button" className="fleet-secondary-button" onClick={() => void loadMap()}>Tentar novamente</button></div> : !mapImport ? <div className="census-territory-empty"><MapPinned size={25} /><strong>Nenhum mapa preparado</strong><span>Importe e salve a divisão em Preparar mapa para iniciar o trabalho territorial.</span></div> : !lots.length ? <div className="census-territory-empty"><ShieldCheck size={25} /><strong>Nenhum lote disponível para esta conta</strong><span>Confirme se o mapa foi salvo e se sua conta está vinculada a uma zona ativa.</span></div> : <>
            <svg className="census-territory-svg" viewBox="0 0 1000 1000" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} role="list" aria-label="Mapa territorial com lotes autorizados">
              {lots.map((lot, index) => {
                const zone = zones.find((item) => item.id === lot.zone_id)
                const isSelected = selectedLot?.id === lot.id
                return <polygon key={lot.id} data-lot-id={lot.id} points={lot.geometry.map(toSvg).join(' ')} fill={getLotFillColor(lot, zones)} stroke={isSelected ? '#153f4a' : zone?.color || '#8aaeb1'} strokeWidth={isSelected ? 3 : 1} vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-label={`${lot.label || `Lote ${String(index + 1).padStart(4, '0')}`}, ${zone?.name || 'sem zona'}`} className={isSelected ? 'selected' : ''} onClick={(event) => { event.stopPropagation(); selectLot(lot) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLot(lot) } }}><title>{`${lot.label || `Lote ${String(index + 1).padStart(4, '0')}`} · ${zone?.name || 'sem zona'}`}</title></polygon>
              })}
            </svg>
            <div className="census-territory-legend">{zones.map((zone) => <span key={zone.id}><i style={{ background: zone.color }} />{zone.name}{zone.active ? '' : ' · inativa'}</span>)}<span><i className="unassigned" />Sem zona</span></div>
          </>}
        </div>
      </div>

      {selectedLot && <aside className="census-territory-panel" aria-label={`Dossiê do ${lotLabel}`}>
        <header className="census-territory-panel-header"><div><span className="fleet-kicker">DOSSIÊ TERRITORIAL</span><h3>{lotLabel}</h3><span className="census-territory-zone"><i style={{ background: selectedZone?.color || '#9aaeb1' }} />{selectedZone?.name || 'Sem zona'}</span></div><button type="button" className="census-icon-button" onClick={() => { setSelectedLot(null); setResponseEditor(null); setVisitDraft(null) }} aria-label="Fechar dossiê"><X size={18} /></button></header>
        {panelError && <div className="census-territory-panel-error" role="alert"><AlertCircle size={16} />{panelError}</div>}
        {detailLoading ? <div className="census-territory-panel-loading"><LoaderCircle className="spin" size={19} />Carregando dossiê…</div> : authorized && <div className="census-territory-panel-scroll">
          <div className="census-territory-lot-meta"><span><strong>{String(selectedIndex).padStart(4, '0')}</strong> código do mapa</span><span><strong>{households.length}</strong> domicílio(s)</span></div>
          {notice && <div className={`census-territory-panel-notice ${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'}>{noticeTone === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}{notice}</div>}
          {writing && <div className="census-territory-panel-saving"><LoaderCircle className="spin" size={16} />Gravando…</div>}
          {!households.length && !showHouseholdForm && <div className="census-territory-empty-dossier"><Home size={22} /><strong>Nenhum domicílio cadastrado</strong><span>Cadastre um ou mais domicílios neste lote para registrar visitas e questionários.</span><button type="button" className="fleet-primary-button" onClick={() => { setHouseholdLabel(`Domicílio ${households.length + 1}`); setShowHouseholdForm(true) }} disabled={writing}><Home size={15} />Cadastrar domicílio</button></div>}
          {showHouseholdForm && <div className="census-territory-inline-form"><strong>Novo domicílio</strong><label>Identificação<input value={householdLabel} onChange={(event) => setHouseholdLabel(event.target.value)} maxLength={100} placeholder="Ex.: Casa principal" disabled={writing} /></label><div><button type="button" className="fleet-secondary-button" onClick={() => setShowHouseholdForm(false)} disabled={writing}>Cancelar</button><button type="button" className="fleet-primary-button" onClick={requestHouseholdSave} disabled={writing || !householdLabel.trim()}><Save size={14} />Salvar domicílio</button></div></div>}
          {households.map((household, index) => {
            const summary = summariesById.get(household.id)
            const householdVisits = visitsByHousehold.get(household.id) || []
            return <article className="census-household-card" key={household.id}>
              <header><span className="census-household-icon"><Home size={16} /></span><div><strong>{household.label || `Domicílio ${index + 1}`}</strong><small>Cadastrado em {formatDate(household.created_at)}</small></div></header>
              <div className="census-household-summary"><span><b>{summary?.resident_count ?? '—'}</b><small>moradores</small></span><span><b>{summary?.submitted_questionnaire_count ?? 0}</b><small>questionários</small></span><span><b>{summary?.visit_count ?? 0}</b><small>visitas</small></span></div>
              <div className="census-household-meta"><span><CalendarDays size={14} />Última visita: {formatDate(summary?.last_visit_date)}</span>{summary?.income_band && <span><span className="census-income-dot" />Renda: {summary.income_band}</span>}</div>
              <button type="button" className="fleet-primary-button census-household-visit-button" onClick={() => openVisitDialog(household)} disabled={writing}><CalendarDays size={15} />Registrar visita</button>
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
          {!!households.length && <button type="button" className="census-add-household-button" onClick={() => { setHouseholdLabel(`Domicílio ${households.length + 1}`); setShowHouseholdForm((current) => !current) }} disabled={writing}><Home size={15} />Adicionar outro domicílio</button>}
          {!activeForms.length && <div className="census-no-active-form"><FileText size={17} /><span>Não há questionários ativos. A ficha inicial ainda está em rascunho.</span><button type="button" onClick={onOpenQuestionnaires}>Abrir Questionários</button></div>}
        </div>}
      </aside>}
    </div>

    {visitDraft && <div className="census-visit-dialog-backdrop"><section ref={visitDialogRef} tabIndex={-1} className="census-visit-dialog" role="dialog" aria-modal="true" aria-labelledby="census-visit-dialog-title"><header><div><span className="fleet-kicker">NOVA VISITA</span><h3 id="census-visit-dialog-title">{visitDraft.household.label}</h3></div><button type="button" className="census-icon-button" onClick={() => setVisitDraft(null)} aria-label="Fechar"><X size={18} /></button></header><label>Data da visita<input type="date" autoFocus value={visitDraft.visitDate} max={dateToday()} onChange={(event) => setVisitDraft((current) => current ? { ...current, visitDate: event.target.value } : current)} /></label><label>Observação breve<textarea rows={3} maxLength={2000} value={visitDraft.notes} onChange={(event) => setVisitDraft((current) => current ? { ...current, notes: event.target.value } : current)} placeholder="Opcional — não registre informações médicas neste campo." /></label><label>Questionário para preencher<select value={visitDraft.questionnaireId} onChange={(event) => setVisitDraft((current) => current ? { ...current, questionnaireId: event.target.value } : current)}><option value="">Registrar visita sem questionário agora</option>{activeForms.map((form) => <option value={form.id} key={form.id}>{form.title}</option>)}</select></label>{!activeForms.length && <p className="census-visit-dialog-tip">A ficha inicial ainda está em rascunho. Você pode registrar a visita agora e preencher um formulário depois de ativá-lo.</p>}<footer><button type="button" className="fleet-secondary-button" onClick={() => setVisitDraft(null)}>Cancelar</button><button type="button" className="fleet-primary-button" onClick={requestVisitSave} disabled={!visitDraft.visitDate}><CalendarDays size={15} />Registrar visita</button></footer></section></div>}

    {responseEditor && <QuestionnaireResponseForm key={`${responseEditor.responseId || responseEditor.visitId}-${responseEditor.form.id}`} form={responseEditor.form} initialAnswers={responseEditor.answers} readOnly={responseEditor.readOnly} saving={writing} responseStatus={responseEditor.status} onSave={requestResponseSave} onClose={() => setResponseEditor(null)} />}
    {confirmation && <CensusWriteConfirmation {...confirmation} onCancel={() => setPendingWrite(null)} onConfirm={() => void confirmPendingWrite()} />}
  </section>
}
