import { useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  FilePlus2,
  Filter,
  History,
  ListChecks,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import type { HealthActivitiesDataset } from "../data/healthActivities";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import {
  epidemiologyStatuses,
  epidemiologyStatusTransitions,
  epidemiologyThemes,
  getHealthEpidemiologySummary,
  nextEpidemiologyPendingId,
  nextEpidemiologyNotificationId,
  type EpidemiologyHistoryEvent,
  type EpidemiologyNotification,
  type EpidemiologyPending,
  type EpidemiologyPendingHistoryEvent,
  type EpidemiologyPendingStatus,
  type EpidemiologyStatus,
  type EpidemiologyTheme,
  type HealthEpidemiologyDataset,
} from "../data/healthEpidemiology";
import "./HealthEpidemiologyModule.css";

type ModuleView = "overview" | "list" | "create" | "detail";
type StatusFilter =
  | "Todas"
  | "A conferir"
  | "Com pendência"
  | EpidemiologyStatus;
type Props = {
  dataset: HealthEpidemiologyDataset;
  peopleRegistry: PeopleRegistryDataset;
  healthActivities: HealthActivitiesDataset;
  healthTerritory: HealthTerritoryDataset;
  onChange: (
    update: (current: HealthEpidemiologyDataset) => HealthEpidemiologyDataset,
  ) => void;
  onBack: () => void;
};

type OriginOption = {
  value: string;
  label: string;
  type: "Atendimento" | "Visita domiciliar";
  id: string;
  unitId: string;
};

const actor = "Secretaria de Saúde · demonstração";
const pendingActions = [
  "Conferir dados mínimos do registro",
  "Confirmar unidade de referência",
  "Registrar retorno administrativo da unidade",
] as const;
type PendingAction = (typeof pendingActions)[number];

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
};
const isValidDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
const dateLabel = (value?: string) => {
  if (!value || !isValidDate(value.slice(0, 10))) return "Não informado";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
};
const dateTimeLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(value));
const statusTone = (status: EpidemiologyStatus) =>
  status === "Recebida"
    ? "blue"
    : status === "Em conferência" || status === "Aguardando retorno"
      ? "amber"
      : status === "Concluída administrativamente"
        ? "green"
        : "red";
const isTerminalStatus = (status: EpidemiologyStatus) =>
  status === "Concluída administrativamente" ||
  status === "Cancelada administrativamente";
const statusAction = (status: EpidemiologyStatus) => {
  switch (status) {
    case "Em conferência":
      return "Conferência administrativa iniciada";
    case "Aguardando retorno":
      return "Retorno administrativo solicitado";
    case "Concluída administrativamente":
      return "Fluxo administrativo concluído";
    case "Cancelada administrativamente":
      return "Registro cancelado administrativamente";
    default:
      return "Registro demonstrativo atualizado";
  }
};
const statusNote = (status: EpidemiologyStatus) => {
  switch (status) {
    case "Em conferência":
      return "Etapa administrativa demonstrativa; não representa avaliação clínica ou classificação de caso.";
    case "Aguardando retorno":
      return "Acompanhamento administrativo fictício; não constitui prazo ou orientação clínica.";
    case "Concluída administrativamente":
      return "Conclusão administrativa demonstrativa; não representa desfecho clínico ou oficial.";
    case "Cancelada administrativamente":
      return "Cancelamento administrativo demonstrativo; não representa decisão sobre condição de saúde.";
    default:
      return "Atualização local demonstrativa.";
  }
};

