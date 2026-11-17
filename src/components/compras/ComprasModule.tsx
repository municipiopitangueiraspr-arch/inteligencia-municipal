import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  Settings2,
  Truck,
} from 'lucide-react'
import type { MunicipalAccessContextValue } from '../../auth/MunicipalAccessContext'
import {
  loadComprasDashboard,
  loadComprasAtas,
  loadComprasBalances,
  loadComprasContractExecutions,
  loadComprasOrderDetail,
  loadComprasOrders,
  executeComprasOrderAction,
  isCriticalBalance,
  resolveComprasAccess,
  type ComprasAtaSummary,
  type ComprasBalanceItem,
  type ComprasContractExecution,
  type ComprasDashboardSummary,
  type ComprasOrderDetail,
  type ComprasOrder,
  type ComprasPendingDelivery,
  type ComprasRecentDemand,
} from './comprasReadService'
import './ComprasModule.css'

type ComprasView = 'overview' | 'atas' | 'demandas' | 'pedidos' | 'aprovacoes' | 'saldos' | 'empenhos' | 'entregas' | 'relatorios' | 'governanca'
type ComprasProps = { userEmail?: string; accessContext: MunicipalAccessContextValue; onBack: () => void; onLogout: () => void }

type NavItem = { id: ComprasView; label: string; icon: typeof LayoutDashboard; section: string }

const navItems: NavItem[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard, section: 'CENTRO DE DECISÃO' },
  { id: 'atas', label: 'Atas vigentes', icon: FileText, section: 'CATÁLOGO E CONTRATOS' },
  { id: 'saldos', label: 'Saldos e consumo', icon: Boxes, section: 'CATÁLOGO E CONTRATOS' },
  { id: 'demandas', label: 'Minhas demandas', icon: ClipboardList, section: 'OPERAÇÃO' },
  { id: 'pedidos', label: 'Pedidos da secretaria', icon: PackageCheck, section: 'OPERAÇÃO' },
  { id: 'aprovacoes', label: 'Central de aprovações', icon: CheckCircle2, section: 'OPERAÇÃO' },
  { id: 'entregas', label: 'Entregas', icon: Truck, section: 'OPERAÇÃO' },
  { id: 'empenhos', label: 'Controle de empenhos', icon: FileText, section: 'GESTÃO' },
  { id: 'relatorios', label: 'Relatórios', icon: BarChart3, section: 'GESTÃO' },
  { id: 'governanca', label: 'Governança', icon: Settings2, section: 'ADMINISTRAÇÃO' },
]

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(value))
}

