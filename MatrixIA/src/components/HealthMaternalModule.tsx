import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ClipboardList,
  Clock3,
  FilePlus2,
  History,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";
import {
  getHealthMaternalSummary,
  maternalStageTransitions,
  maternalStages,
  nextMaternalFollowUpId,
  nextMaternalPendingId,
  type HealthMaternalDataset,
  type MaternalFollowUp,
  type MaternalHistoryEvent,
  type MaternalStage,
} from "../data/healthMaternal";
import "./HealthMaternalModule.css";

type Props = {
  dataset: HealthMaternalDataset;
  peopleRegistry: PeopleRegistryDataset;
  healthTerritory: HealthTerritoryDataset;
  onChange: (
    update: (current: HealthMaternalDataset) => HealthMaternalDataset,
  ) => void;
  onBack: () => void;
  onOpenChildTransition?: (maternalFollowUpId: string) => void;
  initialFollowUpId?: string;
  mode: "secretary" | "operator";
};

type ModuleView = "overview" | "pendings";
const referenceDate = "2026-11-19";
const actor = "Secretaria de Saúde · demonstração";
const administrativePendingTemplates = [
  "Vincular o registro de atendimento à referência da unidade",
  "Conferir o preenchimento administrativo do registro de nascimento",
  "Atualizar a unidade de referência no cadastro do acompanhamento",
  "Conferir o encerramento administrativo do registro",
] as const;
const administrativeOwners = [
  "Equipe da UBS · demonstração",
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
const isOverdue = (dueAt?: string) => Boolean(dueAt && dueAt < referenceDate);

export default function HealthMaternalModule({
  dataset,
  peopleRegistry,
  healthTerritory,
  onChange,
  onBack,
  onOpenChildTransition,
  initialFollowUpId,
  mode,
}: Props) {
  const [view, setView] = useState<ModuleView>("overview");
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<"Todas" | MaternalStage>(
    "Todas",
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [nextStage, setNextStage] = useState<MaternalStage | "">("");
  useEffect(() => {
    if (initialFollowUpId) {
      setSelectedId(initialFollowUpId);
      setView("overview");
    }
  }, [initialFollowUpId]);
  const activePeople = peopleRegistry.people.filter(
    (person) => person.status === "Ativa",
  );
  const activeUnits = healthTerritory.units.filter((unit) => unit.active);
  const activeTeams = healthTerritory.teams.filter((team) => team.active);
  const summary = useMemo(
    () => getHealthMaternalSummary(dataset, referenceDate),
    [dataset],
  );
  const selected = dataset.followUps.find((item) => item.id === selectedId);
  const selectedTasks = selected
    ? dataset.pendings.filter((item) => item.followUpId === selected.id)
    : [];
  const filteredFollowUps = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return dataset.followUps.filter((item) => {
      const unit = healthTerritory.units.find(
        (entry) => entry.id === item.unitId,
      );
      const person = peopleRegistry.people.find(
        (entry) => entry.id === item.personId,
      );
      const searchText =
        `${item.id} ${item.personId} ${unit?.name ?? ""} ${person?.id ?? ""}`.toLocaleLowerCase(
          "pt-BR",
        );
      return (
        (!normalized || searchText.includes(normalized)) &&
        (stageFilter === "Todas" || item.stage === stageFilter)
      );
    });
  }, [
    dataset.followUps,
    healthTerritory.units,
    peopleRegistry.people,
    query,
    stageFilter,
  ]);
  const visiblePendings = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return dataset.pendings.filter((item) => {
      const followUp = dataset.followUps.find(
        (entry) => entry.id === item.followUpId,
      );
      const text =
        `${item.id} ${item.title} ${item.assignedTo} ${item.followUpId} ${followUp?.personId ?? ""}`.toLocaleLowerCase(
          "pt-BR",
        );
      return !normalized || text.includes(normalized);
    });
  }, [dataset.followUps, dataset.pendings, query]);

  const addHistory = (
    id: string,
    action: string,
    note: string,
    fromStage?: MaternalStage,
    toStage?: MaternalStage,
  ): MaternalHistoryEvent => ({
    id,
    at: new Date().toISOString(),
    actor,
    action,
    note,
    fromStage,
    toStage,
  });
  const unitName = (id: string) =>
    healthTerritory.units.find((unit) => unit.id === id)?.name ??
    "Unidade sintética não localizada";
  const teamName = (id: string) =>
    healthTerritory.teams.find((team) => team.id === id)?.name ??
    "Equipe sintética não localizada";
  const openCase = (id: string) => {
    setSelectedId(id);
    setNextStage("");
    setError("");
    setMessage("");
  };
  const nextStageOptions = selected
    ? maternalStages.filter(
        (stage) => maternalStageTransitions[selected.stage] === stage,
      )
    : [];

  const createFollowUp = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const personId = String(values.get("personId") ?? "");
    const unitId = String(values.get("unitId") ?? "");
    const teamId = String(values.get("teamId") ?? "");
    const openedAt = String(values.get("openedAt") ?? "");
    const personIsActive = activePeople.some(
      (person) => person.id === personId,
    );
    const unitIsActive = activeUnits.some((unit) => unit.id === unitId);
    const teamIsActive = activeTeams.some(
      (team) => team.id === teamId && team.unitId === unitId,
    );
    if (!personIsActive || !unitIsActive || !teamIsActive || !openedAt) {
      setError(
        "Selecione uma referência, uma unidade e uma equipe sintéticas ativas, além da data administrativa de abertura.",
      );
      return;
    }
    const alreadyActive = dataset.followUps.some(
      (item) => item.personId === personId && item.stage !== "Encerrado",
    );
    if (alreadyActive) {
      setError(
        "Já há um acompanhamento demonstrativo em aberto para essa referência.",
      );
      return;
    }
    const id = nextMaternalFollowUpId(dataset.followUps);
    const followUp: MaternalFollowUp = {
      id,
      personId,
      unitId,
      teamId,
      openedAt,
      stage: "Pré-natal",
      history: [
        addHistory(
          `${id}-H01`,
          "Acompanhamento demonstrativo aberto",
          "Registro administrativo sintético; não incluir informação clínica.",
          undefined,
          "Pré-natal",
        ),
      ],
    };
    onChange((current) => ({
      ...current,
      followUps: [followUp, ...current.followUps],
    }));
    setCreateOpen(false);
    setSelectedId(id);
    setError("");
    setMessage("Acompanhamento fictício incluído somente nesta sessão.");
    form.reset();
  };

  const updateStage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const toStage = String(values.get("stage") ?? "") as MaternalStage;
    if (!selected || !nextStageOptions.includes(toStage)) {
      setError("Selecione a próxima etapa administrativa disponível.");
      return;
    }
    const historyEntry = addHistory(
      `${selected.id}-H-${Date.now()}`,
      "Etapa administrativa atualizada",
      "Etapa demonstrativa registrada; sem informação ou orientação clínica.",
      selected.stage,
      toStage,
    );
    onChange((current) => ({
      ...current,
      followUps: current.followUps.map((item) =>
        item.id === selected.id
          ? {
              ...item,
              stage: toStage,
              history: [...item.history, historyEntry],
            }
          : item,
      ),
    }));
    setNextStage("");
    setError("");
    setMessage("Etapa atualizada apenas na demonstração.");
    form.reset();
  };

  const createPending = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const followUpId = String(values.get("followUpId") ?? "");
    const title = String(values.get("title") ?? "").trim();
    const assignedTo = String(values.get("assignedTo") ?? "").trim();
    const dueAt = String(values.get("dueAt") ?? "") || undefined;
    if (
      !dataset.followUps.some((item) => item.id === followUpId) ||
      !administrativePendingTemplates.includes(
        title as (typeof administrativePendingTemplates)[number],
      ) ||
      !administrativeOwners.includes(
        assignedTo as (typeof administrativeOwners)[number],
      )
    ) {
      setError(
        "Escolha um acompanhamento e informe a pendência administrativa e a equipe responsável.",
      );
      return;
    }
    const id = nextMaternalPendingId(dataset.pendings);
    const pending = {
      id,
      followUpId,
      title,
      assignedTo,
      dueAt,
      status: "Aberta" as const,
      createdAt: new Date().toISOString(),
    };
    const historyEntry = addHistory(
      `${followUpId}-H-${Date.now()}`,
      "Pendência administrativa criada",
      `${id}: ${title}`,
    );
    onChange((current) => ({
      ...current,
      pendings: [pending, ...current.pendings],
      followUps: current.followUps.map((item) =>
        item.id === followUpId
          ? { ...item, history: [...item.history, historyEntry] }
          : item,
      ),
    }));
    setPendingOpen(false);
    setError("");
    setMessage("Pendência administrativa criada somente nesta sessão.");
    form.reset();
  };

  const completePending = (pendingId: string) => {
    const pending = dataset.pendings.find((item) => item.id === pendingId);
    if (!pending || pending.status !== "Aberta") return;
    const completedAt = new Date().toISOString();
    const historyEntry = addHistory(
      `${pending.followUpId}-H-${Date.now()}`,
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
      followUps: current.followUps.map((item) =>
        item.id === pending.followUpId
          ? { ...item, history: [...item.history, historyEntry] }
          : item,
      ),
    }));
    setMessage("Pendência atualizada nesta sessão.");
  };

  const selectCaseFromPending = (followUpId: string) => {
    openCase(followUpId);
    setView("overview");
  };

  return (
    <section className="maternal-module" aria-labelledby="maternal-title">
      <div className="maternal-module-heading">
        <button type="button" className="maternal-back" onClick={onBack}>
          <ArrowLeft size={15} /> Voltar aos módulos e serviços
        </button>
        <div className="maternal-heading-row">
          <div>
            <span className="maternal-eyebrow">
              {mode === "operator"
                ? "MEU TRABALHO · SAÚDE"
                : "SECRETARIA DE SAÚDE"}
            </span>
            <h2 id="maternal-title">
              Atenção à Saúde da Mulher, Pré-Natal e Puerpério
            </h2>
            <p>
              Organização demonstrativa das etapas e dos registros de
              acompanhamento.
            </p>
          </div>
          <button
            type="button"
            className="maternal-primary-button"
            onClick={() => {
              setCreateOpen(true);
              setError("");
              setMessage("");
            }}
          >
            <FilePlus2 size={16} /> Novo acompanhamento
          </button>
        </div>
      </div>

      <div className="maternal-safety-note" role="note">
        <ShieldAlert size={18} />
        <div>
          <strong>Demonstração fictícia — não insira dados reais.</strong>
          <p>
            Não oferece condutas clínicas nem substitui avaliação profissional,
            protocolos, prontuário ou sistemas oficiais. Nenhum dado é enviado;
            alterações ficam somente nesta sessão.
          </p>
        </div>
      </div>

      {message && (
        <div className="maternal-message" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="maternal-error" role="alert">
          {error}
        </div>
      )}

      <div
        className="maternal-stats"
        aria-label="Resumo derivado dos registros"
      >
        <article className="maternal-stat-card">
          <span>Acompanhamentos sintéticos</span>
          <strong>{summary.total}</strong>
          <small>Registros na sessão</small>
        </article>
        <article className="maternal-stat-card">
          <span>Etapa pré-natal</span>
          <strong>{summary.prenatal}</strong>
          <small>Casos nessa etapa</small>
        </article>
        <article className="maternal-stat-card">
          <span>Etapa puerpério</span>
          <strong>{summary.postpartum}</strong>
          <small>Casos nessa etapa</small>
        </article>
        <button
          type="button"
          className="maternal-stat-card maternal-stat-action"
          onClick={() => setView("pendings")}
        >
          <span>Pendências administrativas abertas</span>
          <strong>{summary.openPendings}</strong>
          <small>
            {summary.overduePendings} após a data de referência demonstrativa
          </small>
        </button>
      </div>

      <div
        className="maternal-process-strip"
        aria-label="Etapas do fluxo demonstrativo"
      >
        {maternalStages.map((stage, index) => {
          const count = dataset.followUps.filter(
            (item) => item.stage === stage,
          ).length;
          return (
            <div className="maternal-process-step" key={stage}>
              <span className="maternal-process-number">0{index + 1}</span>
              <div>
                <strong>{stage}</strong>
                <small>{count} registro(s) sintético(s)</small>
              </div>
              {index < maternalStages.length - 1 && <ArrowRight size={14} />}
            </div>
          );
        })}
      </div>

      <div
        className="maternal-view-tabs"
        role="tablist"
        aria-label="Listas do módulo"
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === "overview"}
          className={view === "overview" ? "active" : ""}
          onClick={() => setView("overview")}
        >
          <UserRound size={15} /> Acompanhamentos ({summary.total})
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

      <div className="maternal-toolbar">
        <label className="maternal-search">
          <Search size={16} />
          <input
            aria-label="Buscar acompanhamento ou pendência"
            placeholder="Buscar por código, unidade ou registro..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {view === "overview" && (
          <label className="maternal-filter-label">
            <span>Etapa</span>
            <select
              value={stageFilter}
              onChange={(event) =>
                setStageFilter(event.target.value as "Todas" | MaternalStage)
              }
            >
              <option value="Todas">Todas as etapas</option>
              {maternalStages.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {view === "overview" ? (
        <div className="maternal-layout">
          <div className="maternal-case-list">
            {filteredFollowUps.length ? (
              filteredFollowUps.map((item) => {
                const pendingCount = dataset.pendings.filter(
                  (pending) =>
                    pending.followUpId === item.id &&
                    pending.status === "Aberta",
                ).length;
                return (
                  <button
                    type="button"
                    className={`maternal-case-card ${selectedId === item.id ? "selected" : ""}`}
                    key={item.id}
                    onClick={() => openCase(item.id)}
                  >
                    <span
                      className={`maternal-case-mark maternal-stage-${maternalStages.indexOf(item.stage) + 1}`}
                    >
                      {item.stage === "Encerrado" ? (
                        <Check size={16} />
                      ) : (
                        <UserRound size={16} />
                      )}
                    </span>
                    <span className="maternal-case-main">
                      <span className="maternal-case-id">
                        {item.id} <i>·</i> {item.personId}
                      </span>
                      <strong>{item.stage}</strong>
                      <small>
                        {unitName(item.unitId)} · {teamName(item.teamId)}
                      </small>
                    </span>
                    <span className="maternal-case-side">
                      <b>{pendingCount}</b>
                      <small>pendências</small>
                      <ArrowRight size={15} />
                    </span>
                  </button>
                );
              })
            ) : (
              <div className="maternal-empty">
                Nenhum acompanhamento corresponde à busca ou etapa selecionada.
              </div>
            )}
          </div>
          <aside className="maternal-detail-panel">
            {selected ? (
              <>
                <div className="maternal-detail-title">
                  <span className="maternal-eyebrow">
                    REGISTRO DE ORIGEM · FICTÍCIO
                  </span>
                  <strong>{selected.id}</strong>
                  <small>Referência municipal: {selected.personId}</small>
                </div>
                <dl className="maternal-detail-meta">
                  <div>
                    <dt>Etapa atual</dt>
                    <dd>{selected.stage}</dd>
                  </div>
                  <div>
                    <dt>Unidade de referência</dt>
                    <dd>{unitName(selected.unitId)}</dd>
                  </div>
                  <div>
                    <dt>Equipe de referência</dt>
                    <dd>{teamName(selected.teamId)}</dd>
                  </div>
                  <div>
                    <dt>Abertura administrativa</dt>
                    <dd>{dateLabel(selected.openedAt)}</dd>
                  </div>
                </dl>
                {selected.stage === "Puerpério" && onOpenChildTransition && (
                  <button
                    type="button"
                    className="maternal-child-handoff"
                    onClick={() => onOpenChildTransition(selected.id)}
                  >
                    Abrir transição administrativa da criança à APS{" "}
                    <ArrowRight size={14} />
                  </button>
                )}
                {nextStageOptions.length > 0 && (
                  <form className="maternal-inline-form" onSubmit={updateStage}>
                    <label htmlFor="maternal-next-stage">
                      Atualizar etapa do fluxo
                    </label>
                    <select
                      id="maternal-next-stage"
                      name="stage"
                      required
                      value={nextStage}
                      onChange={(event) =>
                        setNextStage(event.target.value as MaternalStage)
                      }
                    >
                      <option value="">
                        Selecione a próxima etapa disponível
                      </option>
                      {nextStageOptions.map((stage) => (
                        <option key={stage} value={stage}>
                          {stage}
                        </option>
                      ))}
                    </select>
                    <button type="submit" className="maternal-secondary-button">
                      Registrar mudança
                    </button>
                  </form>
                )}
                <div className="maternal-detail-subhead">
                  <strong>Pendências relacionadas</strong>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingOpen(true);
                      setError("");
                    }}
                  >
                    <FilePlus2 size={14} /> Nova pendência
                  </button>
                </div>
                {selectedTasks.length ? (
                  <div className="maternal-task-list">
                    {selectedTasks.map((task) => (
                      <article className="maternal-task-row" key={task.id}>
                        <span
                          className={`maternal-task-dot ${task.status === "Concluída" ? "done" : isOverdue(task.dueAt) ? "late" : "open"}`}
                        />
                        <div>
                          <strong>{task.title}</strong>
                          <small>
                            {task.id} · {task.assignedTo}
                          </small>
                          <small>
                            Prazo administrativo fictício:{" "}
                            {dateLabel(task.dueAt)}
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
                          <span className="maternal-complete-label">
                            Concluída
                          </span>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="maternal-muted-copy">
                    Sem pendências administrativas vinculadas.
                  </p>
                )}
                <div className="maternal-history-block">
                  <h3>
                    <History size={15} /> Histórico do registro
                  </h3>
                  <ol>
                    {[...selected.history].reverse().map((event) => (
                      <li key={event.id}>
                        <span className="maternal-history-dot" />
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
              <div className="maternal-detail-empty">
                <UserRound size={23} />
                <strong>Selecione um acompanhamento</strong>
                <p>
                  Veja a referência sintética, as pendências e a trilha de
                  alterações do registro de origem.
                </p>
              </div>
            )}
          </aside>
        </div>
      ) : (
        <div className="maternal-pendings-list">
          {visiblePendings.length ? (
            visiblePendings.map((task) => {
              const followUp = dataset.followUps.find(
                (item) => item.id === task.followUpId,
              );
              return (
                <article className="maternal-pending-card" key={task.id}>
                  <span
                    className={`maternal-task-dot ${task.status === "Concluída" ? "done" : isOverdue(task.dueAt) ? "late" : "open"}`}
                  />
                  <div className="maternal-pending-main">
                    <span>
                      {task.id} · {task.followUpId}
                    </span>
                    <strong>{task.title}</strong>
                    <small>
                      Referência sintética:{" "}
                      {followUp?.personId ?? "Não localizada"} · Responsável:{" "}
                      {task.assignedTo}
                    </small>
                    <small>
                      Prazo administrativo demonstrativo:{" "}
                      {dateLabel(task.dueAt)} · {task.status}
                    </small>
                  </div>
                  <div className="maternal-pending-actions">
                    {task.status === "Aberta" && (
                      <button
                        type="button"
                        onClick={() => completePending(task.id)}
                      >
                        <Check size={14} /> Marcar registro conferido
                      </button>
                    )}
                    <button
                      type="button"
                      className="maternal-link-button"
                      onClick={() => selectCaseFromPending(task.followUpId)}
                    >
                      Abrir origem <ArrowRight size={14} />
                    </button>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="maternal-empty">
              Nenhuma pendência corresponde à busca.
            </div>
          )}
        </div>
      )}

      <div className="maternal-provenance">
        <Clock3 size={16} />
        <div>
          <strong>Como os resumos são formados</strong>
          <p>
            Os totais vêm do conjunto completo de acompanhamentos e pendências
            em memória, sem mudar com a busca ou o filtro de etapa. “Após a data
            de referência” conta pendências abertas com prazo anterior a
            19/nov/2026. Os identificadores SIM-* são fictícios; os registros
            não são enviados a Siaps/e-SUS APS, SINASC, RNDS, CARE-PR ou outro
            sistema oficial.
          </p>
        </div>
      </div>

      {createOpen && (
        <div
          className="maternal-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}
        >
          <section
            className="maternal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maternal-create-title"
          >
            <button
              className="maternal-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setCreateOpen(false)}
            >
              ×
            </button>
            <span className="maternal-eyebrow">NOVO REGISTRO SINTÉTICO</span>
            <h3 id="maternal-create-title">
              Abrir acompanhamento demonstrativo
            </h3>
            <p>
              Selecione referências fictícias já existentes. Não informe nomes,
              contatos ou dados clínicos.
            </p>
            <form className="maternal-form" onSubmit={createFollowUp}>
              <label>
                Referência fictícia
                <select name="personId" required defaultValue="">
                  <option value="" disabled>
                    Selecione um código sintético
                  </option>
                  {activePeople.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unidade demonstrativa
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
                Equipe demonstrativa
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
                Data administrativa de abertura
                <input type="date" name="openedAt" required />
              </label>
              <div className="maternal-form-actions">
                <button
                  type="button"
                  className="maternal-secondary-button"
                  onClick={() => setCreateOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="maternal-primary-button">
                  Criar nesta sessão
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {pendingOpen && (
        <div
          className="maternal-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingOpen(false);
          }}
        >
          <section
            className="maternal-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="maternal-pending-title"
          >
            <button
              className="maternal-modal-close"
              type="button"
              aria-label="Fechar"
              onClick={() => setPendingOpen(false)}
            >
              ×
            </button>
            <span className="maternal-eyebrow">PENDÊNCIA OPERACIONAL</span>
            <h3 id="maternal-pending-title">Criar pendência administrativa</h3>
            <p>
              Use apenas para demonstrar conferência de registros. Não descreva
              sintomas, exames ou condutas.
            </p>
            <form className="maternal-form" onSubmit={createPending}>
              <label>
                Acompanhamento de origem
                <select
                  name="followUpId"
                  required
                  defaultValue={selected?.id ?? ""}
                >
                  <option value="" disabled>
                    Selecione o acompanhamento
                  </option>
                  {dataset.followUps.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.id} · {item.personId}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Descrição administrativa
                <select name="title" required defaultValue="">
                  <option value="" disabled>
                    Selecione uma conferência de registro
                  </option>
                  {administrativePendingTemplates.map((title) => (
                    <option value={title} key={title}>
                      {title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Responsável demonstrativo
                <select name="assignedTo" required defaultValue="">
                  <option value="" disabled>
                    Selecione uma área demonstrativa
                  </option>
                  {administrativeOwners.map((owner) => (
                    <option value={owner} key={owner}>
                      {owner}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Prazo administrativo fictício (opcional)
                <input type="date" name="dueAt" />
              </label>
              <div className="maternal-form-actions">
                <button
                  type="button"
                  className="maternal-secondary-button"
                  onClick={() => setPendingOpen(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="maternal-primary-button">
                  Criar pendência
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </section>
  );
}
