import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, BadgeCheck, Bell, BarChart3, CalendarCheck, CheckCircle2, ChevronRight, CircleAlert,
  ClipboardCheck, Download, FileSpreadsheet, FileText, Fuel, Gauge, LayoutDashboard, LogOut, MapPin, Plus, RefreshCw,
  Settings2, ShieldCheck, Store, Truck, UserRound, X,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { DriversView, StationsView } from './FleetResources'
import './FleetModule.css'

type FleetView = 'overview' | 'vehicles' | 'fuelings' | 'closure' | 'reports' | 'stations' | 'drivers' | 'settings'
type FleetProps = { userEmail?: string; onBack: () => void; onLogout: () => void }
type Vehicle = { id: string; placa: string; marca: string | null; modelo: string | null; tank_capacity_l: number; operational_status: string; current_odometer_km: number | null }
type Fueling = { id: string; status: string; performed_at: string; submitted_at: string; liters: number; total_amount: number; odometer_km: number; station_receipt_number: string | null; vehicles?: { placa?: string; modelo?: string } | null; stations?: { nome_fantasia_snapshot?: string } | null; fuel_type?: { nome?: string } | null }

const navItems: { id: FleetView; label: string; icon: typeof Truck }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'vehicles', label: 'Veículos', icon: Truck },
  { id: 'fuelings', label: 'Abastecimentos', icon: Fuel },
  { id: 'closure', label: 'Fechamento mensal', icon: CalendarCheck },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
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
    const [vehicleResult, fuelingResult] = await Promise.all([
      supabase.from('fleet_vehicles').select('id,placa,marca,modelo,tank_capacity_l,operational_status,current_odometer_km').order('placa').limit(100),
      supabase.from('fleet_fuelings').select('id,status,performed_at,submitted_at,liters,total_amount,odometer_km,station_receipt_number,vehicles:fleet_vehicles(placa,modelo),stations:fleet_fuel_stations(nome_fantasia_snapshot),fuel_type:fleet_fuel_types(nome)').order('performed_at', { ascending: false }).limit(100),
    ])
    const firstError = vehicleResult.error || fuelingResult.error
    if (firstError) setError('Não foi possível carregar os dados permitidos para este usuário. Verifique o perfil de Frotas.')
    else {
      setVehicles((vehicleResult.data || []) as Vehicle[])
      setFuelings((fuelingResult.data || []) as unknown as Fueling[])
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
        {view === 'closure' && <MonthlyClosure />}
        {view === 'reports' && <FuelCostReports />}
        {view === 'stations' && <StationsView onSaved={loadData} />}
        {view === 'drivers' && <DriversView onSaved={loadData} />}
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

type ReportFueling = { liters: number; total_amount: number; status: string; performed_at: string; responsible_unit_id: string; units?: { nome?: string; sigla?: string } | null }
type ReportRow = { id: string; secretaria: string; sigla: string; abastecimentos: number; litros: number; custo: number; media: number }

function FuelCostReports() {
  const initialPeriod = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit' }).format(new Date())
  const [period, setPeriod] = useState(initialPeriod)
  const [fuelings, setFuelings] = useState<ReportFueling[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [secretaria, setSecretaria] = useState('TODAS')

  function bounds(value: string) {
    const [year, month] = value.split('-').map(Number)
    return { year, month, start: new Date(Date.UTC(year, month - 1, 1)).toISOString(), end: new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)).toISOString() }
  }
  async function loadReport() {
    if (!supabase) return
    setLoading(true); setError('')
    const range = bounds(period)
    const result = await supabase.from('fleet_fuelings').select('liters,total_amount,status,performed_at,responsible_unit_id,units:unidades_organizacionais(nome,sigla)').gte('performed_at', range.start).lt('performed_at', range.end).order('performed_at', { ascending: true }).limit(5000)
    if (result.error) setError('Não foi possível carregar o relatório de custos. Verifique as permissões do perfil de Frotas.')
    else setFuelings((result.data || []) as unknown as ReportFueling[])
    setLoading(false)
  }
  useEffect(() => { void loadReport() }, [period])

  const validFuelings = fuelings.filter((fueling) => fueling.status !== 'CANCELADO')
  const rows = Array.from(validFuelings.reduce((map, fueling) => {
    const key = fueling.responsible_unit_id
    const current = map.get(key) || { id: key, secretaria: fueling.units?.nome || 'Secretaria não identificada', sigla: fueling.units?.sigla || '—', abastecimentos: 0, litros: 0, custo: 0, media: 0 }
    current.abastecimentos += 1; current.litros += Number(fueling.liters || 0); current.custo += Number(fueling.total_amount || 0); current.media = current.custo / current.abastecimentos
    map.set(key, current); return map
  }, new Map<string, ReportRow>()).values()).sort((a, b) => b.custo - a.custo)
  const secretarias = rows.map((row) => ({ id: row.id, nome: row.secretaria })).sort((a, b) => a.nome.localeCompare(b.nome))
  const filteredRows = secretaria === 'TODAS' ? rows : rows.filter((row) => row.id === secretaria)
  const totalLiters = filteredRows.reduce((sum, row) => sum + row.litros, 0)
  const totalCost = filteredRows.reduce((sum, row) => sum + row.custo, 0)
  const totalFuelings = filteredRows.reduce((sum, row) => sum + row.abastecimentos, 0)
  const periodLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}-01T00:00:00Z`))

  function exportExcel() {
    const sheetData = filteredRows.map((row) => ({ Secretaria: row.secretaria, Sigla: row.sigla, Abastecimentos: row.abastecimentos, 'Litros registrados': Number(row.litros.toFixed(2)), 'Custo total (R$)': Number(row.custo.toFixed(2)), 'Custo médio (R$)': Number(row.media.toFixed(2)) }))
    const summary = [{ Relatório: 'Custos de combustíveis por secretaria', Competência: periodLabel, Secretaria: secretaria === 'TODAS' ? 'Todas' : filteredRows[0]?.secretaria || '—', Abastecimentos: totalFuelings, 'Litros registrados': Number(totalLiters.toFixed(2)), 'Custo total (R$)': Number(totalCost.toFixed(2)) }]
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(summary), 'Resumo'); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(sheetData), 'Por secretaria'); XLSX.writeFile(workbook, `relatorio-combustiveis-${period}.xlsx`)
  }

  function exportPdf() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    doc.setTextColor(11, 41, 64); doc.setFontSize(17); doc.text('Custos de combustíveis por secretaria', 14, 17); doc.setFontSize(9); doc.setTextColor(91, 112, 123); doc.text(`Competência: ${periodLabel}  •  Filtro: ${secretaria === 'TODAS' ? 'Todas as secretarias' : filteredRows[0]?.secretaria || '—'}`, 14, 24); doc.text(`Total: ${totalFuelings} abastecimentos  •  ${totalLiters.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L  •  ${formatMoney(totalCost)}`, 14, 30)
    autoTable(doc, { startY: 37, head: [['Secretaria', 'Sigla', 'Abastecimentos', 'Litros', 'Custo total', 'Custo médio']], body: filteredRows.map((row) => [row.secretaria, row.sigla, row.abastecimentos.toLocaleString('pt-BR'), `${row.litros.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L`, formatMoney(row.custo), formatMoney(row.media)]), styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [15, 88, 115] }, alternateRowStyles: { fillColor: [245, 248, 250] } })
    doc.save(`relatorio-combustiveis-${period}.pdf`)
  }

  return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">ANÁLISE GERENCIAL</span><h2>Relatórios de combustíveis</h2><p>Compare litros e custos consolidados por secretaria.</p></div><div className="fleet-report-period"><FileText size={15} /><input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></div></div>{error && <div className="fleet-inline-error" role="alert"><CircleAlert size={15} /> {error}</div>}<div className="fleet-report-toolbar"><label><span>Secretaria</span><select value={secretaria} onChange={(event) => setSecretaria(event.target.value)}><option value="TODAS">Todas as secretarias</option>{secretarias.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label><div className="fleet-report-actions"><button className="fleet-secondary-button" onClick={exportExcel} disabled={loading || !filteredRows.length}><FileSpreadsheet size={15} /> Exportar Excel</button><button className="fleet-primary-button" onClick={exportPdf} disabled={loading || !filteredRows.length}><Download size={15} /> Exportar PDF</button></div></div><div className="fleet-metric-grid fleet-report-metrics"><article className="fleet-metric"><span className="fleet-metric-icon blue"><Fuel size={19} /></span><div><span>Abastecimentos</span><strong>{totalFuelings}</strong><small>{periodLabel}</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon green"><Gauge size={19} /></span><div><span>Litros registrados</span><strong>{totalLiters.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</strong><small>sem cancelados</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon violet"><BarChart3 size={19} /></span><div><span>Custo consolidado</span><strong>{formatMoney(totalCost)}</strong><small>{filteredRows.length} secretaria(s)</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon amber"><FileText size={19} /></span><div><span>Custo médio</span><strong>{formatMoney(totalFuelings ? totalCost / totalFuelings : 0)}</strong><small>por abastecimento</small></div></article></div><div className="fleet-table-panel">{loading ? <LoadingRows /> : filteredRows.length ? <table className="fleet-table fleet-report-table"><thead><tr><th>Secretaria</th><th>Sigla</th><th>Abastecimentos</th><th>Litros</th><th>Custo total</th><th>Custo médio</th></tr></thead><tbody>{filteredRows.map((row) => <tr key={row.id}><td><strong>{row.secretaria}</strong><small>Centro de custo operacional</small></td><td className="fleet-plate">{row.sigla}</td><td>{row.abastecimentos}</td><td>{row.litros.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} L</td><td><strong>{formatMoney(row.custo)}</strong></td><td>{formatMoney(row.media)}</td></tr>)}</tbody></table> : <EmptyState icon={BarChart3} title="Nenhum custo encontrado" text="Não há abastecimentos para a competência e secretaria selecionadas." />}</div></section>
}

type Closure = { id: string; reference_year: number; reference_month: number; status: string; started_at: string | null; checked_at: string | null; closed_at: string | null }
type ClosureFueling = Fueling & { station_id?: string }

function MonthlyClosure() {
  const initialPeriod = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit' }).format(new Date())
  const [period, setPeriod] = useState(initialPeriod)
  const [closure, setClosure] = useState<Closure | null>(null)
  const [fuelings, setFuelings] = useState<ClosureFueling[]>([])
  const [statusFilter, setStatusFilter] = useState('TODOS')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  function periodBounds(value: string) {
    const [year, month] = value.split('-').map(Number)
    const start = new Date(Date.UTC(year, month - 1, 1)).toISOString()
    const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1)).toISOString()
    return { year, month, start, end }
  }

  async function loadClosure() {
    if (!supabase) return
    setLoading(true); setError(''); setNotice('')
    const bounds = periodBounds(period)
    const [closureResult, fuelingResult] = await Promise.all([
      supabase.from('fleet_monthly_closures').select('id,reference_year,reference_month,status,started_at,checked_at,closed_at').eq('reference_year', bounds.year).eq('reference_month', bounds.month).maybeSingle(),
      supabase.from('fleet_fuelings').select('id,status,performed_at,submitted_at,liters,total_amount,odometer_km,station_receipt_number,station_id,vehicles:fleet_vehicles(placa,modelo),stations:fleet_fuel_stations(nome_fantasia_snapshot),fuel_type:fleet_fuel_types(nome)').gte('performed_at', bounds.start).lt('performed_at', bounds.end).order('performed_at', { ascending: false }).limit(1000),
    ])
    const firstError = closureResult.error || fuelingResult.error
    if (firstError) setError('Não foi possível carregar a conferência deste período. Verifique se o perfil é Gestor de Frotas ou Administrador.')
    else { setClosure(closureResult.data as Closure | null); setFuelings((fuelingResult.data || []) as unknown as ClosureFueling[]) }
    setLoading(false)
  }

  useEffect(() => { void loadClosure() }, [period])

  const pending = fuelings.filter((fueling) => !['CONFERIDO', 'INCLUIDO_NO_FECHAMENTO', 'CANCELADO'].includes(fueling.status))
  const reviewed = fuelings.length - pending.length
  const totalLiters = fuelings.reduce((sum, fueling) => sum + Number(fueling.liters || 0), 0)
  const totalAmount = fuelings.reduce((sum, fueling) => sum + Number(fueling.total_amount || 0), 0)
  const filtered = statusFilter === 'TODOS' ? fuelings : fuelings.filter((fueling) => fueling.status === statusFilter)
  const periodLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${period}-01T00:00:00Z`))

  async function openClosure() {
    if (!supabase) return
    setWorking(true); setError(''); setNotice('')
    const bounds = periodBounds(period)
    const { data: municipality } = await supabase.rpc('fleet_current_municipio_id')
    const { data: currentUser } = await supabase.rpc('fleet_current_usuario_id')
    const result = await supabase.from('fleet_monthly_closures').insert({ municipio_id: municipality, reference_year: bounds.year, reference_month: bounds.month, status: 'EM_CONFERENCIA', started_by: currentUser, started_at: new Date().toISOString() }).select('id,reference_year,reference_month,status,started_at,checked_at,closed_at').single()
    setWorking(false)
    if (result.error) setError(result.error.code === '23505' ? 'Este mês já possui um fechamento iniciado.' : 'Não foi possível iniciar o fechamento com o perfil atual.')
    else { setClosure(result.data as Closure); setNotice('Fechamento mensal iniciado. A conferência pode ser realizada por registro ou por lote.') }
  }

  async function confirmFueling(id: string) {
    if (!supabase) return
    setWorking(true); setError(''); setNotice('')
    const { data: currentUser } = await supabase.rpc('fleet_current_usuario_id')
    const result = await supabase.from('fleet_fuelings').update({ status: 'CONFERIDO', registered_officially_by: currentUser, registered_officially_at: new Date().toISOString() }).eq('id', id)
    setWorking(false)
    if (result.error) setError('Não foi possível conferir este abastecimento. Verifique a permissão do Gestor de Frotas.')
    else { setNotice('Abastecimento conferido.'); await loadClosure() }
  }

  async function closeMonth() {
    if (!supabase || !closure) return
    if (pending.length) { setError('O mês não pode ser fechado enquanto existirem abastecimentos pendentes ou com inconsistência.'); return }
    setWorking(true); setError(''); setNotice('')
    const bounds = periodBounds(period)
    const { data: currentUser } = await supabase.rpc('fleet_current_usuario_id')
    const fuelingResult = await supabase.from('fleet_fuelings').update({ status: 'INCLUIDO_NO_FECHAMENTO' }).gte('performed_at', bounds.start).lt('performed_at', bounds.end).eq('status', 'CONFERIDO')
    if (fuelingResult.error) { setWorking(false); setError('Não foi possível incluir os abastecimentos no fechamento.'); return }
    const closureResult = await supabase.from('fleet_monthly_closures').update({ status: 'FECHADO', checked_by: currentUser, checked_at: new Date().toISOString(), closed_by: currentUser, closed_at: new Date().toISOString() }).eq('id', closure.id)
    setWorking(false)
    if (closureResult.error) setError('Os abastecimentos foram conferidos, mas o fechamento não pôde ser concluído.')
    else { setNotice('Mês fechado com sucesso. Os registros foram incluídos no fechamento.'); await loadClosure() }
  }

  return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">CONTROLE MENSAL</span><h2>Fechamento e conferência</h2><p>Revise os abastecimentos do período antes de consolidar a competência.</p></div><div className="fleet-closure-period"><CalendarCheck size={15} /><input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} /></div></div>{error && <div className="fleet-inline-error" role="alert"><CircleAlert size={15} /> {error}</div>}{notice && <div className="fleet-inline-success" role="status"><CheckCircle2 size={15} /> {notice}</div>}<div className="fleet-closure-banner"><div><span className="fleet-kicker">COMPETÊNCIA</span><strong>{periodLabel}</strong><p>{closure ? `Status atual: ${closure.status.replaceAll('_', ' ').toLowerCase()}.` : 'Nenhum fechamento iniciado para este período.'}</p></div><div className="fleet-closure-actions">{!closure && <button className="fleet-primary-button" onClick={() => void openClosure()} disabled={working}><CalendarCheck size={15} /> Iniciar conferência</button>}{closure && closure.status !== 'FECHADO' && <button className="fleet-primary-button" onClick={() => void closeMonth()} disabled={working || loading || pending.length > 0}><CheckCircle2 size={15} /> {working ? 'Fechando…' : 'Fechar mês'}</button>}{closure?.status === 'FECHADO' && <span className="fleet-status success"><CheckCircle2 size={13} /> Mês fechado</span>}</div></div><div className="fleet-metric-grid fleet-closure-metrics"><article className="fleet-metric"><span className="fleet-metric-icon blue"><Fuel size={19} /></span><div><span>Abastecimentos</span><strong>{fuelings.length}</strong><small>{reviewed} conferidos</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon green"><Gauge size={19} /></span><div><span>Volume registrado</span><strong>{totalLiters.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L</strong><small>competência selecionada</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon amber"><CircleAlert size={19} /></span><div><span>Pendências</span><strong>{pending.length}</strong><small>{pending.length ? 'exigem ação' : 'pronto para fechamento'}</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon violet"><ClipboardCheck size={19} /></span><div><span>Valor consolidado</span><strong>{formatMoney(totalAmount)}</strong><small>registros do período</small></div></article></div><div className="fleet-closure-toolbar"><div><span className="fleet-kicker">FILA DE CONFERÊNCIA</span><h3>Abastecimentos da competência</h3></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="TODOS">Todos os status</option><option value="ENVIADO_PELO_POSTO">Enviado pelo posto</option><option value="PENDENTE_DE_CONFERENCIA">Pendente de conferência</option><option value="COM_INCONSISTENCIA">Com inconsistência</option><option value="CONFERIDO">Conferido</option><option value="INCLUIDO_NO_FECHAMENTO">No fechamento</option></select></div><div className="fleet-table-panel">{loading ? <LoadingRows /> : filtered.length ? <table className="fleet-table fleet-closure-table"><thead><tr><th>Data real</th><th>Veículo</th><th>Posto</th><th>Volume</th><th>Valor</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{filtered.map((fueling) => <tr key={fueling.id}><td><strong>{formatDate(fueling.performed_at)}</strong><small>Recibo {fueling.station_receipt_number || 'não informado'}</small></td><td><strong>{fueling.vehicles?.placa || '—'}</strong><small>{fueling.vehicles?.modelo || 'Veículo'}</small></td><td>{fueling.stations?.nome_fantasia_snapshot || 'Posto não informado'}</td><td>{Number(fueling.liters).toLocaleString('pt-BR')} L</td><td>{formatMoney(fueling.total_amount)}</td><td><StatusChip value={fueling.status} /></td><td>{['CONFERIDO', 'INCLUIDO_NO_FECHAMENTO', 'CANCELADO'].includes(fueling.status) ? <span className="fleet-row-confirmed"><CheckCircle2 size={15} /> Conferido</span> : <button className="fleet-secondary-button fleet-confirm-button" onClick={() => void confirmFueling(fueling.id)} disabled={working}><CheckCircle2 size={14} /> Conferir</button>}</td></tr>)}</tbody></table> : <EmptyState icon={ClipboardCheck} title="Nenhum registro neste filtro" text="Altere o período ou o filtro para consultar os abastecimentos." />}</div></section>
}

