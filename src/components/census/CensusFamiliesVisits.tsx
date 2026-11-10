import { useEffect, useMemo, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { AlertCircle, BarChart3, CheckCircle2, ClipboardCheck, Filter, Home, LoaderCircle, MapPinned, RefreshCw, Search, Target, Trophy, UsersRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getMapLotCode } from './territory/lotDisplay'
import './CensusFamiliesVisits.css'

type Zone = { id: string; name: string; color: string; active: boolean }
type Acs = { id: string; full_name: string; email: string | null; active: boolean }
type Lot = { id: string; source_handle: string; label: string | null; zone_id: string | null }
type Household = { id: string; lot_id: string; label: string; active: boolean; created_at: string }
type Visit = { id: string; household_id: string; acs_id: string | null; visit_date: string; status: 'IN_PROGRESS' | 'COMPLETED' | 'NO_CONTACT' | 'CANCELLED' }
type Response = { id: string; visit_id: string; status: 'DRAFT' | 'SUBMITTED' }
type HouseholdRow = Household & { lot: Lot | undefined; zone: Zone | undefined; acs: Acs | undefined; latestVisit: Visit | undefined; visitCount: number; completedVisits: number; submittedResponses: number; draftResponses: number; presumed: boolean }
type Summary = { id: string; name: string; color?: string; households: number; completed: number; pending: number; visits: number; coverage: number }

type FilterStatus = 'ALL' | 'PENDING' | 'COMPLETED' | 'IN_PROGRESS' | 'NO_CONTACT'
const PAGE_SIZE = 1000
const statusLabels: Record<FilterStatus | Visit['status'], string> = { ALL: 'Todas as situações', PENDING: 'Sem visita concluída', COMPLETED: 'Concluída', IN_PROGRESS: 'Em andamento', NO_CONTACT: 'Sem contato', CANCELLED: 'Cancelada' }

async function fetchPages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

function formatDate(value: string | undefined) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(`${value.slice(0, 10)}T12:00:00`))
}

