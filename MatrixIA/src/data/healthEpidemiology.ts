export const epidemiologyThemes = [
  "Síndrome febril · exemplo didático",
  "Síndrome respiratória · exemplo didático",
  "Síndrome diarreica · exemplo didático",
  "Arbovirose · exemplo didático",
  "Outro agravo · tema demonstrativo",
] as const;

export type EpidemiologyTheme = (typeof epidemiologyThemes)[number];

export const epidemiologyStatuses = [
  "Nova",
  "Em avaliação",
  "Em acompanhamento",
  "Encerrada",
  "Descartada",
  "Cancelada",
] as const;

export type EpidemiologyStatus = (typeof epidemiologyStatuses)[number];

export const epidemiologyPriorities = [
  "Rotina demonstrativa",
  "Prioridade de acompanhamento · ilustrativa",
] as const;

export type EpidemiologyPriority = (typeof epidemiologyPriorities)[number];
export type EpidemiologyOriginType =
  | "Atendimento"
  | "Visita domiciliar"
  | "Registro manual";

export type EpidemiologyHistoryEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  fromStatus?: EpidemiologyStatus;
  toStatus: EpidemiologyStatus;
  note: string;
};

export type EpidemiologyNotification = {
  id: string;
  personId: string;
  theme: EpidemiologyTheme;
  reportedAt: string;
  symptomOnsetAt?: string;
  priority: EpidemiologyPriority;
  originType: EpidemiologyOriginType;
  originRecordId?: string;
  status: EpidemiologyStatus;
  initialNote: string;
  nextAction?: string;
  followUpAt?: string;
  history: EpidemiologyHistoryEvent[];
};

export type HealthEpidemiologyDataset = {
  notifications: EpidemiologyNotification[];
};

const event = (
  id: string,
  at: string,
  action: string,
  toStatus: EpidemiologyStatus,
  note: string,
  fromStatus?: EpidemiologyStatus,
): EpidemiologyHistoryEvent => ({
  id,
  at,
  actor: "Secretaria de Saúde · demonstração",
  action,
  fromStatus,
  toStatus,
  note,
});