function statusLabel(value: string | null | undefined) {
  return String(value || 'sem situação').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function ComprasModule({ userEmail, accessContext, onBack, onLogout }: ComprasProps) {
  const [view, setView] = useState<ComprasView>('overview')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<ComprasDashboardSummary | null>(null)
  const [recentDemands, setRecentDemands] = useState<ComprasRecentDemand[]>([])
  const [pendingDeliveries, setPendingDeliveries] = useState<ComprasPendingDelivery[]>([])

  const access = useMemo(() => resolveComprasAccess(accessContext), [accessContext])
  const canOperate = access.role === 'admin' || access.role === 'gestor' || access.role === 'operador'
  const visibleNavItems = navItems.filter((item) => item.id !== 'governanca' || access.role === 'admin')

  const loadDashboard = useCallback(async () => {
    setError('')
    try {
      const result = await loadComprasDashboard(access.municipalityId)
      setSummary(result.summary)
      setRecentDemands(result.recentDemands)
      setPendingDeliveries(result.pendingDeliveries)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o painel de compras.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [access.municipalityId])

  useEffect(() => { void loadDashboard() }, [loadDashboard])

  async function refresh() {
    setRefreshing(true)
    await loadDashboard()
  }

  const initials = (userEmail || 'U').slice(0, 2).toUpperCase()
  const currentLabel = navItems.find((item) => item.id === view)?.label || 'Visão geral'

  return <div className="compras-shell">
    <aside className="compras-sidebar">
      <div className="compras-sidebar-top">
        <button className="compras-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Voltar ao painel</button>
        <div className="compras-brand"><span className="compras-brand-icon"><PackageCheck size={20} /></span><div><strong>Atas, Saldos e Pedidos</strong><small>Administração e Finanças</small></div></div>
      </div>
      {Array.from(new Set(visibleNavItems.map((item) => item.section))).map((section) => <div key={section} className="compras-nav-section"><span>{section}</span><nav>{visibleNavItems.filter((item) => item.section === section).map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`compras-nav-item ${view === id ? 'active' : ''}`} onClick={() => setView(id)}><Icon size={17} />{label}{id === 'pedidos' && (summary?.pedidosPendentes || 0) > 0 && <b>{summary?.pedidosPendentes}</b>}</button>)}</nav></div>)}
      <div className="compras-sidebar-bottom"><div className="compras-user-chip"><span>{initials}</span><div><strong>{userEmail || 'Usuário autenticado'}</strong><small>{statusLabel(access.role)} · {access.scopeLabel}</small></div></div><button className="compras-logout" type="button" onClick={onLogout}><LogOut size={16} /> Sair do sistema</button></div>
    </aside>
    <main className="compras-main">
      <header className="compras-header"><div><span className="compras-kicker">MÓDULO TRANSVERSAL · COMPRAS MUNICIPAIS</span><h1>{currentLabel}</h1><p>{access.scopeLabel} · regras e autorizações aplicadas pelo backend canônico.</p></div><div className="compras-header-actions"><button type="button" className="compras-icon-button" aria-label="Pesquisar no módulo"><Search size={18} /></button><button type="button" className="compras-icon-button" aria-label="Notificações"><Bell size={18} /></button><button type="button" className="compras-icon-button" aria-label="Atualizar dados" onClick={() => void refresh()} disabled={refreshing}>{refreshing ? <RefreshCw className="compras-spin" size={18} /> : <RefreshCw size={18} />}</button><span className="compras-protected"><ShieldCheck size={15} /> Dados protegidos</span></div></header>
      <div className="compras-content">
        {view === 'overview' ? <Overview summary={summary} recentDemands={recentDemands} pendingDeliveries={pendingDeliveries} loading={loading} error={error} onRefresh={() => void refresh()} canOperate={canOperate} onNavigate={setView} /> : view === 'atas' ? <AtasPage municipalityId={access.municipalityId} canOperate={canOperate} /> : view === 'saldos' ? <SaldosPage municipalityId={access.municipalityId} /> : view === 'pedidos' ? <PedidosPage municipalityId={access.municipalityId} canOperate={canOperate} role={access.role} /> : view === 'aprovacoes' ? <PedidosPage municipalityId={access.municipalityId} canOperate={canOperate} role={access.role} initialStatus="ENVIADO" approvalsOnly /> : view === 'empenhos' ? <EmpenhosPage municipalityId={access.municipalityId} /> : <PlaceholderView view={view} canOperate={canOperate} />}
      </div>
    </main>
  </div>
}

function Overview({ summary, recentDemands, pendingDeliveries, loading, error, onRefresh, canOperate, onNavigate }: { summary: ComprasDashboardSummary | null; recentDemands: ComprasRecentDemand[]; pendingDeliveries: ComprasPendingDelivery[]; loading: boolean; error: string; onRefresh: () => void; canOperate: boolean; onNavigate: (view: ComprasView) => void }) {
  if (loading) return <div className="compras-loading" role="status"><RefreshCw className="compras-spin" size={19} /> Carregando dados autorizados do módulo…</div>
  return <section className="compras-page-section"><div className="compras-hero"><div><span className="compras-hero-kicker">CENTRO DE DECISÃO</span><h2>Compras públicas em um único ambiente.</h2><p>Consulte atas, acompanhe saldos e conduza pedidos da sua secretaria sem sair da Inteligência Municipal.</p></div><div className="compras-hero-mark"><PackageCheck size={43} /></div></div>{error && <div className="compras-error" role="alert"><AlertTriangle size={16} /><span>Não foi possível atualizar todos os indicadores. {error}</span><button type="button" onClick={onRefresh}>Tentar novamente</button></div>}<div className="compras-metrics"><Metric icon={FileText} label="Processos canônicos" value={summary?.processos || 0} tone="blue" /><Metric icon={ClipboardList} label="Demandas recentes" value={summary?.demandas || 0} tone="green" /><Metric icon={AlertTriangle} label="Pedidos aguardando ação" value={summary?.pedidosPendentes || 0} tone="amber" /><Metric icon={Truck} label="Entregas pendentes" value={summary?.entregasPendentes || 0} tone="violet" /></div><div className="compras-overview-grid"><section className="compras-panel"><div className="compras-panel-heading"><div><span className="compras-kicker">ACOMPANHAMENTO</span><h3>Demandas recentes</h3></div><button type="button" onClick={() => onNavigate('demandas')}>Ver todas</button></div>{recentDemands.length ? <div className="compras-list">{recentDemands.map((demand) => <article key={demand.id} className="compras-list-row"><span className="compras-list-icon"><ClipboardList size={16} /></span><div><strong>{demand.numero || 'Demanda sem número'} · {demand.objeto}</strong><small>{formatDate(demand.created_at)} · {statusLabel(demand.status)} · {formatMoney(demand.valor_estimado)}</small></div><span className="compras-status">{statusLabel(demand.prioridade)}</span></article>)}</div> : <EmptyState title="Nenhuma demanda recente" text="As demandas autorizadas aparecerão aqui." />}</section><section className="compras-panel"><div className="compras-panel-heading"><div><span className="compras-kicker">EXECUÇÃO</span><h3>Entregas pendentes</h3></div><button type="button" onClick={() => onNavigate('entregas')}>Acompanhar</button></div>{pendingDeliveries.length ? <div className="compras-list">{pendingDeliveries.map((delivery) => <article key={`${delivery.pedido_id}-${delivery.numero_pedido}`} className="compras-list-row"><span className="compras-list-icon amber"><Truck size={16} /></span><div><strong>Pedido {delivery.numero_pedido || delivery.pedido_id}</strong><small>{statusLabel(delivery.status_aprovacao || delivery.status)} · {Number(delivery.quantidade_pendente || 0).toLocaleString('pt-BR')} item(ns) pendente(s)</small></div><span className="compras-status warning">{delivery.entregas_registradas || 0} entrega(s)</span></article>)}</div> : <EmptyState title="Nenhuma entrega pendente" text="O backend não retornou pendências de entrega para este escopo." />}</section></div><section className="compras-next-action"><div><span className="compras-kicker">PRÓXIMA AÇÃO</span><h3>{canOperate ? 'Consulte uma ata ou inicie uma demanda.' : 'Acompanhe as informações do seu escopo.'}</h3><p>{canOperate ? 'As validações de saldo, unidade e autorização serão feitas no backend antes de qualquer gravação.' : 'Seu perfil está em modo de consulta. As operações ficam bloqueadas, mas o histórico permanece disponível.'}</p></div><div className="compras-quick-actions"><button type="button" onClick={() => onNavigate('atas')}><FileText size={16} /> Consultar atas</button>{canOperate && <button type="button" className="primary" onClick={() => onNavigate('demandas')}><ClipboardList size={16} /> Ver demandas</button>}</div></section></section>
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof FileText; label: string; value: number; tone: string }) { return <article className="compras-metric"><span className={`compras-metric-icon ${tone}`}><Icon size={19} /></span><div><span>{label}</span><strong>{value.toLocaleString('pt-BR')}</strong><small>Leitura no backend canônico</small></div></article> }
function EmptyState({ title, text }: { title: string; text: string }) { return <div className="compras-empty"><CheckCircle2 size={22} /><strong>{title}</strong><p>{text}</p></div> }
function PlaceholderView({ view, canOperate }: { view: ComprasView; canOperate: boolean }) { const labels: Record<ComprasView, string> = { overview: 'Visão geral', atas: 'Atas vigentes', demandas: 'Minhas demandas', pedidos: 'Pedidos da secretaria', aprovacoes: 'Central de aprovações', saldos: 'Saldos e consumo', empenhos: 'Controle de empenhos', entregas: 'Entregas', relatorios: 'Relatórios', governanca: 'Governança' }; return <section className="compras-placeholder"><span className="compras-placeholder-icon"><PackageCheck size={28} /></span><span className="compras-kicker">FASE 4 · FLUXO DE DECISÃO</span><h2>{labels[view]}</h2><p>O shell, o contexto municipal, o controle de perfil e a leitura inicial canônica já estão preparados. Esta tela será implementada na fase operacional correspondente.</p><span className="compras-placeholder-note">{canOperate ? 'As ações serão conectadas exclusivamente às RPCs oficiais do backend.' : 'Seu perfil poderá consultar esta área quando o conteúdo for liberado.'}</span></section> }

