import { initialPeopleRegistry } from "./peopleRegistry";
import { initialHealthTerritory } from "./healthTerritory";

export const maternalStages = [
  "Pré-natal",
  "Registro de nascimento",
  "Puerpério",
  "Encerrado",
] as const;
export type MaternalStage = (typeof maternalStages)[number];
export type MaternalHistoryEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  fromStage?: MaternalStage;
  toStage?: MaternalStage;
  note: string;
};
export type MaternalFollowUp = {
  id: string;
  personId: string;
  unitId: string;
  teamId: string;
  openedAt: string;
  stage: MaternalStage;
  history: MaternalHistoryEvent[];
};
export type MaternalPending = {
  id: string;
  followUpId: string;
  title: string;
  assignedTo: string;
  dueAt?: string;
  status: "Aberta" | "Concluída";
  createdAt: string;
  completedAt?: string;
};
export type HealthMaternalDataset = {
  followUps: MaternalFollowUp[];
  pendings: MaternalPending[];
};

const samplePeople = initialPeopleRegistry.people.filter(
  (person) => person.status === "Ativa",
);
const sampleUnits = initialHealthTerritory.units.filter((unit) => unit.active);
const sampleTeams = initialHealthTerritory.teams.filter((team) => team.active);
const at = (date: string) => `${date}T09:00:00-03:00`;
const seedHistory = (
  id: string,
  date: string,
  stage: MaternalStage,
  note: string,
): MaternalHistoryEvent => ({
  id,
  at: at(date),
  actor: "Secretaria de Saúde · demonstração",
  action: "Etapa demonstrativa registrada",
  toStage: stage,
  note,
});

