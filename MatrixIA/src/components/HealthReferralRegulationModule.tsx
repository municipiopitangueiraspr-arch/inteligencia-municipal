import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  FilePlus2,
  Filter,
  History,
  MapPin,
  Search,
  Stethoscope,
  UsersRound,
} from "lucide-react";
import type { HealthActivitiesDataset } from "../data/healthActivities";
import {
  getHealthReferralSummary,
  getHealthReferralWaitDays,
  healthReferralStatuses,
  nextHealthReferralId,
  type HealthReferralPriority,
  type HealthReferralRecord,
  type HealthReferralsDataset,
  type HealthReferralStatus,
} from "../data/healthReferrals";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";
import "./HealthReferralRegulationModule.css";

type ModuleMode = "secretary" | "operator";
type ModuleView = "queue" | "create" | "detail";

type HealthReferralRegulationModuleProps = {
  mode: ModuleMode;
  dataset: HealthReferralsDataset;
  healthActivities: HealthActivitiesDataset;
  peopleRegistry: PeopleRegistryDataset;
  healthTerritory: HealthTerritoryDataset;
  onChange: (
    update: (current: HealthReferralsDataset) => HealthReferralsDataset,
  ) => void;
  initialServiceRecordId?: string;
  onBack?: () => void;
};

const priorities: HealthReferralPriority[] = [
  "Rotina",
  "Preferencial",
  "Urgente",
];

const specialties = [
  "Cardiologia",
  "Dermatologia",
  "Endocrinologia",
  "Fisioterapia especializada",
  "Ginecologia",
  "Neurologia",
  "Oftalmologia",
  "Ortopedia",
  "Otorrinolaringologia",
  "Psiquiatria",
  "Ultrassonografia",
  "Urologia",
];

const destinations = [
  "Consórcio Regional de Saúde — Polo Norte",
  "Ambulatório Regional de Especialidades",
  "Centro de Especialidades Municipal",
  "Serviço Regional de Diagnóstico",
];

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatHistoryDate = (value: string) => {
  const [date, time] = value.split("T");
  return `${formatDate(date)}${time ? ` · ${time.slice(0, 5)}` : ""}`;
};

const getPersonName = (registry: PeopleRegistryDataset, personId: string) => {
  const person = registry.people.find((candidate) => candidate.id === personId);
  return person?.preferredName
    ? `${person.fullName} (${person.preferredName})`
    : person?.fullName ?? "Pessoa não localizada";
};

const getProfessionalName = (territory: HealthTerritoryDataset, id: string) =>
  territory.professionals.find((professional) => professional.id === id)?.name ??
  "Profissional não localizado";

const getTeamName = (territory: HealthTerritoryDataset, id: string) =>
  territory.teams.find((team) => team.id === id)?.name ?? "Equipe não localizada";

const getUnitName = (territory: HealthTerritoryDataset, id: string) =>
  territory.units.find((unit) => unit.id === id)?.name ?? "Unidade não localizada";

const getStatusTone = (status: HealthReferralStatus) => {
  if (status === "Aguardando vaga" || status === "Devolvido à origem") {
    return "attention";
  }
  if (status === "Em análise") return "analysis";
  if (status === "Vaga ofertada" || status === "Agendado") return "scheduled";
  if (status === "Realizado") return "complete";
  return "cancelled";
};

const getPriorityTone = (priority: HealthReferralPriority) =>
  priority === "Urgente"
    ? "urgent"
    : priority === "Preferencial"
      ? "preferred"
      : "routine";

const getNextStep = (referral: HealthReferralRecord) => {
  switch (referral.status) {
    case "Em análise":
      return "Conferir dados do pedido e classificar para a fila adequada.";
    case "Aguardando vaga":
      return "Acompanhar a fila regional e revisar o tempo de espera.";
    case "Vaga ofertada":
      return "Confirmar disponibilidade com a pessoa e registrar o aceite.";
    case "Agendado":
      return `Confirmar presença na data ${formatDate(referral.appointmentAt)}.`;
    case "Realizado":
      return "Conferir retorno do serviço especializado junto à unidade de origem.";
    case "Devolvido à origem":
      return "Avaliar a pendência indicada e complementar o encaminhamento se necessário.";
    case "Cancelado":
      return "Consultar o histórico; o registro cancelado permanece para rastreabilidade.";
  }
};