export function CensusFamiliesVisits({ onOpenTerritory }: { onOpenTerritory: () => void }) {
  const [zones, setZones] = useState<Zone[]>([])
  const [acs, setAcs] = useState<Acs[]>([])
  const [rows, setRows] = useState<HouseholdRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [zoneFilter, setZoneFilter] = useState('ALL')
  const [acsFilter, setAcsFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('ALL')

  const load = async () => {
    if (!supabase) { setError('O banco do Censo não está disponível nesta sessão.'); setLoading(false); return }
    const db = supabase
    setLoading(true); setError('')
    try {
      const [zoneResult, acsResult, lotRows, householdRows, visitRows, responseRows] = await Promise.all([
        db.from('census_zones').select('id,name,color,active').eq('active', true).order('created_at').limit(500),
        db.from('census_acs').select('id,full_name,email,active').eq('active', true).order('full_name').limit(500),
        fetchPages<Lot>((from, to) => db.from('census_territory_map_lots').select('id,source_handle,label,zone_id').order('source_handle').order('id').range(from, to)),
        fetchPages<Household>((from, to) => db.from('census_households').select('id,lot_id,label,active,created_at').eq('active', true).order('created_at', { ascending: false }).order('id').range(from, to)),
        fetchPages<Visit>((from, to) => db.from('census_visits').select('id,household_id,acs_id,visit_date,status').order('visit_date', { ascending: false }).order('id').range(from, to)),
        fetchPages<Response>((from, to) => db.from('census_questionnaire_responses').select('id,visit_id,status').order('created_at', { ascending: false }).order('id').range(from, to)),
      ])
      if (zoneResult.error) throw new Error(zoneResult.error.message)
      if (acsResult.error) throw new Error(acsResult.error.message)
      const nextZones = (zoneResult.data || []) as Zone[]
      const nextAcs = (acsResult.data || []) as Acs[]
      const lots = lotRows as Lot[]
      const households = householdRows as Household[]
      const visits = visitRows as Visit[]
      const responses = responseRows as Response[]
      const zoneById = new Map(nextZones.map((zone) => [zone.id, zone]))
      const acsById = new Map(nextAcs.map((person) => [person.id, person]))
      const visitsByHousehold = new Map<string, Visit[]>()
      for (const visit of visits) visitsByHousehold.set(visit.household_id, [...(visitsByHousehold.get(visit.household_id) || []), visit])
      const responsesByVisit = new Map<string, Response[]>()
      for (const response of responses) responsesByVisit.set(response.visit_id, [...(responsesByVisit.get(response.visit_id) || []), response])
      setZones(nextZones); setAcs(nextAcs)
      const householdsByLot = new Map<string, Household[]>()
      for (const household of households) householdsByLot.set(household.lot_id, [...(householdsByLot.get(household.lot_id) || []), household])
      const nextRows: HouseholdRow[] = []
      for (const lot of lots) {
        const lotHouseholds = householdsByLot.get(lot.id) || []
        if (!lotHouseholds.length) {
          nextRows.push({ id: `presumed-${lot.id}`, lot_id: lot.id, label: 'Domicílio presumido', active: true, created_at: '', lot, zone: lot.zone_id ? zoneById.get(lot.zone_id) : undefined, acs: undefined, latestVisit: undefined, visitCount: 0, completedVisits: 0, submittedResponses: 0, draftResponses: 0, presumed: true })
          continue
        }
        for (const household of lotHouseholds) nextRows.push({ ...household, lot, zone: lot.zone_id ? zoneById.get(lot.zone_id) : undefined, acs: undefined, latestVisit: undefined, visitCount: 0, completedVisits: 0, submittedResponses: 0, draftResponses: 0, presumed: false })
      }
      setRows(nextRows.map((household) => {
        const householdVisits = visitsByHousehold.get(household.id) || []
        const latestVisit = householdVisits[0]
        const householdResponses = householdVisits.flatMap((visit) => responsesByVisit.get(visit.id) || [])
        return { ...household, acs: latestVisit?.acs_id ? acsById.get(latestVisit.acs_id) : undefined, latestVisit, visitCount: householdVisits.length, completedVisits: householdVisits.filter((visit) => visit.status === 'COMPLETED').length, submittedResponses: householdResponses.filter((item) => item.status === 'SUBMITTED').length, draftResponses: householdResponses.filter((item) => item.status === 'DRAFT').length }
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o painel de famílias e visitas.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])

  const metrics = useMemo(() => {
    const completed = rows.filter((row) => row.completedVisits > 0).length
    const inProgress = rows.filter((row) => row.latestVisit?.status === 'IN_PROGRESS').length
    const noContact = rows.filter((row) => row.latestVisit?.status === 'NO_CONTACT').length
    const submitted = rows.reduce((sum, row) => sum + row.submittedResponses, 0)
    return { households: rows.length, completed, pending: rows.length - completed, inProgress, noContact, submitted }
  }, [rows])

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    return rows.filter((row) => {
      const matchesQuery = !query || [row.label, row.lot?.label, row.lot?.source_handle, row.zone?.name, row.acs?.full_name].some((value) => value?.toLowerCase().includes(query))
      const matchesZone = zoneFilter === 'ALL' || row.zone?.id === zoneFilter
      const matchesAcs = acsFilter === 'ALL' || row.acs?.id === acsFilter
      const status = row.latestVisit?.status
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'PENDING' ? row.completedVisits === 0 : status === statusFilter)
      return matchesQuery && matchesZone && matchesAcs && matchesStatus
    })
  }, [rows, search, zoneFilter, acsFilter, statusFilter])

  const zoneSummary = useMemo<Summary[]>(() => zones.map((zone) => {
    const zoneRows = rows.filter((row) => row.zone?.id === zone.id)
    const completed = zoneRows.filter((row) => row.completedVisits > 0).length
    return { id: zone.id, name: zone.name, color: zone.color, households: zoneRows.length, completed, pending: zoneRows.length - completed, visits: zoneRows.reduce((sum, row) => sum + row.visitCount, 0), coverage: zoneRows.length ? Math.round((completed / zoneRows.length) * 100) : 0 }
  }), [rows, zones])

  const acsSummary = useMemo<Summary[]>(() => acs.map((person) => {
    const acsRows = rows.filter((row) => row.acs?.id === person.id)
    const completed = acsRows.filter((row) => row.completedVisits > 0).length
    return { id: person.id, name: person.full_name, households: acsRows.length, completed, pending: acsRows.filter((row) => row.latestVisit?.status !== 'COMPLETED').length, visits: rows.reduce((sum, row) => sum + (row.latestVisit?.acs_id === person.id ? 1 : 0), 0), coverage: acsRows.length ? Math.round((completed / acsRows.length) * 100) : 0 }
  }), [rows, acs])

  const visualMetrics = useMemo(() => {
    const coverage = metrics.households ? Math.round((metrics.completed / metrics.households) * 100) : 0
    const noVisit = rows.filter((row) => row.visitCount === 0).length
    const registered = rows.filter((row) => !row.presumed).length
    const completed = rows.filter((row) => row.completedVisits > 0).length
    const inProgress = rows.filter((row) => row.latestVisit?.status === 'IN_PROGRESS').length
    const noContact = rows.filter((row) => row.latestVisit?.status === 'NO_CONTACT').length
    const cancelled = rows.filter((row) => row.latestVisit?.status === 'CANCELLED').length
    return { coverage, noVisit, registered, completed, inProgress, noContact, cancelled }
  }, [metrics, rows])

  const topAcs = useMemo(() => [...acsSummary].sort((a, b) => b.coverage - a.coverage || b.completed - a.completed).slice(0, 6), [acsSummary])

  return <section className="fleet-section fleet-page-section census-families-page">
    <div className="fleet-page-heading census-families-heading"><div><span className="fleet-kicker">OPERAÇÃO DE CAMPO</span><h2>Famílias e Visitas</h2><p>Acompanhe domicílios cadastrados, cobertura de visitas e pendências do Censo Municipal.</p></div><div className="census-families-actions"><button type="button" className="fleet-secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Atualizar</button><button type="button" className="fleet-primary-button" onClick={onOpenTerritory}><MapPinned size={14} /> Abrir mapa</button></div></div>
    {error && <div className="fleet-inline-error" role="alert"><AlertCircle size={15} />{error}</div>}
    {loading ? <div className="fleet-loading"><LoaderCircle className="spin" size={20} />Carregando dados de campo…</div> : <>
      <div className="census-family-metrics">
        <Metric icon={<Home size={18} />} label="Lotes / domicílios considerados" value={metrics.households} tone="blue" />
        <Metric icon={<CheckCircle2 size={18} />} label="Com visita concluída" value={metrics.completed} tone="green" />
        <Metric icon={<ClipboardCheck size={18} />} label="Pendentes" value={metrics.pending} tone="amber" />
        <Metric icon={<UsersRound size={18} />} label="Em andamento" value={metrics.inProgress} tone="purple" />
        <Metric icon={<AlertCircle size={18} />} label="Sem contato" value={metrics.noContact} tone="red" />
        <Metric icon={<CheckCircle2 size={18} />} label="Questionários enviados" value={metrics.submitted} tone="teal" />
      </div>
      <section className="census-family-visual-grid" aria-label="Visão visual da cobertura territorial">
        <article className="fleet-panel census-family-coverage-card">
          <div className="census-family-section-heading"><div><span className="fleet-kicker">COBERTURA TERRITORIAL</span><h3>Avanço do Censo</h3></div><Target size={19} /></div>
          <div className="census-family-coverage-body"><div className="census-family-donut" style={{ '--coverage': `${visualMetrics.coverage}%` } as CSSProperties}><div><strong>{visualMetrics.coverage}%</strong><small>cobertura</small></div></div><div className="census-family-coverage-copy"><strong>{visualMetrics.completed.toLocaleString('pt-BR')} de {metrics.households.toLocaleString('pt-BR')}</strong><span>lotes com visita concluída; lotes sem cadastro são considerados domicílios presumidos</span><div className="census-family-mini-stats"><span><i className="done" />Concluídos <b>{visualMetrics.completed}</b></span><span><i className="waiting" />Sem visita <b>{visualMetrics.noVisit}</b></span><span><i className="attention" />Sem contato <b>{visualMetrics.noContact}</b></span><span><i className="registered" />Cadastros reais <b>{visualMetrics.registered}</b></span></div></div></div>
        </article>
        <article className="fleet-panel census-family-status-chart">
          <div className="census-family-section-heading"><div><span className="fleet-kicker">SITUAÇÃO DAS VISITAS</span><h3>Onde concentrar esforço</h3></div><BarChart3 size={19} /></div>
          <div className="census-family-stacked-bar" aria-label="Distribuição das situações das visitas"><i className="done" style={{ width: `${metrics.households ? (visualMetrics.completed / metrics.households) * 100 : 0}%` }} /><i className="progress" style={{ width: `${metrics.households ? (visualMetrics.inProgress / metrics.households) * 100 : 0}%` }} /><i className="attention" style={{ width: `${metrics.households ? (visualMetrics.noContact / metrics.households) * 100 : 0}%` }} /><i className="waiting" style={{ width: `${metrics.households ? (visualMetrics.noVisit / metrics.households) * 100 : 0}%` }} /></div>
          <div className="census-family-status-legend"><span><i className="done" />Concluídas <b>{visualMetrics.completed}</b></span><span><i className="progress" />Em andamento <b>{visualMetrics.inProgress}</b></span><span><i className="attention" />Sem contato <b>{visualMetrics.noContact}</b></span><span><i className="waiting" />Sem visita <b>{visualMetrics.noVisit}</b></span></div>
        </article>
      </section>
      <section className="census-family-chart-grid">
        <article className="fleet-panel census-family-zone-chart"><div className="census-family-section-heading"><div><span className="fleet-kicker">COBERTURA POR ZONA</span><h3>Mapa de avanço</h3></div><small>Percentual de domicílios concluídos</small></div>{zoneSummary.length ? <div className="census-family-zone-bars">{zoneSummary.map((zone) => <div className="census-family-zone-bar" key={zone.id}><div className="census-family-zone-bar-label"><span><i style={{ background: zone.color }} />{zone.name}</span><b>{zone.coverage}%</b></div><div className="census-family-zone-track"><i style={{ width: `${zone.coverage}%`, background: zone.color }} /></div><small>{zone.completed} concluídos · {zone.pending} pendentes</small></div>)}</div> : <div className="census-family-empty compact">Nenhuma zona com dados.</div>}</article>
        <article className="fleet-panel census-family-agents-chart"><div className="census-family-section-heading"><div><span className="fleet-kicker">DESEMPENHO DOS AGENTES</span><h3>ACS em campo</h3></div><Trophy size={19} /></div>{topAcs.length ? <div className="census-family-agent-cards">{topAcs.map((agent, index) => <div className="census-family-agent-card" key={agent.id}><span className={`census-family-agent-rank rank-${index + 1}`}>{index + 1}</span><div className="census-family-agent-info"><strong>{agent.name}</strong><small>{agent.completed} concluídos · {agent.visits} visita(s)</small><div className="census-family-agent-track"><i style={{ width: `${agent.coverage}%` }} /></div></div><b>{agent.coverage}%</b></div>)}</div> : <div className="census-family-empty compact">Nenhum ACS com visitas registradas.</div>}</article>
      </section>
      <section className="fleet-panel census-family-filter-panel"><div className="census-family-filter-title"><Filter size={16} /><strong>Filtrar domicílios</strong><span>{filteredRows.length} de {rows.length}</span></div><div className="census-family-filters"><label className="census-family-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por domicílio, lote, zona ou ACS" /></label><select value={zoneFilter} onChange={(event) => setZoneFilter(event.target.value)}><option value="ALL">Todas as zonas</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select><select value={acsFilter} onChange={(event) => setAcsFilter(event.target.value)}><option value="ALL">Todos os ACS</option>{acs.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as FilterStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></section>
      <section className="fleet-panel census-family-table-panel"><div className="census-family-section-heading"><div><span className="fleet-kicker">ACOMPANHAMENTO</span><h3>Domicílios e famílias</h3></div><small>Clique no mapa para abrir o dossiê completo.</small></div><div className="census-family-table-wrap"><table className="census-family-table"><thead><tr><th>Domicílio</th><th>Lote</th><th>Zona</th><th>ACS recente</th><th>Última visita</th><th>Situação</th><th>Questionário</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id}><td><strong>{row.presumed ? <span className="census-family-presumed-label">{row.label}</span> : row.label}</strong><small>{row.presumed ? 'Cadastre este domicílio no Mapa Territorial' : `${row.visitCount} visita(s) registrada(s)`}</small></td><td>{row.lot ? getMapLotCode(row.lot.label, row.lot.source_handle, 0) : 'Lote não encontrado'}</td><td><span className="census-family-zone"><i style={{ background: row.zone?.color || '#a8babc' }} />{row.zone?.name || 'Sem zona'}</span></td><td>{row.acs?.full_name || 'Não informado'}</td><td>{formatDate(row.latestVisit?.visit_date)}</td><td><span className={`census-family-status ${row.latestVisit?.status?.toLowerCase() || 'pending'}`}>{row.latestVisit ? statusLabels[row.latestVisit.status] : 'Sem visita'}</span></td><td>{row.submittedResponses ? <span className="census-family-response sent">{row.submittedResponses} enviado(s)</span> : row.draftResponses ? <span className="census-family-response draft">Rascunho</span> : <span className="census-family-response pending">Pendente</span>}</td></tr>)}</tbody></table>{!filteredRows.length && <div className="census-family-empty"><Search size={20} /><strong>Nenhum domicílio encontrado</strong><span>Altere os filtros ou aguarde o cadastro de famílias no mapa territorial.</span></div>}</div></section>
      <div className="census-family-summary-grid"><SummaryCard title="Resumo por zona" subtitle="Cobertura de visitas" rows={zoneSummary} colorMode="zone" /><SummaryCard title="Resumo por ACS" subtitle="Domicílios acompanhados" rows={acsSummary} colorMode="acs" /></div>
    </>}
  </section>
}

