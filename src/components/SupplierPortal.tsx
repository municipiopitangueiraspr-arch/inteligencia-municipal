import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Bell,
  CalendarCheck,
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
import { SupplierMonthlyClosuresView } from "./SupplierMonthlyClosuresView";
import "./SupplierPortal.css";

type SupplierPortalProps = {
  station: Station;
  role: string;
  userEmail: string;
  userDisplayName: string;
  initialVehicleId: string | null;
  accessReason?: string | null;
  onLogout: () => void;
};
type PortalView = "overview" | "fueling" | "records" | "documents" | "closures" | "members";
type VehicleOption = {
  id: string;
  placa: string;
  marca: string | null;
  modelo: string | null;
  fuel_type_id: string | null;
  tank_capacity_l: number | null;
  requires_authorization: boolean;
};
type FuelOption = { id: string; nome: string; sigla: string | null };
type UseAuthorizationOption = { id: string; beneficiary_unit_id: string; beneficiary_unit_name: string; purpose: string; valid_from: string; valid_until: string };
type Fueling = {
  id: string;
  vehicle_id: string;
  fuel_type_id: string;
  driver_id: string | null;
  driver_name: string | null;
  performed_at: string;
  submitted_at: string;
  recorded_at: string;
  liters: number;
  unit_price: number;
  total_amount: number;
  odometer_km: number;
  status: string;
  operational_status: string;
  review_status: string;
  entry_type: string;
  late_entry_reason: string | null;
  notes: string | null;
  protocol_number: string | null;
  station_receipt_number: string | null;
  vehicles?: { placa?: string; marca?: string; modelo?: string } | null;
  fuel_type?: { nome?: string } | null;
};
type SupplierFuelingRow = Omit<Fueling, "vehicles" | "fuel_type"> & { vehicle_plate: string | null; vehicle_brand: string | null; vehicle_model: string | null; fuel_name: string | null };
type DashboardSummary = { today_count: number; today_liters: number; today_amount: number; month_count: number; month_liters: number; month_amount: number; pending_review_count: number; pending_completion_count: number; pending_document_count: number; pending_closure_count: number; municipal_request_count: number; open_divergence_count: number; normal_entry_window_minutes: number; require_late_reason: boolean; receipt_upload_window_hours: number };
type DocumentRecord = { id: string; fueling_id: string; file_name: string; storage_path: string; mime_type: string; document_status: string; uploaded_at: string; due_at?: string | null; is_current: boolean; rejection_reason: string | null };

function mapSupplierFueling(row: SupplierFuelingRow): Fueling {
  const { vehicle_plate, vehicle_brand, vehicle_model, fuel_name, ...fueling } = row;
  return {
    ...fueling,
    vehicles: { placa: vehicle_plate || undefined, marca: vehicle_brand || undefined, modelo: vehicle_model || undefined },
    fuel_type: { nome: fuel_name || undefined },
  };
}

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
  { id: "closures", label: "Fechamento mensal", icon: CalendarCheck },
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

function stationCanOperate(station: Station) {
  if (station.status !== "ATIVO" || !station.credenciamento_started_at) return false;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const start = station.credenciamento_started_at.slice(0, 10);
  const end = station.credenciamento_ends_at?.slice(0, 10);
  return today >= start && (!end || today <= end);
}
function stationStatusLabel(station: Station) {
  if (station.status === "PENDENTE") return "Em análise";
  if (station.status === "ATIVO" && station.credenciamento_ends_at && station.credenciamento_ends_at.slice(0, 10) < new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())) return "Credenciamento encerrado";
  if (station.status === "ATIVO" && !stationCanOperate(station)) return "Ativo · fora da vigência";
  return station.status.replaceAll("_", " ");
}

