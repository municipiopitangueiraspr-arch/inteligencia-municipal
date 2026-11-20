import { initialHealthActivities } from "./healthActivities";
import { initialHealthReferrals } from "./healthReferrals";
import { initialHealthTerritory } from "./healthTerritory";
import { initialPeopleRegistry } from "./peopleRegistry";

export const healthDiagnosticStatuses = [
  "Solicitado",
  "Agendado",
  "Em execução",
  "Realizado",
  "Resultado disponível",
  "Revisado",
  "Cancelado",
] as const;

export type HealthDiagnosticStatus = (typeof healthDiagnosticStatuses)[number];
export const healthDiagnosticKinds = [
  "Exame laboratorial",
  "Diagnóstico por imagem",
  "Procedimento",
] as const;
export type HealthDiagnosticKind = (typeof healthDiagnosticKinds)[number];
export type HealthDiagnosticPriority = "Rotina" | "Preferencial" | "Urgente";

export type HealthDiagnosticHistoryEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  fromStatus?: HealthDiagnosticStatus;
  toStatus: HealthDiagnosticStatus;
  note: string;
};

export type HealthDiagnosticRecord = {
  id: string;
  personId: string;
  serviceRecordId?: string;
  referralId?: string;
  professionalId: string;
  teamId: string;
  unitId: string;
  kind: HealthDiagnosticKind;
  serviceName: string;
  justification: string;
  priority: HealthDiagnosticPriority;
  requestedAt: string;
  destination: string;
  status: HealthDiagnosticStatus;
  scheduledAt?: string;
  startedAt?: string;
  performedAt?: string;
  resultAvailableAt?: string;
  reviewedAt?: string;
  resultSummary?: string;
  cancellationReason?: string;
  history: HealthDiagnosticHistoryEvent[];
};

export type HealthDiagnosticsDataset = {
  requests: HealthDiagnosticRecord[];
};

export const healthDiagnosticDestinations = [
  "Laboratório Municipal · Unidade Central",
  "Laboratório Regional · Polo Norte",
  "Serviço Regional de Diagnóstico · Polo Norte",
  "Centro de Especialidades Municipal",
  "UBS Municipal do Centro",
] as const;

export const healthDiagnosticSuggestions = [
  "Hemograma completo",
  "Glicemia de jejum",
  "Hemoglobina glicada",
  "Perfil lipídico",
  "Ultrassonografia abdominal",
  "Radiografia de tórax",
  "Eletrocardiograma",
  "Coleta de citopatológico",
  "Curativo especializado",
  "Pequeno procedimento ambulatorial",
];

const event = (
  id: string,
  at: string,
  actor: string,
  action: string,
  toStatus: HealthDiagnosticStatus,
  note: string,
  fromStatus?: HealthDiagnosticStatus,
): HealthDiagnosticHistoryEvent => ({
  id,
  at,
  actor,
  action,
  fromStatus,
  toStatus,
  note,
});

type SeedRequest = Omit<
  HealthDiagnosticRecord,
  "personId" | "professionalId" | "teamId" | "unitId"
> & {
  personId?: string;
  professionalId?: string;
  teamId?: string;
  unitId?: string;
};

const makeSeedRequest = (seed: SeedRequest): HealthDiagnosticRecord => {
  const service = initialHealthActivities.serviceRecords.find(
    (record) => record.id === seed.serviceRecordId,
  );
  const referral = initialHealthReferrals.referrals.find(
    (record) => record.id === seed.referralId,
  );
  const professionalId =
    seed.professionalId ??
    referral?.professionalId ??
    service?.professionalId ??
    initialHealthTerritory.professionals[0].id;
  const professional = initialHealthTerritory.professionals.find(
    (record) => record.id === professionalId,
  );

  return {
    ...seed,
    personId:
      seed.personId ??
      referral?.personId ??
      service?.personId ??
      initialPeopleRegistry.people[0].id,
    professionalId,
    teamId: seed.teamId ?? referral?.teamId ?? service?.teamId ?? professional?.teamId ?? initialHealthTerritory.teams[0].id,
    unitId: seed.unitId ?? referral?.unitId ?? service?.unitId ?? professional?.unitId ?? initialHealthTerritory.units[0].id,
  };
};