function AtasPage({ municipalityId, canOperate }: { municipalityId: string | null; canOperate: boolean }) {
  const [rows, setRows] = useState<ComprasAtaSummary[]>([])
  const [search, setSearch] = useState('')
  const [situation, setSituation] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setRows(await loadComprasAtas(municipalityId, search, situation)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível consultar as atas canônicas.') } finally { setLoading(false) }
  }, [municipalityId, search, situation])
  useEffect(() => { void load() }, [load])
  return <section className="compras-page-section"><div className="compras-page-heading"><div><span className="compras-kicker">CATÁLOGO E CONTRATOS</span><h2>Atas vigentes</h2><p>Consulta de contratos canônicos e da disponibilidade de itens por ata.</p></div><button className="compras-secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'compras-spin' : ''} /> Atualizar</button></div><div className="compras-filter-bar"><label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por número ou objeto" /></label><select aria-label="Filtrar situação" value={situation} onChange={(event) => setSituation(event.target.value)}><option value="">Todas as situações</option><option value="ATIVA">Ativa</option><option value="VIGENTE">Vigente</option><option value="ENCERRADA">Encerrada</option></select></div>{error && <div className="compras-error" role="alert"><AlertTriangle size={16} />{error}</div>}{loading ? <div className="compras-loading"><RefreshCw className="compras-spin" size={19} /> Consultando contratos autorizados…</div> : rows.length ? <div className="compras-table-panel"><table className="compras-table"><thead><tr><th>Ata / contrato</th><th>Vigência</th><th>Situação</th><th>Itens</th><th>Saldo estimado</th><th>Ação</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.numero || 'Sem número'}</strong><small>{row.objeto || 'Objeto não informado'}</small></td><td>{row.vigencia_inicio ? formatDate(row.vigencia_inicio) : '—'} a {row.vigencia_fim ? formatDate(row.vigencia_fim) : '—'}</td><td><span className="compras-status">{statusLabel(row.situacao)}</span></td><td>{row.itens.toLocaleString('pt-BR')} <small>{row.criticos ? `${row.criticos} crítico(s)` : 'sem alerta'}</small></td><td><strong>{formatMoney(row.saldoValor)}</strong><small>{row.saldoQuantidade.toLocaleString('pt-BR')} unidade(s)</small></td><td><button className="compras-link-button" type="button">Ver detalhes</button></td></tr>)}</tbody></table></div> : <div className="compras-empty compras-empty-large"><FileText size={24} /><strong>Nenhuma ata canônica encontrada</strong><p>O backend de desenvolvimento ainda não possui registros em <code>compras_contratos</code>. A consulta está pronta e não utiliza as tabelas legadas.</p>{canOperate && <span className="compras-placeholder-note">O cadastro será conectado somente após a RPC oficial de criação/gestão de contratos.</span>}</div>}</section>
}

