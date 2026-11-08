import { useEffect, useMemo, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  AlertTriangle,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Edit3,
  Filter,
  Fuel,
  Plus,
  RotateCcw,
  Save,
  Search,
  Store,
  UserCheck,
  UserPlus,
  UserRound,
  X,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { FleetOperationConfirmation, type FleetConfirmationRequest } from "./FleetOperationConfirmation";
import { StationFuelTypesPanel } from "./StationFuelTypesPanel";
import { StationDetailsPanel } from "./StationDetailsPanel";

type StationStatus = "PENDENTE" | "ATIVO" | "SUSPENSO" | "INATIVO" | "CREDENCIAMENTO_ENCERRADO";
type StationSortKey = "establishment" | "cnpj" | "representative" | "contact" | "status";
type StationSortDirection = "asc" | "desc";
type DriverSortKey = "name" | "registration" | "cpf" | "cnh" | "cnhExpiry" | "status";
type DriverSortDirection = "asc" | "desc";
export type Station = {
  id: string;
  razao_social_snapshot: string;
  nome_fantasia_snapshot: string | null;
  cnpj_snapshot: string;
  endereco: string | null;
  inscricao_estadual: string | null;
  telefone: string | null;
  email: string | null;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  contract_number: string | null;
  secondary_users_authorized: boolean;
  cidade: string | null;
  uf: string | null;
  representante_nome: string;
  representante_documento: string | null;
  representante_email: string | null;
  representante_telefone: string | null;
  status: StationStatus;
  credenciamento_started_at: string | null;
  credenciamento_ends_at: string | null;
  notes: string | null;
};
type Driver = {
  id: string;
  nome: string;
  matricula: string | null;
  cpf: string | null;
  cnh_number: string | null;
  cnh_valid_until: string | null;
  unidade_id: string | null;
  ativo: boolean;
};
type ResourceProps = { onSaved: () => Promise<void> };
type StationFormState = {
  razao_social_snapshot: string;
  nome_fantasia_snapshot: string;
  cnpj_snapshot: string;
  inscricao_estadual: string;
  telefone: string;
  email: string;
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  contract_number: string;
  secondary_users_authorized: boolean;
  endereco: string;
  cidade: string;
  uf: string;
  representante_nome: string;
  representante_documento: string;
  representante_email: string;
  representante_telefone: string;
  status: StationStatus;
  credenciamento_started_at: string;
  credenciamento_ends_at: string;
  notes: string;
};
type DriverFormState = {
  nome: string;
  matricula: string;
  cpf: string;
  cnh_number: string;
  cnh_valid_until: string;
  ativo: string;
};
type StationMember = {
  id: string;
  station_id: string;
  usuario_id: number;
  role: "REPRESENTANTE_LEGAL" | "OPERADOR" | "FRENTISTA" | "CAIXA_CONFERENTE";
  ativo: boolean;
  is_primary_contact: boolean;
  nome?: string | null;
  email?: string | null;
  cargo?: string | null;
};
type UserCandidate = {
  id: number;
  nome: string;
  email: string | null;
  cargo: string | null;
  perfil: string | null;
  ativo: boolean;
  telefone: string | null;
};

const stationStatusLabel: Record<StationStatus, string> = {
  PENDENTE: "Em análise",
  ATIVO: "Ativo",
  SUSPENSO: "Suspenso",
  INATIVO: "Inativo",
  CREDENCIAMENTO_ENCERRADO: "Credenciamento encerrado",
};

function brazilToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function effectiveStationStatus(station: Station): StationStatus {
  if (station.status !== "ATIVO") return station.status;
  const today = brazilToday();
  if (station.credenciamento_ends_at && station.credenciamento_ends_at.slice(0, 10) < today) return "CREDENCIAMENTO_ENCERRADO";
  if (!station.credenciamento_started_at || station.credenciamento_started_at.slice(0, 10) > today) return "PENDENTE";
  return "ATIVO";
}
function normalizedCnpj(value: string) { return value.toLocaleUpperCase("pt-BR").replace(/[^0-9A-Z]/g, ""); }
function validCnpj(value: string) {
  const cnpj = normalizedCnpj(value);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const digit = (base: string, weights: number[]) => {
    const sum = [...base].reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * weights[index], 0);
    const remainder = sum % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  const first = digit(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2]);
  const second = digit(cnpj.slice(0, 12) + first, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return cnpj.endsWith(first + second);
}

function normalizeError(code?: string) {
  return code === "23505"
    ? "Já existe um registro com estes dados."
    : "Não foi possível salvar. Verifique os dados e as permissões do seu perfil.";
}
function inputValue(value: string | null | undefined) {
  return value || "";
}
function driverCnhDaysUntil(value: string | null | undefined): number | null {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date();
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  const expiryUtc = Date.UTC(year, month - 1, day);
  if (!Number.isFinite(expiryUtc)) return null;
  return Math.round((expiryUtc - todayUtc) / 86_400_000);
}
function formatDriverCnhDate(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("pt-BR").format(new Date(`${value.slice(0, 10)}T00:00:00`)) : "Não informada";
}
function driverCnhState(value: string | null | undefined): "missing" | "expired" | "soon" | "valid" {
  const days = driverCnhDaysUntil(value);
  if (days === null) return "missing";
  if (days < 0) return "expired";
  if (days <= 60) return "soon";
  return "valid";
}

export function StationsView({ onSaved }: ResourceProps) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<Station | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StationStatus | "">("");
  const [cityFilter, setCityFilter] = useState("");
  const [ufFilter, setUfFilter] = useState("");
  const [sortKey, setSortKey] = useState<StationSortKey>("establishment");
  const [sortDirection, setSortDirection] = useState<StationSortDirection>("asc");
  const [confirmation, setConfirmation] = useState<FleetConfirmationRequest | null>(null);
  const [membersStation, setMembersStation] = useState<Station | null>(null);
  const [fuelTypesStation, setFuelTypesStation] = useState<Station | null>(null);
  const [detailsStation, setDetailsStation] = useState<Station | null>(null);
  const [form, setForm] = useState<StationFormState>({
    razao_social_snapshot: "",
    nome_fantasia_snapshot: "",
    cnpj_snapshot: "",
    inscricao_estadual: "",
    telefone: "",
    email: "",
    cep: "",
    logradouro: "",
    numero: "",
    complemento: "",
    bairro: "",
    contract_number: "",
    secondary_users_authorized: false,
    endereco: "",
    cidade: "",
    uf: "",
    representante_nome: "",
    representante_documento: "",
    representante_email: "",
    representante_telefone: "",
    status: "PENDENTE",
    credenciamento_started_at: "",
    credenciamento_ends_at: "",
    notes: "",
  });

  async function loadStations() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const all: Station[] = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const result = await supabase.from("fleet_fuel_stations").select(
        "id,razao_social_snapshot,nome_fantasia_snapshot,cnpj_snapshot,inscricao_estadual,telefone,email,cep,logradouro,numero,complemento,bairro,contract_number,secondary_users_authorized,endereco,cidade,uf,representante_nome,representante_documento,representante_email,representante_telefone,status,credenciamento_started_at,credenciamento_ends_at,notes",
      ).order("id").range(offset, offset + pageSize - 1);
      if (result.error) {
        setError("Não foi possível carregar todos os postos permitidos para este usuário.");
        setStations([]);
        setLoading(false);
        return;
      }
      const rows = (result.data || []) as Station[];
      all.push(...rows);
      if (rows.length < pageSize) break;
    }
    setStations(all);
    setLoading(false);
  }
  useEffect(() => {
    void loadStations();
  }, []);

  function openNew() {
    setEditing(null);
    setForm({
      razao_social_snapshot: "",
      nome_fantasia_snapshot: "",
      cnpj_snapshot: "",
      inscricao_estadual: "",
      telefone: "",
      email: "",
      cep: "",
      logradouro: "",
      numero: "",
      complemento: "",
      bairro: "",
      contract_number: "",
      secondary_users_authorized: false,
      endereco: "",
      cidade: "",
      uf: "",
      representante_nome: "",
      representante_documento: "",
      representante_email: "",
      representante_telefone: "",
      status: "PENDENTE",
      credenciamento_started_at: "",
      credenciamento_ends_at: "",
      notes: "",
    });
    setFormError("");
    setShowForm(true);
  }
  function openEdit(station: Station) {
    setEditing(station);
    setForm({
      razao_social_snapshot: station.razao_social_snapshot,
      nome_fantasia_snapshot: inputValue(station.nome_fantasia_snapshot),
      cnpj_snapshot: station.cnpj_snapshot,
      inscricao_estadual: inputValue(station.inscricao_estadual),
      telefone: inputValue(station.telefone),
      email: inputValue(station.email),
      cep: inputValue(station.cep),
      logradouro: inputValue(station.logradouro),
      numero: inputValue(station.numero),
      complemento: inputValue(station.complemento),
      bairro: inputValue(station.bairro),
      contract_number: inputValue(station.contract_number),
      secondary_users_authorized: station.secondary_users_authorized,
      endereco: inputValue(station.endereco),
      cidade: inputValue(station.cidade),
      uf: inputValue(station.uf),
      representante_nome: station.representante_nome,
      representante_documento: inputValue(station.representante_documento),
      representante_email: inputValue(station.representante_email),
      representante_telefone: inputValue(station.representante_telefone),
      status: station.status,
      credenciamento_started_at: inputValue(station.credenciamento_started_at),
      credenciamento_ends_at: inputValue(station.credenciamento_ends_at),
      notes: inputValue(station.notes),
    });
    setFormError("");
    setShowForm(true);
  }
  function requestSave() {
    const normalizedCurrentCnpj = normalizedCnpj(form.cnpj_snapshot);
    const cnpjChanged = !editing || normalizedCurrentCnpj !== normalizedCnpj(editing.cnpj_snapshot);
    if (form.razao_social_snapshot.trim().length < 2) { setFormError("Informe a razão social do estabelecimento."); return; }
    if (!normalizedCurrentCnpj) { setFormError("Informe o CNPJ do estabelecimento."); return; }
    if (cnpjChanged && !validCnpj(form.cnpj_snapshot)) { setFormError("Informe um CNPJ válido. Confira os 14 caracteres e os dígitos verificadores."); return; }
    if (form.representante_nome.trim().length < 2) { setFormError("Informe o nome completo do representante legal."); return; }
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { setFormError("Informe um e-mail válido para o estabelecimento."); return; }
    if (form.representante_email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.representante_email.trim())) { setFormError("Informe um e-mail válido para o representante legal."); return; }
    if (form.credenciamento_started_at && form.credenciamento_ends_at && form.credenciamento_ends_at < form.credenciamento_started_at) { setFormError("A data final da vigência não pode anteceder a data inicial."); return; }
    if (form.status === "ATIVO" && !form.credenciamento_started_at) { setFormError("Informe a data de início da vigência antes de ativar o posto."); return; }
    setFormError("");
    const name = form.nome_fantasia_snapshot.trim() || form.razao_social_snapshot.trim() || "Posto sem nome";
    setConfirmation({
      eyebrow: "INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS",
      title: editing ? "Confirmar atualização do posto" : "Confirmar novo credenciamento",
      message: editing ? "Os dados cadastrais deste estabelecimento serão atualizados no sistema." : "O posto será cadastrado na rede credenciada da Prefeitura.",
      details: [`Estabelecimento: ${name}`, `CNPJ: ${form.cnpj_snapshot.trim() || "Não informado"}`, `Situação: ${stationStatusLabel[form.status]}`],
      confirmLabel: editing ? "Salvar alterações" : "Cadastrar posto",
      onConfirm: save,
    });
  }
  async function save(): Promise<string | null> {
    if (!supabase) return "O serviço de dados não está disponível.";
    setSaving(true);
    setFormError("");
    const payload = {
      razao_social_snapshot: form.razao_social_snapshot.trim(),
      nome_fantasia_snapshot: form.nome_fantasia_snapshot.trim() || null,
      cnpj_snapshot: form.cnpj_snapshot.trim(),
      inscricao_estadual: form.inscricao_estadual.trim() || null,
      telefone: form.telefone.trim() || null,
      email: form.email.trim() || null,
      cep: form.cep.trim() || null,
      logradouro: form.logradouro.trim() || null,
      numero: form.numero.trim() || null,
      complemento: form.complemento.trim() || null,
      bairro: form.bairro.trim() || null,
      contract_number: form.contract_number.trim() || null,
      secondary_users_authorized: form.secondary_users_authorized,
      endereco: [form.logradouro.trim(), form.numero.trim(), form.complemento.trim(), form.bairro.trim(), form.cidade.trim(), form.uf.trim()].filter(Boolean).join(", ") || null,
      cidade: form.cidade.trim() || null,
      uf: form.uf.trim().toUpperCase() || null,
      representante_nome: form.representante_nome.trim(),
      representante_documento: form.representante_documento.trim() || null,
      representante_email: form.representante_email.trim() || null,
      representante_telefone: form.representante_telefone.trim() || null,
      status: form.status,
      credenciamento_started_at: form.credenciamento_started_at || null,
      credenciamento_ends_at: form.credenciamento_ends_at || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    try {
      const result = editing
        ? await supabase.from("fleet_fuel_stations").update(payload).eq("id", editing.id)
        : await createStation(payload);
      setSaving(false);
      if (result.error) {
        const message = normalizeError(result.error.code);
        setFormError(message);
        return message;
      }
      setShowForm(false);
      try { await loadStations(); await onSaved(); }
      catch { setError("Credenciamento salvo, mas a tela não pôde ser atualizada. Atualize os dados."); }
      return null;
    } catch {
      setSaving(false);
      return "Não foi possível concluir o credenciamento. Verifique a conexão e tente novamente.";
    }
  }
  async function createStation(payload: Record<string, unknown>) {
    const { data: municipio } = await supabase!.rpc(
      "fleet_current_municipio_id",
    );
    const { data: currentUser } = await supabase!.rpc(
      "fleet_current_usuario_id",
    );
    return supabase!
      .from("fleet_fuel_stations")
      .insert({ ...payload, municipio_id: municipio, created_by: currentUser });
  }
  const cities = useMemo(() => [...new Set(stations.map((station) => station.cidade?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })), [stations]);
  const states = useMemo(() => [...new Set(stations.map((station) => station.uf?.trim().toUpperCase()).filter((value): value is string => Boolean(value)))].sort(), [stations]);
  const filtered = useMemo(() => stations.filter((station) => {
    const haystack = `${station.nome_fantasia_snapshot || ""} ${station.razao_social_snapshot} ${station.cnpj_snapshot}`.toLocaleLowerCase("pt-BR");
    return haystack.includes(query.trim().toLocaleLowerCase("pt-BR"))
      && (!statusFilter || effectiveStationStatus(station) === statusFilter)
      && (!cityFilter || station.cidade === cityFilter)
      && (!ufFilter || station.uf?.toUpperCase() === ufFilter);
  }), [stations, query, statusFilter, cityFilter, ufFilter]);
  const sortedStations = useMemo(() => [...filtered].sort((a, b) => {
    const value = (station: Station) => {
      if (sortKey === "establishment") return station.nome_fantasia_snapshot || station.razao_social_snapshot;
      if (sortKey === "cnpj") return station.cnpj_snapshot;
      if (sortKey === "representative") return station.representante_nome;
      if (sortKey === "contact") return `${station.representante_email || ""} ${station.representante_telefone || ""}`;
      return stationStatusLabel[effectiveStationStatus(station)];
    };
    const comparison = value(a).localeCompare(value(b), "pt-BR", { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id);
    return sortDirection === "asc" ? comparison : -comparison;
  }), [filtered, sortKey, sortDirection]);
  const activeFilterCount = Number(Boolean(query.trim())) + Number(Boolean(statusFilter)) + Number(Boolean(cityFilter)) + Number(Boolean(ufFilter));
  function toggleStationSort(key: StationSortKey) {
    if (sortKey === key) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
  }
  function stationSortHeading(key: StationSortKey, label: string) {
    const active = sortKey === key;
    const Icon = !active ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;
    return <th aria-sort={active ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="fleet-sort-button" onClick={() => toggleStationSort(key)}>{label}<Icon size={12} /></button></th>;
  }
  function clearStationFilters() {
    setQuery(""); setStatusFilter(""); setCityFilter(""); setUfFilter("");
  }
  return (
    <section className="fleet-section fleet-page-section">
      <div className="fleet-page-heading">
        <div>
          <span className="fleet-kicker">CADASTRO DE APOIO</span>
          <h2>Postos credenciados</h2>
          <p>
            Estabelecimentos autorizados a submeter abastecimentos da frota.
          </p>
        </div>
        <button className="fleet-primary-button" onClick={openNew}>
          <Plus size={16} /> Novo credenciamento
        </button>
      </div>
      {error && <div className="fleet-inline-error">{error}</div>}
      <div className="fleet-resource-toolbar">
        <div className="fleet-resource-summary"><Store size={17} /><strong>{stations.length}</strong><span>postos carregados · lista completa</span></div>
      </div>
      <section className="fleet-vehicle-filters station-filters">
        <div className="fleet-vehicle-filter-heading"><div><Filter size={15} /><strong>Filtros de postos</strong><span>{filtered.length} resultado(s) · {activeFilterCount} filtro(s) ativo(s)</span></div><button type="button" onClick={clearStationFilters} disabled={!activeFilterCount}><RotateCcw size={12} /> Limpar</button></div>
        <div className="fleet-vehicle-filter-grid station-filter-grid">
          <label className="fleet-vehicle-search"><span>Razão social, nome fantasia ou CNPJ</span><div><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar razão social, nome fantasia ou CNPJ…" /></div></label>
          <label>Situação<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StationStatus | "")}><option value="">Todas</option>{Object.entries(stationStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Município / cidade<select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option value="">Todos</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
          <label>UF<select value={ufFilter} onChange={(event) => setUfFilter(event.target.value)}><option value="">Todas</option>{states.map((state) => <option key={state} value={state}>{state}</option>)}</select></label>
        </div>
      </section>
      <div className="fleet-table-panel">
        {loading ? (
          <div className="fleet-loading">Carregando postos…</div>
        ) : filtered.length ? (
          <table className="fleet-table fleet-resource-table">
            <thead>
              <tr>
                {stationSortHeading("establishment", "Estabelecimento")}
                {stationSortHeading("cnpj", "Documento / CNPJ")}
                {stationSortHeading("representative", "Representante")}
                {stationSortHeading("contact", "Contato")}
                {stationSortHeading("status", "Status")}
                <th>Ações</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sortedStations.map((station) => (
                <tr key={station.id}>
                  <td>
                    <strong>
                      {station.nome_fantasia_snapshot ||
                        station.razao_social_snapshot}
                    </strong>
                    <small>{station.razao_social_snapshot}</small>
                  </td>
                  <td>{station.cnpj_snapshot}</td>
                  <td>
                    <strong>{station.representante_nome}</strong>
                    <small>
                      {station.representante_documento ||
                        "Documento não informado"}
                    </small>
                  </td>
                  <td>
                    <small>
                      {station.representante_email || "E-mail não informado"}
                    </small>
                    <small>
                      {station.representante_telefone ||
                        "Telefone não informado"}
                    </small>
                  </td>
                  <td>
                    <span
                      className={`fleet-status ${effectiveStationStatus(station) === "ATIVO" ? "success" : ["SUSPENSO", "INATIVO", "CREDENCIAMENTO_ENCERRADO"].includes(effectiveStationStatus(station)) ? "danger" : "warning"}`}
                    >
                      {stationStatusLabel[effectiveStationStatus(station)]}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="fleet-secondary-button fleet-members-button" onClick={() => setDetailsStation(station)}>
                      <Building2 size={14} /> Ficha
                    </button>
                    <button
                      className="fleet-secondary-button fleet-members-button"
                      onClick={() => setMembersStation(station)}
                    >
                      <UserPlus size={14} /> Gerenciar
                    </button>
                    <button
                      className="fleet-secondary-button fleet-members-button"
                      onClick={() => setFuelTypesStation(station)}
                      aria-label={`Combustíveis autorizados para ${station.nome_fantasia_snapshot || station.razao_social_snapshot}`}
                    >
                      <Fuel size={14} /> Combustíveis
                    </button>
                  </td>
                  <td>
                    <button
                      className="fleet-row-action"
                      onClick={() => openEdit(station)}
                      aria-label={`Editar ${station.nome_fantasia_snapshot || station.razao_social_snapshot}`}
                    >
                      <Edit3 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="fleet-empty">
            <span>
              <Store size={24} />
            </span>
            <strong>{activeFilterCount ? "Nenhum posto corresponde aos filtros" : "Nenhum posto cadastrado"}</strong>
            <p>{activeFilterCount ? "Ajuste os critérios ou limpe os filtros para consultar outros postos." : "Cadastre o primeiro estabelecimento credenciado para iniciar a operação."}</p>
            {activeFilterCount ? <button className="fleet-secondary-button" onClick={clearStationFilters}><RotateCcw size={14} /> Limpar filtros</button> : <button className="fleet-primary-button" onClick={openNew}><Plus size={15} /> Novo credenciamento</button>}
          </div>
        )}
      </div>
      {membersStation && (
        <StationMembersPanel
          station={membersStation}
          onClose={() => setMembersStation(null)}
          onSaved={onSaved}
        />
      )}
      {fuelTypesStation && (
        <StationFuelTypesPanel
          station={fuelTypesStation}
          onClose={() => setFuelTypesStation(null)}
          onSaved={onSaved}
        />
      )}
      {detailsStation && <StationDetailsPanel station={detailsStation} onClose={() => setDetailsStation(null)} />}
      {showForm && (
        <StationForm
          form={form}
          setForm={setForm}
          editing={editing}
          saving={saving}
          error={formError}
          onClose={() => setShowForm(false)}
          onSubmit={requestSave}
        />
      )}
      {confirmation && <FleetOperationConfirmation request={confirmation} onClose={() => setConfirmation(null)} />}
    </section>
  );
}

export function StationMembersPanel({
  station,
  onClose,
  onSaved,
  allowCreateUser = false,
}: {
  station: Station;
  onClose: () => void;
  onSaved: () => Promise<void>;
  allowCreateUser?: boolean;
}) {
  const [members, setMembers] = useState<StationMember[]>([]);
  const [users, setUsers] = useState<UserCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<FleetConfirmationRequest | null>(null);
  const [form, setForm] = useState({
    usuario_id: "",
    role: "OPERADOR" as StationMember["role"],
  });
  const [createForm, setCreateForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    role: "OPERADOR" as Exclude<StationMember["role"], "REPRESENTANTE_LEGAL">,
  });

  async function load() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const membersResult = await supabase.rpc("fleet_station_member_directory", {
      p_station_id: station.id,
    });
    const usersResult = allowCreateUser
      ? { data: [] as UserCandidate[], error: null }
      : await supabase.rpc("fleet_station_user_candidates");
    if (membersResult.error || usersResult.error)
      setError(
        "Não foi possível carregar os usuários do posto. Verifique se seu perfil possui permissão de administração.",
      );
    else {
      setMembers((membersResult.data || []) as StationMember[]);
      setUsers((usersResult.data || []) as UserCandidate[]);
    }
    setLoading(false);
  }
  useEffect(() => {
    void load();
  }, [station.id]);
  const user = (id: number) => users.find((item) => item.id === id);
  const roleLabel: Record<StationMember["role"], string> = {
    REPRESENTANTE_LEGAL: "Representante legal",
    OPERADOR: "Operador",
    FRENTISTA: "Frentista",
    CAIXA_CONFERENTE: "Caixa/conferente",
  };
  function requestAddMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.usuario_id) return;
    const candidate = user(Number(form.usuario_id));
    setConfirmation({
      eyebrow: "INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS",
      title: "Confirmar vínculo de usuário",
      message: "O usuário selecionado passará a ter acesso operacional vinculado exclusivamente a este posto.",
      details: [`Posto: ${station.nome_fantasia_snapshot || station.razao_social_snapshot}`, `Usuário: ${candidate?.nome || form.usuario_id}`, `Perfil: ${roleLabel[form.role]}`, "O representante legal permanece como contato principal."],
      confirmLabel: "Vincular usuário",
      onConfirm: addMember,
    });
  }
  async function addMember(): Promise<string | null> {
    if (!supabase || !form.usuario_id) return "Selecione um usuário para continuar.";
    setSaving(true);
    setError("");
    try {
      const municipio = await supabase.rpc("fleet_current_municipio_id");
      const granted = await supabase.rpc("fleet_current_usuario_id");
      if (municipio.error || granted.error) return "Não foi possível identificar o município ou o usuário responsável.";
      if (form.role === "REPRESENTANTE_LEGAL") return "O vínculo administrativo só pode ser criado para usuário secundário.";
      const result = await supabase.from("fleet_station_members").insert({ municipio_id: municipio.data, station_id: station.id, usuario_id: Number(form.usuario_id), role: form.role, ativo: true, is_primary_contact: false, granted_by: granted.data });
      if (result.error) {
        const message = result.error.code === "23505" ? "Este usuário já está vinculado a este posto." : "Não foi possível vincular o usuário.";
        setError(message);
        return message;
      }
      setForm({ usuario_id: "", role: "OPERADOR" });
      try { await load(); await onSaved(); }
      catch { setError("Usuário vinculado, mas a tela não pôde ser atualizada. Atualize os dados."); }
      return null;
    } catch {
      return "Não foi possível vincular o usuário. Verifique a conexão e tente novamente.";
    } finally { setSaving(false); }
  }
  function requestCreateUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConfirmation({
      eyebrow: "INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS",
      title: "Confirmar criação de acesso",
      message: "Será criado um usuário para operar no portal deste posto. Revise os dados antes de prosseguir.",
      details: [`Posto: ${station.nome_fantasia_snapshot || station.razao_social_snapshot}`, `Usuário: ${createForm.nome.trim() || "Não informado"}`, `E-mail: ${createForm.email.trim() || "Não informado"}`, `Perfil: ${roleLabel[createForm.role]}`],
      confirmLabel: "Criar acesso",
      onConfirm: createUser,
    });
  }
  async function createUser(): Promise<string | null> {
    if (!supabase || !allowCreateUser) return "Este perfil não pode criar usuários para o posto.";
    setSaving(true);
    setError("");
    try {
      const result = await supabase.functions.invoke("create-station-user", { body: { station_id: station.id, nome: createForm.nome.trim(), email: createForm.email.trim(), telefone: createForm.telefone.trim() || null, role: createForm.role } });
      if (result.error || result.data?.error) {
        const message = result.data?.error || "Não foi possível criar o acesso.";
        setError(message);
        return message;
      }
      setCreateForm({ nome: "", email: "", telefone: "", role: "OPERADOR" });
      try { await load(); await onSaved(); }
      catch { setError("Acesso criado, mas a tela não pôde ser atualizada. Atualize os dados."); }
      return null;
    } catch {
      return "Não foi possível criar o acesso. Verifique a conexão e tente novamente.";
    } finally { setSaving(false); }
  }
  function requestUpdateMember(member: StationMember, changes: Partial<StationMember>) {
    const [field, value] = Object.entries(changes)[0] || [];
    if (!field) return;
    const fieldLabel = field === "role" ? "Perfil" : field === "ativo" ? "Situação" : "Contato principal";
    const before = field === "role" ? roleLabel[member.role] : field === "ativo" ? member.ativo ? "Ativo" : "Inativo" : member.is_primary_contact ? "Sim" : "Não";
    const after = field === "role" ? roleLabel[value as StationMember["role"]] : field === "ativo" ? value ? "Ativo" : "Inativo" : value ? "Sim" : "Não";
    setConfirmation({
      eyebrow: "INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS",
      title: `Confirmar alteração de ${fieldLabel.toLocaleLowerCase("pt-BR")}`,
      message: "Esta mudança atualiza as permissões operacionais do usuário no posto.",
      details: [`Posto: ${station.nome_fantasia_snapshot || station.razao_social_snapshot}`, `Usuário: ${member.nome || user(member.usuario_id)?.nome || `#${member.usuario_id}`}`, `${fieldLabel}: ${before} → ${after}`],
      confirmLabel: "Confirmar alteração",
      tone: field === "ativo" && value === false ? "danger" : undefined,
      onConfirm: () => updateMember(member, changes),
    });
  }
  async function updateMember(member: StationMember, changes: Partial<StationMember>): Promise<string | null> {
    if (!supabase) return "O serviço de dados não está disponível.";
    setSaving(true);
    setError("");
    try {
      const result = await supabase.from("fleet_station_members").update({ ...changes, updated_at: new Date().toISOString() }).eq("id", member.id);
      if (result.error) { setError("Não foi possível atualizar este usuário."); return "Não foi possível atualizar este usuário."; }
      try { await load(); await onSaved(); }
      catch { setError("Usuário atualizado, mas a tela não pôde ser atualizada. Atualize os dados."); }
      return null;
    } catch {
      return "Não foi possível atualizar este usuário. Verifique a conexão e tente novamente.";
    } finally { setSaving(false); }
  }
  return (
    <>
    <div className="fleet-modal-backdrop" role="presentation">
      <section className="fleet-modal fleet-members-modal">
        <div className="fleet-modal-heading">
          <div>
            <span className="fleet-kicker">ACESSO OPERACIONAL</span>
            <h2>Usuários do posto</h2>
            <p className="fleet-members-subtitle">
              {station.nome_fantasia_snapshot || station.razao_social_snapshot}
            </p>
          </div>
          <button
            type="button"
            className="fleet-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        <div className="fleet-members-note">
          <UserCheck size={16} />
          <span>
            Cada usuário pertence exclusivamente a este estabelecimento. O representante legal é o contato principal; operador, frentista e caixa/conferente são usuários secundários.
          </span>
        </div>
        {error && <div className="fleet-inline-error">{error}</div>}
        {allowCreateUser && !station.secondary_users_authorized && <div className="fleet-members-note">A Prefeitura ainda não habilitou o representante legal para convidar usuários secundários.</div>}
        {allowCreateUser && (
          station.secondary_users_authorized && <form className="fleet-member-create-form" onSubmit={requestCreateUser}>
            <div className="fleet-form-section-title"><UserPlus size={16} /> Criar novo acesso do posto</div>
            <p className="fleet-members-help">Somente o representante legal autorizado pela Prefeitura pode convidar usuários secundários. O convite de acesso será enviado por e-mail.</p>
            <div className="fleet-form-grid">
              <label>Nome completo<input required value={createForm.nome} onChange={(event) => setCreateForm({ ...createForm, nome: event.target.value })} /></label>
              <label>E-mail de acesso<input required type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} /></label>
              <label>Telefone<input value={createForm.telefone} onChange={(event) => setCreateForm({ ...createForm, telefone: event.target.value })} /></label>
              <label>Papel<select value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value as typeof createForm.role })}><option value="OPERADOR">Operador</option><option value="FRENTISTA">Frentista</option><option value="CAIXA_CONFERENTE">Caixa/conferente</option></select></label>
            </div>
            <button type="submit" className="fleet-primary-button" disabled={saving}><UserPlus size={15} /> {saving ? "Criando acesso…" : "Criar usuário do posto"}</button>
          </form>
        )}
        {!allowCreateUser && <form className="fleet-member-add-form" onSubmit={requestAddMember}>
          <label>
            Usuário existente
            <select
              required
              value={form.usuario_id}
              onChange={(event) =>
                setForm({ ...form, usuario_id: event.target.value })
              }
            >
              <option value="">Selecione um usuário</option>
              {users
                .filter(
                  (candidate) =>
                    !members.some(
                      (member) => member.usuario_id === candidate.id,
                    ),
                )
                .map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.nome} —{" "}
                    {candidate.email || candidate.cargo || "sem contato"}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Papel
            <select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value as StationMember["role"] })}
            >
              <option value="OPERADOR">Operador</option>
              <option value="FRENTISTA">Frentista</option>
              <option value="CAIXA_CONFERENTE">Caixa/conferente</option>
            </select>
          </label>
          <button
            type="submit"
            className="fleet-primary-button"
            disabled={saving}
          >
            <UserPlus size={15} /> Vincular usuário
          </button>
        </form>}
        <div className="fleet-members-list">
          {loading ? (
            <div className="fleet-loading">Carregando usuários…</div>
          ) : members.length ? (
            members.map((member) => (
              <article className="fleet-member-card" key={member.id}>
                <div className="fleet-member-identity">
                  <span className="fleet-user-avatar">
                    <UserRound size={14} />
                  </span>
                  <div>
                        <strong>{member.nome || user(member.usuario_id)?.nome || `Usuário #${member.usuario_id}`}</strong>
                        <small>
                          {member.email || user(member.usuario_id)?.email ||
                            user(member.usuario_id)?.cargo ||
                        "Contato não informado"}
                    </small>
                  </div>
                </div>
                <div>
                  <span className="fleet-member-role">
                    {roleLabel[member.role]}
                  </span>
                  {member.is_primary_contact && (
                    <span className="fleet-primary-badge">
                      Contato principal
                    </span>
                  )}
                </div>
                <div className="fleet-member-actions">
                  <label>
                    Perfil
                    <select
                      value={member.role}
                      onChange={(event) =>
                        requestUpdateMember(member, {
                          role: event.target.value as StationMember["role"],
                        })
                      }
                      disabled={saving || member.role === "REPRESENTANTE_LEGAL"}
                    >
                      {member.role === "REPRESENTANTE_LEGAL" && <option value="REPRESENTANTE_LEGAL">Representante legal</option>}
                      <option value="OPERADOR">Operador</option>
                      <option value="FRENTISTA">Frentista</option>
                      <option value="CAIXA_CONFERENTE">Caixa/conferente</option>
                    </select>
                  </label>
                  <label>
                    Situação
                    <select
                      value={String(member.ativo)}
                      onChange={(event) =>
                        requestUpdateMember(member, {
                          ativo: event.target.value === "true",
                        })
                      }
                      disabled={saving}
                    >
                      <option value="true">Ativo</option>
                      <option value="false">Inativo</option>
                    </select>
                  </label>
                </div>
              </article>
            ))
          ) : (
            <div className="fleet-history-empty">
              Nenhum usuário vinculado a este posto.
            </div>
          )}
        </div>
        <div className="fleet-modal-actions">
          <button
            type="button"
            className="fleet-secondary-button"
            onClick={onClose}
          >
            Fechar
          </button>
        </div>
      </section>
    </div>
    {confirmation && <FleetOperationConfirmation request={confirmation} onClose={() => setConfirmation(null)} />}
    </>
  );
}