const isActiveReferral = (status: HealthReferralStatus) =>
  ["Em análise", "Aguardando vaga", "Vaga ofertada", "Agendado"].includes(
    status,
  );

export default function HealthReferralRegulationModule({
  mode,
  dataset,
  healthActivities,
  peopleRegistry,
  healthTerritory,
  onChange,
  initialServiceRecordId,
  onBack,
}: HealthReferralRegulationModuleProps) {
  const [view, setView] = useState<ModuleView>(
    initialServiceRecordId ? "create" : "queue",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HealthReferralStatus | "Todas">(
    "Todas",
  );
  const [priorityFilter, setPriorityFilter] = useState<HealthReferralPriority | "Todas">(
    "Todas",
  );
  const [specialtyFilter, setSpecialtyFilter] = useState("Todas");
  const [destinationFilter, setDestinationFilter] = useState("Todas");
  const [longWaitOnly, setLongWaitOnly] = useState(false);
  const [sourceServiceId, setSourceServiceId] = useState(
    initialServiceRecordId ?? "",
  );
  const [draftPersonId, setDraftPersonId] = useState("");
  const [createError, setCreateError] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [draftDate, setDraftDate] = useState(localDate());
  const [draftProfessionalId, setDraftProfessionalId] = useState(
    healthTerritory.professionals.find((professional) => professional.active)?.id ??
      "",
  );

  const applyQueueFilter = (
    status: HealthReferralStatus | "Todas",
    over60Days = false,
  ) => {
    setSearch("");
    setStatusFilter(status);
    setPriorityFilter("Todas");
    setSpecialtyFilter("Todas");
    setDestinationFilter("Todas");
    setLongWaitOnly(over60Days);
  };

  const today = localDate();
  const summary = useMemo(
    () => getHealthReferralSummary(dataset.referrals, today),
    [dataset.referrals, today],
  );
  const selectedReferral = dataset.referrals.find(
    (referral) => referral.id === selectedId,
  );
  const sourceServices = healthActivities.serviceRecords.filter(
    (service) => service.status === "Realizado",
  );
  const selectedSourceService = sourceServices.find(
    (service) => service.id === sourceServiceId,
  );
  const selectedSourcePersonId = selectedSourceService?.personId;
  const availableProfessionals = healthTerritory.professionals.filter(
    (professional) => professional.active,
  );
  const selectedProfessional = availableProfessionals.find(
    (professional) => professional.id === draftProfessionalId,
  );
  const selectedTeam = healthTerritory.teams.find(
    (team) => team.id === selectedProfessional?.teamId,
  );
  const visibleReferrals = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return dataset.referrals
      .filter((referral) => {
        if (statusFilter !== "Todas" && referral.status !== statusFilter) {
          return false;
        }
        if (priorityFilter !== "Todas" && referral.priority !== priorityFilter) {
          return false;
        }
        if (
          specialtyFilter !== "Todas" &&
          referral.specialty !== specialtyFilter
        ) {
          return false;
        }
        if (
          destinationFilter !== "Todas" &&
          referral.destination !== destinationFilter
        ) {
          return false;
        }
        if (
          longWaitOnly &&
          (referral.status !== "Aguardando vaga" ||
            getHealthReferralWaitDays(referral, today) <= 60)
        ) {
          return false;
        }
        if (!query) return true;
        return [
          referral.id,
          referral.specialty,
          referral.destination,
          getPersonName(peopleRegistry, referral.personId),
          getUnitName(healthTerritory, referral.unitId),
          getTeamName(healthTerritory, referral.teamId),
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(query);
      })
      .sort((a, b) => {
        const statusRank = (status: HealthReferralStatus) =>
          status === "Aguardando vaga"
            ? 0
            : status === "Em análise"
              ? 1
              : status === "Vaga ofertada"
                ? 2
                : status === "Agendado"
                  ? 3
                  : 4;
        const rankDifference = statusRank(a.status) - statusRank(b.status);
        if (rankDifference !== 0) return rankDifference;
        if (isActiveReferral(a.status) && isActiveReferral(b.status)) {
          return (
            getHealthReferralWaitDays(b, today) -
            getHealthReferralWaitDays(a, today)
          );
        }
        return b.referredAt.localeCompare(a.referredAt);
      });
  }, [
    dataset.referrals,
    destinationFilter,
    healthTerritory,
    longWaitOnly,
    peopleRegistry,
    priorityFilter,
    search,
    specialtyFilter,
    statusFilter,
    today,
  ]);

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView("detail");
    setUpdateError("");
    setSuccessMessage("");
  };

  const returnToQueue = () => {
    setSelectedId(null);
    setView("queue");
    setUpdateError("");
    setSuccessMessage("");
  };

  const createReferral = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const serviceRecordId = String(values.get("serviceRecordId") ?? "");
    const source = sourceServices.find((service) => service.id === serviceRecordId);
    const personId = source?.personId ?? String(values.get("personId") ?? "").trim();
    const professionalId =
      source?.professionalId ?? String(values.get("professionalId") ?? "").trim();
    const professional = healthTerritory.professionals.find(
      (candidate) => candidate.id === professionalId && candidate.active,
    );
    const team = healthTerritory.teams.find(
      (candidate) => candidate.id === (source?.teamId ?? professional?.teamId),
    );
    const unitId = source?.unitId ?? professional?.unitId;
    const specialty = String(values.get("specialty") ?? "").trim();
    const justification = String(values.get("justification") ?? "").trim();
    const priority = String(values.get("priority") ?? "Rotina") as HealthReferralPriority;
    const referredAt = String(values.get("referredAt") ?? "").trim();
    const destination = String(values.get("destination") ?? "").trim();
    const missing =
      !personId ||
      !professionalId ||
      !team ||
      !unitId ||
      !specialty ||
      !justification ||
      !referredAt ||
      !destination;
    if (missing) {
      setCreateError(
        "Complete os campos obrigatórios e selecione uma pessoa e um profissional cadastrados.",
      );
      return;
    }
    if (!peopleRegistry.people.some((person) => person.id === personId)) {
      setCreateError("A pessoa escolhida não foi encontrada no cadastro demonstrativo.");
      return;
    }
    if (serviceRecordId && !source) {
      setCreateError("O atendimento de origem não foi localizado ou não está realizado.");
      return;
    }

    const id = nextHealthReferralId(dataset.referrals);
    const now = new Date().toISOString();
    const newReferral: HealthReferralRecord = {
      id,
      personId,
      serviceRecordId: source?.id,
      professionalId,
      teamId: team.id,
      unitId,
      specialty,
      justification,
      priority,
      referredAt,
      destination,
      status: "Em análise",
      history: [
        {
          id: `${id}-H01`,
          at: now,
          actor: mode === "secretary" ? "Secretaria de Saúde" : "Profissional da UBS",
          action: "Encaminhamento registrado",
          toStatus: "Em análise",
          note: "Pedido encaminhado para conferência da regulação nesta demonstração fictícia.",
        },
      ],
    };
    onChange((current) => ({
      ...current,
      referrals: [newReferral, ...current.referrals],
    }));
    setCreateError("");
    setSuccessMessage(`Encaminhamento ${id} registrado nesta sessão.`);
    setSelectedId(id);
    setView("detail");
    form.reset();
    setSourceServiceId("");
    setDraftPersonId("");
    setDraftDate(localDate());
  };

  const updateReferral = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedReferral) return;
    const values = new FormData(event.currentTarget);
    const status = String(values.get("status") ?? selectedReferral.status) as HealthReferralStatus;
    const offeredAt = String(values.get("offeredAt") ?? "").trim();
    const appointmentAt = String(values.get("appointmentAt") ?? "").trim();
    const outcome = String(values.get("outcome") ?? "").trim();
    const note = String(values.get("note") ?? "").trim();
    if (status === "Vaga ofertada" && !offeredAt) {
      setUpdateError("Informe a data da oferta de vaga para continuar.");
      return;
    }
    if (status === "Agendado" && !appointmentAt) {
      setUpdateError("Informe a data do atendimento agendado para continuar.");
      return;
    }
    if (status === "Realizado" && !outcome) {
      setUpdateError("Descreva o desfecho recebido do serviço especializado.");
      return;
    }
    if (
      (status === "Devolvido à origem" || status === "Cancelado") &&
      !note
    ) {
      setUpdateError("Registre a justificativa para devolução ou cancelamento.");
      return;
    }
    if (
      status === selectedReferral.status &&
      !offeredAt &&
      !appointmentAt &&
      !outcome &&
      !note
    ) {
      setUpdateError("Informe uma mudança ou uma nota para registrar no histórico.");
      return;
    }

    const now = new Date().toISOString();
    const historyEvent = {
      id: `${selectedReferral.id}-H${String(selectedReferral.history.length + 1).padStart(2, "0")}`,
      at: now,
      actor: mode === "secretary" ? "Regulação da Secretaria de Saúde" : "Profissional da UBS",
      action:
        status !== selectedReferral.status
          ? "Situação atualizada"
          : "Acompanhamento atualizado",
      fromStatus:
        status !== selectedReferral.status ? selectedReferral.status : undefined,
      toStatus: status,
      note:
        note ||
        outcome ||
        (appointmentAt
          ? `Data de atendimento registrada: ${formatDate(appointmentAt)}.`
          : offeredAt
            ? `Oferta registrada em ${formatDate(offeredAt)}.`
            : "Atualização demonstrativa registrada."),
    };
    onChange((current) => ({
      ...current,
      referrals: current.referrals.map((referral) =>
        referral.id === selectedReferral.id
          ? {
              ...referral,
              status,
              offeredAt: offeredAt || referral.offeredAt,
              appointmentAt: appointmentAt || referral.appointmentAt,
              completedAt:
                status === "Realizado"
                  ? localDate()
                  : referral.completedAt,
              outcome: outcome || referral.outcome,
              history: [...referral.history, historyEvent],
            }
          : referral,
      ),
    }));
    setUpdateError("");
    setSuccessMessage("Acompanhamento atualizado e acrescentado ao histórico.");
    event.currentTarget.reset();
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("Todas");
    setPriorityFilter("Todas");
    setSpecialtyFilter("Todas");
    setDestinationFilter("Todas");
    setLongWaitOnly(false);
  };

  return (
    <section className="health-referrals-module">
      <header className="health-referrals-header">
        <div>
          <span className="health-referrals-eyebrow">
            SAÚDE · FILA CLÍNICA · DADOS FICTÍCIOS
          </span>
          <h2>Encaminhamentos e Regulação</h2>
          <p>
            Acompanhe o pedido desde o atendimento de origem até a oferta, o
            agendamento e o retorno à unidade. Esta fila é clínica e não altera
            solicitações administrativas.
          </p>
        </div>
        <div className="health-referrals-header-actions">
          {onBack && (
            <button className="health-referrals-back" onClick={onBack}>
              <ArrowLeft size={15} /> Voltar
            </button>
          )}
          {view !== "create" && (
            <button
              className="health-referrals-primary"
              onClick={() => {
                setSuccessMessage("");
                setCreateError("");
                setView("create");
                setSelectedId(null);
                setSourceServiceId("");
                setDraftPersonId("");
              }}
            >
              <FilePlus2 size={16} /> Novo encaminhamento
            </button>
          )}
        </div>
      </header>

      <div className="health-referrals-demo-note">
        <Check size={16} />
        <p>
          Registros, pessoas e destinos são sintéticos. Alterações ficam somente
          nesta sessão e não são enviadas à regulação regional nem a sistemas
          oficiais.
        </p>
      </div>

      {successMessage && (
        <div className="health-referrals-success" role="status">
          <Check size={15} /> {successMessage}
        </div>
      )}

      {view === "create" ? (
        <section className="health-referral-form-view">
          <div className="health-referral-section-heading">
            <div>
              <span>REGISTRO CLÍNICO DE ORIGEM</span>
              <h3>Novo encaminhamento</h3>
              <p>
                Selecione um atendimento já realizado para trazer pessoa,
                profissional, equipe e unidade automaticamente. Sem atendimento
                relacionado, escolha as referências existentes manualmente.
              </p>
            </div>
          </div>
          <form className="health-referral-form" onSubmit={createReferral}>
            <label className="health-referral-field health-referral-field-wide">
              Atendimento realizado de origem (opcional)
              <select
                name="serviceRecordId"
                value={sourceServiceId}
                onChange={(event) => setSourceServiceId(event.target.value)}
              >
                <option value="">Registrar sem vínculo direto a atendimento</option>
                {sourceServices.map((service) => (
                  <option value={service.id} key={service.id}>
                    {service.id} · {getPersonName(peopleRegistry, service.personId)} · {service.serviceType} · {formatDate(service.date)}
                  </option>
                ))}
              </select>
            </label>
            {selectedSourceService && (
              <div className="health-referral-linked-source">
                <Stethoscope size={16} />
                <span>
                  Origem selecionada: <strong>{selectedSourceService.id}</strong>
                  {" · "}{selectedSourceService.serviceType}{" · "}
                  {getUnitName(healthTerritory, selectedSourceService.unitId)}
                </span>
              </div>
            )}
            <label className="health-referral-field">
              Pessoa cadastrada <span>*</span>
              <select
                name="personId"
                value={selectedSourcePersonId ?? draftPersonId}
                onChange={(event) => setDraftPersonId(event.target.value)}
                disabled={Boolean(selectedSourcePersonId)}
                required={!selectedSourcePersonId}
              >
                <option value="" disabled>
                  Selecione uma pessoa
                </option>
                {peopleRegistry.people
                  .filter((person) => person.status === "Ativa")
                  .map((person) => (
                    <option value={person.id} key={person.id}>
                      {person.fullName} · {person.id}
                    </option>
                  ))}
              </select>
              {selectedSourcePersonId && (
                <small>A pessoa vem do atendimento de origem e não será duplicada.</small>
              )}
            </label>
            <label className="health-referral-field">
              Profissional solicitante <span>*</span>
              <select
                name="professionalId"
                value={selectedSourceService?.professionalId ?? draftProfessionalId}
                onChange={(event) => setDraftProfessionalId(event.target.value)}
                disabled={Boolean(selectedSourceService)}
                required
              >
                {availableProfessionals.map((professional) => (
                  <option value={professional.id} key={professional.id}>
                    {professional.name} · {professional.category}
                  </option>
                ))}
              </select>
            </label>
            <div className="health-referral-reference-line">
              <UsersRound size={15} />
              <span>
                Equipe: <strong>{selectedSourceService ? getTeamName(healthTerritory, selectedSourceService.teamId) : selectedTeam?.name ?? "Selecione um profissional"}</strong>
                {" · Unidade: "}
                <strong>{selectedSourceService ? getUnitName(healthTerritory, selectedSourceService.unitId) : selectedProfessional ? getUnitName(healthTerritory, selectedProfessional.unitId) : "—"}</strong>
              </span>
            </div>
            <label className="health-referral-field">
              Especialidade ou serviço solicitado <span>*</span>
              <select name="specialty" defaultValue="" required>
                <option value="" disabled>
                  Selecione a especialidade
                </option>
                {specialties.map((specialty) => (
                  <option value={specialty} key={specialty}>
                    {specialty}
                  </option>
                ))}
              </select>
            </label>
            <label className="health-referral-field">
              Prioridade declarada <span>*</span>
              <select name="priority" defaultValue="Rotina" required>
                {priorities.map((priority) => (
                  <option value={priority} key={priority}>
                    {priority}
                  </option>
                ))}
              </select>
              <small>A prioridade é informação demonstrativa definida na origem.</small>
            </label>
            <label className="health-referral-field health-referral-field-wide">
              Justificativa do encaminhamento <span>*</span>
              <textarea
                name="justification"
                rows={3}
                maxLength={500}
                placeholder="Resuma a necessidade registrada no atendimento, sem repetir o cadastro da pessoa."
                required
              />
            </label>
            <label className="health-referral-field">
              Data do encaminhamento <span>*</span>
              <input
                name="referredAt"
                type="date"
                value={draftDate}
                onChange={(event) => setDraftDate(event.target.value)}
                required
              />
            </label>
            <label className="health-referral-field">
              Destino ou referência reguladora <span>*</span>
              <select name="destination" defaultValue="" required>
                <option value="" disabled>
                  Selecione um destino demonstrativo
                </option>
                {destinations.map((destination) => (
                  <option value={destination} key={destination}>
                    {destination}
                  </option>
                ))}
              </select>
            </label>
            {createError && (
              <p className="health-referral-error" role="alert">
                {createError}
              </p>
            )}
            <div className="health-referral-form-actions">
              <button
                type="button"
                className="health-referral-secondary"
                onClick={() => {
                  setCreateError("");
                  setView("queue");
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="health-referrals-primary">
                <Check size={15} /> Registrar para análise
              </button>
            </div>
          </form>
        </section>
      ) : view === "detail" && selectedReferral ? (
        <ReferralDetail
          key={`${selectedReferral.id}-${selectedReferral.history.length}`}
          referral={selectedReferral}
          mode={mode}
          peopleRegistry={peopleRegistry}
          healthTerritory={healthTerritory}
          onBack={returnToQueue}
          onSubmit={updateReferral}
          updateError={updateError}
        />
      ) : (
        <>
          <div className="health-referral-metric-grid">
            <button
              className="health-referral-metric"
              onClick={() => applyQueueFilter("Todas")}
            >
              <span>Encaminhamentos cadastrados</span>
              <strong>{summary.total}</strong>
              <small>eventos clínicos demonstrativos</small>
            </button>
            <button
              className="health-referral-metric metric-attention"
              onClick={() => applyQueueFilter("Aguardando vaga")}
            >
              <span>Aguardando vaga</span>
              <strong>{summary.waiting}</strong>
              <small>contados na fila clínica</small>
            </button>
            <button
              className="health-referral-metric metric-overdue"
              onClick={() => applyQueueFilter("Aguardando vaga", true)}
            >
              <span>Mais de 60 dias</span>
              <strong>{summary.waitingOver60Days}</strong>
              <small>tempo calculado desde o encaminhamento</small>
            </button>
            <button
              className="health-referral-metric metric-scheduled"
              onClick={() => applyQueueFilter("Vaga ofertada")}
            >
              <span>Vagas ofertadas</span>
              <strong>{summary.offered} / {summary.scheduled}</strong>
              <small>ofertadas / atendimentos agendados</small>
            </button>
          </div>

          <div className="health-referral-queue-heading">
            <div>
              <span className="health-referrals-eyebrow">FILA DE REGULAÇÃO</span>
              <h3>Encaminhamentos clínicos</h3>
              <p>
                Os mais antigos aparecem primeiro dentro de cada etapa ativa.
                Abra um registro para acompanhar a oferta e atualizar o histórico.
              </p>
            </div>
            <span className="health-referral-result-count">
              {visibleReferrals.length} de {dataset.referrals.length} registros
            </span>
          </div>

          <div className="health-referral-filters">
            <label className="health-referral-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar pessoa, protocolo, especialidade ou destino"
                aria-label="Buscar encaminhamentos"
              />
            </label>
            <label>
              <Filter size={14} />
              <select
                aria-label="Filtrar por situação"
                value={statusFilter}
                onChange={(event) => {
                  setLongWaitOnly(false);
                  setStatusFilter(event.target.value as HealthReferralStatus | "Todas");
                }}
              >
                <option value="Todas">Todas as situações</option>
                {healthReferralStatuses.map((status) => (
                  <option value={status} key={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <select
                aria-label="Filtrar por prioridade"
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(event.target.value as HealthReferralPriority | "Todas")
                }
              >
                <option value="Todas">Todas as prioridades</option>
                {priorities.map((priority) => (
                  <option value={priority} key={priority}>
                    {priority}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <select
                aria-label="Filtrar por especialidade"
                value={specialtyFilter}
                onChange={(event) => setSpecialtyFilter(event.target.value)}
              >
                <option value="Todas">Todas as especialidades</option>
                {specialties.map((specialty) => (
                  <option value={specialty} key={specialty}>
                    {specialty}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <select
                aria-label="Filtrar por destino regulador"
                value={destinationFilter}
                onChange={(event) => setDestinationFilter(event.target.value)}
              >
                <option value="Todas">Todos os destinos</option>
                {destinations.map((destination) => (
                  <option value={destination} key={destination}>
                    {destination}
                  </option>
                ))}
              </select>
            </label>
            {(search || statusFilter !== "Todas" || priorityFilter !== "Todas" || specialtyFilter !== "Todas" || destinationFilter !== "Todas" || longWaitOnly) && (
              <button className="health-referral-clear" onClick={clearFilters}>
                Limpar filtros
              </button>
            )}
          </div>

          <div className="health-referral-list">
            {visibleReferrals.length ? (
              visibleReferrals.map((referral) => {
                const person = getPersonName(peopleRegistry, referral.personId);
                const waitDays = getHealthReferralWaitDays(referral, today);
                return (
                  <article className="health-referral-row" key={referral.id}>
                    <div className="health-referral-row-main">
                      <div className="health-referral-row-heading">
                        <strong>{person}</strong>
                        <span className={`health-referral-status status-${getStatusTone(referral.status)}`}>
                          {referral.status}
                        </span>
                      </div>
                      <div className="health-referral-row-meta">
                        <span>{referral.id}</span>
                        <span>{referral.specialty}</span>
                        <span>{referral.priority}</span>
                      </div>
                      <div className="health-referral-row-origin">
                        <span><UsersRound size={13} /> {getTeamName(healthTerritory, referral.teamId)}</span>
                        <span><MapPin size={13} /> {getUnitName(healthTerritory, referral.unitId)}</span>
                        {referral.serviceRecordId && <span><Stethoscope size={13} /> Origem {referral.serviceRecordId}</span>}
                      </div>
                    </div>
                    <div className="health-referral-row-age">
                      <span>Encaminhado em {formatDate(referral.referredAt)}</span>
                      <strong className={referral.status === "Aguardando vaga" && waitDays > 60 ? "wait-critical" : ""}>
                        {isActiveReferral(referral.status) ? `${waitDays} dias` : referral.status === "Realizado" ? `Realizado ${formatDate(referral.completedAt)}` : referral.status}
                      </strong>
                      <small>{referral.destination}</small>
                    </div>
                    <button
                      className="health-referral-open"
                      onClick={() => openDetail(referral.id)}
                      aria-label={`Abrir encaminhamento ${referral.id}`}
                    >
                      Abrir <ArrowRight size={14} />
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="health-referral-empty">
                <Search size={20} />
                <strong>Nenhum encaminhamento encontrado</strong>
                <p>Revise a busca e os filtros ou registre um novo encaminhamento fictício.</p>
                <button
                  className="health-referrals-primary"
                  onClick={() => {
                    setView("create");
                    setCreateError("");
                  }}
                >
                  <FilePlus2 size={15} /> Novo encaminhamento
                </button>
              </div>
            )}
          </div>
          <footer className="health-referrals-footer">
            <Clock3 size={14} /> O tempo de espera é uma diferença de calendário calculada a partir da data do encaminhamento; não representa posição oficial de fila.
          </footer>
        </>
      )}
    </section>
  );
}

function ReferralDetail({
  referral,
  mode,
  peopleRegistry,
  healthTerritory,
  onBack,
  onSubmit,
  updateError,
}: {
  referral: HealthReferralRecord;
  mode: ModuleMode;
  peopleRegistry: PeopleRegistryDataset;
  healthTerritory: HealthTerritoryDataset;
  onBack: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  updateError: string;
}) {
  return (
    <section className="health-referral-detail-view">
      <button className="health-referral-back" onClick={onBack}>
        <ArrowLeft size={15} /> Voltar à fila
      </button>
      <div className="health-referral-detail-heading">
        <div>
          <span className="health-referrals-eyebrow">ENCAMINHAMENTO · {referral.id}</span>
          <h3>{referral.specialty}</h3>
          <p>{getPersonName(peopleRegistry, referral.personId)}</p>
        </div>
        <div className="health-referral-detail-badges">
          <span className={`health-referral-status status-${getStatusTone(referral.status)}`}>
            {referral.status}
          </span>
          <span className={`health-referral-priority priority-${getPriorityTone(referral.priority)}`}>
            {referral.priority}
          </span>
        </div>
      </div>
      <div className="health-referral-detail-grid">
        <article>
          <span>Data e tempo desde o encaminhamento</span>
          <strong>{formatDate(referral.referredAt)} · {getHealthReferralWaitDays(referral)} dias</strong>
        </article>
        <article>
          <span>Profissional solicitante</span>
          <strong>{getProfessionalName(healthTerritory, referral.professionalId)}</strong>
        </article>
        <article>
          <span>Equipe e unidade de origem</span>
          <strong>{getTeamName(healthTerritory, referral.teamId)}</strong>
          <small>{getUnitName(healthTerritory, referral.unitId)}</small>
        </article>
        <article>
          <span>Destino regulador</span>
          <strong>{referral.destination}</strong>
        </article>
        <article className="health-referral-detail-wide">
          <span>Justificativa registrada</span>
          <p>{referral.justification}</p>
        </article>
        {referral.serviceRecordId && (
          <article>
            <span>Atendimento de origem</span>
            <strong>{referral.serviceRecordId}</strong>
          </article>
        )}
        {referral.offeredAt && (
          <article>
            <span>Oferta de vaga</span>
            <strong>{formatDate(referral.offeredAt)}</strong>
          </article>
        )}
        {referral.appointmentAt && (
          <article>
            <span>Atendimento especializado</span>
            <strong>{formatDate(referral.appointmentAt)}</strong>
          </article>
        )}
        {referral.outcome && (
          <article className="health-referral-detail-wide">
            <span>Retorno do serviço especializado</span>
            <p>{referral.outcome}</p>
          </article>
        )}
      </div>

      <div className="health-referral-update-layout">
        <form className="health-referral-update-form" onSubmit={onSubmit}>
          <div className="health-referral-section-heading">
            <div>
              <span>ATUALIZAÇÃO · SOMENTE NESTA SESSÃO</span>
              <h4>Registrar etapa da regulação</h4>
            </div>
            <ChevronDown size={17} />
          </div>
          <label className="health-referral-field">
            Nova situação <span>*</span>
            <select name="status" defaultValue={referral.status} required>
              {healthReferralStatuses.map((status) => (
                <option value={status} key={status}>{status}</option>
              ))}
            </select>
          </label>
          <div className="health-referral-update-grid">
            <label className="health-referral-field">
              Data da oferta (quando houver)
              <input name="offeredAt" type="date" defaultValue={referral.offeredAt ?? ""} />
            </label>
            <label className="health-referral-field">
              Data agendada (quando houver)
              <input name="appointmentAt" type="date" defaultValue={referral.appointmentAt ?? ""} />
            </label>
          </div>
          <label className="health-referral-field">
            Desfecho do serviço especializado
            <textarea name="outcome" rows={2} maxLength={500} defaultValue={referral.outcome ?? ""} placeholder="Obrigatório ao marcar como realizado" />
          </label>
          <label className="health-referral-field">
            Nota ou justificativa da atualização
            <textarea name="note" rows={2} maxLength={500} placeholder="Obrigatória ao devolver à origem ou cancelar" />
          </label>
          {updateError && <p className="health-referral-error" role="alert">{updateError}</p>}
          <button type="submit" className="health-referrals-primary">
            <Check size={15} /> Registrar mudança e preservar histórico
          </button>
          <small className="health-referral-actor-note">
            Responsável demonstrativo: {mode === "secretary" ? "Regulação da Secretaria de Saúde" : "Profissional da UBS"}.
          </small>
        </form>

        <aside className="health-referral-next-step">
          <CalendarDays size={18} />
          <span>PRÓXIMA PROVIDÊNCIA</span>
          <p>{getNextStep(referral)}</p>
          {referral.serviceRecordId && (
            <small>Registro de origem relacionado: {referral.serviceRecordId}</small>
          )}
        </aside>
      </div>

      <section className="health-referral-history">
        <div className="health-referral-section-heading">
          <div>
            <span>TRILHA CRONOLÓGICA</span>
            <h4>Histórico do encaminhamento</h4>
          </div>
          <History size={18} />
        </div>
        <ol>
          {[...referral.history].reverse().map((event) => (
            <li key={event.id}>
              <span className="health-referral-history-dot" />
              <div>
                <strong>{event.action}</strong>
                <p>{event.note}</p>
                <small>
                  {formatHistoryDate(event.at)} · {event.actor}
                  {event.fromStatus && event.fromStatus !== event.toStatus
                    ? ` · ${event.fromStatus} → ${event.toStatus}`
                    : ` · ${event.toStatus}`}
                </small>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </section>
  );
}
