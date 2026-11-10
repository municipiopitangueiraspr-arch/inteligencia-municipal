import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertCircle, ArrowLeft, CalendarClock, CalendarDays, Check, CheckCircle2, Clock3, HeartPulse, LoaderCircle, LogOut, MapPinned, Minus, Plus, RefreshCw, RotateCcw, Stethoscope, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { getMapLotCode } from './territory/lotDisplay'
import { useCensusDialogFocus } from './territory/useCensusDialogFocus'
import './MedicalVisitsModule.css'

type Point = [number, number]
type Bbox = { minX: number; minY: number; maxX: number; maxY: number }
type Lot = { id: string; source_handle: string; label: string | null; geometry: Point[]; is_valid: boolean; zone_number: number | null; zone_id: string | null }
type Zone = { id: string; name: string; color: string; active: boolean }
type VisitStatus = 'COMPLETED' | 'NO_CONTACT' | 'CANCELLED'
type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | null
type MedicalVisit = { id: string; lot_id: string; visit_date: string; status: VisitStatus; follow_up_date: string | null; follow_up_status: FollowUpStatus; follow_up_completed_at: string | null; created_at: string }
type MapImport = { id: string; bbox: Bbox | null }
type PendingAction = { kind: 'create'; lot: Lot; visitDate: string; status: VisitStatus; followUpDate: string } | { kind: 'follow-up'; visit: MedicalVisit; status: 'COMPLETED' | 'CANCELLED' }
type ReturnFilter = 'ALL' | 'UPCOMING' | 'OVERDUE'
type PageResult<T> = { data: T[] | null; error: { message: string } | null }

const PAGE_SIZE = 1000
const statusLabels: Record<VisitStatus, string> = { COMPLETED: 'Realizada', NO_CONTACT: 'Sem contato', CANCELLED: 'Cancelada' }
const statusColors: Record<VisitStatus, string> = { COMPLETED: '#2f8b6f', NO_CONTACT: '#d79a32', CANCELLED: '#899a9e' }

async function fetchPages<T>(load: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await load(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    const page = data || []
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

function dateToday() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: string) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return 'Sem retorno agendado'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date)
}

function visitOrder(a: MedicalVisit, b: MedicalVisit) {
  return `${b.visit_date}-${b.created_at}`.localeCompare(`${a.visit_date}-${a.created_at}`)
}

