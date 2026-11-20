import { initialHealthActivities } from "./healthActivities";
import { initialHealthTerritory } from "./healthTerritory";
import { initialPeopleRegistry } from "./peopleRegistry";

export const healthReferralStatuses = [
  "Em análise",
  "Aguardando vaga",
  "Vaga ofertada",
  "Agendado",
  "Realizado",
  "Devolvido à origem",
  "Cancelado",
] as const;

export type HealthReferralStatus = (typeof healthReferralStatuses)[number];
export type HealthReferralPriority = "Rotina" | "Preferencial" | "Urgente";

export type HealthReferralHistoryEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  fromStatus?: HealthReferralStatus;
  toStatus: HealthReferralStatus;
  note: string;
};

export type HealthReferralRecord = {
  id: string;
  personId: string;
  serviceRecordId?: string;
  professionalId: string;
  teamId: string;
  unitId: string;
  specialty: string;
  justification: string;
  priority: HealthReferralPriority;
  referredAt: string;
  destination: string;
  status: HealthReferralStatus;
  offeredAt?: string;
  appointmentAt?: string;
  completedAt?: string;
  outcome?: string;
  history: HealthReferralHistoryEvent[];
};

export type HealthReferralsDataset = {
  referrals: HealthReferralRecord[];
};

const specialties = [
  "Cardiologia",
  "Oftalmologia",
  "Ortopedia",
  "Dermatologia",
  "Neurologia",
  "Otorrinolaringologia",
  "Endocrinologia",
  "Ginecologia",
  "Fisioterapia especializada",
  "Ultrassonografia",
  "Psiquiatria",
  "Urologia",
];

const destinations = [
  "Consórcio Regional de Saúde — Polo Norte",
  "Ambulatório Regional de Especialidades",
  "Centro de Especialidades Municipal",
  "Serviço Regional de Diagnóstico",
];

const justifications = [
  "Avaliação especializada solicitada após atendimento na rede municipal.",
  "Necessidade de investigação complementar registrada pela equipe assistente.",
  "Acompanhamento especializado recomendado para continuidade do cuidado.",
  "Solicitação de avaliação conforme conduta registrada no atendimento de origem.",
  "Necessidade de exame ou procedimento não ofertado na unidade de origem.",
  "Reavaliação especializada solicitada pela equipe de referência.",
];

const activeTeams = initialHealthTerritory.teams.filter((team) => team.active);
const activePeople = initialPeopleRegistry.people.filter(
  (person) => person.status === "Ativa",
);
const completedSource = initialHealthActivities.serviceRecords.find(
  (service) => service.status === "Realizado",
);

const makeHistory = (
  id: string,
  referredAt: string,
  status: HealthReferralStatus,
  note: string,
  update?: {
    at: string;
    fromStatus: HealthReferralStatus;
    action: string;
    detail: string;
  },
): HealthReferralHistoryEvent[] => {
  const initial: HealthReferralHistoryEvent = {
    id: `${id}-H01`,
    at: `${referredAt}T09:00:00`,
    actor: "Profissional da UBS",
    action: "Encaminhamento registrado",
    toStatus: update?.fromStatus ?? status,
    note,
  };
  if (!update) return [initial];
  return [
    initial,
    {
      id: `${id}-H02`,
      at: update.at,
      actor: "Regulação municipal",
      action: update.action,
      fromStatus: update.fromStatus,
      toStatus: status,
      note: update.detail,
    },
  ];
};

const buildReferral = (
  index: number,
  options: {
    status: HealthReferralStatus;
    referredAt: string;
    serviceRecordId?: string;
    offeredAt?: string;
    appointmentAt?: string;
    completedAt?: string;
    outcome?: string;
    update?: {
      at: string;
      fromStatus: HealthReferralStatus;
      action: string;
      detail: string;
    };
  },
): HealthReferralRecord => {
  const id = `SIM-SAU-ENC-${String(index + 1).padStart(3, "0")}`;
  const source = options.serviceRecordId
    ? initialHealthActivities.serviceRecords.find(
        (service) => service.id === options.serviceRecordId,
      )
    : undefined;
  const person = source
    ? initialPeopleRegistry.people.find(
        (candidate) => candidate.id === source.personId,
      )
    : activePeople[(index * 5 + 2) % activePeople.length];
  const team = source
    ? initialHealthTerritory.teams.find(
        (candidate) => candidate.id === source.teamId,
      )
    : activeTeams[(index + 1) % activeTeams.length];
  const professional = source
    ? initialHealthTerritory.professionals.find(
        (candidate) => candidate.id === source.professionalId,
      )
    : initialHealthTerritory.professionals.find(
        (candidate) => candidate.teamId === team?.id && candidate.active,
      );
  const personName = person?.preferredName ?? person?.fullName ?? "Pessoa cadastrada";
  const specialty = specialties[index % specialties.length];
  const note = `${personName} — ${justifications[index % justifications.length]}`;

  return {
    id,
    personId: person?.id ?? activePeople[0].id,
    serviceRecordId: source?.id,
    professionalId: professional?.id ?? initialHealthTerritory.professionals[0].id,
    teamId: team?.id ?? activeTeams[0].id,
    unitId: source?.unitId ?? team?.unitId ?? initialHealthTerritory.units[0].id,
    specialty,
    justification: justifications[index % justifications.length],
    priority: index % 11 === 0 ? "Urgente" : index % 4 === 0 ? "Preferencial" : "Rotina",
    referredAt: options.referredAt,
    destination: destinations[index % destinations.length],
    status: options.status,
    offeredAt: options.offeredAt,
    appointmentAt: options.appointmentAt,
    completedAt: options.completedAt,
    outcome: options.outcome,
    history: makeHistory(
      id,
      options.referredAt,
      options.status,
      `${note} Registro fictício vinculado à pessoa e à origem assistencial demonstrativa.`,
      options.update,
    ),
  };
};

