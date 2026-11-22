import { useMemo, useState } from "react";
import {
  AlertCircle,
  Archive,
  ArrowDown,
  ArrowUp,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronLeft,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Plus,
  Printer,
  Save,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import type {
  QuestionnaireAudience,
  QuestionnaireQuestionType,
  QuestionnaireResponse,
  SharedQuestionnaire,
  SharedQuestionnairesDataset,
} from "../data/sharedQuestionnaires";
import "./SharedQuestionnairesModule.css";

type Props = {
  dataset: SharedQuestionnairesDataset;
  onChange: (update: (current: SharedQuestionnairesDataset) => SharedQuestionnairesDataset) => void;
  onBack?: () => void;
};

type QuestionType = QuestionnaireQuestionType;
type EditorQuestion = { id: string; label: string; type: QuestionType; required: boolean; helpText: string; options?: string[]; validation?: { min?: number; max?: number; minLength?: number; maxLength?: number } };
type EditorSection = { id: string; title: string; description: string; questions: EditorQuestion[] };
type EditorDraft = { id: string; title: string; subtitle: string; description: string; audience: QuestionnaireAudience; version: number; status: SharedQuestionnaire["status"]; sections: EditorSection[] };
type StatusFilter = "ALL" | "Rascunho" | "Ativo" | "Inativo";

const audiences: QuestionnaireAudience[] = ["Saúde", "Assistência Social", "Educação", "Compartilhado"];
const typeLabels: Record<QuestionType, string> = {
  short_text: "Texto curto", long_text: "Texto longo", phone: "Telefone", number: "Número", currency: "Moeda", date: "Data", yes_no: "Sim / Não", single_choice: "Escolha única", multiple_choice: "Múltipla escolha", signature: "Assinatura",
};

const makeQuestion = (): EditorQuestion => ({ id: `question-${Date.now()}-${Math.random()}`, label: "Nova pergunta", type: "short_text", required: false, helpText: "", options: undefined });
const makeSection = (): EditorSection => ({ id: `section-${Date.now()}-${Math.random()}`, title: "Nova seção", description: "", questions: [makeQuestion()] });
const statusLabel = (status: SharedQuestionnaire["status"]) => status === "Ativo" ? "Ativo" : status === "Inativo" ? "Inativo" : "Rascunho";
const statusClass = (status: SharedQuestionnaire["status"]) => status === "Ativo" ? "active" : status === "Inativo" ? "inactive" : "draft";
const formatDate = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);

function toEditorDraft(questionnaire: SharedQuestionnaire): EditorDraft {
  const sections = questionnaire.formSchema?.sections?.length
    ? questionnaire.formSchema.sections.map((section) => ({
        ...section,
        description: section.description ?? "",
        questions: section.questions.map((question) => ({ ...question, helpText: question.helpText ?? "" })),
      }))
    : [{ id: `section-${questionnaire.id}`, title: "Perguntas", description: "", questions: questionnaire.questions.map((question) => ({ id: question.id, label: question.label, type: question.kind === "choice" ? "single_choice" as const : "short_text" as const, required: false, helpText: "", options: question.options })) }];
  return {
    id: questionnaire.id, title: questionnaire.title, subtitle: questionnaire.subtitle, description: questionnaire.subtitle,
    audience: questionnaire.audience, version: questionnaire.version, status: questionnaire.status,
    sections,
  };
}

