import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  ClipboardList,
  FilePlus2,
  LogOut,
  MapPinned,
  MapPin,
  UsersRound,
} from "lucide-react";
import {
  departments,
  priorities,
  type Department,
  type Priority,
} from "../data/mockData";
import { dataLineage } from "../data/dataLineage";
import RequestCenter from "./RequestCenter";
import {
  formatRequestDate,
  getDepartmentRequestCounts,
  type MunicipalRequest,
  type MunicipalRequestDraft,
  type RequestStatus,
} from "../data/requests";
import HealthVisitsAttendanceModule, {
  type HealthOperatorPersona,
} from "./HealthVisitsAttendanceModule";
import HealthTerritoryModule from "./HealthTerritoryModule";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import type { HealthActivitiesDataset } from "../data/healthActivities";
import PeopleFamiliesDomicilesModule from "./PeopleFamiliesDomicilesModule";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";

export type Experience = "mayor" | "secretary" | "operator";

type WorkspaceProps = {
  experience: Exclude<Experience, "mayor">;
  requests: MunicipalRequest[];
  healthTerritory: HealthTerritoryDataset;
  onHealthTerritoryChange: (
    update: (current: HealthTerritoryDataset) => HealthTerritoryDataset,
  ) => void;
  peopleRegistry: PeopleRegistryDataset;
  onPeopleRegistryChange: (
    update: (current: PeopleRegistryDataset) => PeopleRegistryDataset,
  ) => void;
  healthActivities: HealthActivitiesDataset;
  onHealthActivitiesChange: (
    update: (current: HealthActivitiesDataset) => HealthActivitiesDataset,
  ) => void;
  onCreateRequest: (draft: MunicipalRequestDraft) => MunicipalRequest;
  onUpdateRequest: (
    id: string,
    update: { status: RequestStatus; assignedTo: string; note: string },
    actor: string,
  ) => void;
  onSwitchExperience: () => void;
};

type Persona = {
  id: string;
  label: string;
  unit: string;
  description: string;
  modules: string[];
  fields: { label: string; placeholder: string }[];
  tasks: { id: string; title: string; time: string; source: string }[];
};

const departmentModules: Record<string, string[]> = {
  "Administração e Finanças": [
    "Protocolo",
    "Orçamento e execução",
    "Compras e contratos",
    "Patrimônio e frota",
    "Pessoas e estrutura",
  ],
  "Agricultura e Meio Ambiente": [
    "Atendimento rural",
    "Assistência ao produtor",
    "Máquinas e serviços",
    "Licenciamento e fiscalização",
    "Ocorrências ambientais",
  ],
  "Assistência Social": [
    "Acolhida e acompanhamento",
    "Visitas e serviços",
    "Benefícios",
    "Encaminhamentos",
    "Rede socioassistencial",
  ],
  "Cultura e Turismo": [
    "Agenda cultural",
    "Espaços e equipamentos",
    "Inscrições e eventos",
    "Editais e projetos",
    "Agentes culturais",
  ],
  "Desenvolvimento Econômico": [
    "Atendimento ao empreendedor",
    "Emprego e renda",
    "Programas e feiras",
    "Licenças integradas",
    "Acompanhamento de negócios",
  ],
  Educação: [
    "Unidades e matrículas",
    "Turmas e frequência",
    "Transporte escolar",
    "Alimentação escolar",
    "Calendário e ocorrências",
  ],
  "Esporte e Lazer": [
    "Espaços esportivos",
    "Turmas e modalidades",
    "Inscrições",
    "Agenda",
    "Manutenção",
  ],
  Obras: [
    "Solicitações de serviço",
    "Ordens de serviço",
    "Vias e trechos",
    "Equipes e máquinas",
    "Materiais e execução",
  ],
  "Planejamento e Urbanismo": [
    "Planos e zoneamento",
    "Projetos territoriais",
    "Consulta prévia",
    "Alvarás",
    "Aprovações e processos",
  ],
  "Saúde e Vigilância Sanitária": [
    "Pessoas, Famílias e Domicílios",
    "Unidades e equipes",
    "Agenda e atendimentos",
    "Visitas e procedimentos",
    "Encaminhamentos e regulação",
    "Vigilância e inspeções",
  ],
  "Segurança Pública e Trânsito": [
    "Ocorrências e solicitações",
    "Sinalização",
    "Fiscalização",
    "Mobilidade",
    "Rondas e providências",
  ],
};

