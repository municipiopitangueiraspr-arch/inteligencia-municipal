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
  resolveComprasAccess,
  type ComprasDashboardSummary,
  type ComprasPendingDelivery,
  type ComprasRecentDemand,
} from './comprasReadService'
import './ComprasModule.css'

type ComprasView = 'overview' | 'atas' | 'demandas' | 'pedidos' | 'saldos' | 'entregas' | 'relatorios' | 'governanca'
type ComprasProps = { userEmail?: string; accessContext: MunicipalAccessContextValue; onBack: () => void; onLogout: () => void }

type NavItem = { id: ComprasView; label: string; icon: typeof LayoutDashboard; section: string }

const navItems: NavItem[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard, section: 'CENTRO DE DECISÃO' },
  { id: 'atas', label: 'Atas vigentes', icon: FileText, section: 'CATÁLOGO E CONTRATOS' },
  { id: 'saldos', label: 'Saldos e consumo', icon: Boxes, section: 'CATÁLOGO E CONTRATOS' },
  { id: 'demandas', label: 'Minhas demandas', icon: ClipboardList, section: 'OPERAÇÃO' },
  { id: 'pedidos', label: 'Pedidos da secretaria', icon: PackageCheck, section: 'OPERAÇÃO' },
  { id: 'entregas', label: 'Entregas', icon: Truck, section: 'OPERAÇÃO' },
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
        {view === 'overview' ? <Overview summary={summary} recentDemands={recentDemands} pendingDeliveries={pendingDeliveries} loading={loading} error={error} onRefresh={() => void refresh()} canOperate={canOperate} onNavigate={setView} /> : <PlaceholderView view={view} canOperate={canOperate} />}
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
function PlaceholderView({ view, canOperate }: { view: ComprasView; canOperate: boolean }) { const labels: Record<ComprasView, string> = { overview: 'Visão geral', atas: 'Atas vigentes', demandas: 'Minhas demandas', pedidos: 'Pedidos da secretaria', saldos: 'Saldos e consumo', entregas: 'Entregas', relatorios: 'Relatórios', governanca: 'Governança' }; return <section className="compras-placeholder"><span className="compras-placeholder-icon"><PackageCheck size={28} /></span><span className="compras-kicker">FASE 1 · FUNDAÇÃO</span><h2>{labels[view]}</h2><p>O shell, o contexto municipal, o controle de perfil e a leitura inicial canônica já estão preparados. Esta tela será implementada na fase operacional correspondente.</p><span className="compras-placeholder-note">{canOperate ? 'As ações serão conectadas exclusivamente às RPCs novas do backend.' : 'Seu perfil poderá consultar esta área quando o conteúdo for liberado.'}</span></section> }
