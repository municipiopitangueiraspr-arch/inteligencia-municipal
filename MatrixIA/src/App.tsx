import { useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Building2, CalendarDays,
  Check, ChevronDown, CircleHelp, Command, LayoutDashboard, MapPin, Menu, Search,
  Settings2, ShieldCheck, Sparkles, X,
} from 'lucide-react';
import { departments, highlights, lastUpdated, priorities, type Department } from './data/mockData';

type View = 'overview' | 'departments';

function App() {
  const [view, setView] = useState<View>('overview');
  const [selectedDepartment, setSelectedDepartment] = useState<Department | null>(null);
  const [period, setPeriod] = useState('Este mês');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const statusCounts = useMemo(() => ({
    okay: departments.filter((department) => department.status === 'Em dia').length,
    attention: departments.filter((department) => department.status === 'Atenção').length,
    critical: departments.filter((department) => department.status === 'Crítico').length,
  }), []);

  const openDepartment = (department: Department) => {
    setSelectedDepartment(department);
    setView('departments');
    setMobileMenuOpen(false);
  };

  const closeDepartment = () => setSelectedDepartment(null);

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true"><span /><span /><span /></div>
          <div className="brand-text"><strong>Matrix<span>IA</span></strong><small>INTELIGÊNCIA MUNICIPAL</small></div>
          <button className="icon-button sidebar-close" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)}><X size={18} /></button>
        </div>

        <button className="municipality-switch" aria-label="Município selecionado">
          <span className="municipality-symbol"><Building2 size={17} /></span>
          <span className="municipality-copy"><strong>Pitangueiras</strong><small>Paraná · Município piloto</small></span>
          <ChevronDown size={15} className="muted-icon" />
        </button>

        <div className="nav-label">GESTÃO MUNICIPAL</div>
        <nav className="main-nav" aria-label="Navegação principal">
          <button className={`nav-item ${view === 'overview' ? 'active' : ''}`} onClick={() => { setView('overview'); closeDepartment(); setMobileMenuOpen(false); }}>
            <LayoutDashboard size={18} /><span>Visão do prefeito</span><span className="nav-active-dot" />
          </button>
          <button className={`nav-item ${view === 'departments' ? 'active' : ''}`} onClick={() => { setView('departments'); closeDepartment(); setMobileMenuOpen(false); }}>
            <Building2 size={18} /><span>Secretarias</span><span className="nav-count">11</span>
          </button>
          <button className="nav-item" onClick={() => setNoticeOpen(true)}><Activity size={18} /><span>Indicadores</span><span className="nav-soon">em breve</span></button>
          <button className="nav-item" onClick={() => setNoticeOpen(true)}><CalendarDays size={18} /><span>Agenda municipal</span></button>
        </nav>

        <div className="nav-label nav-label-spaced">ACESSO RÁPIDO</div>
        <div className="quick-departments">
          {departments.slice(0, 5).map((department) => (
            <button key={department.name} className="quick-link" onClick={() => openDepartment(department)}>
              <span className={`quick-dot ${department.status === 'Atenção' ? 'dot-amber' : department.status === 'Crítico' ? 'dot-red' : ''}`} />
              <span>{department.shortName}</span>
            </button>
          ))}
          <button className="all-departments" onClick={() => { setView('departments'); setSelectedDepartment(null); }}>Ver as 11 secretarias <ArrowRight size={14} /></button>
        </div>

        <div className="sidebar-bottom">
          <div className="ai-card">
            <div className="ai-card-heading"><Sparkles size={15} /><span>Inteligência em construção</span></div>
            <p>Esta é a base para uma prefeitura conectada. A IA vem depois, com dados confiáveis.</p>
            <span className="ai-card-status"><span /> Preparando a plataforma</span>
          </div>
          <button className="nav-item secondary-nav" onClick={() => setNoticeOpen(true)}><CircleHelp size={18} /><span>Ajuda e orientações</span></button>
          <div className="profile-card">
            <div className="avatar">HM</div><div className="profile-copy"><strong>Hugo Machado</strong><small>Visão demonstrativa · Prefeito</small></div><Settings2 size={16} className="profile-settings" />
          </div>
        </div>
      </aside>

      {mobileMenuOpen && <button className="mobile-scrim" aria-label="Fechar menu" onClick={() => setMobileMenuOpen(false)} />}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button className="icon-button mobile-menu-button" aria-label="Abrir menu" onClick={() => setMobileMenuOpen(true)}><Menu size={20} /></button>
            <div className="breadcrumb"><span>Prefeitura</span><span className="crumb-slash">/</span><strong>{selectedDepartment?.shortName ?? (view === 'overview' ? 'Visão do prefeito' : 'Secretarias')}</strong></div>
          </div>
          <div className="topbar-actions">
            <div className="demo-pill"><span /> AMBIENTE DE DEMONSTRAÇÃO</div>
            <button className="icon-button search-button" aria-label="Pesquisar" onClick={() => setSearchOpen(!searchOpen)}><Search size={18} /></button>
            <button className="icon-button notification-button" aria-label="Notificações" onClick={() => setNoticeOpen(true)}><Bell size={18} /><i /></button>
            <div className="topbar-divider" />
            <button className="help-button" onClick={() => setNoticeOpen(true)}><CircleHelp size={17} /><span>Ajuda</span></button>
          </div>
        </header>

        {searchOpen && <div className="search-popover"><Search size={17} /><input autoFocus placeholder="Buscar secretaria ou assunto..." onKeyDown={(event) => { if (event.key === 'Escape') setSearchOpen(false); }} /><button aria-label="Fechar busca" onClick={() => setSearchOpen(false)}><X size={16} /></button></div>}

        <div className="content-wrap">
          {view === 'overview' && !selectedDepartment ? (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow"><span className="eyebrow-line" /> QUINTA-FEIRA, 20 DE NOVEMBRO DE 2026</div>
                  <h1>Bom dia, Hugo.</h1>
                  <p className="welcome-subtitle">Aqui está o que está acontecendo na sua prefeitura.</p>
                </div>
                <div className="welcome-actions">
                  <label className="period-select"><CalendarDays size={15} /><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período"><option>Este mês</option><option>Últimos 30 dias</option><option>Este ano</option></select><ChevronDown size={14} /></label>
                  <button className="outline-button" onClick={() => setNoticeOpen(true)}><Command size={15} /><span>Resumo executivo</span></button>
                </div>
              </section>

              <section className="executive-banner">
                <div className="banner-orbit orbit-one" /><div className="banner-orbit orbit-two" /><div className="banner-orbit orbit-three" />
                <div className="banner-copy">
                  <div className="banner-kicker"><span className="live-dot" /> PANORAMA DO MUNICÍPIO <span className="banner-separator">·</span> NOVEMBRO</div>
                  <h2>A cidade está avançando.<br /><span>Há 3 pontos que merecem atenção.</span></h2>
                  <p>8 das 11 secretarias estão com as atividades em dia. Veja onde sua atenção pode fazer a diferença hoje.</p>
                  <button className="banner-button" onClick={() => document.getElementById('priorities')?.scrollIntoView({ behavior: 'smooth' })}>Ver prioridades <ArrowRight size={15} /></button>
                </div>
                <div className="banner-side">
                  <div className="status-ring" aria-label="Oito secretarias em dia"><div><strong>8</strong><small>de 11 em dia</small></div></div>
                  <div className="banner-status-list"><span><i className="status-dot green" />Em dia <b>{statusCounts.okay}</b></span><span><i className="status-dot amber" />Atenção <b>{statusCounts.attention}</b></span><span><i className="status-dot red" />Crítico <b>{statusCounts.critical}</b></span></div>
                </div>
              </section>

              <section className="metrics-grid" aria-label="Resumo do município">
                {highlights.map((item, index) => <article className="metric-card" key={item.label}>
                  <div className="metric-top"><span className="metric-label">{item.label}</span><span className={`metric-icon metric-icon-${item.tone}`}>{index === 0 ? <Check size={16} /> : index === 1 ? <Activity size={16} /> : <ArrowUpRight size={16} />}</span></div>
                  <div className="metric-value-row"><strong>{item.value}</strong><span className={`metric-change ${item.tone}`}>{item.tone === 'amber' ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />}{item.change}</span></div>
                  <div className="metric-bottom"><span>{item.helper}</span><div className={`sparkline sparkline-${item.tone}`} aria-hidden="true">{item.points.map((point, i) => <i key={i} style={{ height: `${point}%` }} />)}</div></div>
                </article>)}
              </section>

              <section className="dashboard-grid">
                <div className="priority-panel" id="priorities">
                  <div className="section-heading"><div><div className="section-eyebrow">PARA ACOMPANHAR</div><h2>O que pede atenção</h2></div><span className="priority-counter">03 <span>pontos</span></span></div>
                  <div className="priority-list">
                    {priorities.map((priority, index) => <article className="priority-item" key={priority.title}>
                      <div className={`priority-marker priority-marker-${index}`}><span /></div>
                      <div className="priority-content"><div className="priority-meta"><span className={`priority-tag priority-tag-${index}`}>{priority.level}</span><span>{priority.time}</span></div><h3>{priority.title}</h3><p>{priority.description}</p><button onClick={() => openDepartment(departments.find((department) => department.name === priority.department)!)}>{priority.department}<ArrowRight size={13} /></button></div>
                    </article>)}
                  </div>
                  <button className="panel-footer-link" onClick={() => setNoticeOpen(true)}>Ver todos os acompanhamentos <ArrowRight size={15} /></button>
                </div>

                <aside className="narrative-panel">
                  <div className="narrative-topline"><Sparkles size={15} /><span>EM POUCAS PALAVRAS</span></div>
                  <h2>Um município que cuida e segue em frente.</h2>
                  <p>Os atendimentos cresceram neste mês e a maioria das áreas mantém o ritmo. O próximo passo é ajudar Saúde e Agricultura a dar retorno às pessoas que estão esperando.</p>
                  <div className="narrative-divider" />
                  <div className="narrative-source"><ShieldCheck size={15} /><span>Resumo baseado nos dados demonstrativos</span></div>
                  <button className="narrative-link" onClick={() => setNoticeOpen(true)}>Como ler este resumo <ArrowRight size={14} /></button>
                </aside>
              </section>

              <section className="departments-section">
                <div className="section-heading departments-heading"><div><div className="section-eyebrow">UMA PREFEITURA, MUITAS FRENTES</div><h2>Panorama das secretarias <span className="section-count">11</span></h2></div><button className="text-link" onClick={() => { setView('departments'); setSelectedDepartment(null); }}>Ver todas <ArrowRight size={15} /></button></div>
                <div className="department-grid">{departments.slice(0, 6).map((department) => <DepartmentCard key={department.name} department={department} onClick={() => openDepartment(department)} />)}</div>
              </section>

              <footer className="page-footer"><span><MapPin size={14} /> Pitangueiras, Paraná</span><span>Atualizado {lastUpdated} <i /></span></footer>
            </>
          ) : selectedDepartment ? (
            <DepartmentDetail department={selectedDepartment} onBack={() => { setSelectedDepartment(null); setView('departments'); }} />
          ) : (
            <section className="all-departments-page">
              <div className="eyebrow"><span className="eyebrow-line" /> VISÃO INTEGRADA</div><div className="all-title-row"><div><h1>As secretarias</h1><p className="welcome-subtitle">Um panorama simples do trabalho em cada área.</p></div><span className="total-count">11 áreas</span></div>
              <div className="directory-summary"><div className="directory-summary-icon"><Building2 size={20} /></div><div><strong>Uma única prefeitura, trabalhando em conjunto.</strong><p>Escolha uma secretaria para ver um resumo demonstrativo da sua área.</p></div></div>
              <div className="directory-grid">{departments.map((department) => <DepartmentCard key={department.name} department={department} onClick={() => openDepartment(department)} />)}</div>
              <footer className="page-footer"><span><MapPin size={14} /> Pitangueiras, Paraná</span><span>Dados demonstrativos <i /></span></footer>
            </section>
          )}
        </div>
      </main>

      {noticeOpen && <div className="modal-backdrop" role="presentation" onClick={() => setNoticeOpen(false)}><section className="notice-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onClick={(event) => event.stopPropagation()}><button className="icon-button modal-close" onClick={() => setNoticeOpen(false)} aria-label="Fechar"><X size={18} /></button><div className="modal-icon"><Sparkles size={21} /></div><div className="section-eyebrow">PROTÓTIPO EM CONSTRUÇÃO</div><h2 id="modal-title">Esta função vem depois.</h2><p>Este painel é uma demonstração visual com dados fictícios. Login, indicadores reais, relatórios e integrações serão definidos em etapas futuras.</p><button className="modal-action" onClick={() => setNoticeOpen(false)}>Entendi</button></section></div>}
    </div>
  );
}

