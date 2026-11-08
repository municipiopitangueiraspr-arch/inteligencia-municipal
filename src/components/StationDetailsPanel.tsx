import { useEffect, useState } from "react";
import { Building2, ExternalLink, FileText, Upload, Users, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import type { Station } from "./FleetResources";
import "./StationDetailsPanel.css";

type RecordRow = Record<string, unknown>;
type SignedRecord = RecordRow & { signedUrl?: string | null };
const documentTypes = ["CONTRATO_CREDENCIAMENTO", "ADITIVO", "OUTRO"] as const;
type ContractDocumentType = (typeof documentTypes)[number];
const documentTypeLabel: Record<ContractDocumentType, string> = {
  CONTRATO_CREDENCIAMENTO: "Contrato de credenciamento",
  ADITIVO: "Aditivo",
  OUTRO: "Outro",
};
const closureStatusLabel: Record<string, string> = {
  PENDENTE: "Pendente",
  CONFERIDO: "Conferido",
  COM_DIVERGENCIA: "Com divergência",
};
const closureProgressLabel: Record<string, string> = {
  ABERTO: "Aberto",
  SOLICITADO: "Solicitado",
  EM_ANALISE: "Em análise",
  CONFERIDO: "Conferido",
  FECHADO: "Fechado",
  REABERTO: "Reaberto",
};
function text(value: unknown, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}
function money(value: unknown) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0));
}
function dateTime(value: unknown) {
  if (!value) return "—";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}
function isContractType(value: unknown): value is ContractDocumentType {
  return typeof value === "string" && documentTypes.includes(value as ContractDocumentType);
}
function effectiveStationLabel(station: Station) {
  if (station.status !== "ATIVO") return station.status === "PENDENTE" ? "Em análise" : station.status.replaceAll("_", " ");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  if (station.credenciamento_ends_at && station.credenciamento_ends_at.slice(0, 10) < today) return "Credenciamento encerrado";
  if (!station.credenciamento_started_at || station.credenciamento_started_at.slice(0, 10) > today) return "Em análise · vigência não iniciada";
  return "Ativo";
}
function docType(record: RecordRow): ContractDocumentType {
  if (isContractType(record.document_type)) return record.document_type;
  const notes = String(record.notes || "");
  const tagged = notes.match(/\[Tipo: (CONTRATO_CREDENCIAMENTO|ADITIVO|OUTRO)\]/)?.[1];
  return isContractType(tagged) ? tagged : "OUTRO";
}

function auditChanges(record: RecordRow) {
  const before = (record.old_data && typeof record.old_data === "object" ? record.old_data : {}) as RecordRow;
  const after = (record.new_data && typeof record.new_data === "object" ? record.new_data : {}) as RecordRow;
  const labels: Record<string, string> = {
    status: "Situação", credenciamento_started_at: "Início da vigência", credenciamento_ends_at: "Fim da vigência",
    secondary_users_authorized: "Autorização de usuários secundários", role: "Perfil", ativo: "Usuário ativo",
    is_primary_contact: "Contato principal", document_type: "Tipo de documento", file_name: "Arquivo",
    version: "Versão", is_current: "Documento vigente", review_notes: "Observação da análise",
  };
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => labels[key] && JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => `${labels[key]}: ${text(before[key], "—")} → ${text(after[key], "—")}`);
}

