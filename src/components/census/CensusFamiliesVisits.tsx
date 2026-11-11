import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import {
  AlertCircle,
  FileText,
  Filter,
  Home,
  LoaderCircle,
  MapPinned,
  RefreshCw,
  Search,
  UsersRound,
  X,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getMapLotCode } from './territory/lotDisplay'
import './CensusFamiliesVisits.css'

type VisitStatus = 'COMPLETED' | 'IN_PROGRESS' | 'NO_CONTACT' | 'CANCELLED'
type QuestionnaireStatus = 'SUBMITTED' | 'DRAFT'
type Zone = { id: string; name: string; color: string; active: boolean }
type DashboardRow = {
  lot_id: string
  source_handle: string
  lot_label: string | null
  zone_id: string | null
  zone_name: string | null
  zone_color: string | null
  household_id: string | null
  household_label: string | null
  is_presumed: boolean
  active_households_in_lot: number
  household_created_at: string | null
  latest_visit_status: VisitStatus | null
  latest_visit_date: string | null
  latest_visit_acs_id: string | null
  latest_visit_acs_name: string | null
  visit_count: number
  completed_visit_count: number
  in_progress_visit_count: number
  no_contact_visit_count: number
  cancelled_visit_count: number
  questionnaire_response_count: number
  submitted_questionnaire_count: number
  draft_questionnaire_count: number
  latest_questionnaire_status: QuestionnaireStatus | null
  latest_questionnaire_created_at: string | null
  lot_latest_visit_status: VisitStatus | null
  lot_latest_visit_date: string | null
}
type DashboardData = { hasMap: boolean; zones: Zone[]; rows: DashboardRow[] }
type LotSummary = {
  id: string
  zone_id: string | null
  latest_status: VisitStatus | null
}
type ZoneSummary = Zone & {
  lot_count: number
  completed: number
  in_progress: number
  no_contact: number
  cancelled: number
  no_visit: number
}
type ZoneFilter = 'ALL' | 'NO_ZONE' | string
type HouseholdFilter = 'ALL' | 'REGISTERED' | 'PRESUMED'
type VisitFilter = 'ALL' | 'NO_VISIT' | VisitStatus
type LotVisitFilter = 'ALL' | 'NO_VISIT'
type QuestionnaireFilter = 'ALL' | 'NO_RESPONSE' | QuestionnaireStatus

const PAGE_SIZE = 1000
const VISIT_STATUSES: { key: VisitStatus; label: string; className: string }[] = [
  { key: 'COMPLETED', label: 'Concluídas', className: 'completed' },
  { key: 'IN_PROGRESS', label: 'Em andamento', className: 'in-progress' },
  { key: 'NO_CONTACT', label: 'Sem contato', className: 'no-contact' },
  { key: 'CANCELLED', label: 'Canceladas', className: 'cancelled' },
]
const VISIT_LABELS: Record<VisitStatus, string> = {
  COMPLETED: 'Concluída',
  IN_PROGRESS: 'Em andamento',
  NO_CONTACT: 'Sem contato',
  CANCELLED: 'Cancelada',
}
const QUESTIONNAIRE_LABELS: Record<QuestionnaireStatus, string> = {
  SUBMITTED: 'Enviado',
  DRAFT: 'Rascunho',
}
const LOT_STATUS_ORDER: (VisitStatus | 'NO_VISIT')[] = [
  'COMPLETED',
  'IN_PROGRESS',
  'NO_CONTACT',
  'CANCELLED',
  'NO_VISIT',
]
const LOT_STATUS_LABELS: Record<VisitStatus | 'NO_VISIT', string> = {
  COMPLETED: 'Concluída',
  IN_PROGRESS: 'Em andamento',
  NO_CONTACT: 'Sem contato',
  CANCELLED: 'Cancelada',
  NO_VISIT: 'Sem visita',
}

async function fetchPages<T>(
  load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

function count(value: number | string | null | undefined) {
  const result = Number(value)
  return Number.isFinite(result) ? result : 0
}

function formatCount(value: number) {
  return value.toLocaleString('pt-BR')
}

function formatDate(value: string | null) {
  if (!value) return '—'
  const normalized = value.length === 10 ? `${value}T12:00:00` : value
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date)
}

