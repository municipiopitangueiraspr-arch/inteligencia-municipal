import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Compass,
  Construction,
  Dumbbell,
  FileText,
  GraduationCap,
  HeartHandshake,
  HeartPulse,
  Landmark,
  LogOut,
  MapPinned,
  Package,
  ShieldCheck,
  Sprout,
  TrendingUp,
  Truck,
} from 'lucide-react'
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
    secretariatId: 'administration',
  },
  {
    id: 'census',
    title: 'Censo Municipal',
    description: 'Mapa e informações do território municipal.',
    icon: MapPinned,
    status: 'Estrutura inicial',
    tone: 'census',
    available: true,
    secretariatId: 'health',
  },
  {
    id: 'atas',
    title: 'Atas e Pedidos',
    description: 'Atas de registro de preços e solicitações.',
    icon: FileText,
    status: 'Em preparação',
    tone: 'records',
    available: false,
    secretariatId: 'administration',
  },
  {
    id: 'compras',
    title: 'Compras Públicas',
    description: 'Processos, contratos e aquisições.',
    icon: Package,
    status: 'Em preparação',
    tone: 'procurement',
    available: false,
    secretariatId: 'administration',
  },
  {
    id: 'acts',
    title: 'Atos Oficiais',
    description: 'Publicações e documentos municipais.',
    icon: ShieldCheck,
    status: 'Em preparação',
    tone: 'official',
    available: false,
    secretariatId: 'administration',
  },
] as const

type ModuleId = (typeof modules)[number]['id']

const secretariats = [
  {
    id: 'administration',
    title: 'Administração e Finanças',
    description: 'Gestão administrativa, financeira e dos recursos municipais.',
    icon: Landmark,
    tone: 'administration',
  },
  {
    id: 'agriculture',
    title: 'Agricultura e Meio Ambiente',
    description: 'Desenvolvimento rural, agricultura e cuidado ambiental.',
    icon: Sprout,
    tone: 'agriculture',
  },
  {
    id: 'social',
    title: 'Assistência Social',
    description: 'Políticas de proteção e atendimento social.',
    icon: HeartHandshake,
    tone: 'social',
  },
  {
    id: 'culture',
    title: 'Cultura e Turismo',
    description: 'Ações culturais, turismo e valorização do município.',
    icon: Compass,
    tone: 'culture',
  },
  {
    id: 'development',
    title: 'Desenvolvimento Econômico',
    description: 'Iniciativas de desenvolvimento e fortalecimento econômico.',
    icon: TrendingUp,
    tone: 'development',
  },
  {
    id: 'education',
    title: 'Educação',
    description: 'Gestão e acompanhamento das ações educacionais.',
    icon: GraduationCap,
    tone: 'education',
  },
  {
    id: 'sports',
    title: 'Esporte e Lazer',
    description: 'Atividades esportivas, recreação e lazer.',
    icon: Dumbbell,
    tone: 'sports',
  },
  {
    id: 'works',
    title: 'Obras, Planejamento e Urbanismo',
    description: 'Obras, planejamento territorial e desenvolvimento urbano.',
    icon: Construction,
    tone: 'works',
  },
  {
    id: 'health',
    title: 'Saúde',
    description: 'Serviços, planejamento e informações municipais de saúde.',
    icon: HeartPulse,
    tone: 'health',
  },
  {
    id: 'security',
    title: 'Segurança Pública e Trânsito',
    description: 'Segurança pública, mobilidade e trânsito municipal.',
    icon: ShieldCheck,
    tone: 'security',
  },
] as const

type SecretariatId = (typeof secretariats)[number]['id']

export function Dashboard({ userEmail, onOpenFleet, onOpenCensus, onLogout }: DashboardProps) {
  const [selectedSecretariatId, setSelectedSecretariatId] = useState<SecretariatId | null>(null)
  const selectedSecretariat = secretariats.find((secretariat) => secretariat.id === selectedSecretariatId)
  const visibleModules = selectedSecretariat
    ? modules.filter((module) => module.secretariatId === selectedSecretariat.id)
    : []

  const openModule = (id: ModuleId) => {
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
        {selectedSecretariat && <button className="secretariat-back-button" type="button" onClick={() => setSelectedSecretariatId(null)}>
          <ArrowLeft size={16} aria-hidden="true" />
          Voltar às secretarias
        </button>}

        <section className="hero-strip" aria-labelledby="dashboardTitle">
          <div className="hero-copy">
            <span className="hero-eyebrow">PITANGUEIRAS · PARANÁ</span>
            <h1 id="dashboardTitle">{selectedSecretariat?.title || 'Gestão municipal'}</h1>
            <p>{selectedSecretariat ? 'Acesse os módulos disponíveis nesta secretaria.' : 'Escolha uma secretaria para encontrar seus módulos.'}</p>
          </div>
          <div className="hero-mark" aria-hidden="true">
            {selectedSecretariat
              ? <selectedSecretariat.icon size={42} strokeWidth={1.6} />
              : <img src={`${assetBase}assets/brasao-pref.png`} alt="" />}
          </div>
        </section>

        {selectedSecretariat ? <section className="module-section" aria-labelledby="moduleTitle">
          <div className="section-heading">
            <div>
              <span className="section-kicker">{selectedSecretariat.title.toLocaleUpperCase('pt-BR')}</span>
              <h2 id="moduleTitle">Módulos da secretaria</h2>
            </div>
            {visibleModules.length > 0 && <span className="section-hint">Selecione um módulo</span>}
          </div>

          {visibleModules.length > 0 ? <div className="module-grid">
            {visibleModules.map(({ id, title, description, icon: Icon, status, tone, available }) => (
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
                  {available ? 'Acessar módulo' : 'Em breve'}
                  {available && <ArrowRight size={17} aria-hidden="true" />}
                </span>
              </button>
            ))}
          </div> : <div className="secretariat-empty" role="status">
            <span className="secretariat-empty-icon"><Building2 size={24} aria-hidden="true" /></span>
            <h3>Esta secretaria ainda não tem módulos cadastrados</h3>
            <p>Os módulos serão incluídos conforme os fluxos de trabalho forem definidos.</p>
          </div>}
        </section> : <section className="secretariat-section" aria-labelledby="secretariatTitle">
          <div className="section-heading">
            <div>
              <span className="section-kicker">ORGANIZAÇÃO MUNICIPAL</span>
              <h2 id="secretariatTitle">Secretarias municipais</h2>
            </div>
            <span className="section-hint">Selecione uma secretaria</span>
          </div>

          <div className="secretariat-grid">
            {secretariats.map(({ id, title, description, icon: Icon, tone }) => (
              <button
                key={id}
                className={`secretariat-card secretariat-card--${tone}`}
                type="button"
                aria-label={`Acessar secretaria: ${title}`}
                onClick={() => setSelectedSecretariatId(id)}
              >
                <span className="secretariat-card-icon"><Icon size={29} strokeWidth={1.8} aria-hidden="true" /></span>
                <span className="secretariat-card-title">{title}</span>
                <span className="secretariat-card-description">{description}</span>
                <span className="secretariat-card-action">Acessar secretaria <ArrowRight size={16} aria-hidden="true" /></span>
              </button>
            ))}
          </div>
        </section>}
      </div>
    </main>

    <footer className="dashboard-footer">
      <span>Inteligência Municipal</span>
      <span>Prefeitura de Pitangueiras–PR</span>
    </footer>
  </div>
}
