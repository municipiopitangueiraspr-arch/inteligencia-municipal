export const sanitaryRiskProfiles = [
  "Baixo · ilustrativo",
  "Intermediário · ilustrativo",
  "Elevado · ilustrativo",
] as const;

export type SanitaryRiskProfile = (typeof sanitaryRiskProfiles)[number];

export const sanitaryLicenseStatuses = [
  "Não iniciado",
  "Em análise",
  "Registrada no cenário",
  "Renovação em acompanhamento",
] as const;

export type SanitaryLicenseStatus = (typeof sanitaryLicenseStatuses)[number];

export const sanitaryInspectionStatuses = [
  "Programada",
  "Realizada",
  "Providência em acompanhamento",
  "Retorno programado",
  "Concluída",
  "Cancelada",
] as const;

export type SanitaryInspectionStatus =
  (typeof sanitaryInspectionStatuses)[number];

export type SanitaryHistoryEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  fromStatus?: string;
  toStatus: string;
  note: string;
};

export type SanitaryEstablishment = {
  id: string;
  name: string;
  activity: string;
  address: string;
  riskProfile: SanitaryRiskProfile;
  licenseStatus: SanitaryLicenseStatus;
  licenseReviewDate?: string;
  localReference?: string;
  history: SanitaryHistoryEvent[];
};

export type SanitaryInspection = {
  id: string;
  establishmentId: string;
  type: string;
  scheduledAt: string;
  visitedAt?: string;
  inspector: string;
  status: SanitaryInspectionStatus;
  finding?: string;
  correctiveAction?: string;
  actionDueAt?: string;
  returnAt?: string;
  history: SanitaryHistoryEvent[];
};

export type HealthSanitaryDataset = {
  establishments: SanitaryEstablishment[];
  inspections: SanitaryInspection[];
};

const historyEvent = (
  id: string,
  at: string,
  actor: string,
  action: string,
  toStatus: string,
  note: string,
  fromStatus?: string,
): SanitaryHistoryEvent => ({
  id,
  at,
  actor,
  action,
  fromStatus,
  toStatus,
  note,
});

