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
type ModuleMode = "secretary" | "operator";
type ModuleView =
  | "overview"
  | "visits"
  | "attendance"
  | "new-visit"
  | "new-attendance"
  | "detail";
type SelectedRecord =
  | { kind: "visit"; id: string }
  | { kind: "attendance"; id: string };
type ActivityStatus = HomeVisitStatus | HealthServiceStatus;

type HealthVisitsAttendanceModuleProps = {
  mode: ModuleMode;
  personaId?: HealthOperatorPersona;
  dataset: HealthActivitiesDataset;
  peopleRegistry: PeopleRegistryDataset;
  healthTerritory: HealthTerritoryDataset;
  onChange: (
    update: (current: HealthActivitiesDataset) => HealthActivitiesDataset,
  ) => void;
  onOpenRegulation?: (serviceRecordId: string) => void;
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

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

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
  personaId,
  dataset,
  peopleRegistry,
  healthTerritory,
  onChange,
  onOpenRegulation,
  onBack,
}: HealthVisitsAttendanceModuleProps) {
  const initialView: ModuleView =
    mode === "secretary"
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
  const [formError, setFormError] = useState("");
  const [statusDraft, setStatusDraft] = useState<ActivityStatus>("Programada");
  const [statusFollowUpDate, setStatusFollowUpDate] = useState("");
  const [statusOutcomeDraft, setStatusOutcomeDraft] = useState("");

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

  const today = localDate();
  const isSecretary = mode === "secretary";
  const canCreateVisits = isSecretary || personaId === "acs" || personaId === "ace";
  const canCreateAttendance = isSecretary || personaId === "ubs";
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
    setView("new-attendance");
  };

  const openVisit = (visit: HomeVisitRecord) => {
    setSelectedRecord({ kind: "visit", id: visit.id });
    setStatusDraft(visit.status);
    setStatusFollowUpDate(visit.followUpDate ?? "");
    setStatusOutcomeDraft(visit.outcomeSummary);
    setFormError("");
    setView("detail");
  };

  const openAttendance = (record: HealthServiceRecord) => {
    setSelectedRecord({ kind: "attendance", id: record.id });
    setStatusDraft(record.status);
    setStatusFollowUpDate(record.followUpDate ?? "");
    setStatusOutcomeDraft(record.careSummary);
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
    const date = String(values.get("date") ?? "");
    const time = String(values.get("time") ?? "");
    const status = String(values.get("status") ?? "Agendado") as HealthServiceStatus;
    const reason = String(values.get("reason") ?? "").trim();
    const careSummary = String(values.get("careSummary") ?? "").trim();
    const referral = String(values.get("referral") ?? "").trim();
    const followUpDate = String(values.get("followUpDate") ?? "");

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
    if (!serviceType || !date || !time || !reason) {
      setFormError(
        "Preencha o tipo de atendimento, data, horário e motivo/objetivo.",
      );
      return;
    }
    if (status === "Realizado" && !careSummary) {
      setFormError("Informe um resumo da atividade para marcar como realizado.");
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
      serviceType,
      status,
      reason,
      careSummary,
      referral,
      followUpDate,
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
    setView("detail");
    setFormError("");
  };

  const updateSelectedStatus = () => {
    if (!selectedRecord) return;
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
      !statusOutcomeDraft.trim()
    ) {
      setFormError("Informe o resumo do atendimento antes de marcá-lo como realizado.");
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
                careSummary: statusOutcomeDraft.trim() || record.careSummary,
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
          <h2>Visitas e atendimentos</h2>
          <p>
            Registros ligados às pessoas, domicílios, equipes e unidades já
            cadastrados no cenário fictício.
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
        {isSecretary && (
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
            <label>
              Pessoa atendida
              <select name="personId" required defaultValue="">
                <option value="" disabled>Selecione uma pessoa</option>
                {peopleRegistry.people.filter((person) => person.status === "Ativa").map((person) => (
                  <option key={person.id} value={person.id}>{person.fullName} · {person.id}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo de atendimento
              <select name="serviceType" required defaultValue="">
                <option value="" disabled>Selecione o serviço</option>
                {serviceTypes.map((service) => <option key={service}>{service}</option>)}
              </select>
            </label>
            <label>
              Profissional responsável
              <select
                name="professionalId"
                value={selectedCareProfessional?.id ?? ""}
                onChange={(event) => setCareProfessionalId(event.target.value)}
                required
              >
                {availableCareProfessionals.map((professional) => (
                  <option key={professional.id} value={professional.id}>{professional.name} · {professional.category}</option>
                ))}
              </select>
              {selectedCareTeam && selectedCareUnit && (
                <small className="health-field-hint">{selectedCareTeam.name} · {selectedCareUnit.name}</small>
              )}
            </label>
            <label>
              Data
              <input name="date" type="date" defaultValue={today} required />
            </label>
            <label>
              Horário
              <input name="time" type="time" defaultValue="10:00" required />
            </label>
            <label>
              Situação
              <select name="status" defaultValue="Agendado" required>
                {serviceStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
            </label>
            <label className="health-form-wide">
              Motivo ou objetivo do atendimento
              <input name="reason" maxLength={240} placeholder="Ex.: consulta de rotina, retorno ou procedimento" required />
            </label>
            <label className="health-form-wide">
              Resumo da atividade/conduta (preencher ao concluir)
              <textarea name="careSummary" rows={3} maxLength={800} placeholder="Resumo fictício, sem substituir a documentação clínica oficial." />
            </label>
            <label>
              Encaminhamento ou próximo passo (opcional)
              <input name="referral" maxLength={300} placeholder="Ex.: retorno ou avaliação por outra equipe" />
            </label>
            <label>
              Data de acompanhamento (opcional)
              <input name="followUpDate" type="date" />
            </label>
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
                <div className="health-detail-field health-detail-wide"><span>Motivo / objetivo</span><p>{selectedAttendance.reason}</p></div>
                <div className="health-detail-field health-detail-wide"><span>Resumo do atendimento</span><p>{selectedAttendance.careSummary || "Sem resumo clínico demonstrativo registrado."}</p></div>
                <div className="health-detail-field health-detail-wide"><span>Encaminhamento ou próximo passo</span><p>{selectedAttendance.referral || "Nenhum encaminhamento registrado."}</p></div>
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
              </>
            ) : null}
          </div>
          <div className="health-status-update">
            <div>
              <span className="health-activity-eyebrow">ACOMPANHAMENTO</span>
              <h4>Atualizar situação</h4>
            </div>
            <label>
              Nova situação
              <select
                value={statusDraft}
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
            <button className="health-action-primary" onClick={updateSelectedStatus}>
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
