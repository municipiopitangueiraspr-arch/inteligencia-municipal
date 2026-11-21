export const epidemiologyThemes = [
  "Grupo febril · demonstrativo",
  "Grupo respiratório · demonstrativo",
  "Grupo diarreico · demonstrativo",
  "Grupo de arboviroses · demonstrativo",
  "Outro grupo · demonstrativo",
] as const;

export type EpidemiologyTheme = (typeof epidemiologyThemes)[number];

export const epidemiologyStatuses = [
  "Recebida",
  "Em conferência",
  "Aguardando retorno",
  "Concluída administrativamente",
  "Cancelada administrativamente",
] as const;

export type EpidemiologyStatus = (typeof epidemiologyStatuses)[number];

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
  reportingUnitId: string;
  originType: EpidemiologyOriginType;
  originRecordId?: string;
  status: EpidemiologyStatus;
  history: EpidemiologyHistoryEvent[];
};

export type EpidemiologyPendingStatus = "Aberta" | "Concluída";

export type EpidemiologyPendingHistoryEvent = {
  id: string;
  at: string;
  actor: string;
  fromStatus?: EpidemiologyPendingStatus;
  toStatus: EpidemiologyPendingStatus;
  note: string;
};

export type EpidemiologyPending = {
  id: string;
  notificationId: string;
  title: string;
  responsibleUnitId: string;
  dueAt?: string;
  status: EpidemiologyPendingStatus;
  history: EpidemiologyPendingHistoryEvent[];
};

export type HealthEpidemiologyDataset = {
  notifications: EpidemiologyNotification[];
  pendings: EpidemiologyPending[];
};

const historyEvent = (
  id: string,
  at: string,
  action: string,
  fromStatus: EpidemiologyStatus | undefined,
  toStatus: EpidemiologyStatus,
  note: string,
): EpidemiologyHistoryEvent => ({
  id,
  at,
  actor: "Secretaria de Saúde · demonstração",
  action,
  fromStatus,
  toStatus,
  note,
});

const pendingHistoryEvent = (
  id: string,
  at: string,
  toStatus: EpidemiologyPendingStatus,
  note: string,
  fromStatus?: EpidemiologyPendingStatus,
): EpidemiologyPendingHistoryEvent => ({
  id,
  at,
  actor: "Secretaria de Saúde · demonstração",
  fromStatus,
  toStatus,
  note,
});

