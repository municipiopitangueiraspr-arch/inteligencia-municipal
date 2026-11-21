import { useMemo, useState, type FormEvent } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Clock3,
  FilePlus2,
  Filter,
  History,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import type { HealthActivitiesDataset } from "../data/healthActivities";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";
import {
  epidemiologyPriorities,
  epidemiologyStatuses,
  epidemiologyStatusTransitions,
  epidemiologyThemes,
  getHealthEpidemiologySummary,
  nextEpidemiologyNotificationId,
  type EpidemiologyHistoryEvent,
  type EpidemiologyNotification,
  type EpidemiologyPriority,
  type EpidemiologyStatus,
  type EpidemiologyTheme,
  type HealthEpidemiologyDataset,
} from "../data/healthEpidemiology";
import "./HealthEpidemiologyModule.css";

type ModuleView = "overview" | "list" | "create" | "detail";
type StatusFilter = "Todas" | "Triagem" | EpidemiologyStatus;
type Props = {
  dataset: HealthEpidemiologyDataset;
  peopleRegistry: PeopleRegistryDataset;
  healthActivities: HealthActivitiesDataset;
  onChange: (
    update: (current: HealthEpidemiologyDataset) => HealthEpidemiologyDataset,
  ) => void;
  onBack: () => void;
};

type OriginOption = {
  value: string;
  label: string;
  type: "Atendimento" | "Visita domiciliar";
};

