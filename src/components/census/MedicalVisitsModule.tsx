import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertCircle, ArrowLeft, CalendarClock, CalendarDays, Check, CheckCircle2, ClipboardList, Clock3, HeartPulse, LayoutDashboard, LoaderCircle, LogOut, MapPinned, Menu, Minus, Plus, RefreshCw, RotateCcw, Search, Stethoscope, X } from 'lucide-react'
import type { FormEvent } from 'react'
import { supabase } from '../../lib/supabase'
import { getMapLotCode } from './territory/lotDisplay'
import { useCensusDialogFocus } from './territory/useCensusDialogFocus'
import '../FleetModule.css'
import './CensusModule.css'
import './MedicalVisitsModule.css'

type Point = [number, number]
type Bbox = { minX: number; minY: number; maxX: number; maxY: number }
type Lot = { id: string; source_handle: string; label: string | null; geometry: Point[]; is_valid: boolean; zone_number: number | null; zone_id: string | null }
type Zone = { id: string; name: string; color: string; active: boolean }
type VisitStatus = 'COMPLETED' | 'NO_CONTACT' | 'CANCELLED'
type FollowUpStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED' | null
type PriorityStatus = 'PENDING' | 'VISITED' | 'CANCELLED'
type MedicalVisit = { id: string; lot_id: string; visit_date: string; status: VisitStatus; follow_up_date: string | null; follow_up_status: FollowUpStatus; follow_up_completed_at: string | null; created_at: string }
type LotPriority = { id: string; lot_id: string; priority_date: string; status: PriorityStatus; created_at: string }
type MapImport = { id: string; bbox: Bbox | null }
type MedicalSection = 'overview' | 'visits' | 'returns' | 'priorities'
type ReturnFilter = 'ALL' | 'UPCOMING' | 'OVERDUE'
type PriorityFilter = 'ALL' | PriorityStatus
type PageResult<T> = { data: T[] | null; error: { message: string } | null }
type PendingAction =
  | { kind: 'create'; lot: Lot; visitDate: string; status: VisitStatus; followUpDate: string }
  | { kind: 'follow-up'; visit: MedicalVisit; status: 'COMPLETED' | 'CANCELLED' }
  | { kind: 'reschedule'; visit: MedicalVisit; date: string }
  | { kind: 'priority'; priority: LotPriority; status: PriorityStatus }

const PAGE_SIZE = 1000
const MAP_COLORS = { never: '#617b80', noContact: '#b74b3e', cancelled: '#87989a', visited: '#2d8a70', return: '#337bb3' }
const sectionItems: { id: MedicalSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'visits', label: 'Visitas médicas', icon: MapPinned },
  { id: 'returns', label: 'Acompanhamento de retornos', icon: CalendarClock },
  { id: 'priorities', label: 'Lotes indicados', icon: ClipboardList },
]
const visitLabels: Record<VisitStatus, string> = { COMPLETED: 'Realizada', NO_CONTACT: 'Sem contato', CANCELLED: 'Cancelada' }
const priorityLabels: Record<PriorityStatus, string> = { PENDING: 'Pendente', VISITED: 'Visitado', CANCELLED: 'Cancelada' }

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
  if (!value) return 'Não informada'
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date)
}

function visitOrder(a: MedicalVisit, b: MedicalVisit) {
  return `${b.visit_date}-${b.created_at}`.localeCompare(`${a.visit_date}-${a.created_at}`)
}