export const initialHealthEpidemiology: HealthEpidemiologyDataset = {
  notifications: [
    {
      id: "SIM-VEA-001",
      personId: "SIM-PES-001",
      theme: "Grupo febril · demonstrativo",
      reportedAt: "2026-11-20",
      symptomOnsetAt: "2026-11-19",
      reportingUnitId: "SIM-UBS-001",
      originType: "Atendimento",
      originRecordId: "SIM-ATD-001",
      status: "Aguardando retorno",
      history: [
        historyEvent(
          "SIM-VEA-001-H01",
          "2026-11-20T09:00:00-03:00",
          "Registro demonstrativo recebido",
          undefined,
          "Recebida",
          "Exemplo fictício; não representa notificação oficial nem avaliação de saúde.",
        ),
        historyEvent(
          "SIM-VEA-001-H02",
          "2026-11-20T14:20:00-03:00",
          "Conferência administrativa iniciada",
          "Recebida",
          "Em conferência",
          "Etapa administrativa ilustrativa, sem classificação de caso.",
        ),
        historyEvent(
          "SIM-VEA-001-H03",
          "2026-11-21T09:10:00-03:00",
          "Retorno administrativo solicitado",
          "Em conferência",
          "Aguardando retorno",
          "Acompanhamento fictício; não constitui prazo ou orientação clínica.",
        ),
      ],
    },
    {
      id: "SIM-VEA-002",
      personId: "SIM-PES-003",
      theme: "Grupo de arboviroses · demonstrativo",
      reportedAt: "2026-11-20",
      symptomOnsetAt: "2026-11-19",
      reportingUnitId: "SIM-UBS-001",
      originType: "Visita domiciliar",
      originRecordId: "SIM-VIS-003",
      status: "Em conferência",
      history: [
        historyEvent(
          "SIM-VEA-002-H01",
          "2026-11-20T09:30:00-03:00",
          "Registro demonstrativo recebido",
          undefined,
          "Recebida",
          "Entrada sintética associada a uma visita fictícia já cadastrada.",
        ),
        historyEvent(
          "SIM-VEA-002-H02",
          "2026-11-20T15:00:00-03:00",
          "Conferência administrativa iniciada",
          "Recebida",
          "Em conferência",
          "A etapa não equivale a investigação, diagnóstico ou classificação oficial.",
        ),
      ],
    },
    {
      id: "SIM-VEA-003",
      personId: "SIM-PES-005",
      theme: "Grupo respiratório · demonstrativo",
      reportedAt: "2026-11-20",
      reportingUnitId: "SIM-UBS-001",
      originType: "Atendimento",
      originRecordId: "SIM-ATD-003",
      status: "Recebida",
      history: [
        historyEvent(
          "SIM-VEA-003-H01",
          "2026-11-20T13:45:00-03:00",
          "Registro demonstrativo recebido",
          undefined,
          "Recebida",
          "Registro sintético vinculado a evento fictício; sem efeito oficial.",
        ),
      ],
    },
    {
      id: "SIM-VEA-004",
      personId: "SIM-PES-007",
      theme: "Outro grupo · demonstrativo",
      reportedAt: "2026-11-12",
      symptomOnsetAt: "2026-11-10",
      reportingUnitId: "SIM-UBS-003",
      originType: "Registro manual",
      status: "Concluída administrativamente",
      history: [
        historyEvent(
          "SIM-VEA-004-H01",
          "2026-11-12T09:30:00-03:00",
          "Registro demonstrativo recebido",
          undefined,
          "Recebida",
          "Registro sintético, sem efeito administrativo ou epidemiológico.",
        ),
        historyEvent(
          "SIM-VEA-004-H02",
          "2026-11-12T11:00:00-03:00",
          "Conferência administrativa iniciada",
          "Recebida",
          "Em conferência",
          "Etapa ilustrativa.",
        ),
        historyEvent(
          "SIM-VEA-004-H03",
          "2026-11-14T16:00:00-03:00",
          "Retorno administrativo solicitado",
          "Em conferência",
          "Aguardando retorno",
          "Acompanhamento fictício, sem prazo assistencial.",
        ),
        historyEvent(
          "SIM-VEA-004-H04",
          "2026-11-20T10:15:00-03:00",
          "Fluxo administrativo concluído",
          "Aguardando retorno",
          "Concluída administrativamente",
          "Conclusão administrativa demonstrativa; não representa desfecho clínico ou oficial.",
        ),
      ],
    },
  ],
  pendings: [
    {
      id: "SIM-VEA-PND-001",
      notificationId: "SIM-VEA-001",
      title: "Conferir dados mínimos do registro",
      responsibleUnitId: "SIM-UBS-001",
      dueAt: "2026-11-25",
      status: "Aberta",
      history: [
        pendingHistoryEvent(
          "SIM-VEA-PND-001-H01",
          "2026-11-21T09:10:00-03:00",
          "Aberta",
          "Pendência administrativa fictícia vinculada ao registro demonstrativo.",
        ),
      ],
    },
    {
      id: "SIM-VEA-PND-002",
      notificationId: "SIM-VEA-002",
      title: "Registrar retorno administrativo da unidade",
      responsibleUnitId: "SIM-UBS-001",
      dueAt: "2026-11-24",
      status: "Aberta",
      history: [
        pendingHistoryEvent(
          "SIM-VEA-PND-002-H01",
          "2026-11-20T15:00:00-03:00",
          "Aberta",
          "Prazo de referência fictício; não corresponde a prazo assistencial.",
        ),
      ],
    },
    {
      id: "SIM-VEA-PND-003",
      notificationId: "SIM-VEA-004",
      title: "Conferir dados mínimos do registro",
      responsibleUnitId: "SIM-UBS-003",
      dueAt: "2026-11-20",
      status: "Concluída",
      history: [
        pendingHistoryEvent(
          "SIM-VEA-PND-003-H01",
          "2026-11-12T09:30:00-03:00",
          "Aberta",
          "Pendência administrativa fictícia criada na demonstração.",
        ),
        pendingHistoryEvent(
          "SIM-VEA-PND-003-H02",
          "2026-11-20T10:15:00-03:00",
          "Concluída",
          "Conclusão administrativa de exemplo; sem efeito oficial.",
          "Aberta",
        ),
      ],
    },
  ],
};

export const epidemiologyStatusTransitions: Record<
  EpidemiologyStatus,
  EpidemiologyStatus[]
> = {
  Recebida: ["Em conferência", "Cancelada administrativamente"],
  "Em conferência": [
    "Aguardando retorno",
    "Concluída administrativamente",
    "Cancelada administrativamente",
  ],
  "Aguardando retorno": [
    "Em conferência",
    "Concluída administrativamente",
    "Cancelada administrativamente",
  ],
  "Concluída administrativamente": [],
  "Cancelada administrativamente": [],
};

export const getHealthEpidemiologySummary = (
  dataset: HealthEpidemiologyDataset,
) => ({
  total: dataset.notifications.length,
  openPendings: dataset.pendings.filter((item) => item.status === "Aberta")
    .length,
  completedPendings: dataset.pendings.filter(
    (item) => item.status === "Concluída",
  ).length,
  triage: dataset.notifications.filter(
    (item) => item.status === "Recebida" || item.status === "Em conferência",
  ).length,
  followUps: dataset.notifications.filter(
    (item) => item.status === "Aguardando retorno",
  ).length,
  scheduledReturns: dataset.pendings.filter(
    (item) => item.status === "Aberta" && Boolean(item.dueAt),
  ).length,
  closed: dataset.notifications.filter((item) =>
    ["Concluída administrativamente", "Cancelada administrativamente"].includes(
      item.status,
    ),
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

export const nextEpidemiologyPendingId = (pendings: EpidemiologyPending[]) => {
  const highest = pendings.reduce((current, item) => {
    const value = Number(item.id.match(/(\d+)$/)?.[1] ?? 0);
    return Math.max(current, value);
  }, 0);
  return `SIM-VEA-PND-${String(highest + 1).padStart(3, "0")}`;
};