const operatorPersonas: Persona[] = [
  {
    id: "acs",
    label: "Agente Comunitário de Saúde (ACS)",
    unit: "Unidade Básica de Saúde Central",
    description:
      "Visitas no território, acompanhamento de pessoas e atualização domiciliar.",
    modules: [
      "Agenda de visitas",
      "Pessoas e domicílios",
      "Acompanhamentos",
      "Encaminhamentos",
    ],
    fields: [
      { label: "Pessoa ou família", placeholder: "Ex.: cadastro SIM-PES-042" },
      {
        label: "Endereço / domicílio visitado",
        placeholder: "Rua, número ou referência do local",
      },
      {
        label: "Tipo de visita e resultado",
        placeholder: "Ex.: acompanhamento realizado",
      },
      {
        label: "Observação e providência",
        placeholder: "Resumo do que ocorreu e próximo passo",
      },
    ],
    tasks: [
      {
        id: "SIM-ACS-VIS-041",
        title: "Visita domiciliar programada",
        time: "08h30 · Território Norte",
        source: "Agenda territorial → cadastro de visita SIM-ACS-VIS-041",
      },
      {
        id: "SIM-ACS-RET-018",
        title: "Retorno de acompanhamento",
        time: "10h15 · Setor 02",
        source: "Acompanhamento de pessoa → retorno agendado SIM-ACS-RET-018",
      },
    ],
  },
  {
    id: "ace",
    label: "Agente de Combate às Endemias (ACE)",
    unit: "Vigilância em Saúde",
    description:
      "Vistorias de imóveis, focos, ações no território e retornos programados.",
    modules: [
      "Roteiro de campo",
      "Imóveis e locais",
      "Vistorias",
      "Focos e providências",
    ],
    fields: [
      {
        label: "Imóvel ou ponto vistoriado",
        placeholder: "Ex.: imóvel SIM-VIG-061",
      },
      {
        label: "Endereço / território",
        placeholder: "Rua, número ou referência do local",
      },
      {
        label: "Atividade e resultado da vistoria",
        placeholder: "Ex.: vistoria realizada",
      },
      {
        label: "Providência ou retorno",
        placeholder: "Ação necessária e data prevista",
      },
    ],
    tasks: [
      {
        id: "SIM-ACE-VIS-061",
        title: "Vistoria de imóvel programada",
        time: "09h00 · Setor Leste",
        source: "Roteiro de campo → imóvel SIM-VIG-061",
      },
      {
        id: "SIM-ACE-RET-025",
        title: "Retorno para conferir providência",
        time: "13h30 · Setor 03",
        source: "Vistoria registrada → retorno SIM-ACE-RET-025",
      },
    ],
  },
  {
    id: "ubs",
    label: "Profissional de Saúde da UBS",
    unit: "Unidade Básica de Saúde Central",
    description:
      "Atendimentos da agenda e encaminhamentos relacionados ao cuidado.",
    modules: [
      "Agenda clínica",
      "Atendimentos",
      "Procedimentos",
      "Encaminhamentos",
    ],
    fields: [
      {
        label: "Pessoa ou atendimento",
        placeholder: "Ex.: atendimento SIM-SAU-ATD-118",
      },
      {
        label: "Unidade e tipo de atendimento",
        placeholder: "Unidade, consulta ou procedimento",
      },
      {
        label: "Atividade e situação",
        placeholder: "Atividade realizada e situação do registro",
      },
      {
        label: "Conduta ou encaminhamento",
        placeholder: "Próxima providência relacionada ao atendimento",
      },
    ],
    tasks: [
      {
        id: "SIM-SAU-ATD-118",
        title: "Atendimento agendado",
        time: "08h00 · Consulta programada",
        source: "Agenda da unidade → atendimento SIM-SAU-ATD-118",
      },
      {
        id: "SIM-SAU-ENC-009",
        title: "Conferir retorno de encaminhamento",
        time: "11h20 · Regulação",
        source: "Encaminhamento clínico → SIM-SAU-ENC-009",
      },
    ],
  },
  {
    id: "school",
    label: "Secretaria Escolar",
    unit: "Escola Municipal do Centro",
    description:
      "Rotinas escolares, atualização de registros e acompanhamento da unidade.",
    modules: [
      "Matrículas e turmas",
      "Frequência",
      "Transporte escolar",
      "Calendário e ocorrências",
    ],
    fields: [
      {
        label: "Aluno, turma ou processo",
        placeholder: "Ex.: matrícula SIM-EDU-MAT-204",
      },
      {
        label: "Unidade escolar",
        placeholder: "Selecione ou informe a escola",
      },
      {
        label: "Rotina escolar registrada",
        placeholder: "Ex.: atualização de frequência",
      },
      {
        label: "Observação ou próximo passo",
        placeholder: "Descreva a providência necessária",
      },
    ],
    tasks: [
      {
        id: "SIM-EDU-ROT-07",
        title: "Confirmar a rota escolar readequada",
        time: "07h15 · Transporte escolar",
        source: "Rota SIM-EDU-ROT-07 + veículo MIC-02 + ordem SIM-MAN-014",
      },
      {
        id: "SIM-EDU-FRQ-204",
        title: "Atualizar o registro diário de frequência",
        time: "10h30 · Turma 4º ano",
        source: "Diário da turma → frequência SIM-EDU-FRQ-204",
      },
    ],
  },
  {
    id: "works",
    label: "Equipe de Obras",
    unit: "Secretaria Municipal de Obras",
    description:
      "Ordens de serviço, locais de execução, equipes e retorno ao solicitante.",
    modules: [
      "Ordens de serviço",
      "Vias e trechos",
      "Equipes e máquinas",
      "Execução e conclusão",
    ],
    fields: [
      { label: "Ordem de serviço", placeholder: "Ex.: ordem SIM-OBR-021" },
      {
        label: "Trecho ou local",
        placeholder: "Rua, estrada ou ponto de referência",
      },
      {
        label: "Atividade e situação",
        placeholder: "Serviço executado e estado atual",
      },
      {
        label: "Material, equipe ou próximo passo",
        placeholder: "Recurso utilizado ou providência pendente",
      },
    ],
    tasks: [
      {
        id: "SIM-OBR-021",
        title: "Atualizar ordem de manutenção rural",
        time: "08h00 · Trecho R-04",
        source: "Ordem de serviço SIM-OBR-021 → prazo e equipe designada",
      },
      {
        id: "SIM-OBR-022",
        title: "Confirmar programação da equipe",
        time: "14h00 · Trecho R-09",
        source: "Ordem de serviço SIM-OBR-022 → previsão de atendimento",
      },
    ],
  },
];

