import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, ArrowRight, BarChart3, ClipboardCheck, Home, LoaderCircle, MapPinned, RefreshCw, UsersRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './CensusOverview.css'

type Zone = { id: string; name: string; color: string }
type Lot = { id: string; zone_id: string | null }
type Household = { id: string; lot_id: string; label: string }
type Visit = { id: string; household_id: string; acs_id: string | null; visit_date: string; status: string; created_at: string }
type Response = { id: string; visit_id: string; status: string; created_at: string }
type Acs = { id: string; full_name: string }
type OverviewData = { lots: Lot[]; households: Household[]; visits: Visit[]; responses: Response[]; zones: Zone[]; acs: Acs[]; importReady: boolean }

function pages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) { return (async () => { const rows: T[] = []; for (let from = 0; ; from += 1000) { const result = await load(from, from + 999); if (result.error) throw new Error(result.error.message); rows.push(...(result.data || [])); if ((result.data || []).length < 1000) return rows } })() }
function fmtDate(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }

export function CensusOverview({ onOpen }: { onOpen: (view: 'territory' | 'families' | 'dwg' | 'zones' | 'forms') => void }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = async () => {
    if (!supabase) { setError('O banco do Censo não está disponível nesta sessão.'); setLoading(false); return }
    const db = supabase; setLoading(true); setError('')
    try {
      const [imports, lots, households, visits, responses, zones, acs] = await Promise.all([
        db.from('census_map_imports').select('id').in('status', ['DRAFT', 'PUBLISHED']).not('division_saved_at', 'is', null).limit(1),
        pages<Lot>((from, to) => db.from('census_map_lots').select('id,zone_id').eq('is_valid', true).range(from, to)),
        pages<Household>((from, to) => db.from('census_households').select('id,lot_id,label').eq('active', true).range(from, to)),
        pages<Visit>((from, to) => db.from('census_visits').select('id,household_id,acs_id,visit_date,status,created_at').order('created_at', { ascending: false }).range(from, to)),
        pages<Response>((from, to) => db.from('census_questionnaire_responses').select('id,visit_id,status,created_at').order('created_at', { ascending: false }).range(from, to)),
        db.from('census_zones').select('id,name,color').eq('active', true).order('created_at').limit(100),
        db.from('census_acs').select('id,full_name').eq('active', true).order('full_name').limit(500),
      ])
      if (imports.error || zones.error || acs.error) throw new Error(imports.error?.message || zones.error?.message || acs.error?.message || 'Não foi possível carregar o painel.')
      setData({ lots: lots as Lot[], households: households as Household[], visits: visits as Visit[], responses: responses as Response[], zones: (zones.data || []) as Zone[], acs: (acs.data || []) as Acs[], importReady: Boolean(imports.data?.length) })
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar a Visão Geral.') } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const metrics = useMemo(() => {
    if (!data) return null
    const householdById = new Map(data.households.map((household) => [household.id, household]))
    const lotIds = new Set(data.lots.map((lot) => lot.id))
    const confirmedLotIds = new Set(data.households.filter((household) => lotIds.has(household.lot_id)).map((household) => household.lot_id))
    const visitedLotIds = new Set(data.visits.filter((visit) => visit.status === 'COMPLETED').map((visit) => householdById.get(visit.household_id)?.lot_id).filter((lotId): lotId is string => Boolean(lotId)))
    const submittedLotIds = new Set(data.responses.filter((response) => response.status === 'SUBMITTED').map((response) => data.visits.find((visit) => visit.id === response.visit_id)).map((visit) => visit ? householdById.get(visit.household_id)?.lot_id : null).filter((lotId): lotId is string => Boolean(lotId)))
    return { lots: data.lots.length, confirmed: confirmedLotIds.size, visited: visitedLotIds.size, submitted: submittedLotIds.size, presumed: Math.max(data.lots.length - confirmedLotIds.size, 0), pending: Math.max(data.lots.length - visitedLotIds.size, 0), withoutZone: data.lots.filter((lot) => !lot.zone_id).length, zones: data.zones.length, acs: data.acs.length, draftResponses: data.responses.filter((response) => response.status === 'DRAFT').length }
  }, [data])
  const zoneStats = useMemo(() => data?.zones.map((zone) => { const lots = data.lots.filter((lot) => lot.zone_id === zone.id); const lotIds = new Set(lots.map((lot) => lot.id)); const householdIds = new Set(data.households.filter((household) => lotIds.has(household.lot_id)).map((household) => household.id)); const done = new Set(data.visits.filter((visit) => householdIds.has(visit.household_id) && visit.status === 'COMPLETED').map((visit) => visit.household_id)).size; return { ...zone, lots: lots.length, done, coverage: lots.length ? Math.round((done / lots.length) * 100) : 0 } }) || [], [data])
  const recent = useMemo(() => { if (!data) return []; const householdNames = new Map(data.households.map((item) => [item.id, item.label])); const acsNames = new Map(data.acs.map((item) => [item.id, item.full_name])); return data.visits.slice(0, 5).map((visit) => ({ ...visit, household: householdNames.get(visit.household_id) || 'Domicílio', acs: visit.acs_id ? acsNames.get(visit.acs_id) : 'Agente não informado' })) }, [data])

  return <section className="fleet-section fleet-page-section census-overview-page"><div className="census-overview-actions census-overview-toolbar"><button type="button" className="fleet-secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> Atualizar dados</button></div>{error && <div className="fleet-inline-error"><AlertCircle size={15} />{error}</div>}{loading ? <div className="fleet-loading"><LoaderCircle className="spin" size={20} />Carregando painel…</div> : metrics && data && <>
    <section className="fleet-panel census-overview-funnel census-overview-hero"><div className="census-overview-title"><div><span className="fleet-kicker">ACOMPANHAMENTO DO CENSO</span><h3>Até onde o trabalho já avançou?</h3><p className="census-overview-intro">Cada etapa mostra quantos lotes já passaram pelo processo, do mapa até o questionário enviado.</p></div><BarChart3 size={21} /></div><div className="census-overview-funnel-stages"><Funnel label="Lotes no mapa" value={metrics.lots} max={metrics.lots} color="#2d7d8a" /><Funnel label="Domicílios confirmados" value={metrics.confirmed} max={metrics.lots} color="#2d8a70" /><Funnel label="Lotes com visita concluída" value={metrics.visited} max={metrics.lots} color="#d5a341" /><Funnel label="Lotes com questionário enviado" value={metrics.submitted} max={metrics.lots} color="#7750a8" /></div><div className="census-overview-funnel-note"><Home size={15} /> {metrics.presumed.toLocaleString('pt-BR')} lote(s) ainda usam a estimativa inicial de um domicílio por lote.</div></section>
    <div className="census-overview-context"><OverviewMetric icon={<MapPinned />} label="Zonas organizadas" value={metrics.zones} tone="blue" /><OverviewMetric icon={<UsersRound />} label="Agentes ativos" value={metrics.acs} tone="green" /><div className="census-overview-context-copy"><strong>O que precisa de atenção agora?</strong><span>{metrics.withoutZone ? `${metrics.withoutZone.toLocaleString('pt-BR')} lote(s) ainda estão sem zona.` : metrics.pending ? `${metrics.pending.toLocaleString('pt-BR')} lote(s) ainda não têm visita concluída.` : 'Todos os lotes já passaram pelas etapas principais.'}</span><button type="button" onClick={() => onOpen(metrics.withoutZone ? 'dwg' : 'families')}>{metrics.withoutZone ? 'Organizar mapa' : 'Ver visitas'} <ArrowRight size={14} /></button></div></div>
    <div className="census-overview-lower-grid"><section className="fleet-panel census-overview-zones"><div className="census-overview-title"><div><span className="fleet-kicker">POR REGIÃO</span><h3>Como está cada zona?</h3></div><button type="button" className="census-text-action" onClick={() => onOpen('territory')}>Abrir mapa <ArrowRight size={14} /></button></div>{zoneStats.map((zone) => <div className="census-overview-zone" key={zone.id}><div><span><i style={{ background: zone.color }} />{zone.name}</span><b>{zone.coverage}% visitados</b></div><div className="census-overview-track"><i style={{ width: `${zone.coverage}%`, background: zone.color }} /></div><small>{zone.done} de {zone.lots} lote(s) com visita concluída</small></div>)}</section><section className="fleet-panel census-overview-activity"><div className="census-overview-title"><div><span className="fleet-kicker">ÚLTIMOS REGISTROS</span><h3>O que foi feito recentemente?</h3></div><UsersRound size={19} /></div>{recent.length ? recent.map((visit) => <div className="census-overview-activity-row" key={visit.id}><span className={`census-overview-activity-dot ${visit.status.toLowerCase()}`} /><div><strong>{visit.household}</strong><small>{visit.acs} · {fmtDate(visit.created_at)}</small></div><b>{visit.status === 'COMPLETED' ? 'Concluída' : visit.status === 'NO_CONTACT' ? 'Sem contato' : visit.status === 'IN_PROGRESS' ? 'Em andamento' : 'Cancelada'}</b></div>) : <div className="census-overview-empty">Ainda não há visitas registradas.</div>}</section></div>
    <div className="census-overview-quick-actions"><button type="button" onClick={() => onOpen('territory')}><MapPinned /> Abrir mapa territorial</button><button type="button" onClick={() => onOpen('families')}><Home /> Ver domicílios e visitas</button><button type="button" onClick={() => onOpen('forms')}><ClipboardCheck /> Ver questionários</button></div>
  </>}</section>
}
function OverviewMetric({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string | number; tone: string }) { return <article className={`census-overview-metric ${tone}`}><span>{icon}</span><div><strong>{typeof value === 'number' ? value.toLocaleString('pt-BR') : value}</strong><small>{label}</small></div></article> }
function Funnel({ label, value, max, color }: { label: string; value: number; max: number; color: string }) { const width = max ? Math.max((value / max) * 100, value ? 4 : 0) : 0; return <div className="census-overview-funnel-row" aria-label={`${label}: ${value.toLocaleString('pt-BR')}`}><div><span>{label}</span><b>{value.toLocaleString('pt-BR')}</b></div><div className="census-overview-funnel-track"><i style={{ width: `${width}%`, background: color }} /></div></div> }