export function MedicalVisitsModule({ userEmail, onBack, onLogout }: { userEmail: string; onBack: () => void; onLogout: () => void }) {
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mapImport, setMapImport] = useState<MapImport | null>(null)
  const [lots, setLots] = useState<Lot[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [visits, setVisits] = useState<MedicalVisit[]>([])
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null)
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [visitDate, setVisitDate] = useState(dateToday())
  const [visitStatus, setVisitStatus] = useState<VisitStatus>('COMPLETED')
  const [followUpDate, setFollowUpDate] = useState('')
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [returnFilter, setReturnFilter] = useState<ReturnFilter>('ALL')
  const [zoom, setZoom] = useState(1)
  const confirmationRef = useCensusDialogFocus(Boolean(pendingAction), () => setPendingAction(null))

  const load = useCallback(async () => {
    if (!supabase) { setError('O serviço de mapas da Saúde da Família/ACS não está configurado.'); setLoading(false); return }
    const db = supabase
    setLoading(true); setError(''); setNotice(''); setAuthorized(false); setLots([]); setVisits([]); setSelectedLotId(null); setMapImport(null)
    try {
      const { data: isAdmin, error: authError } = await db.rpc('municipal_governance_is_admin')
      if (authError) throw new Error('Não foi possível confirmar sua autorização administrativa.')
      if (isAdmin !== true) { setAuthorized(false); setLoading(false); return }
      setAuthorized(true)
      const mapResult = await db.from('census_territory_map_imports').select('id,bbox').order('division_saved_at', { ascending: false }).order('updated_at', { ascending: false }).limit(1)
      if (mapResult.error) throw new Error(`Não foi possível abrir o mapa territorial: ${mapResult.error.message}`)
      const current = (mapResult.data?.[0] || null) as MapImport | null
      setMapImport(current)
      if (!current) { setLots([]); setZones([]); setVisits([]); return }
      const [lotRows, zoneResult, visitRows] = await Promise.all([
        fetchPages<Lot>((from, to) => db.from('census_territory_map_lots').select('id,source_handle,label,geometry,is_valid,zone_number,zone_id').eq('import_id', current.id).eq('is_valid', true).order('source_handle').order('id').range(from, to)),
        db.from('census_zones').select('id,name,color,active').eq('active', true).order('created_at').limit(500),
        fetchPages<MedicalVisit>((from, to) => db.from('census_medical_visits').select('id,lot_id,visit_date,status,follow_up_date,follow_up_status,follow_up_completed_at,created_at').order('visit_date', { ascending: false }).order('created_at', { ascending: false }).range(from, to)),
      ])
      if (zoneResult.error) throw new Error(`Não foi possível carregar as zonas: ${zoneResult.error.message}`)
      setLots(lotRows); setZones((zoneResult.data || []) as Zone[]); setVisits(visitRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível carregar as visitas médicas.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const today = dateToday()
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) || null
  const zoneById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones])
  const visitsByLot = useMemo(() => {
    const result = new Map<string, MedicalVisit[]>()
    for (const visit of visits) result.set(visit.lot_id, [...(result.get(visit.lot_id) || []), visit])
    for (const list of result.values()) list.sort(visitOrder)
    return result
  }, [visits])
  const latestByLot = useMemo(() => new Map([...visitsByLot].map(([lotId, list]) => [lotId, list[0]])), [visitsByLot])
  const openReturns = useMemo(() => visits.filter((visit) => visit.follow_up_status === 'PENDING').sort((a, b) => (a.follow_up_date || '').localeCompare(b.follow_up_date || '') || a.created_at.localeCompare(b.created_at)), [visits])
  const nextReturnByLot = useMemo(() => {
    const result = new Map<string, MedicalVisit>()
    for (const visit of openReturns) if (!result.has(visit.lot_id)) result.set(visit.lot_id, visit)
    return result
  }, [openReturns])
  const returnRows = useMemo(() => openReturns.filter((visit) => returnFilter === 'ALL' || (returnFilter === 'OVERDUE' ? (visit.follow_up_date || '') < today : (visit.follow_up_date || '') >= today)), [openReturns, returnFilter, today])
  const overdueCount = openReturns.filter((visit) => (visit.follow_up_date || '') < today).length
  const visitedLots = new Set(visits.filter((visit) => visit.status !== 'CANCELLED').map((visit) => visit.lot_id)).size
  const bbox = useMemo<Bbox | null>(() => {
    if (mapImport?.bbox) return mapImport.bbox
    if (!lots.length) return null
    const points = lots.flatMap((lot) => lot.geometry)
    return { minX: Math.min(...points.map((point) => point[0])), minY: Math.min(...points.map((point) => point[1])), maxX: Math.max(...points.map((point) => point[0])), maxY: Math.max(...points.map((point) => point[1])) }
  }, [lots, mapImport])
  const toSvg = (point: Point) => {
    if (!bbox) return '0,0'
    const width = Math.max(bbox.maxX - bbox.minX, 1)
    const height = Math.max(bbox.maxY - bbox.minY, 1)
    return `${((point[0] - bbox.minX) / width) * 1000},${((bbox.maxY - point[1]) / height) * 1000}`
  }
  const lotCode = (lot: Lot) => getMapLotCode(lot.label, lot.source_handle, lots.findIndex((item) => item.id === lot.id) + 1)
  const mapColor = (lotId: string) => {
    const openReturn = nextReturnByLot.get(lotId)
    if (openReturn) return (openReturn.follow_up_date || '') < today ? '#c7584e' : '#8570b8'
    const latest = latestByLot.get(lotId)
    return latest ? statusColors[latest.status] : '#c5d4d4'
  }
  const mapLabel = (lotId: string) => {
    const openReturn = nextReturnByLot.get(lotId)
    if (openReturn) return (openReturn.follow_up_date || '') < today ? 'Retorno atrasado' : 'Retorno agendado'
    const latest = latestByLot.get(lotId)
    return latest ? statusLabels[latest.status] : 'Sem visita médica'
  }

  function requestVisit() {
    if (!selectedLot || !visitDate || (visitStatus === 'CANCELLED' && followUpDate) || (followUpDate && followUpDate < visitDate)) return
    setPendingAction({ kind: 'create', lot: selectedLot, visitDate, status: visitStatus, followUpDate })
  }

  async function confirmAction() {
    const action = pendingAction
    setPendingAction(null)
    if (!action || !supabase) return
    setSaving(true); setError(''); setNotice('')
    try {
      if (action.kind === 'create') {
        const result = await supabase.from('census_medical_visits').insert({ lot_id: action.lot.id, visit_date: action.visitDate, status: action.status, follow_up_date: action.followUpDate || null, follow_up_status: action.followUpDate ? 'PENDING' : null }).select('id').single()
        if (result.error) throw new Error(result.error.message)
        setShowVisitForm(false); setVisitDate(today); setVisitStatus('COMPLETED'); setFollowUpDate('')
        setNotice('Visita registrada. O retorno, se agendado, já aparece no acompanhamento.')
      } else {
        const result = await supabase.from('census_medical_visits').update({ follow_up_status: action.status }).eq('id', action.visit.id).eq('follow_up_status', 'PENDING').select('id').single()
        if (result.error) throw new Error(result.error.message)
        setNotice(action.status === 'COMPLETED' ? 'Retorno marcado como realizado.' : 'Retorno cancelado.')
      }
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível gravar a alteração.')
    } finally { setSaving(false) }
  }

  const confirmation = pendingAction?.kind === 'create'
    ? { title: 'Registrar esta visita?', description: `Será registrada para o lote ${lotCode(pendingAction.lot)} em ${formatDate(pendingAction.visitDate)}. Nenhum dado clínico será coletado.`, confirm: 'Registrar visita' }
    : pendingAction?.kind === 'follow-up'
      ? { title: pendingAction.status === 'COMPLETED' ? 'Marcar retorno como realizado?' : 'Cancelar este retorno?', description: `Lote ${lotCode(lots.find((lot) => lot.id === pendingAction.visit.lot_id) || { id: '', label: pendingAction.visit.lot_id, source_handle: '', geometry: [], is_valid: true, zone_number: null, zone_id: null })} · data prevista ${formatDate(pendingAction.visit.follow_up_date)}.`, confirm: pendingAction.status === 'COMPLETED' ? 'Marcar realizado' : 'Cancelar retorno' }
      : null

  if (!authorized) return <MedicalModuleShell userEmail={userEmail} onBack={onBack} onLogout={onLogout}>{loading ? <div className="medical-access-denied" role="status"><LoaderCircle className="spin" size={25} /><h1>Verificando autorização</h1><p>O mapa e a agenda só serão carregados após confirmar o acesso administrativo.</p></div> : <div className="medical-access-denied"><span><HeartPulse size={24} /></span><h1>Acesso reservado</h1><p>{error || 'O módulo de Visitas Médicas está restrito a administradores ativos nesta etapa de teste. O acesso da equipe médica será definido antes de ampliar a disponibilidade.'}</p><button type="button" className="medical-button secondary" onClick={onBack}><ArrowLeft size={16} />Voltar ao hall</button></div>}</MedicalModuleShell>

  return <MedicalModuleShell userEmail={userEmail} onBack={onBack} onLogout={onLogout}>
    <section className="medical-page" aria-busy={loading || saving}>
      <div className="medical-page-heading"><div><span className="medical-kicker"><Stethoscope size={14} /> SECRETARIA DE SAÚDE</span><h1>Visitas Médicas</h1><p>Acompanhe visitas e retornos no mapa territorial.</p></div><button type="button" className="medical-button secondary" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15} />Atualizar</button></div>
      <div className="medical-privacy-note"><HeartPulse size={16} /><span><strong>Área restrita para administradores.</strong> Este painel registra apenas lote, data e situação operacional. Não insira nomes, diagnósticos ou informações clínicas.</span></div>
      {error && <div className="medical-alert error" role="alert"><AlertCircle size={16} />{error}</div>}
      {notice && <div className="medical-alert success" role="status"><CheckCircle2 size={16} />{notice}</div>}
      <div className="medical-metrics"><article><span className="metric-icon visited"><CheckCircle2 size={18} /></span><div><strong>{visitedLots.toLocaleString('pt-BR')}</strong><small>Lotes com visita registrada</small></div></article><article><span className="metric-icon pending"><MapPinned size={18} /></span><div><strong>{Math.max(0, lots.length - visitedLots).toLocaleString('pt-BR')}</strong><small>Lotes sem visita médica</small></div></article><article><span className="metric-icon returns"><CalendarClock size={18} /></span><div><strong>{openReturns.length.toLocaleString('pt-BR')}</strong><small>Retornos pendentes</small></div></article><article><span className="metric-icon overdue"><Clock3 size={18} /></span><div><strong>{overdueCount.toLocaleString('pt-BR')}</strong><small>Retornos atrasados</small></div></article></div>
      <div className={`medical-workspace${selectedLot ? ' has-selection' : ''}`}>
        <section className="medical-map-card" aria-label="Mapa de visitas médicas"><header><span><MapPinned size={16} /> Selecione um lote para consultar ou registrar uma visita</span><div><button type="button" aria-label="Aumentar zoom" onClick={() => setZoom((value) => Math.min(16, value * 1.2))} disabled={!lots.length}><Plus size={16} /></button><b>{Math.round(zoom * 100)}%</b><button type="button" aria-label="Diminuir zoom" onClick={() => setZoom((value) => Math.max(.65, value / 1.2))} disabled={!lots.length}><Minus size={16} /></button><button type="button" aria-label="Restaurar zoom" onClick={() => setZoom(1)}><RotateCcw size={15} /></button></div></header>
          <div className="medical-map-viewport">{loading ? <div className="medical-map-empty"><LoaderCircle className="spin" size={23} />Carregando mapa e visitas…</div> : error && !lots.length ? <div className="medical-map-empty error"><AlertCircle size={22} /><strong>Não foi possível abrir o mapa</strong><span>{error}</span></div> : !mapImport || lots.length === 0 ? <div className="medical-map-empty"><MapPinned size={24} /><strong>Mapa territorial indisponível</strong><span>Prepare e publique o mapa da Saúde da Família/ACS antes de registrar visitas.</span></div> : <svg className="medical-map-svg" viewBox="0 0 1000 1000" style={{ transform: `scale(${zoom})` }} role="list" aria-label="Mapa de lotes com situação das visitas médicas">{lots.map((lot) => { const code = lotCode(lot); const zone = lot.zone_id ? zoneById.get(lot.zone_id) : null; return <polygon key={lot.id} points={lot.geometry.map(toSvg).join(' ')} fill={mapColor(lot.id)} fillOpacity=".86" stroke={selectedLotId === lot.id ? '#174f5a' : '#fff'} strokeWidth={selectedLotId === lot.id ? 2.2 : 1.15} vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-label={`${code}, ${zone?.name || 'sem zona'}, ${mapLabel(lot.id)}`} className={selectedLotId === lot.id ? 'selected' : ''} onClick={() => { setSelectedLotId(lot.id); setShowVisitForm(false) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedLotId(lot.id); setShowVisitForm(false) } }}><title>{`${code} · ${zone?.name || 'Sem zona'} · ${mapLabel(lot.id)}`}</title></polygon> })}</svg>}
            {!loading && lots.length > 0 && <div className="medical-map-legend"><span><i style={{ background: '#c5d4d4' }} />Sem visita</span><span><i style={{ background: '#2f8b6f' }} />Realizada</span><span><i style={{ background: '#d79a32' }} />Sem contato</span><span><i style={{ background: '#8570b8' }} />Retorno agendado</span><span><i style={{ background: '#c7584e' }} />Retorno atrasado</span></div>}
          </div>
        </section>
        {selectedLot && <aside className="medical-lot-panel"><header><div><span className="medical-kicker">LOTE SELECIONADO</span><h2>{lotCode(selectedLot)}</h2><span className="medical-zone"><i style={{ background: selectedLot.zone_id ? zoneById.get(selectedLot.zone_id)?.color || '#c5d4d4' : '#c5d4d4' }} />{selectedLot.zone_id ? zoneById.get(selectedLot.zone_id)?.name || 'Zona não informada' : 'Sem zona'}</span></div><button type="button" className="medical-icon-button" aria-label="Fechar detalhes do lote" onClick={() => { setSelectedLotId(null); setShowVisitForm(false) }}><X size={18} /></button></header>
          <div className="medical-lot-scroll"><div className="medical-current-status"><span className="medical-status-dot" style={{ background: mapColor(selectedLot.id) }} /><div><small>Situação no mapa</small><strong>{mapLabel(selectedLot.id)}</strong></div></div>
            {!showVisitForm ? <button type="button" className="medical-button primary wide" onClick={() => { setVisitDate(today); setVisitStatus('COMPLETED'); setFollowUpDate(''); setShowVisitForm(true) }}><CalendarDays size={16} />Registrar visita</button> : <form className="medical-visit-form" onSubmit={(event) => { event.preventDefault(); requestVisit() }}><strong>Nova visita médica</strong><label>Data da visita<input type="date" value={visitDate} max={today} required onChange={(event) => setVisitDate(event.target.value)} /></label><label>Situação<select value={visitStatus} onChange={(event) => { const status = event.target.value as VisitStatus; setVisitStatus(status); if (status === 'CANCELLED') setFollowUpDate('') }}><option value="COMPLETED">Realizada</option><option value="NO_CONTACT">Sem contato</option><option value="CANCELLED">Cancelada</option></select></label><label>Data de retorno <span>(opcional)</span><input type="date" value={followUpDate} min={visitDate || today} disabled={visitStatus === 'CANCELLED'} onChange={(event) => setFollowUpDate(event.target.value)} /></label><p>Use somente para controle operacional de agenda. Não registre dados clínicos ou de identificação pessoal.</p><div><button type="button" className="medical-button secondary" onClick={() => setShowVisitForm(false)}>Voltar</button><button type="submit" className="medical-button primary" disabled={!visitDate || (visitStatus === 'CANCELLED' && Boolean(followUpDate)) || Boolean(followUpDate && followUpDate < visitDate)}><Check size={15} />Continuar</button></div></form>}
            <section className="medical-history"><h3><Clock3 size={15} />Histórico neste lote <span>{(visitsByLot.get(selectedLot.id) || []).length}</span></h3>{(visitsByLot.get(selectedLot.id) || []).length === 0 ? <p className="medical-empty-history">Ainda não há visitas médicas registradas neste lote.</p> : (visitsByLot.get(selectedLot.id) || []).map((visit) => <article key={visit.id} className="medical-history-row"><div><strong>{formatDate(visit.visit_date)}</strong><span className={`medical-pill ${visit.status.toLowerCase()}`}>{statusLabels[visit.status]}</span></div>{visit.follow_up_date && <p>Retorno: {formatDate(visit.follow_up_date)} · {visit.follow_up_status === 'PENDING' ? (visit.follow_up_date < today ? 'Atrasado' : 'Pendente') : visit.follow_up_status === 'COMPLETED' ? 'Realizado' : 'Cancelado'}</p>}</article>)}</section>
          </div>
        </aside>}
      </div>
      <section className="medical-return-section"><header><div><span className="medical-kicker"><CalendarClock size={14} /> ACOMPANHAMENTO</span><h2>Retornos médicos</h2><p>Agenda de retornos pendentes, separada do histórico de visitas dos ACS.</p></div><div className="medical-return-filters" role="group" aria-label="Filtrar retornos">{(['ALL', 'UPCOMING', 'OVERDUE'] as ReturnFilter[]).map((filter) => <button type="button" key={filter} className={returnFilter === filter ? 'active' : ''} aria-pressed={returnFilter === filter} onClick={() => setReturnFilter(filter)}>{filter === 'ALL' ? `Todos (${openReturns.length})` : filter === 'UPCOMING' ? 'A vencer' : `Atrasados (${overdueCount})`}</button>)}</div></header>
        {loading ? <div className="medical-return-empty"><LoaderCircle className="spin" size={18} />Carregando retornos…</div> : returnRows.length === 0 ? <div className="medical-return-empty"><CalendarClock size={21} /><strong>{returnFilter === 'OVERDUE' ? 'Nenhum retorno atrasado' : 'Nenhum retorno pendente nesta lista'}</strong><span>Quando uma visita tiver data de retorno, ela aparecerá aqui.</span></div> : <div className="medical-return-list">{returnRows.map((visit) => { const lot = lots.find((item) => item.id === visit.lot_id); const overdue = (visit.follow_up_date || '') < today; return <article className={`medical-return-row${overdue ? ' overdue' : ''}`} key={visit.id}><span className="medical-return-icon"><CalendarClock size={18} /></span><div className="medical-return-info"><strong>{lot ? lotCode(lot) : 'Lote não disponível'}</strong><span>{overdue ? 'Retorno atrasado' : 'Retorno agendado'} · visita de {formatDate(visit.visit_date)}</span></div><time dateTime={visit.follow_up_date || undefined}>{formatDate(visit.follow_up_date)}</time><button type="button" className="medical-button primary" onClick={() => setPendingAction({ kind: 'follow-up', visit, status: 'COMPLETED' })} disabled={saving}><Check size={15} />Realizado</button><button type="button" className="medical-button text" onClick={() => setPendingAction({ kind: 'follow-up', visit, status: 'CANCELLED' })} disabled={saving}>Cancelar</button></article> })}</div>}
      </section>
    </section>
    {pendingAction && confirmation && <div className="medical-confirm-backdrop"><section ref={confirmationRef} tabIndex={-1} className="medical-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="medicalConfirmTitle" aria-describedby="medicalConfirmDescription"><span className="medical-confirm-icon"><AlertCircle size={21} /></span><div><h2 id="medicalConfirmTitle">{confirmation.title}</h2><p id="medicalConfirmDescription">{confirmation.description}</p></div><footer><button type="button" className="medical-button secondary" onClick={() => setPendingAction(null)}>Voltar</button><button type="button" className="medical-button primary" onClick={() => void confirmAction()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{confirmation.confirm}</button></footer></section></div>}
  </MedicalModuleShell>
}

function MedicalModuleShell({ children, userEmail, onBack, onLogout }: { children: ReactNode; userEmail: string; onBack: () => void; onLogout: () => void }) {
  return <div className="medical-module-shell"><header className="medical-module-header"><div className="medical-header-brand"><span><Stethoscope size={20} /></span><strong>Visitas Médicas</strong><small>Secretaria de Saúde</small></div><div className="medical-header-actions"><span className="medical-user-email">{userEmail}</span><button type="button" className="medical-button secondary" onClick={onBack}><ArrowLeft size={15} />Hall</button><button type="button" className="medical-button secondary" onClick={onLogout}><LogOut size={15} />Sair</button></div></header><main className="medical-module-main">{children}</main></div>
}
