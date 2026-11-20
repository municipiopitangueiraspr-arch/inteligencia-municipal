import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock3,
  FilePlus2,
  Filter,
  History,
  MapPin,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  getHealthSanitarySummary,
  nextSanitaryEstablishmentId,
  nextSanitaryInspectionId,
  sanitaryInspectionStatuses,
  sanitaryInspectionTransitions,
  sanitaryLicenseStatuses,
  sanitaryRiskProfiles,
  type HealthSanitaryDataset,
  type SanitaryEstablishment,
  type SanitaryHistoryEvent,
  type SanitaryInspection,
  type SanitaryInspectionStatus,
  type SanitaryLicenseStatus,
  type SanitaryRiskProfile,
} from "../data/healthSanitary";
import "./HealthSanitarySurveillanceModule.css";

type ModuleView =
  | "overview"
  | "establishments"
  | "inspections"
  | "create-establishment"
  | "create-inspection"
  | "establishment-detail"
  | "inspection-detail";

type Props = {
  mode: "secretary" | "operator";
  dataset: HealthSanitaryDataset;
  onChange: (
    update: (current: HealthSanitaryDataset) => HealthSanitaryDataset,
  ) => void;
  onBack?: () => void;
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
const newHistoryEvent = (
  id: string,
  actor: string,
  action: string,
  toStatus: string,
  note: string,
  fromStatus?: string,
): SanitaryHistoryEvent => ({
  id,
  at: new Date().toISOString(),
  actor,
  action,
  toStatus,
  fromStatus,
  note,
});
const actorFor = (mode: Props["mode"]) =>
  mode === "secretary"
    ? "Secretaria de Saúde · demonstração"
    : "Fiscal da Vigilância Sanitária · demonstração";
const statusTone = (status: string) =>
  status.includes("acompanhamento") || status === "Em análise"
    ? "amber"
    : status === "Cancelada"
      ? "red"
      : status === "Programada"
        ? "blue"
        : "green";

export default function HealthSanitarySurveillanceModule({
  mode,
  dataset,
  onChange,
  onBack,
}: Props) {
  const [view, setView] = useState<ModuleView>("overview");
  const [selectedEstablishmentId, setSelectedEstablishmentId] = useState<
    string | null
  >(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState<
    string | null
  >(null);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState("Todos");
  const [licenseFilter, setLicenseFilter] = useState("Todas");
  const [inspectionFilter, setInspectionFilter] = useState("Todas");
  const [success, setSuccess] = useState("");
  const [formError, setFormError] = useState("");
  const [nextStatus, setNextStatus] = useState<SanitaryInspectionStatus | "">(
    "",
  );

  const summary = useMemo(() => getHealthSanitarySummary(dataset), [dataset]);
  const selectedEstablishment = dataset.establishments.find(
    (item) => item.id === selectedEstablishmentId,
  );
  const selectedInspection = dataset.inspections.find(
    (item) => item.id === selectedInspectionId,
  );
  const filteredEstablishments = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return dataset.establishments.filter((item) => {
      const textMatch =
        !normalized ||
        `${item.id} ${item.name} ${item.activity} ${item.address} ${item.localReference ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalized);
      const licenseMatch =
        licenseFilter === "Todas" ||
        (licenseFilter === "Acompanhamento"
          ? item.licenseStatus === "Em análise" ||
            item.licenseStatus === "Renovação em acompanhamento"
          : item.licenseStatus === licenseFilter);
      return (
        textMatch &&
        (riskFilter === "Todos" || item.riskProfile === riskFilter) &&
        licenseMatch
      );
    });
  }, [dataset.establishments, licenseFilter, riskFilter, search]);
  const filteredInspections = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase("pt-BR");
    return dataset.inspections.filter((item) => {
      const establishment = dataset.establishments.find(
        (entry) => entry.id === item.establishmentId,
      );
      const textMatch =
        !normalized ||
        `${item.id} ${item.type} ${item.inspector} ${establishment?.name ?? ""} ${item.correctiveAction ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(normalized);
      const statusMatch =
        inspectionFilter === "Todas" ||
        (inspectionFilter === "Acompanhamento"
          ? item.status === "Providência em acompanhamento" ||
            item.status === "Retorno programado"
          : item.status === inspectionFilter);
      return textMatch && statusMatch;
    });
  }, [dataset.establishments, dataset.inspections, inspectionFilter, search]);

  const clearNotice = () => {
    setSuccess("");
    setFormError("");
  };
  const returnTo = (next: ModuleView) => {
    clearNotice();
    setView(next);
  };
  const openEstablishment = (id: string) => {
    setSelectedEstablishmentId(id);
    setSelectedInspectionId(null);
    setView("establishment-detail");
    clearNotice();
  };
  const openInspection = (id: string) => {
    setSelectedInspectionId(id);
    setSelectedEstablishmentId(null);
    setNextStatus("");
    setView("inspection-detail");
    clearNotice();
  };

  const createEstablishment = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const name = String(values.get("name") ?? "").trim();
    const activity = String(values.get("activity") ?? "").trim();
    const address = String(values.get("address") ?? "").trim();
    const localReference = String(values.get("localReference") ?? "").trim();
    if (!name || !activity || !address) {
      setFormError(
        "Preencha nome, atividade e endereço. Campos só com espaços não são aceitos.",
      );
      return;
    }
    const id = nextSanitaryEstablishmentId(dataset.establishments);
    const licenseStatus = String(
      values.get("licenseStatus") ?? "Não iniciado",
    ) as SanitaryLicenseStatus;
    const record: SanitaryEstablishment = {
      id,
      name,
      activity,
      address,
      riskProfile: String(
        values.get("riskProfile") ?? sanitaryRiskProfiles[0],
      ) as SanitaryRiskProfile,
      licenseStatus,
      licenseReviewDate:
        String(values.get("licenseReviewDate") ?? "") || undefined,
      localReference: localReference || undefined,
      history: [
        newHistoryEvent(
          `${id}-H01`,
          actorFor(mode),
          "Estabelecimento incluído na demonstração",
          licenseStatus,
          "Cadastro sintético criado somente para esta sessão; não é protocolo, licença nem enquadramento oficial.",
        ),
      ],
    };
    onChange((current) => ({
      ...current,
      establishments: [record, ...current.establishments],
    }));
    form.reset();
    setSelectedEstablishmentId(id);
    setView("establishment-detail");
    setSuccess("Estabelecimento demonstrativo incluído nesta sessão.");
    setFormError("");
  };

  const updateLicense = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedEstablishment) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const licenseStatus = String(
      values.get("licenseStatus") ?? selectedEstablishment.licenseStatus,
    ) as SanitaryLicenseStatus;
    const licenseReviewDate =
      String(values.get("licenseReviewDate") ?? "") || undefined;
    const localReference = String(values.get("localReference") ?? "").trim();
    const note = String(values.get("note") ?? "").trim();
    if (!note) {
      setFormError(
        "Descreva a atualização do acompanhamento. Campos só com espaços não são aceitos.",
      );
      return;
    }
    const eventId = `${selectedEstablishment.id}-H${String(selectedEstablishment.history.length + 1).padStart(2, "0")}`;
    onChange((current) => ({
      ...current,
      establishments: current.establishments.map((item) =>
        item.id === selectedEstablishment.id
          ? {
              ...item,
              licenseStatus,
              licenseReviewDate,
              localReference: localReference || undefined,
              history: [
                ...item.history,
                newHistoryEvent(
                  eventId,
                  actorFor(mode),
                  "Acompanhamento local de licença atualizado",
                  licenseStatus,
                  note,
                  item.licenseStatus,
                ),
              ],
            }
          : item,
      ),
    }));
    form.reset();
    setSuccess(
      "Acompanhamento de licença atualizado; a trilha foi preservada.",
    );
    setFormError("");
  };

  const createInspection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const establishmentId = String(values.get("establishmentId") ?? "");
    const type = String(values.get("type") ?? "").trim();
    const scheduledAt = String(values.get("scheduledAt") ?? "");
    const inspector = String(values.get("inspector") ?? "").trim();
    if (
      !dataset.establishments.some((item) => item.id === establishmentId) ||
      !type ||
      !scheduledAt ||
      !inspector
    ) {
      setFormError(
        "Selecione um estabelecimento e informe tipo, data e responsável demonstrativo.",
      );
      return;
    }
    const id = nextSanitaryInspectionId(dataset.inspections);
    const record: SanitaryInspection = {
      id,
      establishmentId,
      type,
      scheduledAt,
      inspector,
      status: "Programada",
      history: [
        newHistoryEvent(
          `${id}-H01`,
          actorFor(mode),
          "Inspeção incluída na agenda demonstrativa",
          "Programada",
          "Agendamento fictício; não representa designação nem agenda oficial.",
        ),
      ],
    };
    onChange((current) => ({
      ...current,
      inspections: [record, ...current.inspections],
    }));
    form.reset();
    setSelectedInspectionId(id);
    setView("inspection-detail");
    setSuccess("Inspeção demonstrativa programada nesta sessão.");
    setFormError("");
  };

  const updateInspection = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedInspection || !nextStatus) return;
    const allowed = sanitaryInspectionTransitions[selectedInspection.status];
    if (!allowed.includes(nextStatus)) {
      setFormError(
        "A transição escolhida não está disponível para esta etapa.",
      );
      return;
    }
    const form = event.currentTarget;
    const values = new FormData(form);
    const note = String(values.get("note") ?? "").trim();
    const finding = String(values.get("finding") ?? "").trim();
    const correctiveAction = String(
      values.get("correctiveAction") ?? "",
    ).trim();
    const actionDueAt = String(values.get("actionDueAt") ?? "") || undefined;
    const returnAt = String(values.get("returnAt") ?? "") || undefined;
    if (!note || (nextStatus === "Realizada" && !finding)) {
      setFormError(
        "Informe a nota da etapa e, ao registrar realização, a constatação demonstrativa.",
      );
      return;
    }
    if (
      nextStatus === "Providência em acompanhamento" &&
      (!correctiveAction || !actionDueAt)
    ) {
      setFormError(
        "Para acompanhar uma providência, informe a ação demonstrativa e o prazo de referência.",
      );
      return;
    }
    if (nextStatus === "Retorno programado" && !returnAt) {
      setFormError("Informe a data de retorno demonstrativa.");
      return;
    }
    const historyId = `${selectedInspection.id}-H${String(selectedInspection.history.length + 1).padStart(2, "0")}`;
    onChange((current) => ({
      ...current,
      inspections: current.inspections.map((item) => {
        if (item.id !== selectedInspection.id) return item;
        const updates: Partial<SanitaryInspection> = {
          status: nextStatus,
          finding: finding || item.finding,
          correctiveAction: correctiveAction || item.correctiveAction,
          actionDueAt: actionDueAt || item.actionDueAt,
          returnAt: returnAt || item.returnAt,
          visitedAt:
            nextStatus === "Realizada" && !item.visitedAt
              ? today()
              : item.visitedAt,
        };
        return {
          ...item,
          ...updates,
          history: [
            ...item.history,
            newHistoryEvent(
              historyId,
              actorFor(mode),
              `Etapa atualizada para ${nextStatus}`,
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
    setSuccess("Etapa atualizada; histórico anterior preservado nesta sessão.");
    setFormError("");
  };

  const renderHistory = (items: SanitaryHistoryEvent[]) => (
    <section className="sanitary-history">
      <div className="sanitary-section-title">
        <History size={17} />
        <div>
          <span>TRILHA CRONOLÓGICA</span>
          <h4>Histórico do registro</h4>
        </div>
      </div>
      <ol>
        {[...items].reverse().map((item) => (
          <li key={item.id}>
            <span className="sanitary-history-dot" />
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
    view === "establishments" || view === "create-establishment"
      ? "Estabelecimentos e licenciamento"
      : view === "inspections" || view === "create-inspection"
        ? "Inspeções e providências"
        : view === "establishment-detail"
          ? (selectedEstablishment?.name ?? "Detalhe do estabelecimento")
          : view === "inspection-detail"
            ? (selectedInspection?.id ?? "Detalhe da inspeção")
            : "Vigilância Sanitária";

  return (
    <section className="health-sanitary-module">
      <header className="sanitary-header">
        <div>
          <span className="sanitary-eyebrow">
            SAÚDE · ROTINA LOCAL · DADOS FICTÍCIOS
          </span>
          <h2>{pageTitle}</h2>
          <p>
            Estabelecimentos, acompanhamento demonstrativo de licenças,
            inspeções e providências em uma trilha operacional local.
          </p>
        </div>
        <div className="sanitary-header-actions">
          {onBack && (
            <button
              type="button"
              className="sanitary-secondary"
              onClick={onBack}
            >
              <ArrowLeft size={15} /> Voltar
            </button>
          )}
          {view === "establishments" && (
            <button
              type="button"
              className="sanitary-primary"
              onClick={() => returnTo("create-establishment")}
            >
              <Plus size={15} /> Novo estabelecimento
            </button>
          )}
          {view === "inspections" && dataset.establishments.length > 0 && (
            <button
              type="button"
              className="sanitary-primary"
              onClick={() => returnTo("create-inspection")}
            >
              <FilePlus2 size={15} /> Programar inspeção
            </button>
          )}
        </div>
      </header>

      <div className="sanitary-demo-note" role="note">
        <ShieldCheck size={17} />
        <p>
          Protótipo com dados fictícios. Perfis de risco, situações de licença,
          prazos e registros não são classificação jurídica nem decisão
          sanitária oficial. Nada é transmitido ao SIEVISA ou a outro sistema;
          as alterações ficam apenas nesta sessão.
        </p>
      </div>
      {success && (
        <div className="sanitary-success" role="status">
          <Check size={15} /> {success}
        </div>
      )}

      {view === "overview" && (
        <>
          <nav
            className="sanitary-tabs"
            aria-label="Seções da Vigilância Sanitária"
          >
            <button className="active" onClick={() => returnTo("overview")}>
              Resumo
            </button>
            <button onClick={() => returnTo("establishments")}>
              Estabelecimentos
            </button>
            <button onClick={() => returnTo("inspections")}>
              Inspeções e providências
            </button>
          </nav>
          <div className="sanitary-metric-grid">
            <button
              onClick={() => {
                setSearch("");
                setRiskFilter("Todos");
                setLicenseFilter("Todas");
                setView("establishments");
              }}
            >
              <span>Estabelecimentos</span>
              <strong>{summary.establishments}</strong>
              <small>cadastros sintéticos</small>
            </button>
            <button
              onClick={() => {
                setSearch("");
                setRiskFilter("Todos");
                setLicenseFilter("Acompanhamento");
                setView("establishments");
              }}
            >
              <span>Licenças em acompanhamento</span>
              <strong>{summary.licenseReview}</strong>
              <small>situação local demonstrativa</small>
            </button>
            <button
              onClick={() => {
                setSearch("");
                setInspectionFilter("Programada");
                setView("inspections");
              }}
            >
              <span>Inspeções programadas</span>
              <strong>{summary.scheduled}</strong>
              <small>agenda fictícia</small>
            </button>
            <button
              onClick={() => {
                setSearch("");
                setInspectionFilter("Acompanhamento");
                setView("inspections");
              }}
            >
              <span>Providências e retornos</span>
              <strong>{summary.followUps}</strong>
              <small>etapas em acompanhamento</small>
            </button>
          </div>
          <div className="sanitary-overview-grid">
            <article className="sanitary-overview-card">
              <div className="sanitary-section-title">
                <Building2 size={18} />
                <div>
                  <span>CADASTRO LOCAL</span>
                  <h3>Estabelecimentos</h3>
                </div>
              </div>
              <p>
                Consulte atividade, endereço sintético, perfil de risco
                ilustrativo e situação demonstrativa do acompanhamento de
                licença.
              </p>
              <button
                className="sanitary-link-button"
                onClick={() => returnTo("establishments")}
              >
                Abrir estabelecimentos <ArrowRight size={14} />
              </button>
            </article>
            <article className="sanitary-overview-card">
              <div className="sanitary-section-title">
                <ClipboardCheck size={18} />
                <div>
                  <span>FISCALIZAÇÃO</span>
                  <h3>Inspeções e providências</h3>
                </div>
              </div>
              <p>
                Programe visitas demonstrativas, registre constatações,
                acompanhe providências e preserve as etapas anteriores.
              </p>
              <button
                className="sanitary-link-button"
                onClick={() => returnTo("inspections")}
              >
                Abrir fila de inspeções <ArrowRight size={14} />
              </button>
            </article>
          </div>
          <div className="sanitary-origin-note">
            <strong>Escopo configurável</strong>
            <p>
              Este protótipo não conclui que o município executa cada
              atribuição, não verifica habilitação ou competência regional e não
              replica obrigações do SIEVISA. Confirme regras, responsabilidades
              e manuais vigentes antes de definir qualquer integração real.
            </p>
          </div>
        </>
      )}

      {view === "establishments" && (
        <>
          <nav
            className="sanitary-tabs"
            aria-label="Seções da Vigilância Sanitária"
          >
            <button onClick={() => returnTo("overview")}>Resumo</button>
            <button
              className="active"
              onClick={() => returnTo("establishments")}
            >
              Estabelecimentos
            </button>
            <button onClick={() => returnTo("inspections")}>
              Inspeções e providências
            </button>
          </nav>
          <div className="sanitary-filters">
            <label className="sanitary-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar nome, atividade, endereço ou código"
                aria-label="Buscar estabelecimentos"
              />
            </label>
            <label>
              <Filter size={14} />
              <select
                aria-label="Filtrar perfil ilustrativo de risco"
                value={riskFilter}
                onChange={(event) => setRiskFilter(event.target.value)}
              >
                <option>Todos</option>
                {sanitaryRiskProfiles.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <select
                aria-label="Filtrar situação de licença demonstrativa"
                value={licenseFilter}
                onChange={(event) => setLicenseFilter(event.target.value)}
              >
                <option value="Todas">Todas as situações</option>
                <option value="Acompanhamento">Em análise ou renovação</option>
                {sanitaryLicenseStatuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            {(search ||
              riskFilter !== "Todos" ||
              licenseFilter !== "Todas") && (
              <button
                className="sanitary-clear"
                onClick={() => {
                  setSearch("");
                  setRiskFilter("Todos");
                  setLicenseFilter("Todas");
                }}
              >
                Limpar
              </button>
            )}
          </div>
          <div className="sanitary-list-heading">
            <div>
              <span>CADASTRO DE ESTABELECIMENTOS</span>
              <h3>Atividade e acompanhamento</h3>
            </div>
            <span>
              {filteredEstablishments.length} de {dataset.establishments.length}{" "}
              registros
            </span>
          </div>
          <div className="sanitary-record-list">
            {filteredEstablishments.length ? (
              filteredEstablishments.map((item) => (
                <article className="sanitary-record-card" key={item.id}>
                  <div className="sanitary-record-main">
                    <div className="sanitary-record-title">
                      <strong>{item.name}</strong>
                      <span
                        className={`sanitary-status status-${statusTone(item.licenseStatus)}`}
                      >
                        {item.licenseStatus}
                      </span>
                    </div>
                    <p>
                      {item.activity} <span>· {item.id}</span>
                    </p>
                    <div className="sanitary-record-meta">
                      <span>
                        <MapPin size={13} /> {item.address}
                      </span>
                      <span>
                        <ShieldCheck size={13} /> Perfil de risco:{" "}
                        {item.riskProfile}
                      </span>
                      <span>
                        <CalendarDays size={13} /> Revisão de referência:{" "}
                        {dateLabel(item.licenseReviewDate)}
                      </span>
                    </div>
                  </div>
                  <button
                    className="sanitary-open"
                    onClick={() => openEstablishment(item.id)}
                  >
                    Abrir registro <ArrowRight size={14} />
                  </button>
                </article>
              ))
            ) : (
              <div className="sanitary-empty">
                <Building2 size={22} />
                <strong>Nenhum estabelecimento encontrado</strong>
                <p>Ajuste os filtros ou cadastre um registro demonstrativo.</p>
                <button
                  className="sanitary-secondary"
                  onClick={() => returnTo("create-establishment")}
                >
                  Cadastrar estabelecimento
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {view === "inspections" && (
        <>
          <nav
            className="sanitary-tabs"
            aria-label="Seções da Vigilância Sanitária"
          >
            <button onClick={() => returnTo("overview")}>Resumo</button>
            <button onClick={() => returnTo("establishments")}>
              Estabelecimentos
            </button>
            <button className="active" onClick={() => returnTo("inspections")}>
              Inspeções e providências
            </button>
          </nav>
          <div className="sanitary-filters">
            <label className="sanitary-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar código, estabelecimento, tipo ou responsável"
                aria-label="Buscar inspeções"
              />
            </label>
            <label>
              <Filter size={14} />
              <select
                aria-label="Filtrar inspeções por situação"
                value={inspectionFilter}
                onChange={(event) => setInspectionFilter(event.target.value)}
              >
                <option value="Todas">Todas as situações</option>
                <option value="Acompanhamento">Providências e retornos</option>
                {sanitaryInspectionStatuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            {(search || inspectionFilter !== "Todas") && (
              <button
                className="sanitary-clear"
                onClick={() => {
                  setSearch("");
                  setInspectionFilter("Todas");
                }}
              >
                Limpar
              </button>
            )}
          </div>
          <div className="sanitary-list-heading">
            <div>
              <span>FILA DE INSPEÇÕES</span>
              <h3>Agenda, constatações e retornos</h3>
            </div>
            <span>
              {filteredInspections.length} de {dataset.inspections.length}{" "}
              registros
            </span>
          </div>
          <div className="sanitary-record-list">
            {filteredInspections.length ? (
              filteredInspections.map((item) => {
                const establishment = dataset.establishments.find(
                  (entry) => entry.id === item.establishmentId,
                );
                return (
                  <article className="sanitary-record-card" key={item.id}>
                    <div className="sanitary-record-main">
                      <div className="sanitary-record-title">
                        <strong>
                          {item.type} · {item.id}
                        </strong>
                        <span
                          className={`sanitary-status status-${statusTone(item.status)}`}
                        >
                          {item.status}
                        </span>
                      </div>
                      <p>
                        {establishment?.name ??
                          "Estabelecimento não encontrado"}{" "}
                        <span>
                          · {establishment?.id ?? item.establishmentId}
                        </span>
                      </p>
                      <div className="sanitary-record-meta">
                        <span>
                          <CalendarDays size={13} /> Data de referência:{" "}
                          {dateLabel(item.visitedAt ?? item.scheduledAt)}
                        </span>
                        <span>
                          <ShieldCheck size={13} /> {item.inspector}
                        </span>
                        {item.actionDueAt && (
                          <span>
                            <Clock3 size={13} /> Providência até{" "}
                            {dateLabel(item.actionDueAt)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      className="sanitary-open"
                      onClick={() => openInspection(item.id)}
                    >
                      Abrir inspeção <ArrowRight size={14} />
                    </button>
                  </article>
                );
              })
            ) : (
              <div className="sanitary-empty">
                <ClipboardCheck size={22} />
                <strong>Nenhuma inspeção encontrada</strong>
                <p>
                  Revise o filtro ou programe uma inspeção demonstrativa para um
                  estabelecimento existente.
                </p>
                {dataset.establishments.length > 0 && (
                  <button
                    className="sanitary-secondary"
                    onClick={() => returnTo("create-inspection")}
                  >
                    Programar inspeção
                  </button>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {view === "create-establishment" && (
        <section className="sanitary-form-view">
          <button
            className="sanitary-back-link"
            onClick={() => returnTo("establishments")}
          >
            <ArrowLeft size={14} /> Voltar aos estabelecimentos
          </button>
          <div className="sanitary-section-heading">
            <div>
              <span>NOVO CADASTRO DEMONSTRATIVO</span>
              <h3>Adicionar estabelecimento</h3>
              <p>
                Não informe dados reais ou identificadores oficiais nesta
                demonstração.
              </p>
            </div>
            <Building2 size={19} />
          </div>
          <form className="sanitary-form" onSubmit={createEstablishment}>
            <label>
              Nome de referência <span>*</span>
              <input
                name="name"
                maxLength={100}
                required
                placeholder="Ex.: estabelecimento fictício"
              />
            </label>
            <label>
              Atividade principal <span>*</span>
              <input
                name="activity"
                maxLength={100}
                required
                placeholder="Ex.: alimentação preparada"
              />
            </label>
            <label className="sanitary-field-wide">
              Endereço/localidade fictícios <span>*</span>
              <input
                name="address"
                maxLength={140}
                required
                placeholder="Ex.: setor demonstrativo · sem endereço real"
              />
            </label>
            <label>
              Perfil ilustrativo de risco <span>*</span>
              <select name="riskProfile" defaultValue={sanitaryRiskProfiles[1]}>
                {sanitaryRiskProfiles.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
              <small>
                Não equivale a enquadramento jurídico ou classificação oficial.
              </small>
            </label>
            <label>
              Situação de licença na demonstração <span>*</span>
              <select name="licenseStatus" defaultValue="Não iniciado">
                {sanitaryLicenseStatuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Data fictícia para revisão de vigência
              <input name="licenseReviewDate" type="date" />
            </label>
            <label>
              Referência local sintética
              <input
                name="localReference"
                maxLength={40}
                placeholder="Ex.: SIM-LIC-000"
              />
              <small>Não é protocolo emitido pelo município.</small>
            </label>
            {formError && (
              <p className="sanitary-error" role="alert">
                {formError}
              </p>
            )}
            <div className="sanitary-form-actions">
              <button
                type="button"
                className="sanitary-secondary"
                onClick={() => returnTo("establishments")}
              >
                Cancelar
              </button>
              <button type="submit" className="sanitary-primary">
                <Check size={15} /> Cadastrar nesta sessão
              </button>
            </div>
          </form>
        </section>
      )}

      {view === "create-inspection" && (
        <section className="sanitary-form-view">
          <button
            className="sanitary-back-link"
            onClick={() => returnTo("inspections")}
          >
            <ArrowLeft size={14} /> Voltar às inspeções
          </button>
          <div className="sanitary-section-heading">
            <div>
              <span>NOVO EVENTO DEMONSTRATIVO</span>
              <h3>Programar inspeção</h3>
              <p>
                A atividade e as datas abaixo são locais e fictícias; não
                representam pauta ou designação oficial.
              </p>
            </div>
            <ClipboardCheck size={19} />
          </div>
          <form className="sanitary-form" onSubmit={createInspection}>
            <label className="sanitary-field-wide">
              Estabelecimento existente <span>*</span>
              <select name="establishmentId" defaultValue="" required>
                <option value="">Selecione um estabelecimento</option>
                {dataset.establishments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.id}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Tipo de atividade <span>*</span>
              <input
                name="type"
                maxLength={80}
                required
                defaultValue="Inspeção demonstrativa"
              />
            </label>
            <label>
              Data prevista <span>*</span>
              <input
                name="scheduledAt"
                type="date"
                required
                defaultValue={today()}
              />
            </label>
            <label className="sanitary-field-wide">
              Responsável demonstrativo <span>*</span>
              <input
                name="inspector"
                maxLength={80}
                required
                placeholder="Ex.: Fiscal demonstrativo"
              />
            </label>
            {formError && (
              <p className="sanitary-error" role="alert">
                {formError}
              </p>
            )}
            <div className="sanitary-form-actions">
              <button
                type="button"
                className="sanitary-secondary"
                onClick={() => returnTo("inspections")}
              >
                Cancelar
              </button>
              <button type="submit" className="sanitary-primary">
                <Check size={15} /> Registrar na agenda da sessão
              </button>
            </div>
          </form>
        </section>
      )}

      {view === "establishment-detail" && selectedEstablishment && (
        <section className="sanitary-detail-view">
          <button
            className="sanitary-back-link"
            onClick={() => returnTo("establishments")}
          >
            <ArrowLeft size={14} /> Voltar à lista
          </button>
          <div className="sanitary-detail-heading">
            <div>
              <span className="sanitary-eyebrow">
                ESTABELECIMENTO · {selectedEstablishment.id}
              </span>
              <h3>{selectedEstablishment.name}</h3>
              <p>{selectedEstablishment.activity}</p>
            </div>
            <span
              className={`sanitary-status status-${statusTone(selectedEstablishment.licenseStatus)}`}
            >
              {selectedEstablishment.licenseStatus}
            </span>
          </div>
          <div className="sanitary-detail-grid">
            <article>
              <span>Endereço/localidade</span>
              <strong>{selectedEstablishment.address}</strong>
            </article>
            <article>
              <span>Perfil de risco ilustrativo</span>
              <strong>{selectedEstablishment.riskProfile}</strong>
              <small>Não representa enquadramento legal.</small>
            </article>
            <article>
              <span>Referência local fictícia</span>
              <strong>
                {selectedEstablishment.localReference ?? "Não informada"}
              </strong>
            </article>
            <article>
              <span>Data fictícia para revisão</span>
              <strong>
                {dateLabel(selectedEstablishment.licenseReviewDate)}
              </strong>
            </article>
            <article className="sanitary-detail-wide">
              <span>Inspeções vinculadas</span>
              <div className="sanitary-linked-inspections">
                {dataset.inspections.filter(
                  (item) => item.establishmentId === selectedEstablishment.id,
                ).length ? (
                  dataset.inspections
                    .filter(
                      (item) =>
                        item.establishmentId === selectedEstablishment.id,
                    )
                    .map((item) => (
                      <button
                        key={item.id}
                        onClick={() => openInspection(item.id)}
                      >
                        {item.id} · {item.type} · {item.status}
                        <ArrowRight size={13} />
                      </button>
                    ))
                ) : (
                  <p>Nenhuma inspeção demonstrativa vinculada.</p>
                )}
              </div>
            </article>
          </div>
          <form
            className="sanitary-update-form"
            key={`${selectedEstablishment.id}-${selectedEstablishment.history.length}`}
            onSubmit={updateLicense}
          >
            <div className="sanitary-section-heading">
              <div>
                <span>ATUALIZAÇÃO LOCAL · SOMENTE NESTA SESSÃO</span>
                <h4>Acompanhamento de licença</h4>
                <p>
                  Atualiza o estado demonstrativo sem certificar ou emitir
                  licença real.
                </p>
              </div>
              <CalendarDays size={18} />
            </div>
            <label>
              Situação demonstrativa
              <select
                name="licenseStatus"
                defaultValue={selectedEstablishment.licenseStatus}
              >
                {sanitaryLicenseStatuses.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              Data de referência
              <input
                name="licenseReviewDate"
                type="date"
                defaultValue={selectedEstablishment.licenseReviewDate ?? ""}
              />
            </label>
            <label>
              Referência local sintética
              <input
                name="localReference"
                maxLength={40}
                defaultValue={selectedEstablishment.localReference ?? ""}
              />
            </label>
            <label className="sanitary-field-wide">
              Nota da atualização <span>*</span>
              <textarea
                name="note"
                rows={2}
                maxLength={400}
                required
                placeholder="Descreva o passo demonstrativo registrado"
              />
            </label>
            {formError && (
              <p className="sanitary-error" role="alert">
                {formError}
              </p>
            )}
            <button className="sanitary-primary" type="submit">
              <Check size={15} /> Atualizar trilha demonstrativa
            </button>
          </form>
          {renderHistory(selectedEstablishment.history)}
        </section>
      )}

      {view === "inspection-detail" && selectedInspection && (
        <section className="sanitary-detail-view">
          <button
            className="sanitary-back-link"
            onClick={() => returnTo("inspections")}
          >
            <ArrowLeft size={14} /> Voltar à fila
          </button>
          <div className="sanitary-detail-heading">
            <div>
              <span className="sanitary-eyebrow">
                INSPEÇÃO · {selectedInspection.id}
              </span>
              <h3>{selectedInspection.type}</h3>
              <p>
                {dataset.establishments.find(
                  (item) => item.id === selectedInspection.establishmentId,
                )?.name ?? "Estabelecimento não encontrado"}{" "}
                · {selectedInspection.establishmentId}
              </p>
            </div>
            <span
              className={`sanitary-status status-${statusTone(selectedInspection.status)}`}
            >
              {selectedInspection.status}
            </span>
          </div>
          <div className="sanitary-detail-grid">
            <article>
              <span>Data prevista</span>
              <strong>{dateLabel(selectedInspection.scheduledAt)}</strong>
            </article>
            <article>
              <span>Data realizada</span>
              <strong>{dateLabel(selectedInspection.visitedAt)}</strong>
            </article>
            <article>
              <span>Responsável demonstrativo</span>
              <strong>{selectedInspection.inspector}</strong>
            </article>
            <article>
              <span>Prazo da providência</span>
              <strong>{dateLabel(selectedInspection.actionDueAt)}</strong>
            </article>
            <article className="sanitary-detail-wide">
              <span>Constatação demonstrativa</span>
              <p>
                {selectedInspection.finding ??
                  "Nenhuma constatação registrada."}
              </p>
            </article>
            <article className="sanitary-detail-wide">
              <span>Providência e retorno</span>
              <p>
                {selectedInspection.correctiveAction ??
                  "Nenhuma providência vinculada."}
                {selectedInspection.returnAt
                  ? ` · Retorno em ${dateLabel(selectedInspection.returnAt)}`
                  : ""}
              </p>
            </article>
          </div>
          {sanitaryInspectionTransitions[selectedInspection.status].length >
          0 ? (
            <form
              className="sanitary-update-form"
              key={`${selectedInspection.id}-${selectedInspection.history.length}`}
              onSubmit={updateInspection}
            >
              <div className="sanitary-section-heading">
                <div>
                  <span>ATUALIZAÇÃO · SOMENTE NESTA SESSÃO</span>
                  <h4>Registrar próxima etapa</h4>
                  <p>Transições disponíveis dependem da situação atual.</p>
                </div>
                <Clock3 size={18} />
              </div>
              <label>
                Nova situação <span>*</span>
                <select
                  value={nextStatus}
                  onChange={(event) =>
                    setNextStatus(
                      event.target.value as SanitaryInspectionStatus | "",
                    )
                  }
                  required
                >
                  <option value="">Selecione</option>
                  {sanitaryInspectionTransitions[selectedInspection.status].map(
                    (item) => (
                      <option key={item}>{item}</option>
                    ),
                  )}
                </select>
              </label>
              {nextStatus === "Realizada" && (
                <label className="sanitary-field-wide">
                  Constatação demonstrativa <span>*</span>
                  <textarea
                    name="finding"
                    rows={3}
                    maxLength={500}
                    required
                    placeholder="Não registre dados reais neste protótipo."
                  />
                </label>
              )}
              {nextStatus === "Providência em acompanhamento" && (
                <>
                  <label className="sanitary-field-wide">
                    Providência demonstrativa <span>*</span>
                    <textarea
                      name="correctiveAction"
                      rows={2}
                      maxLength={400}
                      required
                      placeholder="Descreva a providência fictícia acompanhada."
                    />
                  </label>
                  <label>
                    Prazo de referência <span>*</span>
                    <input name="actionDueAt" type="date" required />
                  </label>
                </>
              )}
              {nextStatus === "Retorno programado" && (
                <label>
                  Data do retorno demonstrativo <span>*</span>
                  <input name="returnAt" type="date" required />
                </label>
              )}
              <label className="sanitary-field-wide">
                Nota da etapa <span>*</span>
                <textarea
                  name="note"
                  rows={2}
                  maxLength={400}
                  required
                  placeholder="Justificativa ou síntese desta atualização"
                />
              </label>
              {formError && (
                <p className="sanitary-error" role="alert">
                  {formError}
                </p>
              )}
              <button className="sanitary-primary" type="submit">
                <Check size={15} /> Atualizar e preservar histórico
              </button>
              <small>Ator demonstrativo: {actorFor(mode)}.</small>
            </form>
          ) : (
            <div className="sanitary-terminal-note">
              <Check size={17} />
              <p>
                Esta etapa encerra o fluxo demonstrativo. O histórico continua
                disponível para consulta.
              </p>
            </div>
          )}
          {renderHistory(selectedInspection.history)}
        </section>
      )}

      <footer className="sanitary-footer">
        <MapPin size={14} /> MatrixIA · cenário municipal sintético{" "}
        <span>·</span> nenhuma transmissão a sistemas oficiais
      </footer>
    </section>
  );
}