export default function SharedQuestionnairesModule({ dataset, onChange, onBack }: Props) {
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [responsesFor, setResponsesFor] = useState<SharedQuestionnaire | null>(null);
  const [applying, setApplying] = useState<SharedQuestionnaire | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [noticeTone, setNoticeTone] = useState<"success" | "error">("success");

  const active = dataset.questionnaires.filter((item) => item.status === "Ativo").length;
  const visibleQuestionnaires = useMemo(() => dataset.questionnaires.filter((item) => {
    const matchesStatus = filter === "ALL" || item.status === filter;
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return matchesStatus && (!query || `${item.title} ${item.subtitle} ${item.audience}`.toLocaleLowerCase("pt-BR").includes(query));
  }), [dataset.questionnaires, filter, search]);

  const updateDraft = (update: (current: EditorDraft) => EditorDraft) => { setDraft((current) => current ? update(current) : current); setDirty(true); setNotice(""); };
  const startNew = () => { setResponsesFor(null); setDraft({ id: "", title: "", subtitle: "", description: "", audience: "Saúde", version: 1, status: "Rascunho", sections: [makeSection()] }); setIsNew(true); setDirty(true); setShowPreview(false); };
  const selectQuestionnaire = (questionnaire: SharedQuestionnaire) => { setResponsesFor(null); setDraft(toEditorDraft(questionnaire)); setIsNew(false); setDirty(false); setShowPreview(false); setNotice(""); };
  const updateSection = (sectionId: string, update: (section: EditorSection) => EditorSection) => updateDraft((current) => ({ ...current, sections: current.sections.map((section) => section.id === sectionId ? update(section) : section) }));
  const updateQuestion = (sectionId: string, questionId: string, update: (question: EditorQuestion) => EditorQuestion) => updateSection(sectionId, (section) => ({ ...section, questions: section.questions.map((question) => question.id === questionId ? update(question) : question) }));
  const moveItem = <T,>(items: T[], index: number, offset: -1 | 1) => { const target = index + offset; if (target < 0 || target >= items.length) return items; const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; };

  const saveQuestionnaire = () => {
    if (!draft || !draft.title.trim()) { setNoticeTone("error"); setNotice("Informe o título do questionário."); return; }
    if (!draft.sections.length || !draft.sections.some((section) => section.questions.some((question) => question.label.trim()))) { setNoticeTone("error"); setNotice("Adicione pelo menos uma pergunta ao questionário."); return; }
    const questions = draft.sections.flatMap((section) => section.questions.filter((question) => question.label.trim()).map((question) => ({ id: question.id, label: question.label.trim(), kind: ["single_choice", "multiple_choice", "yes_no"].includes(question.type) ? "choice" as const : "text" as const, options: question.options?.filter(Boolean) })));
    const formSchema = { sections: draft.sections.filter((section) => section.questions.some((question) => question.label.trim())).map((section) => ({ ...section, title: section.title.trim() || "Sem título", description: section.description.trim(), questions: section.questions.filter((question) => question.label.trim()).map((question) => ({ ...question, label: question.label.trim(), helpText: question.helpText.trim(), options: question.options?.filter(Boolean) })) })) };
    const savedId = draft.id || `SIM-QST-${Date.now()}`;
    const normalized = { id: savedId, title: draft.title.trim(), subtitle: draft.subtitle.trim() || "Questionário para fluxos municipais.", audience: draft.audience, version: draft.version, status: draft.status, questions, formSchema };
    onChange((current) => current.questionnaires.some((item) => item.id === normalized.id)
      ? { ...current, questionnaires: current.questionnaires.map((item) => item.id === normalized.id ? { ...normalized, version: item.version + 1 } : item) }
      : { ...current, questionnaires: [{ ...normalized, version: 1 }, ...current.questionnaires] });
    setDraft((current) => current ? { ...current, id: savedId, version: normalized.version + (isNew ? 0 : 1) } : current);
    setIsNew(false); setDirty(false); setNoticeTone("success"); setNotice("Questionário salvo localmente com sucesso.");
  };

  const changeStatus = () => { if (!draft || isNew) return; onChange((current) => ({ ...current, questionnaires: current.questionnaires.map((item) => item.id === draft.id ? { ...item, status: item.status === "Ativo" ? "Inativo" : "Ativo" } : item) })); setDraft({ ...draft, status: draft.status === "Ativo" ? "Inativo" : "Ativo" }); setDirty(false); setNoticeTone("success"); setNotice(`Questionário ${draft.status === "Ativo" ? "inativado" : "ativado"} e preservado no histórico.`); };
  const addSection = () => updateDraft((current) => ({ ...current, sections: [...current.sections, makeSection()] }));
  const addQuestion = (sectionId: string) => updateSection(sectionId, (section) => ({ ...section, questions: [...section.questions, makeQuestion()] }));
  const changeQuestionType = (sectionId: string, questionId: string, type: QuestionType) => updateQuestion(sectionId, questionId, (question) => ({ ...question, type, options: ["single_choice", "multiple_choice"].includes(type) ? (question.options?.length ? question.options : ["Opção 1"]) : undefined }));
  const openApplication = (questionnaire: SharedQuestionnaire) => { setApplying(questionnaire); setResponsesFor(null); setDraft(null); setShowPreview(false); };

  const saveResponse = (questionnaire: SharedQuestionnaire, status: QuestionnaireResponse["status"], answers: Record<string, string>, context: QuestionnaireResponse["context"]) => {
    const response: QuestionnaireResponse = { id: `SIM-RESP-${Date.now()}`, questionnaireId: questionnaire.id, status, answers, context, updatedAt: new Date().toISOString() };
    onChange((current) => ({ ...current, responses: [response, ...current.responses] }));
    setApplying(null);
    setNoticeTone("success");
    setNotice(status === "Enviado" ? "Resposta enviada e vinculada à versão atual do questionário." : "Rascunho de resposta salvo neste navegador.");
  };

  const exportResponsesXlsx = (questionnaire: SharedQuestionnaire) => {
    const responses = dataset.responses.filter((response) => response.questionnaireId === questionnaire.id);
    const rows = responses.map((response) => ({ ID: response.id, Status: response.status, Atualizado: formatDate(response.updatedAt), Pessoa: response.personId ?? "", Domicílio: response.householdId ?? "", ...questionnaire.questions.reduce<Record<string, string>>((result, question) => ({ ...result, [question.label]: response.answers[question.id] ?? "" }), {}) }));
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: "Este questionário ainda não possui respostas." }]), "Respostas");
    XLSX.writeFile(workbook, `${questionnaire.title.toLocaleLowerCase().replace(/[^a-z0-9]+/gi, "-")}-respostas.xlsx`);
  };
  const printResponsesPdf = (questionnaire: SharedQuestionnaire) => {
    const responses = dataset.responses.filter((response) => response.questionnaireId === questionnaire.id); const headers = ["ID", "Status", "Atualizado", ...questionnaire.questions.map((question) => question.label)]; const rows = responses.map((response) => [response.id, response.status, formatDate(response.updatedAt), ...questionnaire.questions.map((question) => response.answers[question.id] ?? "—")]); const printWindow = window.open("", "_blank", "noopener,noreferrer"); if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Respostas — ${escapeHtml(questionnaire.title)}</title><style>body{font-family:Arial,sans-serif;color:#173247;padding:32px}h1{font-size:22px;margin:0 0 5px}p{color:#647782;font-size:12px;margin:0 0 22px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #d8e3e7;padding:7px;text-align:left;vertical-align:top}th{background:#e8f1f8;color:#165579}</style></head><body><h1>Respostas — ${escapeHtml(questionnaire.title)}</h1><p>Exportação de conferência · ${responses.length} resposta(s) · ${new Date().toLocaleString("pt-BR")}</p><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">Este questionário ainda não possui respostas.</td></tr>`}</tbody></table></body></html>`); printWindow.document.close(); printWindow.focus(); printWindow.print();
  };

  if (applying) return <QuestionnaireApplication questionnaire={applying} onBack={() => setApplying(null)} onSave={(status, answers, context) => saveResponse(applying, status, answers, context)} />;

  if (responsesFor) {
    const responses = dataset.responses.filter((response) => response.questionnaireId === responsesFor.id);
    return <section className="questionnaires-module"><div className="questionnaires-topline"><button className="questionnaires-back" onClick={() => setResponsesFor(null)}><ChevronLeft size={15} /> Questionários</button><span className="questionnaires-mode"><BarChart3 size={14} /> RESPOSTAS</span></div><div className="questionnaires-heading"><div><h2>{responsesFor.title}</h2><p>{responsesFor.subtitle}</p></div><div className="questionnaires-heading-actions"><button className="questionnaires-secondary" onClick={() => printResponsesPdf(responsesFor)}><Printer size={14} /> Exportar PDF</button><button className="questionnaires-primary" onClick={() => exportResponsesXlsx(responsesFor)}><Download size={14} /> Exportar XLSX</button></div></div><div className="questionnaires-response-summary"><strong>{responses.length}</strong><span>respostas registradas neste navegador</span></div><div className="questionnaires-responses-table"><table><thead><tr><th>ID</th><th>Status</th><th>Atualizado</th>{responsesFor.questions.map((question) => <th key={question.id}>{question.label}</th>)}</tr></thead><tbody>{responses.map((response) => <tr key={response.id}><td>{response.id}</td><td><span className="questionnaire-status status-active">{response.status}</span></td><td>{formatDate(response.updatedAt)}</td>{responsesFor.questions.map((question) => <td key={question.id}>{response.answers[question.id] || "—"}</td>)}</tr>)}{!responses.length && <tr><td colSpan={3 + responsesFor.questions.length} className="questionnaires-empty">Ainda não há respostas para este questionário.</td></tr>}</tbody></table></div><div className="questionnaires-note"><FileText size={16} /><span>O PDF abre a impressão do navegador; selecione “Salvar como PDF”.</span></div></section>;
  }

  return <section className="questionnaires-module"><div className="questionnaires-topline"><span className="questionnaires-mode"><Check size={14} /> GESTÃO LOCAL</span><span className="questionnaires-history"><Archive size={13} /> Histórico preservado por inativação</span></div><div className="questionnaires-heading"><div><h2>Questionários</h2><p>Crie formulários como no Google Forms, organize seções e perguntas, visualize uma prévia e acompanhe respostas no navegador.</p></div>{onBack && <button className="questionnaires-secondary" onClick={onBack}>Voltar aos módulos</button>}</div><div className="questionnaires-summary"><div className="summary-blue"><strong>{dataset.questionnaires.length}</strong><span>questionários cadastrados</span></div><div className="summary-cyan"><strong>{active}</strong><span>ativos para aplicação</span></div><div className="summary-amber"><strong>{dataset.questionnaires.filter((item) => item.status === "Inativo").length}</strong><span>inativos no histórico</span></div><div className="summary-violet"><strong>{dataset.responses.length}</strong><span>respostas registradas</span></div></div><div className="questionnaires-toolbar"><div className="questionnaires-filters"><button className={filter === "ALL" ? "selected" : ""} onClick={() => setFilter("ALL")}>Todos <b>{dataset.questionnaires.length}</b></button><button className={filter === "Rascunho" ? "selected" : ""} onClick={() => setFilter("Rascunho")}>Rascunhos <b>{dataset.questionnaires.filter((item) => item.status === "Rascunho").length}</b></button><button className={filter === "Ativo" ? "selected" : ""} onClick={() => setFilter("Ativo")}>Ativos <b>{active}</b></button><button className={filter === "Inativo" ? "selected" : ""} onClick={() => setFilter("Inativo")}>Inativos <b>{dataset.questionnaires.filter((item) => item.status === "Inativo").length}</b></button><label className="questionnaires-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar questionário" /></label></div><button className="questionnaires-primary" onClick={startNew}><FilePlus2 size={15} /> Novo questionário</button></div><div className="questionnaires-content-layout"><aside className="questionnaires-library"><div className="library-heading"><div><span className="questionnaires-mode">BIBLIOTECA</span><h3>Seus questionários</h3></div><span className="library-count">{visibleQuestionnaires.length}</span></div><div className="questionnaire-library-list">{visibleQuestionnaires.map((questionnaire) => <button type="button" key={questionnaire.id} className={`questionnaire-library-item${draft?.id === questionnaire.id && !isNew ? " selected" : ""}`} onClick={() => selectQuestionnaire(questionnaire)}><span className="library-icon"><FileText size={16} /></span><span><strong>{questionnaire.title}</strong><small>{questionnaire.subtitle}</small><em className={`questionnaire-status ${statusClass(questionnaire.status)}`}>{statusLabel(questionnaire.status)}</em></span></button>)}{!visibleQuestionnaires.length && <div className="questionnaires-empty">Nenhum questionário encontrado.</div>}</div></aside><div className="questionnaires-editor-area">{!draft && <div className="questionnaires-empty-state"><span className="empty-state-icon"><FileText size={25} /></span><h3>Comece seu primeiro questionário</h3><p>Crie um formulário com seções, perguntas, validações e pré-visualização.</p><button className="questionnaires-primary" onClick={startNew}><Plus size={15} /> Criar questionário</button></div>}{draft && <><div className="questionnaires-editor-toolbar"><div><span className={`questionnaire-status ${statusClass(draft.status)}`}>{statusLabel(draft.status)}</span><h3>{isNew ? "Novo questionário" : draft.title || "Questionário sem título"}</h3><small>{dirty ? "Alterações não salvas" : `Versão ${draft.version}`}</small></div><div className="editor-toolbar-actions">{!isNew && draft.status === "Ativo" && <button className="questionnaires-apply-button" onClick={() => openApplication(dataset.questionnaires.find((item) => item.id === draft.id)!)}><Send size={14} /> Aplicar</button>}<button className="questionnaires-secondary" onClick={() => setShowPreview((current) => !current)}><Eye size={14} /> {showPreview ? "Fechar prévia" : "Pré-visualizar"}</button>{!isNew && <button className="questionnaires-status-action" onClick={changeStatus}><ShieldCheck size={14} /> {draft.status === "Ativo" ? "Inativar" : "Ativar"}</button>}{dirty && <button className="questionnaires-secondary" onClick={() => { setDraft(isNew ? null : toEditorDraft(dataset.questionnaires.find((item) => item.id === draft.id)!)); setIsNew(false); setDirty(false); }}>Descartar</button>}<button className="questionnaires-primary" onClick={saveQuestionnaire}><Save size={14} /> Salvar questionário</button></div></div><div className={`questionnaires-builder-layout${showPreview ? " with-preview" : ""}`}><div className="questionnaires-builder"><section className="questionnaires-form-card"><div className="form-card-heading"><div><span className="questionnaires-mode">IDENTIFICAÇÃO</span><h3>Informações do questionário</h3></div><FileText size={18} /></div><label>Título do questionário<input value={draft.title} onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Ficha de cadastro domiciliar" /></label><div className="form-two-columns"><label>Subtítulo<input value={draft.subtitle} onChange={(event) => updateDraft((current) => ({ ...current, subtitle: event.target.value }))} placeholder="Complemento ou finalidade" /></label><label>Secretaria ou público<select value={draft.audience} onChange={(event) => updateDraft((current) => ({ ...current, audience: event.target.value as QuestionnaireAudience }))}>{audiences.map((audience) => <option key={audience}>{audience}</option>)}</select></label></div><label>Descrição<textarea value={draft.description} onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Explique quando e por quem este questionário deve ser usado." rows={3} /></label></section><div className="sections-heading"><div><span className="questionnaires-mode">ESTRUTURA</span><h3>Seções e perguntas</h3><small>{draft.sections.length} seção(ões) · {draft.sections.reduce((total, section) => total + section.questions.length, 0)} pergunta(s)</small></div><button className="questionnaires-secondary" onClick={addSection}><Plus size={14} /> Adicionar seção</button></div>{draft.sections.map((section, sectionIndex) => <section className="questionnaires-section-card" key={section.id}><div className="section-top"><span className="section-number">{String(sectionIndex + 1).padStart(2, "0")}</span><div className="section-fields"><label>Título da seção<input value={section.title} onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))} /></label><label>Instruções<textarea value={section.description} onChange={(event) => updateSection(section.id, (current) => ({ ...current, description: event.target.value }))} placeholder="Opcional" rows={2} /></label></div><div className="reorder-actions"><button disabled={sectionIndex === 0} onClick={() => updateDraft((current) => ({ ...current, sections: moveItem(current.sections, sectionIndex, -1) }))}><ArrowUp size={14} /></button><button disabled={sectionIndex === draft.sections.length - 1} onClick={() => updateDraft((current) => ({ ...current, sections: moveItem(current.sections, sectionIndex, 1) }))}><ArrowDown size={14} /></button><button disabled={draft.sections.length === 1} onClick={() => updateDraft((current) => ({ ...current, sections: current.sections.filter((item) => item.id !== section.id) }))}><Trash2 size={14} /></button></div></div><div className="questions-list">{section.questions.map((question, questionIndex) => <QuestionEditor key={question.id} question={question} index={questionIndex} total={section.questions.length} onUpdate={(update) => updateQuestion(section.id, question.id, update)} onMove={(offset) => updateSection(section.id, (current) => ({ ...current, questions: moveItem(current.questions, questionIndex, offset) }))} onRemove={() => updateSection(section.id, (current) => ({ ...current, questions: current.questions.filter((item) => item.id !== question.id) }))} onTypeChange={(type) => changeQuestionType(section.id, question.id, type)} />)}</div><button className="add-question-button" onClick={() => addQuestion(section.id)}><Plus size={14} /> Adicionar pergunta</button></section>)}</div>{showPreview && <QuestionnairePreview draft={draft} onClose={() => setShowPreview(false)} />}</div></>}</div></div>{notice && <div className={`questionnaires-notice ${noticeTone}`}>{noticeTone === "error" ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}<span>{notice}</span><button onClick={() => setNotice("")}><X size={14} /></button></div>}</section>;
}

