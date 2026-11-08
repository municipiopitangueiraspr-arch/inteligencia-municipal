import { useMemo, useState } from "react";
import { AlertCircle, BadgeCheck, CalendarDays, Check, Clock3, Eye, FileCheck2, FileText, Filter, RotateCcw, ShieldCheck, Upload, X } from "lucide-react";
import { supabase } from "../lib/supabase";

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
type VehicleOption = { id: string; placa: string; marca: string | null; modelo: string | null };
type FuelOption = { id: string; nome: string; sigla: string | null };
type DocumentRecord = { id: string; fueling_id: string; file_name: string; storage_path: string; mime_type: string; document_status: string; uploaded_at: string; is_current: boolean; rejection_reason: string | null };
type Preview = { title: string; url: string; mimeType: string; file?: File; mode: "local" | "stored" };
type Props = {
  fuelings: Fueling[];
  documents: DocumentRecord[];
  vehicles: VehicleOption[];
  fuelTypes: FuelOption[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onUpload: (fuelingId: string, file: File) => Promise<{ error: Error | null }>;
  onRefresh: () => Promise<void>;
};

type DateMode = "specific" | "period";
type DocumentFilter = "NAO_CONFERIDOS" | "SEM_COMPROVANTE" | "AGUARDANDO" | "REJEITADO" | "CONFERIDO";
const statusMeta: Record<string, { label: string; tone: string }> = {
  PENDENTE: { label: "Pendente", tone: "warning" },
  ENVIADO: { label: "Aguardando verificação", tone: "info" },
  EM_ANALISE: { label: "Em análise", tone: "info" },
  ACEITO: { label: "Conferido", tone: "success" },
  CONFERIDO: { label: "Conferido", tone: "success" },
  REJEITADO: { label: "Rejeitado", tone: "danger" },
  SUBSTITUIDO: { label: "Substituído", tone: "neutral" },
};
const dateTime = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
const localDay = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};
const isChecked = (status?: string) => status === "ACEITO" || status === "CONFERIDO";
const isWaiting = (status?: string) => status === "ENVIADO" || status === "EM_ANALISE" || status === "PENDENTE";

