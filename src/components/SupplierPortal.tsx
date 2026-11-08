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
import { SupplierFuelingRecords } from "./SupplierFuelingRecords";
import { SupplierDocumentsView } from "./SupplierDocumentsView";
import "./SupplierPortal.css";

type SupplierPortalProps = {
  station: Station;
  role: string;
  userEmail: string;
  initialVehicleId: string | null;
  onLogout: () => void;
};
type PortalView = "overview" | "fueling" | "records" | "documents" | "members";
type VehicleOption = {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  fuel_type_id: string | null;
  responsible_unit_id: string | null;
  tank_capacity_l: number | null;
  current_odometer_km: number | null;
  operational_status: string;
};
type FuelOption = { id: string; nome: string; sigla: string | null };
type UnitOption = { id: string; nome: string; sigla: string | null };
type UseAuthorizationOption = { id: string; beneficiary_unit_id: string; beneficiary_unit_name: string; purpose: string; valid_from: string; valid_until: string };
type Fueling = {
  id: string;
  vehicle_id: string;
  fuel_type_id: string;
  performed_at: string;
  submitted_at: string;
  liters: number;
  total_amount: number;
  status: string;
  station_receipt_number: string | null;
  vehicles?: { placa?: string; modelo?: string } | null;
  fuel_type?: { nome?: string } | null;
};
type DocumentRecord = { id: string; fueling_id: string; file_name: string; storage_path: string; mime_type: string; document_status: string; uploaded_at: string; is_current: boolean; rejection_reason: string | null };

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
  initialVehicleId,
  onLogout,
}: SupplierPortalProps) {
  const [view, setView] = useState<PortalView>(initialVehicleId ? "fueling" : "overview");
  const [fuelings, setFuelings] = useState<Fueling[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [fuelTypes, setFuelTypes] = useState<FuelOption[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMoreFuelings, setLoadingMoreFuelings] = useState(false);
  const [hasMoreFuelings, setHasMoreFuelings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showMembers, setShowMembers] = useState(false);

  async function loadPortal() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    setFuelings([]);
    setDocuments([]);
    setHasMoreFuelings(true);
    const { data: municipalityId } = await supabase.rpc("fleet_current_municipio_id");
    const [fuelingsResult, vehiclesResult, fuelTypesResult, unitsResult] = await Promise.all([
        supabase
          .from("fleet_fuelings")
          .select(
            "id,vehicle_id,fuel_type_id,performed_at,submitted_at,liters,total_amount,status,station_receipt_number,vehicles:fleet_vehicles(placa,modelo),fuel_type:fleet_fuel_types(nome)",
          )
          .eq("station_id", station.id)
          .order("performed_at", { ascending: false })
          .order("id", { ascending: true })
          .range(0, 99),
        supabase.rpc("fleet_supplier_vehicle_options", { p_station_id: station.id }),
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
      ]);
    const vehicleOptions = (vehiclesResult.data || []) as VehicleOption[];
    const vehicleById = new Map(vehicleOptions.map((vehicle) => [vehicle.id, vehicle]));
    const stationFuelings = ((fuelingsResult.data || []) as unknown as Fueling[]).map((item) => ({
      ...item,
      vehicles: item.vehicles || (vehicleById.get(item.vehicle_id) ? { placa: vehicleById.get(item.vehicle_id)?.placa, modelo: vehicleById.get(item.vehicle_id)?.modelo || undefined } : null),
    }));
    const documentFuelingIds = stationFuelings.map((item) => item.id);
    const documentsResult = documentFuelingIds.length
      ? await supabase
          .from("fleet_fueling_documents")
          .select("id,fueling_id,file_name,storage_path,mime_type,document_status,uploaded_at,is_current,rejection_reason")
          .eq("municipio_id", municipalityId)
          .in("fueling_id", documentFuelingIds)
          .eq("is_current", true)
          .order("uploaded_at", { ascending: false })
          .limit(500)
      : { data: [], error: null };
    if (
      fuelingsResult.error ||
      vehiclesResult.error ||
      fuelTypesResult.error ||
      unitsResult.error ||
      documentsResult.error
    )
      setError("Não foi possível carregar os dados operacionais deste posto.");
    else {
      setFuelings(stationFuelings);
      setHasMoreFuelings(stationFuelings.length === 100);
      setVehicles(vehicleOptions);
      setFuelTypes((fuelTypesResult.data || []) as FuelOption[]);
      setUnits((unitsResult.data || []) as UnitOption[]);
      setDocuments((documentsResult.data || []) as DocumentRecord[]);
    }
    setLoading(false);
  }
  useEffect(() => {
    void loadPortal();
  }, [station.id]);
  async function loadMoreFuelings() {
    if (!supabase || loadingMoreFuelings || !hasMoreFuelings) return;
    setLoadingMoreFuelings(true);
    const offset = fuelings.length;
    const { data, error: pageError } = await supabase
      .from("fleet_fuelings")
      .select(
        "id,vehicle_id,fuel_type_id,performed_at,submitted_at,liters,total_amount,status,station_receipt_number,vehicles:fleet_vehicles(placa,modelo),fuel_type:fleet_fuel_types(nome)",
      )
      .eq("station_id", station.id)
      .order("performed_at", { ascending: false })
      .order("id", { ascending: true })
      .range(offset, offset + 99);
    if (pageError) {
      setError("Não foi possível carregar mais abastecimentos deste posto.");
      setLoadingMoreFuelings(false);
      return;
    }
    const page = ((data || []) as unknown as Fueling[]).map((item) => {
      const vehicle = vehicles.find((candidate) => candidate.id === item.vehicle_id);
      return { ...item, vehicles: item.vehicles || (vehicle ? { placa: vehicle.placa, modelo: vehicle.modelo || undefined } : null) };
    });
    setFuelings((current) => [...current, ...page]);
    setHasMoreFuelings(page.length === 100);
    const documentFuelingIds = page.map((item) => item.id);
    if (documentFuelingIds.length) {
      const { data: municipalityId } = await supabase.rpc("fleet_current_municipio_id");
      const { data: addedDocuments, error: documentError } = await supabase
        .from("fleet_fueling_documents")
        .select("id,fueling_id,file_name,storage_path,mime_type,document_status,uploaded_at,is_current,rejection_reason")
        .eq("municipio_id", municipalityId)
        .in("fueling_id", documentFuelingIds)
        .eq("is_current", true)
        .order("uploaded_at", { ascending: false })
        .limit(500);
      if (!documentError && addedDocuments?.length) {
        setDocuments((current) => {
          const existingIds = new Set(current.map((item) => item.id));
          const merged = [...current, ...(addedDocuments as DocumentRecord[]).filter((item) => !existingIds.has(item.id))];
          const pageIds = new Set(documentFuelingIds);
          const latestByFueling = new Map<string, DocumentRecord>();
          for (const document of merged) {
            if (pageIds.has(document.fueling_id) && !latestByFueling.has(document.fueling_id)) latestByFueling.set(document.fueling_id, document);
          }
          return [...merged.filter((document) => !pageIds.has(document.fueling_id)), ...latestByFueling.values()];
        });
      }
    }
    setLoadingMoreFuelings(false);
  }
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
      fuelings.filter((item) => {
        const currentDocument = documents.find((document) => document.fueling_id === item.id && document.is_current);
        const eligibleWithoutDocument = !currentDocument && !["RASCUNHO", "INCLUIDO_NO_FECHAMENTO", "CANCELADO"].includes(item.status);
        return ["PENDENTE_DE_COMPROVANTE", "SOLICITADA_CORRECAO"].includes(item.status)
          || currentDocument?.document_status === "REJEITADO"
          || eligibleWithoutDocument;
      }),
    [fuelings, documents],
  );
  async function uploadDocument(fuelingId: string, file: File) {
    if (!supabase) return { error: new Error("Supabase indisponível") };
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) && file.type !== "application/pdf") return { error: new Error("Selecione PDF, JPG, PNG ou WEBP.") };
    if (file.size > 10 * 1024 * 1024) return { error: new Error("O comprovante deve ter no máximo 10 MB.") };
    const { data: municipalityId } = await supabase.rpc("fleet_current_municipio_id");
    if (!municipalityId) return { error: new Error("Não foi possível identificar o município do arquivo.") };
    const { data: currentDocuments, error: currentDocumentsError } = await supabase.from("fleet_fueling_documents").select("id,document_status,is_current").eq("fueling_id", fuelingId).eq("is_current", true).order("uploaded_at", { ascending: false }).limit(1);
    if (currentDocumentsError) return { error: new Error(currentDocumentsError.message) };
    const currentDocument = currentDocuments?.[0];
    if (currentDocument && currentDocument.document_status !== "REJEITADO") return { error: new Error("Há um comprovante atual em análise ou aceito; somente arquivo rejeitado pode ser substituído.") };
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${municipalityId}/fuelings/${fuelingId}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("fleet-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) return { error: upload.error };
    const document = await supabase.rpc("fleet_register_fueling_document", {
      p_fueling_id: fuelingId, p_file_name: file.name, p_storage_path: path, p_mime_type: file.type,
      p_file_size_bytes: file.size, p_document_type: "COMPROVANTE_DE_ABASTECIMENTO", p_notes: null,
      p_replaced_document_id: currentDocument?.id || null,
    });
    if (document.error) { await supabase.storage.from("fleet-documents").remove([path]); return { error: new Error(document.error.message) }; }
    return { error: null };
  }
  async function submitFueling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await supabase.rpc("fleet_submit_fueling", {
        p_idempotency_key: crypto.randomUUID(), p_station_id: station.id, p_vehicle_id: data.get("vehicle_id"),
        p_fuel_type_id: data.get("fuel_type_id"), p_driver_id: data.get("driver_id"),
        p_responsible_unit_id: data.get("responsible_unit_id"), p_beneficiary_unit_id: data.get("beneficiary_unit_id") || null,
        p_authorization_id: data.get("authorization_id") || null, p_performed_at: new Date(String(data.get("performed_at"))).toISOString(),
        p_liters: Number(data.get("liters")), p_unit_price: Number(data.get("unit_price")), p_odometer_km: Number(data.get("odometer_km")),
        p_station_receipt_number: data.get("receipt") || null, p_notes: data.get("notes") || null,
        p_late_entry_reason: data.get("late_entry_reason") || null, p_source: "POSTO",
      });
      if (result.error) throw result.error;
      const record = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!record?.fueling_id) throw new Error("O servidor não retornou o protocolo do abastecimento.");
      const file = data.get("receipt_file");
      let documentMessage = "";
      if (file instanceof File && file.size > 0) {
        const documentResult = await uploadDocument(record.fueling_id, file);
        if (documentResult.error) documentMessage = `Abastecimento ${record.protocol_number || ""} enviado, mas o comprovante não foi anexado: ${documentResult.error.message}`;
      }
      form.reset();
      setMessage(documentMessage || `Abastecimento ${record.protocol_number || ""} enviado para conferência do Gestor de Frotas.`);
      setView("overview");
      await loadPortal();
    } catch (cause) {
      const reason = (cause instanceof Error ? cause.message : String(cause)).toLocaleLowerCase("pt-BR");
      setError(reason.includes("capacidade")
        ? "O volume informado excede a capacidade cadastrada do tanque; a gestão poderá avaliar o registro."
        : reason.includes("bloqueio") || reason.includes("indisponível")
          ? "O veículo está bloqueado ou indisponível para abastecimento na data informada."
          : reason.includes("motorista") || reason.includes("cnh")
            ? "O motorista está inativo, com CNH vencida ou sem autorização válida para este veículo e data."
            : reason.includes("combustível") || reason.includes("combustivel")
              ? "O combustível não está autorizado para esse posto ou não corresponde ao cadastro do veículo."
              : reason.includes("autorização") || reason.includes("autorizacao") || reason.includes("beneficiária") || reason.includes("beneficiaria") || reason.includes("unidade responsável")
                ? "Veículo cedido ou uso por outra secretaria exige autorização aprovada, vigente e vinculada à unidade correta."
                : reason.includes("justificativa") || reason.includes("posterior")
                  ? "Este lançamento está fora da janela normal. Informe a justificativa de lançamento posterior."
                  : (cause instanceof Error ? cause.message : "Não foi possível enviar o abastecimento. Confira os campos e o vínculo do posto."));
    } finally { setSaving(false); }
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
              units={units}
              stationId={station.id}
              initialVehicleId={initialVehicleId}
              saving={saving}
              onSubmit={submitFueling}
            />
          )}
          {view === "records" && (
            <SupplierFuelingRecords
              station={station}
              fuelings={fuelings}
              vehicles={vehicles}
              fuelTypes={fuelTypes}
              loading={loading}
              loadingMore={loadingMoreFuelings}
              hasMore={hasMoreFuelings}
              onLoadMore={loadMoreFuelings}
              onNew={() => setView("fueling")}
            />
          )}
          {view === "documents" && (
            <SupplierDocumentsView
              fuelings={fuelings}
              documents={documents}
              vehicles={vehicles}
              fuelTypes={fuelTypes}
              loading={loading}
              loadingMore={loadingMoreFuelings}
              hasMore={hasMoreFuelings}
              onLoadMore={loadMoreFuelings}
              onUpload={uploadDocument}
              onRefresh={loadPortal}
            />
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
  units,
  stationId,
  initialVehicleId,
  saving,
  onSubmit,
}: {
  vehicles: VehicleOption[];
  units: UnitOption[];
  stationId: string;
  initialVehicleId: string | null;
  saving: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const [vehicleId, setVehicleId] = useState(initialVehicleId || "");
  const [fuelTypeId, setFuelTypeId] = useState("");
  const [authorizedFuelTypes, setAuthorizedFuelTypes] = useState<FuelOption[]>([]);
  const [loadingFuelTypes, setLoadingFuelTypes] = useState(false);
  const [unitId, setUnitId] = useState("");
  const [loadingUnit, setLoadingUnit] = useState(false);
  const [beneficiaryUnitId, setBeneficiaryUnitId] = useState("");
  const [authorizationId, setAuthorizationId] = useState("");
  const [useAuthorizations, setUseAuthorizations] = useState<UseAuthorizationOption[]>([]);
  const [loadingUseAuthorizations, setLoadingUseAuthorizations] = useState(false);
  const [authorizationError, setAuthorizationError] = useState("");
  const [performedAt, setPerformedAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const [authorizedDrivers, setAuthorizedDrivers] = useState<Array<{ id: string; nome: string; matricula: string | null; cnh_valid_until: string | null; cnh_category?: string | null }>>([]);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [odometer, setOdometer] = useState("");
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  const availableFuelTypes = vehicle?.fuel_type_id ? authorizedFuelTypes.filter((item) => item.id === vehicle.fuel_type_id) : authorizedFuelTypes;
  useEffect(() => {
    if (initialVehicleId && vehicles.length && !vehicles.some((item) => item.id === initialVehicleId)) setVehicleId("");
  }, [initialVehicleId, vehicles]);
  useEffect(() => {
    if (!vehicleId || !supabase || !performedAt) { setAuthorizedFuelTypes([]); setLoadingFuelTypes(false); return; }
    let cancelled = false;
    setLoadingFuelTypes(true);
    void supabase.rpc("fleet_supplier_fuel_options", { p_station_id: stationId, p_vehicle_id: vehicleId, p_performed_at: new Date(performedAt).toISOString() }).then(({ data, error: fuelError }) => {
      if (cancelled) return;
      setAuthorizedFuelTypes(fuelError ? [] : (data || []) as FuelOption[]);
      if (fuelError) setAuthorizationError("Não foi possível consultar os combustíveis habilitados para este posto.");
      setLoadingFuelTypes(false);
    });
    return () => { cancelled = true; };
  }, [stationId, vehicleId, performedAt]);
  useEffect(() => {
    if (!vehicle || !supabase || !performedAt) { setLoadingUnit(false); return; }
    let cancelled = false;
    setLoadingUnit(true);
    void supabase.rpc("fleet_supplier_vehicle_unit_at", { p_station_id: stationId, p_vehicle_id: vehicleId, p_performed_at: new Date(performedAt).toISOString() }).then(({ data, error: unitError }) => {
      if (cancelled) return;
      const result = Array.isArray(data) ? data[0] : data;
      const effectiveUnit = unitError ? null : result?.responsible_unit_id || vehicle.responsible_unit_id;
      setUnitId(effectiveUnit || "");
      setBeneficiaryUnitId(effectiveUnit || "");
      setAuthorizationId("");
      setLoadingUnit(false);
      if (unitError) setAuthorizationError("Não foi possível verificar a lotação do veículo na data informada.");
    });
    return () => { cancelled = true; };
  }, [stationId, vehicleId, performedAt, vehicle?.responsible_unit_id]);
  useEffect(() => {
    if (!vehicleId || !supabase || !performedAt) { setAuthorizedDrivers([]); setLoadingDrivers(false); setDriverId(""); return; }
    let cancelled = false;
    setLoadingDrivers(true);
    void supabase.rpc("fleet_supplier_driver_options", { p_station_id: stationId, p_vehicle_id: vehicleId, p_performed_at: new Date(performedAt).toISOString() }).then(({ data, error: driverError }) => {
      if (cancelled) return;
      setAuthorizedDrivers(driverError ? [] : (data || []) as Array<{ id: string; nome: string; matricula: string | null; cnh_valid_until: string | null; cnh_category?: string | null }>);
      setLoadingDrivers(false);
    });
    return () => { cancelled = true; };
  }, [stationId, vehicleId, performedAt]);
  useEffect(() => {
    if (!vehicle || !supabase || !performedAt) { setUseAuthorizations([]); setAuthorizationId(""); setLoadingUseAuthorizations(false); setAuthorizationError(""); return; }
    const eventTime = new Date(performedAt);
    if (!Number.isFinite(eventTime.getTime())) { setUseAuthorizations([]); setLoadingUseAuthorizations(false); return; }
    let cancelled = false;
    setLoadingUseAuthorizations(true);
    setAuthorizationError("");
    setAuthorizationId("");
    void supabase.rpc("fleet_supplier_authorization_options", { p_station_id: stationId, p_vehicle_id: vehicleId, p_performed_at: eventTime.toISOString() }).then(({ data, error: authorizationLoadError }) => {
      if (cancelled) return;
      const options = authorizationLoadError ? [] : (data || []) as UseAuthorizationOption[];
      setUseAuthorizations(options);
      if (authorizationLoadError) setAuthorizationError("Não foi possível verificar autorizações de cessão para esta data.");
      setLoadingUseAuthorizations(false);
    });
    return () => { cancelled = true; };
  }, [stationId, vehicleId, performedAt, vehicle?.responsible_unit_id]);
  useEffect(() => {
    if (!vehicle) return;
    setFuelTypeId(vehicle.fuel_type_id || "");
    setUnitId(vehicle.responsible_unit_id || "");
    setBeneficiaryUnitId(vehicle.responsible_unit_id || "");
    setAuthorizationId("");
    setDriverId("");
    setOdometer(vehicle.current_odometer_km == null ? "" : String(vehicle.current_odometer_km));
  }, [vehicle?.id]);
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
          <ShieldCheck size={16} /> A lotação responsável vem do cadastro do veículo. Veículo cedido ou usado por outra secretaria exige autorização aprovada e vigente; o valor total é calculado pelo banco.
        </div>
        <div className="supplier-form-grid">
          <label>
            Veículo
            <select required name="vehicle_id" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
              <option value="">Selecione a placa</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.placa} — {vehicle.marca || ""} {vehicle.modelo || ""} · {vehicle.operational_status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Combustível
            <select required name="fuel_type_id" value={fuelTypeId} onChange={(event) => setFuelTypeId(event.target.value)} disabled={!vehicleId || loadingFuelTypes}>
              <option value="">{loadingFuelTypes ? "Consultando produtos habilitados…" : "Selecione o combustível autorizado"}</option>
              {availableFuelTypes.map((fuel) => (
                <option key={fuel.id} value={fuel.id}>
                  {fuel.nome}
                  {fuel.sigla ? ` (${fuel.sigla})` : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            Secretaria responsável
            <input readOnly value={loadingUnit ? "Consultando lotação na data…" : units.find((unit) => unit.id === unitId)?.nome || "Definida pela lotação administrativa do veículo"} />
          </label>
          <input type="hidden" name="responsible_unit_id" value={unitId} />
          <label>
            Cessão / autorização de uso
            <select required={vehicle?.operational_status === "CEDIDO" || Boolean(unitId && beneficiaryUnitId && unitId !== beneficiaryUnitId)} name="authorization_id" value={authorizationId} disabled={!vehicle || loadingUseAuthorizations} onChange={(event) => {
              const selected = useAuthorizations.find((item) => item.id === event.target.value);
              setAuthorizationId(event.target.value);
              setBeneficiaryUnitId(selected?.beneficiary_unit_id || vehicle?.responsible_unit_id || "");
            }}>
              <option value="">{loadingUseAuthorizations ? "Verificando autorizações…" : vehicle?.operational_status === "CEDIDO" || (unitId && beneficiaryUnitId !== unitId) ? "Selecione autorização vigente" : "Uso pela secretaria responsável"}</option>
              {useAuthorizations.map((authorization) => <option key={authorization.id} value={authorization.id}>{authorization.beneficiary_unit_name} · {authorization.purpose} · até {authorization.valid_until.slice(0, 10)}</option>)}
            </select>
            {authorizationError && <small className="supplier-upload-note">{authorizationError}</small>}
            {vehicle?.operational_status === "CEDIDO" && !loadingUseAuthorizations && !useAuthorizations.length && <small className="supplier-upload-note">Não há cessão aprovada, vigente e documentada para este veículo e data.</small>}
          </label>
          <label>
            Secretaria beneficiária
            <input readOnly value={units.find((unit) => unit.id === beneficiaryUnitId)?.nome || "A mesma unidade responsável"} />
          </label>
          <input type="hidden" name="beneficiary_unit_id" value={beneficiaryUnitId} />
          <label>
            Motorista autorizado
            <select required name="driver_id" value={driverId} onChange={(event) => setDriverId(event.target.value)}>
              <option value="">{loadingDrivers ? "Carregando motoristas…" : "Selecione o motorista"}</option>
              {authorizedDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.nome}{driver.matricula ? ` — ${driver.matricula}` : ""}</option>
              ))}
            </select>
            {vehicleId && !loadingDrivers && authorizedDrivers.length === 0 && <small className="supplier-upload-note">Não há motorista com CNH vigente e autorização para este veículo nesta data.</small>}
          </label>
          <label>
            Data e hora real
            <input
              required
              type="datetime-local"
              name="performed_at"
              value={performedAt}
              onChange={(event) => setPerformedAt(event.target.value)}
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
              min="0.001"
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
              value={odometer}
              onChange={(event) => setOdometer(event.target.value)}
            />
          </label>
          <label>
            Número do recibo
            <input name="receipt" placeholder="NF ou recibo" />
          </label>
          <label className="supplier-wide">
            Justificativa de lançamento posterior
            <textarea name="late_entry_reason" rows={2} placeholder="Preencha quando o lançamento ocorrer fora da janela normal." />
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
