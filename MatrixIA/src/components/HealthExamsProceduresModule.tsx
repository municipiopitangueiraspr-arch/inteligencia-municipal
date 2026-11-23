import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Beaker,
  CalendarDays,
  Check,
  ClipboardPlus,
  Clock3,
  FileCheck2,
  Filter,
  FlaskConical,
  History,
  MapPin,
  Search,
  Stethoscope,
  UserRound,
} from "lucide-react";
import type { HealthActivitiesDataset } from "../data/healthActivities";
import {
  getHealthDiagnosticSummary,
  getHealthDiagnosticWaitDays,
  healthDiagnosticDestinations,
  healthDiagnosticKinds,
  healthDiagnosticStatuses,
  healthDiagnosticSuggestions,
  nextHealthDiagnosticId,
  type HealthDiagnosticHistoryEvent,
  type HealthDiagnosticPriority,
  type HealthDiagnosticRecord,
  type HealthDiagnosticsDataset,
  type HealthDiagnosticStatus,
} from "../data/healthDiagnostics";
import type { HealthReferralsDataset } from "../data/healthReferrals";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";
import "./HealthExamsProceduresModule.css";

type ModuleMode = "secretary" | "operator";
type ModuleView = "queue" | "create" | "detail";

type HealthExamsProceduresModuleProps = {
  mode: ModuleMode;
  dataset: HealthDiagnosticsDataset;
  healthActivities: HealthActivitiesDataset;
  healthReferrals: HealthReferralsDataset;
  peopleRegistry: PeopleRegistryDataset;
  healthTerritory: HealthTerritoryDataset;
  onChange: (
    update: (current: HealthDiagnosticsDataset) => HealthDiagnosticsDataset,
  ) => void;
  initialServiceRecordId?: string;
  initialReferralId?: string;
  onBack?: () => void;
};

type DraftRequest = {
  personId: string;
  serviceRecordId: string;
  referralId: string;
  professionalId: string;
  kind: (typeof healthDiagnosticKinds)[number];
  serviceName: string;
  justification: string;
  priority: HealthDiagnosticPriority;
  requestedAt: string;
  destination: string;
  observation: string;
};

const transitions: Record<HealthDiagnosticStatus, HealthDiagnosticStatus[]> = {
  Solicitado: ["Agendado", "Em execução", "Cancelado"],
  Agendado: ["Em execução", "Realizado", "Cancelado"],
  "Em execução": ["Realizado", "Cancelado"],
  Realizado: ["Resultado disponível"],
  "Resultado disponível": ["Revisado"],
  Revisado: [],
  Cancelado: [],
};

const localDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const formatDate = (value?: string) => {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

const formatDateTime = (value: string) => {
  const [date, time] = value.split("T");
  return `${formatDate(date)}${time ? ` · ${time.slice(0, 5)}` : ""}`;
};

const statusTone = (status: HealthDiagnosticStatus) => {
  if (status === "Cancelado") return "cancelled";
  if (status === "Revisado" || status === "Resultado disponível" || status === "Realizado") return "complete";
  if (status === "Agendado") return "scheduled";
  if (status === "Em execução") return "progress";
  return "requested";
};

const priorityTone = (priority: HealthDiagnosticPriority) =>
  priority === "Urgente" ? "urgent" : priority === "Preferencial" ? "preferred" : "routine";

const getPersonName = (registry: PeopleRegistryDataset, personId: string) => {
  const person = registry.people.find((candidate) => candidate.id === personId);
  return person?.preferredName
    ? `${person.fullName} (${person.preferredName})`
    : person?.fullName ?? "Pessoa não localizada";
};

const getProfessionalName = (territory: HealthTerritoryDataset, id: string) =>
  territory.professionals.find((professional) => professional.id === id)?.name ?? "Profissional não localizado";

const getTeamName = (territory: HealthTerritoryDataset, id: string) =>
  territory.teams.find((team) => team.id === id)?.name ?? "Equipe não localizada";

const getUnitName = (territory: HealthTerritoryDataset, id: string) =>
  territory.units.find((unit) => unit.id === id)?.name ?? "Unidade não localizada";

const getServiceRecord = (healthActivities: HealthActivitiesDataset, id?: string) =>
  healthActivities.serviceRecords.find((record) => record.id === id);

const getReferral = (healthReferrals: HealthReferralsDataset, id?: string) =>
  healthReferrals.referrals.find((record) => record.id === id);

const getNextStep = (request: HealthDiagnosticRecord) => {
  if (request.status === "Solicitado") return "Confirmar recebimento e reservar data com o serviço executor.";
  if (request.status === "Agendado") return `Acompanhar a realização prevista para ${formatDate(request.scheduledAt)}.`;
  if (request.status === "Em execução") return "Aguardar conclusão da coleta ou do procedimento e atualização do registro.";
  if (request.status === "Realizado") return "Aguardar disponibilização do resultado ou laudo.";
  if (request.status === "Resultado disponível") return "Profissional solicitante deve conferir o resultado e registrar o próximo passo.";
  if (request.status === "Revisado") return "Resultado revisado; consultar o histórico e o atendimento de origem.";
  return "Pedido cancelado; a justificativa permanece no histórico.";
};

const statusAction: Record<HealthDiagnosticStatus, string> = {
  Solicitado: "Pedido registrado",
  Agendado: "Exame/procedimento agendado",
  "Em execução": "Execução iniciada",
  Realizado: "Coleta ou procedimento realizado",
  "Resultado disponível": "Resultado disponibilizado",
  Revisado: "Resultado revisado",
  Cancelado: "Pedido cancelado",
};

function createInitialDraft(
  healthActivities: HealthActivitiesDataset,
  healthReferrals: HealthReferralsDataset,
  peopleRegistry: PeopleRegistryDataset,
  initialServiceRecordId?: string,
  initialReferralId?: string,
): DraftRequest {
  const referral = getReferral(healthReferrals, initialReferralId);
  const serviceRecord = getServiceRecord(
    healthActivities,
    referral?.serviceRecordId ?? initialServiceRecordId,
  );
  const professional = referral?.professionalId ?? serviceRecord?.professionalId ?? "";
  const personId = referral?.personId ?? serviceRecord?.personId ?? peopleRegistry.people.find((person) => person.status === "Ativa")?.id ?? "";
  return {
    personId,
    serviceRecordId: referral?.serviceRecordId ?? initialServiceRecordId ?? "",
    referralId: referral?.id ?? "",
    professionalId: professional,
    kind: "Exame laboratorial",
    serviceName: "",
    justification: "",
    priority: "Rotina",
    requestedAt: localDate(),
    destination: healthDiagnosticDestinations[0],
    observation: "",
  };
}

export default function HealthExamsProceduresModule({
  mode,
  dataset,
  healthActivities,
  healthReferrals,
  peopleRegistry,
  healthTerritory,
  onChange,
  initialServiceRecordId,
  initialReferralId,
  onBack,
}: HealthExamsProceduresModuleProps) {
  const [view, setView] = useState<ModuleView>(
    initialServiceRecordId || initialReferralId ? "create" : "queue",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HealthDiagnosticStatus | "Todas">("Todas");
  const [kindFilter, setKindFilter] = useState("Todas");
  const [priorityFilter, setPriorityFilter] = useState<HealthDiagnosticPriority | "Todas">("Todas");
  const [destinationFilter, setDestinationFilter] = useState("Todas");
  const [draft, setDraft] = useState<DraftRequest>(() =>
    createInitialDraft(healthActivities, healthReferrals, peopleRegistry, initialServiceRecordId, initialReferralId),
  );
  const [createError, setCreateError] = useState("");
  const [success, setSuccess] = useState("");
  const [nextStatus, setNextStatus] = useState<HealthDiagnosticStatus | "">("");
  const [stageDate, setStageDate] = useState(localDate());
  const [resultDraft, setResultDraft] = useState("");
  const [updateNote, setUpdateNote] = useState("");
  const [updateError, setUpdateError] = useState("");

  const summary = useMemo(() => getHealthDiagnosticSummary(dataset.requests), [dataset.requests]);
  const selectedRequest = dataset.requests.find((request) => request.id === selectedId);
  const filteredRequests = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("pt-BR");
    return [...dataset.requests]
      .filter((request) => {
        const service = getServiceRecord(healthActivities, request.serviceRecordId);
        const referral = getReferral(healthReferrals, request.referralId);
        const searchable = [
          request.id,
          getPersonName(peopleRegistry, request.personId),
          request.serviceName,
          request.kind,
          request.destination,
          service?.id,
          referral?.id,
          request.justification,
        ].join(" ").toLocaleLowerCase("pt-BR");
        return (!needle || searchable.includes(needle)) &&
          (statusFilter === "Todas" || request.status === statusFilter) &&
          (kindFilter === "Todas" || request.kind === kindFilter) &&
          (priorityFilter === "Todas" || request.priority === priorityFilter) &&
          (destinationFilter === "Todas" || request.destination === destinationFilter);
      })
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt) || b.id.localeCompare(a.id));
  }, [dataset.requests, destinationFilter, healthActivities, healthReferrals, kindFilter, peopleRegistry, priorityFilter, search, statusFilter]);

  const openCreate = (source?: { serviceRecordId?: string; referralId?: string }) => {
    setDraft(createInitialDraft(
      healthActivities,
      healthReferrals,
      peopleRegistry,
      source?.serviceRecordId,
      source?.referralId,
    ));
    setCreateError("");
    setSuccess("");
    setView("create");
  };

  const openDetail = (request: HealthDiagnosticRecord) => {
    setSelectedId(request.id);
    setNextStatus(transitions[request.status][0] ?? "");
    setStageDate(request.scheduledAt ?? request.startedAt ?? request.performedAt ?? request.resultAvailableAt ?? request.reviewedAt ?? localDate());
    setResultDraft(request.resultSummary ?? "");
    setUpdateNote("");
    setUpdateError("");
    setSuccess("");
    setView("detail");
  };

  const updateSourceDraft = (serviceRecordId: string, referralId: string) => {
    const serviceRecord = getServiceRecord(healthActivities, serviceRecordId);
    const referral = getReferral(healthReferrals, referralId);
    const person = referral?.personId ?? serviceRecord?.personId;
    const professionalId = referral?.professionalId ?? serviceRecord?.professionalId ?? draft.professionalId;
    setDraft((current) => ({
      ...current,
      serviceRecordId,
      referralId,
      personId: person ?? current.personId,
      professionalId,
    }));
  };

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreateError("");
    const values = new FormData(event.currentTarget);
    const requiredNames = ["personId", "professionalId", "serviceName", "justification", "requestedAt", "destination"];
    if (requiredNames.some((name) => !String(values.get(name) ?? "").trim())) {
      setCreateError("Preencha os campos obrigatórios. Campos contendo apenas espaços não são aceitos.");
      return;
    }
    const personId = String(values.get("personId"));
    const serviceRecordId = String(values.get("serviceRecordId") ?? "");
    const referralId = String(values.get("referralId") ?? "");
    const requestedAt = String(values.get("requestedAt"));
    const serviceRecord = getServiceRecord(healthActivities, serviceRecordId);
    const referral = getReferral(healthReferrals, referralId);
    if (!peopleRegistry.people.some((person) => person.id === personId)) {
      setCreateError("Selecione uma pessoa existente no cadastro municipal.");
      return;
    }
    if (serviceRecordId && !serviceRecord) {
      setCreateError("O atendimento de origem não foi localizado. Selecione um registro existente.");
      return;
    }
    if (referralId && !referral) {
      setCreateError("O encaminhamento de origem não foi localizado. Selecione um registro existente.");
      return;
    }
    if (requestedAt > localDate()) {
      setCreateError("A data do pedido não pode ser futura.");
      return;
    }
    if (serviceRecord && serviceRecord.personId !== personId) {
      setCreateError("A pessoa precisa corresponder à pessoa do atendimento de origem.");
      return;
    }
    if (referral && referral.personId !== personId) {
      setCreateError("A pessoa precisa corresponder à pessoa do encaminhamento de origem.");
      return;
    }
    if (serviceRecord && referral?.serviceRecordId && referral.serviceRecordId !== serviceRecord.id) {
      setCreateError("O atendimento selecionado não corresponde à origem registrada neste encaminhamento.");
      return;
    }
    const professionalId = String(values.get("professionalId"));
    const professional = healthTerritory.professionals.find((candidate) => candidate.id === professionalId);
    if (!professional || !professional.active) {
      setCreateError("Selecione um profissional existente na rede municipal.");
      return;
    }
    const id = nextHealthDiagnosticId(dataset.requests);
    const request: HealthDiagnosticRecord = {
      id,
      personId,
      serviceRecordId: serviceRecordId || undefined,
      referralId: referralId || undefined,
      professionalId,
      teamId: professional.teamId,
      unitId: professional.unitId,
      kind: String(values.get("kind")) as HealthDiagnosticRecord["kind"],
      serviceName: String(values.get("serviceName")).trim(),
      justification: String(values.get("justification")).trim(),
      priority: String(values.get("priority")) as HealthDiagnosticPriority,
      requestedAt,
      destination: String(values.get("destination")),
      observation: String(values.get("observation") ?? "").trim() || undefined,
      status: "Solicitado",
      history: [{
        id: `${id}-H01`,
        at: new Date().toISOString(),
        actor: mode === "secretary" ? "Secretaria de Saúde" : "Profissional da UBS",
        action: statusAction.Solicitado,
        toStatus: "Solicitado",
        note: `Pedido fictício registrado nesta sessão${serviceRecordId ? ` e vinculado a ${serviceRecordId}` : ""}${referralId ? ` e ao encaminhamento ${referralId}` : ""}.`,
      }],
    };
    onChange((current) => ({ requests: [request, ...current.requests] }));
    setSuccess(`Pedido ${id} registrado nesta sessão.`);
    setSelectedId(id);
    setView("detail");
    setNextStatus("Agendado");
    setStageDate(localDate());
    setResultDraft("");
    setUpdateNote("");
    event.currentTarget.reset();
  };

  const handleUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedRequest || !nextStatus) return;
    const allowed = transitions[selectedRequest.status];
    if (!allowed.includes(nextStatus)) {
      setUpdateError("Essa transição não está disponível para a etapa atual.");
      return;
    }
    const result = resultDraft.trim();
    const note = updateNote.trim();
    if (nextStatus === "Cancelado" && !note) {
      setUpdateError("Informe a justificativa obrigatória do cancelamento.");
      return;
    }
    if (nextStatus === "Resultado disponível" && !result) {
      setUpdateError("Registre uma observação de resultado antes de disponibilizá-lo.");
      return;
    }
    if (nextStatus !== "Cancelado" && !stageDate) {
      setUpdateError("Informe a data correspondente à etapa.");
      return;
    }
    if (nextStatus !== "Cancelado") {
      const previousStageDate = nextStatus === "Agendado"
        ? selectedRequest.requestedAt
        : nextStatus === "Em execução"
          ? selectedRequest.scheduledAt ?? selectedRequest.requestedAt
          : nextStatus === "Realizado"
            ? selectedRequest.startedAt ?? selectedRequest.scheduledAt ?? selectedRequest.requestedAt
            : nextStatus === "Resultado disponível"
              ? selectedRequest.performedAt ?? selectedRequest.startedAt ?? selectedRequest.scheduledAt ?? selectedRequest.requestedAt
              : selectedRequest.resultAvailableAt ?? selectedRequest.performedAt ?? selectedRequest.startedAt ?? selectedRequest.scheduledAt ?? selectedRequest.requestedAt;
      if (stageDate < previousStageDate) {
        setUpdateError("A data da etapa não pode ser anterior à etapa clínica precedente.");
        return;
      }
      if (nextStatus !== "Agendado" && stageDate > localDate()) {
        setUpdateError("Uma etapa realizada não pode receber data futura.");
        return;
      }
    }
    const now = new Date().toISOString();
    const actor = mode === "secretary" ? "Secretaria de Saúde" : "Profissional da UBS";
    const eventNote = nextStatus === "Cancelado"
      ? note
      : nextStatus === "Resultado disponível"
        ? result
        : note || `Etapa ${nextStatus.toLocaleLowerCase("pt-BR")} registrada nesta sessão.`;
    const historyEvent: HealthDiagnosticHistoryEvent = {
      id: `${selectedRequest.id}-H${String(selectedRequest.history.length + 1).padStart(2, "0")}`,
      at: now,
      actor,
      action: statusAction[nextStatus],
      fromStatus: selectedRequest.status,
      toStatus: nextStatus,
      note: eventNote,
    };
    onChange((current) => ({
      requests: current.requests.map((request) => request.id !== selectedRequest.id ? request : {
        ...request,
        status: nextStatus,
        scheduledAt: nextStatus === "Agendado" ? stageDate : request.scheduledAt,
        startedAt: nextStatus === "Em execução" ? stageDate : request.startedAt,
        performedAt: nextStatus === "Realizado" ? stageDate : request.performedAt,
        resultAvailableAt: nextStatus === "Resultado disponível" ? stageDate : request.resultAvailableAt,
        reviewedAt: nextStatus === "Revisado" ? stageDate : request.reviewedAt,
        resultSummary: nextStatus === "Resultado disponível" ? result : request.resultSummary,
        cancellationReason: nextStatus === "Cancelado" ? note : request.cancellationReason,
        history: [...request.history, historyEvent],
      }),
    }));
    setUpdateError("");
    setUpdateNote("");
    setSuccess(`Etapa atualizada: ${nextStatus}. Histórico preservado.`);
    setNextStatus(transitions[nextStatus][0] ?? "");
    setStageDate(localDate());
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("Todas");
    setKindFilter("Todas");
    setPriorityFilter("Todas");
    setDestinationFilter("Todas");
  };

  const activePeople = peopleRegistry.people.filter((person) => person.status === "Ativa");
  const activeProfessionals = healthTerritory.professionals.filter((professional) => professional.active);
  const completedServices = healthActivities.serviceRecords.filter((record) => record.status === "Realizado");
  const eligibleReferrals = healthReferrals.referrals.filter((referral) => referral.status !== "Cancelado");
  const nextDateLabel = nextStatus === "Agendado"
    ? "Data agendada"
    : nextStatus === "Em execução"
      ? "Data de início da execução/coleta"
      : nextStatus === "Realizado"
        ? "Data de conclusão/coleta realizada"
        : nextStatus === "Resultado disponível"
          ? "Data de liberação do resultado"
          : nextStatus === "Revisado"
            ? "Data da revisão profissional"
            : "Data da etapa";

  return (
    <section className="health-diagnostics-module">
      <header className="health-diagnostics-header">
        <div>
          <span className="health-diagnostics-eyebrow">SAÚDE · EVENTO CLÍNICO · DADOS FICTÍCIOS</span>
          <h2>Exames, Procedimentos e Resultados</h2>
          <p>Pedidos vinculados a pessoas e atendimentos/encaminhamentos existentes, com execução, resultado e histórico em uma fila clínica própria.</p>
        </div>
        <div className="health-diagnostics-header-actions">
          {onBack && <button type="button" className="diagnostics-back" onClick={onBack}><ArrowLeft size={15} /> Voltar</button>}
          <button type="button" className="diagnostics-primary" onClick={() => openCreate()}><ClipboardPlus size={16} /> Novo pedido</button>
        </div>
      </header>

      <div className="diagnostics-demo-note"><Stethoscope size={17} /><p>Os pedidos, resultados, destinos e atualizações são demonstrativos e permanecem apenas nesta sessão. O resultado abaixo não substitui laudo nem prontuário clínico.</p></div>
      {success && <div className="diagnostics-success" role="status"><Check size={15} /> {success}</div>}

      {view === "create" ? (
        <section className="diagnostics-form-view">
          <div className="diagnostics-section-heading">
            <div><span>NOVO EVENTO CLÍNICO</span><h3>Registrar pedido de exame ou procedimento</h3><p>Use os cadastros existentes. A origem clínica é opcional quando o pedido é iniciado manualmente.</p></div>
            <FileCheck2 size={19} />
          </div>
          <form className="diagnostics-form" onSubmit={handleCreate}>
            <label className="diagnostics-field">
              Pessoa cadastrada <span>*</span>
              <select name="personId" value={draft.personId} disabled={Boolean(draft.serviceRecordId || draft.referralId)} onChange={(event) => setDraft((current) => ({ ...current, personId: event.target.value }))} required>
                <option value="">Selecione uma pessoa</option>
                {activePeople.map((person) => <option value={person.id} key={person.id}>{person.fullName}{person.preferredName ? ` (${person.preferredName})` : ""} · {person.id}</option>)}
              </select>
              <small>A pessoa é reutilizada do cadastro municipal; nenhum cadastro novo será criado.</small>
            </label>
            <label className="diagnostics-field">
              Atendimento de origem
              <select name="serviceRecordId" value={draft.serviceRecordId} onChange={(event) => updateSourceDraft(event.target.value, draft.referralId)}>
                <option value="">Sem atendimento vinculado</option>
                {completedServices.map((record) => <option value={record.id} key={record.id}>{record.id} · {record.serviceType} · {getPersonName(peopleRegistry, record.personId)}</option>)}
              </select>
              <small>Somente atendimentos já realizados aparecem como origem selecionável.</small>
            </label>
            <label className="diagnostics-field">
              Encaminhamento de regulação
              <select name="referralId" value={draft.referralId} onChange={(event) => updateSourceDraft(draft.serviceRecordId, event.target.value)}>
                <option value="">Sem encaminhamento vinculado</option>
                {eligibleReferrals.map((referral) => <option value={referral.id} key={referral.id}>{referral.id} · {referral.specialty} · {getPersonName(peopleRegistry, referral.personId)}</option>)}
              </select>
              <small>Um pedido pode manter as duas referências quando pertencem à mesma pessoa.</small>
            </label>
            <label className="diagnostics-field">
              Profissional solicitante <span>*</span>
              <select name="professionalId" value={draft.professionalId} onChange={(event) => setDraft((current) => ({ ...current, professionalId: event.target.value }))} required>
                <option value="">Selecione um profissional</option>
                {activeProfessionals.map((professional) => <option value={professional.id} key={professional.id}>{professional.name} · {professional.category}</option>)}
              </select>
            </label>
            <label className="diagnostics-field">
              Tipo <span>*</span>
              <select name="kind" value={draft.kind} onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value as DraftRequest["kind"] }))} required>
                {healthDiagnosticKinds.map((kind) => <option key={kind}>{kind}</option>)}
              </select>
            </label>
            <label className="diagnostics-field">
              Exame ou procedimento <span>*</span>
              <input name="serviceName" list="health-diagnostic-suggestions" value={draft.serviceName} onChange={(event) => setDraft((current) => ({ ...current, serviceName: event.target.value }))} placeholder="Ex.: hemograma completo" maxLength={120} required />
              <datalist id="health-diagnostic-suggestions">{healthDiagnosticSuggestions.map((suggestion) => <option value={suggestion} key={suggestion} />)}</datalist>
            </label>
            <label className="diagnostics-field">
              Prioridade <span>*</span>
              <select name="priority" value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as HealthDiagnosticPriority }))} required>
                <option>Rotina</option><option>Preferencial</option><option>Urgente</option>
              </select>
            </label>
            <label className="diagnostics-field">
              Data do pedido <span>*</span>
              <input name="requestedAt" type="date" value={draft.requestedAt} onChange={(event) => setDraft((current) => ({ ...current, requestedAt: event.target.value }))} required />
            </label>
            <label className="diagnostics-field diagnostics-field-wide">
              Serviço executor / destino <span>*</span>
              <select name="destination" value={draft.destination} onChange={(event) => setDraft((current) => ({ ...current, destination: event.target.value }))} required>
                {healthDiagnosticDestinations.map((destination) => <option key={destination}>{destination}</option>)}
              </select>
            </label>
            <label className="diagnostics-field diagnostics-field-wide">
              Justificativa ou objetivo clínico <span>*</span>
              <textarea name="justification" rows={3} value={draft.justification} onChange={(event) => setDraft((current) => ({ ...current, justification: event.target.value }))} placeholder="Descreva o motivo do pedido conforme o registro assistencial." maxLength={500} required />
            </label>
            <label className="diagnostics-field diagnostics-field-wide">
              Observação da solicitação
              <textarea name="observation" rows={2} value={draft.observation} onChange={(event) => setDraft((current) => ({ ...current, observation: event.target.value }))} placeholder="Contexto adicional para coleta, agendamento ou execução." maxLength={500} />
            </label>
            {createError && <p className="diagnostics-error" role="alert">{createError}</p>}
            <div className="diagnostics-form-actions">
              <button type="button" className="diagnostics-secondary" onClick={() => { setCreateError(""); setView("queue"); }}>Cancelar</button>
              <button type="submit" className="diagnostics-primary"><Check size={15} /> Registrar pedido nesta sessão</button>
            </div>
          </form>
        </section>
      ) : view === "detail" && selectedRequest ? (
        <section className="diagnostics-detail-view">
          <button className="diagnostics-secondary diagnostics-detail-back" onClick={() => { setView("queue"); setSelectedId(null); }}><ArrowLeft size={15} /> Voltar à fila</button>
          <div className="diagnostics-detail-heading">
            <div><span className="health-diagnostics-eyebrow">PEDIDO · {selectedRequest.id}</span><h3>{selectedRequest.serviceName}</h3><p>{getPersonName(peopleRegistry, selectedRequest.personId)}</p></div>
            <div className="diagnostics-badges"><span className={`diagnostics-status status-${statusTone(selectedRequest.status)}`}>{selectedRequest.status}</span><span className={`diagnostics-priority priority-${priorityTone(selectedRequest.priority)}`}>{selectedRequest.priority}</span></div>
          </div>
          <div className="diagnostics-detail-grid">
            <article><span>Tipo e identificador</span><strong>{selectedRequest.kind} · {selectedRequest.id}</strong></article>
            <article><span>Pedido e tempo decorrido</span><strong>{formatDate(selectedRequest.requestedAt)} · {getHealthDiagnosticWaitDays(selectedRequest)} dias</strong></article>
            <article><span>Profissional solicitante</span><strong>{getProfessionalName(healthTerritory, selectedRequest.professionalId)}</strong></article>
            <article><span>Equipe e unidade</span><strong>{getTeamName(healthTerritory, selectedRequest.teamId)}</strong><small>{getUnitName(healthTerritory, selectedRequest.unitId)}</small></article>
            <article><span>Destino / serviço executor</span><strong>{selectedRequest.destination}</strong></article>
            <article><span>Origem clínica</span><strong>{selectedRequest.serviceRecordId ?? "Sem atendimento"}</strong><small>{selectedRequest.referralId ? `Encaminhamento ${selectedRequest.referralId}` : "Sem encaminhamento"}</small></article>
            {selectedRequest.scheduledAt && <article><span>Agendamento</span><strong>{formatDate(selectedRequest.scheduledAt)}</strong></article>}
            {selectedRequest.startedAt && <article><span>Início da execução/coleta</span><strong>{formatDate(selectedRequest.startedAt)}</strong></article>}
            {selectedRequest.performedAt && <article><span>Realizado / coleta concluída</span><strong>{formatDate(selectedRequest.performedAt)}</strong></article>}
            {selectedRequest.resultAvailableAt && <article><span>Resultado disponibilizado</span><strong>{formatDate(selectedRequest.resultAvailableAt)}</strong></article>}
            {selectedRequest.reviewedAt && <article><span>Revisão profissional</span><strong>{formatDate(selectedRequest.reviewedAt)}</strong></article>}
            <article className="diagnostics-detail-wide"><span>Justificativa</span><p>{selectedRequest.justification}</p></article>
            {selectedRequest.resultSummary && <article className="diagnostics-detail-wide diagnostics-result-card"><span>Resultado demonstrativo · sem valor diagnóstico</span><p>{selectedRequest.resultSummary}</p></article>}
            {selectedRequest.cancellationReason && <article className="diagnostics-detail-wide diagnostics-cancel-card"><span>Justificativa do cancelamento</span><p>{selectedRequest.cancellationReason}</p></article>}
          </div>
          <div className="diagnostics-update-layout">
            {transitions[selectedRequest.status].length > 0 ? (
              <form className="diagnostics-update-form" onSubmit={handleUpdate}>
                <div className="diagnostics-section-heading"><div><span>ATUALIZAÇÃO · SOMENTE NESTA SESSÃO</span><h4>Registrar próxima etapa</h4></div><CalendarDays size={18} /></div>
                <label className="diagnostics-field">Nova situação <span>*</span>
                  <select value={nextStatus} onChange={(event) => setNextStatus(event.target.value as HealthDiagnosticStatus)} required>
                    {transitions[selectedRequest.status].map((status) => <option value={status} key={status}>{status}</option>)}
                  </select>
                </label>
                {nextStatus !== "Cancelado" && <label className="diagnostics-field">{nextDateLabel} <span>*</span><input type="date" value={stageDate} onChange={(event) => setStageDate(event.target.value)} required /></label>}
                {nextStatus === "Resultado disponível" && <label className="diagnostics-field diagnostics-field-wide">Resultado ou observação do laudo demonstrativo <span>*</span><textarea rows={3} value={resultDraft} onChange={(event) => setResultDraft(event.target.value)} maxLength={800} placeholder="Não registre valores de exame real neste protótipo." required /></label>}
                <label className="diagnostics-field diagnostics-field-wide">Nota da atualização{nextStatus === "Cancelado" && <span> *</span>}<textarea rows={2} value={updateNote} onChange={(event) => setUpdateNote(event.target.value)} maxLength={500} placeholder={nextStatus === "Cancelado" ? "Justificativa obrigatória para cancelar" : "Contexto opcional para o histórico"} required={nextStatus === "Cancelado"} /></label>
                {updateError && <p className="diagnostics-error" role="alert">{updateError}</p>}
                <button type="submit" className="diagnostics-primary"><Check size={15} /> Atualizar e preservar histórico</button>
                <small className="diagnostics-actor-note">Responsável demonstrativo: {mode === "secretary" ? "Secretaria de Saúde" : "Profissional da UBS"}.</small>
              </form>
            ) : (
              <div className="diagnostics-terminal-note"><FileCheck2 size={18} /><div><strong>Não há nova etapa disponível</strong><p>Esta etapa encerra o fluxo demonstrativo. O histórico permanece consultável.</p></div></div>
            )}
            <aside className="diagnostics-next-step"><Clock3 size={18} /><span>PRÓXIMA PROVIDÊNCIA</span><p>{getNextStep(selectedRequest)}</p><small>As datas e prazos são demonstrativos; não refletem disponibilidade oficial do serviço.</small></aside>
          </div>
          <section className="diagnostics-history">
            <div className="diagnostics-section-heading"><div><span>TRILHA CRONOLÓGICA</span><h4>Histórico do pedido</h4></div><History size={18} /></div>
            <ol>{[...selectedRequest.history].reverse().map((item) => <li key={item.id}><span className="diagnostics-history-dot" /><div><strong>{item.action}</strong><p>{item.note}</p><small>{formatDateTime(item.at)} · {item.actor}{item.fromStatus && item.fromStatus !== item.toStatus ? ` · ${item.fromStatus} → ${item.toStatus}` : ` · ${item.toStatus}`}</small></div></li>)}</ol>
          </section>
        </section>
      ) : (
        <>
          <div className="diagnostics-metric-grid">
            <button className="diagnostics-metric metric-blue" onClick={() => { clearFilters(); setStatusFilter("Todas"); }}><span>Pedidos cadastrados</span><strong>{summary.total}</strong><small>eventos clínicos nesta sessão</small></button>
            <button className="diagnostics-metric metric-amber" onClick={() => { clearFilters(); setStatusFilter("Solicitado"); }}><span>Aguardando agendamento</span><strong>{summary.requested}</strong><small>pedidos ainda sem data</small></button>
            <button className="diagnostics-metric metric-blue" onClick={() => { clearFilters(); setStatusFilter("Agendado"); }}><span>Agendados</span><strong>{summary.scheduled}</strong><small>data reservada no serviço</small></button>
            <button className="diagnostics-metric metric-progress" onClick={() => { clearFilters(); setStatusFilter("Em execução"); }}><span>Em execução</span><strong>{summary.inProgress}</strong><small>coletas ou procedimentos iniciados</small></button>
            <button className="diagnostics-metric metric-green" onClick={() => { clearFilters(); setStatusFilter("Realizado"); }}><span>Realizados</span><strong>{summary.performed}</strong><small>aguardam liberação do resultado</small></button>
            <button className="diagnostics-metric metric-result" onClick={() => { clearFilters(); setStatusFilter("Resultado disponível"); }}><span>Resultados para revisão</span><strong>{summary.resultsPendingReview}</strong><small>aguardam conferência profissional</small></button>
            <button className="diagnostics-metric metric-green" onClick={() => { clearFilters(); setStatusFilter("Revisado"); }}><span>Revisados</span><strong>{summary.reviewed}</strong><small>resultado com revisão registrada</small></button>
          </div>
          <div className="diagnostics-queue-heading"><div><span className="health-diagnostics-eyebrow">FILA DE EXAMES E PROCEDIMENTOS</span><h3>Pedidos e resultados</h3><p>Abra um pedido para consultar vínculos, atualizar a etapa e acompanhar o histórico sem remover registros anteriores.</p></div><span className="diagnostics-result-count">{filteredRequests.length} de {dataset.requests.length} registros</span></div>
          <div className="diagnostics-filters">
            <label className="diagnostics-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pessoa, pedido, exame ou origem" aria-label="Buscar pedidos diagnósticos" /></label>
            <label><Filter size={14} /><select aria-label="Filtrar por situação" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as HealthDiagnosticStatus | "Todas")}><option value="Todas">Todas as situações</option>{healthDiagnosticStatuses.map((status) => <option key={status}>{status}</option>)}</select></label>
            <label><select aria-label="Filtrar por tipo" value={kindFilter} onChange={(event) => setKindFilter(event.target.value)}><option value="Todas">Todos os tipos</option>{healthDiagnosticKinds.map((kind) => <option key={kind}>{kind}</option>)}</select></label>
            <label><select aria-label="Filtrar por prioridade" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value as HealthDiagnosticPriority | "Todas")}><option value="Todas">Todas as prioridades</option><option>Rotina</option><option>Preferencial</option><option>Urgente</option></select></label>
            <label><select aria-label="Filtrar por destino" value={destinationFilter} onChange={(event) => setDestinationFilter(event.target.value)}><option value="Todas">Todos os destinos</option>{healthDiagnosticDestinations.map((destination) => <option key={destination}>{destination}</option>)}</select></label>
            {(search || statusFilter !== "Todas" || kindFilter !== "Todas" || priorityFilter !== "Todas" || destinationFilter !== "Todas") && <button className="diagnostics-clear" onClick={clearFilters}>Limpar filtros</button>}
          </div>
          <div className="diagnostics-list">
            {filteredRequests.length ? filteredRequests.map((request) => {
              const service = getServiceRecord(healthActivities, request.serviceRecordId);
              const referral = getReferral(healthReferrals, request.referralId);
              return <article className="diagnostics-row" key={request.id}>
                <div className="diagnostics-row-main"><div className="diagnostics-row-heading"><strong>{request.serviceName}</strong><span className={`diagnostics-status status-${statusTone(request.status)}`}>{request.status}</span><span className={`diagnostics-priority priority-${priorityTone(request.priority)}`}>{request.priority}</span></div><p><UserRound size={13} /> {getPersonName(peopleRegistry, request.personId)} <span>· {request.id}</span></p><div className="diagnostics-row-meta"><span><Beaker size={13} /> {request.kind}</span><span><CalendarDays size={13} /> Pedido em {formatDate(request.requestedAt)} · {getHealthDiagnosticWaitDays(request)} dias</span><span><MapPin size={13} /> {request.destination}</span></div><div className="diagnostics-row-origin">{service ? <span>Atendimento {service.id}</span> : null}{referral ? <span>Encaminhamento {referral.id}</span> : null}{!service && !referral ? <span>Solicitação manual vinculada à pessoa cadastrada</span> : null}</div></div>
                <button className="diagnostics-open" onClick={() => openDetail(request)}>Abrir pedido <ArrowRight size={14} /></button>
              </article>;
            }) : <div className="diagnostics-empty"><FlaskConical size={22} /><strong>Nenhum pedido encontrado</strong><p>Ajuste a busca ou os filtros para consultar os registros disponíveis.</p><button type="button" className="diagnostics-secondary" onClick={clearFilters}>Limpar filtros</button></div>}
          </div>
          <footer className="diagnostics-footer"><Clock3 size={14} /> A fila não é uma posição oficial de regulação nem representa disponibilidade confirmada de laboratório. Todos os dados são fictícios e permanecem apenas nesta sessão.</footer>
        </>
      )}
    </section>
  );
}
