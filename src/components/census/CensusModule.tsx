import { useState } from 'react'
import { ArrowLeft, ClipboardList, FileText, LayoutDashboard, LogOut, MapPinned, ShieldCheck, UsersRound } from 'lucide-react'
import '../FleetModule.css'
import './CensusModule.css'

type CensusSection = 'overview' | 'territory' | 'families' | 'forms' | 'zones'

type CensusModuleProps = {
  userEmail?: string
  onBack: () => void
  onLogout: () => void
}

const navItems: { id: CensusSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'territory', label: 'Mapa territorial', icon: MapPinned },
  { id: 'families', label: 'Famílias e visitas', icon: UsersRound },
  { id: 'forms', label: 'Questionários', icon: FileText },
  { id: 'zones', label: 'Zonas e ACS', icon: ClipboardList },
]

const sectionCopy: Record<CensusSection, { kicker: string; title: string; description: string }> = {
  overview: {
    kicker: 'GESTÃO TERRITORIAL',
    title: 'Visão geral do Censo',
    description: 'Estrutura municipal de cadastro territorial, domiciliar e familiar.',
  },
  territory: {
    kicker: 'TERRITÓRIO',
    title: 'Mapa territorial',
    description: 'A base cartográfica será integrada após a análise do arquivo municipal.',
  },
  families: {
    kicker: 'TRABALHO DE CAMPO',
    title: 'Famílias e visitas',
    description: 'Estrutura para cadastro familiar, coleta e histórico de visitas.',
  },
  forms: {
    kicker: 'COLETA DE DADOS',
    title: 'Questionários',
    description: 'O questionário original foi recebido e será reproduzido fielmente.',
  },
  zones: {
    kicker: 'ORGANIZAÇÃO TERRITORIAL',
    title: 'Zonas e ACS',
    description: 'Vínculos entre agentes e zonas serão integrados à central de contas.',
  },
}

const nextSteps = [
  { number: '01', title: 'Analisar o mapa municipal', description: 'Identificar formato, camadas, zonas e lotes.' },
  { number: '02', title: 'Preparar cadastros e permissões', description: 'Vincular usuários às zonas e aplicar acesso seguro.' },
  { number: '03', title: 'Implementar a coleta', description: 'Integrar visitas, questionário original e fluxo offline aprovado.' },
]

export function CensusModule({ userEmail, onBack, onLogout }: CensusModuleProps) {
  const [view, setView] = useState<CensusSection>('overview')
  const copy = sectionCopy[view]

  return <div className="fleet-shell census-shell">
    <aside className="fleet-sidebar">
      <div className="fleet-sidebar-top">
        <button className="fleet-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Voltar ao painel</button>
        <div className="fleet-brand"><span className="fleet-brand-icon"><MapPinned size={20} /></span><div><strong>Censo Municipal</strong><small>Inteligência Municipal</small></div></div>
      </div>
      <div className="fleet-section-label">GESTÃO TERRITORIAL</div>
      <nav className="fleet-nav" aria-label="Navegação do Censo Municipal">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`fleet-nav-item${view === id ? ' active' : ''}`} aria-current={view === id ? 'page' : undefined} onClick={() => setView(id)}><Icon size={17} />{label}</button>)}
        <button type="button" className="fleet-nav-item fleet-mobile-logout" onClick={onLogout}><LogOut size={17} />Sair</button>
      </nav>
      <div className="fleet-sidebar-bottom">
        <div className="fleet-user-chip"><span className="fleet-user-avatar">{(userEmail?.[0] || 'U').toUpperCase()}</span><div><strong>{userEmail || 'Usuário autenticado'}</strong><small>Censo Municipal · estrutura inicial</small></div></div>
        <button type="button" className="fleet-logout" onClick={onLogout}><LogOut size={16} /> Sair do sistema</button>
      </div>
    </aside>

    <main className="fleet-main census-main">
      <header className="fleet-header">
        <div><p className="fleet-kicker">MÓDULO MUNICIPAL</p><h1>{copy.title}</h1></div>
        <div className="fleet-header-actions"><span className="fleet-protected"><ShieldCheck size={16} /> Estrutura inicial</span></div>
      </header>
      <div className="fleet-content census-content">
        {view === 'overview' ? <>
          <section className="fleet-hero census-hero">
            <div><span className="fleet-hero-kicker">{copy.kicker}</span><h2>Conheça o território, acompanhe as famílias.</h2><p>{copy.description} O módulo está integrado à Inteligência Municipal e será desenvolvido por etapas.</p></div>
            <div className="fleet-hero-mark"><MapPinned size={34} /></div>
          </section>
          <section className="fleet-section">
            <div className="fleet-section-heading"><div><span className="fleet-kicker">VISÃO TERRITORIAL</span><h2>Mapa do município</h2></div><span className="fleet-period">Base em preparação</span></div>
            <div className="fleet-panel census-map-stage">
              <span className="census-map-icon"><MapPinned size={25} /></span>
              <strong>A base cartográfica ainda não foi carregada</strong>
              <p>O mapa enviado será analisado antes da integração. Esta área não exibe lotes, zonas ou indicadores fictícios.</p>
              <span className="census-map-status"><i />Aguardando análise do arquivo municipal</span>
            </div>
          </section>
          <section className="fleet-section census-next-section">
            <div className="fleet-section-heading"><div><span className="fleet-kicker">IMPLANTAÇÃO POR ETAPAS</span><h2>Próximos passos</h2></div></div>
            <div className="fleet-settings-grid census-next-grid">{nextSteps.map((step) => <article key={step.number}><span className="census-step-number">{step.number}</span><div><strong>{step.title}</strong><p>{step.description}</p><small>Aguardando etapa</small></div></article>)}</div>
          </section>
        </> : <section className="fleet-section fleet-page-section">
          <div className="fleet-page-heading"><div><span className="fleet-kicker">{copy.kicker}</span><h2>{copy.title}</h2><p>{copy.description}</p></div></div>
          {view === 'territory' ? <div className="fleet-panel census-map-stage census-map-stage-compact"><span className="census-map-icon"><MapPinned size={25} /></span><strong>Base cartográfica em preparação</strong><p>O mapa será exibido aqui após a análise do arquivo municipal e validação da estrutura territorial.</p></div> : <div className="fleet-resource-placeholder census-coming-soon"><span className="fleet-resource-icon">{view === 'families' ? <UsersRound size={21} /> : view === 'forms' ? <FileText size={21} /> : <ClipboardList size={21} />}</span><strong>Estrutura em preparação</strong><span>{copy.description}</span><small>Nenhum cadastro ou dado de demonstração é exibido nesta etapa.</small></div>}
        </section>}
      </div>
    </main>
  </div>
}