function SaldosPage({ municipalityId }: { municipalityId: string | null }) {
  const [rows, setRows] = useState<ComprasBalanceItem[]>([])
  const [search, setSearch] = useState('')
  const [ataId, setAtaId] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { setRows(await loadComprasBalances(municipalityId, search, ataId)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível consultar os saldos canônicos.') } finally { setLoading(false) } }, [municipalityId, search, ataId])
  useEffect(() => { void load() }, [load])
  const ataOptions = Array.from(new Set(rows.map((row) => row.ata_id))).sort((a, b) => a - b)
  const totalContracted = rows.reduce((sum, row) => sum + Number(row.quantidade_contratada || 0), 0)
  const totalAvailable = rows.reduce((sum, row) => sum + Number(row.quantidade_utilizavel ?? row.saldo_quantidade ?? 0), 0)
  const critical = rows.filter(isCriticalBalance).length
  return <section className="compras-page-section"><div className="compras-page-heading"><div><span className="compras-kicker">CATÁLOGO E CONTRATOS</span><h2>Saldos e consumo</h2><p>Disponibilidade física e financeira retornada pela view operacional canônica.</p></div><button className="compras-secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'compras-spin' : ''} /> Atualizar</button></div><div className="compras-balance-metrics"><Metric icon={Boxes} label="Itens consultados" value={rows.length} tone="blue" /><Metric icon={PackageCheck} label="Quantidade contratada" value={totalContracted} tone="green" /><Metric icon={CheckCircle2} label="Quantidade utilizável" value={totalAvailable} tone="violet" /><Metric icon={AlertTriangle} label="Itens críticos" value={critical} tone="amber" /></div><div className="compras-filter-bar"><label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar item por descrição" /></label><select aria-label="Filtrar por ata" value={ataId} onChange={(event) => setAtaId(event.target.value)}><option value="">Todas as atas</option>{ataOptions.map((id) => <option key={id} value={id}>Ata {id}</option>)}</select></div>{error && <div className="compras-error" role="alert"><AlertTriangle size={16} />{error}</div>}{loading ? <div className="compras-loading"><RefreshCw className="compras-spin" size={19} /> Consultando saldos autorizados…</div> : <div className="compras-table-panel"><table className="compras-table compras-balance-table"><thead><tr><th>Ata / item</th><th>Contratado</th><th>Reservado</th><th>Saldo atual</th><th>Utilizável</th><th>Valor do saldo</th><th>Situação</th></tr></thead><tbody>{rows.map((row) => { const criticalRow = isCriticalBalance(row); return <tr key={`${row.ata_id}-${row.item_ata_id}`}><td><strong>Ata {row.ata_id} · item {row.item_ata_id}</strong><small>{row.descricao}</small></td><td>{Number(row.quantidade_contratada).toLocaleString('pt-BR')}</td><td>{Number(row.quantidade_reservada).toLocaleString('pt-BR')}</td><td>{Number(row.saldo_quantidade).toLocaleString('pt-BR')}</td><td><strong>{Number(row.quantidade_utilizavel).toLocaleString('pt-BR')}</strong></td><td>{formatMoney(row.saldo_valor)}</td><td><span className={`compras-status ${criticalRow ? 'warning' : ''}`}>{criticalRow ? 'Crítico' : 'Disponível'}</span></td></tr>})}</tbody></table>{!rows.length && <div className="compras-empty compras-empty-large"><Boxes size={24} /><strong>Nenhum saldo encontrado</strong><p>A view canônica não retornou itens para os filtros informados.</p></div>}</div>}</section>
}


function PedidosPage({ municipalityId, canOperate, role, initialStatus = '', approvalsOnly = false }: { municipalityId: string | null; canOperate: boolean; role: string; initialStatus?: string; approvalsOnly?: boolean }) {
  const [rows, setRows] = useState<ComprasOrder[]>([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState(initialStatus)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [detail, setDetail] = useState<ComprasOrderDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { setRows(await loadComprasOrders(municipalityId, search, status)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível consultar os pedidos canônicos.') } finally { setLoading(false) } }, [municipalityId, search, status])
  useEffect(() => { void load() }, [load])
  const openDetail = useCallback(async (pedidoId: number) => { setSelectedId(pedidoId); setDetailLoading(true); setError(''); try { setDetail(await loadComprasOrderDetail(municipalityId, pedidoId)) } catch (reason) { setDetail(null); setError(reason instanceof Error ? reason.message : 'Não foi possível abrir o pedido.') } finally { setDetailLoading(false) } }, [municipalityId])
  const pending = rows.filter((row) => Number(row.quantidade_pendente || 0) > 0).length
  const delivered = rows.reduce((sum, row) => sum + Number(row.quantidade_entregue || 0), 0)
  const requested = rows.reduce((sum, row) => sum + Number(row.quantidade_solicitada || 0), 0)
  return <section className="compras-page-section"><div className="compras-page-heading"><div><span className="compras-kicker">FASE 4 · FLUXO DE DECISÃO</span><h2>{approvalsOnly ? 'Central de aprovações' : 'Pedidos da secretaria'}</h2><p>{approvalsOnly ? 'Fila de pedidos enviados para decisão no escopo autorizado.' : 'Consulte o pedido, acompanhe o histórico e execute somente as decisões permitidas pelo backend.'}</p></div><button className="compras-secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'compras-spin' : ''} /> Atualizar</button></div><div className="compras-balance-metrics"><Metric icon={PackageCheck} label="Pedidos no escopo" value={rows.length} tone="blue" /><Metric icon={AlertTriangle} label="Com pendência de entrega" value={pending} tone="amber" /><Metric icon={ClipboardList} label="Quantidade solicitada" value={requested} tone="green" /><Metric icon={CheckCircle2} label="Quantidade entregue" value={delivered} tone="violet" /></div><div className="compras-filter-bar"><label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pelo número do pedido" /></label><select aria-label="Filtrar pedidos por situação" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todas as situações</option><option value="RASCUNHO">Rascunho</option><option value="ENVIADO">Enviado</option><option value="APROVADO">Aprovado</option><option value="EM_EXECUCAO">Em execução</option><option value="ENCERRADO">Encerrado</option><option value="CANCELADO">Cancelado</option></select></div>{error && <div className="compras-error" role="alert"><AlertTriangle size={16} />{error}</div>}{loading ? <div className="compras-loading"><RefreshCw className="compras-spin" size={19} /> Consultando pedidos autorizados…</div> : <div className="compras-table-panel"><table className="compras-table compras-orders-table"><thead><tr><th>Pedido</th><th>Solicitação</th><th>Situação</th><th>Quantidade</th><th>Entregue</th><th>Pendente</th><th>Decisão</th></tr></thead><tbody>{rows.map((row) => <tr key={row.pedido_id}><td><strong>{row.numero_pedido || `Pedido ${row.pedido_id}`}</strong><small>ID interno {row.pedido_id}</small></td><td>{row.data_solicitacao ? formatDate(row.data_solicitacao) : '—'}</td><td><span className="compras-status">{statusLabel(row.status_aprovacao || row.status)}</span><small>{statusLabel(row.status)}</small></td><td>{Number(row.quantidade_solicitada).toLocaleString('pt-BR')}</td><td>{Number(row.quantidade_entregue).toLocaleString('pt-BR')}</td><td><strong>{Number(row.quantidade_pendente).toLocaleString('pt-BR')}</strong></td><td><button className="compras-link-button" type="button" onClick={() => void openDetail(row.pedido_id)}>Abrir pedido</button></td></tr>)}</tbody></table>{!rows.length && <div className="compras-empty compras-empty-large"><PackageCheck size={24} /><strong>Nenhum pedido encontrado</strong><p>A view canônica não retornou pedidos para o escopo e filtros informados.</p></div>}</div>}{selectedId && (detailLoading ? <div className="compras-loading"><RefreshCw className="compras-spin" size={19} /> Carregando detalhe e histórico…</div> : detail ? <OrderDecisionPanel detail={detail} canOperate={canOperate} role={role} onUpdated={() => { void load(); void openDetail(detail.pedido_id) }} onClose={() => { setSelectedId(null); setDetail(null) }} /> : null)}</section>
}

function OrderDecisionPanel({ detail, canOperate, role, onUpdated, onClose }: { detail: ComprasOrderDetail; canOperate: boolean; role: string; onUpdated: () => void; onClose: () => void }) {
  const [justification, setJustification] = useState('')
  const [executing, setExecuting] = useState(false)
  const [actionError, setActionError] = useState('')
  const manager = role === 'admin' || role === 'gestor'
  const state = `${detail.status || ''} ${detail.status_aprovacao || ''}`.toUpperCase()
  const canSend = canOperate && /RASCUNHO/.test(state)
  const canApprove = manager && /ENVI|ANALISE|PENDENTE/.test(state) && !/APROV/.test(state)
  const canCancel = canOperate && !/ENCERR|CANCEL|REJEIT/.test(state)
  const canClose = manager && /PRONTO|EXECUCAO|ENTREG/.test(state)
  async function run(action: 'enviar' | 'aprovar' | 'rejeitar' | 'cancelar' | 'encerrar') {
    const requiresText = action === 'rejeitar' || action === 'cancelar' || action === 'encerrar'
    if (requiresText && justification.trim().length < 5) { setActionError('Informe uma justificativa com pelo menos 5 caracteres.'); return }
    if (!window.confirm(`Confirmar a ação: ${statusLabel(action)}?`)) return
    setExecuting(true); setActionError('')
    try { await executeComprasOrderAction(action, detail.pedido_id, justification.trim()); setJustification(''); onUpdated() } catch (reason) { setActionError(reason instanceof Error ? reason.message : 'O backend recusou a ação.') } finally { setExecuting(false) }
  }
  return <section className="compras-detail-panel"><div className="compras-detail-heading"><div><span className="compras-kicker">DETALHE E AUDITORIA</span><h3>{detail.numero_pedido || `Pedido ${detail.pedido_id}`}</h3><p>{statusLabel(detail.status_aprovacao || detail.status)} · atualizado em {formatDate(detail.updated_at)}</p></div><button className="compras-secondary-button" type="button" onClick={onClose}>Fechar detalhe</button></div><div className="compras-detail-grid"><div className="compras-detail-card"><span>Justificativa</span><strong>{detail.justificativa || 'Não informada'}</strong><small>Local de entrega: {detail.local_entrega || 'Não informado'}</small><small>Requisição: {detail.numero_requisicao || 'Não informada'}</small><small>Valor total: {formatMoney(detail.valor_total)}</small></div><div className="compras-detail-card"><span>Itens do pedido</span>{detail.items.length ? detail.items.map((item) => <div className="compras-detail-item" key={item.id}><strong>Item {item.item_ata_id}</strong><small>{Number(item.quantidade_solicitada).toLocaleString('pt-BR')} unidade(s) · {formatMoney(item.valor_total)}</small></div>) : <small>Nenhum item detalhado no escopo autorizado.</small>}</div></div><div className="compras-decision-bar"><div><span className="compras-kicker">AÇÕES DISPONÍVEIS</span><p>As regras finais são avaliadas pelo backend. Justificativa é obrigatória para rejeitar, cancelar ou encerrar.</p></div><div className="compras-quick-actions">{canSend && <button type="button" onClick={() => void run('enviar')} disabled={executing}>Enviar para aprovação</button>}{canApprove && <><button type="button" className="primary" onClick={() => void run('aprovar')} disabled={executing}>Aprovar</button><button type="button" onClick={() => void run('rejeitar')} disabled={executing}>Rejeitar</button></>}{canCancel && <button type="button" onClick={() => void run('cancelar')} disabled={executing}>Cancelar</button>}{canClose && <button type="button" className="primary" onClick={() => void run('encerrar')} disabled={executing}>Encerrar</button>}{!canSend && !canApprove && !canCancel && !canClose && <span className="compras-placeholder-note">Nenhuma ação compatível com o estado e o perfil atual.</span>}</div></div>{(canApprove || canCancel || canClose) && <label className="compras-justification"><span>Justificativa ou observação da decisão</span><textarea value={justification} onChange={(event) => setJustification(event.target.value)} placeholder="Descreva o motivo da decisão quando necessário…" rows={3} /></label>}{actionError && <div className="compras-error" role="alert"><AlertTriangle size={16} />{actionError}</div>}<div className="compras-timeline"><div className="compras-panel-heading"><div><span className="compras-kicker">AUDITORIA</span><h3>Linha do tempo</h3></div><span className="compras-status">{detail.events.length} evento(s)</span></div>{detail.events.length ? detail.events.map((event) => <article className="compras-timeline-row" key={event.id}><span className="compras-timeline-dot" /><div><strong>{statusLabel(event.evento)} · {statusLabel(event.status_novo)}</strong><small>{formatDate(event.ocorrido_em)}{event.status_anterior ? ` · de ${statusLabel(event.status_anterior)}` : ''}</small>{event.justificativa && <p>{event.justificativa}</p>}</div></article>) : <div className="compras-empty"><CheckCircle2 size={20} /><strong>Nenhum evento registrado</strong><p>O histórico aparecerá aqui após a primeira movimentação do pedido.</p></div>}</div></section>
}

function EmpenhosPage({ municipalityId }: { municipalityId: string | null }) {
  const [rows, setRows] = useState<ComprasContractExecution[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => { setLoading(true); setError(''); try { setRows(await loadComprasContractExecutions(municipalityId, search)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível consultar a execução contratual canônica.') } finally { setLoading(false) } }, [municipalityId, search])
  useEffect(() => { void load() }, [load])
  const withCommitment = rows.filter((row) => row.empenho_numero).length
  const paid = rows.filter((row) => /pago|liquidado/i.test(String(row.pagamento_status))).length
  return <section className="compras-page-section"><div className="compras-page-heading"><div><span className="compras-kicker">GESTÃO FINANCEIRA · LEITURA</span><h2>Controle de empenhos</h2><p>Consulta dos eventos de execução contratual que possuem referência a empenho e pagamento.</p></div><button className="compras-secondary-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'compras-spin' : ''} /> Atualizar</button></div><div className="compras-balance-metrics"><Metric icon={FileText} label="Eventos de execução" value={rows.length} tone="blue" /><Metric icon={ClipboardList} label="Com empenho informado" value={withCommitment} tone="green" /><Metric icon={CheckCircle2} label="Com pagamento liquidado/pago" value={paid} tone="violet" /><Metric icon={AlertTriangle} label="Ações financeiras" value={0} tone="amber" /></div><div className="compras-readonly-note"><ShieldCheck size={16} /><span>Modo de consulta: o backend ainda não expõe RPCs específicas para registrar, liquidar ou alterar empenhos. Nenhuma operação financeira será simulada no frontend.</span></div><div className="compras-filter-bar"><label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar número do empenho ou descrição" /></label></div>{error && <div className="compras-error" role="alert"><AlertTriangle size={16} />{error}</div>}{loading ? <div className="compras-loading"><RefreshCw className="compras-spin" size={19} /> Consultando execução contratual…</div> : <div className="compras-table-panel"><table className="compras-table compras-orders-table"><thead><tr><th>Ocorrido em</th><th>Contrato</th><th>Tipo / descrição</th><th>Empenho</th><th>Pagamento</th><th>Valor novo</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.ocorrido_em ? formatDate(row.ocorrido_em) : '—'}</td><td><strong>{row.contrato_id.slice(0, 8)}…</strong><small>{statusLabel(row.status)}</small></td><td><strong>{statusLabel(row.tipo)}</strong><small>{row.descricao || 'Sem descrição'}</small></td><td>{row.empenho_numero || 'Não informado'}</td><td><span className="compras-status">{statusLabel(row.pagamento_status)}</span></td><td>{row.valor_novo == null ? '—' : formatMoney(row.valor_novo)}</td></tr>)}</tbody></table>{!rows.length && <div className="compras-empty compras-empty-large"><FileText size={24} /><strong>Nenhum empenho canônico encontrado</strong><p>A entidade de execução contratual está preparada, mas ainda não há eventos registrados no ambiente de desenvolvimento.</p></div>}</div>}</section>
}