export function SupplierPortal({
  station,
  role,
  userEmail,
  userDisplayName,
  initialVehicleId,
  accessReason,
  onLogout,
}: SupplierPortalProps) {
  const [view, setView] = useState<PortalView>(initialVehicleId ? "fueling" : "overview");
  const [fuelings, setFuelings] = useState<Fueling[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [fuelTypes, setFuelTypes] = useState<FuelOption[]>([]);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [summary, setSummary] = useState<DashboardSummary>({ today_count: 0, today_liters: 0, today_amount: 0, month_count: 0, month_liters: 0, month_amount: 0, pending_review_count: 0, pending_completion_count: 0, pending_document_count: 0, pending_closure_count: 0, municipal_request_count: 0, open_divergence_count: 0, normal_entry_window_minutes: 30, require_late_reason: true, receipt_upload_window_hours: 24 });
  const [loading, setLoading] = useState(true);
  const [loadingMoreFuelings, setLoadingMoreFuelings] = useState(false);
  const [hasMoreFuelings, setHasMoreFuelings] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showMembers, setShowMembers] = useState(false);
  const canOperate = stationCanOperate(station);

  async function loadPortal() {
    if (!supabase) return;
    setLoading(true);
    setError("");
    setFuelings([]);
    setDocuments([]);
    setHasMoreFuelings(true);
    const { data: municipalityId } = await supabase.rpc("fleet_current_municipio_id");
    const [fuelingsResult, vehiclesResult, fuelTypesResult, summaryResult] = await Promise.all([
        supabase.rpc("fleet_supplier_fueling_page", { p_station_id: station.id, p_limit: 100, p_offset: 0 }),
        canOperate ? supabase.rpc("fleet_supplier_vehicle_options_v2", { p_station_id: station.id }) : Promise.resolve({ data: [], error: null }),
        canOperate ? supabase
          .from("fleet_fuel_types")
          .select("id,nome,sigla")
          .eq("ativo", true)
          .order("nome")
          .limit(100) : Promise.resolve({ data: [], error: null }),
        supabase.rpc("fleet_supplier_dashboard_summary", { p_station_id: station.id }),
      ]);
    const vehicleOptions = (vehiclesResult.data || []) as VehicleOption[];
    const stationFuelings = ((fuelingsResult.data || []) as SupplierFuelingRow[]).map(mapSupplierFueling);
    const summaryRow = Array.isArray(summaryResult.data) ? summaryResult.data[0] : summaryResult.data;
    const documentFuelingIds = stationFuelings.map((item) => item.id);
    const documentsResult = documentFuelingIds.length
      ? await supabase
          .from("fleet_fueling_documents")
          .select("id,fueling_id,file_name,storage_path,mime_type,document_status,uploaded_at,due_at,is_current,rejection_reason")
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
      summaryResult.error ||
      documentsResult.error
    )
      setError("Não foi possível carregar os dados operacionais deste posto.");
    else {
      setFuelings(stationFuelings);
      setHasMoreFuelings(stationFuelings.length === 100);
      setVehicles(vehicleOptions);
      setFuelTypes((fuelTypesResult.data || []) as FuelOption[]);
      setDocuments((documentsResult.data || []) as DocumentRecord[]);
      if (summaryRow) setSummary(summaryRow as DashboardSummary);
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
    const { data, error: pageError } = await supabase.rpc("fleet_supplier_fueling_page", { p_station_id: station.id, p_limit: 100, p_offset: offset });
    if (pageError) {
      setError("Não foi possível carregar mais abastecimentos deste posto.");
      setLoadingMoreFuelings(false);
      return;
    }
    const page = ((data || []) as SupplierFuelingRow[]).map(mapSupplierFueling);
    setFuelings((current) => [...current, ...page]);
    setHasMoreFuelings(page.length === 100);
    const documentFuelingIds = page.map((item) => item.id);
    if (documentFuelingIds.length) {
      const { data: municipalityId } = await supabase.rpc("fleet_current_municipio_id");
      const { data: addedDocuments, error: documentError } = await supabase
        .from("fleet_fueling_documents")
        .select("id,fueling_id,file_name,storage_path,mime_type,document_status,uploaded_at,due_at,is_current,rejection_reason")
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
  async function uploadDocument(fuelingId: string, file: File) {
    if (!supabase) return { error: new Error("Supabase indisponível") };
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) && file.type !== "application/pdf") return { error: new Error("Selecione PDF, JPG, PNG ou WEBP.") };
    if (file.size > 10 * 1024 * 1024) return { error: new Error("O comprovante deve ter no máximo 10 MB.") };
    const { data: municipalityId } = await supabase.rpc("fleet_current_municipio_id");
    if (!municipalityId) return { error: new Error("Não foi possível identificar o município do arquivo.") };
    const { data: currentDocuments, error: currentDocumentsError } = await supabase.from("fleet_fueling_documents").select("id,document_status,is_current").eq("fueling_id", fuelingId).eq("is_current", true).order("uploaded_at", { ascending: false }).limit(1);
    if (currentDocumentsError) return { error: new Error("Não foi possível verificar o estado do comprovante atual. Tente novamente.") };
    const currentDocument = currentDocuments?.[0];
    if (currentDocument && currentDocument.document_status !== "REJEITADO") return { error: new Error("Há um comprovante atual em análise ou aceito; somente arquivo rejeitado pode ser substituído.") };
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${municipalityId}/fuelings/${fuelingId}/${crypto.randomUUID()}-${safeName}`;
    const upload = await supabase.storage.from("fleet-documents").upload(path, file, { contentType: file.type, upsert: false });
    if (upload.error) return { error: new Error("Não foi possível enviar o arquivo ao repositório privado. Confira a conexão e tente novamente.") };
    const document = await supabase.rpc("fleet_register_fueling_document", {
      p_fueling_id: fuelingId, p_file_name: file.name, p_storage_path: path, p_mime_type: file.type,
      p_file_size_bytes: file.size, p_document_type: "COMPROVANTE_DE_ABASTECIMENTO", p_notes: null,
      p_replaced_document_id: currentDocument?.id || null,
    });
    if (document.error) { await supabase.storage.from("fleet-documents").remove([path]); return { error: new Error("Não foi possível registrar o comprovante. Tente novamente pela área de Comprovantes.") }; }
    return { error: null };
  }
  async function submitFueling(data: FormData, form: HTMLFormElement) {
    if (!stationCanOperate(station)) { setError("Este posto só pode operar com status Ativo e dentro da vigência do credenciamento."); return; }
    if (!supabase) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await supabase.rpc("fleet_submit_fueling_supplier_v2", {
        p_idempotency_key: crypto.randomUUID(), p_station_id: station.id, p_vehicle_id: data.get("vehicle_id"),
        p_fuel_type_id: data.get("fuel_type_id"), p_driver_id: data.get("driver_id"),
        p_responsible_unit_id: data.get("responsible_unit_id"), p_beneficiary_unit_id: data.get("beneficiary_unit_id") || null,
        p_authorization_id: data.get("authorization_id") || null, p_performed_at: new Date(String(data.get("performed_at"))).toISOString(),
        p_liters: Number(data.get("liters")), p_unit_price: Number(data.get("unit_price")), p_odometer_km: Number(data.get("odometer_km")),
        p_station_receipt_number: data.get("receipt") || null, p_notes: data.get("notes") || null,
        p_late_entry_reason: data.get("late_entry_reason") || null,
        p_tank_exception_reason: data.get("tank_exception_reason") || null,
      });
      if (result.error) throw result.error;
      const record = Array.isArray(result.data) ? result.data[0] : result.data;
      if (!record?.fueling_id) throw new Error("O servidor não retornou o protocolo do abastecimento.");
      const file = data.get("receipt_file");
      let documentMessage = "";
      if (file instanceof File && file.size > 0) {
        const documentResult = await uploadDocument(record.fueling_id, file);
        if (documentResult.error) documentMessage = `Abastecimento ${record.protocol_number || ""} enviado, mas o comprovante não foi anexado. Abra Comprovantes e tente novamente dentro do prazo.`;
      }
      form.reset();
      setMessage(documentMessage || `Abastecimento ${record.protocol_number || ""} enviado para conferência do Gestor de Frotas.`);
      setView(documentMessage ? "documents" : "overview");
      await loadPortal();
    } catch (cause) {
      const reason = (cause instanceof Error ? cause.message : String(cause)).toLocaleLowerCase("pt-BR");
      setError(reason.includes("capacidade")
        ? "O volume excede a capacidade cadastrada do tanque. Informe uma justificativa formal para encaminhar o lançamento à análise municipal."
        : reason.includes("bloqueio") || reason.includes("indisponível")
          ? "O veículo está bloqueado ou indisponível para abastecimento na data informada."
          : reason.includes("motorista") || reason.includes("cnh")
            ? "O motorista está inativo, com CNH vencida ou sem autorização válida para este veículo e data."
            : reason.includes("combustível") || reason.includes("combustivel")
              ? "O combustível não está autorizado para esse posto ou não corresponde ao cadastro do veículo."
              : reason.includes("autorização") || reason.includes("autorizacao") || reason.includes("beneficiária") || reason.includes("beneficiaria") || reason.includes("unidade responsável")
                ? "Veículo cedido ou uso por outra secretaria exige autorização aprovada, vigente e vinculada à unidade correta."
                : reason.includes("justificativa") || reason.includes("posterior")
                  ? reason.includes("tanque") || reason.includes("volume")
                    ? "O volume ultrapassa a capacidade cadastrada. Inclua a justificativa excepcional do tanque e confirme novamente."
                    : "Este lançamento está fora da janela normal. Informe a justificativa de lançamento posterior."
                  : "Não foi possível enviar o abastecimento. Confira os campos obrigatórios, a data e as autorizações do veículo." );
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
              disabled={id === "fueling" && !canOperate}
              title={id === "fueling" && !canOperate ? "Operação indisponível: posto não ativo ou fora da vigência" : undefined}
            >
              <Icon size={17} />
              {label}
              {id === "records" && summary.pending_review_count > 0 && (
                <b>{Number(summary.pending_review_count).toLocaleString("pt-BR")}</b>
              )}
            </button>
          ))}
          {role === "REPRESENTANTE_LEGAL" && station.secondary_users_authorized && canOperate && (
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
            <button aria-label="Abrir pendências do posto" title="Abrir pendências do posto" onClick={() => setView(summary.municipal_request_count || summary.pending_closure_count ? "closures" : summary.pending_document_count ? "documents" : "records")}>
              <Bell size={18} />
            </button>
          </div>
        </header>
        <div className="supplier-content">
          {error && <div className="supplier-message error">{error}</div>}
          {message && <div className="supplier-message success">{message}</div>}
          {!canOperate && <div className="supplier-message error" role="status"><strong>Modo de consulta.</strong> {accessReason || "O posto precisa estar Ativo e dentro da vigência informada pela Prefeitura."} Novos abastecimentos e alterações operacionais estão bloqueados; registros e histórico permanecem disponíveis.</div>}
          {view === "overview" && (
            <section>
              <div className="supplier-welcome">
                <div>
                  <span>AMBIENTE OPERACIONAL</span>
                  <h2>Olá, {(userDisplayName || userEmail).trim().split(/\s+/)[0]}.</h2>
                  <p>
                    Acompanhe somente as operações, documentos e pendências do seu estabelecimento.
                  </p>
                  <div className="supplier-welcome-actions">
                    <button type="button" className="supplier-primary" onClick={() => setView("fueling")} disabled={!canOperate}><Plus size={15} /> Novo abastecimento</button>
                    <button type="button" className="supplier-welcome-secondary" onClick={() => setView("records")}>Ver histórico</button>
                  </div>
                </div>
                <div className="supplier-welcome-mark">
                  <BadgeCheck size={34} />
                </div>
              </div>
              {(summary.pending_review_count > 0 || summary.pending_completion_count > 0 || summary.pending_closure_count > 0 || summary.municipal_request_count > 0 || summary.open_divergence_count > 0) && <div className="supplier-dashboard-alert" role="status"><Bell size={16} /><span><strong>Há itens que exigem acompanhamento.</strong> Confira conferências, comprovantes, solicitações da Prefeitura e divergências do seu posto.</span><button type="button" onClick={() => setView(summary.municipal_request_count || summary.pending_closure_count ? "closures" : summary.pending_review_count ? "records" : "documents")}>Revisar pendências</button></div>}
              <div className="supplier-metrics">
                <button type="button" onClick={() => setView("records")}><Fuel size={18} /><span>Abastecimentos hoje<strong>{Number(summary.today_count).toLocaleString("pt-BR")}</strong><small>{Number(summary.today_liters).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L</small></span></button>
                <button type="button" onClick={() => setView("records")}><ClipboardList size={18} /><span>Valor registrado hoje<strong>{money(summary.today_amount)}</strong><small>Somente este estabelecimento</small></span></button>
                <button type="button" onClick={() => setView("records")}><Fuel size={18} /><span>Litros no mês<strong>{Number(summary.month_liters).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L</strong><small>{Number(summary.month_count).toLocaleString("pt-BR")} operação(ões)</small></span></button>
                <button type="button" onClick={() => setView("records")}><Store size={18} /><span>Valor registrado no mês<strong>{money(summary.month_amount)}</strong><small>Competência atual</small></span></button>
                <button type="button" onClick={() => setView("records")}><ClipboardList size={18} /><span>Aguardando conferência<strong>{Number(summary.pending_review_count).toLocaleString("pt-BR")}</strong><small>Análise da Prefeitura</small></span></button>
                <button type="button" onClick={() => setView("documents")}><FileCheck2 size={18} /><span>Comprovantes pendentes<strong>{Number(summary.pending_completion_count).toLocaleString("pt-BR")}</strong><small>Ausentes ou rejeitados</small></span></button>
                <button type="button" onClick={() => setView("documents")}><FileCheck2 size={18} /><span>Documentos aguardando<strong>{Number(summary.pending_document_count).toLocaleString("pt-BR")}</strong><small>Verificação municipal</small></span></button>
                <button type="button" onClick={() => setView("closures")}><CalendarCheck size={18} /><span>Fechamentos pendentes<strong>{Number(summary.pending_closure_count).toLocaleString("pt-BR")}</strong><small>Conferência da Prefeitura</small></span></button>
                <button type="button" onClick={() => setView("closures")}><Bell size={18} /><span>Solicitações / divergências<strong>{Number(summary.municipal_request_count + summary.open_divergence_count).toLocaleString("pt-BR")}</strong><small>{summary.municipal_request_count} solicitação(ões) · {summary.open_divergence_count} divergência(s)</small></span></button>
                <article className="supplier-metric-status"><Store size={18} /><span>Status do posto<strong>{stationStatusLabel(station)}</strong><small>{roleLabels[role] || role}</small></span></article>
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
            canOperate ? <FuelingForm
              vehicles={vehicles}
              stationId={station.id}
              stationLabel={station.nome_fantasia_snapshot || station.razao_social_snapshot}
              accountLabel={userDisplayName || userEmail}
              policy={{ normal_entry_window_minutes: summary.normal_entry_window_minutes, require_late_reason: summary.require_late_reason }}
              initialVehicleId={initialVehicleId}
              saving={saving}
              onSubmit={submitFueling}
            /> : <div className="supplier-message error">Este posto não pode registrar abastecimentos fora do status Ativo e da vigência do credenciamento.</div>
          )}
          {view === "records" && (
            <SupplierFuelingRecords
              station={station}
              fuelings={fuelings}
              vehicles={vehicles}
              fuelTypes={fuelTypes}
              documents={documents}
              receiptWindowHours={summary.receipt_upload_window_hours}
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
              receiptWindowHours={summary.receipt_upload_window_hours}
            />
          )}
          {view === "closures" && <SupplierMonthlyClosuresView station={station} />}
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
            <th>Motorista</th>
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
              <td>{item.driver_name || "Não informado"}</td>
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
  stationId,
  stationLabel,
  accountLabel,
  policy,
  initialVehicleId,
  saving,
  onSubmit,
}: {
  vehicles: VehicleOption[];
  stationId: string;
  stationLabel: string;
  accountLabel: string;
  policy: Pick<DashboardSummary, "normal_entry_window_minutes" | "require_late_reason">;
  initialVehicleId: string | null;
  saving: boolean;
  onSubmit: (data: FormData, form: HTMLFormElement) => void | Promise<void>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
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
  const [liters, setLiters] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [tankExceptionReason, setTankExceptionReason] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState("");
  const [reviewOpen, setReviewOpen] = useState(false);
  const vehicle = vehicles.find((item) => item.id === vehicleId);
  const availableFuelTypes = vehicle?.fuel_type_id ? authorizedFuelTypes.filter((item) => item.id === vehicle.fuel_type_id) : authorizedFuelTypes;
  const selectedDriver = authorizedDrivers.find((item) => item.id === driverId);
  const selectedAuthorization = useAuthorizations.find((item) => item.id === authorizationId);
  const tankExceeded = Boolean(vehicle?.tank_capacity_l && Number(liters) > vehicle.tank_capacity_l);
  const estimatedTotal = Number(liters || 0) * Number(unitPrice || 0);
  const performedMillis = Date.parse(performedAt);
  const lateEntryRequired = Boolean(policy.require_late_reason && Number.isFinite(performedMillis) && Date.now() - performedMillis > policy.normal_entry_window_minutes * 60_000);
  const formBusy = loadingFuelTypes || loadingUnit || loadingDrivers || loadingUseAuthorizations;
  useEffect(() => {
    if (!receiptFile) { setReceiptPreviewUrl(""); return; }
    const url = URL.createObjectURL(receiptFile);
    setReceiptPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [receiptFile]);
  function reviewSubmission(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    setReviewOpen(true);
  }
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
      const effectiveUnit = unitError ? null : result?.responsible_unit_id;
      setUnitId(effectiveUnit || "");
      setBeneficiaryUnitId(effectiveUnit || "");
      setAuthorizationId("");
      setLoadingUnit(false);
      if (unitError) setAuthorizationError("Não foi possível verificar a lotação do veículo na data informada.");
    });
    return () => { cancelled = true; };
  }, [stationId, vehicleId, performedAt]);
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
  }, [stationId, vehicleId, performedAt]);
  useEffect(() => {
    if (!vehicle) return;
    setFuelTypeId(vehicle.fuel_type_id || "");
    setUnitId("");
    setBeneficiaryUnitId("");
    setAuthorizationId("");
    setDriverId("");
    setOdometer("");
    setLiters("");
    setUnitPrice("");
    setTankExceptionReason("");
    setReceiptFile(null);
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
      <form ref={formRef} className="supplier-form" onSubmit={reviewSubmission}>
        <div className="supplier-form-note">
          <ShieldCheck size={16} /> A lotação vem do cadastro municipal. Veículo cedido ou uso por outra secretaria exige autorização vigente. Confira os dados antes da confirmação; o valor oficial é calculado pelo banco.
        </div>
        <div className="supplier-form-grid">
          <label>
            Veículo
            <select required name="vehicle_id" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
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
            <input readOnly value={loadingUnit ? "Consultando lotação na data…" : unitId ? "Identificada pelo cadastro municipal" : "Selecione veículo e data para consultar"} />
          </label>
          <input type="hidden" name="responsible_unit_id" value={unitId} />
          <label>
            Cessão / autorização de uso
            <select required={Boolean(vehicle?.requires_authorization || (unitId && beneficiaryUnitId && unitId !== beneficiaryUnitId))} name="authorization_id" value={authorizationId} disabled={!vehicle || loadingUseAuthorizations} onChange={(event) => {
              const selected = useAuthorizations.find((item) => item.id === event.target.value);
              setAuthorizationId(event.target.value);
              setBeneficiaryUnitId(selected?.beneficiary_unit_id || unitId || "");
            }}>
              <option value="">{loadingUseAuthorizations ? "Verificando autorizações…" : vehicle?.requires_authorization || (unitId && beneficiaryUnitId !== unitId) ? "Selecione autorização vigente" : "Uso pela secretaria responsável"}</option>
              {useAuthorizations.map((authorization) => <option key={authorization.id} value={authorization.id}>{authorization.beneficiary_unit_name} · {authorization.purpose} · até {authorization.valid_until.slice(0, 10)}</option>)}
            </select>
            {authorizationError && <small className="supplier-upload-note">{authorizationError}</small>}
            {vehicle?.requires_authorization && !loadingUseAuthorizations && !useAuthorizations.length && <small className="supplier-upload-note">Não há autorização aprovada, vigente e documentada para este veículo e data.</small>}
          </label>
          <label>
            Secretaria beneficiária
            <input readOnly value={selectedAuthorization?.beneficiary_unit_name || (beneficiaryUnitId ? "Mesma unidade responsável" : "Definida pela autorização vigente")} />
          </label>
          <input type="hidden" name="beneficiary_unit_id" value={beneficiaryUnitId} />
          <label>
            Motorista autorizado
            <select required name="driver_id" value={driverId} onChange={(event) => setDriverId(event.target.value)}>
              <option value="">{loadingDrivers ? "Carregando motoristas…" : "Selecione o motorista"}</option>
              {authorizedDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.nome}</option>
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
            <small className="supplier-upload-note">Janela normal: {policy.normal_entry_window_minutes} min. Lançamentos posteriores exigem justificativa.</small>
          </label>
          <label>
            Litros
            <input
              required
              min="0.001"
              step="0.001"
              type="number"
              name="liters"
              value={liters}
              onChange={(event) => setLiters(event.target.value)}
            />
            {vehicle?.tank_capacity_l && <small className={tankExceeded ? "supplier-upload-note supplier-danger-note" : "supplier-upload-note"}>Capacidade cadastrada: {Number(vehicle.tank_capacity_l).toLocaleString("pt-BR")} L{tankExceeded ? " · volume acima da capacidade" : ""}</small>}
          </label>
          <label>
            Preço unitário
            <input
              required
              min="0.001"
              step="0.0001"
              type="number"
              name="unit_price"
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
            />
          </label>
          <label>
            Total estimado
            <input readOnly value={money(estimatedTotal)} />
            <small className="supplier-upload-note">O valor definitivo é calculado pelo banco.</small>
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
          {tankExceeded && <label className="supplier-wide supplier-tank-exception">
            Justificativa excepcional de volume acima da capacidade
            <textarea name="tank_exception_reason" rows={3} minLength={10} maxLength={1000} required value={tankExceptionReason} onChange={(event) => setTankExceptionReason(event.target.value)} placeholder="Explique por que o volume real supera a capacidade cadastrada. Esta justificativa será enviada para análise municipal." />
            <small>Obrigatória, mínimo de 10 caracteres. O registro ficará sujeito à análise da Prefeitura.</small>
          </label>}
          <label className="supplier-wide">
            Justificativa de lançamento posterior
            <textarea name="late_entry_reason" rows={2} maxLength={1000} required={lateEntryRequired} placeholder={lateEntryRequired ? "Obrigatória para esta data/hora." : "Preencha se houver uma justificativa operacional relevante."} />
          </label>
          <label>
            Comprovante do abastecimento
            <input name="receipt_file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] || null)} />
            <small className="supplier-upload-note">PDF, JPG, PNG ou WEBP · máximo de 10 MB.</small>
            {receiptFile && <span className="supplier-file-selection">{receiptFile.name} · {(receiptFile.size / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} KB</span>}
          </label>
          <label className="supplier-wide">
            Observações
            <textarea
              name="notes"
              rows={4}
              maxLength={1000}
              placeholder="Informe alguma ocorrência operacional relevante."
            />
          </label>
        </div>
        <div className="supplier-form-actions">
          <button type="submit" className="supplier-primary" disabled={saving || formBusy}>
            {saving ? "Enviando…" : formBusy ? "Verificando autorização…" : "Revisar abastecimento"}
          </button>
        </div>
      </form>
      {reviewOpen && <div className="supplier-review-backdrop" role="presentation">
        <section className="supplier-review-dialog" role="dialog" aria-modal="true" aria-labelledby="supplier-review-title">
          <div className="supplier-review-heading"><span>ETAPA FINAL</span><h3 id="supplier-review-title">Revise antes de confirmar</h3><p>Confira os dados e o documento. O envio ficará pendente de conferência municipal.</p></div>
          <dl className="supplier-review-summary">
            <div><dt>Estabelecimento</dt><dd>{stationLabel}</dd></div>
            <div><dt>Conta autenticada</dt><dd>{accountLabel}</dd></div>
            <div><dt>Veículo</dt><dd>{vehicle?.placa || "—"} · {vehicle?.marca || ""} {vehicle?.modelo || ""}</dd></div>
            <div><dt>Motorista</dt><dd>{selectedDriver?.nome || "—"}</dd></div>
            <div><dt>Combustível</dt><dd>{availableFuelTypes.find((item) => item.id === fuelTypeId)?.nome || "—"}</dd></div>
            <div><dt>Data/hora real</dt><dd>{performedAt ? new Date(performedAt).toLocaleString("pt-BR") : "—"}</dd></div>
            <div><dt>Odômetro</dt><dd>{Number(odometer || 0).toLocaleString("pt-BR")} km</dd></div>
            <div><dt>Volume</dt><dd>{Number(liters || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })} L</dd></div>
            <div><dt>Preço por litro</dt><dd>{money(Number(unitPrice || 0))}/L</dd></div>
            <div><dt>Total estimado</dt><dd>{money(estimatedTotal)}</dd></div>
            <div><dt>Secretaria beneficiária</dt><dd>{selectedAuthorization?.beneficiary_unit_name || "Lotação responsável"}</dd></div>
            <div><dt>Recibo</dt><dd>{formRef.current ? String(new FormData(formRef.current).get("receipt") || "Não informado") : "Não informado"}</dd></div>
            {lateEntryRequired && <div><dt>Justificativa posterior</dt><dd>{formRef.current ? String(new FormData(formRef.current).get("late_entry_reason") || "Não informada") : "Não informada"}</dd></div>}
          </dl>
          {tankExceeded && <div className="supplier-review-warning"><AlertTriangle size={16} />Volume acima da capacidade ({Number(vehicle?.tank_capacity_l).toLocaleString("pt-BR")} L). A justificativa será registrada e encaminhada para análise.</div>}
          <div className="supplier-review-attachment">
            <strong>Comprovante selecionado</strong>
            {receiptFile ? <><span>{receiptFile.name}</span>{receiptPreviewUrl && (receiptFile.type === "application/pdf" ? <iframe title="Prévia do comprovante fictício ou enviado" src={receiptPreviewUrl} /> : <img src={receiptPreviewUrl} alt="Prévia do comprovante selecionado" />)}</> : <p>Nenhum arquivo selecionado. Será necessário anexar um comprovante pela área Comprovantes dentro do prazo configurado.</p>}
          </div>
          <div className="supplier-review-actions">
            <button type="button" className="supplier-welcome-secondary" onClick={() => setReviewOpen(false)}>Voltar e corrigir</button>
            <button type="button" className="supplier-primary" disabled={saving || formBusy} onClick={() => { const form = formRef.current; if (!form) return; setReviewOpen(false); void onSubmit(new FormData(form), form); }}>{saving ? "Enviando…" : formBusy ? "Verificando autorização…" : "Confirmar e enviar"}</button>
          </div>
        </section>
      </div>}
    </section>
  );
}
