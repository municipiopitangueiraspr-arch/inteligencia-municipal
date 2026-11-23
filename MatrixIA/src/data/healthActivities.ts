export type HealthActivityHistoryEvent = {
  date: string;
  action: string;
  detail: string;
};

export type HomeVisitKind = "ACS" | "ACE";
export type HomeVisitStatus =
  | "Programada"
  | "Realizada"
  | "Sem contato"
  | "Recusa"
  | "Retorno necessário";
export type HealthServiceStatus =
  | "Agendado"
  | "Realizado"
  | "Não compareceu"
  | "Cancelado";

export type HealthCompetenceStatus =
  | "Rascunho"
  | "Aguardando revisão"
  | "Validado"
  | "Fechado"
  | "Reaberto";

export type HealthAttendanceCharacter = "Programado" | "Demanda espontânea" | "Urgência";

export type HealthProcedure = {
  id: string;
  name: string;
  quantity: number;
  result?: string;
};

export type HealthDentalDetails = {
  reason: string;
  procedure: string;
  toothOrRegion?: string;
  urgency: "Não" | "Sim";
  guidance?: string;
};

export type HealthAttendanceModality =
  | "Consulta programada"
  | "Demanda espontânea"
  | "Atendimento domiciliar"
  | "Teleatendimento";

export type HealthAttendanceOutcome =
  | "Acompanhamento mantido"
  | "Retorno programado"
  | "Encaminhamento realizado"
  | "Procedimento realizado"
  | "Alta do acompanhamento"
  | "Não concluído";

export type HealthVitalSigns = {
  bloodPressure?: string;
  heartRateBpm?: number;
  respiratoryRate?: number;
  temperatureC?: number;
  oxygenSaturation?: number;
  glucoseMgDl?: number;
  weightKg?: number;
  heightCm?: number;
  painScale?: number;
};

export type CollectiveActivityStatus = "Planejada" | "Realizada" | "Cancelada";

export type CollectiveActivityRecord = {
  id: string;
  unitId: string;
  teamId: string;
  professionalId: string;
  date: string;
  time: string;
  competence: string;
  activityType: string;
  theme: string;
  targetAudience: string;
  participantCount: number;
  outcome: string;
  status: CollectiveActivityStatus;
  history: HealthActivityHistoryEvent[];
};

export type FoodMarkerRecord = {
  id: string;
  personId: string;
  attendanceId?: string;
  unitId: string;
  teamId: string;
  professionalId: string;
  measuredAt: string;
  competence: string;
  weightKg?: number;
  heightCm?: number;
  markerSummary: string;
  nutritionalAssessment: string;
  history: HealthActivityHistoryEvent[];
};

export type HomeVisitRecord = {
  id: string;
  kind: HomeVisitKind;
  householdId: string;
  personId?: string;
  familyId?: string;
  professionalId: string;
  teamId: string;
  unitId: string;
  areaId: string;
  date: string;
  time: string;
  activityType: string;
  status: HomeVisitStatus;
  outcomeSummary: string;
  environmentalFinding?: string;
  followUpDate?: string;
  notes: string;
  history: HealthActivityHistoryEvent[];
};

export type HealthServiceRecord = {
  id: string;
  personId: string;
  professionalId: string;
  teamId: string;
  unitId: string;
  date: string;
  time: string;
  competence: string;
  competenceStatus?: HealthCompetenceStatus;
  modality: HealthAttendanceModality;
  character?: HealthAttendanceCharacter;
  serviceType: string;
  status: HealthServiceStatus;
  reason: string;
  conditionOrFollowUp: string;
  conditions?: string[];
  procedures?: HealthProcedure[];
  dentalDetails?: HealthDentalDetails;
  outcome: HealthAttendanceOutcome;
  careSummary: string;
  carePlan?: string;
  referral: string;
  followUpDate?: string;
  statusReason?: string;
  vitalSigns?: HealthVitalSigns;
  history: HealthActivityHistoryEvent[];
};

export type HealthActivitiesDataset = {
  homeVisits: HomeVisitRecord[];
  serviceRecords: HealthServiceRecord[];
  collectiveActivities: CollectiveActivityRecord[];
  foodMarkers: FoodMarkerRecord[];
};

const visitHistory = (
  date: string,
  action: string,
  detail: string,
): HealthActivityHistoryEvent[] => [{ date, action, detail }];

