import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, BadgeCheck, Bell, BarChart3, CalendarCheck, CheckCircle2, CircleAlert, Filter,
  ClipboardCheck, Fuel, Gauge, History, LayoutDashboard, LogOut, MapPin, Pencil, Plus, RefreshCw,
  RotateCcw, Search, Settings2, ShieldCheck, Store, Truck, UserRound, X, Eye,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DriversView } from './DriverManagementView'
import { StationManagementView } from './StationManagementView'
import { FleetOverviewDashboard } from './FleetOverviewDashboard'
import { FleetFuelReports } from './FleetFuelReports'
import './FleetModule.css'
import { FleetVehiclesView } from './FleetVehiclesView'
import { FleetFuelingsView } from './FleetFuelingsView'
import { FleetMonthlyClosure } from './FleetMonthlyClosure'

type FleetView = 'overview' | 'vehicles' | 'fuelTypes' | 'fuelings' | 'closure' | 'analytics' | 'reports' | 'stations' | 'drivers' | 'accessRequests' | 'settings'
type FleetAccess = 'checking' | 'manager' | 'mayor' | 'fiscal' | 'secretary' | 'denied' | 'error'
type FleetProps = { userEmail?: string; onBack: () => void; onLogout: () => void }
type Vehicle = { id: string; placa: string; marca: string | null; modelo: string | null; ano_fabricacao: number | null; ano_modelo: number | null; chassi: string | null; renavam: string | null; fuel_type_id: string | null; tank_capacity_l: number; responsible_unit_id: string | null; operational_status: string; current_odometer_km: number | null; notes: string | null }
type FleetOption = { id: string; nome?: string; sigla?: string; ativo?: boolean; unidade_medida?: string }
type FuelingDocument = { id: string; file_name: string; storage_path: string; mime_type: string; document_status: string; uploaded_at: string; is_current: boolean; rejection_reason: string | null; reviewed_by?: number | null; reviewed_at?: string | null }
type Fueling = { id: string; status: string; performed_at: string; submitted_at: string; liters: number; total_amount: number; odometer_km: number; station_receipt_number: string | null; vehicle_id?: string; station_id?: string; fuel_type_id?: string; registered_officially_by?: number | null; registered_officially_at?: string | null; inconsistency_code?: string | null; inconsistency_notes?: string | null; vehicles?: { id?: string; placa?: string; modelo?: string } | null; stations?: { id?: string; nome_fantasia_snapshot?: string } | null; fuel_type?: { id?: string; nome?: string } | null; documents?: FuelingDocument[] | null }
type ConfirmationRequest = { eyebrow: string; title: string; message: string; details: string[]; confirmLabel: string; tone?: 'danger'; onConfirm: () => Promise<string | null> }

const navItems: { id: FleetView; label: string; icon: typeof Truck }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'vehicles', label: 'Veículos', icon: Truck },
  { id: 'fuelTypes', label: 'Combustíveis', icon: Fuel },
  { id: 'fuelings', label: 'Abastecimentos', icon: Fuel },
  { id: 'closure', label: 'Fechamento mensal', icon: CalendarCheck },
  { id: 'analytics', label: 'Dashboard gerencial', icon: BarChart3 },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'stations', label: 'Postos credenciados', icon: Store },
  { id: 'drivers', label: 'Motoristas', icon: UserRound },
  { id: 'accessRequests', label: 'Primeiro acesso', icon: ShieldCheck },
  { id: 'settings', label: 'Configurações', icon: Settings2 },
]

const statusLabel: Record<string, string> = {
  ATIVO: 'Ativo', INATIVO: 'Inativo', EM_MANUTENCAO: 'Em manutenção', BAIXADO: 'Baixado', CEDIDO: 'Cedido',
  RASCUNHO: 'Rascunho', ENVIADO_PELO_POSTO: 'Enviado pelo posto', PENDENTE_DE_COMPROVANTE: 'Pendente de comprovante',
  PENDENTE_DE_CONFERENCIA: 'Pendente de conferência', EM_ANALISE: 'Em análise', COM_INCONSISTENCIA: 'Com inconsistência',
  SOLICITADA_CORRECAO: 'Correção solicitada', CORRIGIDO: 'Corrigido', CONFERIDO: 'Conferido', INCLUIDO_NO_FECHAMENTO: 'No fechamento', CANCELADO: 'Cancelado',
  PENDENTE: 'Pendente', ENVIADO: 'Enviado', ACEITO: 'Aceito', REJEITADO: 'Rejeitado', SUBSTITUIDO: 'Substituído',
}

function formatDate(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function formatMoney(value?: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

async function withTimeout<T>(promise: PromiseLike<T>, milliseconds = 15000): Promise<T> {
  return Promise.race([Promise.resolve(promise), new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), milliseconds))])
}