function visitStatusClass(status: VisitStatus | null) {
  return status ? status.toLowerCase().replace('_', '-') : 'no-visit'
}

function questionnaireStatusClass(status: QuestionnaireStatus | null) {
  if (status === 'SUBMITTED') return 'submitted'
  if (status === 'DRAFT') return 'draft'
  return 'none'
}

function MetricCard({
  icon,
  label,
  value,
  note,
  tone,
  onClick,
  active = false,
  ariaLabel,
}: {
  icon: ReactNode
  label: string
  value: number
  note: string
  tone: 'blue' | 'teal' | 'amber' | 'slate'
  onClick?: () => void
  active?: boolean
  ariaLabel?: string
}) {
  const contents = <>
    <span className="census-family-metric-icon" aria-hidden="true">{icon}</span>
    <span className="census-family-metric-copy">
      <strong>{formatCount(value)}</strong>
      <span className="census-family-metric-label">{label}</span>
      <small>{note}</small>
    </span>
  </>

  if (onClick) {
    return <button
      type="button"
      className={`census-family-metric ${tone} is-actionable${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel || `${label}: ${formatCount(value)}. Filtrar a lista.`}
    >{contents}</button>
  }

  return <article className={`census-family-metric ${tone}`}>{contents}</article>
}

function CountLegend({ label, value, className }: { label: string; value: number; className: string }) {
  return <span className="census-family-legend-item">
    <i className={`census-family-legend-dot ${className}`} aria-hidden="true" />
    <span>{label}</span>
    <strong>{formatCount(value)}</strong>
  </span>
}

async function fetchDashboardData(): Promise<DashboardData> {
  const db = supabase
  if (!db) throw new Error('O serviço de dados da Saúde da Família/ACS não está disponível nesta sessão.')

  const [importResult, zoneResult, rows] = await Promise.all([
    db.from('census_territory_map_imports')
      .select('id')
      .order('division_saved_at', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(1),
    db.from('census_zones')
      .select('id,name,color,active')
      .eq('active', true)
      .order('created_at')
      .limit(500),
    fetchPages<DashboardRow>((from, to) => db
      .from('census_families_visits_dashboard_rows')
      .select('lot_id,source_handle,lot_label,zone_id,zone_name,zone_color,household_id,household_label,is_presumed,active_households_in_lot,household_created_at,latest_visit_status,latest_visit_date,latest_visit_acs_id,latest_visit_acs_name,visit_count,completed_visit_count,in_progress_visit_count,no_contact_visit_count,cancelled_visit_count,questionnaire_response_count,submitted_questionnaire_count,draft_questionnaire_count,latest_questionnaire_status,latest_questionnaire_created_at,lot_latest_visit_status,lot_latest_visit_date')
      .order('source_handle')
      .order('lot_id')
      .order('household_id')
      .range(from, to)),
  ])

  if (importResult.error) throw new Error(importResult.error.message)
  if (zoneResult.error) throw new Error(zoneResult.error.message)
  return {
    hasMap: Boolean(importResult.data?.length),
    zones: (zoneResult.data || []) as Zone[],
    rows,
  }
}

function dashboardErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível carregar Famílias e visitas.'
}

export function CensusFamiliesVisits({ onOpenTerritory }: { onOpenTerritory: () => void }) {
  const [zones, setZones] = useState<Zone[]>([])
  const [rows, setRows] = useState<DashboardRow[]>([])
  const [hasMap, setHasMap] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter>('ALL')
  const [acsFilter, setAcsFilter] = useState('ALL')
  const [lotVisitFilter, setLotVisitFilter] = useState<LotVisitFilter>('ALL')
  const [householdFilter, setHouseholdFilter] = useState<HouseholdFilter>('ALL')
  const [visitFilter, setVisitFilter] = useState<VisitFilter>('ALL')
  const [questionnaireFilter, setQuestionnaireFilter] = useState<QuestionnaireFilter>('ALL')

  const applyDashboard = useCallback(({ hasMap: mapExists, zones: nextZones, rows: nextRows }: DashboardData) => {
    setHasMap(mapExists)
    setZones(nextZones)
    setRows(nextRows)
  }, [])

  const load = useCallback(() => {
    setLoading(true)
    setError('')
    void fetchDashboardData()
      .then(applyDashboard)
      .catch((err: unknown) => setError(dashboardErrorMessage(err)))
      .finally(() => setLoading(false))
  }, [applyDashboard])

  useEffect(() => {
    let active = true
    void fetchDashboardData()
      .then((data) => { if (active) applyDashboard(data) })
      .catch((err: unknown) => { if (active) setError(dashboardErrorMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [applyDashboard])

  const lotSummaries = useMemo(() => {
    const lots = new Map<string, LotSummary>()
    for (const row of rows) {
      if (lots.has(row.lot_id)) continue
      lots.set(row.lot_id, {
        id: row.lot_id,
        zone_id: row.zone_id,
        latest_status: row.lot_latest_visit_status,
      })
    }
    return [...lots.values()]
  }, [rows])

  const lotCodes = useMemo(() => {
    const uniqueLots = new Map<string, DashboardRow>()
    for (const row of rows) if (!uniqueLots.has(row.lot_id)) uniqueLots.set(row.lot_id, row)
    return new Map([...uniqueLots.values()].map((row, index) => [
      row.lot_id,
      getMapLotCode(row.lot_label, row.source_handle, index + 1),
    ]))
  }, [rows])

  const metrics = useMemo(() => {
    const sumRows = (key: keyof Pick<DashboardRow,
      'visit_count' | 'completed_visit_count' | 'in_progress_visit_count' | 'no_contact_visit_count' | 'cancelled_visit_count' | 'questionnaire_response_count' | 'submitted_questionnaire_count' | 'draft_questionnaire_count'
    >) => rows.reduce((total, row) => total + count(row[key]), 0)
    const uniqueLotIds = new Set(rows.map((row) => row.lot_id))

    return {
      lots: uniqueLotIds.size,
      unzonedLots: lotSummaries.filter((lot) => !lot.zone_id).length,
      registeredHouseholds: rows.filter((row) => !row.is_presumed).length,
      presumedLots: rows.filter((row) => row.is_presumed).length,
      lotsWithoutVisit: lotSummaries.filter((lot) => !lot.latest_status).length,
      visits: {
        total: sumRows('visit_count'),
        completed: sumRows('completed_visit_count'),
        inProgress: sumRows('in_progress_visit_count'),
        noContact: sumRows('no_contact_visit_count'),
        cancelled: sumRows('cancelled_visit_count'),
      },
      questionnaires: {
        total: sumRows('questionnaire_response_count'),
        submitted: sumRows('submitted_questionnaire_count'),
        draft: sumRows('draft_questionnaire_count'),
      },
    }
  }, [lotSummaries, rows])

  const visibleZones = useMemo(() => {
    const result = new Map(zones.map((zone) => [zone.id, zone]))
    for (const row of rows) {
      if (!row.zone_id || result.has(row.zone_id)) continue
      result.set(row.zone_id, {
        id: row.zone_id,
        name: row.zone_name || 'Zona sem nome',
        color: row.zone_color || '#8ca5a8',
        active: false,
      })
    }
    return [...result.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [rows, zones])

  const acsOptions = useMemo(() => {
    const people = new Map<string, string>()
    for (const row of rows) {
      if (row.latest_visit_acs_id && row.latest_visit_acs_name) {
        people.set(row.latest_visit_acs_id, row.latest_visit_acs_name)
      }
    }
    return [...people.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [rows])

  const zoneSummaries = useMemo<ZoneSummary[]>(() => visibleZones.map((zone) => {
    const zoneLots = lotSummaries.filter((lot) => lot.zone_id === zone.id)
    const counts: Record<VisitStatus | 'NO_VISIT', number> = {
      COMPLETED: 0,
      IN_PROGRESS: 0,
      NO_CONTACT: 0,
      CANCELLED: 0,
      NO_VISIT: 0,
    }
    for (const lot of zoneLots) counts[lot.latest_status || 'NO_VISIT'] += 1
    return {
      ...zone,
      lot_count: zoneLots.length,
      completed: counts.COMPLETED,
      in_progress: counts.IN_PROGRESS,
      no_contact: counts.NO_CONTACT,
      cancelled: counts.CANCELLED,
      no_visit: counts.NO_VISIT,
    }
  }), [lotSummaries, visibleZones])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('pt-BR')
    return rows.filter((row) => {
      const lotCode = lotCodes.get(row.lot_id) || ''
      const matchesSearch = !query || [
        row.household_label,
        lotCode,
        row.lot_label,
        row.source_handle,
        row.zone_name,
        row.latest_visit_acs_name,
      ].some((value) => value?.toLocaleLowerCase('pt-BR').includes(query))
      const matchesZone = zoneFilter === 'ALL'
        || (zoneFilter === 'NO_ZONE' ? !row.zone_id : row.zone_id === zoneFilter)
      const matchesLotVisit = lotVisitFilter === 'ALL' || !row.lot_latest_visit_status
      const matchesAcs = acsFilter === 'ALL' || row.latest_visit_acs_id === acsFilter
      const matchesHousehold = householdFilter === 'ALL'
        || (householdFilter === 'PRESUMED' ? row.is_presumed : !row.is_presumed)
      const matchesVisit = visitFilter === 'ALL'
        || (visitFilter === 'NO_VISIT' ? !row.latest_visit_status : row.latest_visit_status === visitFilter)
      const matchesQuestionnaire = questionnaireFilter === 'ALL'
        || (questionnaireFilter === 'NO_RESPONSE'
          ? !row.latest_questionnaire_status
          : row.latest_questionnaire_status === questionnaireFilter)
      return matchesSearch && matchesZone && matchesLotVisit && matchesAcs && matchesHousehold && matchesVisit && matchesQuestionnaire
    })
  }, [acsFilter, householdFilter, lotCodes, lotVisitFilter, questionnaireFilter, rows, search, visitFilter, zoneFilter])

  const hasFilters = Boolean(search.trim())
    || zoneFilter !== 'ALL'
    || acsFilter !== 'ALL'
    || lotVisitFilter !== 'ALL'
    || householdFilter !== 'ALL'
    || visitFilter !== 'ALL'
    || questionnaireFilter !== 'ALL'

  const clearFilters = () => {
    setSearch('')
    setZoneFilter('ALL')
    setAcsFilter('ALL')
    setLotVisitFilter('ALL')
    setHouseholdFilter('ALL')
    setVisitFilter('ALL')
    setQuestionnaireFilter('ALL')
  }

  const scrollToList = () => {
    window.requestAnimationFrame(() => {
      document.getElementById('census-family-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const filterByZone = (nextZone: ZoneFilter) => {
    setSearch('')
    setAcsFilter('ALL')
    setLotVisitFilter('ALL')
    setHouseholdFilter('ALL')
    setVisitFilter('ALL')
    setQuestionnaireFilter('ALL')
    setZoneFilter(nextZone)
    scrollToList()
  }

  const filterByHouseholdType = (nextFilter: HouseholdFilter) => {
    setSearch('')
    setZoneFilter('ALL')
    setAcsFilter('ALL')
    setLotVisitFilter('ALL')
    setVisitFilter('ALL')
    setQuestionnaireFilter('ALL')
    setHouseholdFilter(nextFilter)
    scrollToList()
  }

  const filterByVisit = (nextFilter: VisitFilter) => {
    setLotVisitFilter('ALL')
    setVisitFilter(nextFilter)
  }

  const filterByLotVisit = (nextFilter: LotVisitFilter) => {
    setSearch('')
    setZoneFilter('ALL')
    setAcsFilter('ALL')
    setHouseholdFilter('ALL')
    setVisitFilter('ALL')
    setQuestionnaireFilter('ALL')
    setLotVisitFilter(nextFilter)
    scrollToList()
  }

  const lotCode = (id: string) => lotCodes.get(id) || 'Lote sem código'
  const visitTotal = metrics.visits.total
  const responseTotal = metrics.questionnaires.total

  return <section className="fleet-section fleet-page-section census-families-page" aria-busy={loading}>
    <header className="census-family-page-header">
      <div>
        <span className="fleet-kicker">SAÚDE DA FAMÍLIA / ACS</span>
        <h2>Famílias e visitas</h2>
        <p>Território, atividade de campo e questionários em uma única leitura.</p>
      </div>
      <div className="census-families-actions">
        <button type="button" className="fleet-secondary-button" onClick={() => { setLoading(true); setError(''); void load() }} disabled={loading}>
          <RefreshCw size={16} aria-hidden="true" /> Atualizar
        </button>
        <button type="button" className="fleet-primary-button" onClick={onOpenTerritory}>
          <MapPinned size={16} aria-hidden="true" /> Abrir mapa territorial
        </button>
      </div>
    </header>

    {error && <div className="fleet-inline-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{error}</div>}
    {loading ? <div className="fleet-loading"><LoaderCircle className="spin" size={20} aria-hidden="true" />Carregando dados de campo…</div> : !hasMap ? <div className="census-family-empty-state">
      <MapPinned size={30} aria-hidden="true" />
      <strong>Nenhuma divisão territorial salva</strong>
      <span>Salve uma divisão no Mapa Territorial para iniciar o acompanhamento.</span>
      <button type="button" className="fleet-primary-button" onClick={onOpenTerritory}>Abrir mapa territorial</button>
    </div> : rows.length === 0 ? <div className="census-family-empty-state">
      <UsersRound size={30} aria-hidden="true" />
      <strong>Nenhum lote disponível nesta visualização</strong>
      <span>O mapa existe, mas não há lotes acessíveis para a conta conectada.</span>
    </div> : <>
      <section className="census-family-section" aria-labelledby="census-family-territory-title">
        <div className="census-family-section-heading">
          <div>
            <span className="fleet-kicker">1 · TERRITÓRIO</span>
            <h3 id="census-family-territory-title">Resumo do território</h3>
          </div>
          <span className="census-family-unit-note">Lotes do mapa e domicílios são contagens diferentes.</span>
        </div>
        <div className="census-family-metrics">
          <MetricCard icon={<MapPinned size={20} />} label="Lotes no mapa" value={metrics.lots} note="Polígonos válidos na divisão salva" tone="blue" />
          <MetricCard
            icon={<AlertCircle size={20} />}
            label="Lotes sem zona"
            value={metrics.unzonedLots}
            note="Fora do denominador das zonas"
            tone="amber"
            active={zoneFilter === 'NO_ZONE'}
            onClick={() => filterByZone('NO_ZONE')}
            ariaLabel={`${formatCount(metrics.unzonedLots)} lotes sem zona. Filtrar lista por lotes sem zona.`}
          />
          <MetricCard
            icon={<Home size={20} />}
            label="Domicílios cadastrados"
            value={metrics.registeredHouseholds}
            note="Registros ativos vinculados a lotes"
            tone="teal"
            active={householdFilter === 'REGISTERED'}
            onClick={() => filterByHouseholdType('REGISTERED')}
            ariaLabel={`${formatCount(metrics.registeredHouseholds)} domicílios ativos. Filtrar os registros cadastrados.`}
          />
          <MetricCard
            icon={<UsersRound size={20} />}
            label="Lotes sem domicílio ativo"
            value={metrics.presumedLots}
            note="Exibidos como domicílios presumidos"
            tone="slate"
            active={householdFilter === 'PRESUMED'}
            onClick={() => filterByHouseholdType('PRESUMED')}
            ariaLabel={`${formatCount(metrics.presumedLots)} lotes sem domicílio ativo. Filtrar os registros presumidos.`}
          />
        </div>
      </section>

      <section className="census-family-flow-grid" aria-label="Registros de visitas e questionários">
        <article className="fleet-panel census-family-flow-card">
          <div className="census-family-section-heading">
            <div>
              <span className="fleet-kicker">2 · VISITAS</span>
              <h3>Registros de visita</h3>
              <small>Contagem de eventos vinculados a domicílios ativos; não é contagem de lotes.</small>
            </div>
            <span className="census-family-total-badge">{formatCount(visitTotal)}</span>
          </div>
          <div
            className="census-family-stacked-bar visits"
            role="img"
            aria-label={`Distribuição de ${formatCount(visitTotal)} registros de visita`}
          >
            {VISIT_STATUSES.map((status) => {
              const value = metrics.visits[
                status.key === 'COMPLETED' ? 'completed'
                  : status.key === 'IN_PROGRESS' ? 'inProgress'
                    : status.key === 'NO_CONTACT' ? 'noContact' : 'cancelled'
              ]
              return <i
                key={status.key}
                className={status.className}
                style={{ width: `${visitTotal ? (value / visitTotal) * 100 : 0}%` }}
              />
            })}
          </div>
          <div className="census-family-legend">
            <CountLegend label="Concluídas" value={metrics.visits.completed} className="completed" />
            <CountLegend label="Em andamento" value={metrics.visits.inProgress} className="in-progress" />
            <CountLegend label="Sem contato" value={metrics.visits.noContact} className="no-contact" />
            <CountLegend label="Canceladas" value={metrics.visits.cancelled} className="cancelled" />
          </div>
          <button
            type="button"
            className={`census-family-lot-note${lotVisitFilter === 'NO_VISIT' ? ' is-active' : ''}`}
            onClick={() => filterByLotVisit('NO_VISIT')}
            aria-pressed={lotVisitFilter === 'NO_VISIT'}
          >
            <span><Home size={17} aria-hidden="true" /><strong>Lotes sem visita registrada</strong></span>
            <b>{formatCount(metrics.lotsWithoutVisit)}</b>
          </button>
        </article>

        <article className="fleet-panel census-family-flow-card">
          <div className="census-family-section-heading">
            <div>
              <span className="fleet-kicker">3 · QUESTIONÁRIOS</span>
              <h3>Respostas registradas</h3>
              <small>Rascunho é um estado de preenchimento, não um alerta de atraso.</small>
            </div>
            <span className="census-family-total-badge">{formatCount(responseTotal)}</span>
          </div>
          <div
            className="census-family-stacked-bar questionnaires"
            role="img"
            aria-label={`${formatCount(metrics.questionnaires.submitted)} enviados e ${formatCount(metrics.questionnaires.draft)} rascunhos, de ${formatCount(responseTotal)} respostas`}
          >
            <i className="submitted" style={{ width: `${responseTotal ? (metrics.questionnaires.submitted / responseTotal) * 100 : 0}%` }} />
            <i className="draft" style={{ width: `${responseTotal ? (metrics.questionnaires.draft / responseTotal) * 100 : 0}%` }} />
          </div>
          <div className="census-family-legend questionnaire-legend">
            <CountLegend label="Enviadas" value={metrics.questionnaires.submitted} className="submitted" />
            <CountLegend label="Rascunhos" value={metrics.questionnaires.draft} className="draft" />
          </div>
          <p className="census-family-context-note"><FileText size={15} aria-hidden="true" />A situação na lista indica o questionário mais recente de cada domicílio.</p>
        </article>
      </section>

      <section className="fleet-panel census-family-zone-panel" aria-labelledby="census-family-zone-title">
        <div className="census-family-section-heading">
          <div>
            <span className="fleet-kicker">4 · COMPARAÇÃO TERRITORIAL</span>
            <h3 id="census-family-zone-title">Situação da visita mais recente por lote e zona</h3>
            <small>Cada lote conta uma vez; lotes sem zona aparecem no resumo territorial acima.</small>
          </div>
          <MapPinned size={20} aria-hidden="true" />
        </div>
        <div className="census-family-zone-grid">
          {zoneSummaries.map((zone) => {
            const values: Record<VisitStatus | 'NO_VISIT', number> = {
              COMPLETED: zone.completed,
              IN_PROGRESS: zone.in_progress,
              NO_CONTACT: zone.no_contact,
              CANCELLED: zone.cancelled,
              NO_VISIT: zone.no_visit,
            }
            const completedLabel = `${formatCount(zone.completed)} de ${formatCount(zone.lot_count)} lotes com última visita concluída`
            return <button
              type="button"
              className={`census-family-zone-card${zoneFilter === zone.id ? ' is-active' : ''}`}
              key={zone.id}
              onClick={() => filterByZone(zone.id)}
              aria-pressed={zoneFilter === zone.id}
              aria-label={`${zone.name}: ${completedLabel}. Filtrar a lista por esta zona.`}
            >
              <span className="census-family-zone-card-heading">
                <span className="census-family-zone-name"><i style={{ background: zone.color }} />{zone.name}</span>
                <strong>{formatCount(zone.completed)}<small> / {formatCount(zone.lot_count)}</small></strong>
              </span>
              <span className="census-family-zone-card-caption">Lotes com última visita concluída</span>
              <span className="census-family-zone-stack" aria-hidden="true">
                {LOT_STATUS_ORDER.map((status) => <i
                  key={status}
                  className={status.toLowerCase().replace('_', '-')}
                  style={{ width: `${zone.lot_count ? (values[status] / zone.lot_count) * 100 : 0}%` }}
                />)}
              </span>
              <span className="census-family-zone-card-breakdown">
                {LOT_STATUS_ORDER.map((status) => <span key={status}>
                  <i className={status.toLowerCase().replace('_', '-')} aria-hidden="true" />
                  {LOT_STATUS_LABELS[status]} <b>{formatCount(values[status])}</b>
                </span>)}
              </span>
              <span className="census-family-zone-card-action">Ver domicílios e lotes desta zona</span>
            </button>
          })}
          {!zoneSummaries.length && <div className="census-family-empty-state compact">Nenhuma zona disponível no mapa atual.</div>}
        </div>
      </section>

      <section className="fleet-panel census-family-filter-panel" aria-labelledby="census-family-filter-title">
        <div className="census-family-filter-title-row">
          <div className="census-family-section-heading">
            <div>
              <span className="fleet-kicker">5 · LISTA OPERACIONAL</span>
              <h3 id="census-family-filter-title">Encontrar um lote ou domicílio</h3>
              <small>A lista detalha cada domicílio ativo e inclui uma linha presumida quando o lote não tem cadastro.</small>
            </div>
            <Filter size={19} aria-hidden="true" />
          </div>
        </div>
        <div className="census-family-filters">
          <label className="census-family-search">
            <Search size={17} aria-hidden="true" />
            <span className="sr-only">Buscar por domicílio, lote, zona ou ACS</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por lote, domicílio, zona ou ACS"
            />
          </label>
          <label className="census-family-filter-control">
            <span>Zona</span>
            <select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value as ZoneFilter)}>
              <option value="ALL">Todas as zonas</option>
              <option value="NO_ZONE">Sem zona</option>
              {visibleZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
            </select>
          </label>
          <label className="census-family-filter-control">
            <span>Visita no lote</span>
            <select value={lotVisitFilter} onChange={(event) => { setVisitFilter('ALL'); setLotVisitFilter(event.target.value as LotVisitFilter) }}>
              <option value="ALL">Todos os lotes</option>
              <option value="NO_VISIT">Lote sem visita registrada</option>
            </select>
          </label>
          <label className="census-family-filter-control">
            <span>ACS da última visita</span>
            <select value={acsFilter} onChange={(event) => setAcsFilter(event.target.value)}>
              <option value="ALL">Todos os ACS</option>
              {acsOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
            </select>
          </label>
          <label className="census-family-filter-control">
            <span>Cadastro</span>
            <select value={householdFilter} onChange={(event) => setHouseholdFilter(event.target.value as HouseholdFilter)}>
              <option value="ALL">Todos os registros</option>
              <option value="REGISTERED">Domicílio cadastrado</option>
              <option value="PRESUMED">Domicílio presumido</option>
            </select>
          </label>
          <label className="census-family-filter-control">
            <span>Visita do domicílio</span>
            <select value={visitFilter} onChange={(event) => filterByVisit(event.target.value as VisitFilter)}>
              <option value="ALL">Todas as situações</option>
              <option value="NO_VISIT">Domicílio sem visita registrada</option>
              {VISIT_STATUSES.map((status) => <option key={status.key} value={status.key}>{VISIT_LABELS[status.key]}</option>)}
            </select>
          </label>
          <label className="census-family-filter-control">
            <span>Questionário mais recente</span>
            <select value={questionnaireFilter} onChange={(event) => setQuestionnaireFilter(event.target.value as QuestionnaireFilter)}>
              <option value="ALL">Todos os estados</option>
              <option value="NO_RESPONSE">Sem resposta</option>
              <option value="SUBMITTED">Enviado</option>
              <option value="DRAFT">Rascunho</option>
            </select>
          </label>
        </div>

        <div className="census-family-results-heading" id="census-family-results">
          <div aria-live="polite" aria-atomic="true">
            <strong>{formatCount(filteredRows.length)} registros exibidos</strong>
            <span>de {formatCount(rows.length)} registros: um por domicílio ativo ou lote sem cadastro ativo</span>
          </div>
          {hasFilters && <button type="button" className="census-family-clear-filters" onClick={clearFilters}>
            <X size={15} aria-hidden="true" /> Limpar filtros
          </button>}
        </div>

        <div className="census-family-table-wrap">
          <table className="census-family-table">
            <thead><tr>
              <th scope="col">Lote / domicílio</th>
              <th scope="col">Zona</th>
              <th scope="col">ACS da última visita</th>
              <th scope="col">Visita do domicílio</th>
              <th scope="col">Questionário mais recente</th>
            </tr></thead>
            <tbody>
              {filteredRows.map((row) => {
                const latestStatus = row.latest_visit_status
                const questionnaireStatus = row.latest_questionnaire_status
                return <tr key={`${row.lot_id}:${row.household_id || 'presumed'}`}>
                  <td data-label="Lote / domicílio">
                    <div className="census-family-record">
                      <strong>{lotCode(row.lot_id)}</strong>
                      <span>{row.is_presumed ? 'Domicílio presumido' : row.household_label || 'Domicílio cadastrado'}</span>
                      <small>{row.is_presumed
                        ? 'Sem cadastro ativo neste lote'
                        : row.active_households_in_lot > 1
                          ? `${formatCount(row.active_households_in_lot)} domicílios ativos neste lote`
                          : `${formatCount(count(row.visit_count))} visita(s) registrada(s)`}</small>
                    </div>
                  </td>
                  <td data-label="Zona">
                    <span className={`census-family-zone-chip${row.zone_id ? '' : ' unassigned'}`}>
                      <i style={{ background: row.zone_color || '#93a9ab' }} aria-hidden="true" />
                      {row.zone_name || 'Sem zona'}
                    </span>
                  </td>
                  <td data-label="ACS da última visita">{row.latest_visit_acs_name || '—'}</td>
                  <td data-label="Visita do domicílio">
                    <span className={`census-family-status-pill ${visitStatusClass(latestStatus)}`}>
                      {latestStatus ? VISIT_LABELS[latestStatus] : 'Sem visita'}
                    </span>
                    <small className="census-family-table-subtext">
                      {latestStatus ? `Última registrada em ${formatDate(row.latest_visit_date)}` : 'Ainda não há registro'}
                    </small>
                  </td>
                  <td data-label="Questionário mais recente">
                    <span className={`census-family-questionnaire-pill ${questionnaireStatusClass(questionnaireStatus)}`}>
                      {questionnaireStatus ? QUESTIONNAIRE_LABELS[questionnaireStatus] : 'Sem resposta'}
                    </span>
                    <small className="census-family-table-subtext">
                      {count(row.questionnaire_response_count)
                        ? `${formatCount(count(row.submitted_questionnaire_count))} enviado(s) · ${formatCount(count(row.draft_questionnaire_count))} rascunho(s)`
                        : 'Nenhuma resposta registrada'}
                    </small>
                  </td>
                </tr>
              })}
            </tbody>
          </table>
          {!filteredRows.length && <div className="census-family-empty-state">
            <Search size={24} aria-hidden="true" />
            <strong>Nenhum registro corresponde aos filtros</strong>
            <span>Altere os critérios ou limpe os filtros para voltar à lista completa.</span>
            {hasFilters && <button type="button" className="fleet-secondary-button" onClick={clearFilters}>Limpar filtros</button>}
          </div>}
        </div>
      </section>
    </>}
  </section>
}
