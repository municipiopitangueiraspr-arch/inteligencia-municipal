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
import type { HealthChildDataset } from "../data/healthChild";
import HealthSummaryModule, {
  type SourceKey as HealthSummarySourceKey,
} from "./HealthSummaryModule";
import SharedQuestionnairesModule from "./SharedQuestionnairesModule";
import type { SharedQuestionnairesDataset } from "../data/sharedQuestionnaires";

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
const HealthChildModule = lazy(() => import("./HealthChildModule"));

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
  healthChild: HealthChildDataset;
  onHealthChildChange: (
    update: (current: HealthChildDataset) => HealthChildDataset,
  ) => void;
  sharedQuestionnaires: SharedQuestionnairesDataset;
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
    "Acompanhamento da Criança",
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
    id: "child",
    label: "Operador de Acompanhamento da Criança · demonstração",
    unit: "Atenção Primária à Saúde · cenário fictício",
    description:
      "Recepção e conferência administrativa da transição do puerpério para a APS.",
    modules: [
      "Acompanhamento da Criança",
      "Transição administrativa do puerpério à APS",
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

type HealthModuleGlyphKind =
  | "questionnaires"
  | "territory"
  | "people"
  | "activities"
  | "referrals"
  | "diagnostics"
  | "sanitary"
  | "epidemiology"
  | "immunization"
  | "pharmacy"
  | "maternal"
  | "child"
  | "summary"
  | "requests"
  | "records";

function HealthModuleGlyph({ kind }: { kind: HealthModuleGlyphKind }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
  };
  const shapes: Record<HealthModuleGlyphKind, ReactNode> = {
    questionnaires: <><path {...common} d="M9 5.5h10l4 4v17H9z" /><path {...common} d="M19 5.5v4h4M12 14h8M12 18h8M12 22h5" /><path {...common} d="M6 8.5H5a2 2 0 0 0-2 2v16h14" /></>,
    territory: <><path {...common} d="M4 8.5 12 5l8 3 8-3v18.5l-8 3-8-3-8 3z" /><path {...common} d="M12 5v18.5M20 8v18.5" /><circle {...common} cx="16" cy="13" r="2.2" /><path {...common} d="M16 15.2v4.3" /></>,
    people: <><circle {...common} cx="12" cy="10" r="3.2" /><circle {...common} cx="22" cy="11" r="2.5" /><path {...common} d="M5 25c.8-4 3.2-6 7-6s6.2 2 7 6M19 19c3.5-.2 5.7 1.7 6.5 5" /></>,
    activities: <><path {...common} d="M3 17h5l2.4-7 4.2 13 2.7-8H29" /><path {...common} d="M5 7v-2M27 7v-2" /></>,
    referrals: <><circle {...common} cx="8" cy="16" r="3" /><circle {...common} cx="24" cy="9" r="3" /><path {...common} d="M10.7 14.8 21.3 10.2M21 22H11M11 22l3-3M11 22l3 3" /></>,
    diagnostics: <><rect {...common} x="7" y="4" width="18" height="24" rx="2" /><path {...common} d="M12 4v-1h8v1M11 12h10M11 17h4M18 17h3M11 22h10" /><circle {...common} cx="15" cy="22" r=".5" /></>,
    sanitary: <><path {...common} d="M16 4 26 8v7c0 6-4.2 10-10 13C10.2 25 6 21 6 15V8z" /><path {...common} d="m11.5 16 3 3 6-7" /></>,
    epidemiology: <><path {...common} d="M4 23h5l2.5-9 4 5 3-11 3 15H28" /><circle {...common} cx="11.5" cy="14" r="1.5" /></>,
    immunization: <><path {...common} d="m8 7 17 17M12 3l17 17M7 8l5-5M3 29l8-8" /><path {...common} d="m18 10 4-4M10 18l-4 4" /><circle {...common} cx="23" cy="23" r="4" /></>,
    pharmacy: <><rect {...common} x="7" y="5" width="18" height="22" rx="3" /><path {...common} d="M12 5v22M12 11h13M16 18h6M19 15v6" /></>,
    maternal: <><circle {...common} cx="16" cy="8" r="3" /><path {...common} d="M10 27c0-5 2-9 6-9s6 4 6 9M8 15c2 1 3 2 4 4M24 15c-2 1-3 2-4 4" /><path {...common} d="M13 25h6" /></>,
    child: <><circle {...common} cx="16" cy="8" r="3" /><path {...common} d="M10 27c.4-5.2 2.2-9 6-9s5.6 3.8 6 9M10 18l-3 4M22 18l3 4M13 13h6" /></>,
    summary: <><path {...common} d="M6 26V15M13 26V8M20 26v-5M27 26V4" /><path {...common} d="M4 26h25" /></>,
    requests: <><path {...common} d="M7 5h14l4 4v18H7z" /><path {...common} d="M21 5v5h4M11 15h10M11 19h10M11 23h6" /></>,
    records: <><path {...common} d="M8 4h16v24H8zM12 9h8M12 14h8M12 19h5" /><path {...common} d="m5 8-2 2 2 2M27 20l2 2-2 2" /></>,
  };
  return <svg className="health-module-glyph" viewBox="0 0 32 32" aria-hidden="true">{shapes[kind]}</svg>;
}