export const initialHealthSanitary: HealthSanitaryDataset = {
  establishments: [
    {
      id: "SIM-VSA-EST-001",
      name: "Café Ipê Amarelo",
      activity: "Alimentação preparada",
      address: "Centro · endereço demonstrativo",
      riskProfile: "Intermediário · ilustrativo",
      licenseStatus: "Registrada no cenário",
      licenseReviewDate: "2026-12-15",
      localReference: "SIM-LIC-101",
      history: [
        historyEvent(
          "SIM-VSA-EST-001-H01",
          "2026-09-10T13:15:00-03:00",
          "Equipe demonstrativa da VISA",
          "Acompanhamento de licença criado",
          "Registrada no cenário",
          "Registro sintético para demonstrar a trilha local; não é licença oficial.",
        ),
      ],
    },
    {
      id: "SIM-VSA-EST-002",
      name: "Mercado Vila Nova",
      activity: "Comércio de alimentos embalados",
      address: "Vila Nova · endereço demonstrativo",
      riskProfile: "Elevado · ilustrativo",
      licenseStatus: "Em análise",
      licenseReviewDate: "2026-11-28",
      localReference: "SIM-LIC-102",
      history: [
        historyEvent(
          "SIM-VSA-EST-002-H01",
          "2026-10-22T09:40:00-03:00",
          "Equipe demonstrativa da VISA",
          "Acompanhamento de licença criado",
          "Em análise",
          "Processo fictício aberto para demonstrar a fila de análise municipal.",
        ),
      ],
    },
    {
      id: "SIM-VSA-EST-003",
      name: "Salão Estação",
      activity: "Serviços de cuidado pessoal",
      address: "Jardim Estação · endereço demonstrativo",
      riskProfile: "Baixo · ilustrativo",
      licenseStatus: "Renovação em acompanhamento",
      licenseReviewDate: "2026-11-25",
      localReference: "SIM-LIC-103",
      history: [
        historyEvent(
          "SIM-VSA-EST-003-H01",
          "2026-11-05T14:20:00-03:00",
          "Equipe demonstrativa da VISA",
          "Renovação incluída no acompanhamento",
          "Renovação em acompanhamento",
          "Data e situação foram criadas apenas para esta demonstração.",
        ),
      ],
    },
    {
      id: "SIM-VSA-EST-004",
      name: "Restaurante Rio Claro",
      activity: "Restaurante e refeições no local",
      address: "Área Central · endereço demonstrativo",
      riskProfile: "Intermediário · ilustrativo",
      licenseStatus: "Não iniciado",
      localReference: "SIM-VSA-REF-004",
      history: [
        historyEvent(
          "SIM-VSA-EST-004-H01",
          "2026-10-30T08:30:00-03:00",
          "Equipe demonstrativa da VISA",
          "Estabelecimento incluído no cadastro de demonstração",
          "Não iniciado",
          "Cadastro sintético sem protocolo ou documento oficial associado.",
        ),
      ],
    },
    {
      id: "SIM-VSA-EST-005",
      name: "Padaria Sol Nascente",
      activity: "Panificação e confeitaria",
      address: "Setor Norte · endereço demonstrativo",
      riskProfile: "Elevado · ilustrativo",
      licenseStatus: "Registrada no cenário",
      licenseReviewDate: "2027-02-10",
      localReference: "SIM-LIC-105",
      history: [
        historyEvent(
          "SIM-VSA-EST-005-H01",
          "2026-08-19T10:00:00-03:00",
          "Equipe demonstrativa da VISA",
          "Acompanhamento de licença criado",
          "Registrada no cenário",
          "Registro fictício para demonstrar a consulta de vigência de referência.",
        ),
      ],
    },
  ],
  inspections: [
    {
      id: "SIM-VSA-INS-001",
      establishmentId: "SIM-VSA-EST-001",
      type: "Rotina demonstrativa",
      scheduledAt: "2026-11-23",
      inspector: "Fiscal demonstrativo A",
      status: "Programada",
      history: [
        historyEvent(
          "SIM-VSA-INS-001-H01",
          "2026-11-18T15:20:00-03:00",
          "Coordenação demonstrativa da VISA",
          "Inspeção incluída na agenda fictícia",
          "Programada",
          "Agenda e identificador são sintéticos; não representam designação oficial.",
        ),
      ],
    },
    {
      id: "SIM-VSA-INS-002",
      establishmentId: "SIM-VSA-EST-002",
      type: "Acompanhamento demonstrativo",
      scheduledAt: "2026-11-12",
      visitedAt: "2026-11-12",
      inspector: "Fiscal demonstrativo B",
      status: "Providência em acompanhamento",
      finding:
        "Registro sintético de uma constatação para ilustrar o acompanhamento.",
      correctiveAction:
        "Demonstrar organização e separação das áreas de armazenamento.",
      actionDueAt: "2026-11-26",
      history: [
        historyEvent(
          "SIM-VSA-INS-002-H01",
          "2026-11-08T10:00:00-03:00",
          "Coordenação demonstrativa da VISA",
          "Inspeção incluída na agenda fictícia",
          "Programada",
          "Roteiro de demonstração para estabelecimento sintético.",
        ),
        historyEvent(
          "SIM-VSA-INS-002-H02",
          "2026-11-12T12:10:00-03:00",
          "Fiscal demonstrativo B",
          "Visita demonstrativa realizada",
          "Realizada",
          "Registro fictício de visita, sem constatação real ou efeito administrativo.",
          "Programada",
        ),
        historyEvent(
          "SIM-VSA-INS-002-H03",
          "2026-11-12T12:15:00-03:00",
          "Fiscal demonstrativo B",
          "Providência incluída no cenário",
          "Providência em acompanhamento",
          "Constatação e prazo são ilustrativos, sem efeito administrativo.",
          "Realizada",
        ),
      ],
    },
    {
      id: "SIM-VSA-INS-003",
      establishmentId: "SIM-VSA-EST-003",
      type: "Retorno demonstrativo",
      scheduledAt: "2026-11-19",
      visitedAt: "2026-11-19",
      inspector: "Fiscal demonstrativo A",
      status: "Retorno programado",
      finding: "Constatação fictícia registrada para demonstrar retorno.",
      correctiveAction:
        "Apresentar registro interno de higienização do ambiente.",
      actionDueAt: "2026-11-27",
      returnAt: "2026-11-27",
      history: [
        historyEvent(
          "SIM-VSA-INS-003-H01",
          "2026-11-10T09:00:00-03:00",
          "Coordenação demonstrativa da VISA",
          "Inspeção incluída na agenda fictícia",
          "Programada",
          "Agenda sintética sem designação oficial.",
        ),
        historyEvent(
          "SIM-VSA-INS-003-H02",
          "2026-11-19T15:55:00-03:00",
          "Fiscal demonstrativo A",
          "Visita demonstrativa realizada",
          "Realizada",
          "Registro fictício de visita, sem constatação real.",
          "Programada",
        ),
        historyEvent(
          "SIM-VSA-INS-003-H03",
          "2026-11-19T16:10:00-03:00",
          "Fiscal demonstrativo A",
          "Retorno incluído no cenário",
          "Retorno programado",
          "Datas e providência demonstrativas; validação local depende de procedimento vigente.",
          "Realizada",
        ),
      ],
    },
    {
      id: "SIM-VSA-INS-004",
      establishmentId: "SIM-VSA-EST-005",
      type: "Rotina demonstrativa",
      scheduledAt: "2026-10-22",
      visitedAt: "2026-10-22",
      inspector: "Fiscal demonstrativo C",
      status: "Concluída",
      finding: "Registro ilustrativo de encerramento sem pendência no cenário.",
      history: [
        historyEvent(
          "SIM-VSA-INS-004-H01",
          "2026-10-20T10:00:00-03:00",
          "Coordenação demonstrativa da VISA",
          "Inspeção incluída na agenda fictícia",
          "Programada",
          "Agenda sintética sem designação oficial.",
        ),
        historyEvent(
          "SIM-VSA-INS-004-H02",
          "2026-10-22T11:00:00-03:00",
          "Fiscal demonstrativo C",
          "Visita demonstrativa realizada",
          "Realizada",
          "Registro fictício de visita sem efeito oficial.",
          "Programada",
        ),
        historyEvent(
          "SIM-VSA-INS-004-H03",
          "2026-10-22T11:30:00-03:00",
          "Fiscal demonstrativo C",
          "Inspeção demonstrativa encerrada",
          "Concluída",
          "Conclusão sintética sem validade ou efeito oficial.",
          "Realizada",
        ),
      ],
    },
  ],
};

