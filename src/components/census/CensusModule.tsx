import { useEffect, useRef, useState } from 'react'
import { AlertCircle, ArrowLeft, Check, CheckCircle2, ClipboardList, Download, FileText, Filter, FolderOpen, LayoutDashboard, LoaderCircle, LogOut, MapPinned, Menu, Minus, Move, Plus, RotateCcw, Save, Upload, UserPlus, UsersRound, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { CensusWriteConfirmation } from './CensusWriteConfirmation'
import { CensusFamiliesVisits } from './CensusFamiliesVisits'
import { CensusOverview } from './CensusOverview'
import { assignLotToZone, assignLotsToZone, filterUnassignedLots, getLotFillColor, getLotKey, groupLotSaveAssignments, matchDraftLotsToCurrent, mergeSelectedLotKeys, parseDxfLotBoundaries, selectLotKeysInRect, shouldStartMapPan, withLotIds, zoomMapViewAtOffset } from './mapLogic'
import type { DxfEntity } from './mapLogic'
import { QuestionnairesManagement } from './questionnaires/QuestionnairesManagement'
import { CensusTerritory } from './territory/CensusTerritory'
import '../FleetModule.css'
import './CensusModule.css'
import './CensusDWG.css'
import './CensusFilters.css'

type Point = [number, number]
type Lot = {
  id?: string
  source_handle: string
  label: string | null
  cadastral_label?: string | null
  street_name?: string | null
  neighborhood_name?: string | null
  block_reference?: string | null
  layer_name: string
  geometry: Point[]
  area: number
  is_valid: boolean
  problem_reasons: string[]
  zone_number: number | null
  zone_id?: string | null
  matched_lot_id?: string | null
  merge_status?: 'NEW' | 'MATCHED' | 'PUBLISHED'
}
type CensusZone = { id: string; name: string; color: string; active: boolean }
type CensusAcs = { id: string; full_name: string; email: string | null; phone: string | null; active: boolean; user_id?: string | null }
type AreaSelectionGesture = { start: Point; current: Point; startClientX: number; startClientY: number; targetLotKey: string | null; additive: boolean }

type MapImport = {
  id: string
  file_name: string
  mime_type: string
  file_size: number
  storage_path: string
  source_layer: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED' | 'ERROR'
  total_features: number
  valid_features: number
  problematic_features: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null
  updated_at: string
  published_at: string | null
  division_saved_at: string | null
  is_current?: boolean
}
type CensusSection = 'overview' | 'territory' | 'dwg' | 'families' | 'forms' | 'zones'
type CensusRole = 'acs' | 'manager'
type OperationalFilter = 'ALL' | 'NO_VISIT' | 'NO_CONTACT' | 'QUESTIONNAIRE' | 'DRAFT'
type CensusAccess = { role: CensusRole; label: string; description: string; acsId: string | null }
type CensusModuleProps = { userEmail?: string; onBack: () => void; onLogout: () => void }
type CensusNoticeTone = 'success' | 'error' | 'info'
const TERRITORY_PAGE_SIZE = 1000

const managerNavItems: { id: CensusSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'territory', label: 'Monitorar território', icon: MapPinned },
  { id: 'forms', label: 'Questionários', icon: FileText },
  { id: 'overview', label: 'Visão gerencial', icon: LayoutDashboard },
  { id: 'zones', label: 'Zonas e ACS', icon: ClipboardList },
]
const adminNavItems: { id: CensusSection; label: string; icon: typeof LayoutDashboard }[] = [
  ...managerNavItems,
  { id: 'dwg', label: 'Preparar mapa', icon: FolderOpen },
]
const acsNavItems: { id: CensusSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Meu dia', icon: LayoutDashboard },
  { id: 'territory', label: 'Meus domicílios', icon: MapPinned },
  { id: 'families', label: 'Minhas visitas', icon: UsersRound },
]
async function chunks<T>(values: T[], size: number, callback: (chunk: T[]) => Promise<void>) {
  for (let index = 0; index < values.length; index += size) await callback(values.slice(index, index + size))
}
async function fetchTerritoryLots(db: NonNullable<typeof supabase>, importId: string) {
  const rows: Lot[] = []
  for (let from = 0; ; from += TERRITORY_PAGE_SIZE) {
    const { data, error } = await db.from('census_territory_map_lots').select('id,source_handle,label,cadastral_label,street_name,neighborhood_name,block_reference,layer_name,geometry,area,is_valid,zone_number,zone_id').eq('import_id', importId).order('source_handle').order('id').range(from, from + TERRITORY_PAGE_SIZE - 1)
    if (error) throw new Error(`Não foi possível carregar os lotes publicados: ${error.message}`)
    const page = (data || []) as Lot[]
    rows.push(...page)
    if (page.length < TERRITORY_PAGE_SIZE) return rows
  }
}

async function fetchPreparationLots(db: NonNullable<typeof supabase>, importId: string) {
  const rows: Lot[] = []
  for (let from = 0; ; from += TERRITORY_PAGE_SIZE) {
    const { data, error } = await db.from('census_map_lots').select('id,source_handle,label,cadastral_label,street_name,neighborhood_name,block_reference,layer_name,geometry,area,is_valid,problem_reasons,zone_number,zone_id,matched_lot_id,merge_status').eq('import_id', importId).order('source_handle').order('id').range(from, from + TERRITORY_PAGE_SIZE - 1)
    if (error) throw new Error(`Não foi possível carregar o rascunho: ${error.message}`)
    const page = (data || []) as Lot[]
    rows.push(...page)
    if (page.length < TERRITORY_PAGE_SIZE) return rows
  }
}

export function CensusModule({ userEmail, onBack, onLogout }: CensusModuleProps) {
  const [view, setView] = useState<CensusSection>('overview')
  const [familyInitialFilter, setFamilyInitialFilter] = useState<OperationalFilter>('ALL')
  const [menuOpen, setMenuOpen] = useState(false)
  const [profile, setProfile] = useState<{ name: string; photo: string | null }>({ name: userEmail || 'Usuário autenticado', photo: null })
  const [access, setAccess] = useState<CensusAccess>({ role: 'manager', label: 'Gestão municipal', description: 'Central de controle territorial e acompanhamento da equipe.', acsId: null })
  const [isAdministrator, setIsAdministrator] = useState(false)
  const [accessLoading, setAccessLoading] = useState(true)
  const [zones, setZones] = useState<CensusZone[]>([])
  const navItems = access.role === 'acs' ? acsNavItems : isAdministrator ? adminNavItems : managerNavItems
  const loadZones = async () => {
    if (!supabase) return
    const { data } = await supabase.from('census_zones').select('id,name,color,active').order('created_at').limit(500)
    setZones((data || []) as CensusZone[])
  }
  useEffect(() => { void loadZones() }, [])
  useEffect(() => {
    let mounted = true
    const loadProfile = async () => {
      if (!supabase) return
      const { data } = await supabase.auth.getUser()
      const authUser = data.user
      if (!authUser || !mounted) return
      const metadata = authUser.user_metadata || {}
      const name = String(metadata.full_name || metadata.name || metadata.display_name || '').trim() || userEmail || authUser.email || 'Usuário autenticado'
      const photo = String(metadata.avatar_url || metadata.picture || metadata.photo_url || '').trim() || null
      if (mounted) setProfile({ name, photo })
      const [{ data: acsRows }, { data: governanceAdmin }] = await Promise.all([
        supabase.from('census_acs').select('id,full_name').eq('user_id', authUser.id).eq('active', true).limit(1),
        supabase.rpc('municipal_governance_is_admin'),
      ])
      const acs = acsRows?.[0] as { id?: string; full_name?: string } | undefined
      const profileText = [metadata.perfil, metadata.perfil_municipal, metadata.role, metadata.cargo].map((value) => String(value || '').toUpperCase()).join(' ')
      const isAcs = Boolean(acs?.id) || /\bACS\b|AGENTE\s+COMUNIT/.test(profileText)
      const isAdmin = governanceAdmin === true || /\bADMIN(?:ISTRADOR)?\b|SUPERINTENDENTE|CONTROLADOR(?:A)?/.test(profileText)
      if (mounted) {
        setIsAdministrator(isAdmin)
        setAccess(isAcs
          ? { role: 'acs', label: 'Operação de campo', description: 'Sua rotina, seus domicílios e as visitas sob sua responsabilidade.', acsId: acs?.id || null }
          : { role: 'manager', label: 'Gestão municipal', description: 'Central de controle territorial e acompanhamento da equipe.', acsId: null })
        setAccessLoading(false)
      }
    }
    void loadProfile()
    const timeout = window.setTimeout(() => { if (mounted) setAccessLoading(false) }, 4000)
    return () => { mounted = false; window.clearTimeout(timeout) }
  }, [userEmail])

  const selectView = (nextView: CensusSection) => {
    if (access.role === 'acs' && !acsNavItems.some((item) => item.id === nextView)) return
    setView(nextView); setMenuOpen(false)
  }
  const profileInitials = profile.name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U'
  const openOverview = (nextView: 'territory' | 'families' | 'dwg' | 'zones' | 'forms', filter: OperationalFilter = 'ALL') => {
    if (nextView === 'families') setFamilyInitialFilter(filter)
    selectView(access.role === 'acs' && nextView === 'forms' ? 'territory' : nextView)
  }

  return <div className="fleet-shell census-shell">
    <aside className="fleet-sidebar"><div className="fleet-sidebar-top"><button className="fleet-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Voltar ao painel</button><div className="fleet-brand"><span className="fleet-brand-icon"><MapPinned size={20} /></span><div><strong>Saúde da Família/ACS</strong><small>Inteligência Municipal</small></div></div></div><div className="fleet-section-label">{access.role === 'acs' ? 'ROTINA DE CAMPO' : 'GESTÃO TERRITORIAL'}</div><nav className="fleet-nav" aria-label="Navegação de Saúde da Família/ACS">{navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`fleet-nav-item${view === id ? ' active' : ''}`} onClick={() => selectView(id)}><Icon size={17} />{label}</button>)}<button type="button" className="fleet-nav-item fleet-mobile-logout" onClick={onLogout}><LogOut size={17} />Sair</button></nav><div className="fleet-sidebar-bottom"><div className="fleet-user-chip"><span className="fleet-user-avatar">{profile.photo ? <img src={profile.photo} alt="" /> : profileInitials}</span><div><strong>{profile.name}</strong><small>{access.label}</small></div></div><button type="button" className="fleet-logout" onClick={onLogout}><LogOut size={16} /> Sair do sistema</button></div></aside>
    <main className={`fleet-main census-main census-role-${access.role}`}><header className="fleet-header"><div><p className="fleet-kicker">MÓDULO MUNICIPAL · {access.label.toUpperCase()}</p><h1>{navItems.find((item) => item.id === view)?.label || 'Visão geral'}</h1><small className="census-role-description">{accessLoading ? 'Verificando seu escopo de acesso…' : access.description}</small></div><button type="button" className="census-mobile-menu-button" aria-label="Abrir menu de Saúde da Família/ACS" aria-expanded={menuOpen} onClick={() => setMenuOpen((current) => !current)}>{menuOpen ? <X size={21} /> : <Menu size={21} />}</button>{menuOpen && <div className="census-mobile-menu" role="menu">{navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={view === id ? 'active' : ''} onClick={() => selectView(id)}><Icon size={17} />{label}</button>)}<button type="button" onClick={onLogout}><LogOut size={17} />Sair</button></div>}</header><div className="fleet-content census-content">
      {view === 'overview' && <CensusOverview role={access.role} onOpen={openOverview} />}
      {view === 'families' && <CensusFamiliesVisits key={familyInitialFilter} initialFilter={familyInitialFilter} onOpenTerritory={() => setView('territory')} />}
      {view === 'territory' && <CensusTerritory readOnly={access.role === 'manager' && !isAdministrator} onOpenQuestionnaires={() => selectView(access.role === 'acs' ? 'territory' : 'forms')} />}
      {view === 'zones' && access.role === 'manager' && <ZoneManagement zones={zones} onChanged={() => void loadZones()} />}
      {view === 'dwg' && access.role === 'manager' && isAdministrator && <MapPreparationWorkspace />}
      {view === 'forms' && access.role === 'manager' && <QuestionnairesManagement />}

    </div></main>
  </div>
}

