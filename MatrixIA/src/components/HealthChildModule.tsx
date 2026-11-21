import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  Check,
  ClipboardList,
  History,
  Search,
  ShieldAlert,
} from "lucide-react";
import type { HealthMaternalDataset } from "../data/healthMaternal";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";
import {
  childAdministrativePendingTypes,
  childTransitionNextStages,
  childTransitionStages,
  getHealthChildSummary,
  nextChildPendingId,
  nextChildReferenceId,
  nextChildTransitionId,
  type ChildAdministrativePendingType,
  type ChildTransition,
  type ChildTransitionHistoryEvent,
  type ChildTransitionStage,
  type HealthChildDataset,
} from "../data/healthChild";
import "./HealthChildModule.css";

type Props = {
  dataset: HealthChildDataset;
  maternalDataset: HealthMaternalDataset;
  healthTerritory: HealthTerritoryDataset;
  peopleRegistry: PeopleRegistryDataset;
  onChange: (
    update: (current: HealthChildDataset) => HealthChildDataset,
  ) => void;
  onBack: () => void;
  onOpenMaternal: (maternalFollowUpId: string) => void;
  mode: "secretary" | "operator";
  initialMaternalFollowUpId?: string;
  initialPendingId?: string;
};

type ModuleView = "transitions" | "pendings";
const actor = "Secretaria de Saúde · demonstração";
const owners = [
  "Equipe da APS · demonstração",
  "Secretaria de Saúde · demonstração",
] as const;
const dateLabel = (value?: string) => {
  if (!value) return "Sem data informada";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return "Sem data informada";
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

export default function HealthChildModule({
  dataset,
  maternalDataset,
  healthTerritory,
  peopleRegistry,
  onChange,
  onBack,
  onOpenMaternal,
  mode,
  initialMaternalFollowUpId,
  initialPendingId,
}: Props) {
  const pendingAtOpen = initialPendingId
    ? dataset.pendings.find((item) => item.id === initialPendingId)
    : undefined;
  const sourceAtOpen = initialMaternalFollowUpId
    ? dataset.transitions.find(
        (item) => item.maternalFollowUpId === initialMaternalFollowUpId,
      )
    : undefined;
  const [view, setView] = useState<ModuleView>(
    pendingAtOpen ? "pendings" : "transitions",
  );
  const focusedPendingId = initialPendingId;
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<
    "Todas" | ChildTransitionStage
  >("Todas");
  const [selectedId, setSelectedId] = useState<string | null>(
    pendingAtOpen?.transitionId ?? sourceAtOpen?.id ?? null,
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [nextStage, setNextStage] = useState<ChildTransitionStage | "">("");

  const activeUnits = healthTerritory.units.filter((unit) => unit.active);
  const activeTeams = healthTerritory.teams.filter((team) => team.active);
  const eligibleMaternalOrigins = maternalDataset.followUps.filter(
    (item) =>
      item.stage === "Puerpério" &&
      peopleRegistry.people.some(
        (person) => person.id === item.personId && person.status === "Ativa",
      ) &&
      !dataset.transitions.some(
        (transition) => transition.maternalFollowUpId === item.id,
      ),
  );
  const summary = useMemo(() => getHealthChildSummary(dataset), [dataset]);
  const selected = dataset.transitions.find((item) => item.id === selectedId);
  const selectedPending = selected
    ? dataset.pendings.filter((item) => item.transitionId === selected.id)
    : [];
  const selectedTasks = selectedPending;
  const unitName = (id: string) =>
    healthTerritory.units.find((unit) => unit.id === id)?.name ??
    "Unidade sintética não localizada";
  const teamName = (id: string) =>
    healthTerritory.teams.find((team) => team.id === id)?.name ??
    "Equipe sintética não localizada";
  const nextStageOption = selected
    ? childTransitionNextStages[selected.stage]
    : undefined;

  const filteredTransitions = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return dataset.transitions.filter((item) => {
      const unit = healthTerritory.units.find(
        (entry) => entry.id === item.unitId,
      );
      const text =
        `${item.id} ${item.childReferenceId} ${item.maternalFollowUpId} ${item.responsiblePersonId} ${unit?.name ?? ""}`.toLocaleLowerCase(
          "pt-BR",
        );
      return (
        (!normalized || text.includes(normalized)) &&
        (stageFilter === "Todas" || item.stage === stageFilter)
      );
    });
  }, [dataset.transitions, healthTerritory.units, query, stageFilter]);
  const visiblePendings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return dataset.pendings.filter((item) => {
      const transition = dataset.transitions.find(
        (entry) => entry.id === item.transitionId,
      );
      const text =
        `${item.id} ${item.title} ${item.assignedTo} ${item.transitionId} ${transition?.childReferenceId ?? ""} ${transition?.maternalFollowUpId ?? ""}`.toLocaleLowerCase(
          "pt-BR",
        );
      return !normalized || text.includes(normalized);
    });
  }, [dataset.transitions, dataset.pendings, query]);

  const addHistory = (
    transition: ChildTransition,
    action: string,
    note: string,
    toStage?: ChildTransitionStage,
  ): ChildTransitionHistoryEvent => ({
    id: `${transition.id}-H-${Date.now()}`,
    at: new Date().toISOString(),
    actor,
    action,
    note,
    fromStage: toStage ? transition.stage : undefined,
    toStage,
  });
  const openTransition = (id: string) => {
    setSelectedId(id);
    setError("");
    setMessage("");
    setNextStage("");
  };

  const createTransition = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const maternalFollowUpId = String(values.get("maternalFollowUpId") ?? "");
    const unitId = String(values.get("unitId") ?? "");
    const teamId = String(values.get("teamId") ?? "");
    const recordedAt = String(values.get("recordedAt") ?? "");
    const maternalOrigin = maternalDataset.followUps.find(
      (item) => item.id === maternalFollowUpId,
    );
    const personIsActive = peopleRegistry.people.some(
      (person) =>
        person.id === maternalOrigin?.personId && person.status === "Ativa",
    );
    const unitIsActive = activeUnits.some((unit) => unit.id === unitId);
    const teamIsActive = activeTeams.some(
      (team) => team.id === teamId && team.unitId === unitId,
    );
    const sourceCanTransition = Boolean(
      maternalOrigin?.stage === "Puerpério" &&
        personIsActive &&
        !dataset.transitions.some(
          (item) => item.maternalFollowUpId === maternalFollowUpId,
        ),
    );
    if (
      !maternalOrigin ||
      !sourceCanTransition ||
      !unitIsActive ||
      !teamIsActive ||
      !recordedAt
    ) {
      setError(
        "Selecione uma origem materna atualmente no puerpério, sem transição infantil já vinculada, uma unidade/equipe ativas e a data administrativa de registro.",
      );
      return;
    }

    const id = nextChildTransitionId(dataset.transitions);
    const childReferenceId = nextChildReferenceId(dataset.transitions);
    const transition: ChildTransition = {
      id,
      childReferenceId,
      maternalFollowUpId,
      responsiblePersonId: maternalOrigin.personId,
      unitId,
      teamId,
      recordedAt,
      stage: "Transição registrada",
      history: [
        {
          id: `${id}-H01`,
          at: new Date().toISOString(),
          actor,
          action: "Transição administrativa registrada",
          toStage: "Transição registrada",
          note: "Registro sintético da passagem do puerpério à APS; sem dados clínicos.",
        },
      ],
    };
    onChange((current) => ({
      ...current,
      transitions: [transition, ...current.transitions],
    }));
    setCreateOpen(false);
    setSelectedId(id);
    setView("transitions");
    setError("");
    setMessage("Transição fictícia incluída somente nesta sessão.");
    form.reset();
  };

  const updateStage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const targetStage = String(
      new FormData(event.currentTarget).get("stage") ?? "",
    ) as ChildTransitionStage;
    if (!selected || targetStage !== nextStageOption) {
      setError("Selecione somente a próxima etapa administrativa disponível.");
      return;
    }
    const historyEntry = addHistory(
      selected,
      "Etapa administrativa atualizada",
      "Etapa fictícia atualizada para demonstrar o fluxo; sem decisão clínica.",
      targetStage,
    );
    onChange((current) => ({
      ...current,
      transitions: current.transitions.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              stage: targetStage,
              history: [...item.history, historyEntry],
            }
          : item,
      ),
    }));
    setNextStage("");
    setError("");
    setMessage("Etapa administrativa atualizada somente nesta demonstração.");
    event.currentTarget.reset();
  };

  const createPending = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const transitionId = String(values.get("transitionId") ?? "");
    const title = String(
      values.get("title") ?? "",
    ) as ChildAdministrativePendingType;
    const assignedTo = String(
      values.get("assignedTo") ?? "",
    ) as (typeof owners)[number];
    const transition = dataset.transitions.find(
      (item) => item.id === transitionId,
    );
    if (
      !transition ||
      !childAdministrativePendingTypes.includes(title) ||
      !owners.includes(assignedTo)
    ) {
      setError(
        "Selecione um registro, uma conferência administrativa e um responsável demonstrativo.",
      );
      return;
    }
    const id = nextChildPendingId(dataset.pendings);
    const pending = {
      id,
      transitionId,
      title,
      assignedTo,
      status: "Aberta" as const,
      createdAt: new Date().toISOString(),
    };
    const historyEntry = addHistory(
      transition,
      "Pendência administrativa criada",
      `${id}: ${title}`,
    );
    onChange((current) => ({
      ...current,
      pendings: [pending, ...current.pendings],
      transitions: current.transitions.map((item) =>
        item.id === transitionId
          ? { ...item, history: [...item.history, historyEntry] }
          : item,
      ),
    }));
    setPendingOpen(false);
    setError("");
    setMessage("Pendência criada somente nesta sessão.");
    form.reset();
  };

  const completePending = (pendingId: string) => {
    const pending = dataset.pendings.find((item) => item.id === pendingId);
    const transition = pending
      ? dataset.transitions.find((item) => item.id === pending.transitionId)
      : undefined;
    if (!pending || !transition || pending.status !== "Aberta") return;
    const completedAt = new Date().toISOString();
    const historyEntry = addHistory(
      transition,
      "Pendência administrativa concluída",
      `${pending.id}: ${pending.title}`,
    );
    onChange((current) => ({
      ...current,
      pendings: current.pendings.map((item) =>
        item.id === pendingId
          ? { ...item, status: "Concluída", completedAt }
          : item,
      ),
      transitions: current.transitions.map((item) =>
        item.id === transition.id
          ? { ...item, history: [...item.history, historyEntry] }
          : item,
      ),
    }));
    setMessage("Pendência atualizada somente nesta sessão.");
  };

  const selectTransitionFromPending = (transitionId: string) => {
    openTransition(transitionId);
    setView("transitions");
  };

  return (
    <section className="child-module" aria-labelledby="child-title">
      <div className="child-module-heading">
        <button type="button" className="child-back" onClick={onBack}>
          <ArrowLeft size={15} /> Voltar aos módulos e serviços
        </button>
        <div className="child-heading-row">
          <div>
            <span className="child-eyebrow">
              {mode === "operator"
                ? "MEU TRABALHO · APS"
                : "SECRETARIA DE SAÚDE"}
            </span>
            <h2 id="child-title">Acompanhamento da Criança</h2>
            <p>
              Transição administrativa demonstrativa do puerpério para a APS.
            </p>
          </div>
          <button
            type="button"
            className="child-primary-button"
            onClick={() => {
              setCreateOpen(true);
              setError("");
              setMessage("");
            }}
            disabled={!eligibleMaternalOrigins.length}
            title={
              eligibleMaternalOrigins.length
                ? undefined
                : "Não há origem materna no puerpério sem transição infantil vinculada."
            }
          >
            <Baby size={16} /> Nova transição
          </button>
        </div>
      </div>

      <div className="child-safety-note" role="note">
        <ShieldAlert size={18} />
        <div>
          <strong>Demonstração fictícia — não insira dados reais.</strong>
          <p>
            Este fluxo cobre somente recepção e conferência administrativa da
            transição. Não contém orientação ou avaliação clínica, não substitui
            profissionais, protocolos, prontuário ou sistemas oficiais e não
            envia dados; alterações ficam nesta sessão.
          </p>
        </div>
      </div>

      {message && (
        <div className="child-message" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="child-error" role="alert">
          {error}
        </div>
      )}

      <div className="child-stats" aria-label="Resumo calculado dos registros">
        <article className="child-stat-card">
          <span>Transições sintéticas</span>
          <strong>{summary.total}</strong>
          <small>Registros na sessão</small>
        </article>
        <article className="child-stat-card">
          <span>Recebidas pela APS</span>
          <strong>{summary.received}</strong>
          <small>Etapa administrativa atual</small>
        </article>
        <article className="child-stat-card">
          <span>Referência conferida</span>
          <strong>{summary.verified}</strong>
          <small>Etapa administrativa atual</small>
        </article>
        <button
          type="button"
          className="child-stat-card child-stat-action"
          onClick={() => setView("pendings")}
        >
          <span>Pendências administrativas abertas</span>
          <strong>{summary.openPendings}</strong>
          <small>Contagem derivada dos registros</small>
        </button>
      </div>

      <div
        className="child-process-strip"
        aria-label="Etapas administrativas demonstrativas"
      >
        {childTransitionStages.map((stage, index) => {
          const count = dataset.transitions.filter(
            (item) => item.stage === stage,
          ).length;
          return (
            <div className="child-process-step" key={stage}>
              <span className="child-process-number">0{index + 1}</span>
              <div>
                <strong>{stage}</strong>
                <small>{count} registro(s) sintético(s)</small>
              </div>
              {index < childTransitionStages.length - 1 && (
                <ArrowRight size={14} />
              )}
            </div>
          );
        })}
      </div>

      <div
        className="child-view-tabs"
        role="tablist"
        aria-label="Listas do módulo"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "transitions"}
          className={view === "transitions" ? "active" : ""}
          onClick={() => setView("transitions")}
        >
          <Baby size={15} /> Transições ({summary.total})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "pendings"}
          className={view === "pendings" ? "active" : ""}
          onClick={() => setView("pendings")}
        >
          <ClipboardList size={15} /> Pendências ({summary.openPendings})
        </button>
      </div>

      <div className="child-toolbar">
        <label className="child-search">
          <Search size={16} />
          <input
            aria-label="Buscar transição ou pendência por código"
            placeholder="Buscar por identificador sintético ou unidade..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {view === "transitions" && (
          <label className="child-filter-label">
            <span>Etapa</span>
            <select
              value={stageFilter}
              onChange={(event) =>
                setStageFilter(
                  event.target.value as "Todas" | ChildTransitionStage,
                )
              }
            >
              <option value="Todas">Todas as etapas</option>
              {childTransitionStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {view === "transitions" ? (
        <div className="child-layout">
          <div className="child-case-list">
            {filteredTransitions.length ? (
              filteredTransitions.map((item) => {
                const openCount = dataset.pendings.filter(
                  (pending) =>
                    pending.transitionId === item.id &&
                    pending.status === "Aberta",
                ).length;
                return (
                  <button
                    type="button"
                    className={`child-case-card ${selectedId === item.id ? "selected" : ""}`}
                    key={item.id}
                    onClick={() => openTransition(item.id)}
                  >
                    <span
                      className={`child-case-mark child-stage-${childTransitionStages.indexOf(item.stage) + 1}`}
                    >
                      {item.stage === "Fluxo administrativo encerrado" ? (
                        <Check size={16} />
                      ) : (
                        <Baby size={16} />
                      )}
                    </span>
                    <span className="child-case-main">
                      <span className="child-case-id">
                        {item.id} <i>·</i> {item.childReferenceId}
                      </span>
                      <strong>{item.stage}</strong>
                      <small>
                        {unitName(item.unitId)} · {teamName(item.teamId)}
                      </small>
                    </span>
                    <span className="child-case-side">
                      <b>{openCount}</b>
                      <small>pendências</small>
                      <ArrowRight size={15} />
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="child-empty">
                Nenhuma transição corresponde à busca ou etapa selecionada.
              </div>
            )}
          </div>
          <aside className="child-detail-panel">
            {selected ? (
              <>
                <div className="child-detail-title">
                  <span className="child-eyebrow">
                    REGISTRO ADMINISTRATIVO · FICTÍCIO
                  </span>
                  <strong>{selected.id}</strong>
                  <small>
                    Referência sintética da criança: {selected.childReferenceId}
                  </small>
                </div>
                <dl className="child-detail-meta">
                  <div>
                    <dt>Etapa administrativa atual</dt>
                    <dd>{selected.stage}</dd>
                  </div>
                  <div>
                    <dt>Origem materna</dt>
                    <dd>{selected.maternalFollowUpId}</dd>
                  </div>
                  <div>
                    <dt>Referência municipal associada à origem</dt>
                    <dd>{selected.responsiblePersonId}</dd>
                  </div>
                  <div>
                    <dt>Unidade de referência APS</dt>
                    <dd>{unitName(selected.unitId)}</dd>
                  </div>
                  <div>
                    <dt>Equipe de referência APS</dt>
                    <dd>{teamName(selected.teamId)}</dd>
                  </div>
                  <div>
                    <dt>Data administrativa do registro</dt>
                    <dd>{dateLabel(selected.recordedAt)}</dd>
                  </div>
                </dl>
                <div className="child-origin-actions">
                  <button
                    type="button"
                    onClick={() => onOpenMaternal(selected.maternalFollowUpId)}
                  >
                    Abrir acompanhamento materno de origem{" "}
                    <ArrowRight size={14} />
                  </button>
                </div>
                {nextStageOption && (
                  <form className="child-inline-form" onSubmit={updateStage}>
                    <label htmlFor="child-next-stage">
                      Atualizar etapa administrativa
                    </label>
                    <select
                      id="child-next-stage"
                      name="stage"
                      required
                      value={nextStage}
                      onChange={(event) =>
                        setNextStage(event.target.value as ChildTransitionStage)
                      }
                    >
                      <option value="">
                        Selecione a próxima etapa disponível
                      </option>
                      <option value={nextStageOption}>{nextStageOption}</option>
                    </select>
                    <button type="submit" className="child-secondary-button">
                      Registrar mudança
                    </button>
                  </form>
                )}
                <div className="child-detail-subhead">
                  <strong>Pendências administrativas</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingOpen(true);
                      setError("");
                    }}
                  >
                    <ClipboardList size={14} /> Nova pendência
                  </button>
                </div>
                {selectedTasks.length ? (
                  <div className="child-task-list">
                    {selectedTasks.map((task) => (
                      <article className="child-task-row" key={task.id}>
                        <span
                          className={`child-task-dot ${task.status === "Concluída" ? "done" : "open"}`}
                        />
                        <div>
                          <strong>{task.title}</strong>
                          <small>
                            {task.id} · {task.assignedTo}
                          </small>
                          <small>
                            Conferência administrativa demonstrativa · sem prazo
                            assistencial
                          </small>
                        </div>
                        {task.status === "Aberta" ? (
                          <button
                            type="button"
                            aria-label={`Concluir ${task.title}`}
                            onClick={() => completePending(task.id)}
                          >
                            <Check size={15} />
                          </button>
                        ) : (
                          <span className="child-complete-label">
                            Concluída
                          </span>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="child-muted-copy">
                    Sem pendências administrativas vinculadas.
                  </p>
                )}
                <div className="child-history-block">
                  <h3>
                    <History size={15} /> Histórico administrativo
                  </h3>
                  <ol>
                    {[...selected.history].reverse().map((event) => (
                      <li key={event.id}>
                        <span className="child-history-dot" />
                        <div>
                          <strong>{event.action}</strong>
                          {event.fromStage && event.toStage && (
                            <small>
                              {event.fromStage} → {event.toStage}
                            </small>
                          )}
                          <p>{event.note}</p>
                          <time>
                            {dateTimeLabel(event.at)} · {event.actor}
                          </time>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            ) : (
              <div className="child-detail-empty">
                <Baby size={23} />
                <strong>Selecione uma transição</strong>
                <p>
                  Consulte os códigos sintéticos, a referência APS, as
                  pendências e a origem no puerpério.
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="child-pendings-list">
          {visiblePendings.length ? (
            visiblePendings.map((task) => {
              const transition = dataset.transitions.find(
                (item) => item.id === task.transitionId,
              );
              return (
                <article
                  className={`child-pending-card ${focusedPendingId === task.id ? "focused" : ""}`}
                  key={task.id}
                  aria-current={focusedPendingId === task.id ? "true" : undefined}
                >
                  <span
                    className={`child-task-dot ${task.status === "Concluída" ? "done" : "open"}`}
                  />
                  <div className="child-pending-main">
                    <span>
                      {task.id} · {task.transitionId} ·{" "}
                      {transition?.childReferenceId ??
                        "Referência sintética não localizada"}
                    </span>
                    <strong>{task.title}</strong>
                    <small>Responsável demonstrativo: {task.assignedTo}</small>
                    <small>
                      Registro {task.status.toLocaleLowerCase("pt-BR")} · sem
                      prazo assistencial
                    </small>
                  </div>
                  <div className="child-pending-actions">
                    {task.status === "Aberta" && (
                      <button
                        type="button"
                        onClick={() => completePending(task.id)}
                      >
                        <Check size={14} /> Marcar conferência concluída
                      </button>
                    )}
                    {transition && (
                      <button
                        type="button"
                        className="child-link-button"
                        onClick={() =>
                          selectTransitionFromPending(task.transitionId)
                        }
                      >
                        Abrir origem <ArrowRight size={14} />
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="child-empty">
              Nenhuma pendência corresponde à busca.
            </div>
          )}
        </div>
      )}

      <div className="child-provenance">
        <History size={16} />
        <div>
          <strong>Origem dos resumos e limites do fluxo</strong>
          <p>
            Etapas e pendências são contadas diretamente das coleções fictícias
            em memória. Cada transição aponta para um acompanhamento materno que
            passou pelo puerpério e para uma unidade/equipe sintéticas; datas
            são apenas administrativas. Não são dados civis ou clínicos, não há
            prazos assistenciais e nada é transmitido a e-SUS APS/Siaps, SINASC,
            RNDS, CARE-PR ou outros sistemas oficiais.
          </p>
        </div>
      </div>

      {createOpen && (
        <div
          className="child-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}
        >
          <section
            className="child-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="child-create-title"
          >
            <button
              className="child-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setCreateOpen(false)}
            >
              ×
            </button>
            <span className="child-eyebrow">NOVA TRANSIÇÃO SINTÉTICA</span>
            <h3 id="child-create-title">
              Registrar passagem administrativa à APS
            </h3>
            <p>
              Use somente referências fictícias. O código gerado não é cadastro
              civil ou clínico; não informe dados de identificação ou saúde.
            </p>
            <form className="child-form" onSubmit={createTransition}>
              <label>
                Origem materna no puerpério
                <select
                  name="maternalFollowUpId"
                  required
                  defaultValue={
                    initialMaternalFollowUpId &&
                    eligibleMaternalOrigins.some(
                      (item) => item.id === initialMaternalFollowUpId,
                    )
                      ? initialMaternalFollowUpId
                      : ""
                  }
                >
                  <option value="" disabled>
                    Selecione um acompanhamento materno
                  </option>
                  {eligibleMaternalOrigins.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} · referência {item.personId}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unidade demonstrativa da APS
                <select name="unitId" required defaultValue="">
                  <option value="" disabled>
                    Selecione uma unidade
                  </option>
                  {activeUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Equipe demonstrativa da APS
                <select name="teamId" required defaultValue="">
                  <option value="" disabled>
                    Selecione uma equipe
                  </option>
                  {activeTeams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name} · {unitName(team.unitId)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Data administrativa do registro
                <input type="date" name="recordedAt" required />
              </label>
              <div className="child-form-actions">
                <button
                  type="button"
                  className="child-secondary-button"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="child-primary-button">
                  Criar nesta sessão
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {pendingOpen && (
        <div
          className="child-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingOpen(false);
          }}
        >
          <section
            className="child-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="child-pending-title"
          >
            <button
              className="child-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setPendingOpen(false)}
            >
              ×
            </button>
            <span className="child-eyebrow">
              PENDÊNCIA OPERACIONAL · SEM CONTEÚDO CLÍNICO
            </span>
            <h3 id="child-pending-title">Criar conferência administrativa</h3>
            <p>
              Escolha uma opção controlada. Não há campo de texto livre nem
              prazo assistencial.
            </p>
            <form className="child-form" onSubmit={createPending}>
              <label>
                Transição de origem
                <select
                  name="transitionId"
                  required
                  defaultValue={selected?.id ?? ""}
                >
                  <option value="" disabled>
                    Selecione a transição
                  </option>
                  {dataset.transitions.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} · {item.childReferenceId}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Conferência administrativa
                <select name="title" required defaultValue="">
                  <option value="" disabled>
                    Selecione uma opção
                  </option>
                  {childAdministrativePendingTypes.map((title) => (
                    <option key={title} value={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Responsável demonstrativo
                <select name="assignedTo" required defaultValue="">
                  <option value="" disabled>
                    Selecione a área responsável
                  </option>
                  {owners.map((owner) => (
                    <option key={owner} value={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </label>
              <div className="child-form-actions">
                <button
                  type="button"
                  className="child-secondary-button"
                  onClick={() => setPendingOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="child-primary-button">
                  Criar conferência
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