function SettingsPanel() { return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">CONFIGURAÇÃO DO MÓDULO</span><h2>Parâmetros operacionais</h2><p>Regras que orientam a operação de abastecimentos e conferência.</p></div></div><div className="fleet-settings-grid"><article><span><Gauge size={18} /></span><div><strong>Capacidade do tanque</strong><p>O abastecimento acima da capacidade cadastrada gera inconsistência para análise.</p></div></article><article><span><ClipboardCheck size={18} /></span><div><strong>Comprovantes</strong><p>O prazo operacional para envio do comprovante é de 24 horas após o abastecimento.</p></div></article><article><span><MapPin size={18} /></span><div><strong>Cessão temporária</strong><p>A secretaria responsável e a secretaria beneficiária são mantidas separadamente.</p></div></article><article><span><ShieldCheck size={18} /></span><div><strong>Perfis autorizados</strong><p>Gestor de Frotas e Administrador validam cadastros oficiais e fechamentos.</p></div></article></div></section> }

function StatusChip({ value }: { value: string }) { const tone = value.includes('INCONSISTENCIA') ? 'danger' : value.includes('PENDENTE') || value.includes('ENVIADO') || value === 'EM_ANALISE' ? 'warning' : value === 'ATIVO' || value === 'CONFERIDO' ? 'success' : 'neutral'; return <span className={`fleet-status ${tone}`}>{statusLabel[value] || value.replaceAll('_', ' ')}</span> }
function EmptyState({ icon: Icon, title, text, action, onAction }: { icon: typeof Truck; title: string; text: string; action?: string; onAction?: () => void }) { return <div className="fleet-empty"><span><Icon size={24} /></span><strong>{title}</strong><p>{text}</p>{action && <button className="fleet-primary-button" onClick={onAction}><Plus size={15} /> {action}</button>}</div> }
function LoadingRows() { return <div className="fleet-loading"><RefreshCw className="spin" size={19} /> Carregando dados permitidos…</div> }