type HealthCatalogModule = {
  kind: HealthModuleGlyphKind;
  title: string;
  description: string;
  onOpen: () => void;
  action?: string;
};

function HealthCatalogCard({ kind, title, description, onOpen, action = "Abrir" }: HealthCatalogModule) {
  return (
    <button type="button" className="health-catalog-card" onClick={onOpen}>
      <span className="health-catalog-icon"><HealthModuleGlyph kind={kind} /></span>
      <strong>{title}</strong>
      <small>{description}</small>
      <span className="health-catalog-action">{action} <ArrowRight size={13} /></span>
    </button>
  );
}

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
  healthChild,
  onHealthChildChange,
  sharedQuestionnaires,
  onCreateRequest,
  onUpdateRequest,
  onSwitchExperience,
}: WorkspaceProps) {
  const [selectedDepartment, setSelectedDepartment] = useState<Department>(
    departments.find((department) => department.name === "Educação")!,
  );
  const [selectedPersona, setSelectedPersona] = useState<Persona>(
    operatorPersonas.find((persona) => persona.id === "school")!,
  );
  const [generalRegistryOpen, setGeneralRegistryOpen] = useState(false);
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
    | "health-child"
    | "health-summary"
    | "questionnaires"
  >("overview");
  const [entryOpen, setEntryOpen] = useState(false);
  const [healthWorkflowOpen, setHealthWorkflowOpen] = useState(false);
  const [healthReferralOpen, setHealthReferralOpen] = useState(false);
  const [healthDiagnosticsOpen, setHealthDiagnosticsOpen] = useState(false);
  const [healthSanitaryOpen, setHealthSanitaryOpen] = useState(false);
  const [healthMaternalOpen, setHealthMaternalOpen] = useState(false);
  const [healthChildOpen, setHealthChildOpen] = useState(false);
  const [returnToChildAfterMaternal, setReturnToChildAfterMaternal] =
    useState(false);
  const [maternalInitialFollowUpId, setMaternalInitialFollowUpId] = useState<
    string | undefined
  >();
  const [childInitialMaternalFollowUpId, setChildInitialMaternalFollowUpId] =
    useState<string | undefined>();
  const [childInitialPendingId, setChildInitialPendingId] = useState<
    string | undefined
  >();
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
  const childOperator = selectedPersona.id === "child";
  const administrativeOperator = maternalOperator || childOperator;
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
  const childOperatorTasks = healthChild.pendings
    .filter((pending) => pending.status === "Aberta")
    .map((pending) => ({
      id: pending.id,
      title: pending.title,
      time: "Sem prazo assistencial · Conferência administrativa",
      source: `Transição sintética ${pending.transitionId}`,
    }));
  const personaTasks = maternalOperator
    ? maternalOperatorTasks
    : childOperator
      ? childOperatorTasks
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
  const openHealthChild = (maternalFollowUpId?: string, pendingId?: string) => {
    setChildInitialMaternalFollowUpId(maternalFollowUpId);
    setChildInitialPendingId(pendingId);
    if (isSecretary) {
      setActiveSecretaryTab("health-child");
      return;
    }
    setHealthWorkflowOpen(false);
    setHealthReferralOpen(false);
    setHealthDiagnosticsOpen(false);
    setHealthSanitaryOpen(false);
    setHealthMaternalOpen(false);
    setHealthChildOpen(true);
  };
  const openHealthMaternal = (maternalFollowUpId?: string) => {
    setMaternalInitialFollowUpId(maternalFollowUpId);
    if (isSecretary) {
      setActiveSecretaryTab("health-maternal");
      return;
    }
    if (childOperator) {
      setReturnToChildAfterMaternal(true);
      setSelectedPersona(
        operatorPersonas.find((persona) => persona.id === "maternal")!,
      );
    }
    setHealthChildOpen(false);
    setHealthMaternalOpen(true);
  };
  const openHealthSummarySource = (source: HealthSummarySourceKey) => {
    const sourceTabs: Record<
      HealthSummarySourceKey,
      typeof activeSecretaryTab
    > = {
      territory: "territory",
      activities: "health-activities",
      referrals: "health-referrals",
      diagnostics: "health-diagnostics",
      sanitary: "health-sanitary",
      epidemiology: "health-epidemiology",
      immunization: "health-immunization",
      pharmacy: "health-pharmacy",
      maternal: "health-maternal",
      child: "health-child",
      requests: "requests",
    };
    setActiveSecretaryTab(sourceTabs[source]);
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
  const intersectoralHealthRequests = requests.filter(
    (request) =>
      request.kind === "Encaminhamento intersetorial" &&
      request.targetDepartment === "Saúde e Vigilância Sanitária",
  );
  const operatorRequests = requests.filter((request) =>
    createdRequestIds.includes(request.id),
  );
  const personaTaskCount =
    personaTasks.length +
    (administrativeOperator
      ? 0
      : operatorEntries.length + operatorRequests.length);
  const secretariatAreas = departmentModules[selectedDepartment.name] ?? [];
  const updatesForDepartment = secretaryUpdates.filter(
    (update) => update.departmentName === selectedDepartment.name,
  );
  const healthModuleGroups: {
    id: string;
    title: string;
    accent: "blue" | "green" | "violet" | "orange";
    icon: HealthModuleGlyphKind;
    modules: HealthCatalogModule[];
  }[] = [
    {
      id: "management",
      title: "Gestão e Administração",
      accent: "blue",
      icon: "summary",
      modules: [
        { kind: "questionnaires", title: "Questionários compartilhados", description: "Modelos transversais para diferentes secretarias.", onOpen: () => setActiveSecretaryTab("questionnaires") },
        { kind: "territory", title: "Território, Unidades e Equipes", description: "Rede municipal, áreas de atuação e equipes.", onOpen: () => setActiveSecretaryTab("territory") },
        { kind: "summary", title: "Resumo e Prioridades", description: "Indicadores, prioridades e próximos passos.", onOpen: () => setActiveSecretaryTab("health-summary"), action: "Ver tudo" },
        { kind: "requests", title: "Solicitações Administrativas", description: "Demandas, encaminhamentos e prazos.", onOpen: () => setActiveSecretaryTab("requests") },
        { kind: "records", title: "Ações e Registros", description: "Atualizações locais da secretaria.", onOpen: () => setActiveSecretaryTab("records") },
      ],
    },
    {
      id: "care",
      title: "Atenção à Saúde",
      accent: "green",
      icon: "activities",
      modules: [
        { kind: "people", title: "Pessoas, Famílias e Domicílios", description: "Cadastro compartilhado e relações territoriais.", onOpen: () => setActiveSecretaryTab("people") },
        { kind: "activities", title: "Visitas e Atendimentos", description: "Rotinas de campo, UBS e histórico assistencial.", onOpen: () => setActiveSecretaryTab("health-activities") },
        { kind: "referrals", title: "Encaminhamentos e Regulação", description: "Fila, ofertas, retornos e desfechos.", onOpen: () => { setReferralSourceServiceId(undefined); setActiveSecretaryTab("health-referrals"); } },
        { kind: "diagnostics", title: "Exames e Medicamentos", description: "Pedidos, procedimentos e resultados.", onOpen: () => { setDiagnosticsReturnTab("services"); setDiagnosticsSourceServiceId(undefined); setDiagnosticsSourceReferralId(undefined); setActiveSecretaryTab("health-diagnostics"); } },
        { kind: "pharmacy", title: "Assistência Farmacêutica", description: "Estoques, lotes e movimentações por unidade.", onOpen: () => setActiveSecretaryTab("health-pharmacy") },
      ],
    },
    {
      id: "surveillance",
      title: "Vigilância em Saúde",
      accent: "violet",
      icon: "sanitary",
      modules: [
        { kind: "sanitary", title: "Vigilância Sanitária", description: "Estabelecimentos, licenças e inspeções.", onOpen: () => setActiveSecretaryTab("health-sanitary") },
        { kind: "epidemiology", title: "Vigilância Epidemiológica", description: "Acompanhamento administrativo de agravos.", onOpen: () => setActiveSecretaryTab("health-epidemiology") },
        { kind: "immunization", title: "Imunização e Vacinação", description: "Esquemas e doses demonstrativas.", onOpen: () => setActiveSecretaryTab("health-immunization") },
      ],
    },
    {
      id: "specialized",
      title: "Saúde Especializada",
      accent: "orange",
      icon: "maternal",
      modules: [
        { kind: "maternal", title: "Saúde da Mulher", description: "Pré-natal, puerpério e acompanhamentos.", onOpen: () => setActiveSecretaryTab("health-maternal") },
        { kind: "child", title: "Acompanhamento da Criança", description: "Transição administrativa para a APS.", onOpen: () => openHealthChild() },
      ],
    },
  ];

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
      kind: String(
        values.get("kind") ?? "Administrativa",
      ) as MunicipalRequestDraft["kind"],
      sourceDepartment: String(
        values.get("sourceDepartment") ?? selectedDepartment.name,
      ).trim(),
      targetDepartment: String(values.get("department") ?? "").trim(),
      personId: String(values.get("personId") ?? "").trim() || undefined,
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
                    setGeneralRegistryOpen(false);
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
                setHealthChildOpen(false);
                setMaternalInitialFollowUpId(undefined);
                setChildInitialMaternalFollowUpId(undefined);
                setChildInitialPendingId(undefined);
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
              {generalRegistryOpen
                ? "Cadastro Geral"
                : isSecretary
                  ? selectedDepartment.shortName
                  : "Meu trabalho"}
            </strong>
          </div>
          <div className="workspace-top-actions">
            <span className="workspace-sim-chip">DEMONSTRAÇÃO FICTÍCIA</span>
            <button onClick={onSwitchExperience}>
              <LogOut size={15} /> Sair da visão
            </button>
          </div>
        </header>

        {generalRegistryOpen ? (
          <div className="workspace-content">
            <PeopleFamiliesDomicilesModule
              dataset={peopleRegistry}
              healthTerritory={healthTerritory}
              onChange={onPeopleRegistryChange}
            />
          </div>
        ) : isSecretary ? (
          <div className="workspace-content">
            {!isHealthDepartment && (
              <>
                <div className="workspace-page-kicker">
                  <Building2 size={14} /> VISÃO DA SECRETARIA · ATUALIZADA EM 19/NOV
                </div>
                <div className="workspace-heading-row">
                  <div>
                    <h1>{selectedDepartment.name}</h1>
                    <p>{selectedDepartmentSummary.summary}</p>
                  </div>
                  <button
                    className="workspace-primary-button"
                    onClick={() => setActiveSecretaryTab("requests")}
                  >
                    <ClipboardList size={16} /> Ver solicitações
                  </button>
                </div>
              </>
            )}
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
                  <button
                    className={activeSecretaryTab === "questionnaires" ? "active" : ""}
                    onClick={() => setActiveSecretaryTab("questionnaires")}
                  >
                    <ClipboardList size={14} /> Questionários compartilhados
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
                      ? "14 acessos"
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
                  <div className="health-module-category-grid">
                    {healthModuleGroups.map((group) => (
                      <section
                        className={`health-module-category health-module-category-${group.accent}`}
                        key={group.id}
                      >
                        <header className="health-module-category-header">
                          <span className="health-module-category-icon">
                            <HealthModuleGlyph kind={group.icon} />
                          </span>
                          <div>
                            <strong>{group.title}</strong>
                            <small>{group.modules.length} módulos</small>
                          </div>
                          <span className="health-module-category-link">
                            Ver todos <ArrowRight size={14} />
                          </span>
                        </header>
                        <div className="health-module-category-cards">
                          {group.modules.map((module) => (
                            <HealthCatalogCard key={module.title} {...module} />
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
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
            {activeSecretaryTab === "questionnaires" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <SharedQuestionnairesModule
                  dataset={sharedQuestionnaires}
                  onBack={() => setActiveSecretaryTab("services")}
                />
              )}
            {activeSecretaryTab === "health-summary" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <HealthSummaryModule
                  requests={requests}
                  healthTerritory={healthTerritory}
                  healthActivities={healthActivities}
                  healthReferrals={healthReferrals}
                  healthDiagnostics={healthDiagnostics}
                  healthSanitary={healthSanitary}
                  healthEpidemiology={healthEpidemiology}
                  healthImmunization={healthImmunization}
                  healthPharmacy={healthPharmacy}
                  healthMaternal={healthMaternal}
                  healthChild={healthChild}
                  onOpenSource={openHealthSummarySource}
                  onBack={() => setActiveSecretaryTab("services")}
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
                  intersectoralRequests={intersectoralHealthRequests}
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
                    healthTerritory={healthTerritory}
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
                    initialFollowUpId={maternalInitialFollowUpId}
                    onOpenChildTransition={(maternalFollowUpId) =>
                      openHealthChild(maternalFollowUpId)
                    }
                    onBack={() => setActiveSecretaryTab("services")}
                  />
                </Suspense>
              )}
            {activeSecretaryTab === "health-child" &&
              selectedDepartment.name === "Saúde e Vigilância Sanitária" && (
                <Suspense
                  fallback={
                    <div className="workspace-cross-area" role="status">
                      <strong>Carregando Acompanhamento da Criança...</strong>
                    </div>
                  }
                >
                  <HealthChildModule
                    mode="secretary"
                    dataset={healthChild}
                    maternalDataset={healthMaternal}
                    healthTerritory={healthTerritory}
                    peopleRegistry={peopleRegistry}
                    onChange={onHealthChildChange}
                    initialMaternalFollowUpId={childInitialMaternalFollowUpId}
                    onOpenMaternal={(maternalFollowUpId) =>
                      openHealthMaternal(maternalFollowUpId)
                    }
                    onBack={() => {
                      setChildInitialMaternalFollowUpId(undefined);
                      setChildInitialPendingId(undefined);
                      setActiveSecretaryTab("services");
                    }}
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
                  else if (childOperator) openHealthChild();
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
                      : childOperator
                        ? "Abrir Acompanhamento da Criança"
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
              {!childOperator && (
                <button
                  className="workspace-secondary-button"
                  onClick={() => {
                    setRequestValidationError(null);
                    setRequestOpen(true);
                  }}
                >
                  <ClipboardList size={16} /> Registrar demanda
                </button>
              )}
            </div>
            {healthWorkflowOpen && healthOperatorPersona && healthOperatorPersona !== "acs" && (
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
                intersectoralRequests={intersectoralHealthRequests}
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
                  initialFollowUpId={maternalInitialFollowUpId}
                  onOpenChildTransition={(maternalFollowUpId) =>
                    openHealthChild(maternalFollowUpId)
                  }
                  onBack={() => {
                    setHealthMaternalOpen(false);
                    setMaternalInitialFollowUpId(undefined);
                    if (returnToChildAfterMaternal) {
                      setSelectedPersona(
                        operatorPersonas.find(
                          (persona) => persona.id === "child",
                        )!,
                      );
                      setHealthChildOpen(true);
                      setReturnToChildAfterMaternal(false);
                    }
                  }}
                />
              </Suspense>
            )}
            {healthChildOpen && childOperator && (
              <Suspense
                fallback={
                  <div className="workspace-cross-area" role="status">
                    <strong>Carregando Acompanhamento da Criança...</strong>
                  </div>
                }
              >
                <HealthChildModule
                  key={`${selectedPersona.id}-${childInitialMaternalFollowUpId ?? ""}-${childInitialPendingId ?? ""}`}
                  mode="operator"
                  dataset={healthChild}
                  maternalDataset={healthMaternal}
                  healthTerritory={healthTerritory}
                  peopleRegistry={peopleRegistry}
                  onChange={onHealthChildChange}
                  initialMaternalFollowUpId={childInitialMaternalFollowUpId}
                  initialPendingId={childInitialPendingId}
                  onOpenMaternal={(maternalFollowUpId) =>
                    openHealthMaternal(maternalFollowUpId)
                  }
                  onBack={() => {
                    setHealthChildOpen(false);
                    setChildInitialMaternalFollowUpId(undefined);
                    setChildInitialPendingId(undefined);
                  }}
                />
              </Suspense>
            )}
            {latestProtocol && !childOperator && (
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
                <span>
                  {childOperator
                    ? "PENDÊNCIAS ADMINISTRATIVAS · SEM PRAZO ASSISTENCIAL"
                    : maternalOperator
                      ? "PENDÊNCIAS ADMINISTRATIVAS · 19/NOV/2026"
                      : "AGENDA DE HOJE · 19/NOV/2026"}
                </span>
                <strong>{selectedPersona.label}</strong>
                <p>
                  {administrativeOperator
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
                <span>
                  {administrativeOperator
                    ? "PENDÊNCIAS ADMINISTRATIVAS"
                    : "FILA DE ATIVIDADES"}
                </span>
                <h2>
                  {administrativeOperator
                    ? "Pendências abertas nesta sessão"
                    : "Próximos atendimentos e tarefas"}
                </h2>
              </div>
              <span className="workspace-count">
                {personaTasks.length}{" "}
                {administrativeOperator ? "pendências abertas" : "agendados"}
              </span>
            </div>
            <div className="operator-task-list">
              {personaTasks.map((task, index) => (
                <article className="operator-task-card" key={task.id}>
                  <div className="operator-task-time">
                    <strong>{task.time.split(" · ")[0]}</strong>
                    <span>
                      {administrativeOperator
                        ? "PENDÊNCIA"
                        : index === 0
                          ? "PRÓXIMA"
                          : "NA SEQUÊNCIA"}
                    </span>
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
                      <strong>
                        {administrativeOperator
                          ? "Pendência administrativa demonstrativa"
                          : "O que será atualizado"}
                      </strong>
                      <p>
                        {administrativeOperator
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
                          else if (childOperator)
                            openHealthChild(undefined, task.id);
                          else setEntryOpen(true);
                        }}
                      >
                        {childOperator
                          ? "Abrir transição vinculada"
                          : "Registrar atividade vinculada"}{" "}
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
            {operatorRequests.length > 0 && !childOperator && (
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
            {operatorEntries.length > 0 && !childOperator && (
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

      {entryOpen && !isSecretary && !childOperator && (
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
      {requestOpen && !isSecretary && !childOperator && (
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
                Tipo de fluxo
                <select name="kind" defaultValue="Administrativa" required>
                  <option>Administrativa</option>
                  <option>Encaminhamento intersetorial</option>
                </select>
              </label>
              <label>
                Pessoa do cadastro compartilhado{" "}
                <span className="request-optional">opcional</span>
                <input
                  name="personId"
                  placeholder="Ex.: SIM-PES-042"
                  maxLength={40}
                />
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
              <div className="request-deadline-note request-cross-flow-note">
                <UsersRound size={15} /> Em um encaminhamento intersetorial, a
                origem registra o contexto e a secretaria destino conduz seu
                processo. O retorno compartilhado respeita as permissões.
              </div>
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
