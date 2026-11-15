import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, Gauge, LoaderCircle, MapPinned, UsersRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './CensusOverview.css'

type Zone = { id: string; name: string; color: string }
type Lot = { id: string; zone_id: string | null; street_name?: string | null; neighborhood_name?: string | null; block_reference?: string | null; indicator_exclusion_reason: 'VACANT' | 'PUBLIC' | null }
type Household = { id: string; lot_id: string; label: string; created_at: string }
type Visit = { id: string; household_id: string; acs_id: string | null; visit_date: string; status: string; created_at: string; completed_at: string | null }
type Response = { id: string; visit_id: string; status: string; created_at: string; submitted_at: string | null }
type Acs = { id: string; full_name: string }
type OverviewData = { lots: Lot[]; households: Household[]; visits: Visit[]; responses: Response[]; zones: Zone[]; acs: Acs[]; importReady: boolean }
type Forecast = { key: string; label: string; daysRemaining: number | null }
type OperationalFilter = 'ALL' | 'NO_VISIT' | 'NO_CONTACT' | 'QUESTIONNAIRE' | 'DRAFT'
type NextAction = { id: string; title: string; detail: string; address: string; zone: string; lastAction: string; nextStep: string; cta: string; filter: OperationalFilter; tone: 'urgent' | 'pending' | 'neutral' }
type ManagerZoneStat = Zone & { lots: number; territoryLots: number; excludedLots: number; done: number; coverage: number }
type ManagerMetrics = { lots: number; territoryLots: number; excludedLots: number; confirmed: number; visited: number; submitted: number; presumed: number; pending: number; withoutZone: number; zones: number; acs: number; draftResponses: number; forecasts: Forecast[] }

const DAY_MS = 24 * 60 * 60 * 1000
const FORECAST_WINDOW_DAYS = 30
const MIN_ACTIVITY_DAYS = 3
const MIN_ACTIVITY_SPAN_DAYS = 7

function pages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  return (async () => {
    const rows: T[] = []
    for (let from = 0; ; from += 1000) {
      const result = await load(from, from + 999)
      if (result.error) throw new Error(result.error.message)
      rows.push(...(result.data || []))
      if ((result.data || []).length < 1000) return rows
    }
  })()
}

function fmtDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function dateKey(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function daysToCompletion(timestamps: string[], remaining: number, now = Date.now()): number | null {
  if (remaining <= 0) return 0
  const cutoff = now - FORECAST_WINDOW_DAYS * DAY_MS
  const recentDates = timestamps
    .map((value) => ({ value, time: new Date(value).getTime(), day: dateKey(value) }))
    .filter((item) => Number.isFinite(item.time) && item.time >= cutoff && item.time <= now && item.day !== null)
  const activeDays = [...new Set(recentDates.map((item) => item.day as string))].sort()
  if (activeDays.length < MIN_ACTIVITY_DAYS) return null

  const firstDay = new Date(`${activeDays[0]}T00:00:00Z`).getTime()
  const lastDay = new Date(`${activeDays[activeDays.length - 1]}T00:00:00Z`).getTime()
  const elapsedDays = (lastDay - firstDay) / DAY_MS
  if (elapsedDays < MIN_ACTIVITY_SPAN_DAYS) return null

  const dailyRate = recentDates.length / elapsedDays
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) return null
  return Math.ceil(remaining / dailyRate)
}