export function FleetModule({ userEmail, onBack, onLogout }: FleetProps) {
  const [view, setView] = useState<FleetView>('overview')
  const [accessLevel, setAccessLevel] = useState<FleetAccess>(supabase ? 'checking' : 'error')
  const [accessError, setAccessError] = useState(supabase ? '' : 'O serviço de dados está indisponível.')
  const [scopeLabel, setScopeLabel] = useState('')
  const [pendingFuelings, setPendingFuelings] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null)

  const checkAccess = useCallback(async () => {
    if (!supabase) return
    try {
      const { data, error } = await supabase.rpc('fleet_dashboard_access')
      if (error) throw error
      const access = data as { role?: string; units?: { name?: string; acronym?: string }[] } | null
      const level: FleetAccess = access?.role === 'GESTOR_FROTAS' || access?.role === 'ADMINISTRADOR' ? 'manager'
        : access?.role === 'PREFEITO' ? 'mayor'
          : access?.role === 'FISCAL_FROTAS' ? 'fiscal'
            : access?.role === 'GESTOR_SECRETARIA' ? 'secretary' : 'denied'
      setAccessLevel(level)
      setScopeLabel((access?.units || []).map((unit) => unit.acronym || unit.name).filter(Boolean).join(', '))
      setAccessError('')
    } catch {
      setAccessLevel('error')
      setAccessError('Não foi possível validar o perfil de acesso ao módulo de Frotas.')
    }
  }, [])
  useEffect(() => { void checkAccess() }, [checkAccess])

  const loadData = useCallback(async () => {
    setRefreshing(true)
    setRefreshKey((current) => current + 1)
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    setRefreshing(false)
  }, [])

  const visibleNavItems = accessLevel === 'manager'
    ? navItems
    : accessLevel === 'mayor'
      ? navItems.filter((item) => item.id === 'overview' || item.id === 'closure' || item.id === 'reports')
      : navItems.filter((item) => item.id === 'overview' || item.id === 'reports')

  if (accessLevel === 'checking') return <div className="fleet-shell"><main className="fleet-main"><div className="fleet-loading"><RefreshCw className="spin" size={18}/> Validando seu perfil de acesso…</div></main></div>
  if (accessLevel === 'denied' || accessLevel === 'error') return <div className="fleet-shell"><main className="fleet-main"><section className="fleet-section fleet-page-section"><span className="fleet-kicker">MÓDULO OPERACIONAL</span><h1>Acesso ao módulo de Frotas</h1>{accessLevel === 'denied' ? <p>Este perfil não possui acesso ao painel municipal. Solicite ao administrador a vinculação do perfil correto.</p> : <div className="fleet-inline-error" role="alert"><CircleAlert size={15}/>{accessError}</div>}<div className="fleet-inline-actions"><button className="fleet-secondary-button" type="button" onClick={onBack}><ArrowLeft size={15}/> Voltar ao painel</button>{accessLevel === 'error'&&<button className="fleet-primary-button" type="button" onClick={()=>{setAccessLevel('checking');void checkAccess()}}>Tentar novamente</button>}</div></section></main></div>

  return <div className="fleet-shell">
    <aside className="fleet-sidebar">
      <div className="fleet-sidebar-top"><button className="fleet-back" onClick={onBack}><ArrowLeft size={16} /> Voltar ao painel</button><div className="fleet-brand"><span className="fleet-brand-icon"><Truck size={20} /></span><div><strong>Gestão de Frotas</strong><small>Inteligência Municipal</small></div></div></div>
      <div className="fleet-section-label">OPERAÇÃO</div>
      <nav className="fleet-nav">{visibleNavItems.map(({ id, label, icon: Icon }) => <button key={id} className={`fleet-nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><Icon size={17} />{label}{id === 'fuelings' && pendingFuelings > 0 && <span className="fleet-nav-count">{pendingFuelings}</span>}</button>)}</nav>
      <div className="fleet-sidebar-bottom"><div className="fleet-user-chip"><span className="fleet-user-avatar">{(userEmail?.[0] || 'U').toUpperCase()}</span><div><strong>{userEmail || 'Usuário autenticado'}</strong><small>{accessLevel === 'secretary' ? `Consulta · ${scopeLabel || 'unidade vinculada'}` : accessLevel === 'fiscal' ? 'Fiscalização · consulta' : accessLevel === 'mayor' ? 'Escopo municipal · consulta' : 'Escopo municipal'}</small></div></div><button className="fleet-logout" onClick={onLogout}><LogOut size={16} /> Sair do sistema</button></div>
    </aside>
    <main className="fleet-main">
      <header className="fleet-header"><div><p className="fleet-kicker">MÓDULO OPERACIONAL</p><h1>{navItems.find((item) => item.id === view)?.label}</h1></div><div className="fleet-header-actions"><button className="fleet-icon-button" aria-label="Atualizar dados" onClick={() => void loadData()} disabled={refreshing}>{refreshing ? <RefreshCw className="spin" size={18} /> : <RefreshCw size={18} />}</button><button className="fleet-icon-button" aria-label="Notificações"><Bell size={18} /><span className="fleet-alert-dot" /></button><span className="fleet-protected"><ShieldCheck size={16} /> Dados protegidos</span></div></header>
      <div className="fleet-content">
        {view === 'overview' && <FleetOverviewDashboard key={refreshKey} userEmail={userEmail} onPendingCount={setPendingFuelings} readOnly={accessLevel !== 'manager'} scopeRole={accessLevel} scopeLabel={scopeLabel} onNavigate={(target) => { if (accessLevel === 'manager' || (target === 'closure' && accessLevel === 'mayor')) setView(target) }} />}
        {view === 'vehicles' && <FleetVehiclesView key={refreshKey} />}
        {view === 'fuelTypes' && <FuelTypesView key={refreshKey} onChanged={loadData} onRequestConfirmation={setConfirmation} />}
        {view === 'fuelings' && <FleetFuelingsView key={refreshKey} />}
        {view === 'closure' && <MonthlyClosure key={refreshKey} />}
        {view === 'analytics' && <FuelConsumptionDashboard key={refreshKey} />}
        {view === 'reports' && <FleetFuelReports key={refreshKey} userEmail={userEmail} />}
        {view === 'stations' && <StationManagementView key={refreshKey} onSaved={loadData} />}
        {view === 'drivers' && <DriversView key={refreshKey} onSaved={loadData} />}
        {view === 'accessRequests' && <StationManagementView key={refreshKey} onSaved={loadData} />}
        {view === 'settings' && <SettingsPanel key={refreshKey} />}
      </div>
    </main>
    {confirmation && <FleetConfirmDialog request={confirmation} onClose={() => setConfirmation(null)} />}
  </div>
}

function FleetConfirmDialog({ request, onClose }: { request: ConfirmationRequest; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function confirm() {
    setBusy(true); setError('')
    try {
      const result = await request.onConfirm()
      if (result) { setError(result); setBusy(false); return }
      onClose()
    } catch {
      setError('A operação não pôde ser concluída. Tente novamente.')
      setBusy(false)
    }
  }
  return <div className="fleet-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="fleet-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="fleet-confirm-title">
      <header className="fleet-confirm-heading"><span className={`fleet-confirm-emblem ${request.tone === 'danger' ? 'danger' : ''}`}><ShieldCheck size={20} /></span><div><span className="fleet-kicker">{request.eyebrow}</span><h2 id="fleet-confirm-title">{request.title}</h2></div></header>
      <p className="fleet-confirm-message">{request.message}</p>
      {request.details.length > 0 && <div className="fleet-confirm-details">{request.details.map((detail) => <div key={detail}><CheckCircle2 size={14} /><span>{detail}</span></div>)}</div>}
      {error && <div className="fleet-confirm-error" role="alert"><CircleAlert size={15} />{error}</div>}
      <footer className="fleet-confirm-actions"><button className="fleet-secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className={`fleet-primary-button ${request.tone === 'danger' ? 'fleet-confirm-danger' : ''}`} type="button" onClick={() => void confirm()} disabled={busy}><ShieldCheck size={15} />{busy ? 'Salvando…' : request.confirmLabel}</button></footer>
    </section>
  </div>
}

type SortDirection = 'asc' | 'desc'

type FuelTypeRecord = { id: string; nome: string; sigla: string | null; unidade_medida: string; ativo: boolean; created_at?: string; updated_at?: string }
type FuelTypeUse = { id: string; fuel_type_id: string; performed_at: string; liters: number; status: string; station_receipt_number: string | null; vehicles?: { placa?: string; modelo?: string } | null; stations?: { nome_fantasia_snapshot?: string } | null }

type FuelTypeSortKey = 'name' | 'sigla' | 'unit' | 'status' | 'usage' | 'lastUse'

function FuelTypesView({ onChanged, onRequestConfirmation }: { onChanged: () => Promise<void>; onRequestConfirmation: (request: ConfirmationRequest) => void }) {
  const [fuelTypes, setFuelTypes] = useState<FuelTypeRecord[]>([])
  const [uses, setUses] = useState<FuelTypeUse[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<FuelTypeRecord | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [unitFilter, setUnitFilter] = useState('')
  const [activeFilter, setActiveFilter] = useState('')
  const [usageFilter, setUsageFilter] = useState('')
  const [sortKey, setSortKey] = useState<FuelTypeSortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [form, setForm] = useState({ nome: '', sigla: '', unidade_medida: 'L', ativo: 'true' })
  const collator = useMemo(() => new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }), [])

  async function loadFuelTypes() {
    if (!supabase) return
    setLoading(true); setError('')
    const [typesResult, usesResult] = await Promise.all([
      supabase.from('fleet_fuel_types').select('id,nome,sigla,unidade_medida,ativo,created_at,updated_at').order('nome').limit(100),
      supabase.from('fleet_fuelings').select('id,fuel_type_id,performed_at,liters,status,station_receipt_number,vehicles:fleet_vehicles(placa,modelo),stations:fleet_fuel_stations(nome_fantasia_snapshot)').order('performed_at', { ascending: false }).limit(5000),
    ])
    if (typesResult.error || usesResult.error) setError('Não foi possível carregar os tipos de combustível e seu histórico de utilização.')
    else { setFuelTypes((typesResult.data || []) as FuelTypeRecord[]); setUses((usesResult.data || []) as unknown as FuelTypeUse[]) }
    setLoading(false)
  }
  useEffect(() => { void loadFuelTypes() }, [])
  const usageCount = useCallback((id: string) => uses.filter((use) => use.fuel_type_id === id && use.status !== 'CANCELADO').length, [uses])
  const lastUse = useCallback((id: string) => uses.find((use) => use.fuel_type_id === id)?.performed_at, [uses])
  const selectedType = fuelTypes.find((fuel) => fuel.id === selected) || null
  const selectedUses = selected ? uses.filter((use) => use.fuel_type_id === selected) : []
  const unitOptions = useMemo(() => Array.from(new Set(fuelTypes.map((fuel) => fuel.unidade_medida).filter(Boolean))).sort(collator.compare), [fuelTypes, collator])
  const visibleFuelTypes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR')
    const filtered = fuelTypes.filter((fuel) => {
      const searchable = [fuel.nome, fuel.sigla, fuel.unidade_medida].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
      const count = usageCount(fuel.id)
      return (!term || searchable.includes(term))
        && (!unitFilter || fuel.unidade_medida === unitFilter)
        && (!activeFilter || (activeFilter === 'ATIVO') === fuel.ativo)
        && (!usageFilter || (usageFilter === 'COM_USO' ? count > 0 : count === 0))
    })
    const compare = (a: FuelTypeRecord, b: FuelTypeRecord) => {
      switch (sortKey) {
        case 'name': return collator.compare(a.nome, b.nome)
        case 'sigla': return collator.compare(a.sigla || '', b.sigla || '')
        case 'unit': return collator.compare(a.unidade_medida || '', b.unidade_medida || '')
        case 'status': return collator.compare(a.ativo ? 'Ativo' : 'Inativo', b.ativo ? 'Ativo' : 'Inativo')
        case 'usage': return usageCount(a.id) - usageCount(b.id)
        case 'lastUse': return (lastUse(a.id) ? Date.parse(lastUse(a.id) as string) : 0) - (lastUse(b.id) ? Date.parse(lastUse(b.id) as string) : 0)
      }
    }
    return filtered.sort((a, b) => compare(a, b) * (sortDirection === 'asc' ? 1 : -1))
  }, [fuelTypes, search, unitFilter, activeFilter, usageFilter, sortKey, sortDirection, collator, usageCount, lastUse])
  const activeFilters = Number(Boolean(search.trim())) + Number(Boolean(unitFilter)) + Number(Boolean(activeFilter)) + Number(Boolean(usageFilter))
  function clearFilters() { setSearch(''); setUnitFilter(''); setActiveFilter(''); setUsageFilter('') }
  function sortBy(key: FuelTypeSortKey) {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDirection('asc') }
  }
  function sortHeading(key: FuelTypeSortKey, label: string) {
    const Icon = sortKey === key ? sortDirection === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown
    return <button type="button" className="fleet-sort-button" onClick={() => sortBy(key)} aria-label={`Ordenar por ${label}${sortKey === key ? sortDirection === 'asc' ? ', crescente' : ', decrescente' : ''}`}><span>{label}</span><Icon size={13} aria-hidden="true" /></button>
  }
  const sortAria = (key: FuelTypeSortKey) => sortKey === key ? sortDirection === 'asc' ? 'ascending' as const : 'descending' as const : 'none' as const
  function resetForm() { setForm({ nome: '', sigla: '', unidade_medida: 'L', ativo: 'true' }) }
  function openNew() { setEditing(null); resetForm(); setShowForm(true) }
  function openEdit(fuel: FuelTypeRecord) { setEditing(fuel); setForm({ nome: fuel.nome, sigla: fuel.sigla || '', unidade_medida: fuel.unidade_medida || 'L', ativo: String(fuel.ativo) }); setShowForm(true) }

  function requestSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = form.nome.trim()
    const action = editing ? 'alterar' : 'cadastrar'
    onRequestConfirmation({
      eyebrow: 'INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS',
      title: editing ? 'Confirmar alteração do combustível' : 'Confirmar cadastro do combustível',
      message: `Confira os dados. Ao confirmar, o sistema irá ${action} esta referência da frota.`,
      details: [`Combustível: ${name || 'Não informado'}`, `Sigla: ${form.sigla.trim().toUpperCase() || 'Não informada'}`, `Unidade: ${form.unidade_medida.trim() || 'Não informada'}`, `Situação: ${form.ativo === 'true' ? 'Ativo' : 'Inativo'}`],
      confirmLabel: editing ? 'Confirmar e salvar alterações' : 'Confirmar cadastro',
      onConfirm: saveFuelType,
    })
  }

  async function saveFuelType(): Promise<string | null> {
    if (!supabase) return 'O serviço de dados está indisponível. Tente novamente.'
    setSaving(true); setError('')
    try {
      const payload = { nome: form.nome.trim(), sigla: form.sigla.trim().toUpperCase() || null, unidade_medida: form.unidade_medida.trim() || 'L', ativo: form.ativo === 'true', updated_at: new Date().toISOString() }
      const result = editing
        ? await supabase.from('fleet_fuel_types').update(payload).eq('id', editing.id)
        : await supabase.from('fleet_fuel_types').insert({ ...payload, municipio_id: (await supabase.rpc('fleet_current_municipio_id')).data, created_by: (await supabase.rpc('fleet_current_usuario_id')).data })
      if (result.error) return result.error.code === '23505' ? 'Já existe um tipo de combustível com este nome.' : 'Não foi possível salvar este combustível. Verifique suas permissões e tente novamente.'
      setShowForm(false); setEditing(null); resetForm()
      await loadFuelTypes(); await onChanged()
      return null
    } catch {
      return 'Ocorreu uma falha de conexão e o combustível não pôde ser salvo. Tente novamente.'
    } finally { setSaving(false) }
  }

  function requestToggleActive(fuel: FuelTypeRecord) {
    const willActivate = !fuel.ativo
    onRequestConfirmation({
      eyebrow: 'INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS',
      title: willActivate ? 'Confirmar ativação do combustível' : 'Confirmar inativação do combustível',
      message: willActivate
        ? 'Ao ativar, este combustível ficará disponível para novos cadastros e operações da frota.'
        : 'Ao inativar, este combustível deixará de aparecer para novos usos. O histórico de abastecimentos será preservado.',
      details: [`Combustível: ${fuel.nome}`, `Sigla: ${fuel.sigla || 'Não informada'}`, `Unidade: ${fuel.unidade_medida}`, `Nova situação: ${willActivate ? 'Ativo' : 'Inativo'}`],
      confirmLabel: willActivate ? 'Confirmar ativação' : 'Confirmar inativação',
      tone: willActivate ? undefined : 'danger',
      onConfirm: async () => {
        if (!supabase) return 'O serviço de dados está indisponível. Tente novamente.'
        setSaving(true); setError('')
        try {
          const result = await supabase.from('fleet_fuel_types').update({ ativo: willActivate, updated_at: new Date().toISOString() }).eq('id', fuel.id)
          if (result.error) return 'Não foi possível alterar a situação deste combustível. Verifique suas permissões e tente novamente.'
          await loadFuelTypes(); await onChanged()
          return null
        } catch {
          return 'Ocorreu uma falha de conexão e a situação não foi alterada. Tente novamente.'
        } finally { setSaving(false) }
      },
    })
  }

  return <section className="fleet-section fleet-page-section">
    <div className="fleet-page-heading"><div><span className="fleet-kicker">TABELA DE REFERÊNCIA</span><h2>Tipos de combustível</h2><p>Cadastre, edite, inative e consulte os combustíveis oficiais sem perder o histórico.</p></div><button className="fleet-primary-button" onClick={openNew}><Plus size={16} /> Novo combustível</button></div>
    {error && <div className="fleet-inline-error" role="alert"><CircleAlert size={15} /> {error}</div>}
    <div className="fleet-fueltype-note"><History size={16} /><span>Inativar impede novos usos no cadastro, mas mantém os abastecimentos históricos vinculados ao tipo.</span></div>
    <div className="fleet-vehicle-filters fleet-fueltype-filters">
      <div className="fleet-vehicle-filter-heading"><div><Filter size={15} /><strong>Filtros</strong><span>{loading ? 'Carregando combustíveis…' : `${visibleFuelTypes.length.toLocaleString('pt-BR')} de ${fuelTypes.length.toLocaleString('pt-BR')} combustível(is)`}</span></div><button type="button" onClick={clearFilters} disabled={!activeFilters}><RotateCcw size={13} /> Limpar filtros</button></div>
      <div className="fleet-vehicle-filter-grid fleet-fueltype-filter-grid">
        <label className="fleet-vehicle-search">Buscar combustível<div><Search size={14} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome ou sigla" /></div></label>
        <label>Unidade de medida<select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)}><option value="">Todas as unidades</option>{unitOptions.map((unit) => <option key={unit} value={unit}>{unit}</option>)}</select></label>
        <label>Situação<select value={activeFilter} onChange={(event) => setActiveFilter(event.target.value)}><option value="">Todas as situações</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label>
        <label>Uso histórico<select value={usageFilter} onChange={(event) => setUsageFilter(event.target.value)}><option value="">Com ou sem uso</option><option value="COM_USO">Já utilizado</option><option value="SEM_USO">Nunca utilizado</option></select></label>
      </div>
    </div>
    <div className="fleet-table-panel">{loading ? <LoadingRows /> : visibleFuelTypes.length ? <table className="fleet-table fleet-fueltype-table"><thead><tr><th aria-sort={sortAria('name')}>{sortHeading('name', 'Combustível')}</th><th aria-sort={sortAria('sigla')}>{sortHeading('sigla', 'Sigla')}</th><th aria-sort={sortAria('unit')}>{sortHeading('unit', 'Unidade')}</th><th aria-sort={sortAria('status')}>{sortHeading('status', 'Situação')}</th><th aria-sort={sortAria('usage')}>{sortHeading('usage', 'Uso histórico')}</th><th aria-sort={sortAria('lastUse')}>{sortHeading('lastUse', 'Último uso')}</th><th><span className="fleet-sr-only">Ações</span></th></tr></thead><tbody>{visibleFuelTypes.map((fuel) => <tr key={fuel.id}><td><strong>{fuel.nome}</strong><small>Cadastrado em {fuel.created_at ? formatDate(fuel.created_at) : '—'}</small></td><td className="fleet-plate">{fuel.sigla || '—'}</td><td>{fuel.unidade_medida}</td><td><StatusChip value={fuel.ativo ? 'ATIVO' : 'INATIVO'} /></td><td>{usageCount(fuel.id).toLocaleString('pt-BR')} abastecimento(s)</td><td>{lastUse(fuel.id) ? formatDate(lastUse(fuel.id)) : 'Nunca utilizado'}</td><td><div className="fleet-row-actions"><button className="fleet-row-action" aria-label={`Ver histórico de ${fuel.nome}`} onClick={() => setSelected(selected === fuel.id ? null : fuel.id)}><History size={15} /></button><button className="fleet-row-action" aria-label={`Editar ${fuel.nome}`} onClick={() => openEdit(fuel)}><Pencil size={15} /></button><button className="fleet-row-action" aria-label={`${fuel.ativo ? 'Inativar' : 'Ativar'} ${fuel.nome}`} onClick={() => requestToggleActive(fuel)} disabled={saving}>{fuel.ativo ? <span className="fleet-action-label danger">Inativar</span> : <span className="fleet-action-label success">Ativar</span>}</button></div></td></tr>)}{selectedType && visibleFuelTypes.some((fuel) => fuel.id === selectedType.id) && <tr className="fleet-history-row"><td colSpan={7}><div className="fleet-history-heading"><div><span className="fleet-kicker">HISTÓRICO DE UTILIZAÇÃO</span><strong>{selectedType.nome}</strong></div><button className="fleet-close" onClick={() => setSelected(null)} aria-label="Fechar histórico"><X size={16} /></button></div>{selectedUses.length ? <div className="fleet-history-list">{selectedUses.slice(0, 20).map((use) => <div className="fleet-history-item" key={use.id}><span>{formatDate(use.performed_at)}</span><strong>{use.vehicles?.placa || 'Veículo não informado'}</strong><span>{use.stations?.nome_fantasia_snapshot || 'Posto não informado'}</span><span>{Number(use.liters).toLocaleString('pt-BR')} {selectedType.unidade_medida}</span><StatusChip value={use.status} /></div>)}</div> : <p className="fleet-history-empty">Nenhum abastecimento foi registrado com este combustível.</p>}</td></tr>}</tbody></table> : fuelTypes.length ? <EmptyState icon={Fuel} title="Nenhum combustível encontrado" text="Nenhum registro corresponde aos filtros. Ajuste ou limpe os filtros para ver outros resultados." action="Limpar filtros" onAction={clearFilters} /> : <EmptyState icon={Fuel} title="Nenhum combustível cadastrado" text="Cadastre o primeiro tipo para liberar a seleção nos veículos e abastecimentos." action="Novo combustível" onAction={openNew} />}</div>
    {showForm && <div className="fleet-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowForm(false)}><form className="fleet-modal fleet-fueltype-modal" onSubmit={requestSave}><div className="fleet-modal-heading"><div><span className="fleet-kicker">CONFIGURAÇÃO OPERACIONAL</span><h2>{editing ? 'Editar combustível' : 'Novo combustível'}</h2></div><button type="button" className="fleet-close" onClick={() => setShowForm(false)} aria-label="Fechar"><X size={18} /></button></div><p className="fleet-modal-note"><BadgeCheck size={16} /> Gestor de Frotas ou Administrador pode cadastrar e alterar esta referência.</p><div className="fleet-form-grid"><label>Nome do combustível<input required maxLength={80} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Ex.: Diesel S-10" /></label><label>Sigla<input maxLength={12} value={form.sigla} onChange={(event) => setForm({ ...form, sigla: event.target.value })} placeholder="Ex.: S10" /></label><label>Unidade de medida<input required maxLength={10} value={form.unidade_medida} onChange={(event) => setForm({ ...form, unidade_medida: event.target.value })} placeholder="L" /></label><label>Situação<select value={form.ativo} onChange={(event) => setForm({ ...form, ativo: event.target.value })}><option value="true">Ativo</option><option value="false">Inativo</option></select></label></div><div className="fleet-modal-actions"><button type="button" className="fleet-secondary-button" onClick={() => setShowForm(false)}>Cancelar</button><button type="submit" className="fleet-primary-button" disabled={saving}>{saving ? 'Salvando…' : editing ? 'Salvar alterações' : 'Cadastrar combustível'}</button></div></form></div>}
  </section>
}
type FuelingSortKey = 'date' | 'vehicle' | 'station' | 'fuel' | 'volume' | 'amount' | 'document' | 'status'
const fuelingStatuses = ['RASCUNHO', 'ENVIADO_PELO_POSTO', 'PENDENTE_DE_COMPROVANTE', 'PENDENTE_DE_CONFERENCIA', 'EM_ANALISE', 'COM_INCONSISTENCIA', 'SOLICITADA_CORRECAO', 'CORRIGIDO', 'CONFERIDO', 'INCLUIDO_NO_FECHAMENTO', 'CANCELADO']
const proofStatuses = ['PENDENTE', 'ENVIADO', 'EM_ANALISE', 'ACEITO', 'REJEITADO', 'SUBSTITUIDO']
const completedFuelingStatuses = ['CONFERIDO', 'INCLUIDO_NO_FECHAMENTO', 'CANCELADO']
type FuelingCreateForm = { vehicle_id: string; station_id: string; fuel_type_id: string; responsible_unit_id: string; beneficiary_unit_id: string; authorization_id: string; driver_id: string; performed_at: string; liters: string; unit_price: string; odometer_km: string; receipt: string; notes: string }
type FuelingVehicleOption = Pick<Vehicle, 'id' | 'placa' | 'marca' | 'modelo' | 'fuel_type_id' | 'responsible_unit_id' | 'operational_status' | 'tank_capacity_l' | 'current_odometer_km'>
type FuelingStationOption = { id: string; nome_fantasia_snapshot: string | null; razao_social_snapshot: string; cnpj_snapshot: string }
type FuelingUnitOption = { id: string; nome: string; sigla: string | null }
type FuelingDriverOption = { id: string; nome: string; matricula: string | null; cnh_valid_until: string | null; cnh_category?: string | null }
type FuelingAuthorizationOption = { id: string; responsible_unit_id: string; beneficiary_unit_id: string; purpose: string; valid_from: string; valid_until: string }

function localDateTimeInput(now = new Date()) {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function emptyFuelingCreateForm(): FuelingCreateForm {
  return { vehicle_id: '', station_id: '', fuel_type_id: '', responsible_unit_id: '', beneficiary_unit_id: '', authorization_id: '', driver_id: '', performed_at: localDateTimeInput(), liters: '', unit_price: '', odometer_km: '', receipt: '', notes: '' }
}

function generatedFuelingAmount(litersValue: string, unitPriceValue: string): number | null {
  const toScaledInteger = (value: string, scale: number) => {
    if (!/^\d+(?:\.\d*)?$/.test(value.trim())) return null
    const [whole, fraction = ''] = value.trim().split('.')
    if (fraction.length > scale) return null
    return BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale, '0') || '0')
  }
  const liters = toScaledInteger(litersValue, 3)
  const unitPrice = toScaledInteger(unitPriceValue, 4)
  if (liters == null || unitPrice == null) return null
  const cents = (liters * unitPrice + 50_000n) / 100_000n
  const amount = Number(cents) / 100
  return Number.isFinite(amount) && amount <= 999_999_999_999.99 ? amount : null
}

export function LegacyFuelings({ onRequestConfirmation }: { onRequestConfirmation: (request: ConfirmationRequest) => void }) {
  const [fuelings, setFuelings] = useState<Fueling[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [workingId, setWorkingId] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [dateStart, setDateStart] = useState('')
  const [dateEnd, setDateEnd] = useState('')
  const [vehicleFilter, setVehicleFilter] = useState('')
  const [fuelFilter, setFuelFilter] = useState('')
  const [stationFilter, setStationFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [documentFilter, setDocumentFilter] = useState('')
  const [sortKey, setSortKey] = useState<FuelingSortKey>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [correctionTarget, setCorrectionTarget] = useState<{ fueling: Fueling; document: FuelingDocument } | null>(null)
  const [preview, setPreview] = useState<{ title: string; url: string; mimeType: string } | null>(null)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createForm, setCreateForm] = useState<FuelingCreateForm>(() => emptyFuelingCreateForm())
  const [createFormError, setCreateFormError] = useState('')
  const [createOptionsLoading, setCreateOptionsLoading] = useState(false)
  const [createDriversLoading, setCreateDriversLoading] = useState(false)
  const [createSaving, setCreateSaving] = useState(false)
  const [createVehicles, setCreateVehicles] = useState<FuelingVehicleOption[]>([])
  const [createStations, setCreateStations] = useState<FuelingStationOption[]>([])
  const [createFuelTypes, setCreateFuelTypes] = useState<FleetOption[]>([])
  const [createUnits, setCreateUnits] = useState<FuelingUnitOption[]>([])
  const [createDrivers, setCreateDrivers] = useState<FuelingDriverOption[]>([])
  const [createUseAuthorizations, setCreateUseAuthorizations] = useState<FuelingAuthorizationOption[]>([])
  const [createAuthorizationsLoading, setCreateAuthorizationsLoading] = useState(false)
  const collator = useMemo(() => new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' }), [])

  async function loadPage(offset: number, replace: boolean) {
    if (!supabase) { setError('O serviço de dados está indisponível.'); return }
    try {
      const { data, error: queryError } = await supabase.from('fleet_fuelings')
        .select('id,status,performed_at,submitted_at,liters,total_amount,odometer_km,station_receipt_number,vehicle_id,station_id,fuel_type_id,registered_officially_by,registered_officially_at,inconsistency_code,inconsistency_notes,vehicles:fleet_vehicles(id,placa,modelo),stations:fleet_fuel_stations(id,nome_fantasia_snapshot),fuel_type:fleet_fuel_types(id,nome),documents:fleet_fueling_documents(id,file_name,storage_path,mime_type,document_status,uploaded_at,is_current,rejection_reason,reviewed_by,reviewed_at)')
        .order('performed_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 99)
      if (queryError) { setError('Não foi possível carregar a fila de abastecimentos autorizada para este perfil.'); return }
      const page = (data || []) as unknown as Fueling[]
      setFuelings((current) => replace ? page : [...current, ...page])
      setHasMore(page.length === 100)
      setError('')
    } catch {
      setError('Falha de conexão ao carregar os abastecimentos. Tente novamente.')
    }
  }

  async function refresh() {
    setLoading(true); setError(''); setNotice('')
    await loadPage(0, true)
    setLoading(false)
  }

  async function loadMore() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true); setError('')
    await loadPage(fuelings.length, false)
    setLoadingMore(false)
  }

  useEffect(() => { void refresh() }, [])

  function updateCreateForm<K extends keyof FuelingCreateForm>(key: K, value: FuelingCreateForm[K]) {
    setCreateForm((current) => ({ ...current, [key]: value }))
    setCreateFormError('')
  }

  useEffect(() => {
    if (!showCreateForm || !createForm.vehicle_id || !supabase) {
      setCreateDrivers([])
      setCreateDriversLoading(false)
      return
    }
    const performedAt = new Date(createForm.performed_at)
    if (!Number.isFinite(performedAt.getTime())) { setCreateDrivers([]); return }
    let cancelled = false
    setCreateDriversLoading(true)
    void supabase.rpc('fleet_manager_vehicle_driver_options', { p_vehicle_id: createForm.vehicle_id, p_performed_at: performedAt.toISOString(), p_require_authorization: true })
      .then(({ data, error: authorizationError }) => {
        if (cancelled) return
        if (authorizationError) {
          setCreateDrivers([])
          setCreateFormError('Não foi possível verificar autorização, CNH e categoria do motorista para este veículo.')
        } else {
          const options = (data || []) as FuelingDriverOption[]
          setCreateDrivers(options)
          setCreateForm((current) => current.driver_id && !options.some((driver) => driver.id === current.driver_id) ? { ...current, driver_id: '' } : current)
        }
        setCreateDriversLoading(false)
      })
    return () => { cancelled = true }
  }, [showCreateForm, createForm.vehicle_id, createForm.performed_at])

  useEffect(() => {
    const vehicle = createVehicles.find((item) => item.id === createForm.vehicle_id)
    if (!showCreateForm || !vehicle || !vehicle.responsible_unit_id || !supabase || !createUnits.length) { setCreateUseAuthorizations([]); setCreateAuthorizationsLoading(false); return }
    const performedAt = new Date(createForm.performed_at)
    if (!Number.isFinite(performedAt.getTime())) { setCreateUseAuthorizations([]); setCreateAuthorizationsLoading(false); return }
    let cancelled = false
    const eventTime = performedAt.toISOString()
    setCreateAuthorizationsLoading(true)
    void supabase.from('fleet_vehicle_authorizations')
      .select('id,responsible_unit_id,beneficiary_unit_id,purpose,valid_from,valid_until')
      .eq('vehicle_id', vehicle.id).eq('responsible_unit_id', vehicle.responsible_unit_id)
      .in('beneficiary_unit_id', createUnits.map((unit) => unit.id)).eq('status', 'APROVADA').not('authorized_by', 'is', null).not('supporting_document_path', 'is', null)
      .lte('valid_from', eventTime).gte('valid_until', eventTime)
      .order('valid_until', { ascending: true }).limit(100)
      .then(({ data, error: authorizationError }) => {
        if (cancelled) return
        const options = authorizationError ? [] : (data || []) as FuelingAuthorizationOption[]
        setCreateUseAuthorizations(options)
        if (authorizationError) setCreateFormError('Não foi possível verificar autorizações de uso vigentes para este veículo e data.')
        setCreateForm((current) => current.authorization_id && !options.some((item) => item.id === current.authorization_id)
          ? { ...current, authorization_id: '', beneficiary_unit_id: current.responsible_unit_id }
          : current)
        setCreateAuthorizationsLoading(false)
      })
    return () => { cancelled = true }
  }, [showCreateForm, createForm.vehicle_id, createForm.performed_at, createVehicles, createUnits])

  async function openCreateForm() {
    setCreateForm(emptyFuelingCreateForm())
    setCreateFormError('')
    setShowCreateForm(true)
    if (!supabase) { setCreateFormError('O serviço de dados está indisponível.'); return }
    setCreateOptionsLoading(true)
    try {
      const { data: municipalityId, error: municipalityError } = await withTimeout(supabase.rpc('fleet_current_municipio_id'))
      if (municipalityError || !municipalityId) { setCreateFormError('Não foi possível identificar o município para carregar as opções do cadastro.'); return }
      const [vehicleResult, stationResult, fuelTypeResult, unitResult] = await Promise.all([
        withTimeout(supabase.from('fleet_vehicles').select('id,placa,marca,modelo,fuel_type_id,responsible_unit_id,operational_status,tank_capacity_l,current_odometer_km').eq('municipio_id', municipalityId).in('operational_status', ['ATIVO','CEDIDO']).order('placa').limit(1000)),
        withTimeout(supabase.from('fleet_fuel_stations').select('id,nome_fantasia_snapshot,razao_social_snapshot,cnpj_snapshot').eq('municipio_id', municipalityId).eq('status', 'ATIVO').order('nome_fantasia_snapshot').limit(1000)),
        withTimeout(supabase.from('fleet_fuel_types').select('id,nome,sigla,ativo,unidade_medida').eq('municipio_id', municipalityId).eq('ativo', true).order('nome').limit(1000)),
        withTimeout(supabase.from('unidades_organizacionais').select('id,nome,sigla').eq('municipio_id', municipalityId).eq('ativo', true).order('nome').limit(1000)),
      ])
      const firstError = vehicleResult.error || stationResult.error || fuelTypeResult.error || unitResult.error
      if (firstError) { setCreateFormError('Não foi possível carregar os veículos, postos, combustíveis ou unidades disponíveis. Atualize a tela e tente novamente.'); return }
      setCreateVehicles((vehicleResult.data || []) as unknown as FuelingVehicleOption[])
      setCreateStations((stationResult.data || []) as unknown as FuelingStationOption[])
      setCreateFuelTypes((fuelTypeResult.data || []) as FleetOption[])
      setCreateUnits((unitResult.data || []) as unknown as FuelingUnitOption[])
      setCreateDrivers([])
    } catch {
      setCreateFormError('Falha de conexão ao carregar as opções do cadastro. Tente novamente.')
    } finally { setCreateOptionsLoading(false) }
  }

  async function saveNewFueling(): Promise<string | null> {
    if (!supabase) return 'O serviço de dados está indisponível.'
    setCreateSaving(true)
    try {
      const [municipalityResult, userResult] = await Promise.all([
        withTimeout(supabase.rpc('fleet_current_municipio_id')),
        withTimeout(supabase.rpc('fleet_current_usuario_id')),
      ])
      if (municipalityResult.error || !municipalityResult.data || userResult.error || userResult.data == null) return 'Não foi possível identificar o município e o operador autenticado para registrar o abastecimento.'
      const performedAt = new Date(createForm.performed_at)
      if (!Number.isFinite(performedAt.getTime())) return 'Informe uma data e hora válidas para o abastecimento.'
      const insertResult = await withTimeout(supabase.from('fleet_fuelings').insert({
        municipio_id: municipalityResult.data,
        vehicle_id: createForm.vehicle_id,
        station_id: createForm.station_id,
        fuel_type_id: createForm.fuel_type_id,
        responsible_unit_id: createForm.responsible_unit_id,
        beneficiary_unit_id: createForm.beneficiary_unit_id || null,
        authorization_id: createForm.authorization_id || null,
        driver_id: createForm.driver_id || null,
        performed_at: performedAt.toISOString(),
        created_by: userResult.data,
        liters: Number(createForm.liters),
        unit_price: Number(createForm.unit_price),
        odometer_km: Number(createForm.odometer_km),
        station_receipt_number: createForm.receipt.trim() || null,
        notes: createForm.notes.trim() || null,
        status: 'PENDENTE_DE_COMPROVANTE',
      }).select('id,status').single())
      if (insertResult.error || !insertResult.data) {
        const message = insertResult.error?.message.toLocaleLowerCase('pt-BR') || ''
        if (insertResult.error?.code === '42501') return 'Seu perfil não tem permissão para cadastrar abastecimentos neste município.'
        if (message.includes('veiculo sem capacidade')) return 'O veículo selecionado não possui capacidade de tanque válida. Corrija o cadastro do veículo antes de continuar.'
        if (message.includes('motorista') || message.includes('cnh')) return 'O motorista está inativo, com CNH vencida ou sem autorização vigente para este veículo e data.'
        if (message.includes('autorizacao') || message.includes('autorização')) return 'A autorização vinculada ao veículo não é válida para a data ou unidade informada.'
        if (message.includes('unidade responsável')) return 'A unidade responsável deve corresponder à lotação administrativa do veículo. Atualize o cadastro e tente novamente.'
        return 'Não foi possível cadastrar o abastecimento. Verifique se os dados ainda estão válidos e tente novamente.'
      }
      const persistedStatus = String(insertResult.data.status)
      setShowCreateForm(false)
      setCreateForm(emptyFuelingCreateForm())
      await refresh()
      setNotice(persistedStatus === 'COM_INCONSISTENCIA'
        ? 'Abastecimento cadastrado, mas o banco identificou volume acima da capacidade do tanque e marcou o registro com inconsistência. Revise os dados antes do fechamento.'
        : 'Abastecimento cadastrado. O registro ficou pendente de comprovante; o fechamento só será liberado após o anexo e a conferência oficial.')
      return null
    } catch {
      return 'Falha de conexão ao registrar o abastecimento. Atualize os dados e tente novamente.'
    } finally { setCreateSaving(false) }
  }

  function requestCreateFueling(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const vehicle = createVehicles.find((item) => item.id === createForm.vehicle_id)
    const station = createStations.find((item) => item.id === createForm.station_id)
    const fuel = createFuelTypes.find((item) => item.id === createForm.fuel_type_id)
    const unit = createUnits.find((item) => item.id === createForm.responsible_unit_id)
    const useAuthorization = createUseAuthorizations.find((item) => item.id === createForm.authorization_id)
    const liters = Number(createForm.liters)
    const unitPrice = Number(createForm.unit_price)
    const odometer = Number(createForm.odometer_km)
    const performedAt = new Date(createForm.performed_at)
    if (!vehicle || !station || !fuel || !unit) { setCreateFormError('Selecione veículo, posto ativo, combustível e unidade responsável.'); return }
    if (vehicle.responsible_unit_id !== createForm.responsible_unit_id) { setCreateFormError('A unidade responsável deve ser a lotação administrativa do veículo.'); return }
    if (createAuthorizationsLoading) { setCreateFormError('Aguarde a verificação das autorizações de uso vigentes.'); return }
    if ((vehicle.operational_status === 'CEDIDO' || (createForm.beneficiary_unit_id && createForm.beneficiary_unit_id !== createForm.responsible_unit_id)) && !useAuthorization) { setCreateFormError('Veículo cedido ou beneficiária diferente exige autorização aprovada e vigente.'); return }
    if (createForm.authorization_id && !useAuthorization) { setCreateFormError('A autorização selecionada não está mais vigente para a data informada.'); return }
    if (createDriversLoading) { setCreateFormError('Aguarde a verificação das autorizações de motorista.'); return }
    if (!createForm.driver_id || !createDrivers.some((item) => item.id === createForm.driver_id)) { setCreateFormError('Selecione um motorista com CNH vigente e autorização válida para este veículo e data.'); return }
    if (!createForm.performed_at || !Number.isFinite(performedAt.getTime())) { setCreateFormError('Informe uma data e hora válidas para o abastecimento.'); return }
    if (!createForm.liters.trim() || !createForm.unit_price.trim() || !createForm.odometer_km.trim()) { setCreateFormError('Preencha litros, preço unitário e odômetro.'); return }
    if (!Number.isFinite(liters) || liters <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(odometer) || odometer < 0) { setCreateFormError('Informe litros, preço unitário e odômetro com valores válidos.'); return }
    const driver = createDrivers.find((item) => item.id === createForm.driver_id)
    const beneficiary = createUnits.find((item) => item.id === createForm.beneficiary_unit_id)
    const amount = generatedFuelingAmount(createForm.liters, createForm.unit_price)
    if (amount == null) { setCreateFormError('Informe litros e preço com até 3 e 4 casas decimais, respectivamente, dentro dos limites de valor do banco.'); return }
    const exceedsTank = liters > Number(vehicle.tank_capacity_l)
    onRequestConfirmation({
      eyebrow: 'INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS',
      title: 'Confirmar novo abastecimento',
      message: 'Confira os dados antes de registrar. O valor total será calculado pelo banco e, sem comprovante anexado, o abastecimento ficará pendente até o envio e a conferência oficial.',
      details: [
        `Veículo: ${vehicle.placa} · ${vehicle.marca || ''} ${vehicle.modelo || ''}`.trim(),
        `Posto: ${station.nome_fantasia_snapshot || station.razao_social_snapshot} · CNPJ ${station.cnpj_snapshot}`,
        `Combustível: ${fuel.nome || '—'} · unidade responsável: ${unit.nome}${unit.sigla ? ` (${unit.sigla})` : ''}`,
        `Data: ${formatDate(performedAt.toISOString())}`,
        `Volume: ${liters.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${fuel.unidade_medida || 'L'} · preço unitário ${formatMoney(unitPrice)}`,
        `Valor total calculado: ${formatMoney(amount)} · odômetro ${odometer.toLocaleString('pt-BR')} km`,
        ...(beneficiary ? [`Unidade beneficiária: ${beneficiary.nome}${beneficiary.sigla ? ` (${beneficiary.sigla})` : ''}`] : []),
        ...(useAuthorization ? [`Autorização aprovada: ${useAuthorization.purpose} · válida até ${formatDate(useAuthorization.valid_until)}`] : []),
        ...(driver ? [`Motorista: ${driver.nome}${driver.matricula ? ` · matrícula ${driver.matricula}` : ''}`] : []),
        `Situação inicial: Pendente de comprovante${createForm.receipt.trim() ? ` · recibo ${createForm.receipt.trim()}` : ''}`,
        ...(exceedsTank ? [`ATENÇÃO: volume informado excede a capacidade cadastrada do tanque (${Number(vehicle.tank_capacity_l).toLocaleString('pt-BR')} L); o banco marcará o registro com inconsistência.`] : []),
      ],
      confirmLabel: 'Cadastrar abastecimento',
      onConfirm: saveNewFueling,
    })
  }

  const currentDocument = (fueling: Fueling) => (fueling.documents || []).filter((document) => document.is_current).sort((a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at))[0]
  const generatedAmountPreview = generatedFuelingAmount(createForm.liters, createForm.unit_price)
  const activeFilters = Number(Boolean(search.trim())) + Number(Boolean(dateStart)) + Number(Boolean(dateEnd)) + Number(Boolean(vehicleFilter)) + Number(Boolean(fuelFilter)) + Number(Boolean(stationFilter)) + Number(Boolean(statusFilter)) + Number(Boolean(documentFilter))
  function clearFilters() { setSearch(''); setDateStart(''); setDateEnd(''); setVehicleFilter(''); setFuelFilter(''); setStationFilter(''); setStatusFilter(''); setDocumentFilter('') }
  const vehicleOptions = Array.from(new Map(fuelings.filter((item) => item.vehicle_id).map((item) => [item.vehicle_id as string, item.vehicles?.placa || 'Veículo sem placa'])).entries()).map(([id, label]) => ({ id, label })).sort((a, b) => collator.compare(a.label, b.label))
  const fuelOptions = Array.from(new Map(fuelings.filter((item) => item.fuel_type_id).map((item) => [item.fuel_type_id as string, item.fuel_type?.nome || 'Combustível'])).entries()).map(([id, label]) => ({ id, label })).sort((a, b) => collator.compare(a.label, b.label))
  const stationOptions = Array.from(new Map(fuelings.filter((item) => item.station_id).map((item) => [item.station_id as string, item.stations?.nome_fantasia_snapshot || 'Posto sem identificação'])).entries()).map(([id, label]) => ({ id, label })).sort((a, b) => collator.compare(a.label, b.label))
  const localDay = (value: string) => new Intl.DateTimeFormat('en-CA').format(new Date(value))
  const filtered = fuelings.filter((fueling) => {
    const document = currentDocument(fueling)
    const day = localDay(fueling.performed_at)
    const text = [fueling.vehicles?.placa, fueling.vehicles?.modelo, fueling.fuel_type?.nome, fueling.stations?.nome_fantasia_snapshot, fueling.station_receipt_number, document?.file_name].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR')
    return (!search.trim() || text.includes(search.trim().toLocaleLowerCase('pt-BR')))
      && (!dateStart || day >= dateStart)
      && (!dateEnd || day <= dateEnd)
      && (!vehicleFilter || fueling.vehicle_id === vehicleFilter)
      && (!fuelFilter || fueling.fuel_type_id === fuelFilter)
      && (!stationFilter || fueling.station_id === stationFilter)
      && (!statusFilter || fueling.status === statusFilter)
      && (!documentFilter || (document ? document.document_status === documentFilter : documentFilter === 'SEM_COMPROVANTE'))
  })
  const sorted = (() => {
    const compare = (a: Fueling, b: Fueling) => {
      switch (sortKey) {
        case 'date': return Date.parse(a.performed_at) - Date.parse(b.performed_at)
        case 'vehicle': return collator.compare(a.vehicles?.placa || '', b.vehicles?.placa || '')
        case 'station': return collator.compare(a.stations?.nome_fantasia_snapshot || '', b.stations?.nome_fantasia_snapshot || '')
        case 'fuel': return collator.compare(a.fuel_type?.nome || '', b.fuel_type?.nome || '')
        case 'volume': return Number(a.liters || 0) - Number(b.liters || 0)
        case 'amount': return Number(a.total_amount || 0) - Number(b.total_amount || 0)
        case 'document': return collator.compare(currentDocument(a)?.file_name || currentDocument(a)?.document_status || '', currentDocument(b)?.file_name || currentDocument(b)?.document_status || '')
        case 'status': return collator.compare(statusLabel[a.status] || a.status, statusLabel[b.status] || b.status)
      }
    }
    return [...filtered].sort((a, b) => compare(a, b) * (sortDirection === 'asc' ? 1 : -1))
  })()
  function sortBy(key: FuelingSortKey) {
    if (sortKey === key) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDirection(key === 'date' ? 'desc' : 'asc') }
  }
  function sortHeading(key: FuelingSortKey, label: string) {
    const Icon = sortKey === key ? sortDirection === 'asc' ? ArrowUp : ArrowDown : ArrowUpDown
    return <button type="button" className="fleet-sort-button" onClick={() => sortBy(key)} aria-label={`Ordenar por ${label}${sortKey === key ? sortDirection === 'asc' ? ', crescente' : ', decrescente' : ''}`}><span>{label}</span><Icon size={13} aria-hidden="true" /></button>
  }
  const sortAria = (key: FuelingSortKey) => sortKey === key ? sortDirection === 'asc' ? 'ascending' as const : 'descending' as const : 'none' as const

  async function openDocument(document: FuelingDocument) {
    if (!supabase) return
    setError('')
    const result = await supabase.storage.from('fleet-documents').createSignedUrl(document.storage_path, 300)
    if (result.error || !result.data?.signedUrl) { setError('Não foi possível abrir o comprovante. Verifique o acesso ao documento e tente novamente.'); return }
    setPreview({ title: document.file_name, url: result.data.signedUrl, mimeType: document.mime_type })
  }

  function requestDocumentAcceptance(fueling: Fueling, document: FuelingDocument) {
    onRequestConfirmation({
      eyebrow: 'INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS',
      title: 'Aceitar comprovante e conferir abastecimento',
      message: 'Confirme que o documento foi revisado e corresponde aos dados do abastecimento. Esta ação marcará o comprovante como aceito e o registro como conferido.',
      details: [`Veículo: ${fueling.vehicles?.placa || 'Não informado'}`, `Data: ${formatDate(fueling.performed_at)}`, `Posto: ${fueling.stations?.nome_fantasia_snapshot || 'Não informado'}`, `Comprovante: ${document.file_name}`],
      confirmLabel: 'Aceitar e marcar como conferido',
      onConfirm: () => reviewDocument(fueling, document, 'ACEITO'),
    })
  }

  async function reviewDocument(fueling: Fueling, document: FuelingDocument, decision: 'ACEITO' | 'REJEITADO', reason = ''): Promise<string | null> {
    if (!supabase) return 'O serviço de dados está indisponível. Tente novamente.'
    setWorkingId(fueling.id); setError(''); setNotice('')
    try {
      const { data: currentUser, error: userError } = await supabase.rpc('fleet_current_usuario_id')
      if (userError || currentUser == null) return 'Não foi possível identificar o operador autenticado para registrar a conferência.'
      const reviewedAt = new Date().toISOString()
      const nextDocumentStatus = decision
      const nextFuelingStatus = decision === 'ACEITO' ? 'CONFERIDO' : 'SOLICITADA_CORRECAO'
      const documentUpdate = await supabase.from('fleet_fueling_documents').update({ document_status: nextDocumentStatus, reviewed_by: currentUser, reviewed_at: reviewedAt, rejection_reason: decision === 'REJEITADO' ? reason : null }).eq('id', document.id).eq('fueling_id', fueling.id).eq('is_current', true).eq('document_status', document.document_status).select('id').maybeSingle()
      if (documentUpdate.error || !documentUpdate.data) return 'O comprovante mudou desde que a fila foi carregada ou não pode ser atualizado. Atualize a lista e tente novamente.'
      const fuelingPayload = decision === 'ACEITO'
        ? { status: nextFuelingStatus, registered_officially_by: currentUser, registered_officially_at: reviewedAt, updated_at: reviewedAt }
        : { status: nextFuelingStatus, inconsistency_notes: reason, updated_at: reviewedAt }
      const fuelingUpdate = await supabase.from('fleet_fuelings').update(fuelingPayload).eq('id', fueling.id).eq('status', fueling.status).select('id,status,registered_officially_by,registered_officially_at,inconsistency_notes,inconsistency_code').maybeSingle()
      if (fuelingUpdate.error || !fuelingUpdate.data) {
        const rollback = await supabase.from('fleet_fueling_documents').update({ document_status: document.document_status, reviewed_by: document.reviewed_by ?? null, reviewed_at: document.reviewed_at ?? null, rejection_reason: document.rejection_reason }).eq('id', document.id).eq('fueling_id', fueling.id)
        return rollback.error
          ? `O status do abastecimento não foi atualizado e o comprovante não pôde ser revertido. Atualize a fila e procure o administrador. ${fuelingUpdate.error?.message || ''}`
          : 'Não foi possível atualizar o status do abastecimento. A revisão do comprovante foi revertida; atualize a fila e tente novamente.'
      }
      const updatedFueling = fuelingUpdate.data
      const persistedStatus = String(updatedFueling.status)
      setFuelings((current) => current.map((item) => item.id !== fueling.id ? item : {
        ...item,
        status: persistedStatus,
        registered_officially_by: updatedFueling.registered_officially_by,
        registered_officially_at: updatedFueling.registered_officially_at,
        inconsistency_notes: updatedFueling.inconsistency_notes,
        inconsistency_code: updatedFueling.inconsistency_code,
        documents: (item.documents || []).map((itemDocument) => itemDocument.id === document.id ? { ...itemDocument, document_status: nextDocumentStatus, reviewed_by: currentUser, reviewed_at: reviewedAt, rejection_reason: decision === 'REJEITADO' ? reason : null } : itemDocument),
      }))
      if (persistedStatus !== nextFuelingStatus) setError(decision === 'ACEITO'
        ? `Comprovante aceito, mas a validação automática manteve o abastecimento como “${statusLabel[persistedStatus] || persistedStatus}”. Resolva a inconsistência antes do fechamento.`
        : `Comprovante rejeitado e motivo registrado; a validação automática manteve o abastecimento como “${statusLabel[persistedStatus] || persistedStatus}”.`)
      else setNotice(decision === 'ACEITO' ? 'Comprovante aceito e abastecimento marcado como conferido.' : 'Comprovante rejeitado. Correção solicitada ao posto; a justificativa foi registrada.')
      return null
    } catch {
      return 'Falha de conexão durante a conferência. Atualize a fila antes de tentar novamente.'
    } finally { setWorkingId('') }
  }

  async function confirmWithoutPendingDocument(fueling: Fueling): Promise<string | null> {
    if (!supabase) return 'O serviço de dados está indisponível. Tente novamente.'
    setWorkingId(fueling.id); setError(''); setNotice('')
    try {
      const { data: currentUser, error: userError } = await supabase.rpc('fleet_current_usuario_id')
      if (userError || currentUser == null) return 'Não foi possível identificar o operador autenticado para registrar a conferência.'
      const checkedAt = new Date().toISOString()
      const result = await supabase.from('fleet_fuelings').update({ status: 'CONFERIDO', registered_officially_by: currentUser, registered_officially_at: checkedAt, updated_at: checkedAt }).eq('id', fueling.id).eq('status', fueling.status).select('id,status,registered_officially_by,registered_officially_at').maybeSingle()
      if (result.error || !result.data) return 'O abastecimento não pôde ser conferido. Ele pode ter sido alterado por outro operador; atualize a lista.'
      const updatedFueling = result.data
      const persistedStatus = String(updatedFueling.status)
      setFuelings((current) => current.map((item) => item.id === fueling.id ? { ...item, status: persistedStatus, registered_officially_by: updatedFueling.registered_officially_by, registered_officially_at: updatedFueling.registered_officially_at } : item))
      if (persistedStatus === 'CONFERIDO') setNotice('Abastecimento conferido e operador responsável registrado.')
      else setError(`A validação automática manteve o abastecimento como “${statusLabel[persistedStatus] || persistedStatus}”. Resolva a inconsistência antes do fechamento.`)
      return null
    } catch {
      return 'Falha de conexão ao conferir o abastecimento. Atualize a fila e tente novamente.'
    } finally { setWorkingId('') }
  }

  function requestFuelingConfirmation(fueling: Fueling) {
    const document = currentDocument(fueling)
    onRequestConfirmation({
      eyebrow: 'INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS',
      title: 'Confirmar conferência do abastecimento',
      message: document ? 'O comprovante já foi aceito, mas o registro ainda não está marcado como conferido.' : 'Você está conferindo este abastecimento sem um comprovante anexado. Prossiga apenas se isso estiver de acordo com a análise administrativa.',
      details: [`Veículo: ${fueling.vehicles?.placa || 'Não informado'}`, `Data: ${formatDate(fueling.performed_at)}`, `Posto: ${fueling.stations?.nome_fantasia_snapshot || 'Não informado'}`, `${Number(fueling.liters).toLocaleString('pt-BR')} L · ${formatMoney(fueling.total_amount)}`, `Comprovante: ${document?.file_name || 'Não anexado'}`],
      confirmLabel: 'Confirmar conferência',
      onConfirm: () => confirmWithoutPendingDocument(fueling),
    })
  }

  async function submitCorrection(reason: string): Promise<string | null> {
    if (!correctionTarget) return 'Selecione novamente o abastecimento que precisa de retificação.'
    const result = await reviewDocument(correctionTarget.fueling, correctionTarget.document, 'REJEITADO', reason)
    if (!result) setCorrectionTarget(null)
    return result
  }

  const renderRows = () => sorted.map((fueling) => {
    const document = currentDocument(fueling)
    const completed = completedFuelingStatuses.includes(fueling.status)
    const needsCorrection = ['SOLICITADA_CORRECAO', 'PENDENTE_DE_COMPROVANTE'].includes(fueling.status) || document?.document_status === 'REJEITADO'
    const validationIssue = fueling.status === 'COM_INCONSISTENCIA'
    const documentAwaitingReview = Boolean(document && ['PENDENTE', 'ENVIADO', 'EM_ANALISE'].includes(document.document_status))
    const canConfirm = !completed && !needsCorrection && !validationIssue && (!document || document.document_status === 'ACEITO')
    return <tr key={fueling.id}>
      <td><strong>{formatDate(fueling.performed_at)}</strong><small>Enviado {formatDate(fueling.submitted_at)}</small></td>
      <td><strong>{fueling.vehicles?.placa || '—'}</strong><small>{fueling.vehicles?.modelo || 'Veículo'}</small></td>
      <td>{fueling.stations?.nome_fantasia_snapshot || 'Posto não informado'}</td>
      <td>{fueling.fuel_type?.nome || '—'}</td>
      <td>{Number(fueling.liters).toLocaleString('pt-BR')} L</td>
      <td>{formatMoney(fueling.total_amount)}</td>
      <td className="fleet-fueling-proof-cell">{document ? <><button type="button" className="fleet-link-button" onClick={() => void openDocument(document)} title={`Visualizar ${document.file_name}`}><Eye size={14} /> Visualizar</button><small title={document.file_name}>{document.file_name}</small><StatusChip value={document.document_status} />{document.rejection_reason && document.document_status === 'REJEITADO' && <small className="fleet-rejection-note" title={document.rejection_reason}>Motivo: {document.rejection_reason}</small>}</> : <span className="fleet-status warning">Não anexado</span>}</td>
      <td><StatusChip value={fueling.status} /></td>
      <td><div className="fleet-fueling-review-actions">{documentAwaitingReview && !completed && <><button type="button" className="fleet-review-accept" onClick={() => requestDocumentAcceptance(fueling, document as FuelingDocument)} disabled={Boolean(workingId)}><CheckCircle2 size={14} /> Aceitar</button><button type="button" className="fleet-review-correction" onClick={() => setCorrectionTarget({ fueling, document: document as FuelingDocument })} disabled={Boolean(workingId)}><RotateCcw size={14} /> Solicitar retificação</button></>}{canConfirm && <button type="button" className="fleet-secondary-button fleet-confirm-button" onClick={() => requestFuelingConfirmation(fueling)} disabled={Boolean(workingId)}><ClipboardCheck size={14} /> Conferir</button>}{completed && <span className="fleet-row-confirmed"><CheckCircle2 size={14} /> Finalizado</span>}{(needsCorrection || validationIssue) && !documentAwaitingReview && <span className="fleet-fueling-waiting">{validationIssue ? 'Resolver inconsistência' : 'Aguardando comprovante'}</span>}</div></td>
    </tr>
  })

  return <section className="fleet-section fleet-page-section">
    <div className="fleet-page-heading"><div><span className="fleet-kicker">FILA OPERACIONAL</span><h2>Abastecimentos</h2><p>Consulte, cadastre, confira dados e analise os comprovantes enviados pelos postos.</p></div><div className="fleet-fueling-page-actions"><button type="button" className="fleet-primary-button" onClick={() => void openCreateForm()} disabled={createOptionsLoading}><Plus size={15} /> Novo Abastecimento</button><button type="button" className="fleet-secondary-button fleet-fuelings-refresh" onClick={() => void refresh()} disabled={loading || Boolean(workingId)}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Atualizar</button></div></div>
    {error && <div className="fleet-inline-error" role="alert"><CircleAlert size={15} /> {error}</div>}{notice && <div className="fleet-inline-success" role="status"><CheckCircle2 size={15} /> {notice}</div>}
    <div className="fleet-vehicle-filters fleet-fueling-filters"><div className="fleet-vehicle-filter-heading"><div><Filter size={15} /><strong>Filtros</strong><span>{loading ? 'Carregando…' : `${filtered.length.toLocaleString('pt-BR')} de ${fuelings.length.toLocaleString('pt-BR')} carregado(s)`}</span></div><button type="button" onClick={clearFilters} disabled={!activeFilters}><RotateCcw size={13} /> Limpar filtros</button></div>
      <div className="fleet-vehicle-filter-grid fleet-fueling-filter-grid">
        <label className="fleet-vehicle-search">Buscar<div><Search size={14} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Placa, posto, recibo…" /></div></label>
        <label className="fleet-fueling-date-filter">Data do abastecimento<span><input type="date" aria-label="Data inicial" value={dateStart} onChange={(event) => setDateStart(event.target.value)} /><input type="date" aria-label="Data final" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} /></span></label>
        <label>Veículo<select value={vehicleFilter} onChange={(event) => setVehicleFilter(event.target.value)}><option value="">Todos os veículos</option>{vehicleOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label>Combustível<select value={fuelFilter} onChange={(event) => setFuelFilter(event.target.value)}><option value="">Todos os combustíveis</option>{fuelOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label>Posto<select value={stationFilter} onChange={(event) => setStationFilter(event.target.value)}><option value="">Todos os postos</option>{stationOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label>Situação do abastecimento<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todas</option>{fuelingStatuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
        <label>Situação do comprovante<select value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value)}><option value="">Todas</option><option value="SEM_COMPROVANTE">Sem comprovante</option>{proofStatuses.map((status) => <option key={status} value={status}>{statusLabel[status]}</option>)}</select></label>
      </div>
    </div>
    <div className="fleet-fueling-page-hint"><ShieldCheck size={14} /> A lista começa pelos 100 abastecimentos mais recentes. “Carregar mais” acrescenta os próximos 100.</div>
    <div className="fleet-table-panel">{loading ? <LoadingRows /> : sorted.length ? <table className="fleet-table fleet-fuelings-table"><thead><tr><th aria-sort={sortAria('date')}>{sortHeading('date', 'Data real')}</th><th aria-sort={sortAria('vehicle')}>{sortHeading('vehicle', 'Veículo')}</th><th aria-sort={sortAria('station')}>{sortHeading('station', 'Posto')}</th><th aria-sort={sortAria('fuel')}>{sortHeading('fuel', 'Combustível')}</th><th aria-sort={sortAria('volume')}>{sortHeading('volume', 'Volume')}</th><th aria-sort={sortAria('amount')}>{sortHeading('amount', 'Valor')}</th><th aria-sort={sortAria('document')}>{sortHeading('document', 'Comprovante')}</th><th aria-sort={sortAria('status')}>{sortHeading('status', 'Situação')}</th><th><span className="fleet-sr-only">Ações</span></th></tr></thead><tbody>{renderRows()}</tbody></table> : <EmptyState icon={Fuel} title={fuelings.length ? 'Nenhum abastecimento encontrado' : 'Nenhum abastecimento cadastrado'} text={fuelings.length ? 'Nenhum registro corresponde aos filtros. Ajuste ou limpe os filtros.' : 'Os registros enviados pelos postos aparecerão aqui.'} action={fuelings.length && activeFilters ? 'Limpar filtros' : undefined} onAction={clearFilters} />}</div>
    {!loading && <div className="fleet-fueling-load-more"><span>{fuelings.length.toLocaleString('pt-BR')} abastecimento(s) carregado(s){hasMore ? ' · há mais registros disponíveis' : ' · fim da lista disponível'}</span>{hasMore && <button type="button" className="fleet-secondary-button" onClick={() => void loadMore()} disabled={loadingMore || Boolean(workingId)}>{loadingMore ? <><RefreshCw size={14} className="spin" /> Carregando…</> : 'Carregar mais 100'}</button>}</div>}
    {showCreateForm && <div className="fleet-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !createSaving && setShowCreateForm(false)}><form className="fleet-modal fleet-fueling-create-modal" onSubmit={requestCreateFueling}>
      <div className="fleet-modal-heading"><div><span className="fleet-kicker">CADASTRO OPERACIONAL</span><h2>Novo Abastecimento</h2></div><button type="button" className="fleet-close" onClick={() => setShowCreateForm(false)} aria-label="Fechar cadastro"><X size={18} /></button></div>
      <p className="fleet-modal-note"><BadgeCheck size={16} /> A secretaria responsável segue a lotação administrativa do veículo. Veículo cedido ou usado por outra secretaria exige autorização aprovada e vigente com comprovante privado.</p>
      {createOptionsLoading ? <div className="fleet-loading"><RefreshCw size={16} className="spin" /> Carregando opções oficiais do município…</div> : <>
        <div className="fleet-form-grid fleet-fueling-create-grid">
          <label>Veículo<select required value={createForm.vehicle_id} onChange={(event) => {
            const vehicle = createVehicles.find((item) => item.id === event.target.value)
            setCreateForm((current) => ({ ...current, vehicle_id: event.target.value, driver_id: '', authorization_id: '', responsible_unit_id: vehicle?.responsible_unit_id || '', beneficiary_unit_id: vehicle?.responsible_unit_id || '', ...(vehicle?.fuel_type_id && createFuelTypes.some((fuel) => fuel.id === vehicle.fuel_type_id) ? { fuel_type_id: vehicle.fuel_type_id } : { fuel_type_id: '' }), odometer_km: vehicle?.current_odometer_km != null ? String(vehicle.current_odometer_km) : current.odometer_km }))
            setCreateFormError('')
          }}><option value="">Selecione a placa</option>{createVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.placa} — {vehicle.marca || ''} {vehicle.modelo || ''} · {vehicle.operational_status}</option>)}</select></label>
          <label>Posto credenciado<select required value={createForm.station_id} onChange={(event) => updateCreateForm('station_id', event.target.value)}><option value="">Selecione um posto ativo</option>{createStations.map((station) => <option key={station.id} value={station.id}>{station.nome_fantasia_snapshot || station.razao_social_snapshot} · {station.cnpj_snapshot}</option>)}</select></label>
          <label>Combustível<select required value={createForm.fuel_type_id} onChange={(event) => updateCreateForm('fuel_type_id', event.target.value)}><option value="">Selecione o combustível</option>{createFuelTypes.filter((fuel) => !createVehicles.find((item) => item.id === createForm.vehicle_id)?.fuel_type_id || fuel.id === createVehicles.find((item) => item.id === createForm.vehicle_id)?.fuel_type_id).map((fuel) => <option key={fuel.id} value={fuel.id}>{fuel.nome}{fuel.sigla ? ` (${fuel.sigla})` : ''}</option>)}</select></label>
          <label>Unidade responsável<input readOnly value={createUnits.find((unit) => unit.id === createForm.responsible_unit_id)?.nome || 'Definida pela lotação do veículo'} /></label>
          <label>Autorização de uso<select required={createVehicles.find((item) => item.id === createForm.vehicle_id)?.operational_status === 'CEDIDO'} disabled={createAuthorizationsLoading || !createForm.vehicle_id} value={createForm.authorization_id} onChange={(event) => {
            const authorization = createUseAuthorizations.find((item) => item.id === event.target.value)
            setCreateForm((current) => ({ ...current, authorization_id: event.target.value, beneficiary_unit_id: authorization?.beneficiary_unit_id || current.responsible_unit_id }))
            setCreateFormError('')
          }}><option value="">{createAuthorizationsLoading ? 'Verificando autorizações…' : createVehicles.find((item) => item.id === createForm.vehicle_id)?.operational_status === 'CEDIDO' ? 'Selecione autorização vigente' : 'Uso pela unidade responsável'}</option>{createUseAuthorizations.map((authorization) => <option key={authorization.id} value={authorization.id}>{createUnits.find((unit) => unit.id === authorization.beneficiary_unit_id)?.nome || 'Beneficiária'} · {authorization.purpose} · até {formatDate(authorization.valid_until)}</option>)}</select>{createForm.vehicle_id && !createAuthorizationsLoading && !createUseAuthorizations.length && createVehicles.find((item) => item.id === createForm.vehicle_id)?.operational_status === 'CEDIDO' && <small>Nenhuma autorização aprovada e vigente com comprovante foi encontrada.</small>}</label>
          <label>Unidade beneficiária<input readOnly value={createUnits.find((unit) => unit.id === createForm.beneficiary_unit_id)?.nome || 'Será a unidade responsável, salvo cessão aprovada'} /></label>
          <label>Motorista autorizado<select required value={createForm.driver_id} onChange={(event) => updateCreateForm('driver_id', event.target.value)} disabled={createDriversLoading || !createForm.vehicle_id}><option value="">{createDriversLoading ? 'Verificando autorizações…' : 'Selecione o motorista'}</option>{createDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.nome}{driver.matricula ? ` · ${driver.matricula}` : ''}{driver.cnh_category ? ` · Cat. ${driver.cnh_category}` : ''}</option>)}</select>{createForm.vehicle_id && !createDriversLoading && !createDrivers.length && <small>Nenhum motorista com CNH vigente autorizado para este veículo na data escolhida.</small>}</label>
          <label>Data e hora do abastecimento<input required type="datetime-local" value={createForm.performed_at} onChange={(event) => updateCreateForm('performed_at', event.target.value)} /></label>
          <label>Litros<input required type="number" min="0.001" max="9999999.999" step="0.001" value={createForm.liters} onChange={(event) => updateCreateForm('liters', event.target.value)} /></label>
          <label>Preço unitário<input required type="number" min="0" max="99999999.9999" step="0.0001" value={createForm.unit_price} onChange={(event) => updateCreateForm('unit_price', event.target.value)} /></label>
          <label>Odômetro (km)<input required type="number" min="0" max="999999999999.99" step="0.01" value={createForm.odometer_km} onChange={(event) => updateCreateForm('odometer_km', event.target.value)} /></label>
          <label>Número do recibo (opcional)<input maxLength={120} value={createForm.receipt} onChange={(event) => updateCreateForm('receipt', event.target.value)} placeholder="Nota fiscal ou recibo" /></label>
          <label className="fleet-form-wide">Observações (opcional)<textarea maxLength={2000} rows={3} value={createForm.notes} onChange={(event) => updateCreateForm('notes', event.target.value)} placeholder="Informações complementares sobre o lançamento…" /></label>
        </div>
        {createForm.liters !== '' && createForm.unit_price !== '' && generatedAmountPreview != null && <div className="fleet-fueling-total-preview"><span>Valor total estimado <small>O valor oficial será calculado pelo banco.</small></span><strong>{formatMoney(generatedAmountPreview)}</strong></div>}
        {(() => { const vehicle = createVehicles.find((item) => item.id === createForm.vehicle_id); return vehicle && Number(createForm.liters) > Number(vehicle.tank_capacity_l) ? <div className="fleet-fueling-capacity-warning" role="alert"><AlertTriangle size={15} /> O volume ultrapassa a capacidade cadastrada do tanque ({Number(vehicle.tank_capacity_l).toLocaleString('pt-BR')} L). Se confirmado, o banco marcará o abastecimento com inconsistência.</div> : null })()}
      </>}
      {createFormError && <div className="fleet-inline-error fleet-fueling-create-error" role="alert"><CircleAlert size={15} /> {createFormError}</div>}
      {!createOptionsLoading && (!createVehicles.length || !createStations.length || !createFuelTypes.length || !createUnits.length) && <div className="fleet-fueling-create-hint">Para cadastrar, é necessário ter veículo ATIVO/CEDIDO, posto credenciado ativo, combustível ativo e unidade responsável cadastrada. Veículos cedidos exigem autorização vigente.</div>}
      <div className="fleet-modal-actions"><button type="button" className="fleet-secondary-button" onClick={() => setShowCreateForm(false)} disabled={createSaving}>Cancelar</button><button type="submit" className="fleet-primary-button" disabled={createOptionsLoading || createSaving || !createVehicles.length || !createStations.length || !createFuelTypes.length || !createUnits.length}><ShieldCheck size={15} /> Revisar e cadastrar</button></div>
    </form></div>}
    {correctionTarget && <FuelingCorrectionDialog fueling={correctionTarget.fueling} document={correctionTarget.document} onCancel={() => setCorrectionTarget(null)} onConfirm={submitCorrection} />}
    {preview && <div className="fleet-proof-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPreview(null)}><section className="fleet-proof-preview" role="dialog" aria-modal="true" aria-labelledby="fleet-proof-preview-title"><header><div><span className="fleet-kicker">COMPROVANTE DO ABASTECIMENTO</span><h2 id="fleet-proof-preview-title">{preview.title}</h2></div><button type="button" className="fleet-close" onClick={() => setPreview(null)} aria-label="Fechar pré-visualização"><X size={18} /></button></header><div className="fleet-proof-preview-body">{preview.mimeType.startsWith('image/') ? <img src={preview.url} alt={`Comprovante ${preview.title}`} /> : preview.mimeType === 'application/pdf' ? <iframe src={preview.url} title={`Pré-visualização de ${preview.title}`} /> : <p>Este formato não pode ser exibido aqui. <a href={preview.url} target="_blank" rel="noreferrer">Abrir comprovante em nova aba</a></p>}</div><footer><span>Link temporário e protegido, válido por 5 minutos.</span><a className="fleet-secondary-button" href={preview.url} target="_blank" rel="noreferrer">Abrir em nova aba</a></footer></section></div>}
  </section>
}

function FuelingCorrectionDialog({ fueling, document, onCancel, onConfirm }: { fueling: Fueling; document: FuelingDocument; onCancel: () => void; onConfirm: (reason: string) => Promise<string | null> }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (reason.trim().length < 8) { setError('Informe um motivo objetivo com pelo menos 8 caracteres.'); return }
    setSaving(true); setError('')
    try {
      const result = await onConfirm(reason.trim())
      if (result) { setError(result); setSaving(false); return }
      onCancel()
    } catch {
      setError('Não foi possível registrar a solicitação. Tente novamente.')
      setSaving(false)
    }
  }
  return <div className="fleet-confirm-backdrop fleet-correction-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onCancel() }}><form className="fleet-confirm-dialog fleet-correction-dialog" role="dialog" aria-modal="true" aria-labelledby="fleet-correction-title" onSubmit={submit}><header className="fleet-confirm-heading"><span className="fleet-confirm-emblem danger"><RotateCcw size={19} /></span><div><span className="fleet-kicker">INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS</span><h2 id="fleet-correction-title">Solicitar retificação</h2></div></header><p className="fleet-confirm-message">O comprovante será marcado como rejeitado e o abastecimento como “Correção solicitada”. O posto verá o motivo e poderá enviar um novo arquivo.</p><div className="fleet-confirm-details"><div><CheckCircle2 size={14} /><span>Veículo: {fueling.vehicles?.placa || 'Não informado'} · {formatDate(fueling.performed_at)}</span></div><div><CheckCircle2 size={14} /><span>Comprovante: {document.file_name}</span></div></div><label className="fleet-correction-reason">Motivo e orientação para o posto<textarea required minLength={8} maxLength={1000} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: O recibo está ilegível. Envie uma imagem completa em que seja possível ler data, litros e valor." /></label>{error && <div className="fleet-confirm-error" role="alert"><CircleAlert size={15} />{error}</div>}<footer className="fleet-confirm-actions"><button className="fleet-secondary-button" type="button" onClick={onCancel} disabled={saving}>Cancelar</button><button className="fleet-primary-button fleet-confirm-danger" type="submit" disabled={saving || reason.trim().length < 8}><RotateCcw size={15} />{saving ? 'Registrando…' : 'Rejeitar e solicitar retificação'}</button></footer></form></div>
}
type DashboardMetricRow = { id: string | null; label: string; description?: string; acronym?: string; fueling_count: number; liters: number; amount: number; weighted_price_per_liter?: number | null }
type CentralDashboardData = {
  updated_at: string
  summary: { fueling_count: number; liters: number; registered_amount: number; confirmed_amount: number; confirmed_count: number; distinct_vehicles: number; year_to_date_amount: number; average_per_fueling: number }
  by_vehicle: DashboardMetricRow[]
  by_responsible_unit: DashboardMetricRow[]
  filter_options: { units: { id: string; name: string; acronym: string }[] }
}
type AnalyticsRow = { tipo: string; descricao: string; abastecimentos: number; litros: number; custo: number; media: number }

function monthEndExclusive(value: string) {
  const [year, month] = value.split('-').map(Number)
  return `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01`
}
function formatReference(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
}
function callDashboardOverview(period: string, responsibleUnitId: string | null = null) {
  if (!supabase) return Promise.resolve({ data: null, error: new Error('O serviço de dados está indisponível.') })
  return supabase.rpc('fleet_dashboard_overview', {
    p_start_month: `${period}-01`, p_end_month_exclusive: monthEndExclusive(period),
    p_responsible_unit_id: responsibleUnitId, p_beneficiary_unit_id: null, p_vehicle_id: null,
    p_driver_id: null, p_station_id: null, p_fuel_type_id: null, p_fueling_status: null,
    p_document_status: null, p_recent_limit: 10,
  })
}

function FuelConsumptionDashboard() {
  const initialPeriod = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit' }).format(new Date())
  const [period, setPeriod] = useState(initialPeriod)
  const [overview, setOverview] = useState<CentralDashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  useEffect(() => {
    const id = ++requestId.current
    setLoading(true); setError('')
    void callDashboardOverview(period).then(({ data, error: requestError }) => {
      if (id !== requestId.current) return
      if (requestError) { setOverview(null); setError('Não foi possível carregar o dashboard. Verifique o perfil de Frotas e tente atualizar.') }
      else setOverview(data as unknown as CentralDashboardData)
      setLoading(false)
    })
  }, [period])
  const rows: AnalyticsRow[] = (overview?.by_vehicle || []).map((row) => ({ tipo: row.label, descricao: row.description || '', abastecimentos: Number(row.fueling_count || 0), litros: Number(row.liters || 0), custo: Number(row.amount || 0), media: Number(row.fueling_count || 0) ? Number(row.amount || 0) / Number(row.fueling_count || 0) : 0 }))
  const maxLiters = Math.max(...rows.map((row) => row.litros), 1)
  const maxCost = Math.max(...rows.map((row) => row.custo), 1)
  const totalLiters = Number(overview?.summary?.liters || 0)
  const totalCost = Number(overview?.summary?.registered_amount || 0)
  const totalFuelings = Number(overview?.summary?.fueling_count || 0)
  const periodLabel = formatReference(period)
  return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">INTELIGÊNCIA OPERACIONAL</span><h2>Dashboard de consumo</h2><p>Volume e valores por veículo, agregados no Supabase para a competência selecionada.</p></div><div className="fleet-report-period"><BarChart3 size={15} /><input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></div></div>{error && <div className="fleet-inline-error" role="alert"><CircleAlert size={15} /> {error}</div>}<div className="fleet-metric-grid fleet-report-metrics"><article className="fleet-metric"><span className="fleet-metric-icon blue"><Fuel size={19} /></span><div><span>Litros registrados</span><strong>{totalLiters.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</strong><small>{periodLabel} · backend</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon green"><BarChart3 size={19} /></span><div><span>Valor registrado</span><strong>{formatMoney(totalCost)}</strong><small>Exclui cancelamentos e rascunhos</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon violet"><Truck size={19} /></span><div><span>Veículos distintos</span><strong>{Number(overview?.summary?.distinct_vehicles || 0).toLocaleString('pt-BR')}</strong><small>Ativos no período filtrado</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon amber"><ClipboardCheck size={19} /></span><div><span>Abastecimentos</span><strong>{totalFuelings.toLocaleString('pt-BR')}</strong><small>Contagem integral da competência</small></div></article></div>{loading ? <LoadingRows /> : overview && rows.length ? <><div className="fleet-overview-updated"><span>Atualizado em {formatDate(overview.updated_at)}</span><span>Os totais são integrais; a visualização por veículo apresenta os 12 maiores e permite detalhamento completo na Visão Geral.</span></div><div className="fleet-chart-grid"><article className="fleet-panel fleet-chart-panel"><div className="fleet-section-heading"><div><span className="fleet-kicker">VOLUME</span><h2>Litros por veículo</h2></div></div><div className="fleet-bars">{rows.map((row) => <div className="fleet-bar-row" key={`litros-${row.tipo}`}><div className="fleet-bar-label"><span>{row.tipo}{row.descricao ? ` · ${row.descricao}` : ''}</span><strong>{row.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</strong></div><div className="fleet-bar-track"><span className="fleet-bar-fill blue" style={{ width: `${(row.litros / maxLiters) * 100}%` }} /></div></div>)}</div></article><article className="fleet-panel fleet-chart-panel"><div className="fleet-section-heading"><div><span className="fleet-kicker">VALOR REGISTRADO</span><h2>Valor por veículo</h2></div></div><div className="fleet-bars">{rows.map((row) => <div className="fleet-bar-row" key={`custo-${row.tipo}`}><div className="fleet-bar-label"><span>{row.tipo}{row.descricao ? ` · ${row.descricao}` : ''}</span><strong>{formatMoney(row.custo)}</strong></div><div className="fleet-bar-track"><span className="fleet-bar-fill gold" style={{ width: `${(row.custo / maxCost) * 100}%` }} /></div></div>)}</div></article></div><div className="fleet-table-panel"><table className="fleet-table fleet-report-table"><thead><tr><th>Veículo</th><th>Abastecimentos</th><th>Litros</th><th>Valor registrado</th><th>Média por abastecimento</th></tr></thead><tbody>{rows.map((row) => <tr key={row.tipo}><td><strong>{row.tipo}</strong><small>{row.descricao || 'Descrição não informada no cadastro'}</small></td><td>{row.abastecimentos.toLocaleString('pt-BR')}</td><td>{row.litros.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L</td><td><strong>{formatMoney(row.custo)}</strong></td><td>{formatMoney(row.media)}</td></tr>)}</tbody></table></div></> : !loading && <EmptyState icon={BarChart3} title="Nenhum consumo encontrado" text="Não há abastecimentos válidos para a competência selecionada." />}</section>
}

function MonthlyClosure() { return <FleetMonthlyClosure /> }

function SettingsPanel() { return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">CONFIGURAÇÃO DO MÓDULO</span><h2>Parâmetros operacionais</h2><p>Regras que orientam a operação de abastecimentos e conferência.</p></div></div><div className="fleet-settings-grid"><article><span><Gauge size={18} /></span><div><strong>Capacidade do tanque</strong><p>O abastecimento acima da capacidade cadastrada gera inconsistência para análise.</p></div></article><article><span><ClipboardCheck size={18} /></span><div><strong>Comprovantes</strong><p>O prazo operacional para envio do comprovante é de 24 horas após o abastecimento.</p></div></article><article><span><MapPin size={18} /></span><div><strong>Cessão temporária</strong><p>A secretaria responsável e a secretaria beneficiária são mantidas separadamente.</p></div></article><article><span><ShieldCheck size={18} /></span><div><strong>Perfis autorizados</strong><p>Gestor de Frotas e Administrador validam cadastros oficiais e fechamentos.</p></div></article></div></section> }

function StatusChip({ value }: { value: string }) { const tone = value.includes('INCONSISTENCIA') || value === 'SOLICITADA_CORRECAO' || value === 'REJEITADO' ? 'danger' : value.includes('PENDENTE') || value.includes('ENVIADO') || value === 'EM_ANALISE' ? 'warning' : value === 'ATIVO' || value === 'CONFERIDO' || value === 'ACEITO' ? 'success' : 'neutral'; return <span className={`fleet-status ${tone}`}>{statusLabel[value] || value.replaceAll('_', ' ')}</span> }
function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: typeof Truck; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="fleet-empty"><span><Icon size={24} /></span><strong>{title}</strong><p>{text}</p>{action && <button className="fleet-primary-button" onClick={onAction}><Plus size={15} /> {action}</button>}</div> }
function LoadingRows() { return <div className="fleet-loading"><RefreshCw className="spin" size={19} /> Carregando dados permitidos…</div> }