function Metric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: number; tone: string }) {
  return <article className={`census-family-metric ${tone}`}><span>{icon}</span><div><strong>{value.toLocaleString('pt-BR')}</strong><small>{label}</small></div></article>
}

function SummaryCard({ title, subtitle, rows, colorMode }: { title: string; subtitle: string; rows: Summary[]; colorMode: 'zone' | 'acs' }) {
  return <section className="fleet-panel census-family-summary-card"><div className="census-family-section-heading"><div><span className="fleet-kicker">DESEMPENHO</span><h3>{title}</h3></div><small>{subtitle}</small></div>{rows.length ? <div className="census-family-summary-list">{rows.map((row) => <div className="census-family-summary-row" key={row.id}><div className="census-family-summary-name">{colorMode === 'zone' && <i style={{ background: row.color || '#a8babc' }} />}<strong>{row.name}</strong><small>{row.households} domicílio(s) · {row.visits} visita(s)</small></div><div className="census-family-progress"><div><span>{row.completed} concluídos</span><b>{row.coverage}%</b></div><div className="census-family-progress-track"><i style={{ width: `${row.coverage}%`, background: row.color || '#2d7d8a' }} /></div></div></div>)}</div> : <div className="census-family-empty compact"><UsersRound size={18} />Nenhum dado disponível.</div>}</section>
}
