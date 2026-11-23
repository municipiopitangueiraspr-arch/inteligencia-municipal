import { useMemo, useState, type FormEvent } from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardList,
  Clock3,
  Home,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Stethoscope,
  UserRound,
  UsersRound,
} from "lucide-react";
import type {
  HealthActivitiesDataset,
  HealthAttendanceModality,
  HealthAttendanceOutcome,
  HealthAttendanceCharacter,
  HealthCompetenceStatus,
  HealthProcedure,
  HealthVitalSigns,
  HealthDentalDetails,
  HealthServiceRecord,
  HealthServiceStatus,
  HomeVisitKind,
  HomeVisitRecord,
  HomeVisitStatus,
} from "../data/healthActivities";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import type { PeopleRegistryDataset, RegistryHousehold } from "../data/peopleRegistry";
import "./HealthVisitsAttendanceModule.css";

export type HealthOperatorPersona = "acs" | "ace" | "ubs";
export type HealthActivityFocus = "all" | "visits" | "attendance";
type ModuleMode = "secretary" | "operator";
type ModuleView =
  | "overview"
  | "visits"
  | "attendance"
  | "competence"
  | "collective"
  | "food-markers"
  | "new-visit"
  | "new-attendance"
  | "new-collective"
  | "new-food-marker"
  | "detail";
type SelectedRecord =
  | { kind: "visit"; id: string }
  | { kind: "attendance"; id: string };
type ActivityStatus = HomeVisitStatus | HealthServiceStatus;

export type HealthVisitsAttendanceModuleProps = {
  mode: ModuleMode;
  focus?: HealthActivityFocus;
  personaId?: HealthOperatorPersona;
  dataset: HealthActivitiesDataset;
  peopleRegistry: PeopleRegistryDataset;
  healthTerritory: HealthTerritoryDataset;
  onChange: (
    update: (current: HealthActivitiesDataset) => HealthActivitiesDataset,
  ) => void;
  onOpenRegulation?: (serviceRecordId: string) => void;
  onOpenDiagnostics?: (serviceRecordId: string) => void;
  onBack?: () => void;
};

const homeVisitKinds: HomeVisitKind[] = ["ACS", "ACE"];
const visitStatuses: HomeVisitStatus[] = [
  "Programada",
  "Realizada",
  "Sem contato",
  "Recusa",
  "Retorno necessário",
];
const serviceStatuses: HealthServiceStatus[] = [
  "Agendado",
  "Realizado",
  "Não compareceu",
  "Cancelado",
];
const visitActivities: Record<HomeVisitKind, string[]> = {
  ACS: [
    "Acompanhamento de rotina",
    "Busca ativa",
    "Acompanhamento e orientação",
    "Atualização de informações domiciliares",
    "Retorno de acompanhamento",
  ],
  ACE: [
    "Inspeção de imóvel",
    "Orientação preventiva",
    "Eliminação ou tratamento de foco",
    "Retorno para verificação",
    "Ação de vigilância no território",
  ],
};
const serviceTypes = [
  "Consulta médica",
  "Consulta de enfermagem",
  "Atendimento odontológico",
  "Fisioterapia",
  "Procedimento",
  "Vacinação",
  "Outro atendimento na unidade",
];
const attendanceModalities: HealthAttendanceModality[] = [
  "Consulta programada",
  "Demanda espontânea",
  "Atendimento domiciliar",
  "Teleatendimento",
];
const attendanceOutcomes: HealthAttendanceOutcome[] = [
  "Acompanhamento mantido",
  "Retorno programado",
  "Encaminhamento realizado",
  "Procedimento realizado",
  "Alta do acompanhamento",
  "Não concluído",
];
const attendanceCharacters: HealthAttendanceCharacter[] = ["Programado", "Demanda espontânea", "Urgência"];
const competenceStatuses: HealthCompetenceStatus[] = ["Rascunho", "Aguardando revisão", "Validado", "Fechado", "Reaberto"];
const procedureCatalog = ["Aferição de pressão arterial", "Aferição de glicemia capilar", "Curativo", "Administração de medicamento", "Coleta de material", "Avaliação antropométrica"];

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const todayMonth = () => localDate().slice(0, 7);

const formatDate = (value?: string) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
};

const formatHistoryDate = (value: string) => {
  const [date, time] = value.split("T");
  return `${formatDate(date)}${time ? ` · ${time.slice(0, 5)}` : ""}`;
};

const statusTone = (status: string) => {
  if (status === "Realizada" || status === "Realizado") return "positive";
  if (status === "Programada" || status === "Agendado") return "info";
  if (status === "Retorno necessário") return "warning";
  if (
    status === "Sem contato" ||
    status === "Recusa" ||
    status === "Não compareceu" ||
    status === "Cancelado"
  )
    return "negative";
  return "neutral";
};

const getPersonName = (registry: PeopleRegistryDataset, personId?: string) =>
  registry.people.find((person) => person.id === personId)?.fullName ??
  "Atividade domiciliar sem pessoa específica";

const getFamilyName = (registry: PeopleRegistryDataset, familyId?: string) =>
  registry.families.find((family) => family.id === familyId)?.name ??
  "Sem vínculo familiar específico";

const getHouseholdLabel = (
  registry: PeopleRegistryDataset,
  household: RegistryHousehold,
) => {
  const address = registry.addresses.find(
    (candidate) => candidate.id === household.addressId,
  );
  if (!address) return household.id;
  return `${address.street}, ${address.number}${household.complement ? ` · ${household.complement}` : ""} · ${address.neighborhood}`;
};

const professionalName = (territory: HealthTerritoryDataset, id: string) =>
  territory.professionals.find((professional) => professional.id === id)?.name ??
  "Profissional não localizado";

const unitName = (territory: HealthTerritoryDataset, id: string) =>
  territory.units.find((unit) => unit.id === id)?.name ?? "Unidade não localizada";

const teamName = (territory: HealthTerritoryDataset, id: string) =>
  territory.teams.find((team) => team.id === id)?.name ?? "Equipe não localizada";

const areaName = (territory: HealthTerritoryDataset, id: string) =>
  territory.areas.find((area) => area.id === id)?.name ?? "Área não localizada";

const activeResidents = (
  registry: PeopleRegistryDataset,
  householdId: string,
) => {
  const residentIds = new Set(
    registry.residenceLinks
      .filter((link) => link.householdId === householdId && !link.endDate)
      .map((link) => link.personId),
  );
  return registry.people.filter(
    (person) => residentIds.has(person.id) && person.status === "Ativa",
  );
};

const eventDateTime = (date: string, time: string) => `${date}T${time}:00`;

