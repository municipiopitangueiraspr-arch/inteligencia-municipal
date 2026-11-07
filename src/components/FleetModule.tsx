import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, BadgeCheck, Bell, ChevronRight, CircleAlert,
  ClipboardCheck, Fuel, Gauge, LayoutDashboard, LogOut, MapPin, Plus, RefreshCw,
  Settings2, ShieldCheck, Store, Truck, UserRound, Users, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import './FleetModule.css'

type FleetView = 'overview' | 'vehicles' | 'fuelings' | 'stations' | 'drivers' | 'settings'
type FleetProps = { userEmail?: string; onBack: () => void; onLogout: () => void }
type Vehicle = { id: string; placa: string; marca: string | null; modelo: string | null; tank_capacity_l: number; operational_status: string; current_odometer_km: number | null }
type Fueling = { id: string; status: string; performed_at: string; submitted_at: string; liters: number; total_amount: number; odometer_km: number; station_receipt_number: string | null; vehicles?: { placa?: string; modelo?: string } | null; stations?: { nome_fantasia_snapshot?: string } | null; fuel_type?: { nome?: string } | null }

const navItems: { id: FleetView; label: string; icon: typeof Truck }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'vehicles', label: 'Veículos', icon: Truck },
  { id: 'fuelings', label: 'Abastecimentos', icon: Fuel },
  { id: 'stations', label: 'Postos credenciados', icon: Store },
  { id: 'drivers', label: 'Motoristas', icon: UserRound },
  { id: 'settings', label: 'Configurações', icon: Settings2 },
]

const statusLabel: Record<string, string> = {
  ATIVO: 'Ativo', INATIVO: 'Inativo', EM_MANUTENCAO: 'Em manutenção', BAIXADO: 'Baixado', CEDIDO: 'Cedido',
  ENVIADO_PELO_POSTO: 'Enviado pelo posto', PENDENTE_DE_CONFERENCIA: 'Pendente de conferência',
  CONFERIDO: 'Conferido', COM_INCONSISTENCIA: 'Com inconsistência', INCLUIDO_NO_FECHAMENTO: 'No fechamento',
}