type DirectoryUser = { uuid: string; nome: string; email: string; telefone: string | null }
type ZoneAssignment = { id: string; acs_id: string; zone_id: string; active: boolean; created_at: string; ended_at: string | null }

function ZoneManagement({ zones, onChanged }: { zones: CensusZone[]; onChanged: () => void }) {
  const [acs, setAcs] = useState<CensusAcs[]>([])
  const [assignments, setAssignments] = useState<ZoneAssignment[]>([])
  const [zoneName, setZoneName] = useState('')
  const [zoneColor, setZoneColor] = useState('#2c7892')
  const [editingZoneId, setEditingZoneId] = useState('')
  const [showZoneForm, setShowZoneForm] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userResults, setUserResults] = useState<DirectoryUser[]>([])
  const [selectedUser, setSelectedUser] = useState<DirectoryUser | null>(null)
  const [selectedAcs, setSelectedAcs] = useState('')
  const [selectedZone, setSelectedZone] = useState('')
  const [editingAssignmentId, setEditingAssignmentId] = useState('')
  const [showAssignmentForm, setShowAssignmentForm] = useState(false)
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [loadingLists, setLoadingLists] = useState(false)
  const [noticeTone, setNoticeTone] = useState<'success' | 'error'>('success')
  const [pendingWrite, setPendingWrite] = useState<'zone' | 'zone-status' | 'acs' | 'link' | 'unlink' | null>(null)
  const [pendingAssignment, setPendingAssignment] = useState<ZoneAssignment | null>(null)
  const [savingAction, setSavingAction] = useState<'zone' | 'zone-status' | 'acs' | 'link' | null>(null)
  const activeZones = zones.filter((zone) => zone.active)

  const loadLists = async () => {
    if (!supabase) return
    setLoadingLists(true)
    try {
      const [{ data: people, error: peopleError }, { data: links, error: linksError }] = await Promise.all([
        supabase.from('census_acs').select('id,full_name,email,phone,active,user_id').eq('active', true).order('full_name').limit(500),
        supabase.from('census_acs_zone_assignments').select('id,acs_id,zone_id,active,created_at,ended_at').order('created_at', { ascending: false }).limit(2000),
      ])
      if (peopleError) throw new Error(peopleError.message)
      if (linksError) throw new Error(linksError.message)
      setAcs((people || []) as CensusAcs[])
      setAssignments((links || []) as ZoneAssignment[])
    } catch (error) {
      setNoticeTone('error'); setNotice(`Não foi possível atualizar as listas: ${error instanceof Error ? error.message : 'tente novamente.'}`)
    } finally { setLoadingLists(false) }
  }
  useEffect(() => { void loadLists() }, [])
  useEffect(() => { if (!selectedZone && activeZones[0]) setSelectedZone(activeZones[0].id) }, [selectedZone, zones])
  useEffect(() => {
    const term = userSearch.trim()
    if (!supabase || term.length < 2 || selectedUser) { setUserResults([]); return }
    const db = supabase
    let cancelled = false
    const timer = window.setTimeout(async () => {
      const { data, error } = await db.from('usuarios').select('uuid,nome,email,telefone').eq('ativo', true).not('uuid', 'is', null).ilike('nome', `%${term}%`).order('nome').limit(12)
      if (!cancelled) {
        if (error) { setNoticeTone('error'); setNotice(`Não foi possível pesquisar usuários cadastrados: ${error.message}`); setUserResults([]) }
        else setUserResults((data || []).filter((item) => item.uuid && item.nome && item.email).map((item) => ({ uuid: item.uuid as string, nome: item.nome as string, email: item.email as string, telefone: item.telefone as string | null })))
      }
    }, 250)
    return () => { cancelled = true; window.clearTimeout(timer) }
  }, [userSearch, selectedUser])

  async function saveZone() {
    if (!supabase || !zoneName.trim()) return
    setSaving(true); setSavingAction('zone'); setNotice('')
    try {
      const query = editingZoneId
        ? supabase.from('census_zones').update({ name: zoneName.trim(), color: zoneColor, updated_at: new Date().toISOString() }).eq('id', editingZoneId)
        : supabase.from('census_zones').insert({ name: zoneName.trim(), color: zoneColor })
      const { error } = await query
      if (error) throw new Error(error.message)
      const wasEditing = Boolean(editingZoneId)
      setEditingZoneId(''); setShowZoneForm(false); setZoneName(''); setZoneColor('#2c7892')
      setNoticeTone('success'); setNotice(wasEditing ? 'Zona atualizada.' : 'Zona criada com sucesso.'); onChanged()
    } catch (error) {
      setNoticeTone('error'); setNotice(`Não foi possível salvar a zona: ${error instanceof Error ? error.message : 'tente novamente.'}`)
    } finally { setSaving(false); setSavingAction(null) }
  }
  async function toggleZoneActive() {
    const zone = zones.find((item) => item.id === editingZoneId)
    if (!supabase || !zone) return
    setSaving(true); setSavingAction('zone-status'); setNotice('')
    try {
      const { error } = await supabase.from('census_zones').update({ active: !zone.active, updated_at: new Date().toISOString() }).eq('id', zone.id)
      if (error) throw new Error(error.message)
      setEditingZoneId(''); setShowZoneForm(false); setZoneName(''); setZoneColor('#2c7892')
      setNoticeTone('success'); setNotice(zone.active ? 'Zona inativada. O histórico e os vínculos foram preservados.' : 'Zona reativada.'); onChanged(); await loadLists()
    } catch (error) {
      setNoticeTone('error'); setNotice(`Não foi possível alterar o estado da zona: ${error instanceof Error ? error.message : 'tente novamente.'}`)
    } finally { setSaving(false); setSavingAction(null) }
  }
  async function createAcs() {
    if (!supabase || !selectedUser) return
    setSaving(true); setSavingAction('acs'); setNotice('')
    try {
      const { error } = await supabase.from('census_acs').insert({ full_name: selectedUser.nome, email: selectedUser.email, phone: selectedUser.telefone, user_id: selectedUser.uuid })
      if (error) throw new Error(error.message)
      setUserSearch(''); setSelectedUser(null); setNoticeTone('success'); setNotice('ACS vinculado ao usuário cadastrado no sistema.'); await loadLists()
    } catch (error) {
      setNoticeTone('error'); setNotice(`Não foi possível cadastrar o ACS: ${error instanceof Error ? error.message : 'tente novamente.'}`)
    } finally { setSaving(false); setSavingAction(null) }
  }
  async function saveAssignment() {
    if (!supabase || !selectedAcs || !selectedZone) return
    setSaving(true); setSavingAction('link'); setNotice('')
    try {
      const { error } = await supabase.rpc('census_save_acs_zone_assignment', { p_assignment_id: editingAssignmentId || null, p_acs_id: selectedAcs, p_zone_id: selectedZone })
      if (error) throw new Error(error.message)
      setEditingAssignmentId(''); setShowAssignmentForm(false); setSelectedAcs(''); setSelectedZone(activeZones[0]?.id || '')
      setNoticeTone('success'); setNotice('Vínculo territorial salvo; o vínculo anterior foi preservado no histórico.'); await loadLists()
    } catch (error) {
      setNoticeTone('error'); setNotice(`Não foi possível salvar o vínculo: ${error instanceof Error ? error.message : 'tente novamente.'}`)
    } finally { setSaving(false); setSavingAction(null) }
  }
  async function deactivateAssignment(assignment: ZoneAssignment) {
    if (!supabase) return
    setSaving(true); setSavingAction('link'); setNotice('')
    try {
      const { error } = await supabase.rpc('census_save_acs_zone_assignment', { p_assignment_id: assignment.id, p_acs_id: null, p_zone_id: null })
      if (error) throw new Error(error.message)
      setNoticeTone('success'); setNotice('Vínculo encerrado e mantido no histórico.'); await loadLists()
    } catch (error) {
      setNoticeTone('error'); setNotice(`Não foi possível encerrar o vínculo: ${error instanceof Error ? error.message : 'tente novamente.'}`)
    } finally { setSaving(false); setSavingAction(null) }
  }
  function startEditZone(zone: CensusZone) { setEditingZoneId(zone.id); setZoneName(zone.name); setZoneColor(zone.color); setShowZoneForm(true) }
  function startEditAssignment(link: ZoneAssignment) { setEditingAssignmentId(link.id); setSelectedAcs(link.acs_id); setSelectedZone(link.zone_id); setShowAssignmentForm(true) }
  function startNewZone() { setEditingZoneId(''); setZoneName(''); setZoneColor('#2c7892'); setShowZoneForm(true) }
  function startNewAssignment() { setEditingAssignmentId(''); setSelectedAcs(''); setSelectedZone(activeZones[0]?.id || ''); setShowAssignmentForm(true) }
  function confirmPendingWrite() {
    const action = pendingWrite; setPendingWrite(null)
    if (action === 'zone') void saveZone()
    if (action === 'zone-status') void toggleZoneActive()
    if (action === 'acs') void createAcs()
    if (action === 'link') void saveAssignment()
    if (action === 'unlink' && pendingAssignment) { const assignment = pendingAssignment; setPendingAssignment(null); void deactivateAssignment(assignment) }
  }
  const confirmation = pendingWrite === 'zone'
    ? { title: editingZoneId ? 'Salvar alterações da zona?' : 'Criar esta zona?', description: `A zona “${zoneName.trim()}” será ${editingZoneId ? 'atualizada' : 'adicionada'} sem remover o histórico dos lotes.`, confirmLabel: editingZoneId ? 'Salvar zona' : 'Criar zona' }
    : pendingWrite === 'zone-status'
      ? { title: zones.find((zone) => zone.id === editingZoneId)?.active ? 'Inativar esta zona?' : 'Reativar esta zona?', description: 'A zona não será excluída. Lotes, domicílios, visitas e vínculos históricos permanecem preservados.', confirmLabel: zones.find((zone) => zone.id === editingZoneId)?.active ? 'Inativar zona' : 'Reativar zona' }
      : pendingWrite === 'acs'
        ? { title: 'Vincular usuário como ACS?', description: `${selectedUser?.nome || ''} (${selectedUser?.email || ''}) já possui cadastro no sistema e será associado ao catálogo ACS.`, confirmLabel: 'Vincular ACS' }
        : pendingWrite === 'link'
          ? { title: editingAssignmentId ? 'Atualizar vínculo territorial?' : 'Criar vínculo territorial?', description: `${acs.find((person) => person.id === selectedAcs)?.full_name || 'O ACS selecionado'} será vinculado a ${activeZones.find((zone) => zone.id === selectedZone)?.name || 'à zona selecionada'}. O vínculo anterior será encerrado, não apagado.`, confirmLabel: editingAssignmentId ? 'Atualizar vínculo' : 'Criar vínculo' }
          : pendingWrite === 'unlink'
            ? { title: 'Encerrar este vínculo?', description: 'A relação atual será encerrada, mas permanecerá disponível no histórico territorial.', confirmLabel: 'Encerrar vínculo' }
            : null
  const linkedAcs = acs.filter((person) => Boolean(person.user_id))
  const activeLinks = assignments.filter((link) => link.active)
  const zoneAcsNames = (zoneId: string) => activeLinks.filter((link) => link.zone_id === zoneId).map((link) => acs.find((person) => person.id === link.acs_id)?.full_name).filter(Boolean)
  const acsZoneNames = (acsId: string) => activeLinks.filter((link) => link.acs_id === acsId).map((link) => zones.find((zone) => zone.id === link.zone_id)?.name).filter(Boolean)
  const cancelZoneEdit = () => { setEditingZoneId(''); setShowZoneForm(false); setZoneName(''); setZoneColor('#2c7892') }
  const cancelAssignmentEdit = () => { setEditingAssignmentId(''); setShowAssignmentForm(false); setSelectedAcs(''); setSelectedZone(activeZones[0]?.id || '') }
  const refreshLists = () => { void loadLists(); onChanged() }

  return <section className="fleet-section fleet-page-section census-zones-page">
    <header className="census-zones-intro">
      <span className="fleet-kicker">ORGANIZAÇÃO DO TERRITÓRIO</span><h2>Zonas e ACS</h2>
      <p>Faça em ordem: organize as zonas, vincule os ACS já cadastrados no sistema e confira quem responde por cada território.</p>
      <ol className="census-zones-step-guide" aria-label="Etapas para organizar o território"><li><span>1</span><div><strong>Zonas</strong><small>Crie ou revise</small></div></li><li aria-hidden="true" className="census-step-arrow">›</li><li><span>2</span><div><strong>Equipe ACS</strong><small>Selecione usuários</small></div></li><li aria-hidden="true" className="census-step-arrow">›</li><li><span>3</span><div><strong>Responsáveis</strong><small>Associe à zona</small></div></li></ol>
    </header>
    {notice && <div className={noticeTone === 'error' ? 'fleet-inline-error' : 'fleet-inline-success'} role={noticeTone === 'error' ? 'alert' : 'status'}>{noticeTone === 'error' ? <AlertCircle size={15} /> : <CheckCircle2 size={15} />}{notice}</div>}
    {saving && <div className="census-write-progress" role="status"><LoaderCircle className="spin" size={18} /><span>{savingAction === 'zone' ? 'Salvando a zona…' : savingAction === 'zone-status' ? 'Atualizando o estado da zona…' : savingAction === 'acs' ? 'Vinculando o usuário ao catálogo ACS…' : 'Salvando o vínculo…'} Aguarde.</span></div>}

    <div className="census-zones-flow">
      <section className="fleet-panel census-management-card census-workflow-step" aria-labelledby="zoneStepTitle">
        <div className="census-step-heading"><span className="census-step-number">1</span><div><span className="fleet-kicker">PRIMEIRO PASSO</span><h3 id="zoneStepTitle">Organize as zonas</h3></div><button type="button" className="fleet-primary-button" onClick={startNewZone} disabled={saving}><Plus size={15} />Nova zona</button></div>
        <p>As zonas dividem o território. Se precisar retirar uma do uso, inative-a; lotes e histórico não serão apagados.</p>
        <div className="census-zone-directory">{zones.map((zone) => { const names = zoneAcsNames(zone.id); return <article className={`census-zone-directory-row${zone.active ? '' : ' inactive'}`} key={zone.id}><i className="census-zone-swatch" style={{ background: zone.color }} /><div className="census-zone-directory-copy"><strong>{zone.name}</strong><small>{names.length ? `Responsável${names.length > 1 ? 'is' : ''}: ${names.join(', ')}` : 'Nenhum ACS responsável vinculado'}</small></div><span className={`census-state-pill${zone.active ? ' active' : ''}`}>{zone.active ? 'Ativa' : 'Inativa'}</span><button type="button" className="fleet-secondary-button" onClick={() => startEditZone(zone)} disabled={saving}>Editar</button></article> })}{!zones.length && <div className="census-flow-empty"><MapPinned size={20} /><span><strong>Nenhuma zona cadastrada</strong><small>Comece criando a primeira zona do território.</small></span></div>}</div>
        {showZoneForm && <div className="census-flow-form census-zone-edit-form"><div className="census-flow-form-title"><strong>{editingZoneId ? 'Editar dados da zona' : 'Nova zona'}</strong><small>Informe o nome e a cor que serão identificados no mapa.</small></div><div className="census-zone-edit-fields"><label>Nome da zona<input value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="Ex.: Zona Norte" disabled={saving} /></label><label>Cor no mapa<div className="census-color-input"><input type="color" value={zoneColor} onChange={(event) => setZoneColor(event.target.value)} disabled={saving} /><span>{zoneColor}</span></div></label></div><div className="census-zone-form-actions"><button type="button" className="fleet-primary-button" disabled={saving || !zoneName.trim()} onClick={() => setPendingWrite('zone')}>{editingZoneId ? <Save size={15} /> : <Check size={15} />}{editingZoneId ? 'Salvar zona' : 'Criar zona'}</button>{editingZoneId && <button type="button" className="fleet-secondary-button" disabled={saving} onClick={() => setPendingWrite('zone-status')}>{zones.find((zone) => zone.id === editingZoneId)?.active ? 'Inativar zona' : 'Reativar zona'}</button>}<button type="button" className="fleet-secondary-button" disabled={saving} onClick={cancelZoneEdit}>Cancelar</button></div></div>}
      </section>

      <section className="fleet-panel census-management-card census-workflow-step" aria-labelledby="acsStepTitle">
        <div className="census-step-heading"><span className="census-step-number">2</span><div><span className="fleet-kicker">EQUIPE</span><h3 id="acsStepTitle">Selecione os ACS cadastrados</h3></div></div>
        <p>Digite o nome e escolha uma pessoa da lista. O ACS precisa ter uma conta ativa no sistema; não é criado um usuário novo aqui.</p>
        <div className="census-acs-work-area"><div className="census-acs-search-panel">
          <label>Buscar usuário pelo nome<input value={userSearch} onChange={(event) => { setUserSearch(event.target.value); setSelectedUser(null) }} placeholder="Comece a digitar um nome…" disabled={saving} autoComplete="off" /></label>
          {userSearch.trim().length > 0 && userSearch.trim().length < 2 && <small className="census-directory-help">Digite mais uma letra para ver sugestões.</small>}
          {userResults.length > 0 && <div className="census-user-suggestions" role="listbox" aria-label="Usuários encontrados">{userResults.map((user) => <button type="button" role="option" aria-selected={false} key={user.uuid} onClick={() => { setSelectedUser(user); setUserSearch(user.nome); setUserResults([]) }}><strong>{user.nome}</strong><small>{user.email}</small></button>)}</div>}
          {userSearch.trim().length >= 2 && !selectedUser && !userResults.length && <small className="census-directory-help">Nenhum usuário ativo encontrado com esse nome.</small>}
          {selectedUser && <div className="census-selected-user"><CheckCircle2 size={17} /><span><strong>{selectedUser.nome}</strong><small>{selectedUser.email}</small></span></div>}
          <button type="button" className="fleet-primary-button" disabled={saving || !selectedUser} onClick={() => setPendingWrite('acs')}>{savingAction === 'acs' ? <LoaderCircle className="spin" size={15} /> : <UserPlus size={15} />}{savingAction === 'acs' ? 'Vinculando…' : 'Adicionar à equipe ACS'}</button>
        </div><div className="census-acs-directory"><div className="census-sublist-heading"><strong>Equipe cadastrada</strong><span>{linkedAcs.length} vinculado(s) a usuário</span></div>
          {acs.map((person) => { const zoneNames = acsZoneNames(person.id); return <div className={`census-acs-directory-row${person.user_id ? '' : ' legacy'}`} key={person.id}><span className="fleet-user-avatar">{person.full_name[0]?.toUpperCase()}</span><span><strong>{person.full_name}</strong><small>{!person.user_id ? 'Conta do sistema ainda não vinculada' : zoneNames.length ? `Zona${zoneNames.length > 1 ? 's' : ''}: ${zoneNames.join(', ')}` : 'Ainda sem zona responsável'}</small></span></div> })}
          {!acs.length && <div className="census-flow-empty compact"><UsersRound size={18} /><span><strong>A equipe ainda não tem ACS</strong><small>Pesquise pelo nome acima para adicionar um usuário cadastrado.</small></span></div>}
        </div></div>
      </section>

      <section className="fleet-panel census-link-card census-workflow-step" aria-labelledby="assignmentStepTitle">
        <div className="census-step-heading"><span className="census-step-number">3</span><div><span className="fleet-kicker">DISTRIBUIÇÃO DO TERRITÓRIO</span><h3 id="assignmentStepTitle">Quem responde por cada zona?</h3></div><button type="button" className="fleet-secondary-button census-refresh-list" onClick={refreshLists} disabled={loadingLists || saving}>{loadingLists ? <LoaderCircle className="spin" size={14} /> : <RotateCcw size={14} />}Atualizar lista</button></div>
        <p>Confira a relação atual. Para mudar um responsável, edite o vínculo; o anterior fica guardado no histórico.</p>
        <div className="census-zone-responsibilities">{zones.map((zone) => { const zoneLinks = activeLinks.filter((link) => link.zone_id === zone.id); return <article className={`census-zone-responsibility${zone.active ? '' : ' inactive'}`} key={zone.id}><header><i style={{ background: zone.color }} /><div><strong>{zone.name}</strong><small>{zone.active ? 'Zona ativa' : 'Zona inativa · sem operação até reativar'}</small></div></header><div className="census-zone-responsibility-links">{zoneLinks.length ? zoneLinks.map((link) => { const person = acs.find((item) => item.id === link.acs_id); return <div className="census-zone-responsibility-link" key={link.id}><span><strong>{person?.full_name || 'ACS indisponível'}</strong><small>{person?.user_id ? 'Responsável vinculado' : 'Conta pendente de associação'}</small></span><button type="button" className="fleet-secondary-button" onClick={() => startEditAssignment(link)} disabled={saving}>Editar vínculo</button></div> }) : <div className="census-zone-unassigned"><span>Sem ACS responsável</span>{zone.active && <button type="button" onClick={() => { startNewAssignment(); setSelectedZone(zone.id) }} disabled={!linkedAcs.length || saving}>Atribuir ACS</button>}</div>}</div></article> })}{!zones.length && <div className="census-flow-empty compact"><MapPinned size={18} /><span><strong>Cadastre uma zona primeiro</strong><small>Ela aparecerá aqui para receber um ACS responsável.</small></span></div>}</div>
        <div className="census-assignment-actions"><button type="button" className="fleet-primary-button" onClick={startNewAssignment} disabled={!activeZones.length || !linkedAcs.length || saving}><Plus size={15} />Novo vínculo Zona × ACS</button>{!activeZones.length && <small>Cadastre ou reative uma zona para criar vínculos.</small>}{activeZones.length > 0 && !linkedAcs.length && <small>Adicione um ACS cadastrado no passo 2 para começar.</small>}</div>
        {showAssignmentForm && <div className="census-flow-form census-assignment-edit-form"><div className="census-flow-form-title"><strong>{editingAssignmentId ? 'Atualizar vínculo' : 'Novo vínculo territorial'}</strong><small>Escolha a pessoa e a zona ativa que ficará sob sua responsabilidade.</small></div><div className="census-link-form"><label>ACS<select value={selectedAcs} onChange={(event) => setSelectedAcs(event.target.value)} disabled={saving}><option value="">Selecione um ACS</option>{linkedAcs.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}{editingAssignmentId && acs.find((person) => person.id === selectedAcs && !person.user_id) && <option value={selectedAcs}>{acs.find((person) => person.id === selectedAcs)?.full_name} — conta não vinculada</option>}</select>{editingAssignmentId && acs.find((person) => person.id === selectedAcs && !person.user_id) && <small className="census-directory-help">Escolha um ACS associado a usuário cadastrado para substituir este vínculo antigo.</small>}</label><label>Zona<select value={selectedZone} onChange={(event) => setSelectedZone(event.target.value)} disabled={saving}><option value="">Selecione uma zona ativa</option>{activeZones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label><div className="census-assignment-form-actions"><button type="button" className="fleet-primary-button" disabled={saving || !selectedAcs || !selectedZone || !linkedAcs.some((person) => person.id === selectedAcs)} onClick={() => setPendingWrite('link')}>{savingAction === 'link' ? <LoaderCircle className="spin" size={15} /> : <Check size={15} />}{editingAssignmentId ? 'Salvar alteração' : 'Criar vínculo'}</button><button type="button" className="fleet-secondary-button" onClick={cancelAssignmentEdit} disabled={saving}>Cancelar</button></div></div></div>}
        <details className="census-assignment-history"><summary>Histórico de vínculos encerrados ({assignments.filter((link) => !link.active).length})</summary><div className="census-assignment-history-list">{assignments.filter((link) => !link.active).map((link) => <div className="census-assignment-history-row" key={link.id}><span>{zones.find((zone) => zone.id === link.zone_id)?.name || 'Zona'} × {acs.find((person) => person.id === link.acs_id)?.full_name || 'ACS'}</span><small>{link.ended_at ? `Encerrado em ${new Intl.DateTimeFormat('pt-BR').format(new Date(link.ended_at))}` : 'Encerrado'}</small></div>)}{!assignments.some((link) => !link.active) && <small>Nenhum vínculo encerrado.</small>}</div></details>
      </section>
    </div>
    {confirmation && <CensusWriteConfirmation {...confirmation} onCancel={() => setPendingWrite(null)} onConfirm={confirmPendingWrite} />}
  </section>
}
function MapPreparationWorkspace() {
  const [mapImport, setMapImport] = useState<MapImport | null>(null)
  const [publishedMapImport, setPublishedMapImport] = useState<MapImport | null>(null)
  const [lots, setLots] = useState<Lot[]>([])
  const [publishedLots, setPublishedLots] = useState<Lot[]>([])
  const [zones, setZones] = useState<CensusZone[]>([])
  const [activeZoneId, setActiveZoneId] = useState('')
  const [showOnlyUnassigned, setShowOnlyUnassigned] = useState(false)
  const [showOnlyNewLots, setShowOnlyNewLots] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeTone, setNoticeTone] = useState<CensusNoticeTone>('success')
  const [pendingWrite, setPendingWrite] = useState<'import' | 'save' | 'publish' | null>(null)
  const [activeWrite, setActiveWrite] = useState<'import' | 'save' | 'publish' | 'export' | null>(null)
  const [mapView, setMapView] = useState({ zoom: 1, pan: { x: 0, y: 0 } })
  const { zoom, pan } = mapView
  const [dragging, setDragging] = useState(false)
  const [areaSelectMode, setAreaSelectMode] = useState(false)
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectedLotKeys, setSelectedLotKeys] = useState<string[]>([])
  const [focusedLotKey, setFocusedLotKey] = useState<string | null>(null)
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const mapViewportRef = useRef<HTMLDivElement | null>(null)
  const areaGestureRef = useRef<AreaSelectionGesture | null>(null)
  const areaRectOverlayRef = useRef<SVGRectElement | null>(null)
  const pointerMapRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef<{ distance: number; zoom: number; pan: { x: number; y: number }; anchor: { x: number; y: number } } | null>(null)
  const pinchWasActiveRef = useRef(false)
  const pendingLotKeyRef = useRef<string | null>(null)
  const movedRef = useRef(false)

  const loadWorkspace = async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    try {
      const [{ data: territoryImports, error: territoryError }, { data: drafts, error: draftError }, { data: zoneRows }] = await Promise.all([
        supabase.from('census_territory_map_imports').select('id,file_name,status,bbox,updated_at,division_saved_at,published_at,is_current').order('published_at', { ascending: false }).limit(1),
        supabase.from('census_map_imports').select('id,file_name,mime_type,file_size,storage_path,source_layer,status,total_features,valid_features,problematic_features,bbox,updated_at,published_at,division_saved_at,is_current').eq('status', 'DRAFT').order('updated_at', { ascending: false }).limit(1),
      supabase.from('census_zones').select('id,name,color,active').eq('active', true).order('created_at').limit(100),
      ])
      if (territoryError) throw new Error(territoryError.message)
      if (draftError) throw new Error(draftError.message)
      const nextZones = (zoneRows || []) as CensusZone[]
      setZones(nextZones); setActiveZoneId((current) => current || nextZones[0]?.id || '')
      const active = (territoryImports?.[0] || null) as MapImport | null
      setPublishedMapImport(active)
      const currentRows = active ? await fetchTerritoryLots(supabase, active.id) : []
      setPublishedLots(currentRows)
      const draft = (drafts?.[0] || null) as MapImport | null
      if (draft) {
        setMapImport(draft)
        setLots(await fetchPreparationLots(supabase, draft.id))
      } else {
        setMapImport(active)
        setLots(currentRows)
      }
    } catch (error) {
      setNoticeTone('error')
      setNotice(`Não foi possível carregar a preparação do mapa: ${error instanceof Error ? error.message : 'tente novamente.'}`)
      setMapImport(null); setLots([]); setPublishedMapImport(null); setPublishedLots([])
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { void loadWorkspace() }, [])
  useEffect(() => {
    const viewport = mapViewportRef.current
    if (!viewport) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      const bounds = viewport.getBoundingClientRect()
      const anchor = {
        x: event.clientX - (bounds.left + bounds.width / 2),
        y: event.clientY - (bounds.top + bounds.height / 2),
      }
      const factor = event.deltaY < 0 ? 1.15 : 1 / 1.15
      setMapView((current) => zoomMapViewAtOffset(current, factor, anchor))
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [loading])

  const bbox = mapImport?.bbox || (lots.length ? { minX: Math.min(...lots.flatMap((lot) => lot.geometry.map((point) => point[0]))), minY: Math.min(...lots.flatMap((lot) => lot.geometry.map((point) => point[1]))), maxX: Math.max(...lots.flatMap((lot) => lot.geometry.map((point) => point[0]))), maxY: Math.max(...lots.flatMap((lot) => lot.geometry.map((point) => point[1]))) } : null)
  const width = bbox ? Math.max(bbox.maxX - bbox.minX, 1) : 1
  const height = bbox ? Math.max(bbox.maxY - bbox.minY, 1) : 1
  const toSvgPoint = (point: Point): Point => bbox ? [((point[0] - bbox.minX) / width) * 1000, ((bbox.maxY - point[1]) / height) * 1000] : [0, 0]
  const toSvg = (point: Point) => toSvgPoint(point).join(',')
  const assignedCount = lots.filter((lot) => lot.zone_id).length
  const mergeMatchIds = new Set(lots.map((lot) => lot.matched_lot_id).filter((id): id is string => Boolean(id)))
  const matchedLotsCount = mapImport?.status === 'DRAFT' ? lots.filter((lot) => lot.merge_status === 'MATCHED').length : 0
  const newCandidateCount = mapImport?.status === 'DRAFT' ? lots.filter((lot) => lot.merge_status !== 'MATCHED').length : 0
  const missingFromNewMapCount = mapImport?.status === 'DRAFT' && publishedMapImport ? publishedLots.filter((lot) => lot.id && !mergeMatchIds.has(lot.id)).length : 0
  const comparisonLots = showOnlyNewLots && mapImport?.status === 'DRAFT' ? lots.filter((lot) => lot.merge_status !== 'MATCHED') : lots
  const visibleLots = filterUnassignedLots(comparisonLots, showOnlyUnassigned)
  const visibleLotKeys = new Set(visibleLots.map(getLotKey))
  const visibleLotsCount = visibleLots.length
  const visibleAssignedCount = visibleLots.filter((lot) => lot.zone_id).length
  const zoneCount = (zoneId: string) => visibleLots.filter((lot) => lot.zone_id === zoneId).length

  function toggleUnassignedFilter() {
    setShowOnlyUnassigned((current) => !current)
    setSelectedLotKeys([])
  }

  function clientToSvgPoint(clientX: number, clientY: number): Point | null {
    const svg = mapViewportRef.current?.querySelector('svg')
    const matrix = svg?.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return [point.x, point.y]
  }
  function updateAreaRectOverlay(start: Point, current: Point, crossing: boolean) {
    const overlay = areaRectOverlayRef.current
    if (!overlay) return
    overlay.setAttribute('x', String(Math.min(start[0], current[0])))
    overlay.setAttribute('y', String(Math.min(start[1], current[1])))
    overlay.setAttribute('width', String(Math.abs(current[0] - start[0])))
    overlay.setAttribute('height', String(Math.abs(current[1] - start[1])))
    overlay.setAttribute('class', `census-area-selection-rect ${crossing ? 'crossing' : 'window'}`)
    overlay.removeAttribute('display')
  }
  function clearAreaRectOverlay() {
    areaRectOverlayRef.current?.setAttribute('display', 'none')
  }

  function assignLot(lot: Lot, multiSelect = false) {
    if (mapImport?.status !== 'DRAFT') {
      setNoticeTone('info'); setNotice('A versão operacional está protegida. Importe um novo DXF para preparar e revisar um rascunho sem alterar o mapa usado pelos ACSs.'); return
    }
    if (areaSelectMode || multiSelect) {
      const key = getLotKey(lot)
      setFocusedLotKey(key)
      setSelectedLotKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
      return
    }
    if (!activeZoneId) { setNoticeTone('info'); setNotice('Cadastre e selecione uma zona antes de clicar nos lotes.'); return }
    const key = getLotKey(lot)
    setFocusedLotKey(key)
    setLots((current) => assignLotToZone(current, key, activeZoneId))
  }
  function assignSelectedLots() {
    if (mapImport?.status !== 'DRAFT') { setNoticeTone('info'); setNotice('Importe um novo DXF para criar um rascunho antes de alterar zonas.'); return }
    if (!activeZoneId) { setNoticeTone('info'); setNotice('Selecione uma zona antes de atribuir os lotes.'); return }
    if (!selectedLotKeys.length) return
    setLots((current) => assignLotsToZone(current, selectedLotKeys, activeZoneId))
    setSelectedLotKeys([])
  }
  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointerMapRef.current.size === 2 && !areaSelectMode) {
      const points = [...pointerMapRef.current.values()]
      const bounds = mapViewportRef.current?.getBoundingClientRect()
      const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      pinchRef.current = { distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y), zoom: mapView.zoom, pan: { ...mapView.pan }, anchor: bounds ? { x: mid.x - bounds.left - bounds.width / 2, y: mid.y - bounds.top - bounds.height / 2 } : { x: 0, y: 0 } }
      pinchWasActiveRef.current = true
      movedRef.current = true
      setDragging(false)
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (areaSelectMode) {
      const start = clientToSvgPoint(event.clientX, event.clientY)
      if (!start) return
      const target = event.target instanceof Element ? event.target.closest('[data-lot-key]') : null
      const targetLotKey = target?.getAttribute('data-lot-key') || null
      areaGestureRef.current = { start, current: start, startClientX: event.clientX, startClientY: event.clientY, targetLotKey, additive: event.shiftKey || event.ctrlKey || event.metaKey }
      setIsAreaSelecting(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      updateAreaRectOverlay(start, start, false)
      event.preventDefault()
      return
    }
    const targetIsLot = event.target instanceof Element && event.target.closest('polygon') !== null
    const target = event.target instanceof Element ? event.target.closest('[data-lot-key]') : null
    pendingLotKeyRef.current = target?.getAttribute('data-lot-key') || null
    movedRef.current = false
    if (!shouldStartMapPan(targetIsLot) && !pendingLotKeyRef.current) { pointerMapRef.current.delete(event.pointerId); return }
    dragStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!pointerMapRef.current.has(event.pointerId)) return
    pointerMapRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    const gesture = areaGestureRef.current
    if (areaSelectMode && gesture) {
      const current = clientToSvgPoint(event.clientX, event.clientY)
      if (!current) return
      gesture.current = current
      updateAreaRectOverlay(gesture.start, current, event.clientX < gesture.startClientX)
      return
    }
    if (pointerMapRef.current.size >= 2 && pinchRef.current) {
      const points = [...pointerMapRef.current.values()]
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
      if (pinchRef.current.distance > 0) {
        const bounds = mapViewportRef.current?.getBoundingClientRect()
        const mid = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
        const anchor = bounds ? { x: mid.x - bounds.left - bounds.width / 2, y: mid.y - bounds.top - bounds.height / 2 } : pinchRef.current.anchor
        const next = zoomMapViewAtOffset({ zoom: pinchRef.current.zoom, pan: pinchRef.current.pan }, distance / pinchRef.current.distance, anchor)
        setMapView(next)
      }
      return
    }
    if (Math.hypot(event.clientX - dragStart.current.x, event.clientY - dragStart.current.y) < 8) return
    movedRef.current = true
    if (!dragging) setDragging(true)
    setMapView((current) => ({ ...current, pan: { x: dragStart.current.panX + event.clientX - dragStart.current.x, y: dragStart.current.panY + event.clientY - dragStart.current.y } }))
  }
  function finishPointerAction(event: React.PointerEvent<HTMLDivElement>) {
    const tapLotKey = pendingLotKeyRef.current
    const wasTap = !movedRef.current && !pinchWasActiveRef.current && pointerMapRef.current.size === 1
    pointerMapRef.current.delete(event.pointerId)
    const tappedLot = tapLotKey ? lots.find((lot) => getLotKey(lot) === tapLotKey) : null
    if (wasTap && tappedLot && !areaSelectMode) assignLot(tappedLot, event.ctrlKey || event.metaKey)
    if (pointerMapRef.current.size < 2) pinchRef.current = null
    if (!pointerMapRef.current.size) pinchWasActiveRef.current = false
    pendingLotKeyRef.current = null
    movedRef.current = false
    const gesture = areaGestureRef.current
    if (!gesture) { setDragging(false); return }
    const end = clientToSvgPoint(event.clientX, event.clientY) || gesture.current
    const distance = Math.hypot(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY)
    let picked: string[]
    if (distance < 4) {
      picked = gesture.targetLotKey ? [gesture.targetLotKey] : []
    } else {
      const rect = { left: Math.min(gesture.start[0], end[0]), top: Math.min(gesture.start[1], end[1]), right: Math.max(gesture.start[0], end[0]), bottom: Math.max(gesture.start[1], end[1]) }
      const polygons = visibleLots.map((lot) => ({ key: getLotKey(lot), points: lot.geometry.map(toSvgPoint) }))
      picked = selectLotKeysInRect(polygons, rect, event.clientX < gesture.startClientX ? 'crossing' : 'window')
    }
    setSelectedLotKeys((current) => mergeSelectedLotKeys(current, picked, gesture.additive))
    areaGestureRef.current = null
    setIsAreaSelecting(false)
    setDragging(false)
    clearAreaRectOverlay()
  }
  function cancelPointerAction() {
    pointerMapRef.current.clear()
    pinchRef.current = null
    pinchWasActiveRef.current = false
    pendingLotKeyRef.current = null
    movedRef.current = false
    areaGestureRef.current = null
    setIsAreaSelecting(false)
    setDragging(false)
    clearAreaRectOverlay()
  }
  function zoomBy(factor: number) { setMapView((current) => zoomMapViewAtOffset(current, factor, { x: 0, y: 0 })) }
  function resetView() { setMapView({ zoom: 1, pan: { x: 0, y: 0 } }); setSelectedLotKeys([]); setAreaSelectMode(false); cancelPointerAction() }
  function toggleAreaSelectMode() {
    if (areaSelectMode) {
      setAreaSelectMode(false)
      cancelPointerAction()
    } else {
      setAreaSelectMode(true)
    }
  }
  useEffect(() => {
    if (!areaSelectMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSelectedLotKeys([])
      setAreaSelectMode(false)
      areaGestureRef.current = null
      setIsAreaSelecting(false)
      setDragging(false)
      areaRectOverlayRef.current?.setAttribute('display', 'none')
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [areaSelectMode])
  async function importWorkspaceMap() {
    const db = supabase
    if (!db || !file) return
    setSaving(true); setActiveWrite('import'); setNotice('')
    try {
      const { data: existingDrafts, error: draftError } = await db.from('census_map_imports').select('id').eq('status', 'DRAFT').limit(1)
      if (draftError) throw new Error(draftError.message)
      if (existingDrafts?.length) throw new Error('Já existe um rascunho em preparação. Salve e publique-o antes de importar outro mapa.')
      if (!/\.dxf$/i.test(file.name)) throw new Error('Selecione um arquivo DXF ASCII.')
      const dxfBytes = await file.arrayBuffer()
      const parsed = parseDxfLotBoundaries(new TextDecoder('windows-1252').decode(dxfBytes))
      if (!parsed.lots.length) throw new Error('A camada Lotes Urbanos não contém polígonos fechados com área válida.')
      const id = crypto.randomUUID(); const path = `imports/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const matchedRows = matchDraftLotsToCurrent(withLotIds(parsed.lots, () => crypto.randomUUID()), publishedLots)
      const upload = await db.storage.from('census-maps').upload(path, file, { contentType: file.type || 'application/dxf', upsert: false })
      if (upload.error) throw new Error(upload.error.message)
      const record = { id, file_name: file.name, mime_type: file.type || 'application/dxf', file_size: file.size, storage_path: path, source_layer: parsed.sourceLayer, status: 'DRAFT', is_current: false, total_features: parsed.entities.length, valid_features: parsed.lots.length, problematic_features: parsed.ignoredGeometryCount, bbox: parsed.bbox, division_saved_at: null, raw_metadata: { parser: 'client-dxf-entities-v4', entity_count: parsed.entities.length, ignored_geometry_count: parsed.ignoredGeometryCount, text_entity_count: parsed.entities.filter((entity) => Boolean(entity.text_content)).length, exact_geometry_matches: matchedRows.filter((lot) => lot.merge_status === 'MATCHED').length } }
      const inserted = await db.from('census_map_imports').insert(record)
      if (inserted.error) throw new Error(inserted.error.message)
      const rows = matchedRows.map((lot) => ({ ...lot, import_id: id }))
      await chunks(rows, 100, async (chunk) => { const result = await db.from('census_map_lots').insert(chunk); if (result.error) throw new Error(result.error.message) })
      const entityRows = parsed.entities.map((entity: DxfEntity) => ({ import_id: id, ...entity }))
      await chunks(entityRows, 100, async (chunk) => { const result = await db.from('census_map_dxf_entities').insert(chunk); if (result.error) throw new Error(`Não foi possível preservar as entidades originais do DXF: ${result.error.message}`) })
      setMapImport({ ...record, status: 'DRAFT', updated_at: new Date().toISOString(), published_at: null, division_saved_at: null } as MapImport); setLots(rows as Lot[]); setShowOnlyUnassigned(false); setShowOnlyNewLots(false); setFile(null); resetView(); setNoticeTone('success'); setNotice(`${parsed.lots.length.toLocaleString('pt-BR')} lotes no rascunho; ${matchedRows.filter((lot) => lot.merge_status === 'MATCHED').length.toLocaleString('pt-BR')} correspondem exatamente ao mapa operacional e herdaram suas zonas. ${matchedRows.filter((lot) => lot.merge_status !== 'MATCHED').length.toLocaleString('pt-BR')} são novos ou tiveram geometria alterada e precisam de revisão.${parsed.ignoredGeometryCount ? ` ${parsed.ignoredGeometryCount.toLocaleString('pt-BR')} geometria(s) inválida(s) foram ignoradas.` : ''} A versão dos ACSs não foi alterada.`)
    } catch (error) { setNoticeTone('error'); setNotice(error instanceof Error ? error.message : 'Não foi possível importar o mapa.') }
    finally { setSaving(false); setActiveWrite(null) }
  }
  async function saveWorkspace() {
    const db = supabase
    if (!db || !mapImport) return
    if (mapImport.status !== 'DRAFT') { setNoticeTone('info'); setNotice('A versão operacional não pode ser alterada diretamente. Importe um novo DXF para criar um rascunho.'); return }
    setSaving(true); setActiveWrite('save'); setNotice('')
    try {
      if (!lots.length) throw new Error('Não há lotes carregados para salvar. Recarregue o mapa e tente novamente.')
      const groups = groupLotSaveAssignments(lots)
      const lotIds = groups.flatMap((group) => group.lotIds)
      const existingIds = new Set<string>()
      await chunks(lotIds, 100, async (chunkIds) => {
        const { data, error } = await db.from('census_map_lots').select('id').eq('import_id', mapImport.id).in('id', chunkIds)
        if (error) throw new Error(`Não foi possível conferir os lotes antes de salvar: ${error.message}`)
        for (const row of data || []) existingIds.add(row.id)
      })
      const missingIds = lotIds.filter((id) => !existingIds.has(id))
      if (missingIds.length) throw new Error(`${missingIds.length.toLocaleString('pt-BR')} lote(s) não foram localizados nesta importação. Nenhuma alteração foi enviada ao banco; recarregue o mapa e tente novamente.`)

      const invalidated = await db.from('census_map_imports').update({ division_saved_at: null }).eq('id', mapImport.id).select('id').single()
      if (invalidated.error) throw new Error(`Não foi possível suspender a divisão publicada durante a atualização: ${invalidated.error.message}`)

      for (const group of groups) {
        await chunks(group.lotIds, 100, async (chunkIds) => {
          const { data, error } = await db.from('census_map_lots').update({ zone_id: group.zoneId, zone_number: null }).eq('import_id', mapImport.id).in('id', chunkIds).select('id')
          if (error) throw new Error(error.message)
          const updatedIds = new Set((data || []).map((row) => row.id))
          if (updatedIds.size !== chunkIds.length) throw new Error(`A atualização alcançou ${updatedIds.size} de ${chunkIds.length} lotes após a conferência. Recarregue o mapa e confira a divisão; uma parte pode já ter sido salva.`)
        })
      }
      const savedAt = new Date().toISOString()
      const result = await db.from('census_map_imports').update({ status: 'DRAFT', is_current: false, published_at: null, division_saved_at: savedAt }).eq('id', mapImport.id).select('id').single()
      if (result.error) throw new Error(result.error.message)
      setMapImport((current) => current ? { ...current, updated_at: savedAt, division_saved_at: savedAt } : current)
      setNoticeTone('success'); setNotice('Divisão salva com sucesso como rascunho.')
    } catch (error) { setNoticeTone('error'); setNotice(error instanceof Error ? error.message : 'Não foi possível salvar a divisão.') }
    finally { setSaving(false); setActiveWrite(null) }
  }

  async function publishWorkspace() {
    const db = supabase
    if (!db || !mapImport || mapImport.status !== 'DRAFT' || !mapImport.division_saved_at) return
    setSaving(true); setActiveWrite('publish'); setNotice('')
    try {
      const { data, error } = await db.rpc('census_map_publish_draft', { p_draft_import_id: mapImport.id })
      if (error) throw new Error(error.message)
      const result = data as { matched_existing_lots?: number; new_or_changed_lots?: number; published_lots?: number } | null
      setNoticeTone('success')
      setNotice(`Nova versão publicada para os ACSs com ${Number(result?.published_lots || lots.length).toLocaleString('pt-BR')} lotes. ${Number(result?.matched_existing_lots || 0).toLocaleString('pt-BR')} mantiveram a identidade e os vínculos históricos; ${Number(result?.new_or_changed_lots || 0).toLocaleString('pt-BR')} foram incorporados como novos ou alterados.`)
      await loadWorkspace()
    } catch (error) {
      setNoticeTone('error'); setNotice(`Não foi possível publicar o mapa: ${error instanceof Error ? error.message : 'tente novamente.'}`)
    } finally { setSaving(false); setActiveWrite(null) }
  }

  async function exportDxfPackage() {
    const db = supabase
    if (!db || !mapImport) return
    setSaving(true); setActiveWrite('export'); setNotice('')
    try {
      const entities: DxfEntity[] = []
      for (let from = 0; ; from += TERRITORY_PAGE_SIZE) {
        const { data, error } = await db.from('census_map_dxf_entities').select('entity_index,entity_type,layer_name,handle,text_content,insertion_point,geometry,raw_pairs,metadata').eq('import_id', mapImport.id).order('entity_index').range(from, from + TERRITORY_PAGE_SIZE - 1)
        if (error) throw new Error(error.message)
        const page = (data || []) as DxfEntity[]
        entities.push(...page)
        if (page.length < TERRITORY_PAGE_SIZE) break
      }
      const lots = await fetchPreparationLots(db, mapImport.id)
      const original = await db.storage.from('census-maps').createSignedUrl(mapImport.storage_path, 3600)
      const payload = { format: 'inteligencia-municipal.dxf-archive.v1', exported_at: new Date().toISOString(), original_dxf: { file_name: mapImport.file_name, storage_path: mapImport.storage_path, signed_url: original.data?.signedUrl || null }, import: mapImport, entities, lots }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${mapImport.file_name.replace(/\.dxf$/i, '')}-dados-completos.json`; anchor.click(); URL.revokeObjectURL(url)
      setNoticeTone('success'); setNotice(`Exportação concluída com ${entities.length.toLocaleString('pt-BR')} entidades DXF e ${lots.length.toLocaleString('pt-BR')} lotes.`)
    } catch (error) { setNoticeTone('error'); setNotice(`Não foi possível exportar os dados originais do DXF: ${error instanceof Error ? error.message : 'tente novamente.'}`) }
    finally { setSaving(false); setActiveWrite(null) }
  }

  async function downloadOriginalDxf() {
    const db = supabase
    if (!db || !mapImport) return
    const result = await db.storage.from('census-maps').createSignedUrl(mapImport.storage_path, 3600)
    if (result.error || !result.data?.signedUrl) { setNoticeTone('error'); setNotice('Não foi possível gerar o download do DXF original.'); return }
    const anchor = document.createElement('a'); anchor.href = result.data.signedUrl; anchor.download = mapImport.file_name; anchor.target = '_blank'; anchor.rel = 'noreferrer'; anchor.click()
  }

  function confirmPendingWrite() {
    const action = pendingWrite
    setPendingWrite(null)
    if (action === 'import') void importWorkspaceMap()
    if (action === 'save') void saveWorkspace()
    if (action === 'publish') void publishWorkspace()
  }
  const confirmation = pendingWrite === 'import'
      ? { title: 'Importar este mapa?', description: 'Um novo rascunho será enviado ao sistema e seus lotes serão cadastrados. O mapa importado anteriormente não será apagado.', confirmLabel: 'Importar mapa' }
      : pendingWrite === 'save'
      ? { title: 'Salvar o rascunho?', description: `${assignedCount.toLocaleString('pt-BR')} de ${lots.length.toLocaleString('pt-BR')} lotes estão com zona. A versão atualmente usada pelos ACSs continuará ativa.`, confirmLabel: 'Salvar rascunho' }
      : pendingWrite === 'publish'
        ? { title: 'Liberar este mapa para os ACSs?', description: 'A nova versão passará a ser operacional. Os lotes correspondidos manterão seus identificadores e vínculos históricos; a versão anterior será arquivada.', confirmLabel: 'Publicar mapa' }
      : null

  return (
    <section className="census-workspace" aria-busy={saving}>
      <div className="census-workspace-top">
        <div className="census-workspace-upload">
          <label className="census-file-picker"><Upload size={18} /><span><strong>{file ? file.name : 'Importar novo mapa DXF'}</strong><small>{file ? 'Arquivo selecionado para um rascunho' : mapImport?.status === 'DRAFT' ? 'Finalize ou publique o rascunho atual antes de importar outro' : 'O mapa operacional continuará ativo durante a preparação'}</small></span><input type="file" accept=".dxf,application/dxf" disabled={saving || mapImport?.status === 'DRAFT'} onChange={(event) => setFile(event.target.files?.[0] || null)} /></label>
          <button type="button" className="fleet-primary-button" disabled={!file || saving || mapImport?.status === 'DRAFT'} onClick={() => setPendingWrite('import')}>{activeWrite === 'import' ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />}{activeWrite === 'import' ? 'Importando mapa…' : 'Importar como rascunho'}</button>
          {mapImport && <><button type="button" className="fleet-secondary-button" disabled={saving} onClick={() => void downloadOriginalDxf()}><Download size={15} />Baixar DXF original</button><button type="button" className="fleet-secondary-button" disabled={saving} onClick={() => void exportDxfPackage()}><Download size={15} />Exportar dados completos</button></>}
        </div>
      </div>
      {mapImport?.status === 'PUBLISHED' && <div className="census-workspace-notice info" role="status"><MapPinned size={16} />Esta é a versão operacional publicada. Para mudar o mapa ou a divisão, importe um DXF; suas alterações ficarão em rascunho até você publicar.</div>}
      {mapImport?.status === 'DRAFT' && <div className="census-map-merge-summary" role="status"><div className="census-map-merge-heading"><strong>Rascunho comparado ao mapa usado pelos ACSs</strong><span>A versão operacional permanece ativa até a publicação.</span></div><div className="census-map-merge-metrics"><div><strong>{matchedLotsCount.toLocaleString('pt-BR')}</strong><span>lotes reconhecidos exatamente<br />e zonas preservadas</span></div><div className="review"><strong>{newCandidateCount.toLocaleString('pt-BR')}</strong><span>novos ou alterados<br />para revisar e zonear</span></div><div className="removed"><strong>{missingFromNewMapCount.toLocaleString('pt-BR')}</strong><span>lotes da versão atual<br />não encontrados no novo DXF</span></div></div><small>A correspondência automática exige geometria idêntica. Um lote com contorno alterado aparece como candidato para revisão, não é associado por aproximação.</small></div>}
      {saving && <div className="census-write-progress" role="status"><LoaderCircle className="spin" size={19} /><span>{activeWrite === 'import' ? 'Enviando o mapa e registrando os lotes no banco…' : activeWrite === 'publish' ? 'Publicando a nova versão de forma segura…' : `Conferindo e salvando ${lots.length.toLocaleString('pt-BR')} lotes…`}</span></div>}
      {notice && <div className={`census-workspace-notice ${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'}>{noticeTone === 'error' ? <AlertCircle size={16} /> : noticeTone === 'info' ? <MapPinned size={16} /> : <CheckCircle2 size={16} />}{notice}</div>}
      {loading ? <div className="fleet-loading"><LoaderCircle className="spin" size={18} /> Carregando mapa…</div> : <div className="census-workspace-grid">
        <div className={`census-workspace-map${saving ? ' saving' : ''}`}>
          <div className="census-map-toolbar"><span><Move size={14} /> {areaSelectMode ? 'Arraste da esquerda para a direita para incluir lotes inteiros; da direita para a esquerda para incluir os que cruzam a área. Esc cancela.' : 'Arraste para mover · clique aplica a zona · Ctrl/Cmd+clique seleciona · role para aproximar no cursor'}</span><div><button type="button" className={`census-area-selection-toggle${areaSelectMode ? ' active' : ''}`} aria-pressed={areaSelectMode} disabled={saving} onClick={toggleAreaSelectMode}><Move size={14} /><span>{areaSelectMode ? 'Sair da seleção por área' : 'Selecionar por área'}</span></button><button type="button" disabled={saving} onClick={() => zoomBy(1.25)} aria-label="Aumentar zoom"><Plus size={15} /></button><b>{Math.round(zoom * 100)}%</b><button type="button" disabled={saving} onClick={() => zoomBy(1 / 1.25)} aria-label="Reduzir zoom"><Minus size={15} /></button><button type="button" disabled={saving} onClick={resetView} aria-label="Restaurar enquadramento"><RotateCcw size={15} /></button></div></div>
          <div ref={mapViewportRef} className={`census-map-viewport${dragging ? ' dragging' : ''}${areaSelectMode ? ' area-select-mode' : ''}${isAreaSelecting ? ' area-selecting' : ''}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishPointerAction} onPointerCancel={cancelPointerAction}>
            {bbox ? <><svg className="census-workspace-svg" viewBox="0 0 1000 1000" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} role="img" aria-label="Mapa de lotes para classificação">{lots.map((lot, index) => { if (!visibleLotKeys.has(getLotKey(lot))) return null; const zone = zones.find((item) => item.id === lot.zone_id); const selected = selectedLotKeys.includes(getLotKey(lot)) || focusedLotKey === getLotKey(lot); return <polygon key={getLotKey(lot)} data-lot-key={getLotKey(lot)} className={selected ? 'census-lot-selected' : undefined} points={lot.geometry.map(toSvg).join(' ')} fill={getLotFillColor(lot, zones)} stroke="none" strokeWidth="0" vectorEffect="non-scaling-stroke"><title>{`Lote ${String(index + 1).padStart(4, '0')}`} · {zone?.name || 'sem zona'}</title></polygon> })}<rect ref={areaRectOverlayRef} className="census-area-selection-rect window" display="none" pointerEvents="none" /></svg>{visibleLots.length === 0 && showOnlyUnassigned && <div className="census-map-filter-empty" role="status"><Filter size={20} /><strong>Nenhum lote corresponde a este filtro</strong><span>Desmarque “Ver lotes sem zona” para exibir todos os lotes.</span></div>}</> : <div className="census-map-empty"><MapPinned size={25} /><strong>Importe um mapa para começar</strong></div>}
          </div>
          <div className="census-map-legend"><span><i className="unassigned" />Sem zona</span><span><i className="selected" />Lote selecionado</span></div>
        </div>
        <aside className="census-workspace-zones">
          <section className="census-prep-map-filter" aria-label="Filtro de lotes">
            <div className="census-prep-map-filter-heading"><span><Filter size={15} /><strong>Filtro de lotes</strong></span><small>{visibleLotsCount.toLocaleString('pt-BR')} de {lots.length.toLocaleString('pt-BR')} lotes</small></div>
            {mapImport?.status === 'DRAFT' && <label className={`census-prep-filter-unassigned${showOnlyNewLots ? ' active' : ''}`}><input type="checkbox" checked={showOnlyNewLots} onChange={() => { setShowOnlyNewLots((current) => !current); setSelectedLotKeys([]) }} disabled={saving} /><i /> <span>Ver lotes novos ou alterados</span><small>{newCandidateCount.toLocaleString('pt-BR')} lotes</small></label>}
            <label className={`census-prep-filter-unassigned${showOnlyUnassigned ? ' active' : ''}`}><input type="checkbox" checked={showOnlyUnassigned} onChange={toggleUnassignedFilter} disabled={saving} /><i /> <span>Ver lotes sem zona</span><small>{lots.filter((lot) => !lot.zone_id).length.toLocaleString('pt-BR')} lotes</small></label>
            <p>{showOnlyNewLots || showOnlyUnassigned ? `Filtros ativos: ${[showOnlyNewLots ? 'novos ou alterados' : '', showOnlyUnassigned ? 'sem zona' : ''].filter(Boolean).join(' · ')}.` : mapImport?.status === 'DRAFT' ? 'As zonas dos lotes reconhecidos foram preservadas; revise e atribua zonas aos demais.' : 'Mapa operacional exibido sem alterações pendentes.'}</p>
          </section>
          <div className="census-workspace-zones-heading"><div><span className="fleet-kicker">CLASSIFICAÇÃO</span><h2>Escolha uma zona</h2></div><span>{zones.length} zona(s)</span></div>
          {zones.length ? <div className="census-workspace-zone-list">{zones.map((zone) => <button type="button" key={zone.id} disabled={saving} className={activeZoneId === zone.id ? 'active' : ''} onClick={() => setActiveZoneId(zone.id)}><i style={{ background: zone.color }} /><span><strong>{zone.name}</strong><small>{zoneCount(zone.id).toLocaleString('pt-BR')} lote(s)</small></span><Check size={15} /></button>)}</div> : <div className="census-no-zones"><strong>Cadastre uma zona primeiro.</strong><small>Abra o menu Zonas e ACS para criar as zonas do município.</small></div>}
          {selectedLotKeys.length > 0 && <div className="census-selection-actions"><strong>{selectedLotKeys.length.toLocaleString('pt-BR')} lote(s) selecionado(s)</strong><button type="button" className="fleet-primary-button" disabled={saving || !activeZoneId} onClick={assignSelectedLots}><Check size={15} /> Aplicar zona a {selectedLotKeys.length.toLocaleString('pt-BR')} lote(s)</button><button type="button" className="census-selection-clear" disabled={saving} onClick={() => setSelectedLotKeys([])}>Limpar seleção</button></div>}
          <div className="census-save-card">
            <div className="census-save-card-summary"><span className="census-save-card-icon"><Save size={19} /></span><span><strong>{mapImport?.status === 'DRAFT' ? 'Preparação do rascunho' : 'Mapa operacional'}</strong><small>{visibleAssignedCount.toLocaleString('pt-BR')} de {visibleLots.length.toLocaleString('pt-BR')} lotes visíveis com zona</small></span></div>
            {mapImport?.status === 'DRAFT' ? <><button type="button" className="fleet-primary-button census-save-button" disabled={saving || !lots.length} onClick={() => setPendingWrite('save')}>{activeWrite === 'save' ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{activeWrite === 'save' ? 'Salvando…' : 'Salvar rascunho'}</button><small className="census-save-hint">O mapa atual dos ACSs só muda depois da publicação.</small><button type="button" className="fleet-primary-button census-save-button census-publish-button" disabled={saving || !mapImport.division_saved_at || !lots.length} onClick={() => setPendingWrite('publish')}>{activeWrite === 'publish' ? <LoaderCircle className="spin" size={17} /> : <CheckCircle2 size={17} />}{activeWrite === 'publish' ? 'Publicando…' : 'Publicar para os ACSs'}</button><small className="census-save-hint">{mapImport.division_saved_at ? 'Rascunho salvo e pronto para revisão final.' : 'Salve o rascunho antes de publicar.'}</small></> : <small className="census-save-hint">Para alterar zonas, importe um novo DXF e prepare uma versão em rascunho.</small>}
          </div>
          <div className="census-workspace-tip"><MapPinned size={16} /><span>Clique em um lote para aplicar a zona imediatamente ou use Ctrl/Cmd+clique para seleção individual. Em “Selecionar por área”, arraste uma janela: esquerda → direita seleciona lotes totalmente contidos; direita → esquerda seleciona os que cruzam o retângulo. A seleção só recebe a zona ao clicar em Aplicar zona.</span></div>
        </aside>
      </div>}
      {confirmation && <CensusWriteConfirmation {...confirmation} onCancel={() => setPendingWrite(null)} onConfirm={confirmPendingWrite} />}
    </section>
  )
}
