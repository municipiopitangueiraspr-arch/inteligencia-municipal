import {
  lazy,
  Suspense,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ClipboardPlus,
  Clock3,
  ClipboardList,
  FilePlus2,
  LogOut,
  MapPinned,
  MapPin,
  Pill,
  ShieldCheck,
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
import HealthReferralRegulationModule from "./HealthReferralRegulationModule";
import {
  getHealthReferralSummary,
  type HealthReferralsDataset,
} from "../data/healthReferrals";
import HealthExamsProceduresModule from "./HealthExamsProceduresModule";
import type { HealthDiagnosticsDataset } from "../data/healthDiagnostics";
import PeopleFamiliesDomicilesModule from "./PeopleFamiliesDomicilesModule";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";
import type { HealthSanitaryDataset } from "../data/healthSanitary";
import type { HealthEpidemiologyDataset } from "../data/healthEpidemiology";
import type { HealthImmunizationDataset } from "../data/healthImmunization";
import type { HealthPharmacyDataset } from "../data/healthPharmacy";
import type { HealthMaternalDataset } from "../data/healthMaternal";

const HealthSanitarySurveillanceModule = lazy(
  () => import("./HealthSanitarySurveillanceModule"),
);
const HealthEpidemiologyModule = lazy(
  () => import("./HealthEpidemiologyModule"),
);
const HealthImmunizationModule = lazy(
  () => import("./HealthImmunizationModule"),
);
const HealthPharmacyModule = lazy(() => import("./HealthPharmacyModule"));
const HealthMaternalModule = lazy(() => import("./HealthMaternalModule"));

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
  healthReferrals: HealthReferralsDataset;
  onHealthReferralsChange: (
    update: (current: HealthReferralsDataset) => HealthReferralsDataset,
  ) => void;
  healthDiagnostics: HealthDiagnosticsDataset;
  onHealthDiagnosticsChange: (
    update: (current: HealthDiagnosticsDataset) => HealthDiagnosticsDataset,
  ) => void;
  healthSanitary: HealthSanitaryDataset;
  onHealthSanitaryChange: (
    update: (current: HealthSanitaryDataset) => HealthSanitaryDataset,
  ) => void;
  healthEpidemiology: HealthEpidemiologyDataset;
  onHealthEpidemiologyChange: (
    update: (current: HealthEpidemiologyDataset) => HealthEpidemiologyDataset,
  ) => void;
  healthImmunization: HealthImmunizationDataset;
  onHealthImmunizationChange: (
    update: (current: HealthImmunizationDataset) => HealthImmunizationDataset,
  ) => void;
  healthPharmacy: HealthPharmacyDataset;
  onHealthPharmacyChange: (
    update: (current: HealthPharmacyDataset) => HealthPharmacyDataset,
  ) => void;
  healthMaternal: HealthMaternalDataset;
  onHealthMaternalChange: (
    update: (current: HealthMaternalDataset) => HealthMaternalDataset,
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
    "Atenção à Saúde da Mulher, Pré-Natal e Puerpério",
    "Estabelecimentos e licenciamento",
    "Inspeções, providências e retornos",
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
    id: "maternal",
    label: "Operador de Acompanhamento Materno · demonstração",
    unit: "Unidade Básica de Saúde · cenário fictício",
    description:
      "Organização administrativa de etapas e pendências fictícias de acompanhamento.",
    modules: [
      "Atenção à Saúde da Mulher",
      "Etapas demonstrativas",
      "Pendências administrativas",
    ],
    fields: [],
    tasks: [],
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
  {
    id: "visa",
    label: "Fiscal da Vigilância Sanitária",
    unit: "Vigilância Sanitária · cenário demonstrativo",
    description:
      "Cadastro local de estabelecimentos, agenda fictícia de inspeções e acompanhamento de providências.",
    modules: [
      "Estabelecimentos e licenciamento",
      "Inspeções demonstrativas",
      "Providências e retornos",
    ],
    fields: [
      {
        label: "Estabelecimento",
        placeholder: "Ex.: estabelecimento sintético SIM-VSA-EST-001",
      },
      {
        label: "Atividade e localidade",
        placeholder: "Atividade declarada e endereço fictício",
      },
      {
        label: "Inspeção ou etapa",
        placeholder: "Ex.: retorno demonstrativo programado",
      },
      {
        label: "Providência e prazo",
        placeholder: "Nota e data de referência",
      },
    ],
    tasks: [
      {
        id: "SIM-VSA-INS-002",
        title: "Acompanhar providência demonstrativa",
        time: "10h00 · Estabelecimento sintético",
        source:
          "Inspeção fictícia SIM-VSA-INS-002 → histórico e prazo de referência",
      },
      {
        id: "SIM-VSA-INS-003",
        title: "Preparar retorno da agenda demonstrativa",
        time: "14h00 · Setor fictício",
        source:
          "Inspeção fictícia SIM-VSA-INS-003 → estabelecimento SIM-VSA-EST-003",
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
  healthReferrals,
  onHealthReferralsChange,
  healthDiagnostics,
  onHealthDiagnosticsChange,
  healthSanitary,
  onHealthSanitaryChange,
  healthEpidemiology,
  onHealthEpidemiologyChange,
  healthImmunization,
  onHealthImmunizationChange,
  healthPharmacy,
  onHealthPharmacyChange,
  healthMaternal,
  onHealthMaternalChange,
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
    | "health-referrals"
    | "health-diagnostics"
    | "health-sanitary"
    | "health-epidemiology"
    | "health-immunization"
    | "health-pharmacy"
    | "health-maternal"
  >("overview");
  const [entryOpen, setEntryOpen] = useState(false);
  const [healthWorkflowOpen, setHealthWorkflowOpen] = useState(false);
  const [healthReferralOpen, setHealthReferralOpen] = useState(false);
  const [healthDiagnosticsOpen, setHealthDiagnosticsOpen] = useState(false);
  const [healthSanitaryOpen, setHealthSanitaryOpen] = useState(false);
  const [healthMaternalOpen, setHealthMaternalOpen] = useState(false);
  const [diagnosticsSourceServiceId, setDiagnosticsSourceServiceId] = useState<
    string | undefined
  >();
  const [diagnosticsSourceReferralId, setDiagnosticsSourceReferralId] =
    useState<string | undefined>();
  const [diagnosticsReturnTab, setDiagnosticsReturnTab] = useState<
    "services" | "health-activities" | "health-referrals"
  >("services");
  const [referralSourceServiceId, setReferralSourceServiceId] = useState<
    string | undefined
  >();
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

  const clinicalReferralSummary = useMemo(
    () => getHealthReferralSummary(healthReferrals.referrals),
    [healthReferrals.referrals],
  );
  const departmentPriorities = useMemo(
    () =>
      priorities
        .filter((priority) => priority.department === selectedDepartment.name)
        .flatMap((priority) => {
          if (priority.sourceId !== "clinical-referrals") return [priority];
          if (clinicalReferralSummary.waiting === 0) return [];
          return [
            {
              ...priority,
              title:
                clinicalReferralSummary.waitingOver60Days > 0
                  ? `${clinicalReferralSummary.waitingOver60Days} encaminhamentos aguardam consulta especializada há mais de 60 dias`
                  : `${clinicalReferralSummary.waiting} encaminhamentos aguardam consulta especializada`,
              description: `${clinicalReferralSummary.waiting} encaminhamentos clínicos aguardam vaga. A fila é separada das solicitações administrativas municipais.`,
              action:
                clinicalReferralSummary.waitingOver60Days > 0
                  ? `Revisar os ${clinicalReferralSummary.waitingOver60Days} casos com maior espera e confirmar ofertas regionais.`
                  : "Acompanhar a fila e confirmar ofertas de vagas com a regulação regional.",
              impact: `${clinicalReferralSummary.waiting} encaminhamentos clínicos em acompanhamento`,
              reference: "Atualizado pelos registros demonstrativos da sessão",
            },
          ];
        }),
    [clinicalReferralSummary, selectedDepartment.name],
  );
  const isSecretary = experience === "secretary";
  const isHealthDepartment =
    selectedDepartment.name === "Saúde e Vigilância Sanitária";
  const healthOperatorPersona = (["acs", "ace", "ubs"] as const).includes(
    selectedPersona.id as HealthOperatorPersona,
  )
    ? (selectedPersona.id as HealthOperatorPersona)
    : undefined;
  const sanitaryOperator = selectedPersona.id === "visa";
  const maternalOperator = selectedPersona.id === "maternal";
  const maternalOperatorTasks = healthMaternal.pendings
    .filter((pending) => pending.status === "Aberta")
    .map((pending) => ({
      id: pending.id,
      title: pending.title,
      time: pending.dueAt
        ? `${formatRequestDate(pending.dueAt)} · Prazo administrativo fictício`
        : "Sem prazo · Pendência administrativa fictícia",
      source: `Acompanhamento sintético ${pending.followUpId}`,
    }));
  const personaTasks = maternalOperator
    ? maternalOperatorTasks
    : selectedPersona.tasks;
  const openHealthRegulation = (serviceRecordId?: string) => {
    setReferralSourceServiceId(serviceRecordId);
    if (isSecretary) {
      setActiveSecretaryTab("health-referrals");
      return;
    }
    setHealthWorkflowOpen(false);
    setHealthReferralOpen(true);
  };
  const openHealthDiagnostics = (source?: {
    serviceRecordId?: string;
    referralId?: string;
  }) => {
    setDiagnosticsSourceServiceId(source?.serviceRecordId);
    setDiagnosticsSourceReferralId(source?.referralId);
    if (isSecretary) {
      setDiagnosticsReturnTab(
        source?.referralId
          ? "health-referrals"
          : source?.serviceRecordId
            ? "health-activities"
            : "services",
      );
      setActiveSecretaryTab("health-diagnostics");
      return;
    }
    setHealthWorkflowOpen(false);
    setHealthReferralOpen(false);
    setHealthDiagnosticsOpen(true);
  };
  const selectedDepartmentSummary =
    selectedDepartment.name === "Saúde e Vigilância Sanitária"
      ? {
          ...selectedDepartment,
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
      : selectedDepartment;
  const departmentRequestCounts = getDepartmentRequestCounts(
    requests,
    selectedDepartment.name,
  );
  const operatorRequests = requests.filter((request) =>
    createdRequestIds.includes(request.id),
  );
  const personaTaskCount =
    personaTasks.length +
    (maternalOperator ? 0 : operatorEntries.length + operatorRequests.length);
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
                    setActiveSecretaryTab(
                      department.name === "Saúde e Vigilância Sanitária"
                        ? "services"
                        : "overview",
                    );
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
                setHealthReferralOpen(false);
                setHealthDiagnosticsOpen(false);
                setHealthSanitaryOpen(false);
                setHealthMaternalOpen(false);
                setReferralSourceServiceId(undefined);
                setDiagnosticsSourceServiceId(undefined);
                setDiagnosticsSourceReferralId(undefined);
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
                <p>{selectedDepartmentSummary.summary}</p>
              </div>
              {!isHealthDepartment && (
                <button
                  className="workspace-primary-button"
                  onClick={() => setActiveSecretaryTab("requests")}
                >
                  <ClipboardList size={16} /> Ver solicitações
                </button>
              )}
            </div>
            {isHealthDepartment && activeSecretaryTab !== "services" && (
              <button
                type="button"
                className="health-secretary-hub-back"
                onClick={() => setActiveSecretaryTab("services")}
              >
                <ArrowLeft size={15} /> Voltar aos módulos e serviços
              </button>
            )}
            <div
              className={`workspace-tabs${isHealthDepartment ? " workspace-tabs-hidden" : ""}`}
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
                  <button
                    className={
                      activeSecretaryTab === "health-referrals" ? "active" : ""
                    }
                    onClick={() => {
                      setReferralSourceServiceId(undefined);
                      setActiveSecretaryTab("health-referrals");
                    }}
                  >
                    <ArrowRight size={14} /> Encaminhamentos e Regulação
                  </button>
                  <button
                    className={
                      activeSecretaryTab === "health-diagnostics"
                        ? "active"
                        : ""
                    }
                    onClick={() => {
                      setDiagnosticsReturnTab("services");
                      setDiagnosticsSourceServiceId(undefined);
                      setDiagnosticsSourceReferralId(undefined);
                      setActiveSecretaryTab("health-diagnostics");
                    }}
                  >
                    <ClipboardPlus size={14} /> Exames, Procedimentos e
                    Resultados
                  </button>
                  <button
                    className={
                      activeSecretaryTab === "health-sanitary" ? "active" : ""
                    }
                    onClick={() => setActiveSecretaryTab("health-sanitary")}
                  >
                    <ShieldCheck size={14} /> Vigilância Sanitária
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
                    value={selectedDepartmentSummary.status}
                    detail="derivada das filas demonstrativas"
                    tone={
                      selectedDepartmentSummary.status === "Crítico"
                        ? "red"
                        : selectedDepartmentSummary.status === "Atenção"
                          ? "amber"
                          : "green"
                    }
                  />
                  <WorkspaceMetric
                    icon={<UsersRound size={17} />}
                    label={selectedDepartmentSummary.metricLabel}
                    value={selectedDepartmentSummary.metric}
                    detail={selectedDepartmentSummary.trend}
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
                      <strong>{selectedDepartmentSummary.nextAction}</strong>
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
                      {isHealthDepartment
                        ? "Módulos e serviços da Secretaria de Saúde"
                        : `Serviços e módulos de ${selectedDepartment.shortName}`}
                    </h2>
                  </div>
                  <span className="workspace-count">
                    {isHealthDepartment
                      ? "12 acessos"
                      : `${secretariatAreas.length} áreas`}
                  </span>
                </div>
                {!isHealthDepartment && (
                  <div className="service-module-grid">
                    {secretariatAreas.map((area, index) => (
                      <article className="service-module-card" key={area}>
                        <span className="service-module-number">
                          0{index + 1}
                        </span>
                        <h3>{area}</h3>
                        <p>
                          Rotina municipal demonstrativa, com cadastros,
                          tarefas, histórico e relatórios ligados à área.
                        </p>
                        <span>ÁREA PREVISTA NA PLATAFORMA</span>
                      </article>
                    ))}
                  </div>
                )}
                {isHealthDepartment && (
                  <>
                    <div className="health-module-launch-grid">
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
                            familiares, endereços compartilhados e mapa
                            agregado.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir módulo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() =>
                          setActiveSecretaryTab("health-activities")
                        }
                      >
                        <span className="health-module-launch-icon">
                          <Activity size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>Visitas e Atendimentos</strong>
                          <small>
                            Roteiros de ACS/ACE, registros da UBS, resultados,
                            retornos e histórico vinculados ao cadastro
                            territorial.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir módulo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() => {
                          setReferralSourceServiceId(undefined);
                          setActiveSecretaryTab("health-referrals");
                        }}
                      >
                        <span className="health-module-launch-icon">
                          <Activity size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>Encaminhamentos e Regulação</strong>
                          <small>
                            Fila clínica demonstrativa, tempo de espera,
                            ofertas, agendamentos, desfechos e histórico do
                            pedido.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir módulo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() => {
                          setDiagnosticsReturnTab("services");
                          setDiagnosticsSourceServiceId(undefined);
                          setDiagnosticsSourceReferralId(undefined);
                          setActiveSecretaryTab("health-diagnostics");
                        }}
                      >
                        <span className="health-module-launch-icon">
                          <ClipboardPlus size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>Exames, Procedimentos e Resultados</strong>
                          <small>
                            Pedidos clínicos vinculados a pessoas e eventos
                            existentes, com agenda, execução, resultados e
                            histórico.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir módulo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() => setActiveSecretaryTab("health-sanitary")}
                      >
                        <span className="health-module-launch-icon">
                          <ShieldCheck size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>Vigilância Sanitária</strong>
                          <small>
                            Estabelecimentos, acompanhamento local de licenças,
                            inspeções, providências e retornos demonstrativos.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir módulo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() =>
                          setActiveSecretaryTab("health-epidemiology")
                        }
                      >
                        <span className="health-module-launch-icon">
                          <Activity size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>
                            Vigilância Epidemiológica e Acompanhamento de
                            Agravos
                          </strong>
                          <small>
                            Notificações demonstrativas ligadas a pessoas,
                            visitas e atendimentos já cadastrados.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir módulo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() =>
                          setActiveSecretaryTab("health-immunization")
                        }
                      >
                        <span className="health-module-launch-icon">
                          <Activity size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>Imunização e Vacinação</strong>
                          <small>
                            Esquemas e doses fictícias, próximas datas e fila de
                            busca ativa ilustrativa.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir módulo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() => setActiveSecretaryTab("health-pharmacy")}
                      >
                        <span className="health-module-launch-icon">
                          <Pill size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>
                            Assistência Farmacêutica e Gestão de Medicamentos
                          </strong>
                          <small>
                            Estoques, lotes, validade e movimentações fictícias
                            por unidade.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir módulo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() => setActiveSecretaryTab("health-maternal")}
                      >
                        <span className="health-module-launch-icon">
                          <CalendarDays size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>Atenção à Saúde da Mulher, Pré-Natal e Puerpério</strong>
                          <small>
                            Etapas de acompanhamento e pendências administrativas fictícias, sem condutas clínicas.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir módulo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() => setActiveSecretaryTab("overview")}
                      >
                        <span className="health-module-launch-icon">
                          <Activity size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>Resumo e prioridades</strong>
                          <small>
                            Indicadores da pasta, prioridades e atualizações
                            recentes da Secretaria.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir resumo <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() => setActiveSecretaryTab("requests")}
                      >
                        <span className="health-module-launch-icon">
                          <ClipboardList size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>Solicitações administrativas</strong>
                          <small>
                            Consulte demandas da Secretaria e acompanhe os
                            respectivos encaminhamentos e prazos.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir solicitações <ArrowRight size={14} />
                        </span>
                      </button>
                      <button
                        type="button"
                        className="health-module-launch-card"
                        onClick={() => setActiveSecretaryTab("records")}
                      >
                        <span className="health-module-launch-icon">
                          <FilePlus2 size={19} />
                        </span>
                        <span className="health-module-launch-copy">
                          <strong>Ações e registros</strong>
                          <small>
                            Registre uma atualização demonstrativa da Secretaria
                            nesta sessão.
                          </small>
                        </span>
                        <span className="health-module-launch-action">
                          Abrir registros <ArrowRight size={14} />
                        </span>
                      </button>
                    </div>
                  </>
                )}
                {!isHealthDepartment && (
                  <div className="workspace-cross-area">
                    <strong>Integração dentro da prefeitura</strong>
                    <p>
                      Solicitações, unidades, profissionais, endereços, veículos
                      e ordens de serviço podem ser relacionados ao processo sem
                      repetir o cadastro do mesmo objeto em cada área.
                    </p>
                  </div>
                )}
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
                  onOpenRegulation={openHealthRegulation}
                  onOpenDiagnostics={(serviceRecordId) =>
                    openHealthDiagnostics({ serviceRecordId })
                  }
                />
              )}
            {activeSecretaryTab === "health-referrals" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <HealthReferralRegulationModule
                  mode="secretary"
                  dataset={healthReferrals}
                  healthActivities={healthActivities}
                  peopleRegistry={peopleRegistry}
                  healthTerritory={healthTerritory}
                  onChange={onHealthReferralsChange}
                  initialServiceRecordId={referralSourceServiceId}
                  onOpenDiagnostics={(referralId) =>
                    openHealthDiagnostics({ referralId })
                  }
                  onBack={() => {
                    setReferralSourceServiceId(undefined);
                    setActiveSecretaryTab("health-activities");
                  }}
                />
              )}
            {activeSecretaryTab === "health-diagnostics" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <HealthExamsProceduresModule
                  mode="secretary"
                  dataset={healthDiagnostics}
                  healthActivities={healthActivities}
                  healthReferrals={healthReferrals}
                  peopleRegistry={peopleRegistry}
                  healthTerritory={healthTerritory}
                  onChange={onHealthDiagnosticsChange}
                  initialServiceRecordId={diagnosticsSourceServiceId}
                  initialReferralId={diagnosticsSourceReferralId}
                  onBack={() => {
                    setActiveSecretaryTab(diagnosticsReturnTab);
                    setDiagnosticsSourceServiceId(undefined);
                    setDiagnosticsSourceReferralId(undefined);
                  }}
                />
              )}
            {activeSecretaryTab === "health-sanitary" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <Suspense
                  fallback={
                    <div className="workspace-cross-area" role="status">
                      <strong>Carregando Vigilância Sanitária...</strong>
                    </div>
                  }
                >
                  <HealthSanitarySurveillanceModule
                    mode="secretary"
                    dataset={healthSanitary}
                    onChange={onHealthSanitaryChange}
                    onBack={() => setActiveSecretaryTab("services")}
                  />
                </Suspense>
              )}
            {activeSecretaryTab === "health-epidemiology" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <Suspense
                  fallback={
                    <div className="workspace-cross-area" role="status">
                      <strong>Carregando Vigilância Epidemiológica...</strong>
                    </div>
                  }
                >
                  <HealthEpidemiologyModule
                    dataset={healthEpidemiology}
                    peopleRegistry={peopleRegistry}
                    healthActivities={healthActivities}
                    onChange={onHealthEpidemiologyChange}
                    onBack={() => setActiveSecretaryTab("services")}
                  />
                </Suspense>
              )}
            {activeSecretaryTab === "health-immunization" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <Suspense
                  fallback={
                    <div className="workspace-cross-area" role="status">
                      <strong>Carregando Imunização e Vacinação...</strong>
                    </div>
                  }
                >
                  <HealthImmunizationModule
                    dataset={healthImmunization}
                    peopleRegistry={peopleRegistry}
                    healthTerritory={healthTerritory}
                    onChange={onHealthImmunizationChange}
                    onBack={() => setActiveSecretaryTab("services")}
                  />
                </Suspense>
              )}
              {activeSecretaryTab === "health-pharmacy" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <Suspense
                  fallback={
                    <div className="workspace-cross-area" role="status">
                      <strong>Carregando Assistência Farmacêutica...</strong>
                    </div>
                  }
                >
                  <HealthPharmacyModule
                    dataset={healthPharmacy}
                    peopleRegistry={peopleRegistry}
                    healthTerritory={healthTerritory}
                    onChange={onHealthPharmacyChange}
                    onBack={() => setActiveSecretaryTab("services")}
                  />
                </Suspense>
              )}
            {activeSecretaryTab === "health-maternal" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <Suspense
                  fallback={
                    <div className="workspace-cross-area" role="status">
                      <strong>Carregando Atenção à Saúde da Mulher...</strong>
                    </div>
                  }
                >
                  <HealthMaternalModule
                    mode="secretary"
                    dataset={healthMaternal}
                    peopleRegistry={peopleRegistry}
                    healthTerritory={healthTerritory}
                    onChange={onHealthMaternalChange}
                    onBack={() => setActiveSecretaryTab("services")}
                  />
                </Suspense>
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
                    placeholder={`Ex.: ${selectedDepartmentSummary.nextAction}`}
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
                  else if (sanitaryOperator) setHealthSanitaryOpen(true);
                  else if (maternalOperator) setHealthMaternalOpen(true);
                  else setEntryOpen(true);
                }}
              >
                <FilePlus2 size={16} />
                {healthOperatorPersona
                  ? "Abrir módulo de Saúde"
                  : sanitaryOperator
                    ? "Abrir módulo de Vigilância Sanitária"
                    : maternalOperator
                      ? "Abrir acompanhamento demonstrativo"
                    : "Registrar atividade"}
              </button>
              {healthOperatorPersona === "ubs" && (
                <button
                  className="workspace-secondary-button"
                  onClick={() => openHealthRegulation()}
                >
                  <Activity size={16} /> Abrir fila de encaminhamentos
                </button>
              )}
              {healthOperatorPersona === "ubs" && (
                <button
                  className="workspace-secondary-button"
                  onClick={() => openHealthDiagnostics()}
                >
                  <ClipboardPlus size={16} /> Exames, procedimentos e resultados
                </button>
              )}
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
                onOpenRegulation={openHealthRegulation}
                onOpenDiagnostics={(serviceRecordId) =>
                  openHealthDiagnostics({ serviceRecordId })
                }
                onBack={() => setHealthWorkflowOpen(false)}
              />
            )}
            {healthReferralOpen && healthOperatorPersona === "ubs" && (
              <HealthReferralRegulationModule
                mode="operator"
                dataset={healthReferrals}
                healthActivities={healthActivities}
                peopleRegistry={peopleRegistry}
                healthTerritory={healthTerritory}
                onChange={onHealthReferralsChange}
                initialServiceRecordId={referralSourceServiceId}
                onOpenDiagnostics={(referralId) =>
                  openHealthDiagnostics({ referralId })
                }
                onBack={() => {
                  setHealthReferralOpen(false);
                  setReferralSourceServiceId(undefined);
                }}
              />
            )}
            {healthDiagnosticsOpen && healthOperatorPersona === "ubs" && (
              <HealthExamsProceduresModule
                key={`${selectedPersona.id}-${diagnosticsSourceServiceId ?? ""}-${diagnosticsSourceReferralId ?? ""}`}
                mode="operator"
                dataset={healthDiagnostics}
                healthActivities={healthActivities}
                healthReferrals={healthReferrals}
                peopleRegistry={peopleRegistry}
                healthTerritory={healthTerritory}
                onChange={onHealthDiagnosticsChange}
                initialServiceRecordId={diagnosticsSourceServiceId}
                initialReferralId={diagnosticsSourceReferralId}
                onBack={() => {
                  setHealthDiagnosticsOpen(false);
                  if (diagnosticsSourceReferralId) setHealthReferralOpen(true);
                  else if (diagnosticsSourceServiceId)
                    setHealthWorkflowOpen(true);
                  setDiagnosticsSourceServiceId(undefined);
                  setDiagnosticsSourceReferralId(undefined);
                }}
              />
            )}
            {healthSanitaryOpen && sanitaryOperator && (
              <Suspense
                fallback={
                  <div className="workspace-cross-area" role="status">
                    <strong>Carregando Vigilância Sanitária...</strong>
                  </div>
                }
              >
                <HealthSanitarySurveillanceModule
                  mode="operator"
                  dataset={healthSanitary}
                  onChange={onHealthSanitaryChange}
                  onBack={() => setHealthSanitaryOpen(false)}
                />
              </Suspense>
            )}
            {healthMaternalOpen && maternalOperator && (
              <Suspense
                fallback={
                  <div className="workspace-cross-area" role="status">
                    <strong>Carregando acompanhamento demonstrativo...</strong>
                  </div>
                }
              >
                <HealthMaternalModule
                  mode="operator"
                  dataset={healthMaternal}
                  peopleRegistry={peopleRegistry}
                  healthTerritory={healthTerritory}
                  onChange={onHealthMaternalChange}
                  onBack={() => setHealthMaternalOpen(false)}
                />
              </Suspense>
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
                <span>{maternalOperator ? "PENDÊNCIAS ADMINISTRATIVAS · 19/NOV/2026" : "AGENDA DE HOJE · 19/NOV/2026"}</span>
                <strong>{selectedPersona.label}</strong>
                <p>
                  {maternalOperator
                    ? "As pendências desta fila são conferências administrativas fictícias, não prazos assistenciais."
                    : "As tarefas mostram de qual agenda, serviço ou registro elas foram originadas."}
                </p>
              </div>
              <div className="operator-context-count">
                <strong>{personaTaskCount}</strong>
                <span>itens na rotina</span>
              </div>
            </div>
            <div className="workspace-section-heading">
              <div>
                <span>{maternalOperator ? "PENDÊNCIAS ADMINISTRATIVAS" : "FILA DE ATIVIDADES"}</span>
                <h2>{maternalOperator ? "Pendências abertas nesta sessão" : "Próximos atendimentos e tarefas"}</h2>
              </div>
              <span className="workspace-count">
                {personaTasks.length} {maternalOperator ? "pendências abertas" : "agendados"}
              </span>
            </div>
            <div className="operator-task-list">
              {personaTasks.map((task, index) => (
                <article className="operator-task-card" key={task.id}>
                  <div className="operator-task-time">
                    <strong>{task.time.split(" · ")[0]}</strong>
                    <span>{maternalOperator ? "PENDÊNCIA" : index === 0 ? "PRÓXIMA" : "NA SEQUÊNCIA"}</span>
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
                      <strong>{maternalOperator ? "Pendência administrativa demonstrativa" : "O que será atualizado"}</strong>
                      <p>
                        {maternalOperator
                          ? "A pendência está vinculada a um registro sintético. Abra o módulo para atualizar somente a situação administrativa; não inclua dados reais ou informações clínicas."
                          : "Ao registrar a atividade, o profissional informa local/unidade, atividade realizada, resultado, situação e próxima providência. O registro atualiza a fila da equipe e os resumos relacionados nesta simulação."}
                      </p>
                      <button
                        onClick={() => {
                          if (healthOperatorPersona)
                            setHealthWorkflowOpen(true);
                          else if (sanitaryOperator)
                            setHealthSanitaryOpen(true);
                          else if (maternalOperator)
                            setHealthMaternalOpen(true);
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
