import { ArrowRight, FileText, LogOut, MapPinned, Package, ShieldCheck, Truck } from 'lucide-react'
import './Dashboard.css'

const assetBase = import.meta.env.BASE_URL

type DashboardProps = {
  userEmail?: string
  onOpenFleet: () => void
  onOpenCensus: () => void
  onLogout: () => void
}

const modules = [
  {
    id: 'fleet',
    title: 'Gestão de Frotas',
    description: 'Veículos, condutores e abastecimentos.',
    icon: Truck,
    status: 'Em implantação',
    tone: 'fleet',
    available: true,
  },
  {
    id: 'census',
    title: 'Censo Municipal',
    description: 'Mapa e informações do território municipal.',
    icon: MapPinned,
    status: 'Estrutura inicial',
    tone: 'census',
    available: true,
  },
  {
    id: 'atas',
    title: 'Atas e Pedidos',
    description: 'Atas de registro de preços e solicitações.',
    icon: FileText,
    status: 'Em preparação',
    tone: 'records',
    available: false,
  },
  {
    id: 'compras',
    title: 'Compras Públicas',
    description: 'Processos, contratos e aquisições.',
    icon: Package,
    status: 'Em preparação',
    tone: 'procurement',
    available: false,
  },
  {
    id: 'acts',
    title: 'Atos Oficiais',
    description: 'Publicações e documentos municipais.',
    icon: ShieldCheck,
    status: 'Em preparação',
    tone: 'official',
    available: false,
  },
] as const

export function Dashboard({ userEmail, onOpenFleet, onOpenCensus, onLogout }: DashboardProps) {
  const openModule = (id: (typeof modules)[number]['id']) => {
    if (id === 'fleet') onOpenFleet()
    if (id === 'census') onOpenCensus()
  }

  return <div className="dashboard-shell">
    <header className="dashboard-header">
      <div className="dashboard-header-inner">
        <div className="dashboard-brand">
          <span className="dashboard-brand-mark">
            <img src={`${assetBase}assets/brasao-pref.png`} alt="" />
          </span>
          <span className="dashboard-brand-copy">
            <strong>Inteligência Municipal</strong>
            <small>Prefeitura de Pitangueiras–PR</small>
          </span>
        </div>
        <div className="dashboard-account">
          <span className="user-avatar" aria-hidden="true">{(userEmail?.[0] || 'U').toUpperCase()}</span>
          <span className="user-details">
            <strong>{userEmail || 'Usuário institucional'}</strong>
            <small>Sessão ativa</small>
          </span>
          <button className="logout-button" type="button" aria-label="Sair do sistema" onClick={onLogout}>
            <LogOut size={17} aria-hidden="true" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </header>

    <main className="dashboard-main">
      <div className="dashboard-content">
        <section className="hero-strip" aria-labelledby="dashboardTitle">
          <div className="hero-copy">
            <span className="hero-eyebrow">PITANGUEIRAS · PARANÁ</span>
            <h1 id="dashboardTitle">Gestão municipal</h1>
            <p>Escolha um módulo para continuar.</p>
          </div>
          <div className="hero-mark" aria-hidden="true">
            <img src={`${assetBase}assets/brasao-pref.png`} alt="" />
          </div>
        </section>

        <section className="module-section" aria-labelledby="moduleTitle">
          <div className="section-heading">
            <div>
              <span className="section-kicker">ACESSO AOS SERVIÇOS</span>
              <h2 id="moduleTitle">Módulos municipais</h2>
            </div>
            <span className="section-hint">Selecione um card</span>
          </div>

          <div className="module-grid">
            {modules.map(({ id, title, description, icon: Icon, status, tone, available }) => (
              <button
                key={id}
                className={`module-card module-card--${tone}`}
                type="button"
                disabled={!available}
                aria-label={available ? `Abrir ${title}` : `${title}: em preparação`}
                onClick={() => openModule(id)}
              >
                <span className="module-card-top">
                  <span className="module-icon"><Icon size={27} strokeWidth={1.8} aria-hidden="true" /></span>
                  <span className={`module-status${available ? ' module-status--active' : ''}`}>
                    <span className="status-dot" aria-hidden="true" />
                    {status}
                  </span>
                </span>
                <span className="module-card-title">{title}</span>
                <span className="module-card-description">{description}</span>
                <span className={`module-card-action${available ? '' : ' module-card-action--disabled'}`}>
                  {available ? 'Abrir módulo' : 'Em breve'}
                  {available && <ArrowRight size={17} aria-hidden="true" />}
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </main>

    <footer className="dashboard-footer">
      <span>Inteligência Municipal</span>
      <span>Prefeitura de Pitangueiras–PR</span>
    </footer>
  </div>
}