function DepartmentCard({ department, onClick }: { department: Department; onClick: () => void }) {
  const statusClass = department.status === 'Em dia' ? 'okay' : department.status === 'Atenção' ? 'attention' : 'critical';
  return <button className="department-card" onClick={onClick}>
    <div className="department-card-top"><span className="department-monogram">{department.icon}</span><span className={`status-label status-${statusClass}`}><i />{department.status}</span></div>
    <span className="department-area">{department.area}</span><h3>{department.name}</h3><p>{department.summary}</p>
    <div className="department-card-bottom"><strong>{department.metric}</strong><span>{department.metricLabel}</span><ArrowRight size={15} /></div>
  </button>;
}

function DepartmentDetail({ department, onBack }: { department: Department; onBack: () => void }) {
  return <section className="department-detail">
    <button className="back-link" onClick={onBack}><ArrowRight className="back-arrow" size={15} /> Todas as secretarias</button>
    <div className="eyebrow"><span className="eyebrow-line" /> RESUMO DEMONSTRATIVO DA ÁREA</div>
    <div className="detail-heading"><div><span className="department-monogram detail-monogram">{department.icon}</span><div className="detail-area">{department.area}</div><h1>{department.name}</h1><p className="welcome-subtitle">{department.summary}</p></div><span className={`status-label status-${department.status === 'Em dia' ? 'okay' : department.status === 'Atenção' ? 'attention' : 'critical'}`}><i />{department.status}</span></div>
    <div className="detail-metric-card"><span>Indicador demonstrativo</span><strong>{department.metric}</strong><p>{department.metricLabel}</p><small>{department.trend}</small></div>
    <div className="directory-summary detail-explainer"><div className="directory-summary-icon"><ShieldCheck size={20} /></div><div><strong>O que o prefeito precisa saber</strong><p>Este espaço resume a situação da área em linguagem simples. Os módulos operacionais e permissões específicas de cada secretaria serão construídos em etapas posteriores.</p></div></div>
    <div className="detail-next"><span className="section-eyebrow">PRÓXIMOS PASSOS DO PROTÓTIPO</span><h2>Uma visão clara para decidir melhor.</h2><p>Quando os módulos forem conectados, este resumo poderá indicar tendências, pendências e onde uma decisão da gestão pode ajudar — sem substituir o trabalho da equipe técnica.</p></div>
  </section>;
}

export default App;
