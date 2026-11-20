import { useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowDownUp,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  MapPin,
  Search,
} from "lucide-react";
import {
  formatRequestDate,
  getRequestCounts,
  isRequestOverdue,
  type MunicipalRequest,
  type RequestStatus,
} from "../data/requests";

const statuses: RequestStatus[] = [
  "Recebida",
  "Em análise",
  "Em atendimento",
  "Concluída",
  "Cancelada",
];

type RequestCenterProps = {
  requests: MunicipalRequest[];
  mode: "mayor" | "secretary";
  departmentName?: string;
  onUpdate?: (
    id: string,
    update: { status: RequestStatus; assignedTo: string; note: string },
  ) => void;
};

export default function RequestCenter({
  requests,
  mode,
  departmentName,
  onUpdate,
}: RequestCenterProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todas");
  const departmentRequests = requests.filter(
    (request) => !departmentName || request.department === departmentName,
  );
  const counts = getRequestCounts(departmentRequests);
  const visibleRequests = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
    return departmentRequests
      .filter(
        (request) =>
          statusFilter === "Todas" || request.status === statusFilter,
      )
      .filter(
        (request) =>
          !normalizedQuery ||
          [
            request.protocol,
            request.subject,
            request.requester,
            request.location,
          ]
            .join(" ")
            .toLocaleLowerCase("pt-BR")
            .includes(normalizedQuery),
      )
      .sort((left, right) => Date.parse(left.dueAt) - Date.parse(right.dueAt));
  }, [departmentRequests, query, statusFilter]);

  return (
    <section className="request-center">
      <div className="request-center-heading">
        <div>
          <div className="workspace-page-kicker">
            <FileText size={14} /> CENTRAL MUNICIPAL · DADOS SIMULADOS
          </div>
          <h1>
            {mode === "mayor"
              ? "Solicitações e protocolos"
              : "Fila de solicitações"}
          </h1>
          <p>
            {departmentName
              ? `Acompanhe os protocolos encaminhados para ${departmentName}.`
              : "Uma fila administrativa compartilhada pelas onze secretarias, com situação e prazo rastreáveis."}
          </p>
        </div>
        <span className="request-sim-badge">REGISTROS FICTÍCIOS</span>
      </div>

      <div className="request-summary-grid">
        <article>
          <span>Em aberto</span>
          <strong>{counts.open}</strong>
          <small>Recebidas, em análise ou atendimento</small>
        </article>
        <article className={counts.overdue ? "request-summary-alert" : ""}>
          <span>Fora do prazo</span>
          <strong>{counts.overdue}</strong>
          <small>Prazo cadastrado já ultrapassado</small>
        </article>
        <article>
          <span>Concluídas</span>
          <strong>
            {
              departmentRequests.filter(
                (request) => request.status === "Concluída",
              ).length
            }
          </strong>
          <small>Encerradas nesta demonstração</small>
        </article>
      </div>

      <div className="request-filters">
        <label className="request-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar protocolo, assunto, solicitante ou local"
            aria-label="Buscar solicitações"
          />
        </label>
        <label className="request-status-filter">
          <ArrowDownUp size={15} />
          <select
            value={statusFilter}
            aria-label="Filtrar por situação"
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option>Todas</option>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
          <ChevronDown size={14} />
        </label>
      </div>

      <div className="request-list-heading">
        <div>
          <span>PROTOCOLOS</span>
          <strong>{visibleRequests.length} registros</strong>
        </div>
        <small>Ordenados pelo prazo mais próximo</small>
      </div>

      {visibleRequests.length ? (
        <div className="request-record-list">
          {visibleRequests.map((request) => (
            <RequestCard
              key={request.id}
              request={request}
              secretary={mode === "secretary"}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      ) : (
        <div className="request-empty-state">
          <Search size={20} />
          <strong>Nenhum protocolo encontrado</strong>
          <p>Revise o termo buscado ou escolha outra situação.</p>
        </div>
      )}
      <p className="request-center-footnote">
        Os protocolos “PROTO” e os cadastros criados nesta tela são
        demonstrativos; os dados ficam somente na memória desta sessão.
        Encaminhamentos clínicos especializados não fazem parte desta fila
        administrativa.
      </p>
    </section>
  );
}

function RequestCard({
  request,
  secretary,
  onUpdate,
}: {
  request: MunicipalRequest;
  secretary: boolean;
  onUpdate?: RequestCenterProps["onUpdate"];
}) {
  const [expanded, setExpanded] = useState(false);
  const [nextStatus, setNextStatus] = useState<RequestStatus>(request.status);
  const [assignee, setAssignee] = useState(request.assignedTo);
  const [note, setNote] = useState("");
  const overdue = isRequestOverdue(request);

  const submitUpdate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onUpdate?.(request.id, {
      status: nextStatus,
      assignedTo: assignee.trim() || "Equipe responsável",
      note: note.trim() || "Acompanhamento atualizado pela secretaria.",
    });
    setNote("");
  };

  return (
    <article
      className={`request-record-card ${overdue ? "request-record-overdue" : ""}`}
    >
      <div className="request-record-main">
        <span
          className={`request-status-chip request-status-${request.status.toLocaleLowerCase().replaceAll(" ", "-")}`}
        >
          {request.status}
        </span>
        {overdue && (
          <span className="request-overdue-chip">
            <AlertTriangle size={12} /> Fora do prazo
          </span>
        )}
        <span className="request-protocol-label">
          {request.protocol}
          {request.simulated ? " · DEMONSTRATIVO" : ""}
        </span>
        <h2>{request.subject}</h2>
        <p>{request.description}</p>
        <div className="request-record-meta">
          <span>
            <strong>Secretaria</strong>
            {request.department}
          </span>
          <span>
            <strong>Solicitante</strong>
            {request.requester}
          </span>
          <span>
            <strong>Responsável</strong>
            {request.assignedTo}
          </span>
          <span>
            <strong>Prioridade</strong>
            {request.priority}
          </span>
        </div>
        <div className="request-record-foot">
          <span>
            <MapPin size={13} /> {request.location}
          </span>
          <span>
            <Clock3 size={13} /> Prazo: {formatRequestDate(request.dueAt)}
          </span>
          <button onClick={() => setExpanded(!expanded)}>
            {expanded ? "Fechar detalhes" : "Detalhes e histórico"}{" "}
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="request-expanded-detail">
          <div className="request-detail-grid">
            <span>
              <strong>Recebido</strong>
              {formatRequestDate(request.createdAt, true)}
            </span>
            <span>
              <strong>Canal</strong>
              {request.channel}
            </span>
            <span>
              <strong>Categoria</strong>
              {request.category}
            </span>
            <span>
              <strong>Contato</strong>
              {request.contact || "Não informado"}
            </span>
            <span>
              <strong>Local</strong>
              {request.location}
            </span>
            <span>
              <strong>Identificador interno</strong>
              {request.id}
            </span>
          </div>
          <div className="request-history">
            <h3>Histórico do protocolo</h3>
            {[...request.history].reverse().map((entry) => (
              <div className="request-history-entry" key={entry.id}>
                <span className="request-history-dot" />
                <div>
                  <strong>
                    {entry.status} · {entry.actor}
                  </strong>
                  <p>{entry.note}</p>
                  {entry.assignedTo && (
                    <small>
                      Responsável:{" "}
                      {entry.previousAssignee &&
                      entry.previousAssignee !== entry.assignedTo
                        ? `${entry.previousAssignee} → `
                        : ""}
                      {entry.assignedTo}
                    </small>
                  )}
                  <small>{formatRequestDate(entry.at, true)}</small>
                </div>
              </div>
            ))}
          </div>
          {secretary && onUpdate && (
            <form className="request-update-form" onSubmit={submitUpdate}>
              <h3>
                <Check size={15} /> Registrar andamento nesta sessão
              </h3>
              <label>
                Nova situação
                <select
                  value={nextStatus}
                  onChange={(event) =>
                    setNextStatus(event.target.value as RequestStatus)
                  }
                >
                  {statuses.map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label>
                Responsável
                <input
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                  placeholder="Equipe ou servidor responsável"
                />
              </label>
              <label className="request-update-note">
                Nota do histórico
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  placeholder="Ex.: vistoria agendada para quinta-feira."
                />
              </label>
              <button className="workspace-primary-button" type="submit">
                <Check size={15} /> Salvar atualização
              </button>
            </form>
          )}
        </div>
      )}
    </article>
  );
}