type LocalEntry = {
  id: string;
  title: string;
  createdAt: string;
  fields: { label: string; value: string }[];
};

type LocalSecretaryUpdate = {
  id: string;
  departmentName: string;
  text: string;
  createdAt: string;
};

export default function OperationalWorkspace({
  experience,
  requests,
  healthTerritory,
  onHealthTerritoryChange,
  peopleRegistry,
  onPeopleRegistryChange,
  healthActivities,
  onHealthActivitiesChange,
  onCreateRequest,
  onUpdateRequest,
  onSwitchExperience,
}: WorkspaceProps) {
  const [selectedDepartment, setSelectedDepartment] = useState<Department>(
    departments.find((department) => department.name === "Educação")!,
  );
  const [selectedPersona, setSelectedPersona] = useState<Persona>(
    operatorPersonas[3],
  );
  const [activeSecretaryTab, setActiveSecretaryTab] = useState<
    | "overview"
    | "services"
    | "records"
    | "requests"
    | "territory"
    | "people"
    | "health-activities"
  >("overview");
  const [entryOpen, setEntryOpen] = useState(false);
  const [healthWorkflowOpen, setHealthWorkflowOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestValidationError, setRequestValidationError] = useState<
    string | null
  >(null);
  const [latestProtocol, setLatestProtocol] = useState<MunicipalRequest | null>(
    null,
  );
  const [createdRequestIds, setCreatedRequestIds] = useState<string[]>([]);
  const [operatorEntries, setOperatorEntries] = useState<LocalEntry[]>([]);
  const [secretaryUpdates, setSecretaryUpdates] = useState<
    LocalSecretaryUpdate[]
  >([]);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);

  const departmentPriorities = useMemo(
    () =>
      priorities.filter(
        (priority) => priority.department === selectedDepartment.name,
      ),
    [selectedDepartment],
  );
  const isSecretary = experience === "secretary";
  const healthOperatorPersona = (["acs", "ace", "ubs"] as const).includes(
    selectedPersona.id as HealthOperatorPersona,
  )
    ? (selectedPersona.id as HealthOperatorPersona)
    : undefined;
  const departmentRequestCounts = getDepartmentRequestCounts(
    requests,
    selectedDepartment.name,
  );
  const operatorRequests = requests.filter((request) =>
    createdRequestIds.includes(request.id),
  );
  const personaTaskCount =
    selectedPersona.tasks.length +
    operatorEntries.length +
    operatorRequests.length;
  const secretariatAreas = departmentModules[selectedDepartment.name] ?? [];
  const updatesForDepartment = secretaryUpdates.filter(
    (update) => update.departmentName === selectedDepartment.name,
  );

  const saveSecretaryUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const text = String(formData.get("update") ?? "").trim();
    if (!text) return;
    setSecretaryUpdates((previous) => [
      {
        id: `SIM-ATU-${String(previous.length + 1).padStart(3, "0")}`,
        departmentName: selectedDepartment.name,
        text,
        createdAt: new Date().toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
      ...previous,
    ]);
    event.currentTarget.reset();
    setActiveSecretaryTab("overview");
  };

  const saveOperatorEntry = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = selectedPersona.fields.map((field) =>
      String(new FormData(form).get(field.label) ?? "").trim(),
    );
    const entry: LocalEntry = {
      id: `SIM-REG-${String(operatorEntries.length + 1).padStart(3, "0")}`,
      title: values[2] || `Registro de ${selectedPersona.label}`,
      createdAt: new Date().toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      fields: selectedPersona.fields.map((field, index) => ({
        label: field.label,
        value: values[index],
      })),
    };
    setOperatorEntries((previous) => [entry, ...previous]);
    setEntryOpen(false);
    form.reset();
  };

  const saveMunicipalRequest = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const draft: MunicipalRequestDraft = {
      subject: String(values.get("subject") ?? "").trim(),
      description: String(values.get("description") ?? "").trim(),
      category: String(values.get("category") ?? "").trim(),
      department: String(values.get("department") ?? "").trim(),
      priority: String(
        values.get("priority") ?? "Normal",
      ) as MunicipalRequestDraft["priority"],
      requester: String(values.get("requester") ?? "").trim(),
      contact: String(values.get("contact") ?? "").trim(),
      location: String(values.get("location") ?? "").trim(),
      channel: String(values.get("channel") ?? "").trim(),
      createdBy: selectedPersona.label,
    };
    const firstEmptyField = [
      "subject",
      "description",
      "category",
      "requester",
      "location",
      "channel",
      "department",
    ].find((field) => !String(values.get(field) ?? "").trim());
    if (firstEmptyField) {
      setRequestValidationError(
        "Preencha todos os campos obrigatórios. Campos contendo apenas espaços não são aceitos.",
      );
      const control = form.elements.namedItem(firstEmptyField);
      if (control instanceof HTMLElement) control.focus();
      return;
    }
    const request = onCreateRequest(draft);
    setCreatedRequestIds((previous) => [request.id, ...previous]);
    setLatestProtocol(request);
    setRequestOpen(false);
    setRequestValidationError(null);
    form.reset();
  };

  return (
    <main className="workspace-shell">
      <aside className="workspace-sidebar">
        <div className="access-brand-lockup workspace-brand">
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
        </div>
        <div className="workspace-municipality">
          <Building2 size={16} />
          <span>
            <strong>Pitangueiras</strong>
            <small>Paraná · cenário simulado</small>
          </span>
        </div>
        {isSecretary ? (
          <>
            <div className="workspace-side-label">MINHA SECRETARIA</div>
            <div className="workspace-department-list">
              {departments.map((department) => (
                <button
                  key={department.name}
                  className={
                    selectedDepartment.name === department.name
                      ? "selected"
                      : ""
                  }
                  onClick={() => {
                    setSelectedDepartment(department);
                    setActiveSecretaryTab("overview");
                  }}
                >
                  <span
                    className={`workspace-dot workspace-dot-${department.status === "Em dia" ? "green" : department.status === "Atenção" ? "amber" : "red"}`}
                  />
                  {department.shortName}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="workspace-side-label">MEU ESPAÇO DE TRABALHO</div>
            <div className="workspace-role-badge">
              <Activity size={15} /> Operação municipal
            </div>
            <div className="workspace-module-list">
              {selectedPersona.modules.map((module) => (
                <span key={module}>{module}</span>
              ))}
            </div>
            <label className="persona-picker-label" htmlFor="persona-picker">
              Simular como
            </label>
            <select
              id="persona-picker"
              className="persona-picker"
              value={selectedPersona.id}
              onChange={(event) => {
                setSelectedPersona(
                  operatorPersonas.find(
                    (persona) => persona.id === event.target.value,
                  )!,
                );
                setHealthWorkflowOpen(false);
              }}
            >
              {operatorPersonas.map((persona) => (
                <option value={persona.id} key={persona.id}>
                  {persona.label}
                </option>
              ))}
            </select>
          </>
        )}
        <div className="workspace-sidebar-bottom">
          <div className="workspace-demo-note">
            <Check size={14} />
            <span>
              Dados e registros fictícios
              <br />
              alterações ficam nesta sessão
            </span>
          </div>
          <button className="workspace-signout" onClick={onSwitchExperience}>
            <LogOut size={15} /> Trocar experiência
          </button>
        </div>
      </aside>

      <section className="workspace-main">
        <header className="workspace-topbar">
          <div className="workspace-breadcrumb">
            <span>Município</span>
            <ArrowRight size={13} />
            <strong>
              {isSecretary ? selectedDepartment.shortName : "Meu trabalho"}
            </strong>
          </div>
          <div className="workspace-top-actions">
            <span className="workspace-sim-chip">DEMONSTRAÇÃO FICTÍCIA</span>
            <button onClick={onSwitchExperience}>
              <LogOut size={15} /> Sair da visão
            </button>
          </div>
        </header>

        {isSecretary ? (
          <div className="workspace-content">
            <div className="workspace-page-kicker">
              <Building2 size={14} /> VISÃO DA SECRETARIA · ATUALIZADA EM 19/NOV
            </div>
            <div className="workspace-heading-row">
              <div>
                <h1>{selectedDepartment.name}</h1>
                <p>{selectedDepartment.summary}</p>
              </div>
              <button
                className="workspace-primary-button"
                onClick={() => setActiveSecretaryTab("requests")}
              >
                <ClipboardList size={16} /> Ver solicitações
              </button>
            </div>
            <div
              className="workspace-tabs"
              role="tablist"
              aria-label="Seções da secretaria"
            >
              <button
                className={activeSecretaryTab === "overview" ? "active" : ""}
                onClick={() => setActiveSecretaryTab("overview")}
              >
                Resumo da pasta
              </button>
              <button
                className={activeSecretaryTab === "services" ? "active" : ""}
                onClick={() => setActiveSecretaryTab("services")}
              >
                Serviços e módulos
              </button>
              <button
                className={activeSecretaryTab === "records" ? "active" : ""}
                onClick={() => setActiveSecretaryTab("records")}
              >
                Ações e registros
              </button>
              <button
                className={activeSecretaryTab === "requests" ? "active" : ""}
                onClick={() => setActiveSecretaryTab("requests")}
              >
                Solicitações
                <span>{departmentRequestCounts.open}</span>
              </button>
              {selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <>
                  <button
                    className={
                      activeSecretaryTab === "territory" ? "active" : ""
                    }
                    onClick={() => setActiveSecretaryTab("territory")}
                  >
                    <MapPinned size={14} /> Território
                  </button>
                  <button
                    className={activeSecretaryTab === "people" ? "active" : ""}
                    onClick={() => setActiveSecretaryTab("people")}
                  >
                    <UsersRound size={14} /> Pessoas, Famílias e Domicílios
                  </button>
                  <button
                    className={
                      activeSecretaryTab === "health-activities" ? "active" : ""
                    }
                    onClick={() => setActiveSecretaryTab("health-activities")}
                  >
                    <Activity size={14} /> Visitas e Atendimentos
                  </button>
                </>
              )}
            </div>
            {activeSecretaryTab === "overview" && (
              <>
                <div className="workspace-metric-grid">
                  <WorkspaceMetric
                    icon={<ClipboardList size={17} />}
                    label="Solicitações administrativas"
                    value={String(departmentRequestCounts.open)}
                    detail="em aberto nesta pasta"
                  />
                  <WorkspaceMetric
                    icon={<Activity size={17} />}
                    label="Fora do prazo"
                    value={String(departmentRequestCounts.overdue)}
                    detail="requerem acompanhamento"
                    tone={departmentRequestCounts.overdue ? "amber" : "green"}
                  />
                  <WorkspaceMetric
                    icon={<Check size={17} />}
                    label="Situação da secretaria"
                    value={selectedDepartment.status}
                    detail="derivada das filas demonstrativas"
                    tone={
                      selectedDepartment.status === "Crítico"
                        ? "red"
                        : selectedDepartment.status === "Atenção"
                          ? "amber"
                          : "green"
                    }
                  />
                  <WorkspaceMetric
                    icon={<UsersRound size={17} />}
                    label={selectedDepartment.metricLabel}
                    value={selectedDepartment.metric}
                    detail={selectedDepartment.trend}
                  />
                </div>
                <div className="workspace-section-heading">
                  <div>
                    <span>ACOMPANHAMENTO</span>
                    <h2>Próximas providências</h2>
                  </div>
                  <span className="workspace-count">
                    {departmentPriorities.length || 1} itens
                  </span>
                </div>
                {departmentPriorities.length ? (
                  departmentPriorities.map((priority) => (
                    <SecretaryPriorityCard
                      priority={priority}
                      key={priority.title}
                    />
                  ))
                ) : (
                  <article className="secretary-action-card">
                    <span className="secretary-action-icon">
                      <CalendarDays size={17} />
                    </span>
                    <div>
                      <strong>{selectedDepartment.nextAction}</strong>
                      <p>
                        Providência sugerida a partir do resumo demonstrativo da
                        pasta.
                      </p>
                      <span className="secretary-source">
                        Origem: {selectedDepartment.area} → solicitações e
                        rotina da secretaria
                      </span>
                    </div>
                  </article>
                )}
                {updatesForDepartment.length > 0 && (
                  <div className="workspace-local-updates">
                    <h3>Atualizações desta sessão</h3>
                    {updatesForDepartment.map((update) => (
                      <p key={update.id}>
                        <Check size={14} /> {update.text}{" "}
                        <small>
                          {update.id} · {update.createdAt}
                        </small>
                      </p>
                    ))}
                  </div>
                )}
                {selectedDepartment.relatedAreas && (
                  <div className="workspace-cross-area">
                    <strong>Fluxo transversal</strong>
                    <p>
                      {selectedDepartment.relatedAreas}. A secretaria acompanha
                      o efeito no serviço e a área parceira atualiza o registro
                      de manutenção relacionado.
                    </p>
                  </div>
                )}
              </>
            )}
            {activeSecretaryTab === "services" && (
              <>
                <div className="workspace-section-heading">
                  <div>
                    <span>CATÁLOGO OPERACIONAL</span>
                    <h2>
                      Serviços e módulos de {selectedDepartment.shortName}
                    </h2>
                  </div>
                  <span className="workspace-count">
                    {secretariatAreas.length} áreas
                  </span>
                </div>
                <div className="service-module-grid">
                  {secretariatAreas.map((area, index) => (
                    <article className="service-module-card" key={area}>
                      <span className="service-module-number">
                        0{index + 1}
                      </span>
                      <h3>{area}</h3>
                      <p>
                        Rotina municipal demonstrativa, com cadastros, tarefas,
                        histórico e relatórios ligados à área.
                      </p>
                      <span>ÁREA PREVISTA NA PLATAFORMA</span>
                    </article>
                  ))}
                </div>
                {selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                  <>
                    <button
                      type="button"
                      className="health-module-launch-card"
                      onClick={() => setActiveSecretaryTab("territory")}
                    >
                      <span className="health-module-launch-icon">
                        <MapPinned size={19} />
                      </span>
                      <span className="health-module-launch-copy">
                        <strong>Território, Unidades e Equipes</strong>
                        <small>
                          Mapa demonstrativo, áreas de atuação e cadastros
                          relacionados da rede municipal de saúde.
                        </small>
                      </span>
                      <span className="health-module-launch-action">
                        Abrir módulo <ArrowRight size={14} />
                      </span>
                    </button>
                    <button
                      type="button"
                      className="health-module-launch-card"
                      onClick={() => setActiveSecretaryTab("people")}
                    >
                      <span className="health-module-launch-icon">
                        <UsersRound size={19} />
                      </span>
                      <span className="health-module-launch-copy">
                        <strong>Pessoas, Famílias e Domicílios</strong>
                        <small>
                          Cadastro municipal fictício de referência, relações
                          familiares, endereços compartilhados e mapa agregado.
                        </small>
                      </span>
                      <span className="health-module-launch-action">
                        Abrir módulo <ArrowRight size={14} />
                      </span>
                    </button>
                    <button
                      type="button"
                      className="health-module-launch-card"
                      onClick={() => setActiveSecretaryTab("health-activities")}
                    >
                      <span className="health-module-launch-icon">
                        <Activity size={19} />
                      </span>
                      <span className="health-module-launch-copy">
                        <strong>Visitas e Atendimentos</strong>
                        <small>
                          Roteiros de ACS/ACE, registros da UBS, resultados,
                          retornos e histórico vinculados ao cadastro territorial.
                        </small>
                      </span>
                      <span className="health-module-launch-action">
                        Abrir módulo <ArrowRight size={14} />
                      </span>
                    </button>
                  </>
                )}
                <div className="workspace-cross-area">
                  <strong>Integração dentro da prefeitura</strong>
                  <p>
                    Solicitações, unidades, profissionais, endereços, veículos e
                    ordens de serviço podem ser relacionados ao processo sem
                    repetir o cadastro do mesmo objeto em cada área.
                  </p>
                </div>
              </>
            )}
            {activeSecretaryTab === "territory" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <HealthTerritoryModule
                  dataset={healthTerritory}
                  onChange={onHealthTerritoryChange}
                />
              )}
            {activeSecretaryTab === "people" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <PeopleFamiliesDomicilesModule
                  dataset={peopleRegistry}
                  healthTerritory={healthTerritory}
                  onChange={onPeopleRegistryChange}
                />
              )}
            {activeSecretaryTab === "health-activities" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <HealthVisitsAttendanceModule
                  mode="secretary"
                  dataset={healthActivities}
                  peopleRegistry={peopleRegistry}
                  healthTerritory={healthTerritory}
                  onChange={onHealthActivitiesChange}
                />
              )}
            {activeSecretaryTab === "records" && (
              <div className="secretary-records-page">
                <div className="workspace-section-heading">
                  <div>
                    <span>REGISTRO DEMONSTRATIVO</span>
                    <h2>Atualização da secretaria</h2>
                  </div>
                  <span className="workspace-sim-chip">
                    SOMENTE NESTA SESSÃO
                  </span>
                </div>
                <p className="secretary-records-lead">
                  Registre um próximo passo para demonstrar como uma atualização
                  operacional aparece na visão da secretaria. Nenhum dado será
                  persistido.
                </p>
                <form
                  className="secretary-update-form"
                  onSubmit={saveSecretaryUpdate}
                >
                  <label htmlFor="secretary-update">
                    Providência, retorno recebido ou mudança de situação
                  </label>
                  <textarea
                    id="secretary-update"
                    name="update"
                    rows={4}
                    placeholder={`Ex.: ${selectedDepartment.nextAction}`}
                    required
                  />
                  <div>
                    <span>Área responsável: {selectedDepartment.name}</span>
                    <button className="workspace-primary-button" type="submit">
                      <Check size={15} /> Registrar nesta demonstração
                    </button>
                  </div>
                </form>
                {updatesForDepartment.length > 0 && (
                  <div className="workspace-local-updates">
                    <h3>Registros desta secretaria nesta sessão</h3>
                    {updatesForDepartment.map((update) => (
                      <p key={update.id}>
                        <Check size={14} /> {update.text}{" "}
                        <small>
                          {update.id} · {update.createdAt}
                        </small>
                      </p>
                    ))}
                  </div>
                )}
                <div className="workspace-cross-area">
                  <strong>Dados desta pasta</strong>
                  <p>
                    As contagens vêm dos registros operacionais fictícios. Cada
                    item pode guardar identificador, data de abertura, estado,
                    responsável, prazo, unidade/local e histórico de
                    atualização.
                  </p>
                </div>
                {departmentPriorities.map((priority) => (
                  <SecretaryPriorityCard
                    priority={priority}
                    key={priority.title}
                  />
                ))}
              </div>
            )}
            {activeSecretaryTab === "requests" && (
              <RequestCenter
                requests={requests}
                mode="secretary"
                departmentName={selectedDepartment.name}
                onUpdate={(id, update) =>
                  onUpdateRequest(id, update, selectedDepartment.shortName)
                }
              />
            )}
            <footer className="workspace-footer">
              <MapPin size={14} /> Pitangueiras, Paraná <span>·</span> Visão de
              secretário · cenário simulado
            </footer>
          </div>
        ) : (
          <div className="workspace-content operator-content">
            <div className="workspace-page-kicker">
              <UsersRound size={14} /> MEU TRABALHO ·{" "}
              {selectedPersona.unit.toUpperCase()}
            </div>
            <div className="workspace-heading-row operator-heading-row">
              <div>
                <h1>Olá. Esta é a sua rotina de hoje.</h1>
                <p>{selectedPersona.description}</p>
              </div>
              <button
                className="workspace-primary-button"
                onClick={() => {
                  if (healthOperatorPersona) setHealthWorkflowOpen(true);
                  else setEntryOpen(true);
                }}
              >
                <FilePlus2 size={16} />
                {healthOperatorPersona ? "Abrir módulo de Saúde" : "Registrar atividade"}
              </button>
              <button
                className="workspace-secondary-button"
                onClick={() => {
                  setRequestValidationError(null);
                  setRequestOpen(true);
                }}
              >
                <ClipboardList size={16} /> Registrar demanda
              </button>
            </div>
            {healthWorkflowOpen && healthOperatorPersona && (
              <HealthVisitsAttendanceModule
                key={selectedPersona.id}
                mode="operator"
                personaId={healthOperatorPersona}
                dataset={healthActivities}
                peopleRegistry={peopleRegistry}
                healthTerritory={healthTerritory}
                onChange={onHealthActivitiesChange}
                onBack={() => setHealthWorkflowOpen(false)}
              />
            )}
            {latestProtocol && (
              <div className="request-confirmation" role="status">
                <span>
                  <Check size={17} />
                </span>
                <div>
                  <strong>Demanda registrada nesta demonstração</strong>
                  <p>
                    Protocolo {latestProtocol.protocol} · encaminhado para{" "}
                    {latestProtocol.department} · prazo inicial{" "}
                    {formatRequestDate(latestProtocol.dueAt)}
                  </p>
                </div>
                <button
                  onClick={() => setLatestProtocol(null)}
                  aria-label="Fechar confirmação"
                >
                  ×
                </button>
              </div>
            )}
            <div className="operator-context-card">
              <div className="operator-context-icon">
                <CalendarDays size={20} />
              </div>
              <div>
                <span>AGENDA DE HOJE · 19/NOV/2026</span>
                <strong>{selectedPersona.label}</strong>
                <p>
                  As tarefas mostram de qual agenda, serviço ou registro elas
                  foram originadas.
                </p>
              </div>
              <div className="operator-context-count">
                <strong>{personaTaskCount}</strong>
                <span>itens na rotina</span>
              </div>
            </div>
            <div className="workspace-section-heading">
              <div>
                <span>FILA DE ATIVIDADES</span>
                <h2>Próximos atendimentos e tarefas</h2>
              </div>
              <span className="workspace-count">
                {selectedPersona.tasks.length} agendados
              </span>
            </div>
            <div className="operator-task-list">
              {selectedPersona.tasks.map((task, index) => (
                <article className="operator-task-card" key={task.id}>
                  <div className="operator-task-time">
                    <strong>{task.time.split(" · ")[0]}</strong>
                    <span>{index === 0 ? "PRÓXIMA" : "NA SEQUÊNCIA"}</span>
                  </div>
                  <div className="operator-task-main">
                    <h3>{task.title}</h3>
                    <p>
                      <MapPin size={13} /> {task.time.split(" · ")[1]}
                    </p>
                    <span>Origem: {task.source}</span>
                  </div>
                  <button
                    onClick={() =>
                      setExpandedEntry(
                        expandedEntry === task.id ? null : task.id,
                      )
                    }
                  >
                    {expandedEntry === task.id ? "Fechar" : "Abrir tarefa"}{" "}
                    <ArrowRight size={14} />
                  </button>
                  {expandedEntry === task.id && (
                    <div className="operator-task-detail">
                      <strong>O que será atualizado</strong>
                      <p>
                        Ao registrar a atividade, o profissional informa
                        local/unidade, atividade realizada, resultado, situação
                        e próxima providência. O registro atualiza a fila da
                        equipe e os resumos relacionados nesta simulação.
                      </p>
                      <button
                        onClick={() => {
                          if (healthOperatorPersona) setHealthWorkflowOpen(true);
                          else setEntryOpen(true);
                        }}
                      >
                        Registrar atividade vinculada <ArrowRight size={13} />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {operatorRequests.length > 0 && (
              <section className="operator-new-records">
                <div className="workspace-section-heading">
                  <div>
                    <span>PROTOCOLOS CRIADOS NESTA SESSÃO</span>
                    <h2>Demandas encaminhadas</h2>
                  </div>
                  <span className="workspace-count">
                    {operatorRequests.length}
                  </span>
                </div>
                {operatorRequests.map((request) => (
                  <article className="operator-record-card" key={request.id}>
                    <span className="operator-record-check">
                      <Check size={15} />
                    </span>
                    <div>
                      <strong>{request.subject}</strong>
                      <p>
                        {request.protocol} · {request.department} ·{" "}
                        {request.status} · somente nesta sessão
                      </p>
                    </div>
                  </article>
                ))}
              </section>
            )}
            {operatorEntries.length > 0 && (
              <section className="operator-new-records">
                <div className="workspace-section-heading">
                  <div>
                    <span>CRIADOS NESTA SESSÃO</span>
                    <h2>Atividades registradas</h2>
                  </div>
                  <span className="workspace-count">
                    {operatorEntries.length}
                  </span>
                </div>
                {operatorEntries.map((entry) => (
                  <article className="operator-record-card" key={entry.id}>
                    <span className="operator-record-check">
                      <Check size={15} />
                    </span>
                    <div>
                      <strong>{entry.title}</strong>
                      <p>
                        {entry.id} · Registrado às {entry.createdAt} · não
                        persistido
                      </p>
                      <button
                        onClick={() =>
                          setExpandedEntry(
                            expandedEntry === entry.id ? null : entry.id,
                          )
                        }
                      >
                        {expandedEntry === entry.id
                          ? "Ocultar campos"
                          : "Ver campos preenchidos"}
                      </button>
                      {expandedEntry === entry.id && (
                        <ul>
                          {entry.fields.map((field) => (
                            <li key={field.label}>
                              <strong>{field.label}:</strong>{" "}
                              {field.value || "—"}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </article>
                ))}
              </section>
            )}
            <footer className="workspace-footer">
              <MapPin size={14} /> {selectedPersona.unit} <span>·</span>{" "}
              Operador · registro demonstrativo em memória
            </footer>
          </div>
        )}
      </section>

      {entryOpen && !isSecretary && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setEntryOpen(false)}
        >
          <section
            className="operator-entry-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="operator-entry-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              onClick={() => setEntryOpen(false)}
              aria-label="Fechar formulário"
            >
              <ChevronDown size={18} />
            </button>
            <div className="origin-eyebrow">
              REGISTRO DE ATIVIDADE · DEMONSTRAÇÃO
            </div>
            <h2 id="operator-entry-title">Registrar atividade</h2>
            <p className="operator-entry-intro">
              {selectedPersona.label} · {selectedPersona.unit}. Os dados
              digitados serão mantidos somente enquanto esta sessão estiver
              aberta.
            </p>
            <form className="operator-entry-form" onSubmit={saveOperatorEntry}>
              {selectedPersona.fields.map((field) => (
                <label key={field.label}>
                  {field.label}
                  <input
                    name={field.label}
                    placeholder={field.placeholder}
                    required
                  />
                </label>
              ))}
              <div className="operator-entry-actions">
                <button
                  type="button"
                  className="operator-cancel"
                  onClick={() => setEntryOpen(false)}
                >
                  Cancelar
                </button>
                <button className="workspace-primary-button" type="submit">
                  <Check size={15} /> Salvar nesta sessão
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {requestOpen && !isSecretary && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setRequestOpen(false)}
        >
          <section
            className="operator-entry-dialog request-entry-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-entry-title"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              className="icon-button modal-close"
              onClick={() => setRequestOpen(false)}
              aria-label="Fechar formulário"
            >
              <ChevronDown size={18} />
            </button>
            <div className="origin-eyebrow">
              CENTRAL MUNICIPAL · REGISTRO DEMONSTRATIVO
            </div>
            <h2 id="request-entry-title">Registrar uma demanda</h2>
            <p className="operator-entry-intro">
              Informe o pedido e escolha a secretaria responsável. Um protocolo
              fictício será gerado para acompanhar o fluxo nesta sessão.
            </p>
            <form
              className="operator-entry-form request-entry-form"
              onChange={() => setRequestValidationError(null)}
              onSubmit={saveMunicipalRequest}
            >
              {requestValidationError && (
                <p className="request-validation-error" role="alert">
                  {requestValidationError}
                </p>
              )}
              <label>
                Assunto
                <input
                  name="subject"
                  placeholder="Ex.: reparo de via pública"
                  required
                  maxLength={120}
                />
              </label>
              <label className="request-description-field">
                Descrição
                <textarea
                  name="description"
                  rows={3}
                  placeholder="Descreva a solicitação e o resultado esperado"
                  required
                  maxLength={1000}
                />
              </label>
              <label>
                Categoria
                <select name="category" defaultValue="" required>
                  <option value="" disabled>
                    Selecione uma categoria
                  </option>
                  <option>Serviço municipal</option>
                  <option>Informação</option>
                  <option>Manutenção</option>
                  <option>Fiscalização</option>
                  <option>Outro</option>
                </select>
              </label>
              <label>
                Solicitante
                <input
                  name="requester"
                  placeholder="Nome de quem solicita"
                  required
                  maxLength={100}
                />
              </label>
              <label>
                Contato <span className="request-optional">opcional</span>
                <input
                  name="contact"
                  placeholder="Telefone ou e-mail"
                  maxLength={120}
                />
              </label>
              <label>
                Localização
                <input
                  name="location"
                  placeholder="Endereço, bairro ou comunidade"
                  required
                  maxLength={180}
                />
              </label>
              <label>
                Canal de entrada
                <select name="channel" defaultValue="Presencial" required>
                  <option>Presencial</option>
                  <option>Telefone</option>
                  <option>Portal demonstrativo</option>
                  <option>E-mail</option>
                  <option>Aplicativo</option>
                </select>
              </label>
              <label>
                Secretaria responsável
                <select name="department" defaultValue="" required>
                  <option value="" disabled>
                    Selecione a secretaria
                  </option>
                  {departments.map((department) => (
                    <option key={department.name}>{department.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Prioridade
                <select name="priority" defaultValue="Normal" required>
                  <option>Baixa</option>
                  <option>Normal</option>
                  <option>Alta</option>
                  <option>Urgente</option>
                </select>
              </label>
              <div className="request-deadline-note">
                <Clock3 size={15} /> Prazo demonstrativo inicial: cinco dias
                após o registro.
              </div>
              <div className="operator-entry-actions">
                <button
                  type="button"
                  className="operator-cancel"
                  onClick={() => setRequestOpen(false)}
                >
                  Cancelar
                </button>
                <button className="workspace-primary-button" type="submit">
                  <FilePlus2 size={15} /> Gerar protocolo
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function WorkspaceMetric({
  icon,
  label,
  value,
  detail,
  tone = "blue",
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: "blue" | "green" | "amber" | "red";
}) {
  return (
    <article className={`workspace-metric workspace-metric-${tone}`}>
      <span className="workspace-metric-icon">{icon}</span>
      <span className="workspace-metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function SecretaryPriorityCard({ priority }: { priority: Priority }) {
  const source = dataLineage[priority.sourceId];
  return (
    <article className="secretary-action-card">
      <span
        className={`secretary-action-icon secretary-action-${priority.level === "Crítico" ? "red" : "amber"}`}
      >
        <Activity size={17} />
      </span>
      <div>
        <div className="secretary-action-kicker">
          {priority.level.toUpperCase()} · {priority.reference}
        </div>
        <strong>{priority.title}</strong>
        <p>{priority.description}</p>
        <div className="secretary-action-meta">
          <span>
            <b>Responsável:</b> {priority.owner}
          </span>
          <span>
            <b>Impacto:</b> {priority.impact}
          </span>
        </div>
        <div className="workspace-cross-area secretary-origin">
          <strong>Origem e regra do indicador</strong>
          <p>
            {source.modules.join(" · ")} — {source.calculation}
          </p>
        </div>
      </div>
    </article>
  );
}