export function SupplierDocumentsView({ fuelings, documents, vehicles, fuelTypes, loading, loadingMore, hasMore, onLoadMore, onUpload, onRefresh }: Props) {
  const [dateMode, setDateMode] = useState<DateMode>("specific");
  const [specificDate, setSpecificDate] = useState("");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [fuelTypeId, setFuelTypeId] = useState("");
  const [documentFilter, setDocumentFilter] = useState<DocumentFilter>("NAO_CONFERIDOS");
  const [uploadingId, setUploadingId] = useState("");
  const [selectedUpload, setSelectedUpload] = useState<{ fueling: Fueling; file: File } | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const latestDocuments = useMemo(() => {
    const latest = new Map<string, DocumentRecord>();
    for (const document of [...documents].filter((item) => item.is_current).sort((a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at))) {
      if (!latest.has(document.fueling_id)) latest.set(document.fueling_id, document);
    }
    return latest;
  }, [documents]);

  const filteredFuelings = useMemo(() => fuelings.filter((item) => {
    if (item.status === "CANCELADO") return false;
    const day = localDay(item.performed_at);
    if (dateMode === "specific" && specificDate && day !== specificDate) return false;
    if (dateMode === "period" && ((dateStart && day < dateStart) || (dateEnd && day > dateEnd))) return false;
    if (vehicleId && item.vehicle_id !== vehicleId) return false;
    if (fuelTypeId && item.fuel_type_id !== fuelTypeId) return false;
    const documentStatus = latestDocuments.get(item.id)?.document_status;
    if (documentFilter === "NAO_CONFERIDOS" && isChecked(documentStatus)) return false;
    if (documentFilter === "SEM_COMPROVANTE" && documentStatus) return false;
    if (documentFilter === "AGUARDANDO" && !isWaiting(documentStatus)) return false;
    if (documentFilter === "REJEITADO" && documentStatus !== "REJEITADO") return false;
    if (documentFilter === "CONFERIDO" && !isChecked(documentStatus)) return false;
    return true;
  }).sort((a, b) => Date.parse(b.performed_at) - Date.parse(a.performed_at)), [fuelings, latestDocuments, dateMode, specificDate, dateStart, dateEnd, vehicleId, fuelTypeId, documentFilter]);

  const activeFilterCount = Number(dateMode === "specific" ? Boolean(specificDate) : Boolean(dateStart || dateEnd)) + Number(Boolean(vehicleId)) + Number(Boolean(fuelTypeId)) + Number(documentFilter !== "NAO_CONFERIDOS");
  function resetFilters() {
    setDateMode("specific"); setSpecificDate(""); setDateStart(""); setDateEnd(""); setVehicleId(""); setFuelTypeId(""); setDocumentFilter("NAO_CONFERIDOS");
  }

  function selectFile(fueling: Fueling, file?: File) {
    if (!file) return;
    setNotice(""); setError("");
    if (!file.type.match(/^image\/(jpeg|png|webp)$/) && file.type !== "application/pdf") {
      setError("Selecione um comprovante PDF, JPG, PNG ou WEBP.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("O comprovante deve ter no máximo 10 MB.");
      return;
    }
    setSelectedUpload({ fueling, file });
    setPreview({ title: file.name, url: URL.createObjectURL(file), mimeType: file.type, file, mode: "local" });
  }

  function closePreview() {
    if (preview?.mode === "local") URL.revokeObjectURL(preview.url);
    setPreview(null);
    setSelectedUpload(null);
    setPreviewLoading(false);
  }

  async function viewStoredDocument(document: DocumentRecord) {
    if (!supabase) return;
    setPreviewLoading(true); setError("");
    const { data, error: signedError } = await supabase.storage.from("fleet-documents").createSignedUrl(document.storage_path, 60);
    setPreviewLoading(false);
    if (signedError || !data?.signedUrl) {
      setError("Não foi possível abrir o comprovante. Verifique sua conexão ou tente novamente.");
      return;
    }
    setPreview({ title: document.file_name, url: data.signedUrl, mimeType: document.mime_type, mode: "stored" });
  }

  async function confirmUpload() {
    if (!selectedUpload) return;
    const { fueling, file } = selectedUpload;
    setUploadingId(fueling.id); setError(""); setNotice("");
    const result = await onUpload(fueling.id, file);
    setUploadingId("");
    if (result.error) {
      setError(`Não foi possível enviar o comprovante: ${result.error.message}`);
      return;
    }
    closePreview();
    setSelectedUpload(null);
    setNotice("Comprovante enviado. Status: aguardando verificação da Prefeitura.");
    await onRefresh();
  }

  const getDocument = (fuelingId: string) => latestDocuments.get(fuelingId);
  const isLocked = (document?: DocumentRecord) => Boolean(document && document.document_status !== "REJEITADO" && document.document_status !== "SUBSTITUIDO");
  const statusFor = (document?: DocumentRecord) => document ? statusMeta[document.document_status] || { label: document.document_status, tone: "neutral" } : { label: "Pendente de comprovante", tone: "warning" };

  return <section className="supplier-document-view">
    <div className="supplier-page-heading supplier-records-heading">
      <div><span>DOCUMENTAÇÃO DO POSTO</span><h2>Comprovantes</h2><p>Acompanhe o envio e a verificação dos comprovantes dos abastecimentos deste posto.</p></div>
    </div>
    <div className="supplier-record-filters">
      <div className="supplier-record-filter-heading"><div><Filter size={15} /><strong>Filtros</strong><span>{filteredFuelings.length.toLocaleString("pt-BR")} resultado(s)</span></div><button className="supplier-reset-filters" type="button" onClick={resetFilters} disabled={activeFilterCount === 0}><RotateCcw size={13} /> Limpar filtros</button></div>
      <div className="supplier-record-filter-grid supplier-document-filter-grid">
        <label className="supplier-date-filter">Data do abastecimento
          <select value={dateMode} onChange={(event) => setDateMode(event.target.value as DateMode)} aria-label="Tipo de filtro de data"><option value="specific">Data específica</option><option value="period">Período</option></select>
          {dateMode === "specific" ? <input type="date" value={specificDate} onChange={(event) => setSpecificDate(event.target.value)} /> : <span className="supplier-date-range"><input aria-label="Data inicial" type="date" value={dateStart} onChange={(event) => setDateStart(event.target.value)} /><span>até</span><input aria-label="Data final" type="date" value={dateEnd} onChange={(event) => setDateEnd(event.target.value)} /></span>}
        </label>
        <label>Veículo<select value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}><option value="">Todos os veículos</option>{vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.placa} — {[vehicle.marca, vehicle.modelo].filter(Boolean).join(" ")}</option>)}</select></label>
        <label>Tipo de combustível<select value={fuelTypeId} onChange={(event) => setFuelTypeId(event.target.value)}><option value="">Todos os combustíveis</option>{fuelTypes.map((fuel) => <option key={fuel.id} value={fuel.id}>{fuel.nome}{fuel.sigla ? ` (${fuel.sigla})` : ""}</option>)}</select></label>
        <label>Situação do comprovante<select value={documentFilter} onChange={(event) => setDocumentFilter(event.target.value as DocumentFilter)}><option value="NAO_CONFERIDOS">Não conferidos (padrão)</option><option value="SEM_COMPROVANTE">Sem comprovante</option><option value="AGUARDANDO">Aguardando verificação</option><option value="REJEITADO">Rejeitado</option><option value="CONFERIDO">Conferido</option></select></label>
      </div>
    </div>
    {(notice || error) && <div className={`supplier-message ${error ? "error" : "success"}`} role={error ? "alert" : "status"}>{error ? <AlertCircle size={14} /> : <BadgeCheck size={14} />}{error || notice}</div>}
    <div className="supplier-document-grid supplier-document-grid-modern">
      {loading ? <div className="supplier-loading">Carregando comprovantes deste posto…</div> : filteredFuelings.length ? filteredFuelings.map((fueling) => {
        const document = getDocument(fueling.id);
        const meta = statusFor(document);
        const locked = isLocked(document);
        const vehicle = fueling.vehicles?.placa || vehicles.find((item) => item.id === fueling.vehicle_id)?.placa || "Veículo não identificado";
        const fuelName = fueling.fuel_type?.nome || fuelTypes.find((item) => item.id === fueling.fuel_type_id)?.nome || "Combustível";
        return <article className="supplier-document-card" key={fueling.id}>
          <div className="supplier-document-card-main"><span className="supplier-document-card-icon"><FileCheck2 size={19} /></span><div className="supplier-document-card-details"><strong>{vehicle}</strong><small>{fueling.vehicles?.modelo || ""}{fueling.vehicles?.modelo ? " · " : ""}{fuelName} · {Number(fueling.liters).toLocaleString("pt-BR")} L</small><small><CalendarDays size={12} /> {dateTime(fueling.performed_at)}</small>{document && <small className="supplier-document-filename"><FileText size={12} /> {document.file_name} · enviado em {dateTime(document.uploaded_at)}</small>}{document?.document_status === "REJEITADO" && document.rejection_reason && <small className="supplier-rejection-reason">Motivo: {document.rejection_reason}</small>}</div></div>
          <span className={`supplier-status supplier-status-${meta.tone}`}><span className="supplier-status-dot" />{meta.label}</span>
          <div className="supplier-document-card-actions">
            {document && <button className="supplier-secondary" type="button" onClick={() => void viewStoredDocument(document)} disabled={previewLoading}><Eye size={14} />{previewLoading ? "Abrindo…" : "Ver comprovante"}</button>}
            {!locked && <label className="supplier-upload supplier-upload-modern"><Upload size={14} />{uploadingId === fueling.id ? "Enviando…" : document?.document_status === "REJEITADO" ? "Substituir comprovante" : "Selecionar comprovante"}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={uploadingId === fueling.id} onChange={(event) => { selectFile(fueling, event.target.files?.[0]); event.currentTarget.value = ""; }} /></label>}
            {locked && <span className="supplier-document-locked"><ShieldCheck size={13} /> Envio bloqueado</span>}
          </div>
        </article>;
      }) : <div className="supplier-empty supplier-document-empty"><FileCheck2 size={25} /><strong>{fuelings.length ? "Nenhum comprovante corresponde aos filtros" : "Nenhum comprovante pendente"}</strong><p>{fuelings.length ? "Ajuste os filtros ou consulte os registros já conferidos." : "Quando houver abastecimentos do posto, os comprovantes aparecerão aqui."}</p></div>}
      {hasMore && !loading && <div className="supplier-load-more supplier-document-load-more"><span>Exibindo {fuelings.length.toLocaleString("pt-BR")} abastecimento(s) carregado(s) deste posto.</span><button className="supplier-secondary" type="button" onClick={onLoadMore} disabled={loadingMore}>{loadingMore ? "Carregando…" : "Carregar mais 100"}<Clock3 size={14} /></button></div>}
    </div>
    {preview && <div className="supplier-preview-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && preview.mode === "stored") closePreview(); }}>
      <section className="supplier-preview-dialog" role="dialog" aria-modal="true" aria-labelledby="supplier-preview-title">
        <header className="supplier-preview-header"><div><span>INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS</span><h3 id="supplier-preview-title">{preview.mode === "local" ? "Conferir comprovante antes do envio" : "Pré-visualização do comprovante"}</h3><p>{preview.title}</p></div><button className="supplier-preview-close" type="button" onClick={closePreview} aria-label="Fechar"><X size={19} /></button></header>
        <div className="supplier-preview-viewer">{preview.mimeType === "application/pdf" ? <iframe title={`Pré-visualização de ${preview.title}`} src={preview.url} /> : <img src={preview.url} alt={`Pré-visualização de ${preview.title}`} />}</div>
        {preview.mode === "local" && error && <div className="supplier-preview-inline-error" role="alert"><AlertCircle size={14} />{error}</div>}
        {preview.mode === "local" && selectedUpload && <div className="supplier-confirm-note"><ShieldCheck size={17} /><span>Confira se o documento está legível e corresponde ao abastecimento de <strong>{selectedUpload.fueling.vehicles?.placa || "veículo selecionado"}</strong>. Só enviaremos após sua confirmação.</span></div>}
        <footer className="supplier-preview-actions">{preview.mode === "local" ? <><button className="supplier-secondary" type="button" onClick={closePreview} disabled={Boolean(uploadingId)}>Voltar e revisar</button><button className="supplier-primary" type="button" onClick={() => void confirmUpload()} disabled={Boolean(uploadingId)}><Upload size={15} />{uploadingId ? "Enviando para verificação…" : "Confirmar e enviar para verificação"}</button></> : <button className="supplier-primary" type="button" onClick={closePreview}><Check size={15} /> Fechar pré-visualização</button>}</footer>
      </section>
    </div>}
  </section>;
}