export const initialHealthEpidemiology: HealthEpidemiologyDataset = {
  notifications: [
    {
      id: "SIM-VEA-001",
      personId: "SIM-PES-001",
      theme: "Síndrome febril · exemplo didático",
      reportedAt: "2026-11-18",
      symptomOnsetAt: "2026-11-17",
      priority: "Prioridade de acompanhamento · ilustrativa",
      originType: "Atendimento",
      originRecordId: "SIM-ATD-001",
      status: "Em acompanhamento",
      initialNote:
        "Registro inteiramente fictício para demonstrar a abertura de acompanhamento; não corresponde a uma notificação oficial.",
      nextAction: "Revisar a evolução registrada na demonstração.",
      followUpAt: "2026-11-25",
      history: [
        event(
          "SIM-VEA-001-H01",
          "2026-11-18T10:00:00-03:00",
          "Notificação demonstrativa registrada",
          "Nova",
          "Exemplo sintético sem definição de caso ou comunicação oficial.",
        ),
        event(
          "SIM-VEA-001-H02",
          "2026-11-18T14:20:00-03:00",
          "Registro encaminhado para avaliação demonstrativa",
          "Em avaliação",
          "Etapa fictícia utilizada para demonstrar a trilha.",
          "Nova",
        ),
        event(
          "SIM-VEA-001-H03",
          "2026-11-19T09:10:00-03:00",
          "Acompanhamento demonstrativo iniciado",
          "Em acompanhamento",
          "Próxima ação e data são exemplos de interface, não uma conduta clínica.",
          "Em avaliação",
        ),
      ],
    },
    {
      id: "SIM-VEA-002",
      personId: "SIM-PES-003",
      theme: "Arbovirose · exemplo didático",
      reportedAt: "2026-11-19",
      symptomOnsetAt: "2026-11-18",
      priority: "Rotina demonstrativa",
      originType: "Visita domiciliar",
      originRecordId: "SIM-VIS-003",
      status: "Em avaliação",
      initialNote:
        "Tema de demonstração associado a uma visita sintética existente; não confirma diagnóstico nem ocorrência epidemiológica.",
      history: [
        event(
          "SIM-VEA-002-H01",
          "2026-11-19T11:30:00-03:00",
          "Notificação demonstrativa registrada",
          "Nova",
          "Dados fictícios vinculados a evento de visita fictício.",
        ),
        event(
          "SIM-VEA-002-H02",
          "2026-11-19T15:00:00-03:00",
          "Avaliação demonstrativa iniciada",
          "Em avaliação",
          "A etapa não equivale a investigação ou classificação oficial.",
          "Nova",
        ),
      ],
    },
    {
      id: "SIM-VEA-003",
      personId: "SIM-PES-005",
      theme: "Síndrome respiratória · exemplo didático",
      reportedAt: "2026-11-20",
      priority: "Rotina demonstrativa",
      originType: "Atendimento",
      originRecordId: "SIM-ATD-003",
      status: "Nova",
      initialNote:
        "Entrada fictícia para demonstrar a fila de novas notificações.",
      history: [
        event(
          "SIM-VEA-003-H01",
          "2026-11-20T13:45:00-03:00",
          "Notificação demonstrativa registrada",
          "Nova",
          "Registro sintético; não representa atendimento ou notificação real.",
        ),
      ],
    },
    {
      id: "SIM-VEA-004",
      personId: "SIM-PES-007",
      theme: "Outro agravo · tema demonstrativo",
      reportedAt: "2026-11-12",
      symptomOnsetAt: "2026-11-10",
      priority: "Rotina demonstrativa",
      originType: "Registro manual",
      status: "Encerrada",
      initialNote:
        "Ciclo fictício de acompanhamento encerrado para demonstrar a consulta ao histórico.",
      history: [
        event(
          "SIM-VEA-004-H01",
          "2026-11-12T09:30:00-03:00",
          "Notificação demonstrativa registrada",
          "Nova",
          "Registro sintético, sem efeito administrativo ou epidemiológico.",
        ),
        event(
          "SIM-VEA-004-H02",
          "2026-11-12T11:00:00-03:00",
          "Avaliação demonstrativa iniciada",
          "Em avaliação",
          "Etapa ilustrativa.",
          "Nova",
        ),
        event(
          "SIM-VEA-004-H03",
          "2026-11-14T16:00:00-03:00",
          "Acompanhamento demonstrativo iniciado",
          "Em acompanhamento",
          "Acompanhamento fictício com retorno de referência.",
          "Em avaliação",
        ),
        event(
          "SIM-VEA-004-H04",
          "2026-11-20T10:15:00-03:00",
          "Registro demonstrativo encerrado",
          "Encerrada",
          "Encerramento fictício; não representa conclusão clínica ou oficial.",
          "Em acompanhamento",
        ),
      ],
    },
  ],
};

export const epidemiologyStatusTransitions: Record<
  EpidemiologyStatus,
  EpidemiologyStatus[]
> = {
  Nova: ["Em avaliação", "Cancelada"],
  "Em avaliação": ["Em acompanhamento", "Descartada", "Cancelada"],
  "Em acompanhamento": ["Em avaliação", "Encerrada", "Descartada", "Cancelada"],
  Encerrada: [],
  Descartada: [],
  Cancelada: [],
};

export const getHealthEpidemiologySummary = (
  dataset: HealthEpidemiologyDataset,
) => ({
  total: dataset.notifications.length,
  triage: dataset.notifications.filter(
    (item) => item.status === "Nova" || item.status === "Em avaliação",
  ).length,
  followUps: dataset.notifications.filter(
    (item) => item.status === "Em acompanhamento",
  ).length,
  scheduledReturns: dataset.notifications.filter(
    (item) => item.status === "Em acompanhamento" && Boolean(item.followUpAt),
  ).length,
  closed: dataset.notifications.filter((item) =>
    ["Encerrada", "Descartada", "Cancelada"].includes(item.status),
  ).length,
});

export const nextEpidemiologyNotificationId = (
  notifications: EpidemiologyNotification[],
) => {
  const highest = notifications.reduce((current, item) => {
    const value = Number(item.id.match(/(\d+)$/)?.[1] ?? 0);
    return Math.max(current, value);
  }, 0);
  return `SIM-VEA-${String(highest + 1).padStart(3, "0")}`;
};
