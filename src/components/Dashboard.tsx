import { Bell, ChevronDown, ClipboardList, FileText, Fuel, LayoutDashboard, LogOut, MapPinned, Package, Settings2, ShieldCheck, Truck, Users, Wrench } from 'lucide-react'
import './Dashboard.css'

const assetBase = import.meta.env.BASE_URL

type DashboardProps = { userEmail?: string; onLogout: () => void }

const cards = [
  { label: 'Veículos ativos', value: '—', helper: 'Aguardando dados de frotas', icon: Truck, tone: 'blue' },
  { label: 'Em manutenção', value: '—', helper: 'Indicador do módulo de frotas', icon: Wrench, tone: 'amber' },
  { label: 'Abastecimentos no mês', value: '—', helper: 'Consumo consolidado', icon: Fuel, tone: 'green' },
  { label: 'Solicitações pendentes', value: '—', helper: 'Ações que exigem atenção', icon: ClipboardList, tone: 'violet' },
]

const modules = [
  { title: 'Gestão de Frotas', description: 'Veículos, condutores, manutenção e abastecimento.', icon: Truck, status: 'Em implantação', active: true },
  { title: 'Atas e Pedidos', description: 'Atas de registro de preços, saldos e solicitações.', icon: FileText, status: 'Disponível', active: false },
  { title: 'Compras Públicas', description: 'Processos, contratos e acompanhamento das aquisições.', icon: Package, status: 'Em preparação', active: false },
  { title: 'Atos Oficiais', description: 'Publicações e documentos oficiais do Município.', icon: ShieldCheck, status: 'Disponível', active: false },
]

export function Dashboard({ userEmail, onLogout }: DashboardProps) {
  return <div className="dashboard-shell">
    <aside className="dashboard-sidebar">
      <div className="dashboard-brand"><div className="dashboard-brand-mark"><img src={`${assetBase}assets/brasao-pref.png`} alt="Brasão municipal" /></div><div><strong>Inteligência</strong><span>Municipal</span></div></div>
      <div className="sidebar-label">MENU PRINCIPAL</div>
      <nav className="dashboard-nav"><button className="nav-item active"><LayoutDashboard size={18} /> Visão geral</button><button className="nav-item"><Truck size={18} /> Gestão de Frotas <span className="nav-dot" /></button><button className="nav-item"><FileText size={18} /> Atas e Pedidos</button><button className="nav-item"><Package size={18} /> Compras Públicas</button><button className="nav-item"><MapPinned size={18} /> Atos Oficiais</button></nav>
      <div className="sidebar-label sidebar-label-lower">ADMINISTRAÇÃO</div><nav className="dashboard-nav"><button className="nav-item"><Users size={18} /> Usuários e unidades</button><button className="nav-item"><Settings2 size={18} /> Configurações</button></nav>
      <div className="sidebar-bottom"><div className="support-card"><span className="support-icon"><ShieldCheck size={17} /></span><div><strong>Ambiente seguro</strong><small>Acesso institucional</small></div></div><button className="logout-button" onClick={onLogout}><LogOut size={17} /> Sair do sistema</button></div>
    </aside>
    <main className="dashboard-main">
      <header className="dashboard-header"><div><p className="header-kicker">PAINEL MUNICIPAL</p><h1>Visão geral</h1></div><div className="header-actions"><button className="notification-button" aria-label="Notificações"><Bell size={19} /><span /></button><div className="user-menu"><div className="user-avatar">{(userEmail?.[0] || 'U').toUpperCase()}</div><div className="user-details"><strong>{userEmail || 'Usuário institucional'}</strong><span>Usuário autenticado</span></div><ChevronDown size={16} /></div></div></header>
      <div className="dashboard-content"><section className="hero-strip"><div><span className="hero-eyebrow">INTELIGÊNCIA MUNICIPAL</span><h2>Bom trabalho hoje.</h2><p>Acompanhe os principais indicadores e acesse rapidamente os módulos da Prefeitura.</p></div><div className="hero-mark"><img src={`${assetBase}assets/brasao-pref.png`} alt="" /></div></section>
        <section className="section-block"><div className="section-heading"><div><span className="section-kicker">ACOMPANHAMENTO</span><h2>Indicadores principais</h2></div><span className="period-label">Visão atual</span></div><div className="metric-grid">{cards.map(({ label, value, helper, icon: Icon, tone }) => <article className="metric-card" key={label}><div className={`metric-icon ${tone}`}><Icon size={19} /></div><div className="metric-data"><span>{label}</span><strong>{value}</strong><small>{helper}</small></div></article>)}</div></section>
        <section className="section-block"><div className="section-heading"><div><span className="section-kicker">ACESSO RÁPIDO</span><h2>Módulos municipais</h2></div><button className="link-button">Ver todos</button></div><div className="module-grid">{modules.map(({ title, description, icon: Icon, status, active }) => <article className={`module-card ${active ? 'module-card-active' : ''}`} key={title}><div className="module-card-top"><span className="module-icon"><Icon size={20} /></span><span className={`module-status ${active ? 'status-active' : ''}`}>{status}</span></div><h3>{title}</h3><p>{description}</p><button className="module-link">Acessar módulo <span>→</span></button></article>)}</div></section>
        <section className="section-block attention-section"><div className="section-heading"><div><span className="section-kicker">CENTRAL DE ATENÇÃO</span><h2>Próximas ações</h2></div></div><div className="empty-attention"><div className="empty-attention-icon"><Bell size={21} /></div><div><strong>Nenhuma pendência registrada</strong><p>Quando houver tarefas ou solicitações, elas aparecerão nesta área.</p></div></div></section>
      </div><footer className="dashboard-footer"><span>Inteligência Municipal · Prefeitura de Pitangueiras–PR</span><span>Ambiente institucional</span></footer>
    </main>
  </div>
}