export function MedicalVisitsModule({ userEmail, onBack, onLogout }: { userEmail?: string; onBack: () => void; onLogout: () => void }) {
  const [section, setSection] = useState<MedicalSection>('overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [profile, setProfile] = useState({ name: userEmail || 'Usuário autenticado' })
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mapImport, setMapImport] = useState<MapImport | null>(null)
  const [lots, setLots] = useState<Lot[]>([])
  const [zones, setZones] = useState<Zone[]>([])
  const [visits, setVisits] = useState<MedicalVisit[]>([])
  const [priorities, setPriorities] = useState<LotPriority[]>([])
  const [selectedLotId, setSelectedLotId] = useState<string | null>(null)
  const [showVisitForm, setShowVisitForm] = useState(false)
  const [visitDate, setVisitDate] = useState(dateToday())
  const [visitStatus, setVisitStatus] = useState<'COMPLETED' | 'NO_CONTACT'>('COMPLETED')
  const [needsReturn, setNeedsReturn] = useState(false)
  const [followUpDate, setFollowUpDate] = useState('')
  const [returnFilter, setReturnFilter] = useState<ReturnFilter>('ALL')
  const [editingReturnId, setEditingReturnId] = useState<string | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [priorityDate, setPriorityDate] = useState(dateToday())
  const [priorityLotId, setPriorityLotId] = useState('')
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('ALL')
  const [prioritySearch, setPrioritySearch] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const confirmationRef = useCensusDialogFocus(Boolean(pendingAction), () => setPendingAction(null))

  useEffect(() => {
    let mounted = true
    const loadProfile = async () => {
      if (!supabase) return
      const { data } = await supabase.auth.getUser()
      const user = data.user
      if (!user || !mounted) return
      const metadata = user.user_metadata || {}
      const name = String(metadata.full_name || metadata.name || metadata.display_name || '').trim() || userEmail || user.email || 'Usuário autenticado'
      if (mounted) setProfile({ name })
    }
    void loadProfile()
    return () => { mounted = false }
  }, [userEmail])

  const load = useCallback(async () => {
    if (!supabase) {
      setAuthorized(false); setError('O Supabase não está configurado nesta sessão.'); setLoading(false)
      return
    }
    const db = supabase
    setLoading(true); setError(''); setNotice(''); setAuthorized(false); setMapImport(null); setLots([]); setZones([]); setVisits([]); setPriorities([]); setSelectedLotId(null)
    try {
      const { data: isAdmin, error: authError } = await db.rpc('municipal_governance_is_admin')
      if (authError) throw new Error('Não foi possível confirmar sua autorização administrativa.')
      if (isAdmin !== true) { setLoading(false); return }
      const mapResult = await db.from('census_territory_map_imports').select('id,bbox').order('division_saved_at', { ascending: false }).order('updated_at', { ascending: false }).limit(1)
      if (mapResult.error) throw new Error(`Não foi possível abrir o mapa territorial: ${mapResult.error.message}`)
      const current = (mapResult.data?.[0] || null) as MapImport | null
      setMapImport(current)
      if (!current) { setLots([]); setZones([]); setVisits([]); setPriorities([]); setAuthorized(true); return }
      // As views territoriais projetam os mesmos IDs de census_map_lots; as visitas e prioridades referenciam a tabela-base e não dependem de census_households.
      const [lotRows, zoneResult, visitRows, priorityRows] = await Promise.all([
        fetchPages<Lot>((from, to) => db.from('census_territory_map_lots').select('id,source_handle,label,geometry,is_valid,zone_number,zone_id').eq('import_id', current.id).eq('is_valid', true).order('source_handle').order('id').range(from, to)),
        db.from('census_zones').select('id,name,color,active').eq('active', true).order('created_at').limit(500),
        fetchPages<MedicalVisit>((from, to) => db.from('census_medical_visits').select('id,lot_id,visit_date,status,follow_up_date,follow_up_status,follow_up_completed_at,created_at').order('visit_date', { ascending: false }).order('created_at', { ascending: false }).range(from, to)),
        fetchPages<LotPriority>((from, to) => db.from('census_medical_lot_priorities').select('id,lot_id,priority_date,status,created_at').order('priority_date', { ascending: false }).order('created_at', { ascending: false }).range(from, to)),
      ])
      if (zoneResult.error) throw new Error(`Não foi possível carregar as zonas: ${zoneResult.error.message}`)
      setLots(lotRows); setZones((zoneResult.data || []) as Zone[]); setVisits(visitRows); setPriorities(priorityRows); setAuthorized(true)
    } catch (err) {
      setAuthorized(false)
      setError(err instanceof Error ? err.message : 'Não foi possível carregar o módulo de visitas médicas.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [load])

  const today = dateToday()
  const selectedLot = lots.find((lot) => lot.id === selectedLotId) || null
  const zoneById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones])
  const lotById = useMemo(() => new Map(lots.map((lot) => [lot.id, lot])), [lots])
  const visitsByLot = useMemo(() => {
    const result = new Map<string, MedicalVisit[]>()
    for (const visit of visits) result.set(visit.lot_id, [...(result.get(visit.lot_id) || []), visit])
    for (const list of result.values()) list.sort(visitOrder)
    return result
  }, [visits])
  const openReturns = useMemo(() => visits.filter((visit) => visit.follow_up_status === 'PENDING').sort((a, b) => (a.follow_up_date || '').localeCompare(b.follow_up_date || '') || a.created_at.localeCompare(b.created_at)), [visits])
  const returnRows = useMemo(() => openReturns.filter((visit) => returnFilter === 'ALL' || (returnFilter === 'OVERDUE' ? (visit.follow_up_date || '') < today : (visit.follow_up_date || '') >= today)), [openReturns, returnFilter, today])
  const overdueCount = openReturns.filter((visit) => (visit.follow_up_date || '') < today).length
  const bbox = useMemo<Bbox | null>(() => {
    if (mapImport?.bbox) return mapImport.bbox
    if (!lots.length) return null
    const points = lots.flatMap((lot) => lot.geometry)
    return { minX: Math.min(...points.map((point) => point[0])), minY: Math.min(...points.map((point) => point[1])), maxX: Math.max(...points.map((point) => point[0])), maxY: Math.max(...points.map((point) => point[1])) }
  }, [lots, mapImport])
  const priorityRows = useMemo(() => {
    const query = prioritySearch.trim().toLocaleLowerCase('pt-BR')
    return priorities.filter((item) => item.priority_date === priorityDate && (priorityFilter === 'ALL' || item.status === priorityFilter)).filter((item) => {
      if (!query) return true
      const lot = lotById.get(item.lot_id)
      return lot ? `${getMapLotCode(lot.label, lot.source_handle, lots.indexOf(lot) + 1)} ${lot.source_handle} ${lot.label || ''}`.toLocaleLowerCase('pt-BR').includes(query) : item.lot_id.toLowerCase().includes(query)
    }).sort((a, b) => a.created_at.localeCompare(b.created_at))
  }, [priorities, priorityDate, priorityFilter, prioritySearch, lotById, lots])
  const selectedPriorityLot = lots.find((lot) => lot.id === priorityLotId) || null

  const toSvg = (point: Point) => {
    if (!bbox) return '0,0'
    const width = Math.max(bbox.maxX - bbox.minX, 1)
    const height = Math.max(bbox.maxY - bbox.minY, 1)
    return `${((point[0] - bbox.minX) / width) * 1000},${((bbox.maxY - point[1]) / height) * 1000}`
  }
  const lotCode = (lot: Lot) => getMapLotCode(lot.label, lot.source_handle, lots.findIndex((item) => item.id === lot.id) + 1)
  const mapState = (lotId: string) => {
    const lotVisits = visitsByLot.get(lotId) || []
    if (lotVisits.some((visit) => visit.follow_up_status === 'PENDING')) return { key: 'return', color: MAP_COLORS.return, label: 'Retorno pendente' }
    if (lotVisits.some((visit) => visit.status === 'COMPLETED')) return { key: 'visited', color: MAP_COLORS.visited, label: 'Visita realizada' }
    if (lotVisits.some((visit) => visit.status === 'NO_CONTACT')) return { key: 'no-contact', color: MAP_COLORS.noContact, label: 'Sem contato' }
    if (lotVisits.some((visit) => visit.status === 'CANCELLED')) return { key: 'cancelled', color: MAP_COLORS.cancelled, label: 'Visita cancelada' }
    return { key: 'never', color: MAP_COLORS.never, label: 'Sem visita registrada' }
  }
  const lotStateCounts = lots.reduce<Record<string, number>>((counts, lot) => {
    const { key } = mapState(lot.id)
    counts[key] = (counts[key] || 0) + 1
    return counts
  }, {})
  const selectSection = (next: MedicalSection) => { setSection(next); setMenuOpen(false); setNotice('') }
  const selectLotOnMap = (lot: Lot, openForm = false) => {
    setSelectedLotId(lot.id); setShowVisitForm(openForm)
    if (openForm) { setVisitDate(today); setVisitStatus('COMPLETED'); setNeedsReturn(false); setFollowUpDate('') }
  }

  function requestVisit() {
    if (!selectedLot || !visitDate || (needsReturn && (!followUpDate || followUpDate < visitDate))) return
    setPendingAction({ kind: 'create', lot: selectedLot, visitDate, status: visitStatus, followUpDate: needsReturn ? followUpDate : '' })
  }

  async function addPriority(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !selectedPriorityLot || !priorityDate) return
    setSaving(true); setError(''); setNotice('')
    try {
      const { error: insertError } = await supabase.from('census_medical_lot_priorities').upsert({ lot_id: selectedPriorityLot.id, priority_date: priorityDate, status: 'PENDING' }, { onConflict: 'lot_id,priority_date', ignoreDuplicates: true })
      if (insertError) throw new Error(insertError.message)
      await load()
      setNotice(`Lote ${lotCode(selectedPriorityLot)} incluído nas indicações administrativas de ${formatDate(priorityDate)}.`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível incluir a indicação.') }
    finally { setSaving(false) }
  }

  async function confirmAction() {
    const action = pendingAction
    setPendingAction(null)
    if (!action || !supabase) return
    setSaving(true); setError(''); setNotice('')
    let successMessage = ''
    let partialMessage = ''
    try {
      if (action.kind === 'create') {
        const result = await supabase.from('census_medical_visits').insert({ lot_id: action.lot.id, visit_date: action.visitDate, status: action.status, follow_up_date: action.followUpDate || null, follow_up_status: action.followUpDate ? 'PENDING' : null }).select('id').single()
        if (result.error) throw new Error(result.error.message)
        if (action.status === 'COMPLETED') {
          const indication = await supabase.from('census_medical_lot_priorities').update({ status: 'VISITED' }).eq('lot_id', action.lot.id).eq('priority_date', action.visitDate).eq('status', 'PENDING').select('id')
          if (indication.error) partialMessage = ' A indicação da Secretaria permaneceu pendente; atualize-a na tela “Lotes indicados”.'
        }
        setShowVisitForm(false); setNeedsReturn(false); setFollowUpDate('')
        successMessage = action.followUpDate ? 'Visita registrada e retorno incluído automaticamente na agenda.' : 'Visita registrada.'
      } else if (action.kind === 'follow-up') {
        const result = await supabase.from('census_medical_visits').update({ follow_up_status: action.status }).eq('id', action.visit.id).eq('follow_up_status', 'PENDING').select('id').single()
        if (result.error) throw new Error(result.error.message)
        successMessage = action.status === 'COMPLETED' ? 'Retorno marcado como realizado.' : 'Retorno cancelado.'
      } else if (action.kind === 'reschedule') {
        const result = await supabase.from('census_medical_visits').update({ follow_up_date: action.date }).eq('id', action.visit.id).eq('follow_up_status', 'PENDING').select('id').single()
        if (result.error) throw new Error(result.error.message)
        setEditingReturnId(null); successMessage = 'Data do retorno atualizada.'
      } else {
        const result = await supabase.from('census_medical_lot_priorities').update({ status: action.status }).eq('id', action.priority.id).select('id').single()
        if (result.error) throw new Error(result.error.message)
        successMessage = action.status === 'VISITED' ? 'Indicação marcada como visitada.' : action.status === 'CANCELLED' ? 'Indicação cancelada e preservada no histórico.' : 'Indicação reaberta.'
      }
      await load()
      setNotice(`${successMessage}${partialMessage}`)
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível gravar a alteração.') }
    finally { setSaving(false) }
  }

  const confirmation = pendingAction?.kind === 'create'
    ? { title: 'Registrar esta visita?', description: `${lotCode(pendingAction.lot)} · ${formatDate(pendingAction.visitDate)} · ${pendingAction.status === 'COMPLETED' ? 'visita realizada' : 'sem contato'}.${pendingAction.followUpDate ? ` O retorno de ${formatDate(pendingAction.followUpDate)} será criado automaticamente.` : ''} Nenhum dado clínico ou pessoal será coletado.`, confirm: 'Registrar visita' }
    : pendingAction?.kind === 'follow-up'
      ? { title: pendingAction.status === 'COMPLETED' ? 'Marcar retorno como realizado?' : 'Cancelar este retorno?', description: `${lotCode(lotById.get(pendingAction.visit.lot_id) || { id: pendingAction.visit.lot_id, label: null, source_handle: pendingAction.visit.lot_id, geometry: [], is_valid: true, zone_number: null, zone_id: null })} · data prevista ${formatDate(pendingAction.visit.follow_up_date)}.`, confirm: pendingAction.status === 'COMPLETED' ? 'Marcar realizado' : 'Cancelar retorno' }
      : pendingAction?.kind === 'reschedule'
        ? { title: 'Alterar a data do retorno?', description: `A nova data ficará ${formatDate(pendingAction.date)}. O retorno continuará pendente até ser realizado ou cancelado.`, confirm: 'Confirmar nova data' }
        : pendingAction?.kind === 'priority'
          ? { title: pendingAction.status === 'VISITED' ? 'Marcar a indicação como visitada?' : pendingAction.status === 'CANCELLED' ? 'Cancelar esta indicação?' : 'Reabrir esta indicação?', description: `Lote ${lotCode(lotById.get(pendingAction.priority.lot_id) || { id: pendingAction.priority.lot_id, label: null, source_handle: pendingAction.priority.lot_id, geometry: [], is_valid: true, zone_number: null, zone_id: null })} · lista administrativa de ${formatDate(pendingAction.priority.priority_date)}. Esta situação é operacional e não representa uma necessidade hospitalar.`, confirm: pendingAction.status === 'VISITED' ? 'Marcar visitado' : pendingAction.status === 'CANCELLED' ? 'Cancelar indicação' : 'Reabrir indicação' }
          : null

  return <div className="fleet-shell census-shell medical-shell">
    <aside className="fleet-sidebar">
      <div className="fleet-sidebar-top">
        <button className="fleet-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Voltar ao painel</button>
        <div className="fleet-brand"><span className="fleet-brand-icon"><Stethoscope size={20} /></span><div><strong>Visitas Médicas</strong><small>Inteligência Municipal</small></div></div>
      </div>
      <div className="fleet-section-label">SECRETARIA DE SAÚDE</div>
      <nav className="fleet-nav" aria-label="Navegação de Visitas Médicas">
        {sectionItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`fleet-nav-item${section === id ? ' active' : ''}`} onClick={() => selectSection(id)}><Icon size={17} />{label}{id === 'returns' && openReturns.length > 0 && <span className="fleet-nav-count">{openReturns.length}</span>}</button>)}
        <button type="button" className="fleet-nav-item fleet-mobile-logout" onClick={onLogout}><LogOut size={17} />Sair</button>
      </nav>
      <div className="fleet-sidebar-bottom"><div className="fleet-user-chip"><span className="fleet-user-avatar">{profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U'}</span><div><strong>{profile.name}</strong><small>Área administrativa</small></div></div><button type="button" className="fleet-logout" onClick={onLogout}><LogOut size={16} /> Sair do sistema</button></div>
    </aside>
    <main className="fleet-main census-main medical-main">
      <header className="fleet-header"><div><p className="fleet-kicker">MÓDULO MUNICIPAL</p><h1>{sectionItems.find((item) => item.id === section)?.label || 'Visão geral'}</h1></div><button type="button" className="census-mobile-menu-button" aria-label="Abrir menu de Visitas Médicas" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>{menuOpen && <div className="census-mobile-menu" role="menu">{sectionItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={section === id ? 'active' : ''} onClick={() => selectSection(id)}><Icon size={17} />{label}{id === 'returns' && openReturns.length > 0 && <span className="fleet-nav-count">{openReturns.length}</span>}</button>)}<button type="button" onClick={onLogout}><LogOut size={17} />Sair</button></div>}</header>
      <div className="fleet-content census-content medical-content" aria-busy={loading || saving}>
        {!authorized ? loading ? <div className="medical-page-state" role="status"><LoaderCircle className="spin" size={24} /><strong>Verificando autorização</strong><span>Os dados só serão carregados após confirmar o acesso administrativo.</span></div> : <div className="medical-page-state denied"><span><HeartPulse size={24} /></span><strong>Acesso reservado</strong><span>{error || 'O módulo de Visitas Médicas está restrito a administradores ativos nesta etapa. O acesso da equipe médica será definido antes de ampliar a disponibilidade.'}</span><button type="button" className="fleet-secondary-button" onClick={onBack}><ArrowLeft size={15} />Voltar ao painel</button></div> : <>
          {error && <div className="medical-inline-alert error" role="alert"><AlertCircle size={16} />{error}</div>}
          {notice && <div className="medical-inline-alert success" role="status"><CheckCircle2 size={16} />{notice}</div>}
          {section === 'overview' && <section className="medical-overview-blank" aria-label="Visão geral. Conteúdo a ser definido posteriormente." />}
          {section === 'visits' && <section className="medical-page" aria-busy={loading || saving}>
            <div className="medical-section-heading"><div><span className="medical-eyebrow"><Stethoscope size={14} /> SECRETARIA DE SAÚDE</span><h2>Mapa de visitas médicas</h2><p>Selecione qualquer lote no mapa para consultar o histórico ou registrar uma visita.</p></div><button type="button" className="fleet-secondary-button medical-refresh" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15} />Atualizar</button></div>
            <div className="medical-privacy-note"><HeartPulse size={16} /><span><strong>Formulário operacional.</strong> Registra lote, data, resultado e retorno. Não inclua nomes, diagnósticos ou informações clínicas.</span></div>
            <div className="medical-map-summary"><span><i className="never" />{(lotStateCounts.never || 0).toLocaleString('pt-BR')} de {lots.length.toLocaleString('pt-BR')} lotes sem visita</span><span><i className="no-contact" />{(lotStateCounts['no-contact'] || 0).toLocaleString('pt-BR')} de {lots.length.toLocaleString('pt-BR')} lotes sem contato</span><span><i className="cancelled" />{(lotStateCounts.cancelled || 0).toLocaleString('pt-BR')} de {lots.length.toLocaleString('pt-BR')} lotes com visita cancelada</span><span><i className="visited" />{(lotStateCounts.visited || 0).toLocaleString('pt-BR')} de {lots.length.toLocaleString('pt-BR')} lotes com visita realizada</span><span><i className="return" />{(lotStateCounts.return || 0).toLocaleString('pt-BR')} de {lots.length.toLocaleString('pt-BR')} lotes com retorno pendente</span></div>
            <div className={`medical-workspace${selectedLot ? ' has-selection' : ''}`}>
              <section className="medical-map-card" aria-label="Mapa de lotes para visitas médicas"><header><span><MapPinned size={16} /> Selecione um lote para registrar ou consultar</span><div><button type="button" aria-label="Aumentar zoom" onClick={() => setZoom((value) => Math.min(16, value * 1.2))} disabled={!lots.length}><Plus size={16} /></button><b>{Math.round(zoom * 100)}%</b><button type="button" aria-label="Diminuir zoom" onClick={() => setZoom((value) => Math.max(.65, value / 1.2))} disabled={!lots.length}><Minus size={16} /></button><button type="button" aria-label="Restaurar zoom" onClick={() => setZoom(1)}><RotateCcw size={15} /></button></div></header>
                <div className="medical-map-viewport">{loading ? <div className="medical-map-empty"><LoaderCircle className="spin" size={23} />Carregando mapa e visitas…</div> : error && !lots.length ? <div className="medical-map-empty error"><AlertCircle size={22} /><strong>Não foi possível abrir o mapa</strong><span>{error}</span></div> : !mapImport || lots.length === 0 ? <div className="medical-map-empty"><MapPinned size={24} /><strong>Mapa territorial indisponível</strong><span>Publique um mapa territorial em Saúde da Família/ACS antes de iniciar as visitas médicas.</span></div> : <svg className="medical-map-svg" viewBox="0 0 1000 1000" style={{ transform: `scale(${zoom})` }} role="group" aria-label="Mapa de lotes com estado da visita e do retorno">{lots.map((lot) => { const code = lotCode(lot); const zone = lot.zone_id ? zoneById.get(lot.zone_id) : null; const state = mapState(lot.id); return <polygon key={lot.id} points={lot.geometry.map(toSvg).join(' ')} fill={state.color} fillOpacity=".88" stroke={selectedLotId === lot.id ? '#123f53' : '#fff'} strokeWidth={selectedLotId === lot.id ? 2.2 : 1.15} vectorEffect="non-scaling-stroke" tabIndex={0} role="button" aria-label={`${code}, ${zone?.name || 'sem zona'}, ${state.label}`} className={selectedLotId === lot.id ? 'selected' : ''} onClick={() => selectLotOnMap(lot)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLotOnMap(lot) } }}><title>{`${code} · ${zone?.name || 'Sem zona'} · ${state.label}`}</title></polygon> })}</svg>}
                  {!loading && lots.length > 0 && <div className="medical-map-legend"><span><i className="never" />Sem visita registrada</span><span><i className="no-contact" />Sem contato</span><span><i className="cancelled" />Visita cancelada</span><span><i className="visited" />Visita realizada</span><span><i className="return" />Retorno pendente</span></div>}
                </div>
              </section>
              {selectedLot && <aside className="medical-lot-panel"><header><div><span className="medical-eyebrow">LOTE SELECIONADO</span><h3>{lotCode(selectedLot)}</h3><span className="medical-zone"><i style={{ background: selectedLot.zone_id ? zoneById.get(selectedLot.zone_id)?.color || '#c5d4d4' : '#c5d4d4' }} />{selectedLot.zone_id ? zoneById.get(selectedLot.zone_id)?.name || 'Zona não informada' : 'Sem zona'}</span></div><button type="button" className="medical-icon-button" aria-label="Fechar detalhes do lote" onClick={() => { setSelectedLotId(null); setShowVisitForm(false) }}><X size={18} /></button></header>
                <div className="medical-lot-scroll"><div className="medical-current-status"><span className="medical-status-dot" style={{ background: mapState(selectedLot.id).color }} /><div><small>Situação no mapa</small><strong>{mapState(selectedLot.id).label}</strong></div></div>
                  {!showVisitForm ? <button type="button" className="fleet-primary-button medical-wide-button" onClick={() => selectLotOnMap(selectedLot, true)}><CalendarDays size={16} />Registrar visita</button> : <form className="medical-visit-form" onSubmit={(event) => { event.preventDefault(); requestVisit() }}>
                    <div><strong>Formulário padrão de visita</strong><span>Modelo inicial, configurável em uma etapa futura.</span></div>
                    <label>Data da visita<input type="date" value={visitDate} max={today} required onChange={(event) => setVisitDate(event.target.value)} /></label>
                    <label>Resultado da visita<select value={visitStatus} onChange={(event) => setVisitStatus(event.target.value as 'COMPLETED' | 'NO_CONTACT')}><option value="COMPLETED">Visita realizada</option><option value="NO_CONTACT">Não houve contato</option></select></label>
                    <label className="medical-checkbox-label"><input type="checkbox" checked={needsReturn} onChange={(event) => { setNeedsReturn(event.target.checked); if (!event.target.checked) setFollowUpDate('') }} /><span>É necessário retornar a este lote</span></label>
                    {needsReturn && <label>Data prevista do retorno<input type="date" value={followUpDate} min={visitDate || today} required onChange={(event) => setFollowUpDate(event.target.value)} /></label>}
                    <p>Ao informar uma data, o retorno é incluído automaticamente na agenda. Este formulário não coleta identificação pessoal nem dados clínicos.</p>
                    <div className="medical-form-actions"><button type="button" className="fleet-secondary-button" onClick={() => setShowVisitForm(false)}>Voltar</button><button type="submit" className="fleet-primary-button" disabled={!visitDate || (needsReturn && (!followUpDate || followUpDate < visitDate)) || saving}><Check size={15} />Continuar</button></div>
                  </form>}
                  <section className="medical-history"><h4><Clock3 size={15} />Histórico neste lote <span>{(visitsByLot.get(selectedLot.id) || []).length}</span></h4>{(visitsByLot.get(selectedLot.id) || []).length === 0 ? <p className="medical-empty-history">Ainda não há visitas médicas registradas neste lote.</p> : (visitsByLot.get(selectedLot.id) || []).map((visit) => <article key={visit.id} className="medical-history-row"><div><strong>{formatDate(visit.visit_date)}</strong><span className={`medical-pill ${visit.status.toLowerCase()}`}>{visitLabels[visit.status]}</span></div>{visit.follow_up_date && <p>Retorno: {formatDate(visit.follow_up_date)} · {visit.follow_up_status === 'PENDING' ? (visit.follow_up_date < today ? 'Atrasado' : 'Pendente') : visit.follow_up_status === 'COMPLETED' ? 'Realizado' : 'Cancelado'}</p>}</article>)}</section>
                </div>
              </aside>}
            </div>
          </section>}
          {section === 'returns' && <section className="medical-page">
            <div className="medical-section-heading"><div><span className="medical-eyebrow"><CalendarClock size={14} /> AGENDA MÉDICA</span><h2>Acompanhamento de retornos</h2><p>Os retornos são cadastrados automaticamente ao definir uma data no formulário da visita.</p></div><button type="button" className="fleet-secondary-button medical-refresh" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15} />Atualizar</button></div>
            <div className="medical-return-toolbar"><div className="medical-return-filters" role="group" aria-label="Filtrar retornos">{(['ALL', 'UPCOMING', 'OVERDUE'] as ReturnFilter[]).map((filter) => <button type="button" key={filter} className={returnFilter === filter ? 'active' : ''} aria-pressed={returnFilter === filter} onClick={() => setReturnFilter(filter)}>{filter === 'ALL' ? `Pendentes (${openReturns.length})` : filter === 'UPCOMING' ? 'Próximos' : `Atrasados (${overdueCount})`}</button>)}</div><span>{openReturns.length.toLocaleString('pt-BR')} retornos em aberto · {overdueCount.toLocaleString('pt-BR')} atrasados</span></div>
            {loading ? <div className="medical-empty-state"><LoaderCircle className="spin" size={20} />Carregando retornos…</div> : returnRows.length === 0 ? <div className="medical-empty-state"><CalendarClock size={23} /><strong>{returnFilter === 'OVERDUE' ? 'Nenhum retorno atrasado' : 'Nenhum retorno pendente nesta lista'}</strong><span>Quando uma visita tiver data prevista, ela aparecerá automaticamente aqui.</span></div> : <div className="medical-return-list">{returnRows.map((visit) => { const lot = lotById.get(visit.lot_id); const overdue = (visit.follow_up_date || '') < today; const editing = editingReturnId === visit.id; return <article className={`medical-return-card${overdue ? ' overdue' : ''}`} key={visit.id}><div className="medical-return-card-top"><span className="medical-return-icon"><CalendarClock size={17} /></span><div className="medical-return-info"><strong>{lot ? lotCode(lot) : 'Lote não disponível'}</strong><span>{overdue ? 'Retorno atrasado' : 'Próximo retorno'} · visita de {formatDate(visit.visit_date)}</span></div><time dateTime={visit.follow_up_date || undefined}>{formatDate(visit.follow_up_date)}</time></div>{editing ? <form className="medical-reschedule-form" onSubmit={(event) => { event.preventDefault(); if (rescheduleDate >= today) setPendingAction({ kind: 'reschedule', visit, date: rescheduleDate }) }}><label>Nova data<input type="date" min={today} value={rescheduleDate} required onChange={(event) => setRescheduleDate(event.target.value)} /></label><button type="button" className="fleet-secondary-button" onClick={() => setEditingReturnId(null)}>Cancelar</button><button type="submit" className="fleet-primary-button" disabled={!rescheduleDate || rescheduleDate < today || saving}>Salvar nova data</button></form> : <div className="medical-return-actions"><button type="button" className="fleet-secondary-button" onClick={() => { setEditingReturnId(visit.id); setRescheduleDate(visit.follow_up_date || today) }} disabled={saving}>Reagendar</button><button type="button" className="fleet-primary-button" onClick={() => setPendingAction({ kind: 'follow-up', visit, status: 'COMPLETED' })} disabled={saving}><Check size={15} />Marcar realizado</button><button type="button" className="medical-text-button" onClick={() => setPendingAction({ kind: 'follow-up', visit, status: 'CANCELLED' })} disabled={saving}>Cancelar retorno</button></div>}</article> })}</div>}
          </section>}
          {section === 'priorities' && <section className="medical-page">
            <div className="medical-section-heading"><div><span className="medical-eyebrow"><ClipboardList size={14} /> AGENDA ADMINISTRATIVA</span><h2>Lotes indicados pela Secretaria</h2><p>Lista diária de lotes sugeridos para visita, separada da avaliação médica.</p></div><button type="button" className="fleet-secondary-button medical-refresh" onClick={() => void load()} disabled={loading || saving}><RefreshCw size={15} />Atualizar</button></div>
            <div className="medical-priority-note"><Activity size={17} /><span><strong>Indicação administrativa.</strong> A inclusão de um lote é uma prioridade de roteiro definida pela Secretaria; não representa necessidade hospitalar, diagnóstico ou avaliação clínica.</span></div>
            <form className="medical-priority-form" onSubmit={(event) => void addPriority(event)}><label>Dia da lista<input type="date" value={priorityDate} onChange={(event) => setPriorityDate(event.target.value)} required /></label><label className="medical-priority-lot-select">Selecionar lote (todos os lotes válidos do mapa)<select value={priorityLotId} onChange={(event) => setPriorityLotId(event.target.value)} required><option value="">Escolha um lote</option>{lots.map((lot, index) => <option key={lot.id} value={lot.id}>{getMapLotCode(lot.label, lot.source_handle, index + 1)}{lot.label ? ` · ${lot.label}` : ''}</option>)}</select></label><button type="submit" className="fleet-primary-button" disabled={!selectedPriorityLot || loading || saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Plus size={16} />}Adicionar à lista do dia</button></form>
            <div className="medical-priority-toolbar"><div><strong>{priorityRows.length.toLocaleString('pt-BR')}</strong><span> indicações em {formatDate(priorityDate)}</span></div><div className="medical-priority-controls"><label className="medical-search"><Search size={15} /><input type="search" value={prioritySearch} onChange={(event) => setPrioritySearch(event.target.value)} placeholder="Buscar lote" aria-label="Buscar lote indicado" /></label><label className="medical-priority-filter"><span className="medical-sr-only">Filtrar situação</span><select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}><option value="ALL">Todas as situações</option><option value="PENDING">Pendentes</option><option value="VISITED">Visitados</option><option value="CANCELLED">Cancelados</option></select></label></div></div>
            {loading ? <div className="medical-empty-state"><LoaderCircle className="spin" size={20} />Carregando indicações…</div> : priorityRows.length === 0 ? <div className="medical-empty-state"><ClipboardList size={23} /><strong>Nenhuma indicação nesta data</strong><span>Escolha qualquer lote do mapa, mesmo sem domicílio cadastrado, para adicioná-lo à lista administrativa do dia.</span></div> : <div className="medical-priority-list">{priorityRows.map((priority) => { const lot = lotById.get(priority.lot_id); const zone = lot?.zone_id ? zoneById.get(lot.zone_id) : null; return <article className="medical-priority-card" key={priority.id}><span className={`medical-priority-state ${priority.status.toLowerCase()}`}><i />{priorityLabels[priority.status]}</span><div className="medical-priority-lot"><strong>{lot ? lotCode(lot) : 'Lote não disponível'}</strong><span>{zone?.name || 'Sem zona'}{lot?.label ? ` · ${lot.label}` : ''}</span></div><div className="medical-priority-actions">{priority.status === 'PENDING' ? <><button type="button" className="fleet-secondary-button" onClick={() => { if (lot) { setSelectedLotId(lot.id); setShowVisitForm(true); setVisitDate(priority.priority_date); setVisitStatus('COMPLETED'); setNeedsReturn(false); setFollowUpDate(''); setSection('visits') } }} disabled={!lot || saving}><MapPinned size={14} />Registrar visita</button><button type="button" className="medical-text-button" onClick={() => setPendingAction({ kind: 'priority', priority, status: 'CANCELLED' })} disabled={saving}>Cancelar indicação</button></> : <button type="button" className="medical-text-button" onClick={() => setPendingAction({ kind: 'priority', priority, status: 'PENDING' })} disabled={saving}>Reabrir</button>}</div></article> })}</div>}
          </section>}
        </>}
      </div>
    </main>
    {pendingAction && confirmation && <div className="medical-confirm-backdrop"><section ref={confirmationRef} tabIndex={-1} className="medical-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="medicalConfirmTitle" aria-describedby="medicalConfirmDescription"><span className="medical-confirm-icon"><AlertCircle size={21} /></span><div><h2 id="medicalConfirmTitle">{confirmation.title}</h2><p id="medicalConfirmDescription">{confirmation.description}</p></div><footer><button type="button" className="fleet-secondary-button" onClick={() => setPendingAction(null)}>Voltar</button><button type="button" className="fleet-primary-button" onClick={() => void confirmAction()} disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{confirmation.confirm}</button></footer></section></div>}
  </div>
}