function formatDate(value?: string) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function formatMoney(value?: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

export function FleetModule({ userEmail, onBack, onLogout }: FleetProps) {
  const [view, setView] = useState<FleetView>('overview')
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [fuelings, setFuelings] = useState<Fueling[]>([])
  const [stationCount, setStationCount] = useState(0)
  const [driverCount, setDriverCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [showVehicleForm, setShowVehicleForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [vehicleForm, setVehicleForm] = useState({ placa: '', marca: '', modelo: '', tank_capacity_l: '60' })

  async function loadData() {
    if (!supabase) return
    setError('')
    setRefreshing(true)
    const [vehicleResult, fuelingResult, stationResult, driverResult] = await Promise.all([
      supabase.from('fleet_vehicles').select('id,placa,marca,modelo,tank_capacity_l,operational_status,current_odometer_km').order('placa').limit(100),
      supabase.from('fleet_fuelings').select('id,status,performed_at,submitted_at,liters,total_amount,odometer_km,station_receipt_number,vehicles:fleet_vehicles(placa,modelo),stations:fleet_fuel_stations(nome_fantasia_snapshot),fuel_type:fleet_fuel_types(nome)').order('performed_at', { ascending: false }).limit(100),
      supabase.from('fleet_fuel_stations').select('id', { count: 'exact', head: true }),
      supabase.from('fleet_drivers').select('id', { count: 'exact', head: true }),
    ])
    const firstError = vehicleResult.error || fuelingResult.error || stationResult.error || driverResult.error
    if (firstError) setError('Não foi possível carregar os dados permitidos para este usuário. Verifique o perfil de Frotas.')
    else {
      setVehicles((vehicleResult.data || []) as Vehicle[])
      setFuelings((fuelingResult.data || []) as unknown as Fueling[])
      setStationCount(stationResult.count || 0)
      setDriverCount(driverResult.count || 0)
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => { void loadData() }, [])

  const activeVehicles = useMemo(() => vehicles.filter((vehicle) => vehicle.operational_status === 'ATIVO').length, [vehicles])
  const pendingFuelings = useMemo(() => fuelings.filter((fueling) => ['ENVIADO_PELO_POSTO', 'PENDENTE_DE_CONFERENCIA', 'EM_ANALISE', 'COM_INCONSISTENCIA'].includes(fueling.status)).length, [fuelings])
  const monthFuelings = useMemo(() => fuelings.filter((fueling) => new Date(fueling.performed_at).getMonth() === new Date().getMonth()).length, [fuelings])
  const monthTotal = useMemo(() => fuelings.filter((fueling) => new Date(fueling.performed_at).getMonth() === new Date().getMonth()).reduce((sum, fueling) => sum + Number(fueling.total_amount || 0), 0), [fuelings])

  async function createVehicle(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) return
    setSaving(true); setError('')
    const { data: municipality } = await supabase.rpc('fleet_current_municipio_id')
    const { data: currentUser } = await supabase.rpc('fleet_current_usuario_id')
    const { error: insertError } = await supabase.from('fleet_vehicles').insert({
      municipio_id: municipality,
      created_by: currentUser,
      placa: vehicleForm.placa.trim().toUpperCase(),
      marca: vehicleForm.marca.trim() || null,
      modelo: vehicleForm.modelo.trim() || null,
      tank_capacity_l: Number(vehicleForm.tank_capacity_l),
      operational_status: 'ATIVO',
    })
    setSaving(false)
    if (insertError) { setError(insertError.code === '23505' ? 'Já existe um veículo com esta placa.' : 'Não foi possível cadastrar o veículo.'); return }
    setShowVehicleForm(false); setVehicleForm({ placa: '', marca: '', modelo: '', tank_capacity_l: '60' }); await loadData()
  }

  return <div className="fleet-shell">
    <aside className="fleet-sidebar">
      <div className="fleet-sidebar-top"><button className="fleet-back" onClick={onBack}><ArrowLeft size={16} /> Voltar ao painel</button><div className="fleet-brand"><span className="fleet-brand-icon"><Truck size={20} /></span><div><strong>Gestão de Frotas</strong><small>Inteligência Municipal</small></div></div></div>
      <div className="fleet-section-label">OPERAÇÃO</div>
      <nav className="fleet-nav">{navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`fleet-nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><Icon size={17} />{label}{id === 'fuelings' && pendingFuelings > 0 && <span className="fleet-nav-count">{pendingFuelings}</span>}</button>)}</nav>
      <div className="fleet-sidebar-bottom"><div className="fleet-user-chip"><span className="fleet-user-avatar">{(userEmail?.[0] || 'U').toUpperCase()}</span><div><strong>{userEmail || 'Usuário autenticado'}</strong><small>Ambiente municipal</small></div></div><button className="fleet-logout" onClick={onLogout}><LogOut size={16} /> Sair do sistema</button></div>
    </aside>
    <main className="fleet-main">
      <header className="fleet-header"><div><p className="fleet-kicker">MÓDULO OPERACIONAL</p><h1>{navItems.find((item) => item.id === view)?.label}</h1></div><div className="fleet-header-actions"><button className="fleet-icon-button" aria-label="Atualizar dados" onClick={() => void loadData()} disabled={refreshing}>{refreshing ? <RefreshCw className="spin" size={18} /> : <RefreshCw size={18} />}</button><button className="fleet-icon-button" aria-label="Notificações"><Bell size={18} /><span className="fleet-alert-dot" /></button><span className="fleet-protected"><ShieldCheck size={16} /> Dados protegidos</span></div></header>
      <div className="fleet-content">
        {error && <div className="fleet-error" role="alert"><CircleAlert size={17} /> {error}</div>}
        {view === 'overview' && <Overview activeVehicles={activeVehicles} pendingFuelings={pendingFuelings} monthFuelings={monthFuelings} monthTotal={monthTotal} fuelings={fuelings} onNavigate={setView} />}
        {view === 'vehicles' && <Vehicles vehicles={vehicles} loading={loading} onAdd={() => setShowVehicleForm(true)} />}
        {view === 'fuelings' && <Fuelings fuelings={fuelings} loading={loading} />}
        {view === 'stations' && <SimpleResource title="Postos credenciados" subtitle="Estabelecimentos autorizados a submeter abastecimentos." icon={Store} count={stationCount} label="postos encontrados" action="Novo posto" />}
        {view === 'drivers' && <SimpleResource title="Motoristas" subtitle="Condutores autorizados para operações da frota." icon={Users} count={driverCount} label="motoristas encontrados" action="Novo motorista" />}
        {view === 'settings' && <SettingsPanel />}
      </div>
    </main>
    {showVehicleForm && <div className="fleet-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setShowVehicleForm(false)}><form className="fleet-modal" onSubmit={createVehicle}><div className="fleet-modal-heading"><div><span className="fleet-kicker">CADASTRO OFICIAL</span><h2>Novo veículo</h2></div><button type="button" className="fleet-close" onClick={() => setShowVehicleForm(false)} aria-label="Fechar"><X size={18} /></button></div><p className="fleet-modal-note"><BadgeCheck size={16} /> Esta ação exige perfil de Gestor de Frotas ou Administrador.</p><label>Placa<input required maxLength={10} value={vehicleForm.placa} onChange={(event) => setVehicleForm({ ...vehicleForm, placa: event.target.value })} placeholder="ABC-1D23" /></label><div className="fleet-form-grid"><label>Marca<input value={vehicleForm.marca} onChange={(event) => setVehicleForm({ ...vehicleForm, marca: event.target.value })} placeholder="Ex.: Renault" /></label><label>Modelo<input value={vehicleForm.modelo} onChange={(event) => setVehicleForm({ ...vehicleForm, modelo: event.target.value })} placeholder="Ex.: Kangoo" /></label></div><label>Capacidade do tanque (litros)<input required type="number" min="1" step="0.01" value={vehicleForm.tank_capacity_l} onChange={(event) => setVehicleForm({ ...vehicleForm, tank_capacity_l: event.target.value })} /></label><div className="fleet-modal-actions"><button type="button" className="fleet-secondary-button" onClick={() => setShowVehicleForm(false)}>Cancelar</button><button type="submit" className="fleet-primary-button" disabled={saving}>{saving ? 'Salvando…' : 'Cadastrar veículo'}</button></div></form></div>}
  </div>
}

function Overview({ activeVehicles, pendingFuelings, monthFuelings, monthTotal, fuelings, onNavigate }: { activeVehicles: number; pendingFuelings: number; monthFuelings: number; monthTotal: number; fuelings: Fueling[]; onNavigate: (view: FleetView) => void }) {
  const metrics = [{ label: 'Veículos ativos', value: activeVehicles, helper: 'Frota disponível', icon: Truck, tone: 'blue' }, { label: 'Abastecimentos no mês', value: monthFuelings, helper: formatMoney(monthTotal), icon: Fuel, tone: 'green' }, { label: 'Aguardando conferência', value: pendingFuelings, helper: 'Ações do gestor', icon: ClipboardCheck, tone: 'amber' }, { label: 'Postos monitorados', value: '—', helper: 'Consulte a rede credenciada', icon: Store, tone: 'violet' }]
  return <><section className="fleet-hero"><div><span className="fleet-hero-kicker">CONTROLE OPERACIONAL</span><h2>Frota em movimento, dados sob controle.</h2><p>Acompanhe abastecimentos, veículos e pendências em um único espaço de trabalho.</p></div><div className="fleet-hero-mark"><Gauge size={38} /></div></section><section className="fleet-section"><div className="fleet-section-heading"><div><span className="fleet-kicker">ACOMPANHAMENTO</span><h2>Indicadores do módulo</h2></div><span className="fleet-period">Atualizado agora</span></div><div className="fleet-metric-grid">{metrics.map(({ label, value, helper, icon: Icon, tone }) => <article className="fleet-metric" key={label}><span className={`fleet-metric-icon ${tone}`}><Icon size={19} /></span><div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div></article>)}</div></section><section className="fleet-section fleet-two-columns"><div className="fleet-panel"><div className="fleet-section-heading"><div><span className="fleet-kicker">FILA DE TRABALHO</span><h2>Abastecimentos recentes</h2></div><button className="fleet-link-button" onClick={() => onNavigate('fuelings')}>Ver fila <ChevronRight size={14} /></button></div><FuelingTable fuelings={fuelings.slice(0, 5)} compact /></div><div className="fleet-panel fleet-attention-panel"><div className="fleet-section-heading"><div><span className="fleet-kicker">ATENÇÃO</span><h2>Próximas ações</h2></div></div><div className="fleet-attention-item"><span className="fleet-attention-icon"><ClipboardCheck size={18} /></span><div><strong>{pendingFuelings ? `${pendingFuelings} abastecimento(s) aguardam conferência` : 'Nenhuma pendência registrada'}</strong><p>{pendingFuelings ? 'Revise os comprovantes e valide os registros enviados.' : 'Quando houver ações, elas aparecerão nesta área.'}</p></div></div></div></section></>
}

function Vehicles({ vehicles, loading, onAdd }: { vehicles: Vehicle[]; loading: boolean; onAdd: () => void }) { return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">CADASTRO DA FROTA</span><h2>Veículos</h2><p>Controle a identificação, capacidade do tanque e situação operacional.</p></div><button className="fleet-primary-button" onClick={onAdd}><Plus size={16} /> Novo veículo</button></div><div className="fleet-table-panel">{loading ? <LoadingRows /> : vehicles.length ? <table className="fleet-table"><thead><tr><th>Veículo</th><th>Placa</th><th>Tanque</th><th>Hodômetro</th><th>Situação</th><th /></tr></thead><tbody>{vehicles.map((vehicle) => <tr key={vehicle.id}><td><strong>{vehicle.marca || 'Marca não informada'} {vehicle.modelo || 'Modelo não informado'}</strong><small>ID {vehicle.id.slice(0, 8)}</small></td><td className="fleet-plate">{vehicle.placa}</td><td>{vehicle.tank_capacity_l} L</td><td>{vehicle.current_odometer_km ? `${vehicle.current_odometer_km.toLocaleString('pt-BR')} km` : '—'}</td><td><StatusChip value={vehicle.operational_status} /></td><td><button className="fleet-row-action" aria-label={`Abrir veículo ${vehicle.placa}`}><ChevronRight size={17} /></button></td></tr>)}</tbody></table> : <EmptyState icon={Truck} title="Nenhum veículo disponível" text="Cadastre o primeiro veículo para iniciar o controle da frota." action="Novo veículo" onAction={onAdd} />}</div></section> }

function Fuelings({ fuelings, loading }: { fuelings: Fueling[]; loading: boolean }) { return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">CONFERÊNCIA</span><h2>Abastecimentos</h2><p>Revise os registros enviados pelos postos e acompanhe a documentação.</p></div><div className="fleet-filter-pill"><ClipboardCheck size={15} /> Fila operacional</div></div><div className="fleet-table-panel">{loading ? <LoadingRows /> : fuelings.length ? <FuelingTable fuelings={fuelings} /> : <EmptyState icon={Fuel} title="Nenhum abastecimento encontrado" text="Os registros enviados pelos postos aparecerão aqui." />}</div></section> }

function FuelingTable({ fuelings, compact = false }: { fuelings: Fueling[]; compact?: boolean }) { return <table className={`fleet-table ${compact ? 'fleet-table-compact' : ''}`}><thead><tr><th>Data real</th><th>Veículo</th><th>Posto</th><th>Quantidade</th><th>Total</th><th>Situação</th></tr></thead><tbody>{fuelings.map((fueling) => <tr key={fueling.id}><td><strong>{formatDate(fueling.performed_at)}</strong><small>Enviado {formatDate(fueling.submitted_at)}</small></td><td><strong>{fueling.vehicles?.placa || '—'}</strong><small>{fueling.vehicles?.modelo || 'Veículo'}</small></td><td>{fueling.stations?.nome_fantasia_snapshot || 'Posto não informado'}</td><td>{Number(fueling.liters).toLocaleString('pt-BR')} L</td><td>{formatMoney(fueling.total_amount)}</td><td><StatusChip value={fueling.status} /></td></tr>)}</tbody></table> }

function SimpleResource({ title, subtitle, icon: Icon, count, label, action }: { title: string; subtitle: string; icon: typeof Store; count: number; label: string; action: string }) { return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">CADASTROS DE APOIO</span><h2>{title}</h2><p>{subtitle}</p></div><button className="fleet-primary-button"><Plus size={16} /> {action}</button></div><div className="fleet-resource-placeholder"><span className="fleet-resource-icon"><Icon size={25} /></span><strong>{count}</strong><span>{label}</span><small>A tela de cadastro detalhada será conectada na próxima entrega do módulo.</small></div></section> }

function SettingsPanel() { return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">CONFIGURAÇÃO DO MÓDULO</span><h2>Parâmetros operacionais</h2><p>Regras que orientam a operação de abastecimentos e conferência.</p></div></div><div className="fleet-settings-grid"><article><span><Gauge size={18} /></span><div><strong>Capacidade do tanque</strong><p>O abastecimento acima da capacidade cadastrada gera inconsistência para análise.</p></div></article><article><span><ClipboardCheck size={18} /></span><div><strong>Comprovantes</strong><p>O prazo operacional para envio do comprovante é de 24 horas após o abastecimento.</p></div></article><article><span><MapPin size={18} /></span><div><strong>Cessão temporária</strong><p>A secretaria responsável e a secretaria beneficiária são mantidas separadamente.</p></div></article><article><span><ShieldCheck size={18} /></span><div><strong>Perfis autorizados</strong><p>Gestor de Frotas e Administrador validam cadastros oficiais e fechamentos.</p></div></article></div></section> }

function StatusChip({ value }: { value: string }) { const tone = value.includes('INCONSISTENCIA') ? 'danger' : value.includes('PENDENTE') || value.includes('ENVIADO') || value === 'EM_ANALISE' ? 'warning' : value === 'ATIVO' || value === 'CONFERIDO' ? 'success' : 'neutral'; return <span className={`fleet-status ${tone}`}>{statusLabel[value] || value.replaceAll('_', ' ')}</span> }
function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: typeof Truck; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="fleet-empty"><span><Icon size={24} /></span><strong>{title}</strong><p>{text}</p>{action && <button className="fleet-primary-button" onClick={onAction}><Plus size={15} /> {action}</button>}</div> }
function LoadingRows() { return <div className="fleet-loading"><RefreshCw className="spin" size={19} /> Carregando dados permitidos…</div> }
