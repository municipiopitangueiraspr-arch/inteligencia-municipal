import { useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  Check,
  ChevronLeft,
  Download,
  Edit3,
  FileText,
  Plus,
  Printer,
  RotateCcw,
  Save,
  Trash2,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
import type {
  QuestionnaireAudience,
  SharedQuestionnaire,
  SharedQuestionnairesDataset,
} from "../data/sharedQuestionnaires";
import "./SharedQuestionnairesModule.css";

type Props = {
  dataset: SharedQuestionnairesDataset;
  onChange: (update: (current: SharedQuestionnairesDataset) => SharedQuestionnairesDataset) => void;
  onBack?: () => void;
};

type QuestionDraft = SharedQuestionnaire["questions"][number];

const audiences: QuestionnaireAudience[] = ["Saúde", "Assistência Social", "Educação", "Compartilhado"];

const makeQuestion = (index: number): QuestionDraft => ({
  id: `question-${Date.now()}-${index}`,
  label: "",
  kind: "text",
});

const formatDate = (value: string) =>
  new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[character] ?? character);

export default function SharedQuestionnairesModule({ dataset, onChange, onBack }: Props) {
  const [editing, setEditing] = useState<SharedQuestionnaire | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [responsesFor, setResponsesFor] = useState<SharedQuestionnaire | null>(null);
  const [filter, setFilter] = useState<"todos" | "ativos" | "inativos">("todos");
  const [search, setSearch] = useState("");
  const active = dataset.questionnaires.filter((item) => item.status === "Ativo").length;
  const inactive = dataset.questionnaires.filter((item) => item.status === "Inativo").length;
  const filteredQuestionnaires = useMemo(
    () => dataset.questionnaires.filter((item) => {
      const matchesStatus = filter === "todos" || (filter === "ativos" ? item.status === "Ativo" : item.status === "Inativo");
      const matchesSearch = `${item.title} ${item.subtitle} ${item.audience}`.toLocaleLowerCase().includes(search.toLocaleLowerCase());
      return matchesStatus && matchesSearch;
    }),
    [dataset.questionnaires, filter, search],
  );

  const openCreate = () => {
    setResponsesFor(null);
    setEditing({
      id: "",
      title: "",
      subtitle: "",
      audience: "Saúde",
      version: 1,
      status: "Ativo",
      questions: [makeQuestion(0)],
    });
    setShowForm(true);
  };

  const openEdit = (questionnaire: SharedQuestionnaire) => {
    setResponsesFor(null);
    setEditing(structuredClone(questionnaire));
    setShowForm(true);
  };

  const updateQuestion = (id: string, update: Partial<QuestionDraft>) => {
    setEditing((current) => current && { ...current, questions: current.questions.map((question) => question.id === id ? { ...question, ...update } : question) });
  };

  const saveQuestionnaire = () => {
    if (!editing || !editing.title.trim() || !editing.questions.some((question) => question.label.trim())) return;
    const normalized = {
      ...editing,
      title: editing.title.trim(),
      subtitle: editing.subtitle.trim() || "Questionário demonstrativo para fluxos municipais.",
      questions: editing.questions.filter((question) => question.label.trim()).map((question) => ({
        ...question,
        label: question.label.trim(),
        options: question.kind === "choice" ? (question.options ?? []).filter(Boolean) : undefined,
      })),
    };
    onChange((current) => current.questionnaires.some((item) => item.id === normalized.id)
      ? { ...current, questionnaires: current.questionnaires.map((item) => item.id === normalized.id ? { ...normalized, version: item.version + 1 } : item) }
      : { ...current, questionnaires: [{ ...normalized, id: `SIM-QST-${Date.now()}`, version: 1 }, ...current.questionnaires] });
    setShowForm(false);
    setEditing(null);
  };

  const changeStatus = (questionnaire: SharedQuestionnaire) => {
    onChange((current) => ({ ...current, questionnaires: current.questionnaires.map((item) => item.id === questionnaire.id ? { ...item, status: item.status === "Ativo" ? "Inativo" : "Ativo" } : item) }));
  };

  const exportResponsesXlsx = (questionnaire: SharedQuestionnaire) => {
    const responses = dataset.responses.filter((response) => response.questionnaireId === questionnaire.id);
    const rows = responses.map((response) => ({
      ID: response.id,
      Status: response.status,
      Atualizado: formatDate(response.updatedAt),
      Pessoa: response.personId ?? "",
      Domicílio: response.householdId ?? "",
      Lote: response.lotId ?? "",
      Visita: response.visitId ?? "",
      ...questionnaire.questions.reduce<Record<string, string>>((result, question) => ({ ...result, [question.label]: response.answers[question.id] ?? "" }), {}),
    }));
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Aviso: "Este questionário ainda não possui respostas." }]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Respostas");
    XLSX.writeFile(workbook, `${questionnaire.title.toLocaleLowerCase().replace(/[^a-z0-9]+/gi, "-")}-respostas.xlsx`);
  };

  const printResponsesPdf = (questionnaire: SharedQuestionnaire) => {
    const responses = dataset.responses.filter((response) => response.questionnaireId === questionnaire.id);
    const headers = ["ID", "Status", "Atualizado", ...questionnaire.questions.map((question) => question.label)];
    const rows = responses.map((response) => [response.id, response.status, formatDate(response.updatedAt), ...questionnaire.questions.map((question) => response.answers[question.id] ?? "—")]);
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;
    printWindow.document.write(`<html><head><title>Respostas — ${escapeHtml(questionnaire.title)}</title><style>body{font-family:Arial,sans-serif;color:#173247;padding:32px}h1{font-size:22px;margin:0 0 5px}p{color:#647782;font-size:12px;margin:0 0 22px}table{border-collapse:collapse;width:100%;font-size:10px}th,td{border:1px solid #d8e3e7;padding:7px;text-align:left;vertical-align:top}th{background:#eaf4f2;color:#236b61}@media print{button{display:none}}</style></head><body><h1>Respostas — ${escapeHtml(questionnaire.title)}</h1><p>Exportação de conferência · ${responses.length} resposta(s) · ${new Date().toLocaleString("pt-BR")}</p><table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("") : `<tr><td colspan="${headers.length}">Este questionário ainda não possui respostas.</td></tr>`}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  };

  if (responsesFor) {
    const responses = dataset.responses.filter((response) => response.questionnaireId === responsesFor.id);
    return <section className="questionnaires-module">
      <div className="questionnaires-topline"><button className="questionnaires-back" onClick={() => setResponsesFor(null)}><ChevronLeft size={15} /> Questionários</button><span className="questionnaires-mode"><BarChart3 size={14} /> RESPOSTAS</span></div>
      <div className="questionnaires-heading"><div><h2>{responsesFor.title}</h2><p>{responsesFor.subtitle}</p></div><div className="questionnaires-heading-actions"><button className="questionnaires-secondary" onClick={() => printResponsesPdf(responsesFor)}><Printer size={14} /> Exportar PDF</button><button className="questionnaires-primary" onClick={() => exportResponsesXlsx(responsesFor)}><Download size={14} /> Exportar XLSX</button></div></div>
      <div className="questionnaires-response-summary"><strong>{responses.length}</strong><span>respostas registradas neste navegador</span></div>
      <div className="questionnaires-responses-table"><table><thead><tr><th>ID</th><th>Status</th><th>Atualizado</th>{responsesFor.questions.map((question) => <th key={question.id}>{question.label}</th>)}</tr></thead><tbody>{responses.map((response) => <tr key={response.id}><td>{response.id}</td><td><span className="questionnaire-status status-active">{response.status}</span></td><td>{formatDate(response.updatedAt)}</td>{responsesFor.questions.map((question) => <td key={question.id}>{response.answers[question.id] || "—"}</td>)}</tr>)}{responses.length === 0 && <tr><td colSpan={3 + responsesFor.questions.length} className="questionnaires-empty">Ainda não há respostas para este questionário.</td></tr>}</tbody></table></div>
      <div className="questionnaires-note"><FileText size={16} /><span>Os arquivos são gerados localmente para conferência. O PDF abre a janela de impressão do navegador; selecione “Salvar como PDF”.</span></div>
    </section>;
  }

  return <section className="questionnaires-module">
    <div className="questionnaires-topline"><span className="questionnaires-mode"><ClipboardIcon /> GESTÃO LOCAL</span><span className="questionnaires-history"><Archive size={13} /> Histórico preservado por inativação</span></div>
    <div className="questionnaires-heading"><div><h2>Questionários</h2><p>Crie modelos, organize perguntas e acompanhe respostas sem excluir o histórico. Os dados deste protótipo ficam salvos no navegador.</p></div>{onBack && <button className="questionnaires-secondary" onClick={onBack}>Voltar aos módulos</button>}</div>
    <div className="questionnaires-summary"><div><strong>{dataset.questionnaires.length}</strong><span>questionários cadastrados</span></div><div><strong>{active}</strong><span>ativos para aplicação</span></div><div><strong>{inactive}</strong><span>inativos no histórico</span></div><div><strong>{dataset.responses.length}</strong><span>respostas registradas</span></div></div>
    <div className="questionnaires-toolbar"><div className="questionnaires-filters"><button className={filter === "todos" ? "selected" : ""} onClick={() => setFilter("todos")}>Todos</button><button className={filter === "ativos" ? "selected" : ""} onClick={() => setFilter("ativos")}>Ativos</button><button className={filter === "inativos" ? "selected" : ""} onClick={() => setFilter("inativos")}>Inativos</button><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar questionário" /></div><button className="questionnaires-primary" onClick={openCreate}><Plus size={15} /> Criar questionário</button></div>
    <div className="questionnaires-list">{filteredQuestionnaires.map((questionnaire) => <article key={questionnaire.id} className={questionnaire.status === "Inativo" ? "questionnaire-card inactive" : "questionnaire-card"}><div className="questionnaire-card-top"><span className="questionnaire-card-icon"><FileText size={18} /></span><span className={`questionnaire-status ${questionnaire.status === "Ativo" ? "status-active" : "status-inactive"}`}>{questionnaire.status}</span></div><h3>{questionnaire.title}</h3><p>{questionnaire.subtitle}</p><div className="questionnaire-meta"><span>{questionnaire.audience}</span><span>v{questionnaire.version}</span><span>{questionnaire.questions.length} perguntas</span><span>{dataset.responses.filter((response) => response.questionnaireId === questionnaire.id).length} respostas</span></div><div className="questionnaire-card-actions"><button onClick={() => setResponsesFor(questionnaire)}><BarChart3 size={14} /> Ver respostas</button><button onClick={() => openEdit(questionnaire)}><Edit3 size={14} /> Editar</button><button onClick={() => changeStatus(questionnaire)}>{questionnaire.status === "Ativo" ? <><Archive size={14} /> Inativar</> : <><RotateCcw size={14} /> Reativar</>}</button></div></article>)}</div>
    {filteredQuestionnaires.length === 0 && <div className="questionnaires-empty">Nenhum questionário encontrado com os filtros atuais.</div>}
    <div className="questionnaires-note"><Archive size={16} /><span>Questionários não são excluídos. Ao inativar, eles deixam de ser indicados para novas aplicações, mas continuam disponíveis para consulta e auditoria.</span></div>
    {showForm && editing && <div className="questionnaires-modal-backdrop"><div className="questionnaires-modal"><div className="questionnaires-modal-heading"><div><span className="questionnaires-mode">{editing.id ? "EDITAR MODELO" : "NOVO MODELO"}</span><h2>{editing.id ? "Editar questionário" : "Criar questionário"}</h2></div><button className="questionnaires-close" onClick={() => { setShowForm(false); setEditing(null); }}><X size={17} /></button></div><div className="questionnaires-form-grid"><label>Título<input value={editing.title} onChange={(event) => setEditing({ ...editing, title: event.target.value })} placeholder="Ex.: Cadastro territorial" /></label><label>Secretaria ou público<select value={editing.audience} onChange={(event) => setEditing({ ...editing, audience: event.target.value as QuestionnaireAudience })}>{audiences.map((audience) => <option key={audience}>{audience}</option>)}</select></label></div><label className="questionnaires-field-full">Descrição<input value={editing.subtitle} onChange={(event) => setEditing({ ...editing, subtitle: event.target.value })} placeholder="Explique o objetivo deste questionário" /></label><div className="questionnaires-questions-heading"><div><strong>Perguntas</strong><small>Defina o que será coletado em cada aplicação.</small></div><button className="questionnaires-secondary" onClick={() => setEditing({ ...editing, questions: [...editing.questions, makeQuestion(editing.questions.length)] })}><Plus size={14} /> Adicionar pergunta</button></div><div className="questionnaires-question-editor">{editing.questions.map((question, index) => <div className="question-editor-row" key={question.id}><span className="question-index">{index + 1}</span><input value={question.label} onChange={(event) => updateQuestion(question.id, { label: event.target.value })} placeholder="Escreva a pergunta" /><select value={question.kind} onChange={(event) => updateQuestion(question.id, { kind: event.target.value as QuestionDraft["kind"], options: event.target.value === "choice" ? ["Sim", "Não"] : undefined })}><option value="text">Texto</option><option value="choice">Escolha</option></select><button className="question-remove" disabled={editing.questions.length === 1} onClick={() => setEditing({ ...editing, questions: editing.questions.filter((item) => item.id !== question.id) })} title="Remover pergunta"><Trash2 size={15} /></button>{question.kind === "choice" && <input className="question-options" value={(question.options ?? []).join("; ")} onChange={(event) => updateQuestion(question.id, { options: event.target.value.split(";").map((option) => option.trim()) })} placeholder="Opções separadas por ponto e vírgula" />}</div>)}</div><div className="questionnaires-modal-actions"><button className="questionnaires-secondary" onClick={() => { setShowForm(false); setEditing(null); }}>Cancelar</button><button className="questionnaires-primary" onClick={saveQuestionnaire}><Save size={14} /> Salvar questionário</button></div></div></div>}
  </section>;
}

function ClipboardIcon() {
  return <Check size={14} />;
}
