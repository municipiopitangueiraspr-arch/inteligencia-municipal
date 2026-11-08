import { useEffect, useMemo, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Building2,
  ChevronRight,
  Edit3,
  Filter,
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

type StationStatus = "PENDENTE" | "ATIVO" | "SUSPENSO" | "INATIVO";
type StationSortKey = "establishment" | "cnpj" | "representative" | "contact" | "status";
type StationSortDirection = "asc" | "desc";
export type Station = {
  id: string;
  razao_social_snapshot: string;
  nome_fantasia_snapshot: string | null;
  cnpj_snapshot: string;
  endereco: string | null;
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
  PENDENTE: "Pendente",
  ATIVO: "Ativo",
  SUSPENSO: "Suspenso",
  INATIVO: "Inativo",
};

function normalizeError(code?: string) {
  return code === "23505"
    ? "Já existe um registro com estes dados."
    : "Não foi possível salvar. Verifique os dados e as permissões do seu perfil.";
}
function inputValue(value: string | null | undefined) {
  return value || "";
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
  const [form, setForm] = useState<StationFormState>({
    razao_social_snapshot: "",
    nome_fantasia_snapshot: "",
    cnpj_snapshot: "",
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
    const { data, error: resultError } = await supabase
      .from("fleet_fuel_stations")
      .select(
        "id,razao_social_snapshot,nome_fantasia_snapshot,cnpj_snapshot,endereco,cidade,uf,representante_nome,representante_documento,representante_email,representante_telefone,status,credenciamento_started_at,credenciamento_ends_at,notes",
      )
      .order("nome_fantasia_snapshot")
      .limit(100);
    if (resultError)
      setError(
        "Não foi possível carregar os postos permitidos para este usuário.",
      );
    else setStations((data || []) as Station[]);
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
      endereco: form.endereco.trim() || null,
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
    const haystack = `${station.nome_fantasia_snapshot || ""} ${station.razao_social_snapshot} ${station.cnpj_snapshot} ${station.representante_nome} ${station.representante_documento || ""} ${station.representante_email || ""} ${station.cidade || ""} ${station.uf || ""}`.toLocaleLowerCase("pt-BR");
    return haystack.includes(query.trim().toLocaleLowerCase("pt-BR"))
      && (!statusFilter || station.status === statusFilter)
      && (!cityFilter || station.cidade === cityFilter)
      && (!ufFilter || station.uf?.toUpperCase() === ufFilter);
  }), [stations, query, statusFilter, cityFilter, ufFilter]);
  const sortedStations = useMemo(() => [...filtered].sort((a, b) => {
    const value = (station: Station) => {
      if (sortKey === "establishment") return station.nome_fantasia_snapshot || station.razao_social_snapshot;
      if (sortKey === "cnpj") return station.cnpj_snapshot;
      if (sortKey === "representative") return station.representante_nome;
      if (sortKey === "contact") return `${station.representante_email || ""} ${station.representante_telefone || ""}`;
      return stationStatusLabel[station.status];
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
        <div className="fleet-resource-summary"><Store size={17} /><strong>{stations.length}</strong><span>postos carregados (máx. 100)</span></div>
      </div>
      <section className="fleet-vehicle-filters station-filters">
        <div className="fleet-vehicle-filter-heading"><div><Filter size={15} /><strong>Filtros de postos</strong><span>{filtered.length} resultado(s) · {activeFilterCount} filtro(s) ativo(s)</span></div><button type="button" onClick={clearStationFilters} disabled={!activeFilterCount}><RotateCcw size={12} /> Limpar</button></div>
        <div className="fleet-vehicle-filter-grid station-filter-grid">
          <label className="fleet-vehicle-search"><span>Nome, CNPJ ou representante</span><div><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar estabelecimento, CNPJ, contato…" /></div></label>
          <label>Situação<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StationStatus | "")}><option value="">Todas</option>{Object.entries(stationStatusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Cidade<select value={cityFilter} onChange={(event) => setCityFilter(event.target.value)}><option value="">Todas</option>{cities.map((city) => <option key={city} value={city}>{city}</option>)}</select></label>
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
                      className={`fleet-status ${station.status === "ATIVO" ? "success" : station.status === "SUSPENSO" ? "danger" : "warning"}`}
                    >
                      {stationStatusLabel[station.status]}
                    </span>
                  </td>
                  <td>
                    <button
                      className="fleet-secondary-button fleet-members-button"
                      onClick={() => setMembersStation(station)}
                    >
                      <UserPlus size={14} /> Gerenciar
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
    is_primary_contact: "false",
  });
  const [createForm, setCreateForm] = useState({
    nome: "",
    email: "",
    telefone: "",
    password: "",
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
      details: [`Posto: ${station.nome_fantasia_snapshot || station.razao_social_snapshot}`, `Usuário: ${candidate?.nome || form.usuario_id}`, `Perfil: ${roleLabel[form.role]}`, `Contato principal: ${form.is_primary_contact === "true" ? "Sim" : "Não"}`],
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
      const result = await supabase.from("fleet_station_members").insert({ municipio_id: municipio.data, station_id: station.id, usuario_id: Number(form.usuario_id), role: form.role, ativo: true, is_primary_contact: form.is_primary_contact === "true", granted_by: granted.data });
      if (result.error) {
        const message = result.error.code === "23505" ? "Este usuário já está vinculado a este posto." : "Não foi possível vincular o usuário.";
        setError(message);
        return message;
      }
      setForm({ usuario_id: "", role: "OPERADOR", is_primary_contact: "false" });
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
      const result = await supabase.functions.invoke("create-station-user", { body: { station_id: station.id, ...createForm } });
      if (result.error || result.data?.error) {
        const message = result.data?.error || "Não foi possível criar o acesso.";
        setError(message);
        return message;
      }
      setCreateForm({ nome: "", email: "", telefone: "", password: "", role: "OPERADOR" });
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
            Cada usuário fica vinculado exclusivamente a este estabelecimento e
            somente usuários ativos poderão operar.
          </span>
        </div>
        {error && <div className="fleet-inline-error">{error}</div>}
        {allowCreateUser && (
          <form className="fleet-member-create-form" onSubmit={requestCreateUser}>
            <div className="fleet-form-section-title"><UserPlus size={16} /> Criar novo acesso do posto</div>
            <p className="fleet-members-help">Somente o representante legal pode criar acessos. O usuário receberá o e-mail e a senha definidos aqui.</p>
            <div className="fleet-form-grid">
              <label>Nome completo<input required value={createForm.nome} onChange={(event) => setCreateForm({ ...createForm, nome: event.target.value })} /></label>
              <label>E-mail de acesso<input required type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} /></label>
              <label>Telefone<input value={createForm.telefone} onChange={(event) => setCreateForm({ ...createForm, telefone: event.target.value })} /></label>
              <label>Senha inicial<input required minLength={8} type="password" value={createForm.password} onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })} /></label>
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
              onChange={(event) =>
                setForm({
                  ...form,
                  role: event.target.value as StationMember["role"],
                })
              }
            >
              <option value="REPRESENTANTE_LEGAL">Representante legal</option>
              <option value="OPERADOR">Operador</option>
              <option value="FRENTISTA">Frentista</option>
              <option value="CAIXA_CONFERENTE">Caixa/conferente</option>
            </select>
          </label>
          <label>
            Contato principal
            <select
              value={form.is_primary_contact}
              onChange={(event) =>
                setForm({ ...form, is_primary_contact: event.target.value })
              }
            >
              <option value="false">Não</option>
              <option value="true">Sim</option>
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
                      disabled={saving}
                    >
                      <option value="REPRESENTANTE_LEGAL">
                        Representante legal
                      </option>
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
                  <label>
                    Principal
                    <select
                      value={String(member.is_primary_contact)}
                      onChange={(event) =>
                        requestUpdateMember(member, {
                          is_primary_contact: event.target.value === "true",
                        })
                      }
                      disabled={saving}
                    >
                      <option value="false">Não</option>
                      <option value="true">Sim</option>
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
          <Field
            label="Cidade"
            value={form.cidade}
            onChange={(value) => update("cidade", value)}
          />
          <Field
            label="UF"
            maxLength={2}
            value={form.uf}
            onChange={(value) => update("uf", value)}
            placeholder="PR"
          />
          <Field
            label="Endereço"
            value={form.endereco}
            onChange={(value) => update("endereco", value)}
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
            </select>
          </label>
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
  const [form, setForm] = useState<DriverFormState>({
    nome: "",
    matricula: "",
    cpf: "",
    cnh_number: "",
    cnh_valid_until: "",
    ativo: "true",
  });

  async function loadDrivers() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const { data, error: resultError } = await supabase
      .from("fleet_drivers")
      .select(
        "id,nome,matricula,cpf,cnh_number,cnh_valid_until,unidade_id,ativo",
      )
      .order("nome")
      .limit(100);
    if (resultError)
      setError(
        "Não foi possível carregar os motoristas permitidos para este usuário.",
      );
    else setDrivers((data || []) as Driver[]);
    setLoading(false);
  }
  useEffect(() => {
    void loadDrivers();
  }, []);
  function openNew() {
    setEditing(null);
    setForm({
      nome: "",
      matricula: "",
      cpf: "",
      cnh_number: "",
      cnh_valid_until: "",
      ativo: "true",
    });
    setFormError("");
    setShowForm(true);
  }
  function openEdit(driver: Driver) {
    setEditing(driver);
    setForm({
      nome: driver.nome,
      matricula: inputValue(driver.matricula),
      cpf: inputValue(driver.cpf),
      cnh_number: inputValue(driver.cnh_number),
      cnh_valid_until: inputValue(driver.cnh_valid_until),
      ativo: String(driver.ativo),
    });
    setFormError("");
    setShowForm(true);
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    setFormError("");
    const payload = {
      nome: form.nome.trim(),
      matricula: form.matricula.trim() || null,
      cpf: form.cpf.trim() || null,
      cnh_number: form.cnh_number.trim() || null,
      cnh_valid_until: form.cnh_valid_until || null,
      ativo: form.ativo === "true",
      updated_at: new Date().toISOString(),
    };
    const result = editing
      ? await supabase
          .from("fleet_drivers")
          .update(payload)
          .eq("id", editing.id)
      : await createDriver(payload);
    setSaving(false);
    if (result.error) {
      setFormError(normalizeError(result.error.code));
      return;
    }
    setShowForm(false);
    await loadDrivers();
    await onSaved();
  }
  async function createDriver(payload: Record<string, unknown>) {
    const { data: municipio } = await supabase!.rpc(
      "fleet_current_municipio_id",
    );
    const { data: currentUser } = await supabase!.rpc(
      "fleet_current_usuario_id",
    );
    return supabase!
      .from("fleet_drivers")
      .insert({ ...payload, municipio_id: municipio, created_by: currentUser });
  }
  const filtered = drivers.filter((driver) =>
    `${driver.nome} ${driver.matricula || ""} ${driver.cpf || ""}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <section className="fleet-section fleet-page-section">
      <div className="fleet-page-heading">
        <div>
          <span className="fleet-kicker">CADASTRO DE APOIO</span>
          <h2>Motoristas</h2>
          <p>
            Condutores e habilitações autorizadas para operar veículos
            municipais.
          </p>
        </div>
        <button className="fleet-primary-button" onClick={openNew}>
          <Plus size={16} /> Novo motorista
        </button>
      </div>
      {error && <div className="fleet-inline-error">{error}</div>}
      <div className="fleet-resource-toolbar">
        <div className="fleet-resource-summary">
          <UserRound size={17} />
          <strong>{drivers.length}</strong>
          <span>motoristas carregados</span>
        </div>
        <input
          className="fleet-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por nome, matrícula ou CPF"
        />
      </div>
      <div className="fleet-table-panel">
        {loading ? (
          <div className="fleet-loading">Carregando motoristas…</div>
        ) : filtered.length ? (
          <table className="fleet-table fleet-resource-table">
            <thead>
              <tr>
                <th>Motorista</th>
                <th>Matrícula</th>
                <th>CPF</th>
                <th>CNH</th>
                <th>Situação</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((driver) => (
                <tr key={driver.id}>
                  <td>
                    <strong>{driver.nome}</strong>
                    <small>
                      {driver.cnh_valid_until
                        ? `Validade da CNH: ${new Intl.DateTimeFormat("pt-BR").format(new Date(`${driver.cnh_valid_until}T00:00:00`))}`
                        : "Validade da CNH não informada"}
                    </small>
                  </td>
                  <td>{driver.matricula || "—"}</td>
                  <td>{driver.cpf || "—"}</td>
                  <td>
                    <strong>{driver.cnh_number || "Não informada"}</strong>
                  </td>
                  <td>
                    <span
                      className={`fleet-status ${driver.ativo ? "success" : "neutral"}`}
                    >
                      {driver.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <button
                      className="fleet-row-action"
                      onClick={() => openEdit(driver)}
                      aria-label={`Editar ${driver.nome}`}
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
              <UserRound size={24} />
            </span>
            <strong>Nenhum motorista encontrado</strong>
            <p>
              Cadastre o primeiro motorista para relacioná-lo aos
              abastecimentos.
            </p>
            <button className="fleet-primary-button" onClick={openNew}>
              <Plus size={15} /> Novo motorista
            </button>
          </div>
        )}
      </div>
      {showForm && (
        <DriverForm
          form={form}
          setForm={setForm}
          editing={editing}
          saving={saving}
          error={formError}
          onClose={() => setShowForm(false)}
          onSubmit={save}
        />
      )}
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
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const update = (key: keyof DriverFormState, value: string) =>
    setForm({ ...form, [key]: value });
  return (
    <div
      className="fleet-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <form className="fleet-modal fleet-resource-modal" onSubmit={onSubmit}>
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