export function CensusOverview({ role = 'acs', focus = 'overview', onOpen }: { role?: 'acs' | 'manager'; focus?: 'overview' | 'attention'; onOpen: (view: 'territory' | 'families' | 'dwg' | 'zones' | 'forms', filter?: OperationalFilter, managerStatus?: 'all' | 'no_activity' | 'no_visit' | 'in_progress' | 'questionnaire_pending' | 'draft' | 'no_contact' | 'answered') => void }) {
  const [data, setData] = useState<OverviewData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    if (!supabase) {
      setError('O serviço de dados da Saúde da Família/ACS não está disponível nesta sessão.')
      setLoading(false)
      return
    }
    const db = supabase
    setLoading(true)
    setError('')
    try {
      const [imports, lots, households, visits, responses, zones, acs] = await Promise.all([
        db.from('census_territory_map_imports').select('id').limit(1),
        pages<Lot>((from, to) => db.from('census_territory_map_lots').select('id,zone_id,street_name,neighborhood_name,block_reference,indicator_exclusion_reason').order('source_handle').order('id').range(from, to)),
        pages<Household>((from, to) => db.from('census_households').select('id,lot_id,label,created_at').eq('active', true).range(from, to)),
        pages<Visit>((from, to) => db.from('census_visits').select('id,household_id,acs_id,visit_date,status,created_at,completed_at').order('created_at', { ascending: false }).range(from, to)),
        pages<Response>((from, to) => db.from('census_questionnaire_responses').select('id,visit_id,status,created_at,submitted_at').order('created_at', { ascending: false }).range(from, to)),
        db.from('census_zones').select('id,name,color').eq('active', true).order('created_at').limit(100),
        db.from('census_acs').select('id,full_name').eq('active', true).order('full_name').limit(500),
      ])
      if (imports.error || zones.error || acs.error) throw new Error(imports.error?.message || zones.error?.message || acs.error?.message || 'Não foi possível carregar o painel.')
      setData({
        lots: lots as Lot[],
        households: households as Household[],
        visits: visits as Visit[],
        responses: responses as Response[],
        zones: (zones.data || []) as Zone[],
        acs: (acs.data || []) as Acs[],
        importReady: Boolean(imports.data?.length),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar a Visão Geral.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const metrics = useMemo(() => {
    if (!data) return null
    const householdById = new Map(data.households.map((household) => [household.id, household]))
    const visitById = new Map(data.visits.map((visit) => [visit.id, visit]))
    const eligibleLots = data.lots.filter((lot) => !lot.indicator_exclusion_reason)
    const lotIds = new Set(eligibleLots.map((lot) => lot.id))
    const confirmedLotIds = new Set(data.households.filter((household) => lotIds.has(household.lot_id)).map((household) => household.lot_id))
    const visitedLotIds = new Set(data.visits.filter((visit) => visit.status === 'COMPLETED').map((visit) => householdById.get(visit.household_id)?.lot_id).filter((lotId): lotId is string => Boolean(lotId && lotIds.has(lotId))))
    const submittedLotIds = new Set(data.responses.filter((response) => response.status === 'SUBMITTED').map((response) => visitById.get(response.visit_id)).map((visit) => visit ? householdById.get(visit.household_id)?.lot_id : null).filter((lotId): lotId is string => Boolean(lotId && lotIds.has(lotId))))

    const firstTimestampPerLot = (events: { lotId: string; timestamp: string | null }[]) => {
      const firstByLot = new Map<string, string>()
      for (const event of events) {
        if (!event.timestamp || !lotIds.has(event.lotId) || !Number.isFinite(new Date(event.timestamp).getTime())) continue
        const current = firstByLot.get(event.lotId)
        if (!current || new Date(event.timestamp).getTime() < new Date(current).getTime()) firstByLot.set(event.lotId, event.timestamp)
      }
      return [...firstByLot.values()]
    }

    const householdMilestones = firstTimestampPerLot(data.households.map((household) => ({ lotId: household.lot_id, timestamp: household.created_at })))
    const visitMilestones = firstTimestampPerLot(data.visits
      .filter((visit) => visit.status === 'COMPLETED')
      .map((visit) => ({ lotId: householdById.get(visit.household_id)?.lot_id || '', timestamp: visit.completed_at })))
    const responseMilestones = firstTimestampPerLot(data.responses
      .filter((response) => response.status === 'SUBMITTED')
      .map((response) => {
        const visit = visitById.get(response.visit_id)
        return { lotId: visit ? householdById.get(visit.household_id)?.lot_id || '' : '', timestamp: response.submitted_at }
      }))

    const lots = eligibleLots.length
    const eligibleHouseholdIds = new Set(data.households.filter((household) => lotIds.has(household.lot_id)).map((household) => household.id))
    const eligibleVisitIds = new Set(data.visits.filter((visit) => eligibleHouseholdIds.has(visit.household_id)).map((visit) => visit.id))
    const confirmed = confirmedLotIds.size
    const visited = visitedLotIds.size
    const submitted = submittedLotIds.size
    const forecasts: Forecast[] = [
      { key: 'households', label: 'Domicílios confirmados (estimativa de 1 por lote)', daysRemaining: lots ? daysToCompletion(householdMilestones, Math.max(lots - confirmed, 0)) : null },
      { key: 'visits', label: 'Lotes com visita concluída', daysRemaining: lots ? daysToCompletion(visitMilestones, Math.max(lots - visited, 0)) : null },
      { key: 'responses', label: 'Lotes com questionário enviado', daysRemaining: lots ? daysToCompletion(responseMilestones, Math.max(lots - submitted, 0)) : null },
    ]

    return {
      lots,
      territoryLots: data.lots.length,
      excludedLots: data.lots.length - eligibleLots.length,
      confirmed,
      visited,
      submitted,
      presumed: Math.max(lots - confirmed, 0),
      pending: Math.max(lots - visited, 0),
      withoutZone: data.lots.filter((lot) => !lot.zone_id).length,
      zones: data.zones.length,
      acs: data.acs.length,
      draftResponses: data.responses.filter((response) => response.status === 'DRAFT' && eligibleVisitIds.has(response.visit_id)).length,
      forecasts,
    }
  }, [data])

  const zoneStats = useMemo(() => data?.zones.map((zone) => {
    const territoryLots = data.lots.filter((lot) => lot.zone_id === zone.id)
    const lots = territoryLots.filter((lot) => !lot.indicator_exclusion_reason)
    const lotIds = new Set(lots.map((lot) => lot.id))
    const householdById = new Map(data.households.map((household) => [household.id, household]))
    const done = new Set(data.visits
      .filter((visit) => visit.status === 'COMPLETED')
      .map((visit) => householdById.get(visit.household_id)?.lot_id)
      .filter((lotId): lotId is string => Boolean(lotId && lotIds.has(lotId)))).size
    return { ...zone, lots: lots.length, territoryLots: territoryLots.length, excludedLots: territoryLots.length - lots.length, done, coverage: lots.length ? Math.round((done / lots.length) * 100) : 0 }
  }) || [], [data])

  const recent = useMemo(() => {
    if (!data) return []
    const householdNames = new Map(data.households.map((item) => [item.id, item.label]))
    const acsNames = new Map(data.acs.map((item) => [item.id, item.full_name]))
    return data.visits.slice(0, 5).map((visit) => ({
      ...visit,
      household: householdNames.get(visit.household_id) || 'Domicílio',
      acs: visit.acs_id ? acsNames.get(visit.acs_id) || 'Agente não informado' : 'Agente não informado',
    }))
  }, [data])

  const nextActions = useMemo<NextAction[]>(() => {
    if (!data) return []
    const visitsByHousehold = new Map<string, Visit[]>()
    for (const visit of data.visits) visitsByHousehold.set(visit.household_id, [...(visitsByHousehold.get(visit.household_id) || []), visit])
    const responseRows = data.responses
    function responseList(visitId: string) { return responseRows.filter((response) => response.visit_id === visitId) }
    const actions: NextAction[] = []
    for (const household of data.households) {
      const lot = data.lots.find((item) => item.id === household.lot_id)
      const zone = data.zones.find((item) => item.id === lot?.zone_id)
      const visits = (visitsByHousehold.get(household.id) || []).sort((a, b) => `${b.visit_date}-${b.created_at}`.localeCompare(`${a.visit_date}-${a.created_at}`))
      const latest = visits[0]
      const hasDraft = visits.some((visit) => responseList(visit.id).some((response) => response.status === 'DRAFT'))
      const address = [lot?.street_name, lot?.neighborhood_name, lot?.block_reference ? `Quadra ${lot.block_reference}` : null].filter(Boolean).join(' · ') || 'Endereço territorial não informado'
      const zoneLabel = zone?.name || 'Zona não definida'
      const lastAction = latest ? `${latest.status === 'NO_CONTACT' ? 'Tentativa sem contato' : latest.status === 'COMPLETED' ? 'Visita concluída' : 'Visita em andamento'} em ${fmtDate(latest.created_at)}` : 'Nenhuma visita registrada'
      if (hasDraft) actions.push({ id: `draft-${household.id}`, title: household.label || 'Domicílio sem identificação', detail: 'Há um questionário salvo e pronto para continuar.', address, zone: zoneLabel, lastAction, nextStep: 'Retomar e enviar o questionário', cta: 'Retomar questionário', filter: 'DRAFT', tone: 'pending' })
      else if (!latest || latest.status === 'NO_CONTACT') actions.push({ id: `visit-${household.id}`, title: household.label || 'Domicílio sem identificação', detail: latest?.status === 'NO_CONTACT' ? 'A última tentativa terminou sem contato.' : 'Ainda não há visita registrada neste domicílio.', address, zone: zoneLabel, lastAction, nextStep: latest?.status === 'NO_CONTACT' ? 'Fazer nova tentativa de contato' : 'Realizar a primeira visita', cta: latest?.status === 'NO_CONTACT' ? 'Tentar novamente' : 'Iniciar visita', filter: latest?.status === 'NO_CONTACT' ? 'NO_CONTACT' : 'NO_VISIT', tone: 'urgent' })
      else if (latest.status === 'COMPLETED' && !visits.some((visit) => responseList(visit.id).some((response) => response.status === 'SUBMITTED'))) actions.push({ id: `form-${household.id}`, title: household.label || 'Domicílio sem identificação', detail: 'A visita terminou, mas o questionário ainda não foi enviado.', address, zone: zoneLabel, lastAction, nextStep: 'Aplicar e enviar o questionário', cta: 'Aplicar questionário', filter: 'QUESTIONNAIRE', tone: 'pending' })
      if (actions.length >= 6) break
    }
    if (!actions.length && data.households.length) actions.push({ id: 'all-done', title: 'Nenhuma pendência de campo', detail: 'Os domicílios cadastrados não possuem uma próxima atividade identificada.', address: 'Território sob sua responsabilidade', zone: 'Todas as zonas', lastAction: 'Registros atualizados', nextStep: 'Continuar acompanhamento', cta: 'Ver meus domicílios', filter: 'ALL', tone: 'neutral' })
    return actions
  }, [data])

  const fieldSummary = useMemo(() => {
    if (!data) return { noContact: 0, visitPending: 0, questionnairePending: 0 }
    const visitsByHousehold = new Map<string, Visit[]>()
    data.visits.forEach((visit) => visitsByHousehold.set(visit.household_id, [...(visitsByHousehold.get(visit.household_id) || []), visit]))
    const noContact = data.households.filter((household) => visitsByHousehold.get(household.id)?.[0]?.status === 'NO_CONTACT').length
    const visitPending = data.households.filter((household) => !visitsByHousehold.get(household.id)?.length).length
    const questionnairePending = data.households.filter((household) => {
      const visits = visitsByHousehold.get(household.id) || []
      return visits.some((visit) => visit.status === 'COMPLETED') && !visits.some((visit) => data.responses.some((response) => response.visit_id === visit.id && response.status === 'SUBMITTED'))
    }).length
    return { noContact, visitPending, questionnairePending }
  }, [data])


  return (
    <section className="fleet-section fleet-page-section census-overview-page">
      {error && <div className="fleet-inline-error"><AlertCircle size={15} />{error}</div>}
      {loading ? (
        <div className="fleet-loading"><LoaderCircle className="spin" size={20} />Carregando painel…</div>
      ) : metrics && data ? role === 'manager' ? (
        <ManagerOverview data={data} metrics={metrics} zoneStats={zoneStats} recent={recent} focus={focus} onOpen={onOpen} />
      ) : (
        <>
          <section className="census-day-hero" aria-labelledby="censusDayTitle">
            <div><span className="fleet-kicker">ROTINA DO ACS</span><h2 id="censusDayTitle">Meu dia em campo</h2><p>Comece pela próxima atividade. O sistema mostra o endereço, a zona e o motivo — sem indicadores gerenciais.</p></div>
            <button type="button" className="census-day-continue" onClick={() => onOpen(nextActions[0]?.filter === 'QUESTIONNAIRE' || nextActions[0]?.filter === 'DRAFT' ? 'families' : 'families', nextActions[0]?.filter || 'ALL')}><ArrowRight size={17} />Continuar próxima atividade</button>
          </section>
          <div className="census-day-task-grid">
            <button type="button" className="census-day-task pending" onClick={() => onOpen('families', 'NO_CONTACT')}><span><AlertCircle size={19} /></span><strong>{fieldSummary.noContact.toLocaleString('pt-BR')}</strong><small>Sem contato</small><em>Nova tentativa necessária</em></button>
            <button type="button" className="census-day-task questionnaire" onClick={() => onOpen('families', 'NO_VISIT')}><span><MapPinned size={19} /></span><strong>{fieldSummary.visitPending.toLocaleString('pt-BR')}</strong><small>Visita pendente</small><em>Primeira visita ainda não registrada</em></button>
            <button type="button" className="census-day-task homes" onClick={() => onOpen('families', 'QUESTIONNAIRE')}><span><ClipboardCheck size={19} /></span><strong>{fieldSummary.questionnairePending.toLocaleString('pt-BR')}</strong><small>Questionário pendente</small><em>Visita concluída, envio pendente</em></button>
          </div>
          <section className="census-day-actions" aria-labelledby="censusNextActionsTitle">
            <div className="census-overview-title"><div><span className="fleet-kicker">PRÓXIMA ATIVIDADE</span><h3 id="censusNextActionsTitle">Comece por aqui</h3></div><ArrowRight size={19} /></div>
            <div className="census-day-action-list">
              {nextActions.length ? nextActions.map((action) => <button type="button" key={action.id} className={`census-day-action ${action.tone}`} onClick={() => onOpen('families', action.filter)}><span><strong>{action.title}</strong><small>{action.address} · {action.zone}</small><small>Última ação: {action.lastAction}</small><small>Próximo passo: {action.nextStep}</small></span><b>{action.cta}<ArrowRight size={15} /></b></button>) : <span className="census-day-action-empty">Nenhum domicílio cadastrado ainda. Abra Meus domicílios para iniciar.</span>}
            </div>
          </section>
          <section className="census-day-last-action" aria-label="Orientação da rotina"><strong>Como priorizar</strong><span>A lista é ordenada pela necessidade operacional: primeiro nova tentativa de contato, depois visita ainda não realizada e, por fim, questionário pendente. Isso é uma ordem de trabalho, não uma prioridade clínica.</span></section>
        </>
      ) : null}
    </section>
  )
}

function ManagerOverview({ data, metrics, zoneStats, recent, focus = 'overview', onOpen }: { data: OverviewData; metrics: ManagerMetrics; zoneStats: ManagerZoneStat[]; recent: (Visit & { household: string; acs: string })[]; focus?: 'overview' | 'attention'; onOpen: (view: 'territory' | 'families' | 'dwg' | 'zones' | 'forms', filter?: OperationalFilter, managerStatus?: 'all' | 'no_activity' | 'no_visit' | 'in_progress' | 'questionnaire_pending' | 'draft' | 'no_contact' | 'answered') => void }) {
  const coverage = metrics.lots ? Math.round((metrics.visited / metrics.lots) * 100) : 0
  const attention = [
    metrics.pending > 0 ? { id: 'pending', title: `${metrics.pending.toLocaleString('pt-BR')} visitas pendentes`, detail: 'Existem lotes elegíveis sem visita concluída.', action: 'Ver visitas', onClick: () => onOpen('territory', 'ALL', 'no_visit'), tone: 'urgent' } : null,
    metrics.draftResponses > 0 ? { id: 'drafts', title: `${metrics.draftResponses.toLocaleString('pt-BR')} questionários em rascunho`, detail: 'Respostas iniciadas ainda precisam ser concluídas.', action: 'Revisar questionários', onClick: () => onOpen('territory', 'ALL', 'draft'), tone: 'pending' } : null,
    metrics.withoutZone > 0 ? { id: 'zones', title: `${metrics.withoutZone.toLocaleString('pt-BR')} lotes sem zona`, detail: 'O território precisa ser organizado para melhorar o acompanhamento.', action: 'Organizar zonas', onClick: () => onOpen('zones'), tone: 'pending' } : null,
    ...zoneStats.filter((zone) => zone.lots > 0 && zone.coverage < 50).slice(0, 2).map((zone) => ({ id: zone.id, title: `${zone.name} com cobertura de ${zone.coverage}%`, detail: `${zone.done} de ${zone.lots} lotes com visita concluída.`, action: 'Abrir território', onClick: () => onOpen('territory'), tone: 'urgent' })),
  ].filter(Boolean).slice(0, 5) as { id: string; title: string; detail: string; action: string; onClick: () => void; tone: string }[]
  const teamRows = data.acs.map((acs) => {
    const visits = data.visits.filter((visit) => visit.acs_id === acs.id)
    const completed = visits.filter((visit) => visit.status === 'COMPLETED').length
    const latest = visits.sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    return { ...acs, completed, latest: latest ? fmtDate(latest.created_at) : 'Sem atividade registrada', active: Boolean(latest && Date.now() - new Date(latest.created_at).getTime() < 7 * DAY_MS) }
  }).sort((a, b) => b.completed - a.completed)

  if (focus === 'attention') return <section className="manager-overview-page" aria-label="Atenção necessária no território">
    <section className="manager-hero"><div><span>MONITORAMENTO GERENCIAL</span><h2>Atenção necessária</h2><p>Esta lista explica onde o trabalho precisa de acompanhamento. Cada ação abre o território para conferência, sem permitir alterações operacionais.</p></div><AlertCircle size={40} aria-hidden="true" /></section>
    <section className="manager-panel manager-attention manager-attention-focus"><header><div><span className="manager-kicker">PRIORIZAÇÃO DO DIA</span><h3>O que precisa de acompanhamento agora</h3></div><span className={`manager-health-badge${attention.length ? ' attention' : ''}`}>{attention.length ? `${attention.length} ponto${attention.length === 1 ? '' : 's'}` : 'Tudo em ordem'}</span></header>{attention.length ? <div className="manager-attention-list">{attention.map((item) => <button type="button" className={`manager-attention-row ${item.tone}`} key={item.id} onClick={item.onClick}><span><strong>{item.title}</strong><small>{item.detail}</small></span><b>{item.action}<ArrowRight size={14} /></b></button>)}</div> : <div className="manager-clear-state"><CheckCircle2 size={22} /><strong>Nenhuma prioridade crítica identificada</strong><span>Os registros carregados não apresentam pendências prioritárias.</span></div>}</section>
    <div className="manager-secondary-grid"><section className="manager-panel manager-zones-panel"><header><div><span className="manager-kicker">COMO LER</span><h3>Significado das cores</h3></div></header><div className="manager-attention-legend"><p><i className="gray" />Cinza: lote ainda não iniciado.</p><p><i className="orange" />Laranja: existe pendência ou etapa incompleta.</p><p><i className="green" />Verde: domicílio e questionário principal concluídos.</p><p><i className="red" />Vermelho: houve tentativa, mas não houve contato.</p></div></section><section className="manager-panel manager-zones-panel"><header><div><span className="manager-kicker">PRÓXIMA AÇÃO</span><h3>Conferir no mapa</h3></div></header><p className="manager-attention-explanation">Use o mapa para filtrar por zona, ACS e situação. Ao selecionar um lote, o dossiê mostra a etapa alcançada, a última visita e o questionário relacionado.</p><button type="button" className="manager-text-button" onClick={() => onOpen('territory')}>Abrir monitoramento territorial <ArrowRight size={14} /></button></section></div>
  </section>

  return <section className="manager-overview-page" aria-label="Monitoramento gerencial da Saúde da Família">
    <section className="manager-hero"><div><span>MONITORAMENTO DA EQUIPE</span><h2>Visão gerencial</h2><p>Veja onde a equipe precisa de atenção e acompanhe o avanço do território sem entrar em cada registro.</p></div><Gauge size={40} aria-hidden="true" /></section>
    <div className="manager-metric-grid">
      <article className="manager-metric"><span className="manager-metric-icon blue"><Gauge size={18} /></span><div><strong>{coverage}%</strong><small>Cobertura com visita concluída</small></div></article>
      <article className={`manager-metric${metrics.pending ? ' warning' : ''}`}><span className="manager-metric-icon amber"><UsersRound size={18} /></span><div><strong>{metrics.pending.toLocaleString('pt-BR')}</strong><small>Visitas pendentes</small></div></article>
      <article className={`manager-metric${metrics.draftResponses ? ' warning' : ''}`}><span className="manager-metric-icon violet"><ClipboardCheck size={18} /></span><div><strong>{metrics.draftResponses.toLocaleString('pt-BR')}</strong><small>Questionários em rascunho</small></div></article>
      <article className={`manager-metric${metrics.withoutZone ? ' warning' : ''}`}><span className="manager-metric-icon slate"><MapPinned size={18} /></span><div><strong>{metrics.withoutZone.toLocaleString('pt-BR')}</strong><small>Lotes sem zona</small></div></article>
    </div>
    <div className="manager-primary-grid">
      <section className="manager-panel manager-attention"><header><div><span className="manager-kicker">PRIORIDADE DE GESTÃO</span><h3>Pontos que exigem atenção</h3></div><span className={`manager-health-badge${attention.length ? ' attention' : ''}`}>{attention.length ? `${attention.length} ponto${attention.length === 1 ? '' : 's'}` : 'Tudo em ordem'}</span></header>{attention.length ? <div className="manager-attention-list">{attention.map((item) => <button type="button" className={`manager-attention-row ${item.tone}`} key={item.id} onClick={item.onClick}><span><strong>{item.title}</strong><small>{item.detail}</small></span><b>{item.action}<ArrowRight size={14} /></b></button>)}</div> : <div className="manager-clear-state"><CheckCircle2 size={22} /><strong>Nenhuma prioridade crítica identificada</strong><span>A operação não apresenta pendências prioritárias nos dados carregados.</span></div>}</section>
      <section className="manager-panel manager-quick-panel"><header><div><span className="manager-kicker">ACESSO RÁPIDO</span><h3>Ir direto para</h3></div></header><button type="button" onClick={() => onOpen('territory')}><MapPinned size={17} /><span><strong>Território</strong><small>Ver cobertura por zona</small></span><ArrowRight size={15} /></button><button type="button" onClick={() => onOpen('territory')}><UsersRound size={17} /><span><strong>Visitas e domicílios</strong><small>Acompanhar atividade da equipe</small></span><ArrowRight size={15} /></button><button type="button" onClick={() => onOpen('forms')}><ClipboardCheck size={17} /><span><strong>Questionários</strong><small>Revisar respostas e pendências</small></span><ArrowRight size={15} /></button></section>
    </div>
    <div className="manager-secondary-grid">
      <section className="manager-panel manager-team-panel"><header><div><span className="manager-kicker">EQUIPE</span><h3>Atividade dos ACS</h3></div><button type="button" onClick={() => onOpen('zones')}>Gerenciar equipe <ArrowRight size={14} /></button></header>{teamRows.length ? <div className="manager-table-wrap"><table className="manager-table"><thead><tr><th>ACS</th><th>Visitas concluídas</th><th>Última atividade</th><th>Situação</th></tr></thead><tbody>{teamRows.slice(0, 8).map((row) => <tr key={row.id}><td><strong>{row.full_name}</strong></td><td>{row.completed}</td><td>{row.latest}</td><td><span className={`manager-table-status ${row.active ? 'active' : 'quiet'}`}>{row.active ? 'Ativo' : 'Sem atividade recente'}</span></td></tr>)}</tbody></table></div> : <div className="manager-empty">Nenhum ACS ativo cadastrado.</div>}</section>
      <section className="manager-panel manager-zones-panel"><header><div><span className="manager-kicker">TERRITÓRIO</span><h3>Situação por zona</h3></div><button type="button" onClick={() => onOpen('territory')}>Abrir mapa <ArrowRight size={14} /></button></header>{zoneStats.length ? <div className="manager-zone-list">{zoneStats.slice(0, 6).map((zone) => <button type="button" key={zone.id} onClick={() => onOpen('territory')}><span><strong>{zone.name}</strong><small>{zone.done} de {zone.lots} lotes visitados</small></span><b>{zone.coverage}%</b><i><em style={{ width: `${zone.coverage}%` }} /></i></button>)}</div> : <div className="manager-empty">Nenhuma zona ativa cadastrada.</div>}</section>
    </div>
    <section className="manager-recent"><span className="manager-kicker">ATIVIDADE RECENTE</span><strong>{recent.length ? `${recent.length} registros recentes carregados` : 'Nenhuma atividade recente registrada'}</strong><button type="button" onClick={() => onOpen('territory')}>Ver histórico de visitas <ArrowRight size={14} /></button></section>
  </section>
}