export const initialHealthActivities: HealthActivitiesDataset = {
  homeVisits: [
    {
      id: "SIM-VIS-001",
      kind: "ACS",
      householdId: "SIM-DOM-001",
      personId: "SIM-PES-001",
      familyId: "SIM-FAM-001",
      professionalId: "SIM-PRO-003",
      teamId: "SIM-EQ-001",
      unitId: "SIM-UBS-001",
      areaId: "SIM-AREA-001",
      date: "2026-11-20",
      time: "08:30",
      activityType: "Acompanhamento de rotina",
      status: "Realizada",
      outcomeSummary:
        "Contato com a moradora de referência; rotina familiar revisada e orientações registradas.",
      followUpDate: "",
      notes: "Visita vinculada ao domicílio cadastrado, sem atualização do cadastro-base.",
      history: visitHistory(
        "2026-11-20T08:45:00",
        "Visita registrada",
        "Visita domiciliar realizada pela ACS Luciana Ferreira Costa.",
      ),
    },
    {
      id: "SIM-VIS-002",
      kind: "ACS",
      householdId: "SIM-DOM-004",
      personId: "SIM-PES-007",
      familyId: "SIM-FAM-004",
      professionalId: "SIM-PRO-006",
      teamId: "SIM-EQ-003",
      unitId: "SIM-UBS-003",
      areaId: "SIM-AREA-004",
      date: "2026-11-20",
      time: "10:15",
      activityType: "Acompanhamento e orientação",
      status: "Programada",
      outcomeSummary: "",
      followUpDate: "",
      notes: "Roteiro da equipe rural; confirmar presença no endereço antes do deslocamento.",
      history: visitHistory(
        "2026-11-19T16:10:00",
        "Visita programada",
        "Incluída no roteiro de campo da microárea rural.",
      ),
    },
    {
      id: "SIM-VIS-003",
      kind: "ACE",
      householdId: "SIM-DOM-002",
      personId: "SIM-PES-003",
      familyId: "SIM-FAM-002",
      professionalId: "SIM-PRO-011",
      teamId: "SIM-EQ-001",
      unitId: "SIM-UBS-001",
      areaId: "SIM-AREA-001",
      date: "2026-11-20",
      time: "09:00",
      activityType: "Inspeção de imóvel",
      status: "Retorno necessário",
      outcomeSummary:
        "Inspeção realizada; recipiente com água parado identificado e ação de eliminação orientada.",
      environmentalFinding:
        "Recipiente exposto com água; orientação e remoção registradas na visita.",
      followUpDate: "2026-11-27",
      notes: "Retornar para verificar se a medida orientada foi mantida.",
      history: visitHistory(
        "2026-11-20T09:25:00",
        "Visita registrada",
        "Inspeção de campo concluída com retorno programado para 27/11.",
      ),
    },
    {
      id: "SIM-VIS-004",
      kind: "ACE",
      householdId: "SIM-DOM-005",
      personId: "SIM-PES-009",
      familyId: "SIM-FAM-005",
      professionalId: "SIM-PRO-010",
      teamId: "SIM-EQ-004",
      unitId: "SIM-UBS-001",
      areaId: "SIM-AREA-003",
      date: "2026-11-19",
      time: "14:20",
      activityType: "Retorno para verificação",
      status: "Sem contato",
      outcomeSummary: "Imóvel fechado no momento da tentativa de retorno.",
      environmentalFinding: "Não foi possível observar o quintal nesta visita.",
      followUpDate: "2026-11-24",
      notes: "Nova tentativa prevista para o próximo roteiro do setor Leste.",
      history: visitHistory(
        "2026-11-19T14:35:00",
        "Visita registrada",
        "Tentativa sem contato; nova tentativa indicada para 24/11.",
      ),
    },
  ],
  serviceRecords: [
    {
      id: "SIM-ATD-001",
      personId: "SIM-PES-001",
      professionalId: "SIM-PRO-001",
      teamId: "SIM-EQ-001",
      unitId: "SIM-UBS-001",
      date: "2026-11-20",
      competence: "2026-11",
      modality: "Consulta programada",
      time: "08:15",
      serviceType: "Consulta médica",
      status: "Realizado",
      reason: "Acompanhamento de condição crônica",
      conditionOrFollowUp: "Acompanhamento longitudinal",
      outcome: "Retorno programado",
      careSummary:
        "Atendimento concluído; avaliação e orientação de rotina registradas no cenário demonstrativo.",
      carePlan: "Manter acompanhamento longitudinal e retornar na data programada para revisão.",
      referral: "",
      followUpDate: "2026-12-18",
      history: visitHistory(
        "2026-11-20T08:50:00",
        "Atendimento registrado",
        "Consulta médica realizada na UBS Municipal do Centro.",
      ),
    },
    {
      id: "SIM-ATD-002",
      personId: "SIM-PES-006",
      professionalId: "SIM-PRO-004",
      teamId: "SIM-EQ-002",
      unitId: "SIM-UBS-002",
      date: "2026-11-20",
      competence: "2026-11",
      modality: "Consulta programada",
      time: "14:00",
      serviceType: "Consulta médica",
      status: "Agendado",
      reason: "Acompanhamento na unidade",
      conditionOrFollowUp: "Acompanhamento de rotina",
      outcome: "Acompanhamento mantido",
      careSummary: "",
      referral: "",
      followUpDate: "",
      history: visitHistory(
        "2026-11-19T11:30:00",
        "Atendimento agendado",
        "Horário reservado na USF Jardim do Norte.",
      ),
    },
    {
      id: "SIM-ATD-003",
      personId: "SIM-PES-005",
      professionalId: "SIM-PRO-007",
      teamId: "SIM-EQ-004",
      unitId: "SIM-UBS-001",
      date: "2026-11-19",
      competence: "2026-11",
      modality: "Consulta programada",
      time: "13:30",
      serviceType: "Atendimento odontológico",
      status: "Não compareceu",
      reason: "Consulta odontológica programada",
      conditionOrFollowUp: "Cuidado odontológico",
      outcome: "Não concluído",
      careSummary: "",
      referral: "Contato para reorganizar o agendamento.",
      followUpDate: "2026-11-26",
      history: visitHistory(
        "2026-11-19T14:00:00",
        "Situação atualizada",
        "Ausência registrada; contato para reagendamento indicado.",
      ),
    },
    {
      id: "SIM-ATD-004",
      personId: "SIM-PES-008",
      professionalId: "SIM-PRO-008",
      teamId: "SIM-EQ-004",
      unitId: "SIM-UBS-001",
      date: "2026-11-21",
      competence: "2026-11",
      modality: "Consulta programada",
      time: "10:30",
      serviceType: "Fisioterapia",
      status: "Agendado",
      reason: "Sessão de acompanhamento",
      conditionOrFollowUp: "Sessão de acompanhamento",
      outcome: "Acompanhamento mantido",
      careSummary: "",
      referral: "Encaminhamento interno fictício da equipe multiprofissional.",
      followUpDate: "",
      history: visitHistory(
        "2026-11-18T09:20:00",
        "Atendimento agendado",
        "Sessão reservada na UBS Municipal do Centro.",
      ),
    },
    {
      id: "SIM-ATD-005",
      personId: "SIM-PES-002",
      professionalId: "SIM-PRO-002",
      teamId: "SIM-EQ-001",
      unitId: "SIM-UBS-001",
      date: "2026-11-20",
      competence: "2026-11",
      modality: "Consulta programada",
      time: "11:00",
      serviceType: "Consulta de enfermagem",
      status: "Agendado",
      reason: "Acompanhamento de rotina",
      conditionOrFollowUp: "Cuidado programado",
      outcome: "Acompanhamento mantido",
      careSummary: "",
      referral: "",
      followUpDate: "",
      history: visitHistory(
        "2026-11-19T15:45:00",
        "Atendimento agendado",
        "Horário reservado com a equipe de enfermagem.",
      ),
    },
  ],
  collectiveActivities: [
    {
      id: "SIM-APS-COL-001",
      unitId: "SIM-UBS-001",
      teamId: "SIM-EQ-004",
      professionalId: "SIM-PRO-008",
      date: "2026-11-21",
      time: "14:00",
      competence: "2026-11",
      activityType: "Educação em saúde",
      theme: "Alimentação adequada e autocuidado",
      targetAudience: "Pessoas adultas acompanhadas pela unidade",
      participantCount: 12,
      outcome: "Atividade realizada; próximos encontros em organização.",
      status: "Realizada",
      history: visitHistory(
        "2026-11-21T15:00:00",
        "Atividade coletiva registrada",
        "Registro demonstrativo vinculado à equipe multiprofissional.",
      ),
    },
  ],
  foodMarkers: [
    {
      id: "SIM-APS-ALI-001",
      personId: "SIM-PES-001",
      attendanceId: "SIM-ATD-001",
      unitId: "SIM-UBS-001",
      teamId: "SIM-EQ-001",
      professionalId: "SIM-PRO-002",
      measuredAt: "2026-11-20",
      competence: "2026-11",
      weightKg: 72,
      heightCm: 168,
      markerSummary: "Marcadores de consumo alimentar preenchidos na rotina demonstrativa.",
      nutritionalAssessment: "Acompanhamento nutricional a revisar pela equipe.",
      history: visitHistory(
        "2026-11-20T11:30:00",
        "Marcadores alimentares registrados",
        "Registro demonstrativo vinculado ao atendimento SIM-ATD-001.",
      ),
    },
  ],
};