const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value?: string) => {
  if (!value) return "Não informado";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "Não informado";
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
  status === "Em acompanhamento" || status === "Em avaliação"
    ? "amber"
    : status === "Cancelada" || status === "Descartada"
      ? "red"
      : status === "Nova"
        ? "blue"
        : "green";
const actor = "Secretaria de Saúde · demonstração";

export default function HealthEpidemiologyModule({
  dataset,
  peopleRegistry,
  healthActivities,
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
  const [priorityFilter, setPriorityFilter] = useState<
    "Todas" | EpidemiologyPriority
  >("Todas");
  const [formPersonId, setFormPersonId] = useState("");
  const [sourceValue, setSourceValue] = useState("");
  const [nextStatus, setNextStatus] = useState<EpidemiologyStatus | "">("");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [updateError, setUpdateError] = useState("");

  const summary = useMemo(
    () => getHealthEpidemiologySummary(dataset),
    [dataset],
  );
  const selected = dataset.notifications.find((item) => item.id === selectedId);
  const activePeople = peopleRegistry.people.filter(
    (item) => item.status === "Ativa",
  );
  const originOptions = useMemo<OriginOption[]>(() => {
    if (!formPersonId) return [];
    const services = healthActivities.serviceRecords
      .filter((item) => item.personId === formPersonId)
      .map((item) => ({
        value: `service:${item.id}`,
        label: `${item.id} · ${item.date} · ${item.serviceType}`,
        type: "Atendimento" as const,
      }));
    const visits = healthActivities.homeVisits
      .filter((item) => item.personId === formPersonId)
      .map((item) => ({
        value: `visit:${item.id}`,
        label: `${item.id} · ${item.date} · ${item.activityType}`,
        type: "Visita domiciliar" as const,
      }));
    return [...services, ...visits];
  }, [formPersonId, healthActivities]);

  const getPersonName = (personId: string) =>
    peopleRegistry.people.find((item) => item.id === personId)?.fullName ??
    "Pessoa não encontrada";
  const getOriginLabel = (item: EpidemiologyNotification) => {
    if (!item.originRecordId) return "Registro manual sem vínculo de origem";
    return `${item.originType} · ${item.originRecordId}`;
  };
  const filteredNotifications = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return dataset.notifications.filter((item) => {
      const searchText =
        `${item.id} ${getPersonName(item.personId)} ${item.theme} ${item.originRecordId ?? ""}`.toLocaleLowerCase(
          "pt-BR",
        );
      return (
        (!normalized || searchText.includes(normalized)) &&
        (statusFilter === "Todas" ||
          (statusFilter === "Triagem"
            ? item.status === "Nova" || item.status === "Em avaliação"
            : item.status === statusFilter)) &&
        (themeFilter === "Todos" || item.theme === themeFilter) &&
        (priorityFilter === "Todas" || item.priority === priorityFilter)
      );
    });
  }, [
    dataset.notifications,
    peopleRegistry.people,
    priorityFilter,
    search,
    statusFilter,
    themeFilter,
  ]);

  const clearNotice = () => {
    setSuccess("");
    setFormError("");
    setUpdateError("");
  };
  const openList = (status: StatusFilter = "Todas") => {
    setStatusFilter(status);
    setSearch("");
    setThemeFilter("Todos");
    setPriorityFilter("Todas");
    setView("list");
    clearNotice();
  };
  const openNotification = (id: string) => {
    setSelectedId(id);
    setNextStatus("");
    setView("detail");
    clearNotice();
  };
  const eventFor = (
    id: string,
    action: string,
    toStatus: EpidemiologyStatus,
    note: string,
    fromStatus?: EpidemiologyStatus,
  ): EpidemiologyHistoryEvent => ({
    id,
    at: new Date().toISOString(),
    actor,
    action,
    fromStatus,
    toStatus,
    note,
  });

  const createNotification = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const personId = String(values.get("personId") ?? "");
    const theme = String(values.get("theme") ?? "") as EpidemiologyTheme;
    const reportedAt = String(values.get("reportedAt") ?? "");
    const symptomOnsetAt =
      String(values.get("symptomOnsetAt") ?? "") || undefined;
    const initialNote = String(values.get("initialNote") ?? "").trim();
    const priority = String(
      values.get("priority") ?? epidemiologyPriorities[0],
    ) as EpidemiologyPriority;
    if (!activePeople.some((item) => item.id === personId)) {
      setFormError(
        "Selecione uma pessoa ativa já cadastrada no módulo de referência.",
      );
      return;
    }
    if (!epidemiologyThemes.includes(theme) || !reportedAt || !initialNote) {
      setFormError(
        "Informe pessoa, tema demonstrativo, data de notificação e nota inicial; campos só com espaços não são aceitos.",
      );
      return;
    }
    if (symptomOnsetAt && symptomOnsetAt > reportedAt) {
      setFormError(
        "A data de início não pode ser posterior à data de notificação.",
      );
      return;
    }
    let originType: EpidemiologyNotification["originType"] = "Registro manual";
    let originRecordId: string | undefined;
    if (sourceValue) {
      const origin = originOptions.find((item) => item.value === sourceValue);
      if (!origin) {
        setFormError(
          "A origem selecionada não corresponde à pessoa escolhida.",
        );
        return;
      }
      originType = origin.type;
      originRecordId = sourceValue.slice(sourceValue.indexOf(":") + 1);
    }
    const id = nextEpidemiologyNotificationId(dataset.notifications);
    const record: EpidemiologyNotification = {
      id,
      personId,
      theme,
      reportedAt,
      symptomOnsetAt,
      priority,
      originType,
      originRecordId,
      status: "Nova",
      initialNote,
      history: [
        eventFor(
          `${id}-H01`,
          "Notificação demonstrativa registrada",
          "Nova",
          "Registro fictício criado somente para esta sessão; não é uma notificação oficial.",
        ),
      ],
    };
    onChange((current) => ({
      ...current,
      notifications: [record, ...current.notifications],
    }));
    form.reset();
    setFormPersonId("");
    setSourceValue("");
    setSelectedId(id);
    setView("detail");
    setSuccess("Notificação demonstrativa criada nesta sessão.");
    setFormError("");
  };

  const updateNotification = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selected || !nextStatus) return;
    const allowed = epidemiologyStatusTransitions[selected.status];
    if (!allowed.includes(nextStatus)) {
      setUpdateError(
        "A transição escolhida não está disponível para esta etapa.",
      );
      return;
    }
    const form = event.currentTarget;
    const values = new FormData(form);
    const note = String(values.get("updateNote") ?? "").trim();
    const nextAction = String(values.get("nextAction") ?? "").trim();
    const followUpAt = String(values.get("followUpAt") ?? "") || undefined;
    if (!note) {
      setUpdateError(
        "Informe uma nota para preservar o motivo da atualização.",
      );
      return;
    }
    if (nextStatus === "Em acompanhamento" && (!nextAction || !followUpAt)) {
      setUpdateError(
        "Ao iniciar acompanhamento, informe a próxima ação e a data de retorno demonstrativa.",
      );
      return;
    }
    const historyId = `${selected.id}-H${String(selected.history.length + 1).padStart(2, "0")}`;
    const terminal = ["Encerrada", "Descartada", "Cancelada"].includes(
      nextStatus,
    );
    onChange((current) => ({
      ...current,
      notifications: current.notifications.map((item) => {
        if (item.id !== selected.id) return item;
        return {
          ...item,
          status: nextStatus,
          nextAction:
            terminal || nextStatus !== "Em acompanhamento"
              ? undefined
              : nextAction,
          followUpAt:
            terminal || nextStatus !== "Em acompanhamento"
              ? undefined
              : followUpAt,
          history: [
            ...item.history,
            eventFor(
              historyId,
              `Etapa demonstrativa atualizada para ${nextStatus}`,
              nextStatus,
              note,
              item.status,
            ),
          ],
        };
      }),
    }));
    form.reset();
    setNextStatus("");
    setSuccess("Etapa atualizada; o histórico anterior foi preservado.");
    setUpdateError("");
  };

  const renderHistory = (items: EpidemiologyHistoryEvent[]) => (
    <section className="epidemiology-history">
      <div className="epidemiology-section-title">
        <History size={17} />
        <div>
          <span>TRILHA CRONOLÓGICA</span>
          <h3>Histórico do registro</h3>
        </div>
      </div>
      <ol>
        {[...items].reverse().map((item) => (
          <li key={item.id}>
            <span className="epidemiology-history-dot" />
            <div>
              <strong>{item.action}</strong>
              <p>{item.note}</p>
              <small>
                {dateTimeLabel(item.at)} · {item.actor} ·{" "}
                {item.fromStatus ? `${item.fromStatus} → ` : ""}
                {item.toStatus}
              </small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );

  const pageTitle =
    view === "list"
      ? "Fila de notificações"
      : view === "create"
        ? "Nova notificação demonstrativa"
        : view === "detail"
          ? (selected?.id ?? "Detalhe da notificação")
          : "Vigilância Epidemiológica e Acompanhamento de Agravos";

  return (
    <section className="health-epidemiology-module">
      <header className="epidemiology-header">
        <div>
          <span className="epidemiology-eyebrow">
            SAÚDE · VIGILÂNCIA EPIDEMIOLÓGICA · DADOS FICTÍCIOS
          </span>
          <h2>{pageTitle}</h2>
          <p>
            Fila demonstrativa de notificações e acompanhamentos, vinculada a
            pessoas e eventos já cadastrados.
          </p>
        </div>
        <div className="epidemiology-header-actions">
          {view !== "overview" && (
            <button
              type="button"
              className="epidemiology-secondary"
              onClick={() => {
                setView("overview");
                clearNotice();
              }}
            >
              <ArrowLeft size={15} /> Resumo
            </button>
          )}
          {(view === "overview" || view === "list") && (
            <button
              type="button"
              className="epidemiology-primary"
              onClick={() => {
                setFormPersonId("");
                setSourceValue("");
                setView("create");
                clearNotice();
              }}
            >
              <FilePlus2 size={15} /> Nova notificação
            </button>
          )}
          <button
            type="button"
            className="epidemiology-secondary"
            onClick={onBack}
          >
            <ArrowLeft size={15} /> Catálogo
          </button>
        </div>
      </header>

      <div className="epidemiology-demo-note" role="note">
        <ShieldAlert size={17} />
        <p>
          Protótipo exclusivamente demonstrativo: registros, pessoas, temas,
          prazos e etapas são fictícios. Não insira dados reais. Os temas não
          são definições de caso nem notificações oficiais; esta tela não
          substitui avaliação profissional, protocolo vigente ou sistema de
          vigilância e não envia dados externos. Alterações ficam somente nesta
          sessão.
        </p>
      </div>
      {success && (
        <div className="epidemiology-success" role="status">
          <Check size={15} /> {success}
        </div>
      )}

      {view === "overview" && (
        <>
          <div className="epidemiology-metric-grid">
            <button onClick={() => openList()}>
              <span>Notificações demonstrativas</span>
              <strong>{summary.total}</strong>
              <small>registros na sessão</small>
            </button>
            <button onClick={() => openList("Triagem")}>
              <span>Novas ou em avaliação</span>
              <strong>{summary.triage}</strong>
              <small>fila de avaliação</small>
            </button>
            <button onClick={() => openList("Em acompanhamento")}>
              <span>Em acompanhamento</span>
              <strong>{summary.followUps}</strong>
              <small>etapas demonstrativas ativas</small>
            </button>
            <button onClick={() => openList("Em acompanhamento")}>
              <span>Retornos com data</span>
              <strong>{summary.scheduledReturns}</strong>
              <small>datas de referência na sessão</small>
            </button>
          </div>
          <div className="epidemiology-overview-grid">
            <article className="epidemiology-overview-card">
              <div className="epidemiology-section-title">
                <Activity size={18} />
                <div>
                  <span>FILA OPERACIONAL</span>
                  <h3>Notificações e acompanhamentos</h3>
                </div>
              </div>
              <p>
                Consulte o histórico demonstrativo, filtre a fila ou abra um
                novo registro vinculado a uma pessoa existente.
              </p>
              <button className="epidemiology-link" onClick={() => openList()}>
                Abrir fila <ArrowRight size={14} />
              </button>
            </article>
            <article className="epidemiology-overview-card">
              <div className="epidemiology-section-title">
                <UserRound size={18} />
                <div>
                  <span>REFERÊNCIAS EXISTENTES</span>
                  <h3>Pessoa e evento de origem</h3>
                </div>
              </div>
              <p>
                Reutilize uma pessoa ativa e, quando houver, associe uma visita
                ou atendimento já registrado, sem duplicar sua origem.
              </p>
              <button
                className="epidemiology-link"
                onClick={() => {
                  setFormPersonId("");
                  setSourceValue("");
                  setView("create");
                  clearNotice();
                }}
              >
                Registrar notificação <ArrowRight size={14} />
              </button>
            </article>
          </div>
          <div className="epidemiology-list-heading">
            <div>
              <span>ATUALIZAÇÕES RECENTES</span>
              <h3>Registros desta sessão</h3>
            </div>
            <button className="epidemiology-link" onClick={() => openList()}>
              Ver fila <ArrowRight size={14} />
            </button>
          </div>
          <div className="epidemiology-record-list">
            {dataset.notifications.slice(0, 3).map((item) => (
              <NotificationCard
                key={item.id}
                item={item}
                personName={getPersonName(item.personId)}
                originLabel={getOriginLabel(item)}
                onOpen={() => openNotification(item.id)}
              />
            ))}
          </div>
        </>
      )}

      {view === "list" && (
        <>
          <div className="epidemiology-filters">
            <label className="epidemiology-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar código, pessoa, tema ou origem"
                aria-label="Buscar notificações demonstrativas"
              />
            </label>
            <label>
              <Filter size={14} />
              <select
                aria-label="Filtrar por situação"
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
              >
                <option value="Todas">Todas as situações</option>
                <option value="Triagem">Novas ou em avaliação</option>
                {epidemiologyStatuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <select
                aria-label="Filtrar por tema demonstrativo"
                value={themeFilter}
                onChange={(event) =>
                  setThemeFilter(
                    event.target.value as "Todos" | EpidemiologyTheme,
                  )
                }
              >
                <option value="Todos">Todos os temas</option>
                {epidemiologyThemes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <select
                aria-label="Filtrar por prioridade ilustrativa"
                value={priorityFilter}
                onChange={(event) =>
                  setPriorityFilter(
                    event.target.value as "Todas" | EpidemiologyPriority,
                  )
                }
              >
                <option value="Todas">Todas as prioridades</option>
                {epidemiologyPriorities.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            {(search ||
              statusFilter !== "Todas" ||
              themeFilter !== "Todos" ||
              priorityFilter !== "Todas") && (
              <button
                className="epidemiology-clear"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("Todas");
                  setThemeFilter("Todos");
                  setPriorityFilter("Todas");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
          <div className="epidemiology-list-heading">
            <div>
              <span>FILA DE DEMONSTRAÇÃO</span>
              <h3>Notificações por pessoa e tema</h3>
            </div>
            <span>
              {filteredNotifications.length} de {dataset.notifications.length}{" "}
              registros
            </span>
          </div>
          <div className="epidemiology-record-list">
            {filteredNotifications.length ? (
              filteredNotifications.map((item) => (
                <NotificationCard
                  key={item.id}
                  item={item}
                  personName={getPersonName(item.personId)}
                  originLabel={getOriginLabel(item)}
                  onOpen={() => openNotification(item.id)}
                />
              ))
            ) : (
              <div className="epidemiology-empty">
                <Activity size={22} />
                <strong>Nenhum registro encontrado</strong>
                <p>Ajuste os filtros ou crie uma notificação fictícia.</p>
                <button
                  className="epidemiology-secondary"
                  onClick={() => {
                    setFormPersonId("");
                    setSourceValue("");
                    setView("create");
                    clearNotice();
                  }}
                >
                  <FilePlus2 size={14} /> Nova notificação
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {view === "create" && (
        <section className="epidemiology-form-view">
          <div className="epidemiology-section-heading">
            <div>
              <span>NOVO REGISTRO FICTÍCIO</span>
              <h3>Abrir notificação demonstrativa</h3>
              <p>Use somente os cadastros sintéticos desta demonstração.</p>
            </div>
            <FilePlus2 size={19} />
          </div>
          <form className="epidemiology-form" onSubmit={createNotification}>
            <label className="epidemiology-field-wide">
              Pessoa ativa já cadastrada <span>*</span>
              <select
                name="personId"
                value={formPersonId}
                onChange={(event) => {
                  setFormPersonId(event.target.value);
                  setSourceValue("");
                }}
                required
              >
                <option value="">Selecione uma pessoa fictícia</option>
                {activePeople.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName} · {item.id}
                  </option>
                ))}
              </select>
              <small>O módulo não cria nem duplica cadastros de pessoas.</small>
            </label>
            <label>
              Tema do agravo <span>*</span>
              <select
                name="theme"
                defaultValue={epidemiologyThemes[0]}
                required
              >
                {epidemiologyThemes.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <small>
                Rótulos didáticos, sem equivalência a classificação oficial.
              </small>
            </label>
            <label>
              Prioridade ilustrativa <span>*</span>
              <select
                name="priority"
                defaultValue={epidemiologyPriorities[0]}
                required
              >
                {epidemiologyPriorities.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Data de notificação <span>*</span>
              <input
                name="reportedAt"
                type="date"
                defaultValue={today()}
                required
              />
            </label>
            <label>
              Data de início (se conhecida)
              <input name="symptomOnsetAt" type="date" />
            </label>
            <label className="epidemiology-field-wide">
              Origem já cadastrada (opcional)
              <select
                value={sourceValue}
                onChange={(event) => setSourceValue(event.target.value)}
                disabled={!formPersonId || originOptions.length === 0}
              >
                <option value="">
                  {formPersonId
                    ? originOptions.length
                      ? "Registro manual, sem evento de origem"
                      : "Sem visita ou atendimento vinculado à pessoa"
                    : "Selecione primeiro uma pessoa"}
                </option>
                {originOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <small>
                Selecione apenas um atendimento ou visita existente da pessoa
                escolhida.
              </small>
            </label>
            <label className="epidemiology-field-wide">
              Nota inicial demonstrativa <span>*</span>
              <textarea
                name="initialNote"
                rows={3}
                maxLength={400}
                required
                placeholder="Use uma nota fictícia, sem dados reais ou identificadores oficiais."
              />
            </label>
            {formError && (
              <p className="epidemiology-error" role="alert">
                {formError}
              </p>
            )}
            <div className="epidemiology-form-actions">
              <button
                type="button"
                className="epidemiology-secondary"
                onClick={() => {
                  setView("list");
                  setFormError("");
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="epidemiology-primary">
                <Check size={15} /> Registrar nesta sessão
              </button>
            </div>
          </form>
        </section>
      )}

      {view === "detail" && selected && (
        <section className="epidemiology-detail-view">
          <button
            className="epidemiology-back-link"
            onClick={() => {
              setView("list");
              clearNotice();
            }}
          >
            <ArrowLeft size={14} /> Voltar à fila
          </button>
          <div className="epidemiology-detail-heading">
            <div>
              <span className="epidemiology-eyebrow">
                REGISTRO DEMONSTRATIVO
              </span>
              <h3>{getPersonName(selected.personId)}</h3>
              <p>
                {selected.id} · {selected.theme}
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
              <span>Pessoa de referência</span>
              <strong>{getPersonName(selected.personId)}</strong>
              <small>{selected.personId} · cadastro já existente</small>
            </article>
            <article>
              <span>Tema demonstrativo</span>
              <strong>{selected.theme}</strong>
              <small>Não representa definição de caso oficial</small>
            </article>
            <article>
              <span>Datas de referência</span>
              <strong>Notificação: {dateLabel(selected.reportedAt)}</strong>
              <small>
                Início informado: {dateLabel(selected.symptomOnsetAt)}
              </small>
            </article>
            <article>
              <span>Origem</span>
              <strong>{getOriginLabel(selected)}</strong>
              <small>Referência vinculada, sem duplicação do evento</small>
            </article>
            <article>
              <span>Prioridade ilustrativa</span>
              <strong>{selected.priority}</strong>
              <small>Não é classificação de risco oficial</small>
            </article>
            <article>
              <span>Próxima ação demonstrativa</span>
              <strong>{selected.nextAction ?? "Nenhuma ação em aberto"}</strong>
              <small>Retorno: {dateLabel(selected.followUpAt)}</small>
            </article>
            <article className="epidemiology-detail-wide">
              <span>Nota inicial</span>
              <p>{selected.initialNote}</p>
            </article>
          </div>

          {epidemiologyStatusTransitions[selected.status].length > 0 ? (
            <form
              className="epidemiology-update-form"
              onSubmit={updateNotification}
            >
              <div className="epidemiology-section-heading">
                <div>
                  <span>ACOMPANHAMENTO</span>
                  <h3>Registrar próxima etapa</h3>
                  <p>As etapas disponíveis dependem da situação atual.</p>
                </div>
                <Activity size={19} />
              </div>
              <label>
                Nova etapa demonstrativa <span>*</span>
                <select
                  value={nextStatus}
                  onChange={(event) =>
                    setNextStatus(event.target.value as EpidemiologyStatus | "")
                  }
                  required
                >
                  <option value="">Selecione uma etapa</option>
                  {epidemiologyStatusTransitions[selected.status].map(
                    (item) => (
                      <option key={item}>{item}</option>
                    ),
                  )}
                </select>
              </label>
              {nextStatus === "Em acompanhamento" && (
                <>
                  <label>
                    Próxima ação demonstrativa <span>*</span>
                    <input
                      name="nextAction"
                      maxLength={160}
                      required
                      placeholder="Descreva uma próxima ação fictícia"
                    />
                  </label>
                  <label>
                    Data de retorno demonstrativa <span>*</span>
                    <input name="followUpAt" type="date" required />
                  </label>
                </>
              )}
              <label className="epidemiology-field-wide">
                Nota da atualização <span>*</span>
                <textarea
                  name="updateNote"
                  rows={3}
                  maxLength={400}
                  required
                  placeholder="Explique a mudança usando texto fictício."
                />
              </label>
              {updateError && (
                <p className="epidemiology-error" role="alert">
                  {updateError}
                </p>
              )}
              <button type="submit" className="epidemiology-primary">
                <Check size={15} /> Salvar etapa nesta sessão
              </button>
            </form>
          ) : (
            <div className="epidemiology-terminal-note" role="note">
              <Check size={15} /> Esta etapa demonstrativa é final; o registro
              continua disponível para consulta do histórico.
            </div>
          )}
          {renderHistory(selected.history)}
        </section>
      )}

      <footer className="epidemiology-footer">
        <ShieldAlert size={13} />
        <span>Protótipo sem persistência, integração ou envio de dados.</span>
        <span>·</span>
        <span>Temas e etapas não têm validade oficial.</span>
      </footer>
    </section>
  );
}

type NotificationCardProps = {
  item: EpidemiologyNotification;
  personName: string;
  originLabel: string;
  onOpen: () => void;
};

function NotificationCard({
  item,
  personName,
  originLabel,
  onOpen,
}: NotificationCardProps) {
  return (
    <article className="epidemiology-record-card">
      <div className="epidemiology-record-main">
        <div className="epidemiology-record-title">
          <strong>{item.theme}</strong>
          <span
            className={`epidemiology-status status-${statusTone(item.status)}`}
          >
            {item.status}
          </span>
        </div>
        <p>
          {personName} <span>· {item.id}</span>
        </p>
        <div className="epidemiology-record-meta">
          <span>
            <CalendarDays size={13} /> Notificada: {dateLabel(item.reportedAt)}
          </span>
          <span>
            <UserRound size={13} /> {originLabel}
          </span>
          <span>
            <Activity size={13} /> {item.priority}
          </span>
          {item.followUpAt && (
            <span>
              <Clock3 size={13} /> Retorno: {dateLabel(item.followUpAt)}
            </span>
          )}
        </div>
      </div>
      <button className="epidemiology-open" onClick={onOpen}>
        Abrir registro <ArrowRight size={14} />
      </button>
    </article>
  );
}
