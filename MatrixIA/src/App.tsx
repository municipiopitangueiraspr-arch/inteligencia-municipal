import { useMemo, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleHelp,
  Command,
  FilePlus2,
  LogOut,
  LayoutDashboard,
  MapPin,
  Menu,
  Search,
  ShieldCheck,
  Sparkles,
  Wallet,
  X,
} from "lucide-react";
import AccessScreen from "./components/AccessScreen";
import DataOriginDialog from "./components/DataOriginDialog";
import OperationalWorkspace, {
  type Experience,
} from "./components/OperationalWorkspace";
import RequestCenter from "./components/RequestCenter";
import { dataLineage, simulatedTransportRecords } from "./data/dataLineage";
import {
  createHistoryEntry,
  getDepartmentRequestCounts,
  getRequestCounts,
  initialMunicipalRequests,
  nextProtocolNumber,
  type MunicipalRequest,
  type RequestStatus,
} from "./data/requests";
import {
  departments,
  financialPosition,
  lastUpdated,
  municipalityProfile,
  municipalitySnapshot,
  priorities,
  type Department,
  type Priority,
} from "./data/mockData";
import {
  initialHealthTerritory,
  type HealthTerritoryDataset,
} from "./data/healthTerritory";
import {
  initialHealthActivities,
  type HealthActivitiesDataset,
} from "./data/healthActivities";
import {
  getHealthReferralSummary,
  initialHealthReferrals,
  type HealthReferralsDataset,
} from "./data/healthReferrals";
import {
  initialPeopleRegistry,
  type PeopleRegistryDataset,
} from "./data/peopleRegistry";

type View = "overview" | "departments" | "requests";
type NoticeMode = "executive" | "help" | "notifications";

type MetricCard = {
  label: string;
  value: string;
  change: string;
  helper: string;
  tone: "green" | "amber" | "red" | "blue";
  icon: "requests" | "finance" | "departments" | "transport";
};

const formatMillions = (value: number) =>
  `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 })} mi`;