export const initialHealthDiagnostics: HealthDiagnosticsDataset = {
  requests: [
    makeSeedRequest({
      id: "SIM-EXA-001",
      serviceRecordId: "SIM-ATD-001",
      kind: "Exame laboratorial",
      serviceName: "Hemoglobina glicada",
      justification: "Acompanhamento demonstrativo de condição crônica registrado no atendimento.",
      priority: "Preferencial",
      requestedAt: "2026-11-20",
      destination: "Laboratório Municipal · Unidade Central",
      status: "Solicitado",
      history: [
        event("SIM-EXA-001-H01", "2026-11-20T09:05:00", "Ana Paula Ribeiro", "Pedido registrado", "Solicitado", "Solicitação fictícia vinculada ao atendimento SIM-ATD-001."),
      ],
    }),
    makeSeedRequest({
      id: "SIM-EXA-002",
      referralId: "SIM-SAU-ENC-039",
      kind: "Diagnóstico por imagem",
      serviceName: "Ultrassonografia abdominal",
      justification: "Exame complementar demonstrativo relacionado à continuidade do cuidado especializado.",
      priority: "Rotina",
      requestedAt: "2026-11-06",
      destination: "Serviço Regional de Diagnóstico · Polo Norte",
      status: "Agendado",
      scheduledAt: "2026-12-04",
      history: [
        event("SIM-EXA-002-H01", "2026-11-06T10:15:00", "Profissional da UBS", "Pedido registrado", "Solicitado", "Pedido fictício vinculado ao encaminhamento SIM-SAU-ENC-039."),
        event("SIM-EXA-002-H02", "2026-11-19T15:10:00", "Regulação municipal", "Exame agendado", "Agendado", "Data reservada para 04/12 no serviço regional demonstrativo.", "Solicitado"),
      ],
    }),
    makeSeedRequest({
      id: "SIM-EXA-003",
      personId: "SIM-PES-006",
      professionalId: "SIM-PRO-004",
      kind: "Exame laboratorial",
      serviceName: "Hemograma completo",
      justification: "Solicitação laboratorial fictícia recebida para pessoa cadastrada; não vinculada à consulta ainda agendada.",
      priority: "Rotina",
      requestedAt: "2026-11-20",
      destination: "Laboratório Municipal · Unidade Central",
      status: "Solicitado",
      history: [
        event("SIM-EXA-003-H01", "2026-11-20T09:00:00", "Profissional da UBS", "Pedido registrado", "Solicitado", "Solicitação demonstrativa para pessoa cadastrada; atendimento previsto para 20/11 ainda não ocorreu."),
      ],
    }),
    makeSeedRequest({
      id: "SIM-EXA-004",
      serviceRecordId: "SIM-ATD-001",
      kind: "Exame laboratorial",
      serviceName: "Perfil lipídico",
      justification: "Exame complementar fictício definido durante o atendimento realizado.",
      priority: "Rotina",
      requestedAt: "2026-11-20",
      destination: "Laboratório Municipal · Unidade Central",
      status: "Realizado",
      scheduledAt: "2026-11-20",
      startedAt: "2026-11-20",
      performedAt: "2026-11-20",
      history: [
        event("SIM-EXA-004-H01", "2026-11-20T09:25:00", "Ana Paula Ribeiro", "Pedido registrado", "Solicitado", "Pedido fictício vinculado ao atendimento SIM-ATD-001."),
        event("SIM-EXA-004-H02", "2026-11-20T10:00:00", "Recepção da unidade", "Exame agendado", "Agendado", "Coleta reservada para 20/11.", "Solicitado"),
        event("SIM-EXA-004-H03", "2026-11-20T10:40:00", "Laboratório Municipal", "Coleta realizada", "Realizado", "Coleta concluída; laudo ainda em processamento.", "Agendado"),
      ],
    }),
    makeSeedRequest({
      id: "SIM-EXA-005",
      personId: "SIM-PES-001",
      professionalId: "SIM-PRO-001",
      kind: "Exame laboratorial",
      serviceName: "Glicemia de jejum",
      justification: "Acompanhamento laboratorial fictício conforme plano registrado no atendimento.",
      priority: "Preferencial",
      requestedAt: "2026-11-12",
      destination: "Laboratório Municipal · Unidade Central",
      status: "Resultado disponível",
      scheduledAt: "2026-11-14",
      startedAt: "2026-11-14",
      performedAt: "2026-11-14",
      resultAvailableAt: "2026-11-15",
      resultSummary: "Resultado demonstrativo liberado para conferência do profissional; valores clínicos não representam exame real.",
      history: [
        event("SIM-EXA-005-H01", "2026-11-12T09:00:00", "Ana Paula Ribeiro", "Pedido registrado", "Solicitado", "Pedido fictício manual associado à pessoa já cadastrada; não duplica atendimento."),
        event("SIM-EXA-005-H02", "2026-11-13T10:20:00", "Recepção da unidade", "Exame agendado", "Agendado", "Coleta reservada para 14/11.", "Solicitado"),
        event("SIM-EXA-005-H03", "2026-11-14T08:15:00", "Laboratório Municipal", "Coleta realizada", "Realizado", "Amostra coletada e encaminhada para análise.", "Agendado"),
        event("SIM-EXA-005-H04", "2026-11-15T16:00:00", "Laboratório Municipal", "Resultado disponibilizado", "Resultado disponível", "Laudo demonstrativo liberado para avaliação da equipe assistente.", "Realizado"),
      ],
    }),
    makeSeedRequest({
      id: "SIM-EXA-006",
      referralId: "SIM-SAU-ENC-040",
      kind: "Procedimento",
      serviceName: "Eletrocardiograma",
      justification: "Procedimento demonstrativo solicitado como etapa complementar do cuidado especializado.",
      priority: "Preferencial",
      requestedAt: "2026-11-10",
      destination: "Centro de Especialidades Municipal",
      status: "Revisado",
      scheduledAt: "2026-11-12",
      startedAt: "2026-11-12",
      performedAt: "2026-11-12",
      resultAvailableAt: "2026-11-13",
      reviewedAt: "2026-11-14",
      resultSummary: "Laudo demonstrativo recebido. Conteúdo apenas ilustrativo, sem valor diagnóstico.",
      history: [
        event("SIM-EXA-006-H01", "2026-11-10T09:10:00", "Profissional da UBS", "Pedido registrado", "Solicitado", "Procedimento fictício vinculado ao encaminhamento SIM-SAU-ENC-040."),
        event("SIM-EXA-006-H02", "2026-11-11T13:00:00", "Recepção da unidade", "Procedimento agendado", "Agendado", "Horário reservado para 12/11.", "Solicitado"),
        event("SIM-EXA-006-H03", "2026-11-12T10:30:00", "Equipe assistencial", "Procedimento realizado", "Realizado", "Procedimento demonstrativo concluído.", "Agendado"),
        event("SIM-EXA-006-H04", "2026-11-13T15:40:00", "Serviço executor", "Resultado disponibilizado", "Resultado disponível", "Laudo fictício anexado ao evento clínico.", "Realizado"),
        event("SIM-EXA-006-H05", "2026-11-14T09:20:00", "Ana Paula Ribeiro", "Resultado revisado", "Revisado", "Resultado conferido pela profissional solicitante; retorno registrado para seguimento.", "Resultado disponível"),
      ],
    }),
    makeSeedRequest({
      id: "SIM-EXA-007",
      personId: "SIM-PES-009",
      professionalId: "SIM-PRO-004",
      kind: "Diagnóstico por imagem",
      serviceName: "Radiografia de tórax",
      justification: "Solicitação manual demonstrativa associada à pessoa já cadastrada na rede.",
      priority: "Rotina",
      requestedAt: "2026-11-13",
      destination: "Serviço Regional de Diagnóstico · Polo Norte",
      status: "Cancelado",
      cancellationReason: "Pedido cancelado pela unidade antes do agendamento; nova avaliação clínica será feita.",
      history: [
        event("SIM-EXA-007-H01", "2026-11-13T11:10:00", "Profissional da UBS", "Pedido registrado", "Solicitado", "Pedido demonstrativo manual para pessoa cadastrada; sem duplicar atendimento."),
        event("SIM-EXA-007-H02", "2026-11-14T08:50:00", "Secretaria de Saúde", "Pedido cancelado", "Cancelado", "Cancelado antes do agendamento; nova avaliação clínica será feita.", "Solicitado"),
      ],
    }),
    makeSeedRequest({
      id: "SIM-EXA-008",
      personId: "SIM-PES-005",
      professionalId: "SIM-PRO-007",
      kind: "Procedimento",
      serviceName: "Coleta de citopatológico",
      justification: "Acompanhamento preventivo demonstrativo registrado pela equipe de referência.",
      priority: "Rotina",
      requestedAt: "2026-11-20",
      destination: "UBS Municipal do Centro",
      status: "Solicitado",
      history: [
        event("SIM-EXA-008-H01", "2026-11-20T10:25:00", "Renata de Fátima Gomes", "Pedido registrado", "Solicitado", "Solicitação fictícia para pessoa já cadastrada, ainda sem data de execução."),
      ],
    }),
    makeSeedRequest({
      id: "SIM-EXA-009",
      serviceRecordId: "SIM-ATD-005",
      kind: "Exame laboratorial",
      serviceName: "Glicemia de jejum",
      justification: "Exame complementar fictício relacionado ao acompanhamento de enfermagem.",
      priority: "Preferencial",
      requestedAt: "2026-11-19",
      destination: "Laboratório Regional · Polo Norte",
      status: "Agendado",
      scheduledAt: "2026-11-24",
      history: [
        event("SIM-EXA-009-H01", "2026-11-19T15:50:00", "João Marcos de Oliveira", "Pedido registrado", "Solicitado", "Pedido vinculado ao atendimento SIM-ATD-005."),
        event("SIM-EXA-009-H02", "2026-11-20T09:40:00", "Regulação municipal", "Coleta agendada", "Agendado", "Coleta reservada para 24/11 no serviço regional demonstrativo.", "Solicitado"),
      ],
    }),
  ],
};