export default function HealthVisitsAttendanceModule({
  mode,
  focus = "all",
  personaId,
  dataset,
  peopleRegistry,
  healthTerritory,
  onChange,
  onOpenRegulation,
  onOpenDiagnostics,
  onBack,
}: HealthVisitsAttendanceModuleProps) {
  const initialView: ModuleView =
    focus === "visits"
      ? "visits"
      : focus === "attendance"
        ? "attendance"
        : mode === "secretary"
          ? "overview"
          : personaId === "ubs"
            ? "attendance"
            : "visits";
  const [view, setView] = useState<ModuleView>(initialView);
  const [selectedRecord, setSelectedRecord] = useState<SelectedRecord | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [visitStatusFilter, setVisitStatusFilter] = useState("Todas as situações");
  const [careStatusFilter, setCareStatusFilter] = useState("Todas as situações");
  const [competenceFilter, setCompetenceFilter] = useState(() => todayMonth());
  const [formError, setFormError] = useState("");
  const [statusDraft, setStatusDraft] = useState<ActivityStatus>("Programada");
  const [statusFollowUpDate, setStatusFollowUpDate] = useState("");
  const [statusOutcomeDraft, setStatusOutcomeDraft] = useState("");
  const [statusCarePlanDraft, setStatusCarePlanDraft] = useState("");
  const [statusReasonDraft, setStatusReasonDraft] = useState("");

  const [visitKind, setVisitKind] = useState<HomeVisitKind>(
    personaId === "ace" ? "ACE" : "ACS",
  );
  const [visitHouseholdId, setVisitHouseholdId] = useState(
    personaId === "ace" ? "SIM-DOM-003" : "SIM-DOM-001",
  );
  const [visitActivityType, setVisitActivityType] = useState("");
  const [visitPersonId, setVisitPersonId] = useState("");
  const [visitProfessionalId, setVisitProfessionalId] = useState("");
  const [careProfessionalId, setCareProfessionalId] = useState("");
  const [attendanceServiceType, setAttendanceServiceType] = useState("");

  const today = localDate();
  const isSecretary = mode === "secretary";
  const canCreateVisits =
    focus !== "attendance" &&
    (isSecretary || personaId === "acs" || personaId === "ace");
  const canCreateAttendance =
    focus !== "visits" && (isSecretary || personaId === "ubs");
  const kindForPersona: HomeVisitKind | undefined =
    personaId === "acs" ? "ACS" : personaId === "ace" ? "ACE" : undefined;

  const eligibleHouseholds = useMemo(() => {
    const expectedCategory =
      visitKind === "ACS"
        ? "Agente Comunitário de Saúde"
        : "Agente de Combate às Endemias";
    return peopleRegistry.households.filter((household) => {
      if (household.status !== "Ativo") return false;
      const address = peopleRegistry.addresses.find(
        (candidate) => candidate.id === household.addressId,
      );
      const area = healthTerritory.areas.find(
        (candidate) => candidate.id === address?.areaId,
      );
      if (!area) return false;
      const team = healthTerritory.teams.find(
        (candidate) => candidate.id === area.teamId && candidate.active,
      );
      return Boolean(
        team &&
          healthTerritory.professionals.some(
            (professional) =>
              professional.active &&
              professional.teamId === team.id &&
              professional.category === expectedCategory,
          ),
      );
    });
  }, [healthTerritory, peopleRegistry, visitKind]);

  const selectedHousehold =
    eligibleHouseholds.find((household) => household.id === visitHouseholdId) ??
    eligibleHouseholds[0];
  const selectedAddress = peopleRegistry.addresses.find(
    (address) => address.id === selectedHousehold?.addressId,
  );
  const selectedArea = healthTerritory.areas.find(
    (area) => area.id === selectedAddress?.areaId,
  );
  const selectedTeam = healthTerritory.teams.find(
    (team) => team.id === selectedArea?.teamId,
  );
  const selectedUnit = healthTerritory.units.find(
    (unit) => unit.id === selectedTeam?.unitId,
  );
  const visitProfessionals = healthTerritory.professionals.filter(
    (professional) =>
      professional.active &&
      professional.teamId === selectedTeam?.id &&
      professional.category ===
        (visitKind === "ACS"
          ? "Agente Comunitário de Saúde"
          : "Agente de Combate às Endemias"),
  );
  const selectedVisitProfessional =
    visitProfessionals.find(
      (professional) => professional.id === visitProfessionalId,
    ) ?? visitProfessionals[0];
  const peopleInSelectedHousehold = selectedHousehold
    ? activeResidents(peopleRegistry, selectedHousehold.id)
    : [];

  const availableCareProfessionals = healthTerritory.professionals.filter(
    (professional) => professional.active,
  );
  const selectedCareProfessional =
    availableCareProfessionals.find(
      (professional) => professional.id === careProfessionalId,
    ) ?? availableCareProfessionals[0];
  const selectedCareTeam = healthTerritory.teams.find(
    (team) => team.id === selectedCareProfessional?.teamId,
  );
  const selectedCareUnit = healthTerritory.units.find(
    (unit) => unit.id === selectedCareProfessional?.unitId,
  );

  const visibleVisits = dataset.homeVisits.filter((visit) => {
    if (kindForPersona && visit.kind !== kindForPersona) return false;
    const household = peopleRegistry.households.find(
      (candidate) => candidate.id === visit.householdId,
    );
    const text = [
      visit.id,
      visit.activityType,
      visit.status,
      getPersonName(peopleRegistry, visit.personId),
      household ? getHouseholdLabel(peopleRegistry, household) : visit.householdId,
      professionalName(healthTerritory, visit.professionalId),
      areaName(healthTerritory, visit.areaId),
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return (
      (visitStatusFilter === "Todas as situações" ||
        visit.status === visitStatusFilter) &&
      text.includes(search.trim().toLocaleLowerCase("pt-BR"))
    );
  });

  const visibleCareRecords = dataset.serviceRecords.filter((record) => {
    const text = [
      record.id,
      record.serviceType,
      record.status,
      record.reason,
      getPersonName(peopleRegistry, record.personId),
      professionalName(healthTerritory, record.professionalId),
      unitName(healthTerritory, record.unitId),
    ]
      .join(" ")
      .toLocaleLowerCase("pt-BR");
    return (
      (careStatusFilter === "Todas as situações" ||
        record.status === careStatusFilter) &&
      text.includes(search.trim().toLocaleLowerCase("pt-BR"))
    );
  });

  const todaysVisits = visibleVisits.filter((visit) => visit.date === today);
  const pendingReturns = visibleVisits.filter(
    (visit) => visit.status === "Retorno necessário",
  );
  const todaysCare = visibleCareRecords.filter(
    (record) => record.date === today,
  );
  const unresolvedCare = visibleCareRecords.filter(
    (record) =>
      record.status === "Não compareceu" || record.status === "Cancelado",
  );
  const canCreateApsRecords = isSecretary || personaId === "ubs";
  const canShowCollective = focus !== "visits" && canCreateApsRecords;
  const completedProduction = visibleCareRecords.filter(
    (record) => record.status === "Realizado",
  ).length;
  const collectiveActivities = dataset.collectiveActivities ?? [];
  const foodMarkers = dataset.foodMarkers ?? [];
  const nextActivities = [
    ...visibleVisits
      .filter(
        (visit) =>
          visit.status === "Programada" ||
          visit.status === "Retorno necessário",
      )
      .map((record) => ({ kind: "visit" as const, record })),
    ...visibleCareRecords
      .filter((record) => record.status === "Agendado")
      .map((record) => ({ kind: "attendance" as const, record })),
  ]
    .sort((a, b) =>
      `${a.record.date}T${a.record.time}`.localeCompare(
        `${b.record.date}T${b.record.time}`,
      ),
    )
    .slice(0, 5);
  const competenceRecords = dataset.serviceRecords.filter((record) => record.competence === competenceFilter);
  const competenceIssues = (record: HealthServiceRecord) => [
    !record.personId && "pessoa",
    !record.unitId && "unidade",
    !record.teamId && "equipe",
    !record.professionalId && "profissional",
    !record.date && "data",
    !record.serviceType && "tipo",
    !record.reason && "motivo",
    !record.conditionOrFollowUp && "acompanhamento",
    record.status === "Realizado" && !record.careSummary && "resumo",
    record.status === "Realizado" && !record.carePlan && "plano de continuidade",
    record.outcome === "Retorno programado" && !record.followUpDate && "data de retorno",
    record.outcome === "Encaminhamento realizado" && !record.referral && "encaminhamento",
    record.outcome === "Procedimento realizado" && !(record.procedures?.length) && "procedimento",
    (record.status === "Não compareceu" || record.status === "Cancelado") && !record.statusReason && "motivo da situação",
  ].filter(Boolean) as string[];
  const competencePending = competenceRecords.filter((record) => {
    const recordStatus = record.competenceStatus ?? (record.status === "Realizado" ? "Aguardando revisão" : "Rascunho");
    return competenceIssues(record).length > 0 || recordStatus === "Rascunho" || recordStatus === "Reaberto" || recordStatus === "Aguardando revisão";
  });
  const competenceCanValidate = competenceRecords.length > 0 && competenceRecords.every((record) => competenceIssues(record).length === 0);
  const competenceCanClose = competenceCanValidate && competenceRecords.every((record) => {
    const recordStatus = record.competenceStatus ?? (record.status === "Realizado" ? "Aguardando revisão" : "Rascunho");
    return recordStatus === "Validado" || recordStatus === "Fechado";
  });

  const selectedVisit =
    selectedRecord?.kind === "visit"
      ? dataset.homeVisits.find((visit) => visit.id === selectedRecord.id)
      : undefined;
  const selectedAttendance =
    selectedRecord?.kind === "attendance"
      ? dataset.serviceRecords.find(
          (record) => record.id === selectedRecord.id,
        )
      : undefined;

  const startNewVisit = () => {
    setFormError("");
    setVisitActivityType("");
    setVisitPersonId("");
    setView("new-visit");
  };

  const startNewAttendance = () => {
    setFormError("");
    setAttendanceServiceType("");
    setView("new-attendance");
  };

  const openVisit = (visit: HomeVisitRecord) => {
    setSelectedRecord({ kind: "visit", id: visit.id });
    setStatusDraft(visit.status);
    setStatusFollowUpDate(visit.followUpDate ?? "");
    setStatusOutcomeDraft(visit.outcomeSummary);
    setStatusCarePlanDraft("");
    setStatusReasonDraft("");
    setFormError("");
    setView("detail");
  };

  const openAttendance = (record: HealthServiceRecord) => {
    setSelectedRecord({ kind: "attendance", id: record.id });
    setStatusDraft(record.status);
    setStatusFollowUpDate(record.followUpDate ?? "");
    setStatusOutcomeDraft(record.careSummary);
    setStatusCarePlanDraft(record.carePlan ?? "");
    setStatusReasonDraft(record.statusReason ?? "");
    setFormError("");
    setView("detail");
  };

  const saveHomeVisit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const householdId = String(values.get("householdId") ?? "").trim();
    const household = peopleRegistry.households.find(
      (candidate) => candidate.id === householdId,
    );
    const address = peopleRegistry.addresses.find(
      (candidate) => candidate.id === household?.addressId,
    );
    const area = healthTerritory.areas.find(
      (candidate) => candidate.id === address?.areaId,
    );
    const team = healthTerritory.teams.find(
      (candidate) => candidate.id === area?.teamId,
    );
    const unit = healthTerritory.units.find(
      (candidate) => candidate.id === team?.unitId,
    );
    const kind = String(values.get("kind") ?? visitKind) as HomeVisitKind;
    const professionalId = String(
      values.get("professionalId") ?? selectedVisitProfessional?.id ?? "",
    );
    const professional = healthTerritory.professionals.find(
      (candidate) =>
        candidate.id === professionalId &&
        candidate.active &&
        candidate.teamId === team?.id,
    );
    const date = String(values.get("date") ?? "");
    const time = String(values.get("time") ?? "");
    const activityType = String(values.get("activityType") ?? "").trim();
    const status = String(values.get("status") ?? "Programada") as HomeVisitStatus;
    const outcomeSummary = String(
      values.get("outcomeSummary") ?? "",
    ).trim();
    const followUpDate = String(values.get("followUpDate") ?? "");
    const environmentalFinding = String(
      values.get("environmentalFinding") ?? "",
    ).trim();
    const notes = String(values.get("notes") ?? "").trim();

    if (!household || !address || !area || !team || !unit || !professional) {
      setFormError(
        "O domicílio e o profissional precisam pertencer a uma área e equipe ativas.",
      );
      return;
    }
    if (!activityType || !date || !time) {
      setFormError("Preencha a atividade, a data e o horário da visita.");
      return;
    }
    if (status !== "Programada" && !outcomeSummary) {
      setFormError(
        "Descreva brevemente o resultado para registrar uma visita já tentada ou concluída.",
      );
      return;
    }
    if (status === "Retorno necessário" && !followUpDate) {
      setFormError("Informe a data prevista para o retorno.");
      return;
    }

    const nextNumber = dataset.homeVisits.length + 1;
    const id = `SIM-VIS-${String(nextNumber).padStart(3, "0")}`;
    const personId = String(values.get("personId") ?? "").trim() || undefined;
    const familyId = personId
      ? peopleRegistry.familyMemberships.find(
          (membership) => membership.personId === personId && !membership.endDate,
        )?.familyId
      : undefined;
    const newVisit: HomeVisitRecord = {
      id,
      kind,
      householdId: household.id,
      personId,
      familyId,
      professionalId: professional.id,
      teamId: team.id,
      unitId: unit.id,
      areaId: area.id,
      date,
      time,
      activityType,
      status,
      outcomeSummary,
      environmentalFinding: kind === "ACE" ? environmentalFinding : undefined,
      followUpDate,
      notes,
      history: [
        {
          date: eventDateTime(date, time),
          action: status === "Programada" ? "Visita programada" : "Visita registrada",
          detail: `${kind} · ${activityType} · situação inicial: ${status}.`,
        },
      ],
    };
    onChange((current) => ({
      ...current,
      homeVisits: [newVisit, ...current.homeVisits],
    }));
    setSelectedRecord({ kind: "visit", id });
    setStatusDraft(newVisit.status);
    setStatusFollowUpDate(newVisit.followUpDate ?? "");
    setStatusOutcomeDraft(newVisit.outcomeSummary);
    setView("detail");
    setFormError("");
  };

  const saveCareRecord = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const personId = String(values.get("personId") ?? "").trim();
    const professionalId = String(values.get("professionalId") ?? "").trim();
    const professional = healthTerritory.professionals.find(
      (candidate) => candidate.id === professionalId && candidate.active,
    );
    const team = healthTerritory.teams.find(
      (candidate) => candidate.id === professional?.teamId,
    );
    const unit = healthTerritory.units.find(
      (candidate) => candidate.id === professional?.unitId,
    );
    const serviceType = String(values.get("serviceType") ?? "").trim();
    const competence = String(values.get("competence") ?? "").trim();
    const character = String(values.get("character") ?? "Programado") as HealthAttendanceCharacter;
    const modality = String(values.get("modality") ?? "Consulta programada") as HealthAttendanceModality;
    const date = String(values.get("date") ?? "");
    const time = String(values.get("time") ?? "");
    const status = String(values.get("status") ?? "Agendado") as HealthServiceStatus;
    const reason = String(values.get("reason") ?? "").trim();
    const conditionOrFollowUp = String(values.get("conditionOrFollowUp") ?? "").trim();
    const outcome = String(values.get("outcome") ?? "Acompanhamento mantido") as HealthAttendanceOutcome;
    const careSummary = String(values.get("careSummary") ?? "").trim();
    const carePlan = String(values.get("carePlan") ?? "").trim();
    const referral = String(values.get("referral") ?? "").trim();
    const followUpDate = String(values.get("followUpDate") ?? "");
    const statusReason = String(values.get("statusReason") ?? "").trim();
    const numberField = (name: string) => {
      const raw = String(values.get(name) ?? "").trim();
      return raw ? Number(raw) : undefined;
    };
    const vitalSigns: HealthVitalSigns = {
      bloodPressure: String(values.get("bloodPressure") ?? "").trim() || undefined,
      heartRateBpm: numberField("heartRateBpm"),
      respiratoryRate: numberField("respiratoryRate"),
      temperatureC: numberField("temperatureC"),
      oxygenSaturation: numberField("oxygenSaturation"),
      glucoseMgDl: numberField("glucoseMgDl"),
      weightKg: numberField("weightKg"),
      heightCm: numberField("heightCm"),
      painScale: numberField("painScale"),
    };
    const conditions = String(values.get("conditions") ?? "").split(",").map((item) => item.trim()).filter(Boolean);
    const procedures: HealthProcedure[] = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="procedure"]:checked')).map((input, index) => {
      const container = input.closest(".health-checkbox");
      const quantity = Number(container?.querySelector<HTMLInputElement>('input[name="procedureQuantity"]')?.value ?? 1);
      const result = container?.querySelector<HTMLInputElement>('input[name="procedureResult"]')?.value.trim();
      return { id: `SIM-PROC-${Date.now()}-${index}`, name: input.value, quantity: quantity > 0 ? quantity : 1, result: result || undefined };
    });
    const dentalDetails: HealthDentalDetails | undefined = serviceType === "Atendimento odontológico"
      ? { reason: String(values.get("dentalReason") ?? "").trim(), procedure: String(values.get("dentalProcedure") ?? "").trim(), toothOrRegion: String(values.get("toothOrRegion") ?? "").trim(), urgency: String(values.get("dentalUrgency") ?? "Não") as "Não" | "Sim", guidance: String(values.get("dentalGuidance") ?? "").trim() }
      : undefined;
    const competenceStatus: HealthCompetenceStatus = status === "Realizado" ? "Aguardando revisão" : "Rascunho";

    if (
      !peopleRegistry.people.some(
        (person) => person.id === personId && person.status === "Ativa",
      ) ||
      !professional ||
      !team ||
      !unit
    ) {
      setFormError(
        "Selecione uma pessoa ativa e um profissional vinculado a uma equipe e unidade.",
      );
      return;
    }
    if (!serviceType || !date || !time || !reason || !competence || !conditionOrFollowUp) {
      setFormError(
        "Preencha tipo, competência, data, horário, motivo e acompanhamento.",
      );
      return;
    }
    if (competence !== date.slice(0, 7)) {
      setFormError("A competência deve corresponder ao mês da data do atendimento.");
      return;
    }
    if (status === "Realizado" && !careSummary) {
      setFormError("Informe um resumo da atividade para marcar como realizado.");
      return;
    }
    if (status === "Realizado" && !carePlan) {
      setFormError("Informe o plano de continuidade ou próximo passo para concluir o atendimento.");
      return;
    }
    if ((status === "Não compareceu" || status === "Cancelado") && !statusReason) {
      setFormError("Informe o motivo da falta ou do cancelamento.");
      return;
    }
    if (serviceType === "Atendimento odontológico" && (!dentalDetails?.reason || !dentalDetails.procedure)) {
      setFormError("Para atendimento odontológico, informe o motivo e o procedimento odontológico.");
      return;
    }
    if (outcome === "Retorno programado" && !followUpDate) {
      setFormError("Informe a data do retorno quando o desfecho for 'Retorno programado'.");
      return;
    }
    if (outcome === "Encaminhamento realizado" && !referral) {
      setFormError("Descreva o encaminhamento ou próximo passo realizado.");
      return;
    }
    if (outcome === "Procedimento realizado" && !procedures.length) {
      setFormError("Selecione pelo menos um procedimento quando o desfecho for 'Procedimento realizado'.");
      return;
    }

    const nextNumber = dataset.serviceRecords.length + 1;
    const id = `SIM-ATD-${String(nextNumber).padStart(3, "0")}`;
    const newRecord: HealthServiceRecord = {
      id,
      personId,
      professionalId: professional.id,
      teamId: team.id,
      unitId: unit.id,
      date,
      time,
      competence,
      competenceStatus,
      modality,
      character,
      serviceType,
      status,
      reason,
      conditionOrFollowUp,
      conditions,
      procedures,
      dentalDetails,
      outcome,
      careSummary,
      carePlan,
      referral,
      followUpDate,
      statusReason,
      vitalSigns: Object.values(vitalSigns).some((value) => value !== undefined) ? vitalSigns : undefined,
      history: [
        {
          date: eventDateTime(date, time),
          action: status === "Agendado" ? "Atendimento agendado" : "Atendimento registrado",
          detail: `${serviceType} · situação inicial: ${status}.`,
        },
      ],
    };
    onChange((current) => ({
      ...current,
      serviceRecords: [newRecord, ...current.serviceRecords],
    }));
    setSelectedRecord({ kind: "attendance", id });
    setStatusDraft(newRecord.status);
    setStatusFollowUpDate(newRecord.followUpDate ?? "");
    setStatusOutcomeDraft(newRecord.careSummary);
    setStatusCarePlanDraft(newRecord.carePlan ?? "");
    setStatusReasonDraft(newRecord.statusReason ?? "");
    setView("detail");
    setFormError("");
  };

  const saveCollectiveActivity = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const date = String(values.get("date") ?? "");
    const time = String(values.get("time") ?? "");
    const activityType = String(values.get("activityType") ?? "").trim();
    const theme = String(values.get("theme") ?? "").trim();
    const targetAudience = String(values.get("targetAudience") ?? "").trim();
    const participantCount = Number(values.get("participantCount") ?? 0);
    const professional = healthTerritory.professionals.find(
      (item) => item.id === String(values.get("professionalId") ?? "") && item.active,
    );
    if (!date || !time || !activityType || !theme || !targetAudience || !professional || participantCount < 0) {
      setFormError("Preencha atividade, tema, público, data, horário e responsável.");
      return;
    }
    const id = `SIM-APS-COL-${String(collectiveActivities.length + 1).padStart(3, "0")}`;
    onChange((current) => ({
      ...current,
      collectiveActivities: [
        {
          id,
          unitId: professional.unitId,
          teamId: professional.teamId,
          professionalId: professional.id,
          date,
          time,
          competence: date.slice(0, 7),
          activityType,
          theme,
          targetAudience,
          participantCount,
          outcome: "Atividade registrada para acompanhamento da equipe.",
          status: "Realizada",
          history: [{ date: eventDateTime(date, time), action: "Atividade coletiva registrada", detail: "Registro assistencial demonstrativo." }],
        },
        ...current.collectiveActivities,
      ],
    }));
    setFormError("");
    setView("collective");
    event.currentTarget.reset();
  };

  const saveFoodMarker = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const personId = String(values.get("personId") ?? "");
    const measuredAt = String(values.get("measuredAt") ?? "");
    const markerSummary = String(values.get("markerSummary") ?? "").trim();
    const professional = healthTerritory.professionals.find(
      (item) => item.id === String(values.get("professionalId") ?? "") && item.active,
    );
    if (!personId || !professional || !measuredAt || !markerSummary) {
      setFormError("Selecione pessoa, responsável, data e registre os marcadores alimentares.");
      return;
    }
    const id = `SIM-APS-ALI-${String(foodMarkers.length + 1).padStart(3, "0")}`;
    onChange((current) => ({
      ...current,
      foodMarkers: [
        {
          id,
          personId,
          unitId: professional.unitId,
          teamId: professional.teamId,
          professionalId: professional.id,
          measuredAt,
          competence: measuredAt.slice(0, 7),
          weightKg: Number(values.get("weightKg") || 0) || undefined,
          heightCm: Number(values.get("heightCm") || 0) || undefined,
          markerSummary,
          nutritionalAssessment: String(values.get("nutritionalAssessment") ?? "").trim(),
          history: [{ date: `${measuredAt}T09:00:00`, action: "Marcadores alimentares registrados", detail: "Registro assistencial demonstrativo." }],
        },
        ...current.foodMarkers,
      ],
    }));
    setFormError("");
    setView("food-markers");
    event.currentTarget.reset();
  };

  const updateSelectedStatus = () => {
    if (!selectedRecord) return;
    if (selectedRecord.kind === "attendance" && selectedAttendance?.competenceStatus === "Fechado") {
      setFormError("Este atendimento pertence a uma competência fechada. Reabra a competência antes de alterar o registro.");
      return;
    }
    if (
      selectedRecord.kind === "visit" &&
      statusDraft !== "Programada" &&
      !statusOutcomeDraft.trim()
    ) {
      setFormError("Descreva o resultado antes de concluir ou registrar a tentativa da visita.");
      return;
    }
    if (
      selectedRecord.kind === "visit" &&
      statusDraft === "Retorno necessário" &&
      !statusFollowUpDate
    ) {
      setFormError("Informe a data prevista para o retorno.");
      return;
    }
    if (
      selectedRecord.kind === "attendance" &&
      statusDraft === "Realizado" &&
      (!statusOutcomeDraft.trim() || !statusCarePlanDraft.trim())
    ) {
      setFormError("Informe o resumo e o plano de continuidade antes de marcar o atendimento como realizado.");
      return;
    }
    if (selectedRecord.kind === "attendance" && (statusDraft === "Não compareceu" || statusDraft === "Cancelado") && !statusReasonDraft.trim()) {
      setFormError("Informe o motivo da falta ou do cancelamento.");
      return;
    }
    const now = new Date();
    const timestamp = `${localDate()}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    onChange((current) => {
      if (selectedRecord.kind === "visit") {
        return {
          ...current,
          homeVisits: current.homeVisits.map((record) =>
            record.id === selectedRecord.id
              ? {
                  ...record,
                  status: statusDraft as HomeVisitStatus,
                  outcomeSummary: statusOutcomeDraft.trim() || record.outcomeSummary,
                  followUpDate:
                    statusDraft === "Retorno necessário"
                      ? statusFollowUpDate
                      : record.followUpDate,
                  history: [
                    ...record.history,
                    {
                      date: timestamp,
                      action: "Situação atualizada",
                      detail: `Situação alterada para ${statusDraft}${statusDraft === "Retorno necessário" ? ` · retorno previsto para ${formatDate(statusFollowUpDate)}` : ""}${statusOutcomeDraft.trim() ? " · resultado atualizado." : "."}`,
                    },
                  ],
                }
              : record,
          ),
        };
      }
      return {
        ...current,
        serviceRecords: current.serviceRecords.map((record) =>
          record.id === selectedRecord.id
            ? {
                ...record,
                status: statusDraft as HealthServiceStatus,
                competenceStatus: statusDraft === "Realizado" && record.competenceStatus !== "Fechado" ? "Aguardando revisão" : record.competenceStatus,
                careSummary: statusOutcomeDraft.trim() || record.careSummary,
                carePlan: statusCarePlanDraft.trim() || record.carePlan,
                statusReason: statusReasonDraft.trim() || record.statusReason,
                followUpDate: statusFollowUpDate || record.followUpDate,
                history: [
                  ...record.history,
                  {
                    date: timestamp,
                    action: "Situação atualizada",
                    detail: `Atendimento atualizado para ${statusDraft}${statusOutcomeDraft.trim() ? " · resumo atualizado." : "."}`,
                  },
                ],
              }
            : record,
        ),
      };
    });
    setFormError("");
  };

  const updateCompetenceBatch = (nextStatus: HealthCompetenceStatus) => {
    if (!competenceRecords.length) return;
    if (nextStatus === "Validado" && !competenceCanValidate) {
      setFormError("Corrija todas as pendências antes de validar a competência.");
      return;
    }
    if (nextStatus === "Fechado" && !competenceCanClose) {
      setFormError("Valide todos os atendimentos sem pendências antes de fechar a competência.");
      return;
    }
    const timestamp = new Date().toISOString();
    onChange((current) => ({
      ...current,
      serviceRecords: current.serviceRecords.map((record) => {
        if (record.competence !== competenceFilter) return record;
        const currentStatus = record.competenceStatus ?? (record.status === "Realizado" ? "Aguardando revisão" : "Rascunho");
        if (nextStatus === "Validado" && competenceIssues(record).length > 0) return record;
        if (nextStatus === "Fechado" && currentStatus !== "Validado" && currentStatus !== "Fechado") return record;
        return {
          ...record,
          competenceStatus: nextStatus,
          history: [...record.history, { date: timestamp, action: `Competência ${nextStatus.toLocaleLowerCase("pt-BR")}`, detail: `Estado alterado em lote para ${nextStatus}.` }],
        };
      }),
    }));
    setFormError("");
  };

  const reopenCompetenceRecord = (recordId: string) => {
    onChange((current) => ({
      ...current,
      serviceRecords: current.serviceRecords.map((record) => record.id === recordId ? {
        ...record,
        competenceStatus: "Reaberto",
        history: [...record.history, { date: new Date().toISOString(), action: "Competência reaberta", detail: "Registro reaberto para retificação demonstrativa." }],
      } : record),
    }));
    setFormError("");
  };

  const selectVisitKind = (kind: HomeVisitKind) => {
    setVisitKind(kind);
    setVisitActivityType("");
    setVisitHouseholdId("");
    setVisitPersonId("");
    setVisitProfessionalId("");
  };

  const showHomeVisits = () => {
    setSearch("");
    setView("visits");
  };

  const showAttendance = () => {
    setSearch("");
    setView("attendance");
  };

  const openNextActivity = (activity: (typeof nextActivities)[number]) => {
    if (activity.kind === "visit") openVisit(activity.record as HomeVisitRecord);
    else openAttendance(activity.record as HealthServiceRecord);
  };

  return (
    <section className="health-activities-module">
      <header className="health-activities-header">
        <div>
          <span className="health-activities-eyebrow">
            SAÚDE · ROTINA OPERACIONAL
          </span>
          <h2>
            {focus === "visits"
              ? "Visitas e ações no território"
              : focus === "attendance"
                ? "Atendimentos e produção assistencial"
                : "Visitas e atendimentos"}
          </h2>
          <p>
            {focus === "visits"
              ? "Rotinas de ACS e ACE relacionadas a pessoas, domicílios, famílias e microáreas."
              : focus === "attendance"
                ? "Atendimentos, procedimentos e acompanhamentos vinculados às equipes e unidades."
                : "Registros ligados às pessoas, domicílios, equipes e unidades já cadastrados no cenário fictício."}
          </p>
        </div>
        {mode === "operator" && onBack && (
          <button className="health-back-button" onClick={onBack}>
            <ArrowLeft size={15} /> Voltar à rotina
          </button>
        )}
      </header>

      <div className="health-demo-note" role="note">
        <AlertCircle size={17} />
        <p>
          <strong>Ambiente demonstrativo.</strong> Estes eventos são fictícios,
          permanecem somente nesta sessão e não são exportados para sistemas
          oficiais. O cadastro de referência continua separado do histórico de
          visitas e atendimentos.
        </p>
      </div>

      <nav className="health-activity-tabs" aria-label="Fluxos da Saúde">
        {isSecretary && focus === "all" && (
          <button
            className={view === "overview" ? "active" : ""}
            onClick={() => setView("overview")}
          >
            Visão geral
          </button>
        )}
        {canCreateVisits && (
          <button
            className={view === "visits" || view === "new-visit" ? "active" : ""}
            onClick={showHomeVisits}
          >
            <Home size={15} /> Visitas domiciliares
            <span>{visibleVisits.length}</span>
          </button>
        )}
        {canCreateAttendance && (
          <button
            className={
              view === "attendance" || view === "new-attendance" ? "active" : ""
            }
            onClick={showAttendance}
          >
            <Stethoscope size={15} /> Atendimentos
            <span>{visibleCareRecords.length}</span>
          </button>
        )}
        {isSecretary && focus !== "visits" && (
          <button className={view === "competence" ? "active" : ""} onClick={() => setView("competence")}>
            <ClipboardList size={15} /> Revisão e fechamento
            <span>{competencePending.length}</span>
          </button>
        )}
        {canShowCollective && (
          <button
            className={view === "collective" || view === "new-collective" ? "active" : ""}
            onClick={() => setView("collective")}
          >
            <UsersRound size={15} /> Atividades coletivas
            <span>{collectiveActivities.length}</span>
          </button>
        )}
        {canShowCollective && (
          <button
            className={view === "food-markers" || view === "new-food-marker" ? "active" : ""}
            onClick={() => setView("food-markers")}
          >
            <ClipboardList size={15} /> Marcadores alimentares
            <span>{foodMarkers.length}</span>
          </button>
        )}
        {view === "detail" && (
          <span className="health-detail-tab">Detalhe e histórico</span>
        )}
      </nav>

      {view === "overview" && (
        <div className="health-activity-view">
          <div className="health-activity-metric-grid">
            <article className="health-activity-metric metric-blue">
              <span>Visitas no roteiro de hoje</span>
              <strong>{todaysVisits.length}</strong>
              <small>ACS e ACE · data de visita</small>
            </article>
            <article className="health-activity-metric metric-amber">
              <span>Retornos a acompanhar</span>
              <strong>{pendingReturns.length}</strong>
              <small>situação “Retorno necessário”</small>
            </article>
            <article className="health-activity-metric metric-green">
              <span>Atendimentos hoje</span>
              <strong>{todaysCare.length}</strong>
              <small>agendados e realizados</small>
            </article>
            <article className="health-activity-metric metric-red">
              <span>Pendências de atendimento</span>
              <strong>{unresolvedCare.length}</strong>
              <small>faltas ou cancelamentos registrados</small>
            </article>
            <article className="health-activity-metric metric-blue">
              <span>Produção assistencial realizada</span>
              <strong>{completedProduction}</strong>
              <small>atendimentos concluídos no recorte</small>
            </article>
            <article className="health-activity-metric metric-green">
              <span>Participantes em atividades coletivas</span>
              <strong>{collectiveActivities.reduce((sum, item) => sum + item.participantCount, 0)}</strong>
              <small>registros da sessão</small>
            </article>
          </div>

          <div className="health-activity-action-row">
            {canCreateVisits && (
              <button className="health-action-primary" onClick={startNewVisit}>
                <Plus size={16} /> Registrar visita domiciliar
              </button>
            )}
            {canCreateAttendance && (
              <button className="health-action-secondary" onClick={startNewAttendance}>
                <Plus size={16} /> Registrar atendimento
              </button>
            )}
          </div>

          <div className="health-activity-section-heading">
            <div>
              <span>PRÓXIMOS ITENS</span>
              <h3>Roteiro, retornos e agenda</h3>
            </div>
            <span>{nextActivities.length} em acompanhamento</span>
          </div>
          {nextActivities.length === 0 ? (
            <div className="health-activity-empty">
              <CalendarClock size={20} />
              <strong>Nenhum item pendente no recorte</strong>
              <span>Crie uma visita ou atendimento para movimentar a rotina.</span>
            </div>
          ) : (
            <div className="health-next-activity-list">
              {nextActivities.map((activity) => (
                <button
                  className="health-next-activity"
                  key={`${activity.kind}-${activity.record.id}`}
                  onClick={() => openNextActivity(activity)}
                >
                  <span className="health-next-icon">
                    {activity.kind === "visit" ? <Home size={17} /> : <Stethoscope size={17} />}
                  </span>
                  <span className="health-next-copy">
                    <strong>
                      {activity.kind === "visit"
                        ? (activity.record as HomeVisitRecord).activityType
                        : (activity.record as HealthServiceRecord).serviceType}
                    </strong>
                    <small>
                      {formatDate(activity.record.date)} · {activity.record.time} ·{" "}
                      {activity.kind === "visit"
                        ? getPersonName(
                            peopleRegistry,
                            (activity.record as HomeVisitRecord).personId,
                          )
                        : getPersonName(
                            peopleRegistry,
                            (activity.record as HealthServiceRecord).personId,
                          )}
                    </small>
                  </span>
                  <span className={`health-status-chip tone-${statusTone(activity.record.status)}`}>
                    {activity.record.status}
                  </span>
                  <ArrowRight size={15} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {view === "competence" && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar">
            <div>
              <span className="health-activity-eyebrow">CONTROLE DA PRODUÇÃO</span>
              <h3>Revisão e fechamento da competência</h3>
              <p>Confira os atendimentos do mês, corrija pendências e avance o estado sem apagar o histórico do evento.</p>
            </div>
            <label className="health-competence-picker">Competência<input type="month" value={competenceFilter} onChange={(event) => setCompetenceFilter(event.target.value)} /></label>
          </div>
          <div className="health-activity-metric-grid">
            <article className="health-activity-metric metric-blue"><span>Eventos na competência</span><strong>{competenceRecords.length}</strong><small>atendimentos individuais</small></article>
            <article className="health-activity-metric metric-amber"><span>Aguardando revisão</span><strong>{competencePending.length}</strong><small>campos ou estado pendente</small></article>
            <article className="health-activity-metric metric-green"><span>Validados</span><strong>{competenceRecords.filter((record) => record.competenceStatus === "Validado" || record.competenceStatus === "Fechado").length}</strong><small>prontos para fechamento</small></article>
            <article className="health-activity-metric metric-red"><span>Realizados sem resumo</span><strong>{competenceRecords.filter((record) => record.status === "Realizado" && !record.careSummary).length}</strong><small>pendência obrigatória</small></article>
          </div>
          {formError && <p className="health-form-error health-competence-error" role="alert">{formError}</p>}
          <div className="health-competence-actions">
            <button className="health-action-secondary" onClick={() => updateCompetenceBatch("Validado")} disabled={!competenceRecords.length || !competenceCanValidate}>Validar atendimentos pendentes</button>
            <button className="health-action-primary" onClick={() => updateCompetenceBatch("Fechado")} disabled={!competenceCanClose}>Fechar competência</button>
          </div>
          <div className="health-competence-list">
            {competenceRecords.map((record) => {
              const recordStatus = record.competenceStatus ?? (record.status === "Realizado" ? "Aguardando revisão" : "Rascunho");
              const missing = competenceIssues(record);
              return <article className={`health-competence-row ${recordStatus === "Fechado" ? "is-closed" : ""}`} key={record.id}><div><strong>{record.id} · {record.serviceType}</strong><small>{getPersonName(peopleRegistry, record.personId)} · {formatDate(record.date)} · {unitName(healthTerritory, record.unitId)}</small>{missing.length > 0 && <span className="health-competence-warning">Pendências: {missing.join(", ")}</span>}</div><span className={`health-status-chip tone-${recordStatus === "Validado" || recordStatus === "Fechado" ? "positive" : recordStatus === "Rascunho" ? "negative" : "warning"}`}>{recordStatus}</span>{recordStatus === "Fechado" ? <button className="health-action-secondary" onClick={() => reopenCompetenceRecord(record.id)}>Reabrir</button> : <select value={recordStatus} onChange={(event) => { const next = event.target.value as HealthCompetenceStatus; if (next === "Validado" && missing.length > 0) { setFormError(`Corrija as pendências de ${record.id} antes de validar.`); return; } onChange((current) => ({ ...current, serviceRecords: current.serviceRecords.map((item) => item.id === record.id ? { ...item, competenceStatus: next, history: [...item.history, { date: new Date().toISOString(), action: "Competência atualizada", detail: `Estado alterado para ${next}.` }] } : item) })); }} aria-label={`Estado da competência de ${record.id}`}>{competenceStatuses.filter((status) => status !== "Fechado").map((status) => <option key={status}>{status}</option>)}</select>}<button className="health-action-secondary" onClick={() => openAttendance(record)}>Abrir atendimento</button></article>;
            })}
            {!competenceRecords.length && <div className="health-activity-empty"><ClipboardList size={20} /><strong>Nenhum atendimento nesta competência</strong><span>Escolha outro mês ou registre um novo atendimento.</span></div>}
          </div>
          <div className="health-demo-note" role="note"><AlertCircle size={17} /><p><strong>Regra demonstrativa.</strong> Fechar uma competência não exclui eventos; alterações posteriores devem ser registradas como reabertura ou retificação com histórico.</p></div>
        </div>
      )}

      {view === "visits" && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar">
            <div>
              <span className="health-activity-eyebrow">ACS · ACE</span>
              <h3>Visitas domiciliares</h3>
              <p>
                Cada visita é um evento operacional relacionado a um domicílio e,
                quando aplicável, a uma pessoa residente.
              </p>
            </div>
            {canCreateVisits && (
              <button className="health-action-primary" onClick={startNewVisit}>
                <Plus size={16} /> Nova visita
              </button>
            )}
          </div>
          <div className="health-list-filters">
            <label className="health-search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar pessoa, domicílio, profissional ou atividade"
                aria-label="Buscar visitas domiciliares"
              />
            </label>
            <label className="health-status-filter">
              Situação
              <select
                value={visitStatusFilter}
                onChange={(event) => setVisitStatusFilter(event.target.value)}
              >
                <option>Todas as situações</option>
                {visitStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
          {visibleVisits.length === 0 ? (
            <div className="health-activity-empty">
              <Home size={20} />
              <strong>Nenhuma visita corresponde aos filtros</strong>
              <span>Altere a busca ou registre uma nova visita.</span>
            </div>
          ) : (
            <div className="health-record-list">
              {visibleVisits
                .slice()
                .sort((a, b) =>
                  `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`),
                )
                .map((visit) => {
                  const household = peopleRegistry.households.find(
                    (candidate) => candidate.id === visit.householdId,
                  );
                  return (
                    <article className="health-record-card" key={visit.id}>
                      <div className={`health-record-mark mark-${visit.kind.toLowerCase()}`}>
                        {visit.kind === "ACS" ? <UsersRound size={17} /> : <Home size={17} />}
                      </div>
                      <div className="health-record-main">
                        <div className="health-record-title-line">
                          <strong>{visit.activityType}</strong>
                          <span className="health-record-id">{visit.id} · {visit.kind}</span>
                        </div>
                        <p>
                          <UserRound size={13} /> {getPersonName(peopleRegistry, visit.personId)}
                        </p>
                        <p>
                          <MapPin size={13} /> {household ? getHouseholdLabel(peopleRegistry, household) : visit.householdId}
                        </p>
                        <small>
                          {formatDate(visit.date)} · {visit.time} · {professionalName(healthTerritory, visit.professionalId)}
                        </small>
                      </div>
                      <span className={`health-status-chip tone-${statusTone(visit.status)}`}>
                        {visit.status}
                      </span>
                      <button
                        className="health-record-open"
                        onClick={() => openVisit(visit)}
                        aria-label={`Abrir visita ${visit.id}`}
                      >
                        Abrir <ArrowRight size={14} />
                      </button>
                    </article>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {view === "attendance" && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar">
            <div>
              <span className="health-activity-eyebrow">UBS · SERVIÇOS</span>
              <h3>Registros de atendimento</h3>
              <p>
                Agenda e resultado do atendimento ficam separados do cadastro da
                pessoa e podem ser acompanhados pela equipe.
              </p>
            </div>
            {canCreateAttendance && (
              <button className="health-action-primary" onClick={startNewAttendance}>
                <Plus size={16} /> Novo atendimento
              </button>
            )}
          </div>
          <div className="health-list-filters">
            <label className="health-search-box">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar pessoa, serviço, unidade ou profissional"
                aria-label="Buscar registros de atendimento"
              />
            </label>
            <label className="health-status-filter">
              Situação
              <select
                value={careStatusFilter}
                onChange={(event) => setCareStatusFilter(event.target.value)}
              >
                <option>Todas as situações</option>
                {serviceStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
          </div>
          {visibleCareRecords.length === 0 ? (
            <div className="health-activity-empty">
              <Stethoscope size={20} />
              <strong>Nenhum atendimento corresponde aos filtros</strong>
              <span>Altere a busca ou registre um atendimento.</span>
            </div>
          ) : (
            <div className="health-record-list">
              {visibleCareRecords
                .slice()
                .sort((a, b) =>
                  `${b.date}T${b.time}`.localeCompare(`${a.date}T${a.time}`),
                )
                .map((record) => (
                  <article className="health-record-card" key={record.id}>
                    <div className="health-record-mark mark-care">
                      <Stethoscope size={17} />
                    </div>
                    <div className="health-record-main">
                      <div className="health-record-title-line">
                        <strong>{record.serviceType}</strong>
                        <span className="health-record-id">{record.id}</span>
                      </div>
                      <p>
                        <UserRound size={13} /> {getPersonName(peopleRegistry, record.personId)}
                      </p>
                      <p>
                        <MapPin size={13} /> {unitName(healthTerritory, record.unitId)}
                      </p>
                      <small>
                        {formatDate(record.date)} · {record.time} · {professionalName(healthTerritory, record.professionalId)}
                      </small>
                    </div>
                    <span className={`health-status-chip tone-${statusTone(record.status)}`}>
                      {record.status}
                    </span>
                    <button
                      className="health-record-open"
                      onClick={() => openAttendance(record)}
                      aria-label={`Abrir atendimento ${record.id}`}
                    >
                      Abrir <ArrowRight size={14} />
                    </button>
                  </article>
                ))}
            </div>
          )}
        </div>
      )}

      {view === "collective" && canCreateApsRecords && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar">
            <div>
              <span className="health-activity-eyebrow">APS · PRODUÇÃO COLETIVA</span>
              <h3>Atividades coletivas</h3>
              <p>Registro próprio da atividade, ligado à equipe e ao profissional, sem duplicar pessoas ou domicílios.</p>
            </div>
            <button className="health-action-primary" onClick={() => { setFormError(""); setView("new-collective"); }}><Plus size={16} /> Nova atividade</button>
          </div>
          <div className="health-record-list">
            {collectiveActivities.map((activity) => (
              <article className="health-record-card" key={activity.id}>
                <div className="health-record-mark mark-care"><UsersRound size={17} /></div>
                <div className="health-record-main">
                  <div className="health-record-title-line"><strong>{activity.activityType}</strong><span className="health-record-id">{activity.id}</span></div>
                  <p>{activity.theme} · {activity.targetAudience}</p>
                  <small>{formatDate(activity.date)} · {activity.time} · {activity.participantCount} participantes · {unitName(healthTerritory, activity.unitId)}</small>
                </div>
                <span className="health-status-chip tone-positive">{activity.status}</span>
              </article>
            ))}
          </div>
        </div>
      )}

      {view === "new-collective" && canCreateApsRecords && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar"><div><span className="health-activity-eyebrow">NOVO EVENTO · APS</span><h3>Registrar atividade coletiva</h3><p>O registro gera produção coletiva e mantém referências nos cadastros existentes.</p></div><button className="health-back-button" onClick={() => setView("collective")}><ArrowLeft size={15} /> Voltar</button></div>
          <form className="health-activity-form" onSubmit={saveCollectiveActivity}>
            {formError && <p className="health-form-error" role="alert">{formError}</p>}
            <label>Tipo de atividade<input name="activityType" placeholder="Ex.: Educação em saúde" required /></label>
            <label>Responsável<select name="professionalId" defaultValue={healthTerritory.professionals.find((item) => item.active)?.id ?? ""} required>{healthTerritory.professionals.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label>
            <label>Data<input name="date" type="date" defaultValue={today} required /></label>
            <label>Horário<input name="time" type="time" defaultValue="14:00" required /></label>
            <label>Tema<input name="theme" maxLength={240} placeholder="Tema trabalhado" required /></label>
            <label>Público-alvo<input name="targetAudience" maxLength={240} placeholder="Público participante" required /></label>
            <label>Participantes<input name="participantCount" type="number" min="0" defaultValue="0" required /></label>
            <div className="health-form-actions health-form-wide"><button type="button" className="health-back-button" onClick={() => setView("collective")}>Cancelar</button><button type="submit" className="health-action-primary"><Check size={16} /> Salvar atividade</button></div>
          </form>
        </div>
      )}

      {view === "food-markers" && canCreateApsRecords && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar"><div><span className="health-activity-eyebrow">APS · SISVAN</span><h3>Marcadores alimentares e medidas</h3><p>Cada aferição é um evento próprio relacionado à pessoa e, quando aplicável, ao atendimento.</p></div><button className="health-action-primary" onClick={() => { setFormError(""); setView("new-food-marker"); }}><Plus size={16} /> Nova aferição</button></div>
          <div className="health-record-list">
            {foodMarkers.map((marker) => (
              <article className="health-record-card" key={marker.id}><div className="health-record-mark mark-care"><ClipboardList size={17} /></div><div className="health-record-main"><div className="health-record-title-line"><strong>{getPersonName(peopleRegistry, marker.personId)}</strong><span className="health-record-id">{marker.id}</span></div><p>{marker.markerSummary}</p><small>{formatDate(marker.measuredAt)} · {marker.weightKg ?? "—"} kg · {marker.heightCm ?? "—"} cm · {unitName(healthTerritory, marker.unitId)}</small></div></article>
            ))}
          </div>
        </div>
      )}

      {view === "new-food-marker" && canCreateApsRecords && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar"><div><span className="health-activity-eyebrow">NOVO EVENTO · SISVAN</span><h3>Registrar marcador alimentar</h3><p>Use a pessoa já cadastrada; não crie outro cadastro para a aferição.</p></div><button className="health-back-button" onClick={() => setView("food-markers")}><ArrowLeft size={15} /> Voltar</button></div>
          <form className="health-activity-form" onSubmit={saveFoodMarker}>
            {formError && <p className="health-form-error" role="alert">{formError}</p>}
            <label>Pessoa<select name="personId" defaultValue="" required><option value="" disabled>Selecione uma pessoa</option>{peopleRegistry.people.filter((item) => item.status === "Ativa").map((item) => <option key={item.id} value={item.id}>{item.fullName} · {item.id}</option>)}</select></label>
            <label>Responsável<select name="professionalId" defaultValue={healthTerritory.professionals.find((item) => item.active)?.id ?? ""} required>{healthTerritory.professionals.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.category}</option>)}</select></label>
            <label>Data da aferição<input name="measuredAt" type="date" defaultValue={today} required /></label>
            <label>Peso (kg)<input name="weightKg" type="number" min="0" step="0.1" /></label>
            <label>Altura (cm)<input name="heightCm" type="number" min="0" step="0.1" /></label>
            <label className="health-form-wide">Marcadores de consumo alimentar<textarea name="markerSummary" rows={3} maxLength={600} required placeholder="Registre os marcadores coletados." /></label>
            <label className="health-form-wide">Avaliação nutricional administrativa<textarea name="nutritionalAssessment" rows={2} maxLength={400} placeholder="Acompanhamento ou pendência para a equipe." /></label>
            <div className="health-form-actions health-form-wide"><button type="button" className="health-back-button" onClick={() => setView("food-markers")}>Cancelar</button><button type="submit" className="health-action-primary"><Check size={16} /> Salvar aferição</button></div>
          </form>
        </div>
      )}

      {view === "new-visit" && canCreateVisits && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar">
            <div>
              <span className="health-activity-eyebrow">NOVO EVENTO · ACS/ACE</span>
              <h3>Registrar visita domiciliar</h3>
              <p>Selecione referências existentes. O registro não cria nem altera o cadastro-base.</p>
            </div>
            <button className="health-back-button" onClick={showHomeVisits}>
              <ArrowLeft size={15} /> Voltar à lista
            </button>
          </div>
          <form className="health-activity-form" onSubmit={saveHomeVisit}>
            {formError && <p className="health-form-error" role="alert">{formError}</p>}
            {isSecretary ? (
              <label>
                Agente responsável
                <select
                  name="kind"
                  value={visitKind}
                  onChange={(event) => selectVisitKind(event.target.value as HomeVisitKind)}
                  required
                >
                  {homeVisitKinds.map((kind) => <option key={kind} value={kind}>{kind} · {kind === "ACS" ? "Agente Comunitário de Saúde" : "Agente de Combate às Endemias"}</option>)}
                </select>
              </label>
            ) : (
              <div className="health-form-readonly">
                <span>PERFIL DE LANÇAMENTO</span>
                <strong>{kindForPersona} · {personaId === "ace" ? "Agente de Combate às Endemias" : "Agente Comunitário de Saúde"}</strong>
              </div>
            )}
            <label>
              Domicílio visitado
              <select
                name="householdId"
                value={selectedHousehold?.id ?? ""}
                onChange={(event) => {
                  setVisitHouseholdId(event.target.value);
                  setVisitPersonId("");
                  setVisitProfessionalId("");
                }}
                required
                disabled={eligibleHouseholds.length === 0}
              >
                {eligibleHouseholds.length === 0 ? (
                  <option value="">Nenhum domicílio ativo com equipe compatível</option>
                ) : eligibleHouseholds.map((household) => (
                  <option key={household.id} value={household.id}>
                    {getHouseholdLabel(peopleRegistry, household)} · {household.id}
                  </option>
                ))}
              </select>
              {selectedArea && selectedTeam && selectedUnit && (
                <small className="health-field-hint">
                  {selectedArea.name} · {selectedTeam.name} · {selectedUnit.name}
                </small>
              )}
            </label>
            <label>
              Pessoa residente (opcional)
              <select
                name="personId"
                value={visitPersonId}
                onChange={(event) => setVisitPersonId(event.target.value)}
              >
                <option value="">Visita ao domicílio sem pessoa específica</option>
                {peopleInSelectedHousehold.map((person) => (
                  <option key={person.id} value={person.id}>{person.fullName} · {person.id}</option>
                ))}
              </select>
            </label>
            <label>
              Profissional da equipe
              <select
                name="professionalId"
                value={selectedVisitProfessional?.id ?? ""}
                onChange={(event) => setVisitProfessionalId(event.target.value)}
                required
                disabled={!visitProfessionals.length}
              >
                {visitProfessionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>{professional.name} · {professional.category}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo de atividade
              <select
                name="activityType"
                required
                value={visitActivityType}
                onChange={(event) => setVisitActivityType(event.target.value)}
              >
                <option value="" disabled>Selecione a atividade</option>
                {visitActivities[visitKind].map((activity) => <option key={activity}>{activity}</option>)}
              </select>
            </label>
            <label>
              Data
              <input name="date" type="date" defaultValue={today} required />
            </label>
            <label>
              Horário
              <input name="time" type="time" defaultValue="09:00" required />
            </label>
            <label>
              Situação/resultado
              <select name="status" defaultValue="Programada" required>
                {visitStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="health-form-wide">
              Resultado ou observação da visita
              <textarea name="outcomeSummary" rows={3} maxLength={600} placeholder="Registre o contato e a providência, sem duplicar o cadastro da pessoa." />
            </label>
            {visitKind === "ACE" && (
              <label className="health-form-wide">
                Achado ou observação ambiental (ACE)
                <textarea name="environmentalFinding" rows={2} maxLength={500} placeholder="Ex.: recipiente observado, orientação realizada, situação a verificar no retorno." />
              </label>
            )}
            <label>
              Data prevista para retorno (se aplicável)
              <input name="followUpDate" type="date" />
            </label>
            <label>
              Nota interna de demonstração (opcional)
              <input name="notes" maxLength={300} placeholder="Providência combinada ou referência para a equipe" />
            </label>
            <div className="health-form-actions health-form-wide">
              <button type="button" className="health-back-button" onClick={showHomeVisits}>Cancelar</button>
              <button type="submit" className="health-action-primary"><Check size={16} /> Salvar visita nesta sessão</button>
            </div>
          </form>
        </div>
      )}

      {view === "new-attendance" && canCreateAttendance && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar">
            <div>
              <span className="health-activity-eyebrow">NOVO EVENTO · UBS</span>
              <h3>Registrar atendimento</h3>
              <p>Agenda e resultado clínico demonstrativo são registrados como evento, sem alterar a ficha de referência.</p>
            </div>
            <button className="health-back-button" onClick={showAttendance}>
              <ArrowLeft size={15} /> Voltar à lista
            </button>
          </div>
          <form className="health-activity-form" onSubmit={saveCareRecord}>
            {formError && <p className="health-form-error" role="alert">{formError}</p>}
            <fieldset className="health-form-fieldset health-form-section health-form-wide">
              <legend><span className="health-section-number">01</span>Identificação e vínculo assistencial</legend>
              <div className="health-form-subgrid">
                <label>Pessoa atendida<select name="personId" required defaultValue=""><option value="" disabled>Selecione uma pessoa</option>{peopleRegistry.people.filter((person) => person.status === "Ativa").map((person) => <option key={person.id} value={person.id}>{person.fullName} · {person.id}</option>)}</select></label>
                <label>Tipo de atendimento<select name="serviceType" required value={attendanceServiceType} onChange={(event) => setAttendanceServiceType(event.target.value)}><option value="" disabled>Selecione o serviço</option>{serviceTypes.map((service) => <option key={service}>{service}</option>)}</select></label>
                <label>Modalidade<select name="modality" defaultValue="Consulta programada" required>{attendanceModalities.map((modality) => <option key={modality}>{modality}</option>)}</select></label>
                <label>Caráter do atendimento<select name="character" defaultValue="Programado" required>{attendanceCharacters.map((character) => <option key={character}>{character}</option>)}</select></label>
                <label>Profissional responsável<select name="professionalId" value={selectedCareProfessional?.id ?? ""} onChange={(event) => setCareProfessionalId(event.target.value)} required>{availableCareProfessionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name} · {professional.category}</option>)}</select>{selectedCareTeam && selectedCareUnit && <small className="health-field-hint">{selectedCareTeam.name} · {selectedCareUnit.name}</small>}</label>
              </div>
            </fieldset>
            <fieldset className="health-form-fieldset health-form-section health-form-wide">
              <legend><span className="health-section-number">02</span>Agenda e competência</legend>
              <div className="health-form-subgrid">
                <label>Data<input name="date" type="date" defaultValue={today} required /></label>
                <label>Horário<input name="time" type="time" defaultValue="10:00" required /></label>
                <label>Competência<input name="competence" type="month" defaultValue={today.slice(0, 7)} required /><small className="health-field-hint">Derivada do mês da data do atendimento.</small></label>
                <label>Situação<select name="status" defaultValue="Agendado" required>{serviceStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
              </div>
            </fieldset>
            <fieldset className="health-form-fieldset health-form-section health-form-wide">
              <legend><span className="health-section-number">03</span>Motivo, acompanhamento e desfecho</legend>
              <div className="health-form-subgrid">
                <label className="health-form-wide">Motivo ou objetivo do atendimento<input name="reason" maxLength={240} placeholder="Ex.: consulta de rotina, retorno ou procedimento" required /></label>
                <label>Condição ou acompanhamento<input name="conditionOrFollowUp" maxLength={240} placeholder="Ex.: cuidado programado ou acompanhamento longitudinal" required /></label>
                <label>Problemas ou condições acompanhados<input name="conditions" maxLength={300} placeholder="Separe por vírgula, se houver mais de um" /></label>
                <label>Desfecho previsto/registrado<select name="outcome" defaultValue="Acompanhamento mantido" required>{attendanceOutcomes.map((outcome) => <option key={outcome}>{outcome}</option>)}</select></label>
              </div>
            </fieldset>
            <fieldset className="health-form-fieldset health-form-section health-form-wide">
              <legend><span className="health-section-number">04</span>Registro e continuidade do cuidado</legend>
              <div className="health-form-subgrid">
                <label className="health-form-wide">Resumo da atividade/conduta (preencher ao concluir)<textarea name="careSummary" rows={3} maxLength={800} placeholder="Resumo fictício, sem substituir a documentação clínica oficial." /></label>
                <label className="health-form-wide">Plano de continuidade / próximo passo<textarea name="carePlan" rows={2} maxLength={500} placeholder="Ex.: manter acompanhamento, revisar resultado no retorno ou orientar procura da unidade." /><small className="health-field-hint">Obrigatório para atendimentos realizados. Não substitui protocolo ou registro clínico oficial.</small></label>
                <label className="health-form-wide">Motivo de falta ou cancelamento (quando aplicável)<input name="statusReason" maxLength={240} placeholder="Ex.: ausência sem aviso, indisponibilidade do profissional ou solicitação da pessoa" /></label>
              </div>
            </fieldset>
            <fieldset className="health-form-fieldset health-form-wide">
              <legend><span className="health-section-number">05</span>Medidas e sinais registrados <em>(opcional)</em></legend>
              <p className="health-field-hint">Use somente quando fizer parte do atendimento. Os campos são demonstrativos e não substituem protocolos clínicos.</p>
              <div className="health-vitals-grid">
                <label>Pressão arterial<input name="bloodPressure" placeholder="Ex.: 120/80" /></label>
                <label>Frequência cardíaca (bpm)<input name="heartRateBpm" type="number" min="0" /></label>
                <label>Frequência respiratória<input name="respiratoryRate" type="number" min="0" /></label>
                <label>Temperatura (°C)<input name="temperatureC" type="number" min="0" step="0.1" /></label>
                <label>Saturação O₂ (%)<input name="oxygenSaturation" type="number" min="0" max="100" /></label>
                <label>Glicemia (mg/dL)<input name="glucoseMgDl" type="number" min="0" /></label>
                <label>Peso (kg)<input name="weightKg" type="number" min="0" step="0.1" /></label>
                <label>Altura (cm)<input name="heightCm" type="number" min="0" step="0.1" /></label>
                <label>Dor (0 a 10)<input name="painScale" type="number" min="0" max="10" /></label>
              </div>
            </fieldset>
            <fieldset className="health-form-fieldset health-form-wide">
              <legend><span className="health-section-number">06</span>Procedimentos realizados</legend>
              <p className="health-field-hint">Selecione os procedimentos vinculados a este atendimento. Eles serão contabilizados separadamente.</p>
              <div className="health-procedure-grid">
                {procedureCatalog.map((procedure) => <label key={procedure} className="health-checkbox"><span className="health-procedure-title"><input type="checkbox" name="procedure" value={procedure} /> <span>{procedure}</span></span><span className="health-procedure-fields"><input name="procedureQuantity" type="number" min="1" defaultValue="1" aria-label={`Quantidade de ${procedure}`} /><input name="procedureResult" maxLength={120} placeholder="Resultado / observação" aria-label={`Resultado de ${procedure}`} /></span></label>)}
              </div>
            </fieldset>
            {attendanceServiceType === "Atendimento odontológico" && <fieldset className="health-form-fieldset health-form-wide">
              <legend><span className="health-section-number">07</span>Detalhamento odontológico <em>(quando aplicável)</em></legend>
              <p className="health-field-hint">Ative o tipo “Atendimento odontológico” para preencher esta seção.</p>
              <div className="health-form-subgrid">
                <label>Motivo odontológico<input name="dentalReason" maxLength={180} placeholder="Ex.: avaliação, dor ou retorno" /></label>
                <label>Procedimento odontológico<input name="dentalProcedure" maxLength={180} placeholder="Ex.: avaliação, restauração ou limpeza" /></label>
                <label>Dente ou região<input name="toothOrRegion" maxLength={100} placeholder="Opcional" /></label>
                <label>Urgência<select name="dentalUrgency" defaultValue="Não"><option>Não</option><option>Sim</option></select></label>
              </div>
              <label>Orientação ou próximo passo<input name="dentalGuidance" maxLength={240} placeholder="Opcional" /></label>
            </fieldset>}
            <fieldset className="health-form-fieldset health-form-section health-form-wide">
              <legend><span className="health-section-number">08</span>Encaminhamento e retorno</legend>
              <div className="health-form-subgrid">
                <label>Encaminhamento ou próximo passo (opcional)<input name="referral" maxLength={300} placeholder="Ex.: retorno ou avaliação por outra equipe" /></label>
                <label>Data de acompanhamento (opcional)<input name="followUpDate" type="date" /></label>
              </div>
            </fieldset>
            <div className="health-form-actions health-form-wide">
              <button type="button" className="health-back-button" onClick={showAttendance}>Cancelar</button>
              <button type="submit" className="health-action-primary"><Check size={16} /> Salvar atendimento nesta sessão</button>
            </div>
          </form>
        </div>
      )}

      {view === "detail" && (selectedVisit || selectedAttendance) && (
        <div className="health-activity-view">
          <div className="health-activity-toolbar">
            <div>
              <span className="health-activity-eyebrow">DETALHE · {selectedVisit?.id ?? selectedAttendance?.id}</span>
              <h3>{selectedVisit?.activityType ?? selectedAttendance?.serviceType}</h3>
              <p>Referências relacionadas, situação atual e histórico desta sessão.</p>
            </div>
            <button
              className="health-back-button"
              onClick={selectedVisit ? showHomeVisits : showAttendance}
            >
              <ArrowLeft size={15} /> Voltar à lista
            </button>
          </div>
          <div className="health-detail-grid">
            {selectedVisit ? (
              <>
                <div className="health-detail-field"><span>Tipo e situação</span><strong>{selectedVisit.kind} · {selectedVisit.status}</strong></div>
                <div className="health-detail-field"><span>Data e horário</span><strong>{formatDate(selectedVisit.date)} · {selectedVisit.time}</strong></div>
                <div className="health-detail-field"><span>Pessoa relacionada</span><strong>{getPersonName(peopleRegistry, selectedVisit.personId)}</strong></div>
                <div className="health-detail-field"><span>Família relacionada</span><strong>{getFamilyName(peopleRegistry, selectedVisit.familyId)}</strong></div>
                <div className="health-detail-field"><span>Domicílio</span><strong>{peopleRegistry.households.find((item) => item.id === selectedVisit.householdId) ? getHouseholdLabel(peopleRegistry, peopleRegistry.households.find((item) => item.id === selectedVisit.householdId)!) : selectedVisit.householdId}</strong></div>
                <div className="health-detail-field"><span>Profissional</span><strong>{professionalName(healthTerritory, selectedVisit.professionalId)}</strong></div>
                <div className="health-detail-field"><span>Equipe / unidade</span><strong>{teamName(healthTerritory, selectedVisit.teamId)} · {unitName(healthTerritory, selectedVisit.unitId)}</strong></div>
                <div className="health-detail-field"><span>Área de atuação</span><strong>{areaName(healthTerritory, selectedVisit.areaId)}</strong></div>
                <div className="health-detail-field"><span>Retorno previsto</span><strong>{formatDate(selectedVisit.followUpDate)}</strong></div>
                <div className="health-detail-field health-detail-wide"><span>Resultado</span><p>{selectedVisit.outcomeSummary || "Sem resultado registrado; visita programada."}</p></div>
                {selectedVisit.environmentalFinding && <div className="health-detail-field health-detail-wide"><span>Observação ambiental (ACE)</span><p>{selectedVisit.environmentalFinding}</p></div>}
                {selectedVisit.notes && <div className="health-detail-field health-detail-wide"><span>Nota operacional</span><p>{selectedVisit.notes}</p></div>}
              </>
            ) : selectedAttendance ? (
              <>
                <div className="health-detail-field"><span>Situação</span><strong>{selectedAttendance.status}</strong></div>
                <div className="health-detail-field"><span>Data e horário</span><strong>{formatDate(selectedAttendance.date)} · {selectedAttendance.time}</strong></div>
                <div className="health-detail-field"><span>Pessoa atendida</span><strong>{getPersonName(peopleRegistry, selectedAttendance.personId)}</strong></div>
                <div className="health-detail-field"><span>Profissional</span><strong>{professionalName(healthTerritory, selectedAttendance.professionalId)}</strong></div>
                <div className="health-detail-field"><span>Equipe</span><strong>{teamName(healthTerritory, selectedAttendance.teamId)}</strong></div>
                <div className="health-detail-field"><span>Unidade</span><strong>{unitName(healthTerritory, selectedAttendance.unitId)}</strong></div>
                <div className="health-detail-field"><span>Competência / revisão</span><strong>{selectedAttendance.competence} · {selectedAttendance.competenceStatus ?? (selectedAttendance.status === "Realizado" ? "Aguardando revisão" : "Rascunho")}</strong></div>
                <div className="health-detail-field"><span>Caráter / modalidade</span><strong>{selectedAttendance.character ?? "Programado"} · {selectedAttendance.modality}</strong></div>
                <div className="health-detail-field health-detail-wide"><span>Motivo / objetivo</span><p>{selectedAttendance.reason}</p></div>
                <div className="health-detail-field health-detail-wide"><span>Condições acompanhadas</span><p>{selectedAttendance.conditions?.join(", ") || selectedAttendance.conditionOrFollowUp}</p></div>
                <div className="health-detail-field health-detail-wide"><span>Procedimentos realizados</span><p>{selectedAttendance.procedures?.length ? selectedAttendance.procedures.map((procedure) => `${procedure.name} (${procedure.quantity})${procedure.result ? ` · ${procedure.result}` : ""}`).join(" · ") : "Nenhum procedimento estruturado registrado."}</p></div>
                {selectedAttendance.dentalDetails && <div className="health-detail-field health-detail-wide"><span>Detalhamento odontológico</span><p>{selectedAttendance.dentalDetails.reason} · {selectedAttendance.dentalDetails.procedure}{selectedAttendance.dentalDetails.toothOrRegion ? ` · ${selectedAttendance.dentalDetails.toothOrRegion}` : ""}</p></div>}
                <div className="health-detail-field health-detail-wide"><span>Resumo do atendimento</span><p>{selectedAttendance.careSummary || "Sem resumo clínico demonstrativo registrado."}</p></div>
                <div className="health-detail-field health-detail-wide"><span>Plano de continuidade / próximo passo</span><p>{selectedAttendance.carePlan || "Nenhum plano de continuidade registrado."}</p></div>
                <div className="health-detail-field health-detail-wide"><span>Encaminhamento ou próximo passo</span><p>{selectedAttendance.referral || "Nenhum encaminhamento registrado."}</p></div>
                {selectedAttendance.statusReason && <div className="health-detail-field health-detail-wide"><span>Motivo da situação</span><p>{selectedAttendance.statusReason}</p></div>}
                {selectedAttendance.vitalSigns && <div className="health-detail-field health-detail-wide"><span>Medidas e sinais registrados</span><p>{[
                  selectedAttendance.vitalSigns.bloodPressure && `PA ${selectedAttendance.vitalSigns.bloodPressure}`,
                  selectedAttendance.vitalSigns.heartRateBpm && `FC ${selectedAttendance.vitalSigns.heartRateBpm} bpm`,
                  selectedAttendance.vitalSigns.respiratoryRate && `FR ${selectedAttendance.vitalSigns.respiratoryRate}`,
                  selectedAttendance.vitalSigns.temperatureC && `Temp. ${selectedAttendance.vitalSigns.temperatureC} °C`,
                  selectedAttendance.vitalSigns.oxygenSaturation && `Sat. ${selectedAttendance.vitalSigns.oxygenSaturation}%`,
                  selectedAttendance.vitalSigns.glucoseMgDl && `Glicemia ${selectedAttendance.vitalSigns.glucoseMgDl} mg/dL`,
                  selectedAttendance.vitalSigns.weightKg && `Peso ${selectedAttendance.vitalSigns.weightKg} kg`,
                  selectedAttendance.vitalSigns.heightCm && `Altura ${selectedAttendance.vitalSigns.heightCm} cm`,
                  selectedAttendance.vitalSigns.painScale !== undefined && `Dor ${selectedAttendance.vitalSigns.painScale}/10`,
                ].filter(Boolean).join(" · ") || "Sem medidas informadas."}</p></div>}
                <div className="health-detail-field"><span>Acompanhamento previsto</span><strong>{formatDate(selectedAttendance.followUpDate)}</strong></div>
                {onOpenRegulation && (
                  <div className="health-detail-field health-detail-wide">
                    <span>Continuidade do cuidado</span>
                    <p>
                      Encaminhe este atendimento realizado à fila clínica sem
                      recadastrar a pessoa, o profissional ou a unidade.
                    </p>
                    <button
                      type="button"
                      className="health-action-secondary"
                      disabled={selectedAttendance.status !== "Realizado"}
                      onClick={() => onOpenRegulation(selectedAttendance.id)}
                    >
                      <ArrowRight size={14} />
                      {selectedAttendance.status === "Realizado"
                        ? "Criar encaminhamento vinculado"
                        : "Conclua o atendimento para encaminhar"}
                    </button>
                  </div>
                )}
                {onOpenDiagnostics && (
                  <div className="health-detail-field health-detail-wide">
                    <span>Exames, procedimentos e resultados</span>
                    <p>
                      Registre um pedido clínico reaproveitando a pessoa e este
                      atendimento como origem, sem duplicar os cadastros.
                    </p>
                    <button
                      type="button"
                      className="health-action-secondary"
                      disabled={selectedAttendance.status !== "Realizado"}
                      onClick={() => onOpenDiagnostics(selectedAttendance.id)}
                    >
                      <ArrowRight size={14} />
                      {selectedAttendance.status === "Realizado"
                        ? "Criar pedido vinculado"
                        : "Conclua o atendimento para criar um pedido"}
                    </button>
                  </div>
                )}
              </>
            ) : null}
          </div>
          <div className="health-status-update">
            <div>
              <span className="health-activity-eyebrow">ACOMPANHAMENTO</span>
              <h4>Atualizar situação</h4>
            </div>
            {selectedAttendance?.competenceStatus === "Fechado" && <p className="health-locked-note">Competência fechada: alterações bloqueadas. Reabra o registro na revisão da competência para registrar uma retificação.</p>}
            <label>
              Nova situação
              <select
                value={statusDraft}
                disabled={selectedAttendance?.competenceStatus === "Fechado"}
                onChange={(event) => setStatusDraft(event.target.value as ActivityStatus)}
              >
                {(selectedVisit ? visitStatuses : serviceStatuses).map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            {selectedVisit && statusDraft === "Retorno necessário" && (
              <label>
                Data do retorno
                <input type="date" value={statusFollowUpDate} onChange={(event) => setStatusFollowUpDate(event.target.value)} />
              </label>
            )}
            {selectedAttendance && (
              <label>
                Data de acompanhamento (opcional)
                <input type="date" value={statusFollowUpDate} onChange={(event) => setStatusFollowUpDate(event.target.value)} />
              </label>
            )}
            {selectedVisit && statusDraft !== "Programada" && (
              <label className="health-status-outcome">
                Resultado da visita ou tentativa
                <textarea
                  rows={2}
                  maxLength={600}
                  value={statusOutcomeDraft}
                  onChange={(event) => setStatusOutcomeDraft(event.target.value)}
                  placeholder="Descreva o contato, resultado e providência."
                />
              </label>
            )}
            {selectedAttendance && statusDraft === "Realizado" && (
              <label className="health-status-outcome">
                Resumo do atendimento
                <textarea
                  rows={2}
                  maxLength={800}
                  value={statusOutcomeDraft}
                  onChange={(event) => setStatusOutcomeDraft(event.target.value)}
                  placeholder="Resumo demonstrativo da atividade/conduta."
                />
              </label>
            )}
            {selectedAttendance && statusDraft === "Realizado" && (
              <label className="health-status-outcome">
                Plano de continuidade / próximo passo
                <textarea
                  rows={2}
                  maxLength={500}
                  value={statusCarePlanDraft}
                  onChange={(event) => setStatusCarePlanDraft(event.target.value)}
                  placeholder="Informe o que deve acontecer depois deste atendimento."
                  disabled={selectedAttendance.competenceStatus === "Fechado"}
                />
              </label>
            )}
            {selectedAttendance && (statusDraft === "Não compareceu" || statusDraft === "Cancelado") && (
              <label className="health-status-outcome">
                Motivo da falta ou cancelamento
                <textarea
                  rows={2}
                  maxLength={240}
                  value={statusReasonDraft}
                  onChange={(event) => setStatusReasonDraft(event.target.value)}
                  placeholder="Registre a justificativa operacional."
                  disabled={selectedAttendance.competenceStatus === "Fechado"}
                />
              </label>
            )}
            <button className="health-action-primary" onClick={updateSelectedStatus} disabled={selectedAttendance?.competenceStatus === "Fechado"}>
              <RotateCcw size={15} /> Salvar atualização
            </button>
          </div>
          {formError && <p className="health-form-error" role="alert">{formError}</p>}
          <div className="health-history-panel">
            <div className="health-activity-section-heading">
              <div><span>LINHA DO TEMPO</span><h3>Histórico do registro</h3></div>
              <span>{(selectedVisit?.history ?? selectedAttendance?.history ?? []).length} eventos</span>
            </div>
            <ol>
              {(selectedVisit?.history ?? selectedAttendance?.history ?? []).slice().reverse().map((event, index) => (
                <li key={`${event.date}-${event.action}-${index}`}>
                  <span className="health-history-dot" />
                  <div><strong>{event.action}</strong><small>{formatHistoryDate(event.date)}</small><p>{event.detail}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}

      {view === "detail" && !selectedVisit && !selectedAttendance && (
        <div className="health-activity-empty"><AlertCircle size={20} /><strong>Registro não encontrado</strong><span>Volte à lista para selecionar outro evento.</span></div>
      )}

      <footer className="health-activity-footer">
        <span><Clock3 size={14} /> Alterações ficam disponíveis enquanto a sessão estiver aberta.</span>
        <span><ClipboardList size={14} /> {dataset.homeVisits.length} visitas · {dataset.serviceRecords.length} atendimentos</span>
      </footer>
    </section>
  );
}
