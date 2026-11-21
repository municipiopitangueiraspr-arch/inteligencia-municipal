import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  Syringe,
  Search,
  UserRound,
} from "lucide-react";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";
import {
  getImmunizationSummary,
  nextImmunizationCourseId,
  nextVaccineDoseId,
  vaccineSchemes,
  type HealthImmunizationDataset,
  type ImmunizationCourse,
  type ImmunizationHistoryEvent,
} from "../data/healthImmunization";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import "./HealthImmunizationModule.css";

type Props = {
  dataset: HealthImmunizationDataset;
  peopleRegistry: PeopleRegistryDataset;
  healthTerritory: HealthTerritoryDataset;
  onChange: (
    update: (current: HealthImmunizationDataset) => HealthImmunizationDataset,
  ) => void;
  onBack: () => void;
};
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value?: string) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value}T00:00:00Z`),
      )
    : "—";
const actor = "Equipe de Saúde · demonstração";

export default function HealthImmunizationModule({
  dataset,
  peopleRegistry,
  healthTerritory,
  onChange,
  onBack,
}: Props) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Todos");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [doseUnitId, setDoseUnitId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [message, setMessage] = useState("");
  const people = peopleRegistry.people.filter((p) => p.status === "Ativa");
  const personName = (id: string) =>
    peopleRegistry.people.find((p) => p.id === id)?.fullName ??
    "Pessoa não encontrada";
  const summary = useMemo(() => getImmunizationSummary(dataset), [dataset]);
  const courses = useMemo(
    () =>
      dataset.courses.filter((c) => {
        const person = personName(c.personId).toLocaleLowerCase("pt-BR");
        const scheme =
          vaccineSchemes.find((s) => s.id === c.schemeId)?.name ?? "";
        const matchesSearch = `${c.id} ${person} ${scheme}`
          .toLocaleLowerCase("pt-BR")
          .includes(search.trim().toLocaleLowerCase("pt-BR"));
        const overdue =
          c.status === "Em andamento" &&
          !!c.nextDoseAt &&
          c.nextDoseAt < today();
        return (
          matchesSearch &&
          (filter === "Todos" ||
            (filter === "Busca ativa"
              ? overdue
              : filter === "Em andamento"
                ? c.status === filter
                : c.status === filter))
        );
      }),
    [dataset.courses, filter, search, peopleRegistry.people],
  );
  const selected = dataset.courses.find((c) => c.id === selectedId);
  const selectedPerson = selected ? personName(selected.personId) : "";
  const selectedScheme = selected
    ? vaccineSchemes.find((s) => s.id === selected.schemeId)
    : undefined;
  const addHistory = (
    id: string,
    action: string,
    note: string,
  ): ImmunizationHistoryEvent => ({
    id,
    at: new Date().toISOString(),
    actor,
    action,
    note,
  });

  const startCourse = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const personId = String(data.get("personId") ?? "");
    const schemeId = String(data.get("schemeId") ?? "");
    const firstDoseAt = String(data.get("appliedAt") ?? "");
    const unitId = String(data.get("unitId") ?? "");
    const lot = String(data.get("lot") ?? "").trim();
    const scheme = vaccineSchemes.find((s) => s.id === schemeId);
    if (
      !people.some((p) => p.id === personId) ||
      !scheme ||
      !firstDoseAt ||
      !healthTerritory.units.some((unit) => unit.id === unitId) ||
      !lot
    ) {
      setMessage(
        "Preencha pessoa ativa, esquema demonstrativo, unidade, data e lote fictício.",
      );
      return;
    }
    if (
      dataset.courses.some(
        (c) =>
          c.personId === personId &&
          c.schemeId === schemeId &&
          c.status === "Em andamento",
      )
    ) {
      setMessage(
        "Já existe um esquema em andamento para esta pessoa e esquema demonstrativo.",
      );
      return;
    }
    const id = nextImmunizationCourseId(dataset.courses);
    const doseId = nextVaccineDoseId(id, []);
    const dose = {
      id: doseId,
      schemeId,
      doseNumber: 1,
      appliedAt: firstDoseAt,
      unitId,
      lot,
      note: "Aplicação fictícia; lote e data não representam vacinação real.",
      history: [
        addHistory(
          `${doseId}-H1`,
          "Dose demonstrativa registrada",
          "Dados sintéticos, sem validade clínica ou oficial.",
        ),
      ],
    };
    const nextDue =
      scheme.doses > 1
        ? new Date(
            new Date(`${firstDoseAt}T00:00:00Z`).getTime() +
              scheme.intervalDays * 86400000,
          )
            .toISOString()
            .slice(0, 10)
        : undefined;
    const course: ImmunizationCourse = {
      id,
      personId,
      schemeId,
      startedAt: firstDoseAt,
      doses: [dose],
      nextDoseAt: nextDue,
      status: scheme.doses === 1 ? "Concluído" : "Em andamento",
      history: [
        addHistory(
          `${id}-H1`,
          "Esquema demonstrativo iniciado",
          `${scheme.name}; cadência fictícia, não seguir como orientação vacinal.`,
        ),
      ],
    };
    onChange((current) => ({ courses: [course, ...current.courses] }));
    setFormOpen(false);
    setMessage("Dose demonstrativa registrada nesta sessão.");
    event.currentTarget.reset();
  };

  const registerNextDose = (course: ImmunizationCourse, unitId: string) => {
    const scheme = vaccineSchemes.find((s) => s.id === course.schemeId);
    if (
      !scheme ||
      course.status !== "Em andamento" ||
      course.doses.length >= scheme.doses ||
      !healthTerritory.units.some((unit) => unit.id === unitId)
    ) {
      setMessage("Selecione uma unidade demonstrativa válida para a dose.");
      return;
    }
    const at = today();
    const doseId = nextVaccineDoseId(course.id, course.doses);
    const dose = {
      id: doseId,
      schemeId: course.schemeId,
      doseNumber: course.doses.length + 1,
      appliedAt: at,
      unitId,
      lot: `LOTE-DEMO-${doseId.slice(-3)}`,
      note: "Dose sintética criada pela ação de teste; não registra aplicação real.",
      history: [
        addHistory(
          `${doseId}-H1`,
          "Dose demonstrativa registrada",
          "Ação de protótipo; não comprova vacinação.",
        ),
      ],
    };
    const doses = [...course.doses, dose];
    const complete = doses.length >= scheme.doses;
    onChange((current) => ({
      courses: current.courses.map((item) =>
        item.id !== course.id
          ? item
          : {
              ...item,
              doses,
              nextDoseAt: complete
                ? undefined
                : new Date(
                    new Date(`${at}T00:00:00Z`).getTime() +
                      scheme.intervalDays * 86400000,
                  )
                    .toISOString()
                    .slice(0, 10),
              status: complete ? "Concluído" : "Em andamento",
              history: [
                addHistory(
                  `${course.id}-H${item.history.length + 1}`,
                  "Dose acrescentada à demonstração",
                  `Dose ${dose.doseNumber} registrada em memória.`,
                ),
                ...item.history,
              ],
            },
      ),
    }));
    setMessage(
      "Dose sintética adicionada; nenhuma aplicação real foi registrada.",
    );
  };

  return (
    <section className="health-immunization-module">
      <header className="immunization-header">
        <button className="immunization-back" onClick={onBack}>
          <ArrowLeft size={16} /> Voltar ao catálogo da Saúde
        </button>
        <span className="immunization-eyebrow">
          SECRETARIA DE SAÚDE · CENÁRIO FICTÍCIO
        </span>
        <h1>Imunização e Vacinação</h1>
        <p>
          Acompanhamento demonstrativo de esquemas, doses previstas e pessoas
          para busca ativa.
        </p>
      </header>
      <div className="immunization-warning" role="note">
        <strong>Demonstração — não usar para decisões de saúde.</strong>{" "}
        Pessoas, vacinas, doses, lotes e intervalos são fictícios e servem
        apenas à validação da interface. Não são calendário, esquema,
        recomendação ou registro oficial; confirme informações e registros nos
        serviços e sistemas oficiais. Não insira dados reais.
      </div>
      {message && (
        <p className="immunization-message" role="status">
          <Check size={15} />
          {message}
        </p>
      )}
      <div className="immunization-metrics">
        <article>
          <span>Esquemas cadastrados</span>
          <strong>{summary.courses}</strong>
        </article>
        <article>
          <span>Doses demonstrativas aplicadas</span>
          <strong>{summary.dosesApplied}</strong>
        </article>
        <article>
          <span>Próximas doses</span>
          <strong>{summary.upcoming}</strong>
        </article>
        <article>
          <span>Busca ativa ilustrativa</span>
          <strong>{summary.overdue}</strong>
        </article>
      </div>
      <div className="immunization-toolbar">
        <div className="immunization-search">
          <Search size={16} />
          <input
            aria-label="Buscar pessoa, esquema ou identificador"
            placeholder="Buscar pessoa, esquema ou registro"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Filtrar esquemas"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>Todos</option>
          <option>Em andamento</option>
          <option>Concluído</option>
          <option>Busca ativa</option>
        </select>
        <button
          className="immunization-primary"
          onClick={() => {
            setFormOpen((v) => !v);
            setMessage("");
          }}
        >
          <Syringe size={16} /> Registrar esquema
        </button>
      </div>
      {formOpen && (
        <form className="immunization-form" onSubmit={startCourse}>
          <h2>Iniciar esquema demonstrativo</h2>
          <p>
            Use somente pessoas de demonstração. A primeira dose será sintética.
          </p>
          <label>
            Pessoa ativa
            <select name="personId" required defaultValue="">
              <option value="" disabled>
                Selecione
              </option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} · {p.id}
                </option>
              ))}
            </select>
          </label>
          <label>
            Esquema fictício
            <select name="schemeId" required>
              {vaccineSchemes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.vaccine} ({s.doses} dose{s.doses > 1 ? "s" : ""}
                  )
                </option>
              ))}
            </select>
          </label>
          <label>
            Unidade demonstrativa
            <select name="unitId" required>
              {healthTerritory.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data de aplicação fictícia
            <input
              name="appliedAt"
              type="date"
              required
              defaultValue={today()}
            />
          </label>
          <label>
            Lote fictício
            <input
              name="lot"
              required
              defaultValue="LOTE-DEMO-NOVO"
              maxLength={32}
            />
          </label>
          <div className="immunization-form-actions">
            <button type="button" onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
            <button className="immunization-primary" type="submit">
              Salvar na sessão
            </button>
          </div>
        </form>
      )}
      <section className="immunization-list">
        <div className="immunization-section-title">
          <div>
            <span>ACOMPANHAMENTO OPERACIONAL</span>
            <h2>Esquemas e busca ativa</h2>
          </div>
          <small>{courses.length} registro(s)</small>
        </div>
        {courses.length === 0 ? (
          <div className="immunization-empty">
            Nenhum esquema corresponde aos filtros. Ajuste a busca ou registre
            um exemplo fictício.
          </div>
        ) : (
          <div className="immunization-records">
            {courses.map((c) => {
              const scheme = vaccineSchemes.find((s) => s.id === c.schemeId);
              const overdue =
                c.status === "Em andamento" &&
                !!c.nextDoseAt &&
                c.nextDoseAt < today();
              return (
                <button
                  className={`immunization-record ${overdue ? "is-overdue" : ""}`}
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                >
                  <span className="immunization-record-icon">
                    <UserRound size={18} />
                  </span>
                  <span className="immunization-record-main">
                    <strong>{personName(c.personId)}</strong>
                    <small>
                      {scheme?.name} · {c.id}
                    </small>
                    <small>
                      {c.doses.length}/{scheme?.doses} doses · {c.status}
                    </small>
                  </span>
                  <span className="immunization-record-date">
                    <CalendarDays size={14} />
                    {c.nextDoseAt
                      ? `Próxima: ${dateLabel(c.nextDoseAt)}`
                      : "Sem próxima dose"}
                  </span>
                  <span
                    className={`immunization-status ${overdue ? "overdue" : c.status === "Concluído" ? "done" : "active"}`}
                  >
                    {overdue ? "Busca ativa" : c.status}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
      {selected && selectedScheme && (
        <div
          className="immunization-overlay"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          <section
            className="immunization-detail"
            role="dialog"
            aria-modal="true"
            aria-labelledby="immunization-detail-title"
          >
            <button
              className="immunization-back"
              onClick={() => setSelectedId(null)}
            >
              <ArrowLeft size={15} /> Voltar à lista
            </button>
            <span className="immunization-eyebrow">
              {selected.id} · DADOS FICTÍCIOS
            </span>
            <h2 id="immunization-detail-title">{selectedPerson}</h2>
            <p>
              {selectedScheme.name} · {selectedScheme.vaccine}
            </p>
            <div className="immunization-detail-grid">
              <span>
                Estado<strong>{selected.status}</strong>
              </span>
              <span>
                Doses
                <strong>
                  {selected.doses.length} de {selectedScheme.doses}
                </strong>
              </span>
              <span>
                Próxima data demonstrativa
                <strong>{dateLabel(selected.nextDoseAt)}</strong>
              </span>
            </div>
            <h3>Doses registradas</h3>
            {selected.doses.map((d) => (
              <div className="immunization-dose" key={d.id}>
                <strong>
                  Dose {d.doseNumber} · {dateLabel(d.appliedAt)}
                </strong>
                <span>Lote fictício {d.lot}</span>
                <small>
                  {healthTerritory.units.find((u) => u.id === d.unitId)?.name ??
                    "Unidade demonstrativa"}
                </small>
              </div>
            ))}
            {selected.status === "Em andamento" && (
              <div className="immunization-next-dose-form">
                <label htmlFor="next-dose-unit">
                  Unidade demonstrativa da dose
                </label>
                <select
                  id="next-dose-unit"
                  value={doseUnitId}
                  onChange={(event) => setDoseUnitId(event.target.value)}
                >
                  <option value="">Selecione uma unidade</option>
                  {healthTerritory.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
                <button
                  className="immunization-primary"
                  disabled={
                    !healthTerritory.units.some(
                      (unit) => unit.id === doseUnitId,
                    )
                  }
                  onClick={() => registerNextDose(selected, doseUnitId)}
                >
                  <Syringe size={15} /> Simular registro da próxima dose
                </button>
              </div>
            )}
            <h3>Histórico</h3>
            <ol className="immunization-history">
              {selected.history.map((h) => (
                <li key={h.id}>
                  <strong>{h.action}</strong>
                  <small>
                    {new Intl.DateTimeFormat("pt-BR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    }).format(new Date(h.at))}{" "}
                    · {h.actor}
                  </small>
                  <p>{h.note}</p>
                </li>
              ))}
            </ol>
            <p className="immunization-note">
              <Clock3 size={14} /> Fluxo local em memória; os esquemas e prazos
              não têm validade clínica.
            </p>
          </section>
        </div>
      )}
    </section>
  );
}