const formatPercent = (value: number) =>
  `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;

function App() {
  const [experience, setExperience] = useState<Experience | null>(null);
  const [requests, setRequests] = useState<MunicipalRequest[]>(
    initialMunicipalRequests,
  );
  const [healthTerritory, setHealthTerritory] =
    useState<HealthTerritoryDataset>(initialHealthTerritory);
  const [healthActivities, setHealthActivities] =
    useState<HealthActivitiesDataset>(initialHealthActivities);
  const [healthReferrals, setHealthReferrals] =
    useState<HealthReferralsDataset>(initialHealthReferrals);
  const [peopleRegistry, setPeopleRegistry] = useState<PeopleRegistryDataset>(
    initialPeopleRegistry,
  );
  const [sourceOpen, setSourceOpen] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [selectedDepartment, setSelectedDepartment] =
    useState<Department | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [noticeMode, setNoticeMode] = useState<NoticeMode>("executive");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAllPriorities, setShowAllPriorities] = useState(false);

  const clinicalReferralSummary = useMemo(
    () => getHealthReferralSummary(healthReferrals.referrals),
    [healthReferrals.referrals],
  );

  const referralAwarePriorities = useMemo(
    () =>
      priorities.flatMap((priority) => {
        if (priority.sourceId !== "clinical-referrals") return [priority];
        if (clinicalReferralSummary.waiting === 0) return [];
        const waitingText =
          clinicalReferralSummary.waitingOver60Days > 0
            ? `${clinicalReferralSummary.waitingOver60Days} encaminhamentos aguardam consulta especializada há mais de 60 dias`
            : `${clinicalReferralSummary.waiting} encaminhamentos aguardam consulta especializada`;
        return [
          {
            ...priority,
            title: waitingText,
            description: `São ${clinicalReferralSummary.waiting} encaminhamentos clínicos em situação aguardando vaga. A fila é separada das solicitações administrativas municipais.`,
            action:
              clinicalReferralSummary.waitingOver60Days > 0
                ? `Revisar os ${clinicalReferralSummary.waitingOver60Days} casos com maior tempo de espera e confirmar ofertas regionais.`
                : "Acompanhar a fila e confirmar ofertas de vagas com a regulação regional.",
            impact: `${clinicalReferralSummary.waiting} encaminhamentos clínicos em acompanhamento`,
            reference: "Situação derivada dos encaminhamentos demonstrativos em memória",
          },
        ];
      }),
    [clinicalReferralSummary],
  );

  const departmentsWithRequestCounts = useMemo(
    () =>
      departments.map((department) => {
        const counts = getDepartmentRequestCounts(requests, department.name);
        const referralAwareDepartment =
          department.name === "Saúde e Vigilância Sanitária"
            ? {
                ...department,
                status:
                  clinicalReferralSummary.waiting > 0
                    ? ("Atenção" as const)
                    : ("Em dia" as const),
                summary:
                  clinicalReferralSummary.waitingOver60Days > 0
                    ? `${clinicalReferralSummary.waitingOver60Days} encaminhamentos aguardam consulta especializada há mais de 60 dias.`
                    : `${clinicalReferralSummary.waiting} encaminhamentos aguardam vaga para consulta especializada.`,
                metric: String(clinicalReferralSummary.waitingOver60Days),
                metricLabel: "encaminhamentos na fila há mais de 60 dias",
                trend: `${clinicalReferralSummary.waiting} encaminhamentos clínicos aguardam vaga`,
                nextAction:
                  clinicalReferralSummary.waitingOver60Days > 0
                    ? `Revisar os ${clinicalReferralSummary.waitingOver60Days} encaminhamentos com maior tempo de espera e confirmar novas vagas.`
                    : "Acompanhar a fila clínica e registrar as próximas ofertas de vaga.",
              }
            : department;
        return {
          ...referralAwareDepartment,
          openRequests: counts.open,
          overdueRequests: counts.overdue,
        };
      }),
    [clinicalReferralSummary, requests],
  );

  const statusCounts = useMemo(
    () => ({
      okay: departmentsWithRequestCounts.filter(
        (department) => department.status === "Em dia",
      ).length,
      attention: departmentsWithRequestCounts.filter(
        (department) => department.status === "Atenção",
      ).length,
      critical: departmentsWithRequestCounts.filter(
        (department) => department.status === "Crítico",
      ).length,
    }),
    [departmentsWithRequestCounts],
  );

  const requestTotals = useMemo(() => getRequestCounts(requests), [requests]);

  const requestMonthlyDifference =
    municipalitySnapshot.previousMonthOpenRequests - requestTotals.open;
  const requestMonthlyComparison =
    requestMonthlyDifference >= 0
      ? `${requestMonthlyDifference} a menos que em 31/out`
      : `${Math.abs(requestMonthlyDifference)} a mais que em 31/out`;

  const revenueToDatePercent =
    (financialPosition.revenueReceivedMillions /
      financialPosition.revenuePlannedThroughOctoberMillions) *
    100;
  const revenueGapMillions =
    financialPosition.revenuePlannedThroughOctoberMillions -
    financialPosition.revenueReceivedMillions;
  const revenueOfAnnualBudgetPercent =
    (financialPosition.revenueReceivedMillions /
      financialPosition.annualBudgetMillions) *
    100;
  const committedPercent =
    (financialPosition.expenditureCommittedMillions /
      financialPosition.annualBudgetMillions) *
    100;
  const paidPercent =
    (financialPosition.expenditurePaidMillions /
      financialPosition.annualBudgetMillions) *
    100;

  const metricCards: MetricCard[] = [
    {
      label: "Solicitações administrativas em aberto",
      value: requestTotals.open.toString(),
      change: `${requestTotals.overdue} fora do prazo`,
      helper: `Central das 11 secretarias · ${requestMonthlyComparison}`,
      tone: "amber",
      icon: "requests",
    },
    {
      label: "Receita recebida · fechamento 31/out",
      value: formatMillions(financialPosition.revenueReceivedMillions),
      change: `${formatPercent(revenueToDatePercent)} do previsto até out.`,
      helper: `Posição encerrada em 31/out · ${formatMillions(revenueGapMillions)} abaixo do previsto`,
      tone: "amber",
      icon: "finance",
    },
    {
      label: "Secretarias sem pendência crítica",
      value: `${statusCounts.okay} de ${departments.length}`,
      change: `${statusCounts.attention} em atenção · ${statusCounts.critical} crítica`,
      helper: "Situação calculada a partir das filas demonstrativas",
      tone: "green",
      icon: "departments",
    },
    {
      label: "Transporte escolar em contingência",
      value: `${municipalitySnapshot.studentsAffectedByTransportChange} alunos`,
      change: `${municipalitySnapshot.schoolBusesTotal - municipalitySnapshot.schoolBusesAvailable} de ${municipalitySnapshot.schoolBusesTotal} veículos indisponíveis`,
      helper: `Rota vinculada ao veículo ${simulatedTransportRecords.maintenanceOrder.vehicleId} e à ordem de manutenção`,
      tone: "red",
      icon: "transport",
    },
  ];

  const openDepartment = (department: Department) => {
    setSelectedDepartment(department);
    setView("departments");
    setMobileMenuOpen(false);
  };

  const createMunicipalRequest = (
    input: Omit<
      MunicipalRequest,
      | "id"
      | "protocol"
      | "createdAt"
      | "dueAt"
      | "status"
      | "assignedTo"
      | "history"
      | "simulated"
    > & { createdBy: string },
  ) => {
    const now = new Date();
    const dueAt = new Date(now);
    dueAt.setDate(dueAt.getDate() + 5);
    const protocol = nextProtocolNumber(requests);
    const { createdBy, ...requestFields } = input;
    const request: MunicipalRequest = {
      ...requestFields,
      id: `SIM-${protocol}`,
      protocol,
      createdAt: now.toISOString(),
      dueAt: dueAt.toISOString(),
      status: "Recebida",
      assignedTo: "Triagem da secretaria",
      simulated: true,
      history: [
        {
          id: `SIM-${protocol}-H01`,
          at: now.toISOString(),
          actor: createdBy,
          status: "Recebida",
          note: "Demanda cadastrada e encaminhada para triagem da secretaria responsável.",
          assignedTo: "Triagem da secretaria",
        },
      ],
    };
    setRequests((previous) => [request, ...previous]);
    return request;
  };

  const updateMunicipalRequest = (
    id: string,
    update: { status: RequestStatus; assignedTo: string; note: string },
    actor: string,
  ) => {
    setRequests((previous) =>
      previous.map((request) => {
        if (request.id !== id) return request;
        const historyEntry = createHistoryEntry(request, {
          ...update,
          actor,
          previousAssignee: request.assignedTo,
        });
        return {
          ...request,
          status: update.status,
          assignedTo: update.assignedTo,
          history: [...request.history, historyEntry],
        };
      }),
    );
  };

  const closeDepartment = () => setSelectedDepartment(null);

  const openNotice = (mode: NoticeMode) => {
    setNoticeMode(mode);
    setNoticeOpen(true);
  };

  const closeNotice = () => {
    setNoticeOpen(false);
    if (noticeMode === "notifications") {
      document
        .getElementById("priorities")
        ?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const openPriorityDepartment = (priority: Priority) => {
    const department = departmentsWithRequestCounts.find(
      (item) => item.name === priority.department,
    );
    if (department) openDepartment(department);
  };

  const visiblePriorities = showAllPriorities
    ? referralAwarePriorities
    : referralAwarePriorities.slice(0, 3);
  const searchResults = searchQuery.trim()
    ? departmentsWithRequestCounts.filter((department) =>
        `${department.name} ${department.summary} ${department.area}`
          .toLocaleLowerCase("pt-BR")
          .includes(searchQuery.trim().toLocaleLowerCase("pt-BR")),
      )
    : [];
  const noticeContent = {
    executive: {
      eyebrow: "RESUMO EXECUTIVO · DADOS SIMULADOS",
      title: "O que merece decisão hoje",
      body: `${requestTotals.open} solicitações administrativas estão abertas, ${requestTotals.overdue} fora do prazo. ${statusCounts.critical} secretaria está em estado crítico e ${statusCounts.attention} em atenção. Rota escolar, fila clínica e ordens de Obras têm origem e regra de cálculo nos detalhes.`,
      action: "Voltar à visão do município",
    },
    notifications: {
      eyebrow: "ACOMPANHAMENTOS DO MUNICÍPIO · SIMULADOS",
      title: `${referralAwarePriorities.length} pontos com próximo passo definido`,
      body: referralAwarePriorities
        .map(
          (priority) =>
            `${priority.level}: ${priority.title} — próximo passo: ${priority.action}`,
        )
        .join(" "),
      action: "Ver prioridades no painel",
    },
    help: {
      eyebrow: "GUIA RÁPIDO MATRIXIA",
      title: "Como ler esta visão",
      body: "Comece pelas prioridades; abra ‘Origem e regra do alerta’ para ver módulos e registros que sustentam cada resumo. Use Indicadores para os cartões executivos, Acompanhamentos para ir à fila de decisões e Secretarias para navegar até a operação de cada área. Todos os dados desta demonstração são fictícios.",
      action: "Entendi",
    },
  }[noticeMode];

  if (!experience) {
    return <AccessScreen onEnter={setExperience} />;
  }

  if (experience !== "mayor") {
    return (
      <OperationalWorkspace
        experience={experience}
        requests={requests}
        healthTerritory={healthTerritory}
        onHealthTerritoryChange={setHealthTerritory}
        healthActivities={healthActivities}
        onHealthActivitiesChange={setHealthActivities}
        healthReferrals={healthReferrals}
        onHealthReferralsChange={setHealthReferrals}
        peopleRegistry={peopleRegistry}
        onPeopleRegistryChange={setPeopleRegistry}
        onCreateRequest={createMunicipalRequest}
        onUpdateRequest={(id, update) =>
          updateMunicipalRequest(id, update, "Secretaria responsável")
        }
        onSwitchExperience={() => setExperience(null)}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "sidebar-open" : ""}`}>
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-text">
            <strong>
              Matrix<span>IA</span>
            </strong>
            <small>INTELIGÊNCIA MUNICIPAL</small>
          </div>
          <button
            className="icon-button sidebar-close"
            aria-label="Fechar menu"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="municipality-switch"
          aria-label="Município demonstrativo"
        >
          <span className="municipality-symbol">
            <Building2 size={17} />
          </span>
          <span className="municipality-copy">
            <strong>{municipalityProfile.name}</strong>
            <small>{municipalityProfile.state} · Município piloto</small>
          </span>
          <ChevronDown size={15} className="muted-icon" />
        </div>

        <div className="nav-label">GESTÃO MUNICIPAL</div>
        <nav className="main-nav" aria-label="Navegação principal">
          <button
            className={`nav-item ${view === "overview" ? "active" : ""}`}
            onClick={() => {
              setView("overview");
              closeDepartment();
              setMobileMenuOpen(false);
            }}
          >
            <LayoutDashboard size={18} />
            <span>Visão do prefeito</span>
            <span className="nav-active-dot" />
          </button>
          <button
            className={`nav-item ${view === "departments" ? "active" : ""}`}
            onClick={() => {
              setView("departments");
              closeDepartment();
              setMobileMenuOpen(false);
            }}
          >
            <Building2 size={18} />
            <span>Secretarias</span>
            <span className="nav-count">{departments.length}</span>
          </button>
          <button
            className={`nav-item ${view === "requests" ? "active" : ""}`}
            onClick={() => {
              setView("requests");
              closeDepartment();
              setMobileMenuOpen(false);
            }}
          >
            <FilePlus2 size={18} />
            <span>Solicitações</span>
            <span className="nav-count">{requestTotals.open}</span>
          </button>
          <button
            className="nav-item"
            onClick={() =>
              document
                .getElementById("metrics-summary")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <Activity size={18} />
            <span>Indicadores</span>
          </button>
          <button
            className="nav-item"
            onClick={() =>
              document
                .getElementById("priorities")
                ?.scrollIntoView({ behavior: "smooth" })
            }
          >
            <CalendarDays size={18} />
            <span>Acompanhamentos</span>
          </button>
        </nav>

        <div className="nav-label nav-label-spaced">ACESSO RÁPIDO</div>
        <div className="quick-departments">
          {departmentsWithRequestCounts.slice(0, 5).map((department) => (
            <button
              key={department.name}
              className="quick-link"
              onClick={() => openDepartment(department)}
            >
              <span
                className={`quick-dot ${department.status === "Atenção" ? "dot-amber" : department.status === "Crítico" ? "dot-red" : ""}`}
              />
              <span>{department.shortName}</span>
            </button>
          ))}
          <button
            className="all-departments"
            onClick={() => {
              setView("departments");
              setSelectedDepartment(null);
              setMobileMenuOpen(false);
            }}
          >
            Ver as {departments.length} secretarias <ArrowRight size={14} />
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="ai-card">
            <div className="ai-card-heading">
              <Sparkles size={15} />
              <span>Base municipal integrada</span>
            </div>
            <p>
              Uma visão comum dos serviços e das pendências. Recursos analíticos
              avançados são uma etapa futura, apoiada por dados confiáveis.
            </p>
            <span className="ai-card-status">
              <span /> Protótipo com dados fictícios
            </span>
          </div>
          <button
            className="nav-item secondary-nav"
            onClick={() => openNotice("help")}
          >
            <CircleHelp size={18} />
            <span>Ajuda e orientações</span>
          </button>
          <div className="profile-card">
            <div className="avatar">ST</div>
            <div className="profile-copy">
              <strong>Samuel Teixeira</strong>
              <small>Visão demonstrativa · Prefeito</small>
            </div>
            <button
              className="profile-signout"
              aria-label="Trocar experiência"
              title="Trocar experiência"
              onClick={() => setExperience(null)}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {mobileMenuOpen && (
        <button
          className="mobile-scrim"
          aria-label="Fechar menu"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu-button"
              aria-label="Abrir menu"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumb">
              <span>Prefeitura</span>
              <span className="crumb-slash">/</span>
              <strong>
                {selectedDepartment?.shortName ??
                  (view === "overview"
                    ? "Visão do prefeito"
                    : view === "requests"
                      ? "Solicitações"
                      : "Secretarias")}
              </strong>
            </div>
          </div>
          <div className="topbar-actions">
            <div className="demo-pill">
              <span /> CENÁRIO SIMULADO · 3.000 HABITANTES
            </div>
            <button
              className="icon-button search-button"
              aria-label="Pesquisar"
              onClick={() => setSearchOpen(!searchOpen)}
            >
              <Search size={18} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="Notificações"
              onClick={() => openNotice("notifications")}
            >
              <Bell size={18} />
              <i />
            </button>
            <div className="topbar-divider" />
            <button className="help-button" onClick={() => openNotice("help")}>
              <CircleHelp size={17} />
              <span>Ajuda</span>
            </button>
          </div>
        </header>

        {searchOpen && (
          <div className="search-popover">
            <Search size={17} />
            <input
              autoFocus
              placeholder="Buscar secretaria ou área..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
              }}
            />
            <button
              aria-label="Fechar busca"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery("");
              }}
            >
              <X size={16} />
            </button>
            {searchQuery.trim() && (
              <div className="search-results">
                {searchResults.length ? (
                  searchResults.map((department) => (
                    <button
                      key={department.name}
                      onClick={() => {
                        openDepartment(department);
                        setSearchOpen(false);
                        setSearchQuery("");
                      }}
                    >
                      <Building2 size={15} />
                      <span>
                        <strong>{department.name}</strong>
                        <small>{department.summary}</small>
                      </span>
                      <ArrowRight size={14} />
                    </button>
                  ))
                ) : (
                  <p>Nenhuma secretaria encontrada. Tente outro termo.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="content-wrap">
          {view === "requests" && !selectedDepartment ? (
            <RequestCenter requests={requests} mode="mayor" />
          ) : view === "overview" && !selectedDepartment ? (
            <>
              <section className="welcome-row">
                <div>
                  <div className="eyebrow">
                    <span className="eyebrow-line" /> QUINTA-FEIRA, 19 DE
                    NOVEMBRO DE 2026
                  </div>
                  <h1>Boa tarde, Samuel.</h1>
                  <p className="welcome-subtitle">
                    O que precisa da sua atenção hoje em{" "}
                    {municipalityProfile.name}?
                  </p>
                </div>
                <div className="welcome-actions">
                  <div className="as-of-pill">
                    <CalendarDays size={15} /> Atualizado às 16h40
                  </div>
                  <button
                    className="outline-button"
                    onClick={() => openNotice("executive")}
                  >
                    <Command size={15} />
                    <span>Resumo executivo</span>
                  </button>
                </div>
              </section>

              <section className="executive-banner">
                <div className="banner-orbit orbit-one" />
                <div className="banner-orbit orbit-two" />
                <div className="banner-orbit orbit-three" />
                <div className="banner-copy">
                  <div className="banner-kicker">
                    <span className="live-dot" /> CENÁRIO DE GESTÃO
                    <span className="banner-separator">·</span>
                    {municipalityProfile.population.toLocaleString(
                      "pt-BR",
                    )}{" "}
                    HABITANTES
                  </div>
                  <h2>
                    Uma rota escolar mudou.
                    <br />
                    <span>Saúde e estradas também pedem ação.</span>
                  </h2>
                  <p>
                    Neste cenário fictício, a indisponibilidade de um veículo e
                    a contingência de uma rota são relacionadas aos registros de
                    frota, manutenção e estudantes vinculados.
                  </p>
                  <button
                    className="banner-source-link"
                    onClick={() => setSourceOpen(true)}
                  >
                    De quais cadastros viria esse alerta?
                    <ArrowRight size={13} />
                  </button>
                  <button
                    className="banner-button"
                    onClick={() =>
                      document
                        .getElementById("priorities")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    Ver o que fazer hoje <ArrowRight size={15} />
                  </button>
                </div>
                <div className="banner-side">
                  <div
                    className="status-ring"
                    aria-label={`${statusCounts.okay} secretarias sem pendência crítica`}
                  >
                    <div>
                      <strong>{statusCounts.okay}</strong>
                      <small>
                        de {departments.length} sem pendência crítica
                      </small>
                    </div>
                  </div>
                  <div className="banner-status-list">
                    <span>
                      <i className="status-dot green" />
                      Em dia <b>{statusCounts.okay}</b>
                    </span>
                    <span>
                      <i className="status-dot amber" />
                      Atenção <b>{statusCounts.attention}</b>
                    </span>
                    <span>
                      <i className="status-dot red" />
                      Crítica <b>{statusCounts.critical}</b>
                    </span>
                  </div>
                </div>
              </section>

              <section
                id="metrics-summary"
                className="metrics-grid"
                aria-label="Resumo para o prefeito"
              >
                {metricCards.map((item) => (
                  <article className="metric-card" key={item.label}>
                    <div className="metric-top">
                      <span className="metric-label">{item.label}</span>
                      <span className={`metric-icon metric-icon-${item.tone}`}>
                        {item.icon === "requests" ? (
                          <Activity size={16} />
                        ) : item.icon === "finance" ? (
                          <Wallet size={16} />
                        ) : item.icon === "transport" ? (
                          <ArrowDownRight size={16} />
                        ) : (
                          <Check size={16} />
                        )}
                      </span>
                    </div>
                    <div className="metric-value-row">
                      <strong>{item.value}</strong>
                    </div>
                    <div className={`metric-change metric-change-${item.tone}`}>
                      {item.tone === "green" ? (
                        <ArrowUpRight size={13} />
                      ) : (
                        <ArrowDownRight size={13} />
                      )}
                      {item.change}
                    </div>
                    <div className="metric-helper">{item.helper}</div>
                  </article>
                ))}
              </section>

              <section className="dashboard-grid">
                <div className="priority-panel" id="priorities">
                  <div className="section-heading">
                    <div>
                      <div className="section-eyebrow">
                        DECISÕES E ACOMPANHAMENTOS
                      </div>
                      <h2>O que pede atenção hoje</h2>
                    </div>
                    <span className="priority-counter">
                      {referralAwarePriorities.length.toString().padStart(2, "0")} {" "}
                      <span>pontos</span>
                    </span>
                  </div>
                  <div className="priority-list">
                    {visiblePriorities.map((priority) => (
                      <PriorityItem
                        key={priority.title}
                        priority={priority}
                        clinicalReferralSummary={clinicalReferralSummary}
                        onOpen={() => openPriorityDepartment(priority)}
                      />
                    ))}
                  </div>
                  <button
                    className="panel-footer-link"
                    onClick={() => setShowAllPriorities(!showAllPriorities)}
                  >
                    {showAllPriorities
                      ? "Mostrar somente as 3 mais urgentes"
                      : `Ver outras ${Math.max(0, referralAwarePriorities.length - 3)} pendências`}
                    <ArrowRight size={15} />
                  </button>
                </div>

                <FinancePanel
                  annualBudgetPercent={revenueOfAnnualBudgetPercent}
                  committedPercent={committedPercent}
                  paidPercent={paidPercent}
                  revenueToDatePercent={revenueToDatePercent}
                  revenueGapMillions={revenueGapMillions}
                />
              </section>

              <section className="departments-section">
                <div className="section-heading departments-heading">
                  <div>
                    <div className="section-eyebrow">
                      A PREFEITURA INTEIRA, EM UMA SÓ VISÃO
                    </div>
                    <h2>
                      Panorama das secretarias{" "}
                      <span className="section-count">
                        {departments.length}
                      </span>
                    </h2>
                  </div>
                  <button
                    className="text-link"
                    onClick={() => {
                      setView("departments");
                      setSelectedDepartment(null);
                    }}
                  >
                    Abrir visão por área <ArrowRight size={15} />
                  </button>
                </div>
                <div className="department-grid">
                  {departmentsWithRequestCounts.map((department) => (
                    <DepartmentCard
                      key={department.name}
                      department={department}
                      onClick={() => openDepartment(department)}
                    />
                  ))}
                </div>
              </section>

              <footer className="page-footer">
                <span>
                  <MapPin size={14} /> {municipalityProfile.name},{" "}
                  {municipalityProfile.state}
                </span>
                <span>
                  Cenário fictício · atualizado {lastUpdated} <i />
                </span>
              </footer>
            </>
          ) : selectedDepartment ? (
            <DepartmentDetail
              department={selectedDepartment}
              onBack={() => {
                setSelectedDepartment(null);
                setView("departments");
              }}
            />
          ) : (
            <section className="all-departments-page">
              <div className="eyebrow">
                <span className="eyebrow-line" /> VISÃO INTEGRADA
              </div>
              <div className="all-title-row">
                <div>
                  <h1>As secretarias</h1>
                  <p className="welcome-subtitle">
                    Um panorama simples do trabalho em cada área.
                  </p>
                </div>
                <span className="total-count">{departments.length} áreas</span>
              </div>
              <div className="directory-summary">
                <div className="directory-summary-icon">
                  <Building2 size={20} />
                </div>
                <div>
                  <strong>
                    Uma única prefeitura, trabalhando em conjunto.
                  </strong>
                  <p>
                    Escolha uma secretaria para ver suas demandas, impacto no
                    cidadão e próximo passo recomendado no cenário simulado.
                  </p>
                </div>
              </div>
              <div className="directory-grid">
                {departmentsWithRequestCounts.map((department) => (
                  <DepartmentCard
                    key={department.name}
                    department={department}
                    onClick={() => openDepartment(department)}
                  />
                ))}
              </div>
              <footer className="page-footer">
                <span>
                  <MapPin size={14} /> {municipalityProfile.name},{" "}
                  {municipalityProfile.state}
                </span>
                <span>
                  Cenário fictício · dados de demonstração <i />
                </span>
              </footer>
            </section>
          )}
        </div>
      </main>

      {noticeOpen && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={closeNotice}
        >
          <section
            className="notice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              onClick={closeNotice}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            <div className="modal-icon">
              <Sparkles size={21} />
            </div>
            <div className="section-eyebrow">{noticeContent.eyebrow}</div>
            <h2 id="modal-title">{noticeContent.title}</h2>
            <p>{noticeContent.body}</p>
            <button className="modal-action" onClick={closeNotice}>
              {noticeContent.action}
            </button>
          </section>
        </div>
      )}
      {sourceOpen && <DataOriginDialog onClose={() => setSourceOpen(false)} />}
    </div>
  );
}

function PriorityItem({
  priority,
  clinicalReferralSummary,
  onOpen,
}: {
  priority: Priority;
  clinicalReferralSummary: ReturnType<typeof getHealthReferralSummary>;
  onOpen: () => void;
}) {
  const severity = priority.level === "Crítico" ? "critical" : "attention";
  const source = dataLineage[priority.sourceId];
  const sourceRecords =
    priority.sourceId === "clinical-referrals"
      ? [
          `${clinicalReferralSummary.waiting} encaminhamentos aguardam vaga na fila clínica simulada`,
          `${clinicalReferralSummary.waitingOver60Days} encaminhamentos aguardam há mais de 60 dias`,
          `${clinicalReferralSummary.offered} vagas ofertadas · ${clinicalReferralSummary.scheduled} atendimentos agendados · ${clinicalReferralSummary.completed} realizados`,
        ]
      : source.records;
  return (
    <article className="priority-item">
      <div className={`priority-marker priority-marker-${severity}`}>
        <span />
      </div>
      <div className="priority-content">
        <div className="priority-meta">
          <span className={`priority-tag priority-tag-${severity}`}>
            {priority.level}
          </span>
          <span>SIMULADO · {priority.reference}</span>
        </div>
        <h3>{priority.title}</h3>
        <p>{priority.description}</p>
        <div className="priority-owner">Responsável: {priority.owner}</div>
        <div className="priority-impact">Impacto: {priority.impact}</div>
        <div className="priority-action">
          <strong>Próximo passo:</strong> {priority.action}
        </div>
        <details className="priority-origin">
          <summary>Origem e regra do alerta · simulado</summary>
          <div className="priority-origin-content">
            <strong>{source.modules.join(" · ")}</strong>
            <ul>
              {sourceRecords.map((record) => (
                <li key={record}>{record}</li>
              ))}
            </ul>
            <p>{source.calculation}</p>
            <small>{source.note}</small>
          </div>
        </details>
        <button onClick={onOpen}>
          Ver resumo de {priority.department} <ArrowRight size={13} />
        </button>
      </div>
    </article>
  );
}

function FinancePanel({
  annualBudgetPercent,
  committedPercent,
  paidPercent,
  revenueToDatePercent,
  revenueGapMillions,
}: {
  annualBudgetPercent: number;
  committedPercent: number;
  paidPercent: number;
  revenueToDatePercent: number;
  revenueGapMillions: number;
}) {
  return (
    <aside className="finance-panel">
      <div className="finance-header">
        <div>
          <div className="section-eyebrow">FINANÇAS DO MUNICÍPIO</div>
          <h2>Orçamento 2026</h2>
        </div>
        <span className="finance-period">
          Fechamento {financialPosition.referenceDate}
        </span>
      </div>
      <div className="finance-total">
        <span>Orçamento anual autorizado</span>
        <strong>
          {formatMillions(financialPosition.annualBudgetMillions)}
        </strong>
      </div>
      <div className="finance-line">
        <div className="finance-line-heading">
          <span>Receita recebida</span>
          <strong>
            {formatMillions(financialPosition.revenueReceivedMillions)}
          </strong>
        </div>
        <div className="finance-track">
          <span
            className="finance-fill finance-fill-blue"
            style={{ width: `${Math.min(annualBudgetPercent, 100)}%` }}
          />
        </div>
        <div className="finance-line-foot">
          <span>{formatPercent(annualBudgetPercent)} do orçamento anual</span>
          <span>
            {formatPercent(revenueToDatePercent)} da previsão até outubro
          </span>
        </div>
      </div>
      <div className="finance-variance">
        <span className="solid-chip chip-attention">Abaixo do previsto</span>
        <strong>{formatMillions(revenueGapMillions)}</strong>
        <p>
          Diferença entre a receita recebida e a previsão acumulada até 31/out.
        </p>
      </div>
      <div className="finance-line finance-expenses">
        <div className="finance-line-heading">
          <span>Despesas empenhadas</span>
          <strong>
            {formatMillions(financialPosition.expenditureCommittedMillions)}
          </strong>
        </div>
        <div className="finance-track">
          <span
            className="finance-fill finance-fill-amber"
            style={{ width: `${Math.min(committedPercent, 100)}%` }}
          />
        </div>
        <div className="finance-line-foot">
          <span>{formatPercent(committedPercent)} do orçamento</span>
          <span>
            {formatMillions(financialPosition.expenditurePaidMillions)} pagos (
            {formatPercent(paidPercent)})
          </span>
        </div>
      </div>
      <div className="finance-footer">
        <ShieldCheck size={14} />
        <span>
          Cenário fictício · referência {financialPosition.referenceDate} ·
          atualizado {financialPosition.updatedDate}
        </span>
      </div>
    </aside>
  );
}

function DepartmentCard({
  department,
  onClick,
}: {
  department: Department;
  onClick: () => void;
}) {
  const statusClass = getStatusClass(department.status);
  return (
    <button className="department-card" onClick={onClick}>
      <div className="department-card-top">
        <span className="department-monogram">{department.icon}</span>
        <span className={`status-label status-${statusClass}`}>
          <i />
          {department.status}
        </span>
      </div>
      <span className="department-area">
        CENÁRIO SIMULADO · {department.area} · {department.openRequests}{" "}
        solicitações administrativas
      </span>
      <h3>{department.name}</h3>
      <p>{department.summary}</p>
      <div className="department-card-bottom">
        <strong>{department.metric}</strong>
        <span>{department.metricLabel}</span>
        <ArrowRight size={15} />
      </div>
      <div className={`department-trend department-trend-${statusClass}`}>
        {department.trend}
      </div>
    </button>
  );
}

function DepartmentDetail({
  department,
  onBack,
}: {
  department: Department;
  onBack: () => void;
}) {
  const statusClass = getStatusClass(department.status);
  return (
    <section className="department-detail">
      <button className="back-link" onClick={onBack}>
        <ArrowRight className="back-arrow" size={15} /> Todas as secretarias
      </button>
      <div className="eyebrow">
        <span className="eyebrow-line" /> RESUMO DEMONSTRATIVO DA ÁREA
      </div>
      <div className="detail-heading">
        <div>
          <span className="department-monogram detail-monogram">
            {department.icon}
          </span>
          <div className="detail-area">{department.area}</div>
          <h1>{department.name}</h1>
          <p className="welcome-subtitle">{department.summary}</p>
        </div>
        <span className={`status-label status-${statusClass}`}>
          <i />
          {department.status}
        </span>
      </div>
      {department.relatedAreas && (
        <div className="department-partners">
          <strong>Área transversal envolvida:</strong> {department.relatedAreas}
          . A Gestão de Frota é apoio operacional, não uma 12ª secretaria.
        </div>
      )}
      <div className="detail-metric-card">
        <span>Indicador demonstrativo · cenário fictício</span>
        <strong>{department.metric}</strong>
        <p>{department.metricLabel}</p>
        <small>{department.trend}</small>
      </div>
      <div className="detail-facts">
        <span>
          <strong>{department.openRequests}</strong> solicitações
          administrativas abertas
        </span>
        <span>
          <strong>{department.overdueRequests}</strong> fora do prazo
        </span>
      </div>
      <div className="directory-summary detail-explainer">
        <div className="directory-summary-icon">
          <ShieldCheck size={20} />
        </div>
        <div>
          <strong>Próximo passo sugerido no cenário</strong>
          <p>{department.nextAction}</p>
        </div>
      </div>
      <div className="detail-next">
        <span className="section-eyebrow">CONTEXTO PARA A DECISÃO</span>
        <h2>O que isso significa para o morador?</h2>
        <p>{department.citizenImpact}</p>
      </div>
    </section>
  );
}

function getStatusClass(status: Department["status"]) {
  if (status === "Em dia") return "okay";
  if (status === "Atenção") return "attention";
  return "critical";
}

export default App;