function StationForm({
  form,
  setForm,
  editing,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  form: StationFormState;
  setForm: Dispatch<SetStateAction<StationFormState>>;
  editing: Station | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const update = (key: string, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <div
      className="fleet-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="fleet-modal fleet-resource-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="fleet-modal-heading">
          <div>
            <span className="fleet-kicker">
              {editing ? "ATUALIZAÇÃO CADASTRAL" : "CADASTRO OFICIAL"}
            </span>
            <h2>{editing ? "Editar posto" : "Novo posto credenciado"}</h2>
          </div>
          <button
            type="button"
            className="fleet-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        {error && <div className="fleet-inline-error">{error}</div>}
        <div className="fleet-form-section-title">
          <Building2 size={16} /> Dados do estabelecimento
        </div>
        <div className="fleet-form-grid">
          <Field
            label="Razão social"
            required
            value={form.razao_social_snapshot}
            onChange={(value) => update("razao_social_snapshot", value)}
          />
          <Field
            label="Nome fantasia"
            value={form.nome_fantasia_snapshot}
            onChange={(value) => update("nome_fantasia_snapshot", value)}
          />
          <Field
            label="CNPJ"
            required
            value={form.cnpj_snapshot}
            onChange={(value) => update("cnpj_snapshot", value)}
            placeholder="00.000.000/0001-00"
          />
          <Field label="Inscrição estadual" value={form.inscricao_estadual} onChange={(value) => update("inscricao_estadual", value)} />
          <Field label="Telefone do estabelecimento" value={form.telefone} onChange={(value) => update("telefone", value)} />
          <Field label="E-mail do estabelecimento" type="email" value={form.email} onChange={(value) => update("email", value)} />
          <Field label="CEP" value={form.cep} onChange={(value) => update("cep", value)} />
          <Field label="Logradouro" value={form.logradouro} onChange={(value) => update("logradouro", value)} />
          <Field label="Número" value={form.numero} onChange={(value) => update("numero", value)} />
          <Field label="Complemento" value={form.complemento} onChange={(value) => update("complemento", value)} />
          <Field label="Bairro" value={form.bairro} onChange={(value) => update("bairro", value)} />
          <Field label="Cidade / município" value={form.cidade} onChange={(value) => update("cidade", value)} placeholder="Aceita estabelecimento fora de Pitangueiras" />
          <Field
            label="UF"
            maxLength={2}
            value={form.uf}
            onChange={(value) => update("uf", value)}
            placeholder="PR"
          />
        </div>
        <div className="fleet-form-section-title">
          <UserRound size={16} /> Representante legal
        </div>
        <div className="fleet-form-grid">
          <Field
            label="Nome completo"
            required
            value={form.representante_nome}
            onChange={(value) => update("representante_nome", value)}
          />
          <Field
            label="Documento"
            value={form.representante_documento}
            onChange={(value) => update("representante_documento", value)}
          />
          <Field
            label="E-mail"
            type="email"
            value={form.representante_email}
            onChange={(value) => update("representante_email", value)}
          />
          <Field
            label="Telefone"
            value={form.representante_telefone}
            onChange={(value) => update("representante_telefone", value)}
          />
        </div>
        <div className="fleet-form-section-title">
          <Save size={16} /> Credenciamento
        </div>
        <div className="fleet-form-grid">
          <Field label="Número de contrato / instrumento" value={form.contract_number} onChange={(value) => update("contract_number", value)} />
          <Field
            label="Início"
            type="date"
            value={form.credenciamento_started_at}
            onChange={(value) => update("credenciamento_started_at", value)}
          />
          <Field
            label="Validade"
            type="date"
            value={form.credenciamento_ends_at}
            onChange={(value) => update("credenciamento_ends_at", value)}
          />
          <label>
            Status
            <select
              value={form.status}
              onChange={(event) => update("status", event.target.value)}
            >
              <option value="PENDENTE">Pendente</option>
              <option value="ATIVO">Ativo</option>
              <option value="SUSPENSO">Suspenso</option>
              <option value="INATIVO">Inativo</option>
              <option value="CREDENCIAMENTO_ENCERRADO">Credenciamento encerrado</option>
            </select>
          </label>
          <label className="fleet-form-wide station-secondary-auth"><input type="checkbox" checked={form.secondary_users_authorized} onChange={(event) => setForm({ ...form, secondary_users_authorized: event.target.checked })} /> Autorizar o representante legal a convidar usuários secundários para este posto</label>
          <label className="fleet-form-wide">
            Observações
            <textarea
              value={form.notes}
              onChange={(event) => update("notes", event.target.value)}
              rows={4}
              placeholder="Registre informações úteis para a operação, contato ou análise do credenciamento."
            />
          </label>
        </div>
        <div className="fleet-modal-actions">
          <button
            type="button"
            className="fleet-secondary-button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="fleet-primary-button"
            disabled={saving}
          >
            {saving ? (
              "Salvando…"
            ) : (
              <>
                <Save size={15} /> Salvar posto
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export function DriversView({ onSaved }: ResourceProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [editing, setEditing] = useState<Driver | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"" | "ATIVO" | "INATIVO">("");
  const [cnhFilter, setCnhFilter] = useState<"" | "EXPIRADA" | "ATE_60_DIAS" | "REGULAR" | "SEM_VALIDADE">("");
  const [sortKey, setSortKey] = useState<DriverSortKey>("name");
  const [sortDirection, setSortDirection] = useState<DriverSortDirection>("asc");
  const [confirmation, setConfirmation] = useState<FleetConfirmationRequest | null>(null);
  const [form, setForm] = useState<DriverFormState>({ nome: "", matricula: "", cpf: "", cnh_number: "", cnh_valid_until: "", ativo: "true" });

  async function loadDrivers() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    setError("");
    const all: Driver[] = [];
    const pageSize = 1000;
    try {
      for (let offset = 0; ; offset += pageSize) {
        const result = await supabase.from("fleet_drivers").select("id,nome,matricula,cpf,cnh_number,cnh_valid_until,unidade_id,ativo").order("nome").order("id").range(offset, offset + pageSize - 1);
        if (result.error) { setError("Não foi possível carregar todos os motoristas permitidos para este usuário."); setDrivers([]); setLoading(false); return; }
        const rows = (result.data || []) as Driver[];
        all.push(...rows);
        if (rows.length < pageSize) break;
      }
      setDrivers(all);
    } catch {
      setError("Não foi possível carregar os motoristas. Verifique a conexão e tente novamente.");
      setDrivers([]);
    }
    setLoading(false);
  }
  useEffect(() => { void loadDrivers(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ nome: "", matricula: "", cpf: "", cnh_number: "", cnh_valid_until: "", ativo: "true" });
    setFormError("");
    setShowForm(true);
  }
  function openEdit(driver: Driver) {
    setEditing(driver);
    setForm({ nome: driver.nome, matricula: inputValue(driver.matricula), cpf: inputValue(driver.cpf), cnh_number: inputValue(driver.cnh_number), cnh_valid_until: inputValue(driver.cnh_valid_until), ativo: String(driver.ativo) });
    setFormError("");
    setShowForm(true);
  }
  function requestSave() {
    setConfirmation({
      eyebrow: "INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS",
      title: editing ? "Confirmar atualização do motorista" : "Confirmar cadastro de motorista",
      message: editing ? "Os dados funcionais e da habilitação serão atualizados no cadastro municipal." : "O motorista será incluído no cadastro autorizado da frota municipal.",
      details: [`Motorista: ${form.nome.trim() || "Não informado"}`, `CNH: ${form.cnh_number.trim() || "Não informada"}`, `Validade da CNH: ${formatDriverCnhDate(form.cnh_valid_until)}`, `Situação: ${form.ativo === "true" ? "Ativo" : "Inativo"}`],
      confirmLabel: editing ? "Salvar alterações" : "Cadastrar motorista",
      onConfirm: save,
    });
  }
  async function save(): Promise<string | null> {
    if (!supabase) return "O serviço de dados não está disponível.";
    setSaving(true);
    setFormError("");
    const payload = { nome: form.nome.trim(), matricula: form.matricula.trim() || null, cpf: form.cpf.trim() || null, cnh_number: form.cnh_number.trim() || null, cnh_valid_until: form.cnh_valid_until || null, ativo: form.ativo === "true", updated_at: new Date().toISOString() };
    try {
      const result = editing ? await supabase.from("fleet_drivers").update(payload).eq("id", editing.id) : await createDriver(payload);
      if (result.error) { const message = normalizeError(result.error.code); setFormError(message); return message; }
      setShowForm(false);
      try { await loadDrivers(); await onSaved(); }
      catch { setError("Motorista salvo, mas a tela não pôde ser atualizada. Atualize os dados."); }
      return null;
    } catch {
      return "Não foi possível salvar o motorista. Verifique a conexão e tente novamente.";
    } finally { setSaving(false); }
  }
  async function createDriver(payload: Record<string, unknown>) {
    const { data: municipio } = await supabase!.rpc("fleet_current_municipio_id");
    const { data: currentUser } = await supabase!.rpc("fleet_current_usuario_id");
    return supabase!.from("fleet_drivers").insert({ ...payload, municipio_id: municipio, created_by: currentUser });
  }

  const filteredDrivers = useMemo(() => drivers.filter((driver) => {
    const haystack = `${driver.nome} ${driver.matricula || ""} ${driver.cpf || ""} ${driver.cnh_number || ""}`.toLocaleLowerCase("pt-BR");
    const cnhState = driverCnhState(driver.cnh_valid_until);
    const cnhMatches = !cnhFilter || (cnhFilter === "EXPIRADA" && cnhState === "expired") || (cnhFilter === "ATE_60_DIAS" && cnhState === "soon") || (cnhFilter === "REGULAR" && cnhState === "valid") || (cnhFilter === "SEM_VALIDADE" && cnhState === "missing");
    return haystack.includes(query.trim().toLocaleLowerCase("pt-BR")) && (!statusFilter || driver.ativo === (statusFilter === "ATIVO")) && cnhMatches;
  }), [drivers, query, statusFilter, cnhFilter]);
  const sortedDrivers = useMemo(() => [...filteredDrivers].sort((a, b) => {
    if (sortKey === "cnhExpiry") {
      const aDate = a.cnh_valid_until || "";
      const bDate = b.cnh_valid_until || "";
      if (!aDate && bDate) return 1;
      if (aDate && !bDate) return -1;
      if (!aDate && !bDate) return a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
      const cmp = aDate.localeCompare(bDate);
      return sortDirection === "asc" ? cmp : -cmp;
    }
    const value = (driver: Driver) => sortKey === "name" ? driver.nome
      : sortKey === "registration" ? driver.matricula || ""
        : sortKey === "cpf" ? driver.cpf || ""
          : sortKey === "cnh" ? driver.cnh_number || ""
            : driver.ativo ? "Ativo" : "Inativo";
    const cmp = value(a).localeCompare(value(b), "pt-BR", { numeric: true, sensitivity: "base" }) || a.id.localeCompare(b.id);
    return sortDirection === "asc" ? cmp : -cmp;
  }), [filteredDrivers, sortKey, sortDirection]);
  const expiredDrivers = useMemo(() => drivers.filter((driver) => driverCnhState(driver.cnh_valid_until) === "expired"), [drivers]);
  const expiringSoonDrivers = useMemo(() => drivers.filter((driver) => driverCnhState(driver.cnh_valid_until) === "soon"), [drivers]);
  const activeFilterCount = Number(Boolean(query.trim())) + Number(Boolean(statusFilter)) + Number(Boolean(cnhFilter));
  function clearDriverFilters() { setQuery(""); setStatusFilter(""); setCnhFilter(""); }
  function toggleDriverSort(key: DriverSortKey) {
    if (sortKey === key) setSortDirection((direction) => direction === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDirection("asc"); }
  }
  function driverSortHeading(key: DriverSortKey, label: string) {
    const active = sortKey === key;
    const Icon = !active ? ArrowUpDown : sortDirection === "asc" ? ArrowUp : ArrowDown;
    return <th aria-sort={active ? sortDirection === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="fleet-sort-button" onClick={() => toggleDriverSort(key)}>{label}<Icon size={12} /></button></th>;
  }
  function cnhStatusLabel(driver: Driver) {
    const days = driverCnhDaysUntil(driver.cnh_valid_until);
    if (days === null) return "Sem validade";
    if (days < 0) return `Vencida há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`;
    if (days === 0) return "Vence hoje";
    if (days <= 60) return `Vence em ${days} dia${days === 1 ? "" : "s"}`;
    return "Regular";
  }
  function cnhBadgeClass(driver: Driver) {
    const state = driverCnhState(driver.cnh_valid_until);
    return state === "expired" ? "danger" : state === "soon" ? "warning" : state === "valid" ? "success" : "neutral";
  }

  return (
    <section className="fleet-section fleet-page-section">
      <div className="fleet-page-heading"><div><span className="fleet-kicker">CADASTRO DE APOIO</span><h2>Motoristas</h2><p>Condutores e habilitações autorizadas para operar veículos municipais.</p></div><button className="fleet-primary-button" onClick={openNew}><Plus size={16} /> Novo motorista</button></div>
      {error && <div className="fleet-inline-error" role="alert">{error}</div>}
      <div className="fleet-driver-cnh-alerts">
        {expiredDrivers.length > 0 && <section className="fleet-driver-cnh-alert fleet-driver-cnh-alert--expired" role="alert"><header><AlertTriangle size={18} /><div><strong>{expiredDrivers.length} CNH vencida{expiredDrivers.length === 1 ? "" : "s"}</strong><span>Atualize a validade antes de autorizar estes motoristas a conduzir.</span></div></header><ul>{expiredDrivers.map((driver) => <li key={driver.id}><div><strong>{driver.nome}</strong><small>CNH {driver.cnh_number || "não informada"} · venceu em {formatDriverCnhDate(driver.cnh_valid_until)}{driver.ativo ? " · Ativo" : " · Inativo"}</small></div><button type="button" onClick={() => openEdit(driver)}>Atualizar CNH</button></li>)}</ul></section>}
        {expiringSoonDrivers.length > 0 && <section className="fleet-driver-cnh-alert fleet-driver-cnh-alert--soon" role="status"><header><Clock3 size={18} /><div><strong>{expiringSoonDrivers.length} CNH vence{expiringSoonDrivers.length === 1 ? "" : "m"} em até 60 dias</strong><span>Planeje a renovação para evitar interrupções na operação da frota.</span></div></header><ul>{expiringSoonDrivers.map((driver) => <li key={driver.id}><div><strong>{driver.nome}</strong><small>CNH {driver.cnh_number || "não informada"} · validade {formatDriverCnhDate(driver.cnh_valid_until)} · {cnhStatusLabel(driver)}{driver.ativo ? " · Ativo" : " · Inativo"}</small></div><button type="button" onClick={() => openEdit(driver)}>Atualizar CNH</button></li>)}</ul></section>}
        {expiredDrivers.length === 0 && expiringSoonDrivers.length === 0 && !loading && !error && <div className="fleet-driver-cnh-clear"><CheckCircle2 size={16} /><span>Nenhuma CNH vencida ou com vencimento nos próximos 60 dias.</span></div>}
      </div>
      <div className="fleet-resource-toolbar"><div className="fleet-resource-summary"><UserRound size={17} /><strong>{drivers.length}</strong><span>motoristas cadastrados</span></div></div>
      <section className="fleet-vehicle-filters driver-filters"><div className="fleet-vehicle-filter-heading"><div><Filter size={15} /><strong>Filtros de motoristas</strong><span>{filteredDrivers.length} resultado(s) · {activeFilterCount} filtro(s) ativo(s)</span></div><button type="button" onClick={clearDriverFilters} disabled={!activeFilterCount}><RotateCcw size={12} /> Limpar</button></div>
        <div className="fleet-vehicle-filter-grid driver-filter-grid"><label className="fleet-vehicle-search"><span>Nome, matrícula, CPF ou CNH</span><div><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar motorista, CPF, CNH…" /></div></label>
          <label>Situação do motorista<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "" | "ATIVO" | "INATIVO")}><option value="">Todas</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label>
          <label>Situação da CNH<select value={cnhFilter} onChange={(event) => setCnhFilter(event.target.value as typeof cnhFilter)}><option value="">Todas</option><option value="EXPIRADA">Vencida</option><option value="ATE_60_DIAS">Vence em até 60 dias</option><option value="REGULAR">Regular (mais de 60 dias)</option><option value="SEM_VALIDADE">Sem validade informada</option></select></label>
        </div>
      </section>
      <div className="fleet-table-panel">{loading ? <div className="fleet-loading">Carregando motoristas…</div> : filteredDrivers.length ? <table className="fleet-table fleet-resource-table fleet-driver-table"><thead><tr>{driverSortHeading("name", "Motorista")}{driverSortHeading("registration", "Matrícula")}{driverSortHeading("cpf", "CPF")}{driverSortHeading("cnh", "Número da CNH")}{driverSortHeading("cnhExpiry", "Validade da CNH")}{driverSortHeading("status", "Situação") }<th>Ações</th></tr></thead><tbody>{sortedDrivers.map((driver) => {
        const cnhState = driverCnhState(driver.cnh_valid_until);
        return <tr key={driver.id} className={cnhState === "expired" ? "fleet-driver-row--expired" : cnhState === "soon" ? "fleet-driver-row--soon" : ""}><td><strong>{driver.nome}</strong></td><td>{driver.matricula || "—"}</td><td>{driver.cpf || "—"}</td><td>{driver.cnh_number || "Não informada"}</td><td><strong>{formatDriverCnhDate(driver.cnh_valid_until)}</strong><small><span className={`fleet-status ${cnhBadgeClass(driver)}`}>{cnhStatusLabel(driver)}</span></small></td><td><span className={`fleet-status ${driver.ativo ? "success" : "neutral"}`}>{driver.ativo ? "Ativo" : "Inativo"}</span></td><td><button className="fleet-row-action" onClick={() => openEdit(driver)} aria-label={`Editar ${driver.nome}`}><Edit3 size={16} /></button></td></tr>;
      })}</tbody></table> : <div className="fleet-empty"><span><UserRound size={24} /></span><strong>{activeFilterCount ? "Nenhum motorista corresponde aos filtros" : "Nenhum motorista cadastrado"}</strong><p>{activeFilterCount ? "Ajuste os critérios ou limpe os filtros para consultar outros motoristas." : "Cadastre o primeiro motorista para relacioná-lo aos abastecimentos."}</p>{activeFilterCount ? <button className="fleet-secondary-button" onClick={clearDriverFilters}><RotateCcw size={14} /> Limpar filtros</button> : <button className="fleet-primary-button" onClick={openNew}><Plus size={15} /> Novo motorista</button>}</div>}</div>
      {showForm && <DriverForm form={form} setForm={setForm} editing={editing} saving={saving} error={formError} onClose={() => setShowForm(false)} onSubmit={requestSave} />}
      {confirmation && <FleetOperationConfirmation request={confirmation} onClose={() => setConfirmation(null)} />}
    </section>
  );
}

function DriverForm({
  form,
  setForm,
  editing,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  form: DriverFormState;
  setForm: Dispatch<SetStateAction<DriverFormState>>;
  editing: Driver | null;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const update = (key: keyof DriverFormState, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <div
      className="fleet-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="fleet-modal fleet-resource-modal" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
        <div className="fleet-modal-heading">
          <div>
            <span className="fleet-kicker">
              {editing ? "ATUALIZAÇÃO CADASTRAL" : "CADASTRO OFICIAL"}
            </span>
            <h2>{editing ? "Editar motorista" : "Novo motorista"}</h2>
          </div>
          <button
            type="button"
            className="fleet-close"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X size={18} />
          </button>
        </div>
        {error && <div className="fleet-inline-error">{error}</div>}
        <div className="fleet-form-section-title">
          <UserRound size={16} /> Dados pessoais e funcionais
        </div>
        <div className="fleet-form-grid">
          <Field
            label="Nome completo"
            required
            value={form.nome}
            onChange={(value) => update("nome", value)}
          />
          <Field
            label="Matrícula"
            value={form.matricula}
            onChange={(value) => update("matricula", value)}
          />
          <Field
            label="CPF"
            value={form.cpf}
            onChange={(value) => update("cpf", value)}
          />
          <label>
            Situação
            <select
              value={form.ativo}
              onChange={(event) => update("ativo", event.target.value)}
            >
              <option value="true">Ativo</option>
              <option value="false">Inativo</option>
            </select>
          </label>
        </div>
        <div className="fleet-form-section-title">
          <ChevronRight size={16} /> Habilitação
        </div>
        <div className="fleet-form-grid">
          <Field
            label="Número da CNH"
            value={form.cnh_number}
            onChange={(value) => update("cnh_number", value)}
          />
          <Field
            label="Validade da CNH"
            type="date"
            value={form.cnh_valid_until}
            onChange={(value) => update("cnh_valid_until", value)}
          />
        </div>
        <div className="fleet-modal-actions">
          <button
            type="button"
            className="fleet-secondary-button"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="fleet-primary-button"
            disabled={saving}
          >
            {saving ? (
              "Salvando…"
            ) : (
              <>
                <Save size={15} /> Salvar motorista
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
  type = "text",
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <label>
      {label}
      {required && " *"}
      <input
        required={required}
        type={type}
        maxLength={maxLength}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
