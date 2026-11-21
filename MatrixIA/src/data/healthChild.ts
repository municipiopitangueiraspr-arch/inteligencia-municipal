import { initialHealthMaternal } from "./healthMaternal";

export const childTransitionStages = [
  "Transição registrada",
  "Recebida pela APS",
  "Referência administrativa conferida",
  "Fluxo administrativo encerrado",
] as const;
export type ChildTransitionStage = (typeof childTransitionStages)[number];

export type ChildTransitionHistoryEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  fromStage?: ChildTransitionStage;
  toStage?: ChildTransitionStage;
  note: string;
};

export type ChildTransition = {
  id: string;
  childReferenceId: string;
  maternalFollowUpId: string;
  responsiblePersonId: string;
  unitId: string;
  teamId: string;
  recordedAt: string;
  stage: ChildTransitionStage;
  history: ChildTransitionHistoryEvent[];
};

export const childAdministrativePendingTypes = [
  "Confirmar recebimento administrativo pela APS",
  "Conferir vínculo da unidade e equipe de referência",
  "Conferir identificador sintético vinculado à origem materna",
  "Concluir conferência administrativa do registro",
] as const;
export type ChildAdministrativePendingType =
  (typeof childAdministrativePendingTypes)[number];

export type ChildTransitionPending = {
  id: string;
  transitionId: string;
  title: ChildAdministrativePendingType;
  assignedTo:
    | "Equipe da APS · demonstração"
    | "Secretaria de Saúde · demonstração";
  status: "Aberta" | "Concluída";
  createdAt: string;
  completedAt?: string;
};

export type HealthChildDataset = {
  transitions: ChildTransition[];
  pendings: ChildTransitionPending[];
};

const historicalPuerperiumSource = initialHealthMaternal.followUps.find(
  (item) =>
    item.id === "SIM-MUL-AC-004" &&
    item.history.some((event) => event.toStage === "Puerpério"),
);
const at = (date: string) => `${date}T09:00:00-03:00`;

const initialTransitions: ChildTransition[] = historicalPuerperiumSource
  ? [
      {
        id: "SIM-CRI-TR-001",
        childReferenceId: "SIM-CRI-001",
        maternalFollowUpId: historicalPuerperiumSource.id,
        responsiblePersonId: historicalPuerperiumSource.personId,
        unitId: historicalPuerperiumSource.unitId,
        teamId: historicalPuerperiumSource.teamId,
        recordedAt: "2026-09-19",
        stage: "Referência administrativa conferida",
        history: [
          {
            id: "SIM-CRI-TR-001-H01",
            at: at("2026-09-19"),
            actor: "Secretaria de Saúde · demonstração",
            action: "Transição administrativa registrada",
            toStage: "Transição registrada",
            note: "Referência sintética vinculada à passagem pelo puerpério; sem dados clínicos.",
          },
          {
            id: "SIM-CRI-TR-001-H02",
            at: at("2026-09-20"),
            actor: "Equipe da APS · demonstração",
            action: "Recepção administrativa confirmada",
            fromStage: "Transição registrada",
            toStage: "Recebida pela APS",
            note: "Recepção fictícia para demonstração de fluxo; não representa atendimento.",
          },
          {
            id: "SIM-CRI-TR-001-H03",
            at: at("2026-10-02"),
            actor: "Secretaria de Saúde · demonstração",
            action: "Referência administrativa conferida",
            fromStage: "Recebida pela APS",
            toStage: "Referência administrativa conferida",
            note: "Vínculo territorial demonstrativo conferido; sem avaliação ou conclusão clínica.",
          },
        ],
      },
    ]
  : [];

export const initialHealthChild: HealthChildDataset = {
  transitions: initialTransitions,
  pendings: initialTransitions.length
    ? [
        {
          id: "SIM-CRI-PEN-001",
          transitionId: initialTransitions[0].id,
          title: "Concluir conferência administrativa do registro",
          assignedTo: "Secretaria de Saúde · demonstração",
          status: "Aberta",
          createdAt: at("2026-10-03"),
        },
      ]
    : [],
};

export const childTransitionNextStages: Record<
  ChildTransitionStage,
  ChildTransitionStage | undefined
> = {
  "Transição registrada": "Recebida pela APS",
  "Recebida pela APS": "Referência administrativa conferida",
  "Referência administrativa conferida": "Fluxo administrativo encerrado",
  "Fluxo administrativo encerrado": undefined,
};

export const hasMaternalPuerperiumStage = (
  followUp: (typeof initialHealthMaternal.followUps)[number],
) =>
  followUp.stage === "Puerpério" ||
  followUp.history.some((event) => event.toStage === "Puerpério");

export const getHealthChildSummary = (dataset: HealthChildDataset) => ({
  total: dataset.transitions.length,
  registered: dataset.transitions.filter(
    (item) => item.stage === "Transição registrada",
  ).length,
  received: dataset.transitions.filter(
    (item) => item.stage === "Recebida pela APS",
  ).length,
  verified: dataset.transitions.filter(
    (item) => item.stage === "Referência administrativa conferida",
  ).length,
  closed: dataset.transitions.filter(
    (item) => item.stage === "Fluxo administrativo encerrado",
  ).length,
  openPendings: dataset.pendings.filter((item) => item.status === "Aberta")
    .length,
});

export const nextChildTransitionId = (items: ChildTransition[]) =>
  `SIM-CRI-TR-${String(items.length + 1).padStart(3, "0")}`;
export const nextChildReferenceId = (items: ChildTransition[]) =>
  `SIM-CRI-${String(items.length + 1).padStart(3, "0")}`;
export const nextChildPendingId = (items: ChildTransitionPending[]) =>
  `SIM-CRI-PEN-${String(items.length + 1).padStart(3, "0")}`;