export const sanitaryInspectionTransitions: Record<
  SanitaryInspectionStatus,
  SanitaryInspectionStatus[]
> = {
  Programada: ["Realizada", "Cancelada"],
  Realizada: [
    "Providência em acompanhamento",
    "Retorno programado",
    "Concluída",
    "Cancelada",
  ],
  "Providência em acompanhamento": [
    "Retorno programado",
    "Concluída",
    "Cancelada",
  ],
  "Retorno programado": [
    "Providência em acompanhamento",
    "Concluída",
    "Cancelada",
  ],
  Concluída: [],
  Cancelada: [],
};

export const getHealthSanitarySummary = (dataset: HealthSanitaryDataset) => ({
  establishments: dataset.establishments.length,
  licenseReview: dataset.establishments.filter(
    (item) =>
      item.licenseStatus === "Em análise" ||
      item.licenseStatus === "Renovação em acompanhamento",
  ).length,
  scheduled: dataset.inspections.filter((item) => item.status === "Programada")
    .length,
  followUps: dataset.inspections.filter(
    (item) =>
      item.status === "Providência em acompanhamento" ||
      item.status === "Retorno programado",
  ).length,
});

export const nextSanitaryEstablishmentId = (
  establishments: SanitaryEstablishment[],
) => {
  const highest = establishments.reduce((current, item) => {
    const value = Number(item.id.match(/(\d+)$/)?.[1] ?? 0);
    return Math.max(current, value);
  }, 0);
  return `SIM-VSA-EST-${String(highest + 1).padStart(3, "0")}`;
};

export const nextSanitaryInspectionId = (inspections: SanitaryInspection[]) => {
  const highest = inspections.reduce((current, item) => {
    const value = Number(item.id.match(/(\d+)$/)?.[1] ?? 0);
    return Math.max(current, value);
  }, 0);
  return `SIM-VSA-INS-${String(highest + 1).padStart(3, "0")}`;
};
