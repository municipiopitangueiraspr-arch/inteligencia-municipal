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
  { id: 'administration', title: 'Administração e Finanças', icon: Landmark },
  { id: 'agriculture', title: 'Agricultura e Meio Ambiente', icon: Sprout },
  { id: 'social', title: 'Assistência Social', icon: HeartHandshake },
  { id: 'culture', title: 'Cultura e Turismo', icon: Compass },
  { id: 'development', title: 'Desenvolvimento Econômico', icon: TrendingUp },
  { id: 'education', title: 'Educação', icon: GraduationCap },
  { id: 'sports', title: 'Esporte e Lazer', icon: Dumbbell },
  { id: 'works', title: 'Obras, Planejamento e Urbanismo', icon: Construction },
  { id: 'health', title: 'Saúde', icon: HeartPulse },
  { id: 'security', title: 'Segurança Pública e Trânsito', icon: ShieldCheck },
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

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div className="dashboard-brand">
            <span className="dashboard-brand-mark">
              <img src={`${assetBase}assets/brasao-pref.png`} alt="" />
            </span>
            <span className="dashboard-brand-copy">
              <strong>Inteligência Municipal</strong>
            </span>
          </div>
          <div className="dashboard-account">
            <span className="user-avatar" aria-hidden="true">{(userEmail?.[0] || 'U').toUpperCase()}</span>
            <span className="user-details">
              <strong>{userEmail || 'Usuário institucional'}</strong>
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
          {selectedSecretariat ? (
            <section className="department-view" aria-labelledby="departmentTitle">
              <button className="secretariat-back-button" type="button" onClick={() => setSelectedSecretariatId(null)}>
                <ArrowLeft size={17} aria-hidden="true" />
                Secretarias
              </button>

              <div className="department-heading">
                <span className="department-heading-icon" aria-hidden="true">
                  <selectedSecretariat.icon size={30} strokeWidth={1.8} />
                </span>
                <div>
                  <h1 id="departmentTitle">{selectedSecretariat.title}</h1>
                  <p>Escolha um módulo para continuar.</p>
                </div>
              </div>

              {visibleModules.length > 0 ? (
                <div className="module-grid" aria-label={`Módulos de ${selectedSecretariat.title}`}>
                  {visibleModules.map(({ id, title, description, icon: Icon, status, tone, available }) => (
                    <button
                      key={id}
                      className={`module-card module-card--${tone}`}
                      type="button"
                      disabled={!available}
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
                </div>
              ) : (
                <div className="secretariat-empty" role="status">
                  <span className="secretariat-empty-icon"><Building2 size={24} aria-hidden="true" /></span>
                  <h2>Nenhum módulo disponível ainda</h2>
                  <p>Os módulos desta secretaria serão adicionados conforme os fluxos forem definidos.</p>
                </div>
              )}
            </section>
          ) : (
            <section className="secretariat-section" aria-labelledby="secretariatTitle">
              <div className="hall-heading">
                <h1 id="secretariatTitle">Secretarias</h1>
                <p>Escolha uma secretaria para acessar seus módulos.</p>
              </div>

              <div className="secretariat-grid">
                {secretariats.map(({ id, title, icon: Icon }) => (
                  <button
                    key={id}
                    className="secretariat-card"
                    type="button"
                    aria-label={`Abrir ${title}`}
                    onClick={() => setSelectedSecretariatId(id)}
                  >
                    <span className="secretariat-card-icon"><Icon size={25} strokeWidth={1.9} aria-hidden="true" /></span>
                    <span className="secretariat-card-title">{title}</span>
                    <span className="secretariat-card-action" aria-hidden="true"><ArrowRight size={18} /></span>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