const waitingReferrals = Array.from({ length: 36 }, (_, index) =>
  buildReferral(index, {
    status: "Aguardando vaga",
    referredAt: index < 8 ? "2026-09-15" : "2026-11-01",
    serviceRecordId: index === 0 ? completedSource?.id : undefined,
  }),
);

const progressedReferrals: HealthReferralRecord[] = [
  buildReferral(36, {
    status: "Em análise",
    referredAt: "2026-11-18",
    update: {
      at: "2026-11-19T10:20:00",
      fromStatus: "Em análise",
      action: "Documentação recebida",
      detail: "Pedido recebido na regulação; conferência de dados em andamento.",
    },
  }),
  buildReferral(37, {
    status: "Vaga ofertada",
    referredAt: "2026-11-08",
    offeredAt: "2026-11-19",
    update: {
      at: "2026-11-19T14:10:00",
      fromStatus: "Aguardando vaga",
      action: "Vaga ofertada",
      detail: "Oferta regional fictícia registrada; aguarda confirmação com a pessoa.",
    },
  }),
  buildReferral(38, {
    status: "Agendado",
    referredAt: "2026-11-06",
    offeredAt: "2026-11-17",
    appointmentAt: "2026-12-04",
    update: {
      at: "2026-11-19T15:00:00",
      fromStatus: "Vaga ofertada",
      action: "Consulta agendada",
      detail: "Data reservada no serviço regional demonstrativo para 04/12.",
    },
  }),
  buildReferral(39, {
    status: "Realizado",
    referredAt: "2026-10-28",
    offeredAt: "2026-11-10",
    appointmentAt: "2026-11-20",
    completedAt: "2026-11-20",
    outcome: "Atendimento realizado; retorno à unidade de origem registrado.",
    update: {
      at: "2026-11-20T10:30:00",
      fromStatus: "Agendado",
      action: "Atendimento especializado realizado",
      detail: "Resultado fictício recebido e vinculado ao encaminhamento.",
    },
  }),
  buildReferral(40, {
    status: "Devolvido à origem",
    referredAt: "2026-11-13",
    update: {
      at: "2026-11-19T09:30:00",
      fromStatus: "Em análise",
      action: "Devolvido à unidade de origem",
      detail: "Falta informação clínica necessária; complementar e reenviar se indicado.",
    },
  }),
  buildReferral(41, {
    status: "Cancelado",
    referredAt: "2026-11-12",
    update: {
      at: "2026-11-19T16:15:00",
      fromStatus: "Aguardando vaga",
      action: "Encaminhamento cancelado",
      detail: "Cancelamento demonstrativo a pedido da unidade de origem.",
    },
  }),
];

export const initialHealthReferrals: HealthReferralsDataset = {
  referrals: [...progressedReferrals, ...waitingReferrals],
};

const parseDay = (value: string | Date) => {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
};

export const getHealthReferralWaitDays = (
  referral: HealthReferralRecord,
  referenceDate: string | Date = new Date(),
) =>
  Math.max(
    0,
    Math.floor(
      (parseDay(referenceDate).getTime() - parseDay(referral.referredAt).getTime()) /
        86_400_000,
    ),
  );

export const getHealthReferralSummary = (
  referrals: HealthReferralRecord[],
  referenceDate: string | Date = new Date(),
) => {
  const waiting = referrals.filter(
    (referral) => referral.status === "Aguardando vaga",
  );
  return {
    total: referrals.length,
    underRegulation: referrals.filter((referral) =>
      ["Em análise", "Aguardando vaga", "Vaga ofertada"].includes(referral.status),
    ).length,
    waiting: waiting.length,
    waitingOver60Days: waiting.filter(
      (referral) => getHealthReferralWaitDays(referral, referenceDate) > 60,
    ).length,
    offered: referrals.filter((referral) => referral.status === "Vaga ofertada")
      .length,
    scheduled: referrals.filter((referral) => referral.status === "Agendado")
      .length,
    completed: referrals.filter((referral) => referral.status === "Realizado")
      .length,
    returned: referrals.filter(
      (referral) => referral.status === "Devolvido à origem",
    ).length,
    cancelled: referrals.filter((referral) => referral.status === "Cancelado")
      .length,
  };
};

export const nextHealthReferralId = (referrals: HealthReferralRecord[]) => {
  const highest = referrals.reduce((current, referral) => {
    const value = Number(referral.id.match(/(\d+)$/)?.[1] ?? 0);
    return Math.max(current, value);
  }, 0);
  return `SIM-SAU-ENC-${String(highest + 1).padStart(3, "0")}`;
};
