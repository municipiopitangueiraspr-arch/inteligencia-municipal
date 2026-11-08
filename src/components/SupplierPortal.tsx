import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  BadgeCheck,
  Bell,
  ClipboardList,
  FileCheck2,
  Fuel,
  LayoutDashboard,
  LogOut,
  Plus,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { StationMembersPanel } from "./FleetResources";
import type { Station } from "./FleetResources";
import "./SupplierPortal.css";

type SupplierPortalProps = {
  station: Station;
  role: string;
  userEmail: string;
  onLogout: () => void;
};
type PortalView = "overview" | "fueling" | "records" | "documents" | "members";
type VehicleOption = {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
};
type FuelOption = { id: string; nome: string; sigla: string | null };
type UnitOption = { id: string; nome: string; sigla: string | null };
type Fueling = {
  id: string;
  performed_at: string;
  submitted_at: string;
  liters: number;
  total_amount: number;
  status: string;
  station_receipt_number: string | null;
  vehicles?: { placa?: string; modelo?: string } | null;
  fuel_type?: { nome?: string } | null;
};
type DocumentRecord = { id: string; fueling_id: string; file_name: string; document_status: string; uploaded_at: string };

const roleLabels: Record<string, string> = {
  REPRESENTANTE_LEGAL: "Representante legal",
  OPERADOR: "Operador",
  FRENTISTA: "Frentista",
  CAIXA_CONFERENTE: "Caixa/conferente",
};
const statusLabels: Record<string, string> = {
  ENVIADO_PELO_POSTO: "Enviado para conferência",
  PENDENTE_DE_COMPROVANTE: "Pendente de comprovante",
  PENDENTE_DE_CONFERENCIA: "Pendente de conferência",
  EM_ANALISE: "Em análise",
  COM_INCONSISTENCIA: "Com inconsistência",
  SOLICITADA_CORRECAO: "Correção solicitada",
  CORRIGIDO: "Corrigido",
  CONFERIDO: "Conferido",
  INCLUIDO_NO_FECHAMENTO: "Incluído no fechamento",
  CANCELADO: "Cancelado",
};
const menu: Array<{ id: PortalView; label: string; icon: typeof Fuel }> = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "fueling", label: "Novo abastecimento", icon: Plus },
  { id: "records", label: "Meus abastecimentos", icon: Fuel },
  { id: "documents", label: "Comprovantes", icon: FileCheck2 },
];

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value || 0));
}
function date(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
function statusTone(status: string) {
  if (["CONFERIDO", "INCLUIDO_NO_FECHAMENTO"].includes(status)) return "success";
  if (["PENDENTE_DE_COMPROVANTE", "PENDENTE_DE_CONFERENCIA", "COM_INCONSISTENCIA"].includes(status)) return "danger";
  if (["SOLICITADA_CORRECAO", "ENVIADO_PELO_POSTO", "EM_ANALISE", "CORRIGIDO"].includes(status)) return "warning";
  if (status === "CANCELADO") return "neutral";
  return "info";
}
function StatusTag({ status }: { status: string }) {
  return <span className={`supplier-status supplier-status-${statusTone(status)}`}><span className="supplier-status-dot" />{statusLabels[status] || status}</span>;
}

export function SupplierPortal({
  station,
  role,
  userEmail,
  onLogout,
}: SupplierPortalProps) {
  const [view, setView] = useState<PortalView>("overview");
  const [fuelings, setFuelings] = useState<Fueling[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [fuelTypes, setFuelTypes] = useState<FuelOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showMembers, setShowMembers] = useState(false);

  async function loadPortal() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    const { data: municipalityId } = await supabase.rpc("fleet_current_municipio_id");
    const [fuelingsResult, vehiclesResult, fuelTypesResult, unitsResult, documentsResult] =
      await Promise.all([
        supabase
          .from("fleet_fuelings")
          .select(
            "id,performed_at,submitted_at,liters,total_amount,status,station_receipt_number,vehicles:fleet_vehicles(placa,modelo),fuel_type:fleet_fuel_types(nome)",
          )
          .eq("station_id", station.id)
          .order("performed_at", { ascending: false })
          .limit(100),
        supabase
          .from("fleet_vehicles")
          .select("id,placa,marca,modelo")
          .order("placa")
          .limit(500),
        supabase
          .from("fleet_fuel_types")
          .select("id,nome,sigla")
          .eq("ativo", true)
          .order("nome")
          .limit(100),
        supabase
          .from("unidades_organizacionais")
          .select("id,nome,sigla")
          .eq("ativo", true)
          .order("nome")
          .limit(200),
        supabase
          .from("fleet_fueling_documents")
          .select("id,fueling_id,file_name,document_status,uploaded_at")
          .eq("municipio_id", municipalityId)
          .order("uploaded_at", { ascending: false })
          .limit(200),
      ]);
    if (
      fuelingsResult.error ||
      vehiclesResult.error ||
      fuelTypesResult.error ||
      unitsResult.error ||
      documentsResult.error
    )
      setError("Não foi possível carregar os dados operacionais deste posto.");
    else {
      setFuelings((fuelingsResult.data || []) as unknown as Fueling[]);
      setVehicles((vehiclesResult.data || []) as VehicleOption[]);
      setFuelTypes((fuelTypesResult.data || []) as FuelOption[]);
      setUnits((unitsResult.data || []) as UnitOption[]);
      setDocuments((documentsResult.data || []) as DocumentRecord[]);
    }
    setLoading(false);
  }
  useEffect(() => {
    void loadPortal();
  }, [station.id]);
  const pending = useMemo(
    () =>
      fuelings.filter((item) =>
        [
          "ENVIADO_PELO_POSTO",
          "PENDENTE_DE_COMPROVANTE",
          "PENDENTE_DE_CONFERENCIA",
          "COM_INCONSISTENCIA",
          "SOLICITADA_CORRECAO",
        ].includes(item.status),
      ),
    [fuelings],
  );
  const documentsPending = useMemo(
    () =>
      fuelings.filter((item) =>
        ["PENDENTE_DE_COMPROVANTE", "SOLICITADA_CORRECAO"].includes(
          item.status,
        ),
      ),
    [fuelings],
  );
  async function uploadDocument(fuelingId: string, file: File) {
    if (!supabase) return { error: new Error("Supabase indisponível") };
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) && file.type !== "application/pdf") return { error: new Error("Selecione PDF, JPG, PNG ou WEBP.") };
    if (file.size > 10 * 1024 * 1024) return { error: new Error("O comprovante deve ter no máximo 10 MB.") };
    const { data: municipalityId } = await supabase.rpc("fleet_current_municipio_id");
    const { data: currentUser } = await supabase.rpc("fleet_current_usuario_id");
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${municipalityId}/fuelings/${fuelingId}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("fleet-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) return { error: upload.error };
    const document = await supabase.from("fleet_fueling_documents").insert({ municipio_id: municipalityId, fueling_id: fuelingId, file_name: file.name, storage_path: path, mime_type: file.type, file_size_bytes: file.size, document_status: "ENVIADO", uploaded_by: currentUser, uploaded_at: new Date().toISOString(), due_at: new Date().toISOString(), is_current: true }).select("id").single();
    if (document.error) { await supabase.storage.from("fleet-documents").remove([path]); return { error: document.error }; }
    return { error: null };
  }
  async function submitFueling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const data = new FormData(event.currentTarget);
    setSaving(true);
    setError("");
    setMessage("");
    const municipio = await supabase.rpc("fleet_public_municipio_id");
    const currentUser = await supabase.rpc("fleet_current_usuario_id");
    const result = await supabase
      .from("fleet_fuelings")
      .insert({
        municipio_id: municipio.data,
        vehicle_id: data.get("vehicle_id"),
        station_id: station.id,
        fuel_type_id: data.get("fuel_type_id"),
        responsible_unit_id: data.get("responsible_unit_id"),
        driver_id: data.get("driver_id") || null,
        performed_at: data.get("performed_at"),
        created_by: currentUser.data,
        liters: Number(data.get("liters")),
        unit_price: Number(data.get("unit_price")),
        odometer_km: Number(data.get("odometer_km")),
        station_receipt_number: data.get("receipt") || null,
        notes: data.get("notes") || null,
        status: "ENVIADO_PELO_POSTO",
      })
      .select("id")
      .single();
    setSaving(false);
    if (result.error)
      setError(
        result.error.message.includes("capacidade")
          ? "O volume informado excede a capacidade do tanque do veículo."
          : "Não foi possível enviar o abastecimento. Confira os campos e as permissões do posto.",
      );
    else {
      const file = data.get("receipt_file");
      let documentMessage = "";
      if (file instanceof File && file.size > 0) {
        const documentResult = await uploadDocument(result.data.id, file);
        if (documentResult.error) documentMessage = `Abastecimento enviado, mas o comprovante não foi anexado: ${documentResult.error.message}`;
      }
      event.currentTarget.reset();
      setMessage(documentMessage || "Abastecimento enviado para conferência do Gestor de Frotas.");
      await loadPortal();
    }
  }
  const stationForPanel: Station = station;
  return (
    <div className="supplier-shell">
      <aside className="supplier-sidebar">
        <div className="supplier-brand">
          <span>
            <Store size={20} />
          </span>
          <div>
            <strong>Portal do Posto</strong>
            <small>Inteligência Municipal</small>
          </div>
        </div>
        <div className="supplier-sidebar-label">OPERAÇÃO</div>
        <nav className="supplier-nav">
          {menu.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={view === id ? "active" : ""}
              onClick={() => setView(id)}
            >
              <Icon size={17} />
              {label}
              {id === "records" && pending.length > 0 && (
                <b>{pending.length}</b>
              )}
            </button>
          ))}
          {role === "REPRESENTANTE_LEGAL" && (
            <button
              className={showMembers ? "active" : ""}
              onClick={() => setShowMembers(true)}
            >
              <Users size={17} />
              Usuários do posto
            </button>
          )}
        </nav>
        <div className="supplier-sidebar-bottom">
          <div className="supplier-user">
            <span>{(userEmail[0] || "U").toUpperCase()}</span>
            <div>
              <strong>{userEmail}</strong>
              <small>{roleLabels[role] || role}</small>
            </div>
          </div>
          <button className="supplier-logout" onClick={onLogout}>
            <LogOut size={16} /> Sair
          </button>
        </div>
      </aside>
      <main className="supplier-main">
        <header className="supplier-header">
          <div>
            <span>PORTAL DO ESTABELECIMENTO</span>
            <h1>
              {station.nome_fantasia_snapshot || station.razao_social_snapshot}
            </h1>
          </div>
          <div className="supplier-header-right">
            <span className="supplier-secure">
              <ShieldCheck size={15} /> Acesso restrito ao posto
            </span>
            <button aria-label="Notificações">
              <Bell size={18} />
            </button>
          </div>
        </header>
        <div className="supplier-content">
          {error && <div className="supplier-message error">{error}</div>}
          {message && <div className="supplier-message success">{message}</div>}
          {view === "overview" && (
            <section>
              <div className="supplier-welcome">
                <div>
                  <span>AMBIENTE OPERACIONAL</span>
                  <h2>Olá, {station.representante_nome.split(" ")[0]}.</h2>
                  <p>
                    Envie abastecimentos, acompanhe a conferência e mantenha os
                    comprovantes em dia.
                  </p>
                </div>
                <div className="supplier-welcome-mark">
                  <BadgeCheck size={34} />
                </div>
              </div>
              <div className="supplier-metrics">
                <article>
                  <Fuel size={18} />
                  <span>
                    Abastecimentos enviados<strong>{fuelings.length}</strong>
                  </span>
                </article>
                <article>
                  <ClipboardList size={18} />
                  <span>
                    Pendentes de ação<strong>{pending.length}</strong>
                  </span>
                </article>
                <article>
                  <FileCheck2 size={18} />
                  <span>
                    Comprovantes pendentes
                    <strong>{documentsPending.length}</strong>
                  </span>
                </article>
                <article>
                  <Store size={18} />
                  <span>
                    Status do posto
                    <strong>
                      {station.status === "ATIVO" ? "Ativo" : station.status}
                    </strong>
                  </span>
                </article>
              </div>
              <div className="supplier-panel">
                <div className="supplier-panel-heading">
                  <div>
                    <span>ACOMPANHAMENTO</span>
                    <h3>Últimos abastecimentos</h3>
                  </div>
                  <button onClick={() => setView("records")}>
                    Ver todos →
                  </button>
                </div>
                <PortalTable
                  fuelings={fuelings.slice(0, 5)}
                  loading={loading}
                />
              </div>
            </section>
          )}
          {view === "fueling" && (
            <FuelingForm
              vehicles={vehicles}
              fuelTypes={fuelTypes}
              units={units}
              saving={saving}
              onSubmit={submitFueling}
            />
          )}
          {view === "records" && (
            <section>
              <div className="supplier-page-heading">
                <div>
                  <span>CONSULTA RESTRITA</span>
                  <h2>Meus abastecimentos</h2>
                  <p>Somente registros enviados por este estabelecimento.</p>
                </div>
                <button
                  className="supplier-primary"
                  onClick={() => setView("fueling")}
                >
                  <Plus size={15} /> Novo abastecimento
                </button>
              </div>
              <div className="supplier-panel">
                <PortalTable fuelings={fuelings} loading={loading} />
              </div>
            </section>
          )}
          {view === "documents" && (
            <DocumentsView fuelings={fuelings} documents={documents} onUpload={uploadDocument} onRefresh={loadPortal} />
          )}
        </div>
      </main>
      {showMembers && (
        <StationMembersPanel
          station={stationForPanel}
          allowCreateUser={role === "REPRESENTANTE_LEGAL"}
          onClose={() => setShowMembers(false)}
          onSaved={loadPortal}
        />
      )}
    </div>
  );
}