export default function HealthEpidemiologyModule({
  dataset,
  peopleRegistry,
  healthActivities,
  healthTerritory,
  onChange,
  onBack,
}: Props) {
  const [view, setView] = useState<ModuleView>("overview");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todas");
  const [themeFilter, setThemeFilter] = useState<"Todos" | EpidemiologyTheme>(
    "Todos",
  );
  const [formPersonId, setFormPersonId] = useState("");
  const [formUnitId, setFormUnitId] = useState("");
  const [sourceValue, setSourceValue] = useState("");
  const [nextStatus, setNextStatus] = useState<EpidemiologyStatus | "">("");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [updateError, setUpdateError] = useState("");
  const [pendingError, setPendingError] = useState("");

  const summary = useMemo(
    () => getHealthEpidemiologySummary(dataset),
    [dataset],
  );
  const activePeople = useMemo(
    () => peopleRegistry.people.filter((person) => person.status === "Ativa"),
    [peopleRegistry.people],
  );
  const activeUnits = useMemo(
    () => healthTerritory.units.filter((unit) => unit.active),
    [healthTerritory.units],
  );
  const selected = dataset.notifications.find((item) => item.id === selectedId);
  const getPersonName = (personId: string) => {
    const person = peopleRegistry.people.find((item) => item.id === personId);
    return person?.preferredName || person?.fullName || "Pessoa não localizada";
  };
  const getUnitName = (unitId: string) =>
    healthTerritory.units.find((item) => item.id === unitId)?.name ??
    "Unidade não localizada";
  const getOriginLabel = (item: EpidemiologyNotification) => {
    if (!item.originRecordId) return "Registro manual";
    const source =
      item.originType === "Atendimento"
        ? healthActivities.serviceRecords.find(
            (record) => record.id === item.originRecordId,
          )
        : item.originType === "Visita domiciliar"
          ? healthActivities.homeVisits.find(
              (record) => record.id === item.originRecordId,
            )
          : undefined;
    const date = source?.date ? ` · ${dateLabel(source.date)}` : "";
    return `${item.originType} · ${item.originRecordId}${date}`;
  };
  const originOptions = useMemo<OriginOption[]>(() => {
    if (!formPersonId) return [];
    const services = healthActivities.serviceRecords
      .filter((item) => item.personId === formPersonId)
      .map((item) => ({
        value: `service:${item.id}`,
        label: `Atendimento · ${item.id} · ${dateLabel(item.date)}`,
        type: "Atendimento" as const,
        id: item.id,
        unitId: item.unitId,
      }));
    const visits = healthActivities.homeVisits
      .filter((item) => item.personId === formPersonId)
      .map((item) => ({
        value: `visit:${item.id}`,
        label: `Visita domiciliar · ${item.id} · ${dateLabel(item.date)}`,
        type: "Visita domiciliar" as const,
        id: item.id,
        unitId: item.unitId,
      }));
    return [...services, ...visits].sort((a, b) =>
      b.label.localeCompare(a.label, "pt-BR"),
    );
  }, [formPersonId, healthActivities]);
  const openPendingRecords = dataset.pendings.filter(
    (item) => item.status === "Aberta",
  );
  const selectedPendings = selected
    ? dataset.pendings.filter((item) => item.notificationId === selected.id)
    : [];
  const hasOpenSelectedPendings = selectedPendings.some(
    (item) => item.status === "Aberta",
  );
  const availableTransitions = selected
    ? epidemiologyStatusTransitions[selected.status].filter(
        (status) => !hasOpenSelectedPendings || !isTerminalStatus(status),
      )
    : [];

  const startCreate = () => {
    setFormPersonId("");
    setFormUnitId(activeUnits[0]?.id ?? "");
    setSourceValue("");
    setFormError("");
    setSuccess("");
    setView("create");
  };
  const openList = (filter: StatusFilter = "Todas") => {
    setStatusFilter(filter);
    setThemeFilter("Todos");
    setSearch("");
    setView("list");
  };
  const openRecord = (id: string) => {
    setSelectedId(id);
    setNextStatus("");
    setUpdateError("");
    setPendingError("");
    setView("detail");
  };

  const filteredNotifications = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return [...dataset.notifications]
      .filter((item) => {
        const person = peopleRegistry.people.find(
          (candidate) => candidate.id === item.personId,
        );
        const origin = getOriginLabel(item);
        const matchesQuery =
          !query ||
          [
            item.id,
            item.personId,
            item.theme,
            item.status,
            person?.fullName,
            person?.preferredName,
            origin,
          ]
            .filter(Boolean)
            .some((value) =>
              String(value).toLocaleLowerCase("pt-BR").includes(query),
            );
        const matchesStatus =
          statusFilter === "Todas" ||
          (statusFilter === "A conferir" &&
            (item.status === "Recebida" || item.status === "Em conferência")) ||
          (statusFilter === "Com pendência" &&
            dataset.pendings.some(
              (pending) =>
                pending.notificationId === item.id &&
                pending.status === "Aberta",
            )) ||
          item.status === statusFilter;
        const matchesTheme =
          themeFilter === "Todos" || item.theme === themeFilter;
        return matchesQuery && matchesStatus && matchesTheme;
      })
      .sort(
        (a, b) =>
          b.reportedAt.localeCompare(a.reportedAt) || a.id.localeCompare(b.id),
      );
  }, [
    dataset.notifications,
    dataset.pendings,
    getOriginLabel,
    peopleRegistry.people,
    search,
    statusFilter,
    themeFilter,
  ]);

  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError("");
    const formData = new FormData(event.currentTarget);
    const personId = String(formData.get("personId") ?? "");
    const theme = String(formData.get("theme") ?? "") as EpidemiologyTheme;
    const reportedAt = String(formData.get("reportedAt") ?? "");
    const symptomOnsetAt = String(formData.get("symptomOnsetAt") ?? "");
    const reportingUnitId = String(formData.get("reportingUnitId") ?? "");
    const personExists = activePeople.some((item) => item.id === personId);
    const unitExists = activeUnits.some((item) => item.id === reportingUnitId);
    const origin = originOptions.find((item) => item.value === sourceValue);

    if (!personExists) {
      setFormError("Selecione uma pessoa ativa já cadastrada no município.");
      return;
    }
    if (!epidemiologyThemes.includes(theme)) {
      setFormError("Selecione uma categoria demonstrativa.");
      return;
    }
    if (!isValidDate(reportedAt) || reportedAt > today()) {
      setFormError(
        "Informe uma data de registro válida, não posterior a hoje.",
      );
      return;
    }
    if (
      symptomOnsetAt &&
      (!isValidDate(symptomOnsetAt) || symptomOnsetAt > reportedAt)
    ) {
      setFormError(
        "A data de início, quando informada, deve ser válida e não posterior à data do registro.",
      );
      return;
    }
    if (!unitExists) {
      setFormError("Selecione uma unidade ativa já cadastrada.");
      return;
    }
    if (sourceValue && !origin) {
      setFormError("A origem escolhida não foi localizada para esta pessoa.");
      return;
    }

    const recordId = nextEpidemiologyNotificationId(dataset.notifications);
    const now = new Date().toISOString();
    const firstEvent: EpidemiologyHistoryEvent = {
      id: `${recordId}-H01`,
      at: now,
      actor,
      action: "Registro demonstrativo recebido",
      toStatus: "Recebida",
      note: "Registro fictício criado na sessão; não equivale a notificação oficial.",
    };
    const record: EpidemiologyNotification = {
      id: recordId,
      personId,
      theme,
      reportedAt,
      ...(symptomOnsetAt ? { symptomOnsetAt } : {}),
      reportingUnitId,
      originType: origin?.type ?? "Registro manual",
      ...(origin ? { originRecordId: origin.id } : {}),
      status: "Recebida",
      history: [firstEvent],
    };
    const pendingId = nextEpidemiologyPendingId(dataset.pendings);
    const initialPending: EpidemiologyPending = {
      id: pendingId,
      notificationId: recordId,
      title: "Conferir dados mínimos do registro",
      responsibleUnitId: reportingUnitId,
      status: "Aberta",
      history: [
        {
          id: `${pendingId}-H01`,
          at: now,
          actor,
          toStatus: "Aberta",
          note: "Conferência administrativa criada com o registro demonstrativo.",
        },
      ],
    };
    onChange((current) => ({
      notifications: [record, ...current.notifications],
      pendings: [initialPending, ...current.pendings],
    }));
    setSelectedId(recordId);
    setSuccess(
      "Registro fictício criado. A pessoa e a unidade foram reutilizadas do cadastro compartilhado.",
    );
    setView("detail");
  };

  const handleStatusUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUpdateError("");
    if (!selected || !nextStatus) {
      setUpdateError("Escolha uma etapa administrativa disponível.");
      return;
    }
    if (!availableTransitions.includes(nextStatus)) {
      setUpdateError("Essa transição administrativa não está disponível.");
      return;
    }
    const historyEntry: EpidemiologyHistoryEvent = {
      id: `${selected.id}-H${String(selected.history.length + 1).padStart(2, "0")}`,
      at: new Date().toISOString(),
      actor,
      action: statusAction(nextStatus),
      fromStatus: selected.status,
      toStatus: nextStatus,
      note: statusNote(nextStatus),
    };
    onChange((current) => ({
      ...current,
      notifications: current.notifications.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              status: nextStatus,
              history: [...item.history, historyEntry],
            }
          : item,
      ),
    }));
    setNextStatus("");
    setSuccess("Etapa administrativa atualizada nesta sessão.");
  };

  const addPending = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingError("");
    if (!selected) return;
    if (isTerminalStatus(selected.status)) {
      setPendingError(
        "Não é possível abrir novas pendências em um fluxo concluído ou cancelado.",
      );
      return;
    }
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("pendingAction") ?? "") as PendingAction;
    const responsibleUnitId = String(formData.get("responsibleUnitId") ?? "");
    const dueAt = String(formData.get("dueAt") ?? "");
    if (!pendingActions.includes(title)) {
      setPendingError("Selecione uma atividade administrativa da lista.");
      return;
    }
    if (!activeUnits.some((item) => item.id === responsibleUnitId)) {
      setPendingError("Selecione uma unidade ativa responsável.");
      return;
    }
    if (dueAt && !isValidDate(dueAt)) {
      setPendingError(
        "Informe um prazo administrativo válido ou deixe-o em branco.",
      );
      return;
    }
    const id = nextEpidemiologyPendingId(dataset.pendings);
    const now = new Date().toISOString();
    const pending: EpidemiologyPending = {
      id,
      notificationId: selected.id,
      title,
      responsibleUnitId,
      ...(dueAt ? { dueAt } : {}),
      status: "Aberta",
      history: [
        {
          id: `${id}-H01`,
          at: now,
          actor,
          toStatus: "Aberta",
          note: "Pendência administrativa demonstrativa criada nesta sessão.",
        },
      ],
    };
    onChange((current) => ({
      ...current,
      pendings: [pending, ...current.pendings],
    }));
    event.currentTarget.reset();
    setPendingError("");
    setSuccess("Pendência administrativa adicionada nesta sessão.");
  };

  const updatePendingStatus = (
    pending: EpidemiologyPending,
    toStatus: EpidemiologyPendingStatus,
  ) => {
    if (toStatus === "Aberta") {
      const sourceRecord = dataset.notifications.find(
        (item) => item.id === pending.notificationId,
      );
      if (sourceRecord && isTerminalStatus(sourceRecord.status)) {
        setPendingError(
          "Não é possível reabrir uma pendência após concluir ou cancelar o fluxo.",
        );
        return;
      }
    }
    const historyEntry: EpidemiologyPendingHistoryEvent = {
      id: `${pending.id}-H${String(pending.history.length + 1).padStart(2, "0")}`,
      at: new Date().toISOString(),
      actor,
      fromStatus: pending.status,
      toStatus,
      note:
        toStatus === "Concluída"
          ? "Atividade administrativa concluída na demonstração."
          : "Atividade administrativa reaberta na demonstração.",
    };
    onChange((current) => ({
      ...current,
      pendings: current.pendings.map((item) =>
        item.id === pending.id
          ? {
              ...item,
              status: toStatus,
              history: [...item.history, historyEntry],
            }
          : item,
      ),
    }));
    setSuccess(
      toStatus === "Concluída"
        ? "Pendência administrativa concluída nesta sessão."
        : "Pendência administrativa reaberta nesta sessão.",
    );
  };

  return (
    <section className="health-epidemiology-module">
      <header className="epidemiology-header">
        <div>
          <span className="epidemiology-eyebrow">
            SAÚDE · FLUXO DEMONSTRATIVO
          </span>
          <h2>Vigilância Epidemiológica e Acompanhamento de Agravos</h2>
          <p>
            Registros sintéticos com pessoa e unidade vinculadas ao cadastro
            municipal já existente.
          </p>
        </div>
        <div className="epidemiology-header-actions">
          {view !== "overview" && (
            <button
              className="epidemiology-back-link"
              onClick={() => setView("overview")}
              type="button"
            >
              <ArrowLeft size={15} /> Visão geral
            </button>
          )}
          <button
            className="epidemiology-secondary"
            onClick={onBack}
            type="button"
          >
            Voltar ao catálogo
          </button>
          {view !== "create" && (
            <button
              className="epidemiology-primary"
              onClick={startCreate}
              type="button"
            >
              <FilePlus2 size={15} /> Novo registro
            </button>
          )}
        </div>
      </header>

      <div className="epidemiology-demo-note" role="note">
        <ShieldAlert size={17} />
        <p>
          <strong>Somente demonstração com dados fictícios.</strong> Não insira
          dados reais. As categorias e etapas são administrativas e didáticas;
          não definem caso, diagnóstico ou notificação oficial, não orientam
          condutas clínicas e não substituem profissionais, protocolos ou
          sistemas oficiais. As alterações ficam apenas nesta sessão e não são
          exportadas.
        </p>
      </div>

      {success && (
        <div className="epidemiology-success" role="status">
          <CheckCircle2 size={15} /> {success}
        </div>
      )}

      {view === "overview" && (
        <>
          <div className="epidemiology-metric-grid">
            <button onClick={() => openList("Todas")} type="button">
              <span>Registros demonstrativos</span>
              <strong>{summary.total}</strong>
              <small>Total da coleção nesta sessão</small>
            </button>
            <button onClick={() => openList("A conferir")} type="button">
              <span>A conferir</span>
              <strong>{summary.triage}</strong>
              <small>Recebidos ou em conferência administrativa</small>
            </button>
            <button
              onClick={() => openList("Aguardando retorno")}
              type="button"
            >
              <span>Aguardando retorno</span>
              <strong>{summary.followUps}</strong>
              <small>Etapa administrativa local</small>
            </button>
            <button onClick={() => openList("Com pendência")} type="button">
              <span>Pendências abertas</span>
              <strong>{summary.openPendings}</strong>
              <small>Tarefas ligadas aos registros</small>
            </button>
          </div>

          <section className="epidemiology-pendings-panel">
            <div className="epidemiology-list-heading">
              <div>
                <span>ACOMPANHAMENTO ADMINISTRATIVO</span>
                <h3>Pendências abertas</h3>
              </div>
              <span>{openPendingRecords.length} abertas</span>
            </div>
            <p className="epidemiology-pending-note">
              Responsabilidade atribuída a unidade existente. Datas são apenas
              prazos administrativos fictícios.
            </p>
            {openPendingRecords.length ? (
              <div className="epidemiology-pending-list">
                {openPendingRecords.slice(0, 4).map((pending) => {
                  const record = dataset.notifications.find(
                    (item) => item.id === pending.notificationId,
                  );
                  return (
                    <article
                      className="epidemiology-pending-card"
                      key={pending.id}
                    >
                      <div>
                        <strong>{pending.title}</strong>
                        <p>
                          {pending.id} ·{" "}
                          {getUnitName(pending.responsibleUnitId)}
                        </p>
                        <small>
                          {record
                            ? `${record.id} · ${getPersonName(record.personId)}`
                            : pending.notificationId}
                          {pending.dueAt
                            ? ` · Prazo ${dateLabel(pending.dueAt)}`
                            : " · Sem prazo definido"}
                        </small>
                      </div>
                      <div className="epidemiology-pending-actions">
                        {record && (
                          <button
                            className="epidemiology-open"
                            onClick={() => openRecord(record.id)}
                            type="button"
                          >
                            Abrir registro <ArrowRight size={14} />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="epidemiology-empty">
                <CheckCircle2 size={22} />
                <strong>Nenhuma pendência aberta</strong>
                <p>
                  As tarefas administrativas vinculadas aos registros aparecerão
                  aqui.
                </p>
              </div>
            )}
          </section>

          <div className="epidemiology-overview-grid">
            <article className="epidemiology-overview-card">
              <div className="epidemiology-section-title">
                <Activity size={18} />
                <div>
                  <span>REGISTRO MÍNIMO</span>
                  <h3>Referências sem recadastro</h3>
                </div>
              </div>
              <p>
                O registro usa o identificador da pessoa já cadastrada, uma
                categoria demonstrativa, datas, unidade e origem opcional. Nome,
                contatos e documentos não são copiados para esta coleção.
              </p>
              <button
                className="epidemiology-link"
                onClick={startCreate}
                type="button"
              >
                Registrar sinal demonstrativo <ArrowRight size={14} />
              </button>
            </article>
            <article className="epidemiology-overview-card">
              <div className="epidemiology-section-title">
                <ListChecks size={18} />
                <div>
                  <span>FLUXO LOCAL</span>
                  <h3>Etapas administrativas</h3>
                </div>
              </div>
              <p>
                Recebida, Em conferência, Aguardando retorno, Concluída
                administrativamente ou Cancelada administrativamente. As
                transições ficam registradas no histórico da sessão.
              </p>
              <button
                className="epidemiology-link"
                onClick={() => openList("Todas")}
                type="button"
              >
                Consultar registros <ArrowRight size={14} />
              </button>
            </article>
          </div>
        </>
      )}

      {view === "list" && (
        <>
          <div className="epidemiology-list-heading">
            <div>
              <span>COLEÇÃO EM MEMÓRIA</span>
              <h3>Registros demonstrativos</h3>
            </div>
            <span>{filteredNotifications.length} encontrados</span>
          </div>
          <div className="epidemiology-filters">
            <label className="epidemiology-search">
              <Search size={15} />
              <input
                aria-label="Buscar por código, pessoa, categoria ou origem"
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por código, pessoa, categoria ou origem"
                value={search}
              />
            </label>
            <label>
              <Filter size={14} />
              <select
                aria-label="Filtrar por etapa administrativa"
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                value={statusFilter}
              >
                <option value="Todas">Todas as etapas</option>
                <option value="A conferir">A conferir</option>
                <option value="Com pendência">Com pendência</option>
                {epidemiologyStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <Activity size={14} />
              <select
                aria-label="Filtrar por categoria demonstrativa"
                onChange={(event) =>
                  setThemeFilter(
                    event.target.value as "Todos" | EpidemiologyTheme,
                  )
                }
                value={themeFilter}
              >
                <option value="Todos">Todas as categorias</option>
                {epidemiologyThemes.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="epidemiology-clear"
              onClick={() => {
                setSearch("");
                setStatusFilter("Todas");
                setThemeFilter("Todos");
              }}
              type="button"
            >
              Limpar filtros
            </button>
          </div>

          {filteredNotifications.length ? (
            <div className="epidemiology-record-list">
              {filteredNotifications.map((item) => {
                const openCount = dataset.pendings.filter(
                  (pending) =>
                    pending.notificationId === item.id &&
                    pending.status === "Aberta",
                ).length;
                return (
                  <article className="epidemiology-record-card" key={item.id}>
                    <div className="epidemiology-record-main">
                      <div className="epidemiology-record-title">
                        <strong>{item.id}</strong>
                        <span
                          className={`epidemiology-status status-${statusTone(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p>
                        {item.theme}{" "}
                        <span>
                          · {getPersonName(item.personId)} ({item.personId})
                        </span>
                      </p>
                      <div className="epidemiology-record-meta">
                        <span>
                          <CalendarDays size={13} /> Registro:{" "}
                          {dateLabel(item.reportedAt)}
                        </span>
                        <span>
                          <UserRound size={13} />{" "}
                          {getUnitName(item.reportingUnitId)}
                        </span>
                        <span>
                          <Activity size={13} /> {getOriginLabel(item)}
                        </span>
                        <span>
                          <ListChecks size={13} /> {openCount} pendência(s)
                          aberta(s)
                        </span>
                      </div>
                    </div>
                    <button
                      className="epidemiology-open"
                      onClick={() => openRecord(item.id)}
                      type="button"
                    >
                      Abrir <ArrowRight size={14} />
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="epidemiology-empty">
              <Search size={22} />
              <strong>Nenhum registro encontrado</strong>
              <p>
                Altere os filtros ou crie um registro demonstrativo usando uma
                pessoa já cadastrada.
              </p>
              {dataset.notifications.length === 0 && (
                <button
                  className="epidemiology-primary"
                  onClick={startCreate}
                  type="button"
                >
                  <FilePlus2 size={15} /> Novo registro
                </button>
              )}
            </div>
          )}
        </>
      )}

      {view === "create" && (
        <section className="epidemiology-form-view">
          <button
            className="epidemiology-back-link"
            onClick={() => setView("overview")}
            type="button"
          >
            <ArrowLeft size={14} /> Voltar à visão geral
          </button>
          <div className="epidemiology-section-heading">
            <div>
              <span className="epidemiology-eyebrow">
                NOVO REGISTRO · DADOS MÍNIMOS
              </span>
              <h3>Registrar sinal demonstrativo</h3>
              <p>
                Selecione referências existentes. Nenhum dado pessoal é copiado
                para o registro epidemiológico.
              </p>
            </div>
            <FilePlus2 size={22} />
          </div>
          <form className="epidemiology-form" onSubmit={handleCreate}>
            <label className="epidemiology-field-wide">
              Pessoa já cadastrada <span>*</span>
              <select
                name="personId"
                onChange={(event) => {
                  setFormPersonId(event.target.value);
                  setSourceValue("");
                }}
                required
                value={formPersonId}
              >
                <option value="">Selecione uma pessoa existente</option>
                {activePeople.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.preferredName
                      ? `${person.preferredName} · ${person.fullName}`
                      : person.fullName}{" "}
                    · {person.id}
                  </option>
                ))}
              </select>
              <small>
                O nome é exibido a partir do cadastro compartilhado; não será
                duplicado.
              </small>
            </label>
            <label>
              Categoria demonstrativa <span>*</span>
              <select name="theme" defaultValue="" required>
                <option value="">Selecione uma categoria</option>
                {epidemiologyThemes.map((theme) => (
                  <option key={theme} value={theme}>
                    {theme}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Data do registro <span>*</span>
              <input max={today()} name="reportedAt" required type="date" />
            </label>
            <label>
              Data de início (opcional)
              <input max={today()} name="symptomOnsetAt" type="date" />
              <small>
                Data administrativa de referência; não é uma avaliação clínica.
              </small>
            </label>
            <label>
              Unidade de referência <span>*</span>
              <select
                name="reportingUnitId"
                onChange={(event) => setFormUnitId(event.target.value)}
                required
                value={formUnitId}
              >
                <option value="">Selecione uma unidade ativa</option>
                {activeUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} · {unit.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="epidemiology-field-wide">
              Origem existente (opcional)
              <select
                onChange={(event) => {
                  const value = event.target.value;
                  setSourceValue(value);
                  const source = originOptions.find(
                    (item) => item.value === value,
                  );
                  if (source) setFormUnitId(source.unitId);
                }}
                value={sourceValue}
              >
                <option value="">Registro manual, sem vínculo de origem</option>
                {originOptions.map((origin) => (
                  <option key={origin.value} value={origin.value}>
                    {origin.label}
                  </option>
                ))}
              </select>
              <small>
                Mostra apenas atendimentos e visitas já vinculados à pessoa
                selecionada; a origem é referenciada por tipo e identificador,
                sem copiar sua narrativa.
              </small>
            </label>
            <p className="epidemiology-form-help epidemiology-field-wide">
              A pessoa e a unidade precisam existir no cadastro compartilhado. O
              sistema gera um identificador fictício e uma conferência
              administrativa inicial.
            </p>
            {formError && <p className="epidemiology-error">{formError}</p>}
            <div className="epidemiology-form-actions">
              <button
                className="epidemiology-secondary"
                onClick={() => setView("overview")}
                type="button"
              >
                Cancelar
              </button>
              <button className="epidemiology-primary" type="submit">
                Criar registro fictício
              </button>
            </div>
          </form>
        </section>
      )}

      {view === "detail" && selected && (
        <section className="epidemiology-detail-view">
          <button
            className="epidemiology-back-link"
            onClick={() => setView("list")}
            type="button"
          >
            <ArrowLeft size={14} /> Voltar à lista
          </button>
          <div className="epidemiology-detail-heading">
            <div>
              <span className="epidemiology-eyebrow">
                REGISTRO DEMONSTRATIVO
              </span>
              <h3>{selected.id}</h3>
              <p>
                {getPersonName(selected.personId)} · referência{" "}
                {selected.personId}
              </p>
            </div>
            <span
              className={`epidemiology-status status-${statusTone(selected.status)}`}
            >
              {selected.status}
            </span>
          </div>

          <div className="epidemiology-detail-grid">
            <article>
              <span>Categoria</span>
              <strong>{selected.theme}</strong>
            </article>
            <article>
              <span>Data do registro</span>
              <strong>{dateLabel(selected.reportedAt)}</strong>
            </article>
            <article>
              <span>Data de início (se informada)</span>
              <strong>{dateLabel(selected.symptomOnsetAt)}</strong>
            </article>
            <article>
              <span>Unidade de referência</span>
              <strong>{getUnitName(selected.reportingUnitId)}</strong>
              <small>{selected.reportingUnitId}</small>
            </article>
            <article className="epidemiology-detail-wide">
              <span>Origem</span>
              <strong>{getOriginLabel(selected)}</strong>
              <small>
                Referência ao evento existente; sem cópia de narrativa ou
                detalhe de outro módulo.
              </small>
            </article>
          </div>

          {availableTransitions.length > 0 ? (
            <form
              className="epidemiology-update-form"
              onSubmit={handleStatusUpdate}
            >
              <div className="epidemiology-section-heading">
                <div>
                  <span className="epidemiology-eyebrow">ETAPA LOCAL</span>
                  <h3>Atualizar fluxo administrativo</h3>
                </div>
                <ListChecks size={19} />
              </div>
              <label className="epidemiology-field-wide">
                Próxima etapa disponível <span>*</span>
                <select
                  onChange={(event) =>
                    setNextStatus(event.target.value as EpidemiologyStatus | "")
                  }
                  required
                  value={nextStatus}
                >
                  <option value="">Selecione uma etapa</option>
                  {availableTransitions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
              {hasOpenSelectedPendings && (
                <small className="epidemiology-field-wide">
                  Conclua as pendências administrativas abertas antes de
                  concluir ou cancelar este fluxo.
                </small>
              )}
              <small className="epidemiology-field-wide">
                A atualização gera um evento pré-definido no histórico. Não há
                campo de narrativa clínica.
              </small>
              {updateError && (
                <p className="epidemiology-error">{updateError}</p>
              )}
              <button className="epidemiology-primary" type="submit">
                Atualizar etapa
              </button>
            </form>
          ) : (
            <div className="epidemiology-terminal-note">
              <CheckCircle2 size={16} /> Este fluxo administrativo está
              concluído ou cancelado; o histórico permanece disponível.
            </div>
          )}

          <section className="epidemiology-detail-pendings">
            <div className="epidemiology-section-title">
              <ListChecks size={18} />
              <div>
                <span>UNIDADE RESPONSÁVEL · PRAZO ADMINISTRATIVO OPCIONAL</span>
                <h3>Pendências vinculadas</h3>
              </div>
            </div>
            <p>
              Use somente tarefas operacionais pré-definidas. Datas não
              representam prazos assistenciais.
            </p>
            {selectedPendings.length ? (
              <div className="epidemiology-pending-list">
                {selectedPendings.map((pending) => (
                  <article
                    className="epidemiology-pending-card"
                    key={pending.id}
                  >
                    <div>
                      <strong>{pending.title}</strong>
                      <p>
                        {pending.id} · {getUnitName(pending.responsibleUnitId)}{" "}
                        · {pending.status}
                      </p>
                      <small>
                        {pending.dueAt
                          ? `Prazo administrativo: ${dateLabel(pending.dueAt)}`
                          : "Sem prazo administrativo definido"}
                      </small>
                      <div className="epidemiology-pending-history">
                        {pending.history.map((event) => (
                          <small key={event.id}>
                            {dateTimeLabel(event.at)} · {event.actor} ·{" "}
                            {event.fromStatus ?? "Criada"} → {event.toStatus} ·{" "}
                            {event.note}
                          </small>
                        ))}
                      </div>
                    </div>
                    <div className="epidemiology-pending-actions">
                      {pending.status === "Aberta" ||
                      !isTerminalStatus(selected.status) ? (
                        <button
                          className="epidemiology-pending-complete"
                          onClick={() =>
                            updatePendingStatus(
                              pending,
                              pending.status === "Aberta"
                                ? "Concluída"
                                : "Aberta",
                            )
                          }
                          type="button"
                        >
                          <Check size={13} />{" "}
                          {pending.status === "Aberta" ? "Concluir" : "Reabrir"}
                        </button>
                      ) : (
                        <small>
                          Fluxo encerrado; pendência concluída não pode ser
                          reaberta.
                        </small>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="epidemiology-empty">
                <ListChecks size={20} />
                <strong>Nenhuma pendência vinculada</strong>
                <p>
                  Crie somente tarefas administrativas da lista controlada
                  abaixo.
                </p>
              </div>
            )}

            {isTerminalStatus(selected.status) ? (
              <p className="epidemiology-form-help">
                Não é possível criar novas pendências após a conclusão ou o
                cancelamento administrativo.
              </p>
            ) : (
              <form
                className="epidemiology-form epidemiology-pending-form"
                onSubmit={addPending}
              >
                <label>
                  Tarefa administrativa <span>*</span>
                  <select defaultValue="" name="pendingAction" required>
                    <option value="">Selecione uma tarefa</option>
                    {pendingActions.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Unidade responsável <span>*</span>
                  <select
                    defaultValue={selected.reportingUnitId}
                    name="responsibleUnitId"
                    required
                  >
                    {activeUnits.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Prazo administrativo (opcional)
                  <input name="dueAt" type="date" />
                </label>
                {pendingError && (
                  <p className="epidemiology-error">{pendingError}</p>
                )}
                <div className="epidemiology-form-actions">
                  <button className="epidemiology-primary" type="submit">
                    Adicionar pendência
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="epidemiology-history">
            <div className="epidemiology-section-title">
              <History size={18} />
              <div>
                <span>TRILHA LOCAL</span>
                <h3>Histórico administrativo</h3>
              </div>
            </div>
            <ol>
              {[...selected.history].reverse().map((item) => (
                <li key={item.id}>
                  <span className="epidemiology-history-dot" />
                  <div>
                    <strong>{item.action}</strong>
                    <p>{item.note}</p>
                    <small>
                      {dateTimeLabel(item.at)} · {item.actor} · {item.toStatus}
                    </small>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </section>
      )}

      {view === "detail" && !selected && (
        <div className="epidemiology-empty">
          <Search size={22} />
          <strong>Registro não localizado</strong>
          <p>
            O item pode ter sido removido do conjunto demonstrativo desta
            sessão.
          </p>
          <button
            className="epidemiology-secondary"
            onClick={() => setView("list")}
            type="button"
          >
            Voltar à lista
          </button>
        </div>
      )}

      <footer className="epidemiology-footer">
        <Clock3 size={13} /> Dados e alterações fictícios mantidos apenas na
        sessão atual; não há persistência, integração ou exportação.
        <button
          className="epidemiology-link"
          onClick={() => openList("Todas")}
          type="button"
        >
          Consultar registros <ArrowRight size={13} />
        </button>
      </footer>
    </section>
  );
}