function QuestionEditor({ question, index, total, onUpdate, onMove, onRemove, onTypeChange }: { question: EditorQuestion; index: number; total: number; onUpdate: (update: (current: EditorQuestion) => EditorQuestion) => void; onMove: (offset: -1 | 1) => void; onRemove: () => void; onTypeChange: (type: QuestionType) => void }) {
  const choice = question.type === "single_choice" || question.type === "multiple_choice";
  return <article className="question-editor-card"><div className="question-top"><span>Pergunta {index + 1}</span><div className="reorder-actions"><button disabled={index === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></button><button disabled={index === total - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></button><button onClick={onRemove}><Trash2 size={14} /></button></div></div><label>Texto da pergunta<textarea value={question.label} onChange={(event) => onUpdate((current) => ({ ...current, label: event.target.value }))} rows={2} /></label><div className="question-settings"><label>Tipo de resposta<select value={question.type} onChange={(event) => onTypeChange(event.target.value as QuestionType)}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Texto de ajuda<input value={question.helpText} onChange={(event) => onUpdate((current) => ({ ...current, helpText: event.target.value }))} placeholder="Opcional" /></label></div><label className="required-toggle"><input type="checkbox" checked={question.required} onChange={(event) => onUpdate((current) => ({ ...current, required: event.target.checked }))} /><span><strong>Resposta obrigatória</strong><small>O preenchimento será exigido na aplicação.</small></span></label>{choice && <div className="options-editor"><strong>Opções de resposta</strong>{(question.options ?? []).map((option, optionIndex) => <div className="option-row" key={`${question.id}-${optionIndex}`}><span>{String.fromCharCode(65 + optionIndex)}</span><input value={option} onChange={(event) => onUpdate((current) => ({ ...current, options: (current.options ?? []).map((item, index) => index === optionIndex ? event.target.value : item) }))} /><button disabled={(question.options ?? []).length < 2} onClick={() => onUpdate((current) => ({ ...current, options: (current.options ?? []).filter((_, index) => index !== optionIndex) }))}><X size={13} /></button></div>)}<button className="text-action" onClick={() => onUpdate((current) => ({ ...current, options: [...(current.options ?? []), `Opção ${(current.options ?? []).length + 1}`] }))}><Plus size={13} /> Adicionar opção</button></div>}</article>;
}

function QuestionnairePreview({ draft, onClose }: { draft: EditorDraft; onClose: () => void }) {
  return <aside className="questionnaire-preview-panel"><div className="preview-heading"><span><Eye size={15} /> Pré-visualização</span><button onClick={onClose}><X size={15} /></button></div><div className="preview-note"><ShieldCheck size={14} /> Prévia visual. Nenhuma resposta é coletada ou salva.</div><div className="preview-scroll"><div className="preview-form"><span className="questionnaires-mode">MATRIXIA · QUESTIONÁRIO</span><h3>{draft.title || "Título do questionário"}</h3>{draft.subtitle && <h4>{draft.subtitle}</h4>}{draft.description && <p>{draft.description}</p>}{draft.sections.map((section, sectionIndex) => <section className="preview-section" key={section.id}><h4>{section.title || `Seção ${sectionIndex + 1}`}</h4>{section.description && <p>{section.description}</p>}{section.questions.map((question) => <div className="preview-question" key={question.id}><label>{question.label || "Texto da pergunta"}{question.required && <b> *</b>}</label>{question.helpText && <small>{question.helpText}</small>}{question.type === "long_text" ? <textarea disabled placeholder="Sua resposta" rows={3} /> : question.type === "signature" ? <div className="preview-signature">Assinatura</div> : choiceType(question.type) ? <div className="preview-choices">{(question.options ?? (question.type === "yes_no" ? ["Sim", "Não"] : ["Opção 1"])).map((option) => <label key={option}><input type={question.type === "multiple_choice" ? "checkbox" : "radio"} disabled /> {option}</label>)}</div> : <input disabled type={question.type === "date" ? "date" : question.type === "number" || question.type === "currency" ? "number" : question.type === "phone" ? "tel" : "text"} placeholder="Sua resposta" />}</div>)}</section>)}</div></div></aside>;
}

function choiceType(type: QuestionType) { return type === "single_choice" || type === "multiple_choice" || type === "yes_no"; }


type ApplicationProps = {
  questionnaire: SharedQuestionnaire;
  onBack: () => void;
  onSave: (status: QuestionnaireResponse["status"], answers: Record<string, string>, context: QuestionnaireResponse["context"]) => void;
};

function QuestionnaireApplication({ questionnaire, onBack, onSave }: ApplicationProps) {
  const sections = questionnaire.formSchema?.sections?.length
    ? questionnaire.formSchema.sections
    : [{ id: `section-${questionnaire.id}`, title: "Perguntas", description: "", questions: questionnaire.questions.map((question) => ({ id: question.id, label: question.label, type: question.kind === "choice" ? "single_choice" as const : "short_text" as const, required: false, options: question.options })) }];
  const allQuestions = sections.flatMap((section) => section.questions);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [context, setContext] = useState({ personId: "", householdId: "", lotId: "", visitId: "", unitId: "", professionalId: "" });
  const [error, setError] = useState("");
  const updateAnswer = (id: string, value: string) => { setAnswers((current) => ({ ...current, [id]: value })); setError(""); };
  const submit = (status: QuestionnaireResponse["status"]) => {
    if (status === "Enviado") {
      const missing = allQuestions.find((question) => question.required && !answers[question.id]?.trim());
      if (missing) { setError(`Preencha a pergunta obrigatória: “${missing.label}”.`); document.getElementById(`application-question-${missing.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    }
    onSave(status, answers, context);
  };
  return <section className="questionnaires-module application-page"><div className="questionnaires-topline"><button className="questionnaires-back" onClick={onBack}><ChevronLeft size={15} /> Questionários</button><span className="questionnaires-mode"><Send size={14} /> APLICAÇÃO · VERSÃO {questionnaire.version}</span></div><div className="application-heading"><div><h2>{questionnaire.title}</h2><p>{questionnaire.subtitle}</p></div><span className="questionnaire-status active">Ativo</span></div><div className="application-layout"><main className="application-form"><section className="application-context-card"><div className="form-card-heading"><div><span className="questionnaires-mode">REFERÊNCIAS DO ATENDIMENTO</span><h3>Vincular aplicação</h3></div><ShieldCheck size={18} /></div><p>Os campos abaixo são referências demonstrativas para testar a integração com pessoa, domicílio, território e unidade.</p><div className="application-context-grid">{([["personId", "Pessoa"], ["householdId", "Domicílio"], ["lotId", "Lote ou área"], ["visitId", "Visita"], ["unitId", "Unidade"], ["professionalId", "Profissional"]] as const).map(([key, label]) => <label key={key}>{label}<input value={context[key]} onChange={(event) => setContext((current) => ({ ...current, [key]: event.target.value }))} placeholder={`Ex.: SIM-${key.toUpperCase()}-001`} /></label>)}</div></section>{sections.map((section, sectionIndex) => <section className="application-section" key={section.id}><div className="application-section-title"><span>{String(sectionIndex + 1).padStart(2, "0")}</span><div><h3>{section.title || `Seção ${sectionIndex + 1}`}</h3>{section.description && <p>{section.description}</p>}</div></div>{section.questions.map((question) => <ApplicationQuestion key={question.id} question={question} value={answers[question.id] ?? ""} onChange={(value) => updateAnswer(question.id, value)} />)}</section>)}{error && <div className="application-error"><AlertCircle size={16} /> {error}</div>}<div className="application-actions"><button className="questionnaires-secondary" onClick={() => submit("Rascunho")}><Save size={14} /> Salvar rascunho</button><button className="questionnaires-primary" onClick={() => submit("Enviado")}><Send size={14} /> Enviar resposta</button></div></main><aside className="application-side"><div><span className="questionnaires-mode">COMO FUNCIONA</span><h3>Aplicação de teste</h3><p>O envio registra a resposta neste navegador e mantém a versão do questionário utilizada.</p></div><div className="application-side-stat"><strong>{allQuestions.length}</strong><span>perguntas</span></div><div className="application-side-stat"><strong>{allQuestions.filter((question) => question.required).length}</strong><span>obrigatórias</span></div><div className="questionnaires-note"><FileText size={15} /><span>Este protótipo não transmite dados para sistemas oficiais.</span></div></aside></div></section>;
}

function ApplicationQuestion({ question, value, onChange }: { question: { id: string; label: string; type: QuestionnaireQuestionType; required: boolean; helpText?: string; options?: string[] }; value: string; onChange: (value: string) => void }) {
  const choices = question.type === "yes_no" ? ["Sim", "Não"] : question.options ?? ["Opção 1"];
  return <div className="application-question" id={`application-question-${question.id}`}><label>{question.label}{question.required && <b> *</b>}</label>{question.helpText && <small>{question.helpText}</small>}{question.type === "long_text" ? <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} placeholder="Digite sua resposta" /> : choiceType(question.type) ? <div className="application-choices">{choices.map((option) => <label key={option}><input type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={question.id} checked={question.type === "multiple_choice" ? value.split(" | ").includes(option) : value === option} onChange={(event) => { if (question.type === "multiple_choice") { const current = value ? value.split(" | ") : []; onChange(event.target.checked ? [...current, option].join(" | ") : current.filter((item) => item !== option).join(" | ")); } else onChange(option); }} /> {option}</label>)}</div> : question.type === "signature" ? <div className="application-signature">Área de assinatura demonstrativa</div> : <input type={question.type === "date" ? "date" : question.type === "number" || question.type === "currency" ? "number" : question.type === "phone" ? "tel" : "text"} value={value} onChange={(event) => onChange(event.target.value)} placeholder="Digite sua resposta" />}</div>;
}