function PortalTable({
  fuelings,
  loading,
}: {
  fuelings: Fueling[];
  loading: boolean;
}) {
  return loading ? (
    <div className="supplier-loading">Carregando registros…</div>
  ) : fuelings.length ? (
    <div className="supplier-table-wrap">
      <table className="supplier-table">
        <thead>
          <tr>
            <th>Data real</th>
            <th>Veículo</th>
            <th>Combustível</th>
            <th>Litros</th>
            <th>Valor</th>
            <th>Situação</th>
          </tr>
        </thead>
        <tbody>
          {fuelings.map((item) => (
            <tr key={item.id}>
              <td>
                {date(item.performed_at)}
                <small>Enviado em {date(item.submitted_at)}</small>
              </td>
              <td>
                <strong>{item.vehicles?.placa || "—"}</strong>
                <small>{item.vehicles?.modelo || "Veículo"}</small>
              </td>
              <td>{item.fuel_type?.nome || "—"}</td>
              <td>{Number(item.liters).toLocaleString("pt-BR")} L</td>
              <td>{money(item.total_amount)}</td>
              <td>
                <StatusTag status={item.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <div className="supplier-empty">
      <Fuel size={25} />
      <strong>Nenhum abastecimento enviado</strong>
      <p>Os registros lançados pelo posto aparecerão aqui.</p>
    </div>
  );
}
function FuelingForm({
  vehicles,
  fuelTypes,
  units,
  saving,
  onSubmit,
}: {
  vehicles: VehicleOption[];
  fuelTypes: FuelOption[];
  units: UnitOption[];
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <section>
      <div className="supplier-page-heading">
        <div>
          <span>SUBMISSÃO OPERACIONAL</span>
          <h2>Novo abastecimento</h2>
          <p>
            O Gestor de Frotas fará a validação oficial antes da consolidação.
          </p>
        </div>
      </div>
      <form className="supplier-form" onSubmit={onSubmit}>
        <div className="supplier-form-note">
          <ShieldCheck size={16} /> O valor total será calculado pelo banco. A
          data real do abastecimento fica separada do envio.
        </div>
        <div className="supplier-form-grid">
          <label>
            Veículo
            <select required name="vehicle_id">
              <option value="">Selecione a placa</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.placa} — {vehicle.marca || ""} {vehicle.modelo || ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Combustível
            <select required name="fuel_type_id">
              <option value="">Selecione o combustível</option>
              {fuelTypes.map((fuel) => (
                <option key={fuel.id} value={fuel.id}>
                  {fuel.nome}
                  {fuel.sigla ? ` (${fuel.sigla})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Secretaria beneficiária
            <select required name="responsible_unit_id">
              <option value="">Selecione a secretaria</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.nome}
                  {unit.sigla ? ` (${unit.sigla})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Data e hora real
            <input
              required
              type="datetime-local"
              name="performed_at"
              defaultValue={new Date().toISOString().slice(0, 16)}
            />
          </label>
          <label>
            Litros
            <input
              required
              min="0.001"
              step="0.001"
              type="number"
              name="liters"
            />
          </label>
          <label>
            Preço unitário
            <input
              required
              min="0"
              step="0.0001"
              type="number"
              name="unit_price"
            />
          </label>
          <label>
            Odômetro (km)
            <input
              required
              min="0"
              step="0.01"
              type="number"
              name="odometer_km"
            />
          </label>
          <label>
            Número do recibo
            <input name="receipt" placeholder="NF ou recibo" />
          </label>
          <label>
            Comprovante do abastecimento
            <input name="receipt_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" />
            <small className="supplier-upload-note">PDF, JPG, PNG ou WEBP · máximo de 10 MB.</small>
          </label>
          <label className="supplier-wide">
            Observações
            <textarea
              name="notes"
              rows={4}
              placeholder="Informe alguma ocorrência ou lançamento posterior..."
            />
          </label>
        </div>
        <div className="supplier-form-actions">
          <button type="submit" className="supplier-primary" disabled={saving}>
            {saving ? "Enviando…" : "Enviar para conferência"}
          </button>
        </div>
      </form>
    </section>
  );
}
function DocumentsView({
  fuelings,
  documents,
  onUpload,
  onRefresh,
}: {
  fuelings: Fueling[];
  documents: DocumentRecord[];
  onUpload: (fuelingId: string, file: File) => Promise<{ error: Error | null }>;
  onRefresh: () => Promise<void>;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  async function handleUpload(fuelingId: string, file: File) {
    setUploading(fuelingId); setNotice("");
    const result = await onUpload(fuelingId, file);
    setUploading(null);
    if (result.error) setNotice(result.error.message);
    else { setNotice("Comprovante enviado para conferência do Gestor de Frotas."); await onRefresh(); }
  }
  return (
    <section>
      <div className="supplier-page-heading">
        <div>
          <span>DOCUMENTAÇÃO</span>
          <h2>Comprovantes</h2>
          <p>
            Envie e acompanhe os comprovantes dos abastecimentos do seu posto.
          </p>
        </div>
      </div>
      <div className="supplier-document-grid">
        {notice && <div className="supplier-message success">{notice}</div>}
        {fuelings
          .filter((item) =>
            [
              "PENDENTE_DE_COMPROVANTE",
              "SOLICITADA_CORRECAO",
              "ENVIADO_PELO_POSTO",
            ].includes(item.status),
          )
          .slice(0, 20)
          .map((item) => (
            <article key={item.id}>
              <div>
                <FileCheck2 size={20} />
                <strong>
                  {item.vehicles?.placa || "Veículo não informado"}
                </strong>
                <small>
                  {date(item.performed_at)} ·{" "}
                  {Number(item.liters).toLocaleString("pt-BR")} L
                </small>
              </div>
              <StatusTag status={item.status} />
              <label className="supplier-upload">
                {uploading === item.id ? "Enviando…" : "Selecionar comprovante"}
                <input
                  type="file"
                  accept="image/*,.pdf"
                  disabled={uploading === item.id}
                  onChange={(event) => { const file = event.target.files?.[0]; if (file) void handleUpload(item.id, file); }}
                />
              </label>
              {documents.filter((document) => document.fueling_id === item.id).map((document) => <small className="supplier-upload-note" key={document.id}>Anexado: {document.file_name} · {document.document_status}</small>)}
              <small className="supplier-upload-note">
                Limite e validação serão aplicados no envio.
              </small>
            </article>
          ))}
        {!fuelings.some((item) =>
          [
            "PENDENTE_DE_COMPROVANTE",
            "SOLICITADA_CORRECAO",
            "ENVIADO_PELO_POSTO",
          ].includes(item.status),
        ) && (
          <div className="supplier-empty">
            <FileCheck2 size={25} />
            <strong>Nenhum comprovante pendente</strong>
            <p>
              Quando houver documentação a enviar, ela aparecerá nesta área.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