const dayNumber = (value: string | Date) => {
  const datePart = value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
  const [year, month, day] = datePart.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

export const getHealthDiagnosticWaitDays = (
  request: HealthDiagnosticRecord,
  referenceDate: string | Date = new Date(),
) =>
  Math.max(0, Math.floor((dayNumber(referenceDate) - dayNumber(request.requestedAt)) / 86_400_000));

export const getHealthDiagnosticSummary = (requests: HealthDiagnosticRecord[]) => ({
  total: requests.length,
  requested: requests.filter((request) => request.status === "Solicitado").length,
  scheduled: requests.filter((request) => request.status === "Agendado").length,
  inProgress: requests.filter((request) => request.status === "Em execução").length,
  performed: requests.filter((request) => request.status === "Realizado").length,
  resultsPendingReview: requests.filter((request) => request.status === "Resultado disponível").length,
  reviewed: requests.filter((request) => request.status === "Revisado").length,
  cancelled: requests.filter((request) => request.status === "Cancelado").length,
});

export const nextHealthDiagnosticId = (requests: HealthDiagnosticRecord[]) => {
  const highest = requests.reduce((current, request) => {
    const value = Number(request.id.match(/(\d+)$/)?.[1] ?? 0);
    return Math.max(current, value);
  }, 0);
  return `SIM-EXA-${String(highest + 1).padStart(3, "0")}`;
};