export const initialHealthMaternal: HealthMaternalDataset = {
  followUps: [
    {
      id: "SIM-MUL-AC-001",
      personId: samplePeople[0]?.id ?? "SIM-PES-001",
      unitId: sampleUnits[0]?.id ?? "SIM-UBS-001",
      teamId: sampleTeams[0]?.id ?? "SIM-EQ-001",
      openedAt: "2026-10-05",
      stage: "Pré-natal",
      history: [
        seedHistory(
          "SIM-MUL-AC-001-H01",
          "2026-10-05",
          "Pré-natal",
          "Registro sintético de abertura; sem informação clínica.",
        ),
      ],
    },
    {
      id: "SIM-MUL-AC-002",
      personId: samplePeople[3]?.id ?? "SIM-PES-004",
      unitId: sampleUnits[1]?.id ?? sampleUnits[0]?.id ?? "SIM-UBS-001",
      teamId: sampleTeams[1]?.id ?? sampleTeams[0]?.id ?? "SIM-EQ-001",
      openedAt: "2026-10-21",
      stage: "Registro de nascimento",
      history: [
        seedHistory(
          "SIM-MUL-AC-002-H01",
          "2026-10-21",
          "Pré-natal",
          "Abertura fictícia do acompanhamento.",
        ),
        {
          ...seedHistory(
            "SIM-MUL-AC-002-H02",
            "2026-11-02",
            "Registro de nascimento",
            "Etapa registrada para demonstrar o fluxo; não corresponde a evento real.",
          ),
          fromStage: "Pré-natal",
        },
      ],
    },
    {
      id: "SIM-MUL-AC-003",
      personId: samplePeople[5]?.id ?? samplePeople[2]?.id ?? "SIM-PES-006",
      unitId: sampleUnits[2]?.id ?? sampleUnits[0]?.id ?? "SIM-UBS-001",
      teamId: sampleTeams[2]?.id ?? sampleTeams[0]?.id ?? "SIM-EQ-001",
      openedAt: "2026-09-28",
      stage: "Puerpério",
      history: [
        seedHistory(
          "SIM-MUL-AC-003-H01",
          "2026-09-28",
          "Pré-natal",
          "Abertura fictícia do acompanhamento.",
        ),
        {
          ...seedHistory(
            "SIM-MUL-AC-003-H02",
            "2026-10-30",
            "Registro de nascimento",
            "Etapa registrada para demonstrar o fluxo; não corresponde a evento real.",
          ),
          fromStage: "Pré-natal",
        },
        {
          ...seedHistory(
            "SIM-MUL-AC-003-H03",
            "2026-11-04",
            "Puerpério",
            "Etapa administrativa demonstrativa; sem registro clínico.",
          ),
          fromStage: "Registro de nascimento",
        },
      ],
    },
    {
      id: "SIM-MUL-AC-004",
      personId: samplePeople[7]?.id ?? samplePeople[1]?.id ?? "SIM-PES-008",
      unitId: sampleUnits[0]?.id ?? "SIM-UBS-001",
      teamId: sampleTeams[0]?.id ?? "SIM-EQ-001",
      openedAt: "2026-08-15",
      stage: "Encerrado",
      history: [
        seedHistory(
          "SIM-MUL-AC-004-H01",
          "2026-08-15",
          "Pré-natal",
          "Abertura fictícia do acompanhamento.",
        ),
        {
          ...seedHistory(
            "SIM-MUL-AC-004-H02",
            "2026-09-12",
            "Registro de nascimento",
            "Registro sintético sem dados do evento real.",
          ),
          fromStage: "Pré-natal",
        },
        {
          ...seedHistory(
            "SIM-MUL-AC-004-H03",
            "2026-09-19",
            "Puerpério",
            "Etapa administrativa demonstrativa.",
          ),
          fromStage: "Registro de nascimento",
        },
        {
          ...seedHistory(
            "SIM-MUL-AC-004-H04",
            "2026-10-03",
            "Encerrado",
            "Registro fictício de encerramento do fluxo demonstrativo.",
          ),
          fromStage: "Puerpério",
        },
      ],
    },
  ],
  pendings: [
    {
      id: "SIM-MUL-PEN-001",
      followUpId: "SIM-MUL-AC-001",
      title: "Vincular o registro de atendimento à referência da unidade",
      assignedTo: "Equipe da UBS · demonstração",
      dueAt: "2026-11-18",
      status: "Aberta",
      createdAt: at("2026-11-12"),
    },
    {
      id: "SIM-MUL-PEN-002",
      followUpId: "SIM-MUL-AC-002",
      title: "Conferir o preenchimento administrativo do registro de nascimento",
      assignedTo: "Secretaria de Saúde · demonstração",
      dueAt: "2026-11-26",
      status: "Aberta",
      createdAt: at("2026-11-16"),
    },
    {
      id: "SIM-MUL-PEN-003",
      followUpId: "SIM-MUL-AC-003",
      title: "Atualizar a unidade de referência no cadastro do acompanhamento",
      assignedTo: "Equipe da UBS · demonstração",
      dueAt: "2026-11-25",
      status: "Aberta",
      createdAt: at("2026-11-17"),
    },
    {
      id: "SIM-MUL-PEN-004",
      followUpId: "SIM-MUL-AC-004",
      title: "Conferir o encerramento administrativo do registro",
      assignedTo: "Secretaria de Saúde · demonstração",
      dueAt: "2026-11-17",
      status: "Concluída",
      createdAt: at("2026-11-10"),
      completedAt: at("2026-11-17"),
    },
  ],
};

export const maternalStageTransitions: Record<
  MaternalStage,
  MaternalStage | undefined
> = {
  "Pré-natal": "Registro de nascimento",
  "Registro de nascimento": "Puerpério",
  Puerpério: "Encerrado",
  Encerrado: undefined,
};

export const getHealthMaternalSummary = (
  dataset: HealthMaternalDataset,
  referenceDate = "2026-11-19",
) => ({
  total: dataset.followUps.length,
  prenatal: dataset.followUps.filter((item) => item.stage === "Pré-natal")
    .length,
  birthRegistration: dataset.followUps.filter(
    (item) => item.stage === "Registro de nascimento",
  ).length,
  postpartum: dataset.followUps.filter((item) => item.stage === "Puerpério")
    .length,
  closed: dataset.followUps.filter((item) => item.stage === "Encerrado").length,
  openPendings: dataset.pendings.filter((item) => item.status === "Aberta")
    .length,
  overduePendings: dataset.pendings.filter(
    (item) =>
      item.status === "Aberta" && Boolean(item.dueAt && item.dueAt < referenceDate),
  ).length,
});

export const nextMaternalFollowUpId = (items: MaternalFollowUp[]) =>
  `SIM-MUL-AC-${String(items.length + 1).padStart(3, "0")}`;
export const nextMaternalPendingId = (items: MaternalPending[]) =>
  `SIM-MUL-PEN-${String(items.length + 1).padStart(3, "0")}`;
