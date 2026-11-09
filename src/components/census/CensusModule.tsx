import { useState } from 'react'
import { ArrowLeft, ClipboardList, FileText, LayoutDashboard, LogOut, MapPinned, ShieldCheck, UsersRound } from 'lucide-react'
import './CensusModule.css'

type CensusSection = 'overview' | 'territory' | 'families' | 'forms'

type CensusModuleProps = {
  userEmail?: string
  onBack: () => void
  onLogout: () => void
}

const sections: { id: CensusSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'territory', label: 'Mapa territorial', icon: MapPinned },
  { id: 'families', label: 'Famílias e visitas', icon: UsersRound },
  { id: 'forms', label: 'Questionários', icon: FileText },
]

const sectionCopy: Record<CensusSection, { kicker: string; title: string; description: string }> = {
  overview: {
    kicker: 'GESTÃO TERRITORIAL',
    title: 'Censo Municipal',
    description: 'Estrutura inicial do módulo municipal de cadastro territorial, domiciliar e familiar.',
  },
  territory: {
    kicker: 'TERRITÓRIO',
    title: 'Mapa territorial',
    description: 'A base cartográfica será integrada após a análise do arquivo municipal.',
  },
  families: {
    kicker: 'TRABALHO DE CAMPO',
    title: 'Famílias e visitas',
    description: 'A estrutura para cadastro familiar e histórico de visitas será implementada nas próximas etapas.',
  },
  forms: {
    kicker: 'COLETA DE DADOS',
    title: 'Questionários',
    description: 'O questionário original foi recebido e será implementado fielmente em uma etapa posterior.',
  },
}

export function CensusModule({ userEmail, onBack, onLogout }: CensusModuleProps) {
  const [activeSection, setActiveSection] = useState<CensusSection>('overview')
  const copy = sectionCopy[activeSection]

  return <div className="census-shell">
    <aside className="census-sidebar" aria-label="Navegação do Censo Municipal">
      <div className="census-brand">
        <div className="census-brand-mark"><MapPinned size={20} /></div>
        <div><strong>Censo</strong><span>Municipal</span></div>
      </div>
      <div className="census-sidebar-label">GESTÃO MUNICIPAL</div>
      <nav className="census-nav" aria-label="Seções do Censo">
        {sections.map(({ id, label, icon: Icon }) => <button
          key={id}
          type="button"
          className={`census-nav-item${activeSection === id ? ' is-active' : ''}`}
          aria-current={activeSection === id ? 'page' : undefined}
          onClick={() => setActiveSection(id)}
        ><Icon size={18} /><span>{label}</span>{id !== 'overview' && <span className="census-nav-soon">Etapa seguinte</span>}</button>)}
      </nav>
      <div className="census-sidebar-bottom">
        <div className="census-security-note"><ShieldCheck size={17} /><span>Ambiente institucional</span></div>
        <button type="button" className="census-back-button" onClick={onBack}><ArrowLeft size={17} />Voltar ao Hall</button>
        <button type="button" className="census-logout-button" onClick={onLogout}><LogOut size={17} />Sair do sistema</button>
      </div>
    </aside>

    <main className="census-main">
      <header className="census-header">
        <div className="census-mobile-brand"><MapPinned size={19} /><span>Censo Municipal</span></div>
        <div className="census-header-user"><span className="census-user-avatar">{(userEmail?.[0] || 'U').toUpperCase()}</span><span>{userEmail || 'Usuário autenticado'}</span></div>
      </header>
      <div className="census-content">
        <section className="census-page-heading">
          <div><span className="census-kicker">{copy.kicker}</span><h1>{copy.title}</h1><p>{copy.description}</p></div>
          <span className="census-phase-badge">Estrutura inicial</span>
        </section>

        {activeSection === 'overview' && <section className="census-map-panel" aria-labelledby="census-map-title">
          <div className="census-map-panel-heading">
            <div><span className="census-kicker">VISÃO TERRITORIAL</span><h2 id="census-map-title">Mapa do município</h2></div>
            <span className="census-pending-badge">Base em preparação</span>
          </div>
          <div className="census-map-empty">
            <div className="census-map-empty-icon"><MapPinned size={30} /></div>
            <h3>A base cartográfica ainda não foi carregada</h3>
            <p>O mapa enviado será analisado antes da integração. Esta área não exibe lotes ou indicadores fictícios.</p>
            <div className="census-map-empty-status"><span />Aguardando análise do arquivo municipal</div>
          </div>
        </section>}

        {activeSection === 'territory' && <section className="census-placeholder-panel">
          <div className="census-placeholder-icon"><MapPinned size={22} /></div>
          <div><span className="census-kicker">PRÓXIMA ETAPA</span><h2>Preparação da base territorial</h2><p>Vamos verificar o formato, as camadas, os limites das zonas, os identificadores de lotes e o sistema de coordenadas antes de mostrar o mapa.</p></div>
        </section>}

        {activeSection === 'families' && <section className="census-placeholder-panel">
          <div className="census-placeholder-icon"><UsersRound size={22} /></div>
          <div><span className="census-kicker">PRÓXIMA ETAPA</span><h2>Cadastro e acompanhamento</h2><p>A estrutura deverá manter separados lote, edificação, domicílio, família e morador, com histórico de visitas e mudanças.</p></div>
        </section>}

        {activeSection === 'forms' && <section className="census-placeholder-panel">
          <div className="census-placeholder-icon"><ClipboardList size={22} /></div>
          <div><span className="census-kicker">QUESTIONÁRIO RECEBIDO</span><h2>Ficha domiciliar</h2><p>O formulário original será reproduzido sem acrescentar ou reformular perguntas. O preenchimento digital será implementado depois da estrutura territorial e das permissões.</p></div>
        </section>}

        <section className="census-next-steps">
          <div className="census-next-steps-heading"><span className="census-kicker">IMPLANTAÇÃO POR ETAPAS</span><h2>Próximos passos</h2></div>
          <div className="census-step-list">
            <article><span className="census-step-number">01</span><div><strong>Validar a base territorial</strong><p>Analisar o mapa e identificar zonas e lotes.</p></div><span className="census-step-state">Pendente</span></article>
            <article><span className="census-step-number">02</span><div><strong>Preparar cadastros e permissões</strong><p>Vincular usuários às zonas e proteger dados pessoais e de saúde.</p></div><span className="census-step-state">Pendente</span></article>
            <article><span className="census-step-number">03</span><div><strong>Implementar coleta e sincronização</strong><p>Integrar o questionário original, visitas e fluxo offline aprovado.</p></div><span className="census-step-state">Pendente</span></article>
          </div>
        </section>
      </div>
      <footer className="census-footer"><span>Inteligência Municipal · Prefeitura de Pitangueiras–PR</span><span>{userEmail || 'Acesso institucional'}</span></footer>
    </main>
  </div>
}
