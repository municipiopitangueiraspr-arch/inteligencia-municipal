import { useMemo, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ClipboardList,
  PackagePlus,
  Search,
  ShieldAlert,
  TrendingDown,
} from "lucide-react";
import type { PeopleRegistryDataset } from "../data/peopleRegistry";
import type { HealthTerritoryDataset } from "../data/healthTerritory";
import {
  getPharmacySummary,
  nextPharmacyLotId,
  nextPharmacyMovementId,
  pharmacyProducts,
  type HealthPharmacyDataset,
  type PharmacyMovementType,
} from "../data/healthPharmacy";
import "./HealthPharmacyModule.css";

type Props = {
  dataset: HealthPharmacyDataset;
  peopleRegistry: PeopleRegistryDataset;
  healthTerritory: HealthTerritoryDataset;
  onChange: (
    update: (current: HealthPharmacyDataset) => HealthPharmacyDataset,
  ) => void;
  onBack: () => void;
};
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00Z`),
  );
const actor = "Farmácia municipal · demonstração";
const nearExpiry = (value: string) => {
  const todayDate = new Date(`${today()}T00:00:00Z`);
  const limit = new Date(todayDate);
  limit.setUTCDate(limit.getUTCDate() + 60);
  return value < today()
    ? "Vencido"
    : value <= limit.toISOString().slice(0, 10)
      ? "Próximo da validade"
      : "Dentro da validade ilustrativa";
};

export default function HealthPharmacyModule({
  dataset,
  peopleRegistry,
  healthTerritory,
  onChange,
  onBack,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todos os lotes");
  const [formOpen, setFormOpen] = useState(false);
  const [movementType, setMovementType] =
    useState<PharmacyMovementType>("Entrada");
  const [notice, setNotice] = useState("");
  const summary = useMemo(() => getPharmacySummary(dataset), [dataset]);
  const activePeople = peopleRegistry.people.filter(
    (item) => item.status === "Ativa",
  );
  const productName = (id: string) =>
    pharmacyProducts.find((item) => item.id === id)?.name ??
    "Item fictício não localizado";
  const unitName = (id: string) =>
    healthTerritory.units.find((item) => item.id === id)?.name ??
    "Unidade não localizada";
  const personName = (id?: string) =>
    id
      ? (peopleRegistry.people.find((item) => item.id === id)?.fullName ??
        "Pessoa não localizada")
      : "Sem vínculo a pessoa";
  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return dataset.lots.filter((lot) => {
      const stock = dataset.lots
        .filter(
          (item) =>
            item.productId === lot.productId && item.unitId === lot.unitId,
        )
        .reduce((sum, item) => sum + item.quantity, 0);
      const minimum =
        pharmacyProducts.find((item) => item.id === lot.productId)
          ?.minimumStock ?? 0;
      const hasStock = lot.quantity > 0;
      const overdue = hasStock && lot.expiresAt < today();
      const soon =
        hasStock &&
        !overdue &&
        nearExpiry(lot.expiresAt) === "Próximo da validade";
      const low = stock < minimum;
      const text =
        `${lot.id} ${lot.batchCode} ${productName(lot.productId)} ${unitName(lot.unitId)}`.toLocaleLowerCase(
          "pt-BR",
        );
      return (
        (!normalized || text.includes(normalized)) &&
        (filter === "Todos os lotes" ||
          (filter === "Estoque baixo"
            ? low
            : filter === "Vencidos"
              ? overdue
              : soon))
      );
    });
  }, [dataset.lots, filter, query, healthTerritory.units]);

  const saveMovement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const productId = String(values.get("productId") ?? "");
    const unitId = String(values.get("unitId") ?? "");
    const quantity = Number(values.get("quantity"));
    const lotId = String(values.get("lotId") ?? "");
    const expiresAt = String(values.get("expiresAt") ?? "");
    const personId = String(values.get("personId") ?? "") || undefined;
    const note = String(values.get("note") ?? "").trim();
    const newLotCode = String(values.get("newLot") ?? "").trim();
    const existing = dataset.lots.find((item) => item.id === lotId);
    const duplicateLotCode = dataset.lots.some(
      (item) =>
        item.batchCode.toLocaleLowerCase("pt-BR") ===
        newLotCode.toLocaleLowerCase("pt-BR"),
    );
    if (!Number.isInteger(quantity) || quantity === 0 || !note) {
      setNotice(
        "Informe uma quantidade inteira diferente de zero e uma nota demonstrativa.",
      );
      return;
    }
    if (movementType === "Entrada") {
      if (
        !pharmacyProducts.some((item) => item.id === productId) ||
        !healthTerritory.units.some((item) => item.id === unitId) ||
        quantity <= 0 ||
        !/^[A-Za-z0-9-]{3,32}$/.test(newLotCode) ||
        duplicateLotCode ||
        !expiresAt ||
        expiresAt <= today()
      ) {
        setNotice(
          "Entrada: escolha produto e unidade existentes, quantidade positiva, lote sintético e validade futura.",
        );
        return;
      }
      const generatedId = nextPharmacyLotId(dataset.lots);
      const movementId = nextPharmacyMovementId(dataset.movements);
      onChange((current) => ({
        lots: [
          {
            id: generatedId,
            batchCode: newLotCode,
            productId,
            unitId,
            quantity,
            expiresAt,
          },
          ...current.lots,
        ],
        movements: [
          {
            id: movementId,
            type: "Entrada",
            lotId: generatedId,
            unitId,
            quantity,
            at: new Date().toISOString(),
            actor,
            note: `${note} · lote ${newLotCode} (referência fictícia)`,
          },
          ...current.movements,
        ],
      }));
      setNotice(`Entrada fictícia registrada no lote ${newLotCode}.`);
    } else {
      if (
        !existing ||
        existing.unitId !== unitId ||
        (personId && !activePeople.some((item) => item.id === personId)) ||
        (movementType === "Dispensação" &&
          (quantity <= 0 ||
            quantity > existing.quantity ||
            existing.expiresAt < today())) ||
        (movementType === "Ajuste" &&
          quantity < 0 &&
          existing.quantity <= Math.abs(quantity))
      ) {
        setNotice(
          movementType === "Dispensação"
            ? "Selecione lote/unidade válidos e não vencidos; a saída não pode exceder o saldo."
            : "Selecione lote/unidade existentes; o ajuste não pode zerar ou tornar o saldo negativo.",
        );
        return;
      }
      const movementId = nextPharmacyMovementId(dataset.movements);
      onChange((current) => ({
        lots: current.lots.map((item) =>
          item.id !== existing.id
            ? item
            : {
                ...item,
                quantity:
                  item.quantity +
                  (movementType === "Dispensação" ? -quantity : quantity),
              },
        ),
        movements: [
          {
            id: movementId,
            type: movementType,
            lotId: existing.id,
            unitId,
            quantity: movementType === "Dispensação" ? -quantity : quantity,
            at: new Date().toISOString(),
            actor,
            personId: movementType === "Dispensação" ? personId : undefined,
            note,
          },
          ...current.movements,
        ],
      }));
      setNotice(
        movementType === "Dispensação"
          ? "Saída simulada registrada nesta sessão; não é dispensação real."
          : "Ajuste sintético registrado nesta sessão.",
      );
    }
    form.reset();
    setFormOpen(false);
  };

  return (
    <section className="health-pharmacy-module">
      <header className="pharmacy-header">
        <button className="pharmacy-back" onClick={onBack}>
          <ArrowLeft size={16} /> Voltar ao catálogo da Saúde
        </button>
        <span className="pharmacy-eyebrow">
          SECRETARIA DE SAÚDE · DEMONSTRAÇÃO
        </span>
        <h1>Assistência Farmacêutica e Gestão de Medicamentos</h1>
        <p>
          Consulta de lotes, saldo e validade ilustrativos, com movimentações de
          teste em memória.
        </p>
      </header>
      <aside className="pharmacy-warning" role="note">
        <strong>Apenas protótipo — não usar em operações reais.</strong> Itens,
        códigos, unidades, saldos, lotes, datas e movimentos são fictícios. Não
        representa prescrição, orientação clínica, dispensação real nem estoque
        oficial. Não informe dados reais. Não inclui doses, posologia ou
        recomendação terapêutica e não substitui sistemas oficiais; não há
        integração com sistemas oficiais ou externos.
      </aside>
      {notice && (
        <p className="pharmacy-notice" role="status">
          {notice}
        </p>
      )}
      <div className="pharmacy-metrics">
        <article>
          <span>Unidades em lotes (demonstração)</span>
          <strong>{summary.totalUnits}</strong>
        </article>
        <article>
          <span>Lotes cadastrados</span>
          <strong>{summary.lots}</strong>
        </article>
        <article>
          <span>Combinações abaixo do mínimo ilustrativo</span>
          <strong>{summary.lowStock}</strong>
        </article>
        <article>
          <span>Lotes vencidos / próximos</span>
          <strong>
            {summary.expired} / {summary.expiring}
          </strong>
        </article>
      </div>
      <div className="pharmacy-toolbar">
        <div className="pharmacy-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Buscar item, lote ou unidade"
            placeholder="Buscar item, lote ou unidade"
          />
        </div>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          aria-label="Filtrar estoque"
        >
          <option>Todos os lotes</option>
          <option>Estoque baixo</option>
          <option>Próximos da validade</option>
          <option>Vencidos</option>
        </select>
        <button
          className="pharmacy-primary"
          onClick={() => {
            setFormOpen((value) => !value);
            setNotice("");
          }}
        >
          <PackagePlus size={16} /> Registrar movimentação
        </button>
      </div>
      {formOpen && (
        <form className="pharmacy-form" onSubmit={saveMovement}>
          <div className="pharmacy-form-heading">
            <div>
              <span>MOVIMENTAÇÃO FICTÍCIA</span>
              <h2>Registrar ajuste de estoque</h2>
            </div>
            <label>
              Tipo
              <select
                value={movementType}
                onChange={(event) =>
                  setMovementType(event.target.value as PharmacyMovementType)
                }
              >
                <option>Entrada</option>
                <option>Ajuste</option>
                <option>Dispensação</option>
              </select>
            </label>
          </div>
          {movementType === "Entrada" ? (
            <>
              <label>
                Item demonstrativo
                <select name="productId" required>
                  {pharmacyProducts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name} · {item.code}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unidade existente
                <select name="unitId" required>
                  {healthTerritory.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Código de lote fictício
                <input
                  name="newLot"
                  required
                  defaultValue="LOTE-DEMO-NOVO"
                  maxLength={32}
                />
              </label>
              <label>
                Validade futura demonstrativa
                <input name="expiresAt" required type="date" min={today()} />
              </label>
            </>
          ) : (
            <>
              <label>
                Lote/unidade
                <select name="lotId" required defaultValue="">
                  <option value="" disabled>
                    Selecione
                  </option>
                  {dataset.lots.map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.batchCode} · {productName(lot.productId)} ·{" "}
                      {unitName(lot.unitId)} · saldo {lot.quantity} · validade{" "}
                      {dateLabel(lot.expiresAt)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Unidade
                <select name="unitId" required>
                  {healthTerritory.units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </select>
              </label>
              {movementType === "Dispensação" && (
                <label>
                  Pessoa cadastrada (opcional)
                  <select name="personId" defaultValue="">
                    <option value="">Sem vínculo</option>
                    {activePeople.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.fullName} · {person.id}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </>
          )}
          <label>
            {movementType === "Ajuste"
              ? "Quantidade de ajuste (negativa reduz, positiva acrescenta)"
              : "Quantidade inteira"}
            <input
              name="quantity"
              required
              type="number"
              step="1"
              min={movementType === "Ajuste" ? undefined : 1}
              max={movementType === "Entrada" ? 100000 : undefined}
            />
          </label>
          <label className="pharmacy-form-note">
            Nota da demonstração
            <textarea
              name="note"
              required
              maxLength={180}
              placeholder="Explique a movimentação sintética"
            />
          </label>
          <div className="pharmacy-form-actions">
            <button type="button" onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
            <button type="submit" className="pharmacy-primary">
              Salvar somente nesta sessão
            </button>
          </div>
        </form>
      )}
      <section className="pharmacy-stock">
        <div className="pharmacy-section-heading">
          <div>
            <span>CONSULTA DE ESTOQUE</span>
            <h2>Itens por lote e unidade</h2>
          </div>
          <small>{rows.length} lote(s)</small>
        </div>
        {rows.length === 0 ? (
          <div className="pharmacy-empty">
            Nenhum lote corresponde à busca ou ao filtro atual.
          </div>
        ) : (
          <div className="pharmacy-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item fictício</th>
                  <th>Unidade</th>
                  <th>Lote</th>
                  <th>Saldo</th>
                  <th>Validade demo</th>
                  <th>Alerta</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((lot) => {
                  const product = pharmacyProducts.find(
                    (item) => item.id === lot.productId,
                  )!;
                  const unitStock = dataset.lots
                    .filter(
                      (item) =>
                        item.productId === lot.productId &&
                        item.unitId === lot.unitId,
                    )
                    .reduce((sum, item) => sum + item.quantity, 0);
                  const low = unitStock < product.minimumStock;
                  const validity =
                    lot.quantity > 0 ? nearExpiry(lot.expiresAt) : "Sem saldo";
                  return (
                    <tr key={lot.id}>
                      <td>
                        <strong>{product.name}</strong>
                        <small>
                          {product.code} · mínimo demo {product.minimumStock}
                        </small>
                      </td>
                      <td>{unitName(lot.unitId)}</td>
                      <td>
                        {lot.batchCode}
                        <small>{lot.id}</small>
                      </td>
                      <td>
                        <strong>{lot.quantity}</strong>
                        <small>unidades fictícias</small>
                      </td>
                      <td>{dateLabel(lot.expiresAt)}</td>
                      <td>
                        <span
                          className={`pharmacy-chip ${low || validity !== "Dentro da validade ilustrativa" ? "attention" : "ok"}`}
                        >
                          {validity === "Vencido"
                            ? "Vencido · demo"
                            : validity === "Sem saldo"
                              ? "Sem saldo · demo"
                              : low
                                ? "Saldo baixo · demo"
                                : validity === "Próximo da validade"
                                  ? "Validade próxima · demo"
                                  : "Normal · demo"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="pharmacy-movements">
        <div className="pharmacy-section-heading">
          <div>
            <span>TRILHA DA SESSÃO</span>
            <h2>Movimentações recentes</h2>
          </div>
          <small>{dataset.movements.length} registro(s)</small>
        </div>
        {dataset.movements.length === 0 ? (
          <div className="pharmacy-empty">Ainda não há movimentações.</div>
        ) : (
          dataset.movements.slice(0, 12).map((movement) => {
            const lot = dataset.lots.find((item) => item.id === movement.lotId);
            return (
              <article className="pharmacy-movement" key={movement.id}>
                <span
                  className={`pharmacy-movement-icon ${movement.type.toLowerCase()}`}
                >
                  {movement.type === "Dispensação" ? (
                    <TrendingDown size={16} />
                  ) : movement.type === "Entrada" ? (
                    <PackagePlus size={16} />
                  ) : (
                    <ClipboardList size={16} />
                  )}
                </span>
                <div>
                  <strong>
                    {movement.type} ·{" "}
                    {lot ? productName(lot.productId) : "Lote removido"}
                  </strong>
                  <small>
                    {movement.id} · {lot?.id} · {unitName(movement.unitId)}
                  </small>
                  <small>
                    {personName(movement.personId)} · {movement.actor}
                  </small>
                  <p>{movement.note}</p>
                </div>
                <time>
                  {new Intl.DateTimeFormat("pt-BR", {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(movement.at))}
                  <b>
                    {movement.quantity > 0 ? "+" : ""}
                    {movement.quantity}
                  </b>
                </time>
              </article>
            );
          })
        )}
      </section>
      <p className="pharmacy-footnote">
        <ShieldAlert size={15} /> Saldo e alertas são derivados dos lotes
        fictícios em memória. Prazos, mínimos e itens são exemplos de interface
        e não servem para aquisição, dispensação ou conduta real.
      </p>
    </section>
  );
}