export function StationDetailsPanel({ station, onClose }: { station: Station; onClose: () => void }) {
  const [members, setMembers] = useState<RecordRow[]>([]);
  const [fuelings, setFuelings] = useState<RecordRow[]>([]);
  const [fuelingDocuments, setFuelingDocuments] = useState<SignedRecord[]>([]);
  const [closures, setClosures] = useState<RecordRow[]>([]);
  const [closureDocuments, setClosureDocuments] = useState<SignedRecord[]>([]);
  const [contractDocuments, setContractDocuments] = useState<SignedRecord[]>([]);
  const [audit, setAudit] = useState<RecordRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [docType, setDocType] = useState<ContractDocumentType>("CONTRATO_CREDENCIAMENTO");
  const [notes, setNotes] = useState("");

  async function withSignedUrls(rows: RecordRow[]): Promise<SignedRecord[]> {
    if (!supabase) return rows;
    return Promise.all(rows.map(async (row) => {
      const path = typeof row.storage_path === "string" ? row.storage_path : "";
      if (!path) return { ...row, signedUrl: null };
      const result = await supabase!.storage.from("fleet-documents").createSignedUrl(path, 600);
      return { ...row, signedUrl: result.error ? null : result.data.signedUrl };
    }));
  }

  async function load() {
    if (!supabase) { setBusy(false); setError("O serviço de dados não está disponível."); return; }
    setBusy(true);
    setError("");
    const [membersResult, fuelingsResult, checksResult, contractResult, auditResult] = await Promise.all([
      supabase.rpc("fleet_station_member_directory", { p_station_id: station.id }),
      supabase.from("fleet_fuelings").select("id,performed_at,submitted_at,liters,total_amount,status,station_receipt_number,vehicle_id").eq("station_id", station.id).order("performed_at", { ascending: false }).order("id").limit(1000),
      supabase.from("fleet_monthly_closure_station_checks").select("id,closure_id,station_id,registered_fueling_count,registered_liters,registered_amount,invoiced_amount,divergence_amount,status,closure_status,requested_at,checked_at").eq("station_id", station.id).order("requested_at", { ascending: false }).limit(1000),
      supabase.from("fleet_station_documents").select("*").eq("station_id", station.id).order("created_at", { ascending: false }).limit(500),
      supabase.from("fleet_station_audit_log").select("id,entity_type,entity_id,action,actor_usuario_id,occurred_at,old_data,new_data").eq("station_id", station.id).order("occurred_at", { ascending: false }).limit(500),
    ]);
    const failures = [membersResult.error, fuelingsResult.error, checksResult.error, contractResult.error, auditResult.error].filter(Boolean);
    if (failures.length) {
      setError("Algumas seções da ficha não puderam ser carregadas com as permissões disponíveis.");
      setBusy(false);
      return;
    }
    const fuelingRows = (fuelingsResult.data || []) as unknown as RecordRow[];
    const checkRows = (checksResult.data || []) as unknown as RecordRow[];
    const fuelingIds = fuelingRows.map((row) => String(row.id));
    const closureIds = [...new Set(checkRows.map((row) => String(row.closure_id)).filter(Boolean))];
    const [fuelingDocsResult, closureDocsResult, monthsResult] = await Promise.all([
      fuelingIds.length ? supabase.from("fleet_fueling_documents").select("id,fueling_id,file_name,storage_path,mime_type,document_status,uploaded_at,is_current,rejection_reason").in("fueling_id", fuelingIds).order("uploaded_at", { ascending: false }).limit(2000) : Promise.resolve({ data: [], error: null }),
      supabase.from("fleet_monthly_closure_documents").select("*").eq("station_id", station.id).order("uploaded_at", { ascending: false }).limit(1000),
      closureIds.length ? supabase.from("fleet_monthly_closures").select("id,reference_year,reference_month,status").in("id", closureIds) : Promise.resolve({ data: [], error: null }),
    ]);
    const monthById = new Map(((monthsResult.data || []) as unknown as RecordRow[]).map((month) => [String(month.id), month]));
    setMembers((membersResult.data || []) as unknown as RecordRow[]);
    setAudit((auditResult.data || []) as unknown as RecordRow[]);
    setFuelings(fuelingRows);
    setClosures(checkRows.map((row) => ({ ...row, month: monthById.get(String(row.closure_id)) || null })));
    setContractDocuments(await withSignedUrls((contractResult.data || []) as unknown as RecordRow[]));
    setFuelingDocuments(await withSignedUrls((fuelingDocsResult.data || []) as unknown as RecordRow[]));
    setClosureDocuments(await withSignedUrls((closureDocsResult.data || []) as unknown as RecordRow[]));
    if (fuelingDocsResult.error || closureDocsResult.error || monthsResult.error) setError("Os dados principais foram carregados, mas parte dos comprovantes ou competências não está disponível.");
    setBusy(false);
  }

  useEffect(() => { void load(); }, [station.id]);

  async function uploadContract(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;
    const form = event.currentTarget;
    const file = new FormData(form).get("contract_file");
    if (!(file instanceof File) || file.size === 0) { setError("Selecione um arquivo para enviar."); return; }
    if (!(["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type))) { setError("Formato permitido: PDF, JPG, PNG ou WEBP."); return; }
    if (file.size > 20 * 1024 * 1024) { setError("O arquivo deve ter no máximo 20 MB."); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const municipality = await supabase.rpc("fleet_current_municipio_id");
      if (municipality.error || !municipality.data) throw new Error("Não foi possível identificar o município para armazenar o arquivo.");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${municipality.data}/stations/${station.id}/${crypto.randomUUID()}-${safeName}`;
      const uploaded = await supabase.storage.from("fleet-documents").upload(path, file, { contentType: file.type, upsert: false });
      if (uploaded.error) throw uploaded.error;
      const documentNotes = notes.trim() || null;
      const registered = await supabase.rpc("fleet_register_station_document", {
        p_station_id: station.id,
        p_file_name: file.name,
        p_storage_path: path,
        p_mime_type: file.type,
        p_file_size_bytes: file.size,
        p_notes: documentNotes,
        p_document_type: docType,
      });
      if (registered.error) {
        await supabase.storage.from("fleet-documents").remove([path]);
        throw registered.error;
      }
      setNotice("Documento enviado e registrado.");
      setNotes("");
      form.reset();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível registrar o documento contratual.");
    } finally { setSaving(false); }
  }

  const address = [station.logradouro, station.numero, station.complemento, station.bairro, station.cidade, station.uf].filter(Boolean).join(", ") || station.endereco;
  return <div className="fleet-modal-backdrop station-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="fleet-modal station-detail-modal" role="dialog" aria-modal="true" aria-labelledby="station-detail-title">
      <div className="fleet-modal-heading">
        <div><span className="fleet-kicker">FICHA GERENCIAL DO ESTABELECIMENTO</span><h2 id="station-detail-title">{station.nome_fantasia_snapshot || station.razao_social_snapshot}</h2><p className="fleet-members-subtitle">CNPJ {station.cnpj_snapshot}</p></div>
        <button type="button" className="fleet-close" onClick={onClose} aria-label="Fechar ficha"><X size={18} /></button>
      </div>
      {error && <div className="fleet-inline-error" role="alert">{error}</div>}
      {notice && <div className="station-detail-success" role="status">{notice}</div>}
      {busy ? <div className="fleet-loading">Carregando ficha e histórico…</div> : <div className="station-detail-content">
        <section className="station-detail-section">
          <h3><Building2 size={16} /> Cadastro e contrato</h3>
          <dl className="station-detail-grid">
            <div><dt>Razão social</dt><dd>{text(station.razao_social_snapshot)}</dd></div><div><dt>Nome fantasia</dt><dd>{text(station.nome_fantasia_snapshot)}</dd></div>
            <div><dt>CNPJ</dt><dd>{text(station.cnpj_snapshot)}</dd></div><div><dt>Inscrição estadual</dt><dd>{text(station.inscricao_estadual)}</dd></div>
            <div><dt>Telefone</dt><dd>{text(station.telefone || station.representante_telefone)}</dd></div><div><dt>E-mail</dt><dd>{text(station.email || station.representante_email)}</dd></div>
            <div className="wide"><dt>Endereço</dt><dd>{text(address)}</dd></div><div><dt>Contrato / instrumento</dt><dd>{text(station.contract_number)}</dd></div>
            <div><dt>Vigência</dt><dd>{text(station.credenciamento_started_at)} – {text(station.credenciamento_ends_at)}</dd></div>
            <div><dt>Status</dt><dd>{effectiveStationLabel(station)}</dd></div>
            <div><dt>Representante legal · contato principal</dt><dd>{station.representante_nome} · {text(station.representante_email)} · {text(station.representante_telefone)}</dd></div>
            <div><dt>Usuários secundários autorizados</dt><dd>{station.secondary_users_authorized ? "Sim" : "Não"}</dd></div>
            <div className="wide"><dt>Observações</dt><dd>{text(station.notes)}</dd></div>
          </dl>
        </section>
        <section className="station-detail-section">
          <h3><Users size={16} /> Usuários vinculados ({members.length})</h3>
          {members.length ? <div className="station-detail-list">{members.map((member, index) => <article key={String(member.id || index)}><strong>{text(member.nome, "Usuário")}</strong><span>{text(member.email)}</span><small>{text(member.role).replaceAll("_", " ")} · {member.is_primary_contact ? "Contato principal" : "Secundário"} · {member.ativo ? "Ativo" : "Inativo"}</small></article>)}</div> : <p className="station-detail-empty">Nenhum vínculo disponível.</p>}
        </section>
        <section className="station-detail-section">
          <h3><FileText size={16} /> Documentos contratuais ({contractDocuments.length})</h3>
          <form className="station-contract-upload" onSubmit={(event) => void uploadContract(event)}>
            <div className="station-detail-grid">
              <label>Tipo de documento<select value={docType} onChange={(event) => setDocType(event.target.value as ContractDocumentType)}>{documentTypes.map((type) => <option value={type} key={type}>{documentTypeLabel[type]}</option>)}</select></label>
              <label>Arquivo (PDF, JPG, PNG ou WEBP · até 20 MB)<input name="contract_file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required /></label>
              <label className="wide">Observações<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} /></label>
            </div>
            <button type="submit" className="fleet-primary-button" disabled={saving}><Upload size={15} /> {saving ? "Enviando…" : "Enviar documento"}</button>
          </form>
          <DocumentList records={contractDocuments} showCategory />
        </section>
        <section className="station-detail-section">
          <h3><FileText size={16} /> Abastecimentos ({fuelings.length})</h3>
          <div className="station-detail-table-wrap"><table className="fleet-table station-detail-table"><thead><tr><th>Data real</th><th>Litros</th><th>Valor</th><th>Status</th><th>Comprovantes</th></tr></thead><tbody>{fuelings.map((fueling) => <tr key={String(fueling.id)}><td>{dateTime(fueling.performed_at)}</td><td>{text(fueling.liters)}</td><td>{money(fueling.total_amount)}</td><td>{text(fueling.status).replaceAll("_", " ")}</td><td><DocumentList records={fuelingDocuments.filter((doc) => String(doc.fueling_id) === String(fueling.id))} /></td></tr>)}</tbody></table></div>
          {!fuelings.length && <p className="station-detail-empty">Nenhum abastecimento registrado.</p>}
        </section>
        <section className="station-detail-section">
          <h3><FileText size={16} /> Fechamentos mensais ({closures.length})</h3>
          <div className="station-detail-table-wrap"><table className="fleet-table station-detail-table"><thead><tr><th>Competência</th><th>Abastecimentos</th><th>Litros</th><th>Registrado</th><th>Faturado</th><th>Divergência</th><th>Status</th><th>Solicitado / conferido</th><th>Documentos</th></tr></thead><tbody>{closures.map((check, index) => { const month = check.month as RecordRow | null; const monthLabel = month ? `${text(month.reference_year)}-${String(month.reference_month).padStart(2, "0")}` : "—"; return <tr key={String(check.id || index)}><td>{monthLabel}</td><td>{text(check.registered_fueling_count)}</td><td>{text(check.registered_liters)}</td><td>{money(check.registered_amount)}</td><td>{money(check.invoiced_amount)}</td><td>{money(check.divergence_amount)}</td><td>{closureStatusLabel[String(check.status)] || text(check.status)} · {closureProgressLabel[String(check.closure_status)] || text(check.closure_status)}</td><td>{dateTime(check.requested_at)} / {dateTime(check.checked_at)}</td><td><DocumentList records={closureDocuments.filter((doc) => String(doc.station_check_id) === String(check.id))} /></td></tr>; })}</tbody></table></div>
          {!closures.length && <p className="station-detail-empty">Nenhum fechamento encontrado.</p>}
        </section>
        <section className="station-detail-section">
          <h3><FileText size={16} /> Histórico de alterações ({audit.length})</h3>
          {audit.length ? <div className="station-audit-list">{audit.map((record) => {
            const changes = auditChanges(record);
            return <article key={String(record.id)}><div><strong>{text(record.entity_type).replaceAll("_", " ")} · {text(record.action).toLocaleLowerCase("pt-BR")}</strong><small>{dateTime(record.occurred_at)} · {record.actor_usuario_id ? `usuário #${record.actor_usuario_id}` : "ator técnico do sistema"}</small></div>{changes.length ? <ul>{changes.map((change) => <li key={change}>{change}</li>)}</ul> : <small>Registro de histórico preservado.</small>}</article>;
          })}</div> : <p className="station-detail-empty">Nenhuma alteração auditada foi encontrada.</p>}
        </section>
      </div>}
      <div className="fleet-modal-actions"><button type="button" className="fleet-secondary-button" onClick={onClose}>Fechar ficha</button></div>
    </section>
  </div>;
}

function DocumentList({ records, typeFor, showCategory = false }: { records: SignedRecord[]; typeFor?: (record: RecordRow) => ContractDocumentType; showCategory?: boolean }) {
  if (!records.length) return <span className="station-document-none">—</span>;
  return <div className="station-document-list">{records.map((record, index) => <article key={String(record.id || index)}><FileText size={14} /><span><strong>{text(record.file_name, "Documento")}</strong>{showCategory && <small>{documentTypeLabel[typeFor ? typeFor(record) : docType(record)]}</small>}</span>{record.signedUrl ? <a href={record.signedUrl} target="_blank" rel="noreferrer" aria-label={`Abrir ${String(record.file_name || "documento")}`}><ExternalLink size={14} /> Abrir</a> : <small>Arquivo indisponível</small>}</article>)}</div>;
}
