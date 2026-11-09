import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, ClipboardList, Eye, FilePlus2, FileText, LoaderCircle, Plus, Save, Search, ShieldCheck, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { CensusWriteConfirmation } from '../CensusWriteConfirmation'
import { cloneQuestionnaire, createEmptyQuestion, createEmptyQuestionnaire, createEmptySection, moveItem, questionnaireQuestionCount, QUESTION_TYPE_LABELS, validateQuestionnaire } from './questionnaireLogic'
import type { QuestionnaireQuestion, QuestionnaireRecord, QuestionnaireSection, QuestionnaireStatus, QuestionType, QuestionValidation } from './questionnaireTypes'
import './QuestionnairesManagement.css'

type NoticeTone = 'success' | 'error' | 'info'
type StatusFilter = 'ALL' | QuestionnaireStatus
type PendingConfirmation =
  | { kind: 'save' }
  | { kind: 'status'; status: 'ACTIVE' | 'INACTIVE' }
  | { kind: 'discard'; destination: 'new' | 'close' | QuestionnaireRecord }

const selectFields = 'id,slug,title,subtitle,description,status,form_schema,created_at,updated_at'
const statusLabels: Record<QuestionnaireStatus, string> = { DRAFT: 'Rascunho', ACTIVE: 'Ativo', INACTIVE: 'Inativo' }
const typeOptions = Object.entries(QUESTION_TYPE_LABELS) as Array<[QuestionType, string]>

function statusClass(status: QuestionnaireStatus) {
  return status === 'ACTIVE' ? 'active' : status === 'INACTIVE' ? 'inactive' : 'draft'
}

function formatDate(value: string) {
  if (!value) return 'Ainda não salvo'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Ainda não salvo' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function makeSafeSchema(form: QuestionnaireRecord) {
  return {
    sections: form.form_schema.sections.map((section) => ({
      ...section,
      title: section.title.trim(),
      description: section.description?.trim() || '',
      questions: section.questions.map((question) => ({
        ...question,
        label: question.label.trim(),
        helpText: question.helpText?.trim() || '',
        options: question.options?.map((option) => option.trim()).filter(Boolean),
        columns: question.columns?.map((column) => ({ ...column, label: column.label.trim() })).filter((column) => column.label),
      })),
    })),
  }
}

export function QuestionnairesManagement() {
  const [forms, setForms] = useState<QuestionnaireRecord[]>([])
  const [draft, setDraft] = useState<QuestionnaireRecord | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [loading, setLoading] = useState(Boolean(supabase))
  const [backendReady, setBackendReady] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingAction, setSavingAction] = useState<'save' | 'status' | null>(null)
  const [notice, setNotice] = useState(supabase ? '' : 'O banco do Censo não está disponível nesta sessão.')
  const [noticeTone, setNoticeTone] = useState<NoticeTone>(supabase ? 'info' : 'error')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
  const [showPreview, setShowPreview] = useState(false)
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null)

  const loadQuestionnaires = useCallback(async () => {
    if (!supabase) {
      return
    }
    const { data, error } = await supabase.from('census_questionnaires').select(selectFields).order('updated_at', { ascending: false }).limit(200)
    if (error) {
      setBackendReady(false)
      setNoticeTone('error')
      setNotice(`Não foi possível carregar os questionários. Confira se a estrutura do módulo foi instalada: ${error.message}`)
      setForms([])
      setDraft(null)
      setLoading(false)
      return
    }
    setBackendReady(true)
    const rows = (data || []) as QuestionnaireRecord[]
    setForms(rows)
    setDraft(rows[0] ? cloneQuestionnaire(rows[0]) : null)
    setIsNew(false)
    setDirty(false)
    setNotice('')
    setLoading(false)
  }, [])

  useEffect(() => { void loadQuestionnaires() }, [loadQuestionnaires])

  const visibleForms = useMemo(() => forms.filter((form) => {
    const matchesStatus = statusFilter === 'ALL' || form.status === statusFilter
    const query = search.trim().toLocaleLowerCase('pt-BR')
    const matchesSearch = !query || `${form.title} ${form.subtitle} ${form.description}`.toLocaleLowerCase('pt-BR').includes(query)
    return matchesStatus && matchesSearch
  }), [forms, search, statusFilter])

  function updateDraft(update: (current: QuestionnaireRecord) => QuestionnaireRecord) {
    setDraft((current) => current ? update(current) : current)
    setDirty(true)
  }

  function startNewQuestionnaire() {
    if (dirty) {
      setConfirmation({ kind: 'discard', destination: 'new' })
      return
    }
    setDraft(createEmptyQuestionnaire())
    setIsNew(true)
    setDirty(true)
    setShowPreview(false)
    setNotice('')
  }

  function selectQuestionnaire(form: QuestionnaireRecord) {
    if (draft?.id === form.id) return
    if (dirty) {
      setConfirmation({ kind: 'discard', destination: form })
      return
    }
    setDraft(cloneQuestionnaire(form))
    setIsNew(false)
    setDirty(false)
    setShowPreview(false)
    setNotice('')
  }

  function updateSection(sectionId: string, update: (section: QuestionnaireSection) => QuestionnaireSection) {
    updateDraft((current) => ({ ...current, form_schema: { ...current.form_schema, sections: current.form_schema.sections.map((section) => section.id === sectionId ? update(section) : section) } }))
  }

  function updateQuestion(sectionId: string, questionId: string, update: (question: QuestionnaireQuestion) => QuestionnaireQuestion) {
    updateSection(sectionId, (section) => ({ ...section, questions: section.questions.map((question) => question.id === questionId ? update(question) : question) }))
  }

  function addSection() {
    updateDraft((current) => ({ ...current, form_schema: { ...current.form_schema, sections: [...current.form_schema.sections, createEmptySection()] } }))
  }

  function moveSection(index: number, offset: -1 | 1) {
    updateDraft((current) => ({ ...current, form_schema: { ...current.form_schema, sections: moveItem(current.form_schema.sections, index, offset) } }))
  }

  function removeSection(sectionId: string) {
    updateDraft((current) => ({ ...current, form_schema: { ...current.form_schema, sections: current.form_schema.sections.filter((section) => section.id !== sectionId) } }))
  }

  function addQuestion(sectionId: string) {
    updateSection(sectionId, (section) => ({ ...section, questions: [...section.questions, createEmptyQuestion()] }))
  }

  function moveQuestion(sectionId: string, index: number, offset: -1 | 1) {
    updateSection(sectionId, (section) => ({ ...section, questions: moveItem(section.questions, index, offset) }))
  }

  function removeQuestion(sectionId: string, questionId: string) {
    updateSection(sectionId, (section) => ({ ...section, questions: section.questions.filter((question) => question.id !== questionId) }))
  }

  function requestSave() {
    if (!draft || saving || !backendReady) return
    const issues = validateQuestionnaire(draft)
    if (issues.length) {
      setNoticeTone('error')
      setNotice(issues[0])
      return
    }
    setNotice('')
    setConfirmation({ kind: 'save' })
  }

  function requestStatusChange() {
    if (!draft || saving || !backendReady) return
    const issues = validateQuestionnaire(draft)
    if (issues.length) {
      setNoticeTone('error')
      setNotice(issues[0])
      return
    }
    setNotice('')
    setConfirmation({ kind: 'status', status: draft.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE' })
  }

  async function persistQuestionnaire(nextStatus?: 'ACTIVE' | 'INACTIVE') {
    if (!supabase || !backendReady || !draft || saving) return
    const issues = validateQuestionnaire(draft)
    if (issues.length) {
      setNoticeTone('error')
      setNotice(issues[0])
      return
    }
    const targetStatus = nextStatus || draft.status
    const payload = {
      slug: draft.slug,
      title: draft.title.trim(),
      subtitle: draft.subtitle.trim(),
      description: draft.description.trim(),
      status: targetStatus,
      form_schema: makeSafeSchema(draft),
    }
    setSaving(true)
    setSavingAction(nextStatus ? 'status' : 'save')
    setNotice('')
    try {
      const result = isNew
        ? await supabase.from('census_questionnaires').insert({ id: draft.id, ...payload }).select(selectFields).single()
        : await supabase.from('census_questionnaires').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', draft.id).select(selectFields).single()
      if (result.error) throw new Error(result.error.message)
      if (!result.data) throw new Error('O banco não retornou o questionário salvo.')
      const saved = result.data as QuestionnaireRecord
      setForms((current) => [saved, ...current.filter((form) => form.id !== saved.id)].sort((left, right) => right.updated_at.localeCompare(left.updated_at)))
      setDraft(cloneQuestionnaire(saved))
      setIsNew(false)
      setDirty(false)
      setNoticeTone('success')
      setNotice(nextStatus ? `Questionário ${targetStatus === 'ACTIVE' ? 'ativado' : 'inativado'} com sucesso.` : 'Questionário salvo com sucesso.')
    } catch (error) {
      setNoticeTone('error')
      setNotice(`Não foi possível salvar o questionário: ${error instanceof Error ? error.message : 'tente novamente.'}`)
    } finally {
      setSaving(false)
      setSavingAction(null)
    }
  }

  function confirmPendingAction() {
    const action = confirmation
    setConfirmation(null)
    if (!action) return
    if (action.kind === 'save') void persistQuestionnaire()
    if (action.kind === 'status') void persistQuestionnaire(action.status)
    if (action.kind === 'discard') {
      if (action.destination === 'close') {
        setDraft(null)
        setIsNew(false)
        setDirty(false)
      } else if (action.destination === 'new') {
        setDraft(createEmptyQuestionnaire())
        setIsNew(true)
        setDirty(true)
      } else {
        setDraft(cloneQuestionnaire(action.destination))
        setIsNew(false)
        setDirty(false)
      }
      setShowPreview(false)
      setNotice('')
    }
  }

  const confirmationDetails = confirmation?.kind === 'save'
    ? { title: isNew ? 'Criar este questionário?' : 'Salvar as alterações?', description: `“${draft?.title || 'Questionário sem título'}” será gravado no Censo Municipal como ${statusLabels[draft?.status || 'DRAFT'].toLocaleLowerCase('pt-BR')}.`, confirmLabel: isNew ? 'Criar questionário' : 'Salvar alterações' }
    : confirmation?.kind === 'status'
      ? { title: confirmation.status === 'ACTIVE' ? 'Ativar este questionário?' : 'Inativar este questionário?', description: `“${draft?.title || 'Questionário sem título'}” ficará ${confirmation.status === 'ACTIVE' ? 'disponível como ativo' : 'inativo e preservado no sistema'}.`, confirmLabel: confirmation.status === 'ACTIVE' ? 'Ativar questionário' : 'Inativar questionário' }
      : confirmation?.kind === 'discard'
        ? { title: 'Descartar as alterações?', description: 'As mudanças ainda não salvas serão perdidas. O questionário já gravado no banco continuará preservado.', confirmLabel: 'Descartar alterações' }
        : null

  const activeCount = forms.filter((form) => form.status === 'ACTIVE').length
  const questionCount = draft ? questionnaireQuestionCount(draft.form_schema) : 0

  return <section className="fleet-section fleet-page-section questionnaire-manager" aria-busy={loading || saving}>
    <div className="fleet-page-heading questionnaire-page-heading">
      <div><span className="fleet-kicker">CENSO MUNICIPAL</span><h2>Gestão de questionários</h2><p>Crie, revise e controle os formulários usados no trabalho de campo.</p></div>
      <button type="button" className="fleet-primary-button questionnaire-new-button" onClick={startNewQuestionnaire} disabled={loading || saving || !backendReady}><FilePlus2 size={16} />Novo questionário</button>
    </div>

    {notice && <div className={`questionnaire-notice ${noticeTone}`} role={noticeTone === 'error' ? 'alert' : 'status'}>{noticeTone === 'error' ? <AlertCircle size={17} /> : noticeTone === 'success' ? <CheckCircle2 size={17} /> : <ClipboardList size={17} />}<span>{notice}</span>{noticeTone !== 'error' && <button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15} /></button>}</div>}
    {saving && <div className="census-write-progress" role="status"><LoaderCircle className="spin" size={18} /><span>{savingAction === 'status' ? 'Atualizando o estado do questionário…' : 'Salvando a definição do questionário…'} Aguarde.</span></div>}

    <div className="questionnaire-layout">
      <aside className="fleet-panel questionnaire-library">
        <div className="questionnaire-library-heading"><div><span className="fleet-kicker">BIBLIOTECA</span><h3>Questionários</h3></div><span className="questionnaire-count">{forms.length}</span></div>
        <div className="questionnaire-library-stats"><strong>{activeCount}</strong><span>ativo(s)</span><span className="questionnaire-stat-divider" /><span>{forms.length} cadastrado(s)</span></div>
        <label className="questionnaire-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar questionário" aria-label="Buscar questionário" /></label>
        <div className="questionnaire-filter" role="group" aria-label="Filtrar por estado">
          {([['ALL', 'Todos'], ['DRAFT', 'Rascunho'], ['ACTIVE', 'Ativos'], ['INACTIVE', 'Inativos']] as Array<[StatusFilter, string]>).map(([value, label]) => <button key={value} type="button" className={statusFilter === value ? 'selected' : ''} onClick={() => setStatusFilter(value)}>{label}</button>)}
        </div>
        <div className="questionnaire-list" aria-label="Lista de questionários">
          {visibleForms.map((form) => <button type="button" key={form.id} className={`questionnaire-list-item${draft?.id === form.id && !isNew ? ' selected' : ''}`} onClick={() => selectQuestionnaire(form)} disabled={loading || saving}>
            <span className="questionnaire-list-icon"><FileText size={17} /></span><span className="questionnaire-list-copy"><strong>{form.title}</strong><small>{form.subtitle || 'Sem subtítulo'}</small><span className={`questionnaire-status ${statusClass(form.status)}`}>{statusLabels[form.status]}</span></span>
          </button>)}
          {!loading && !visibleForms.length && <div className="questionnaire-list-empty"><ClipboardList size={20} /><span>{forms.length ? 'Nenhum questionário corresponde ao filtro.' : 'Nenhum questionário cadastrado.'}</span></div>}
          {loading && <div className="questionnaire-list-empty"><LoaderCircle className="spin" size={20} /><span>Carregando biblioteca…</span></div>}
        </div>
      </aside>

      <div className="questionnaire-workspace">
        {!draft && !loading && <div className="fleet-panel questionnaire-empty-state"><span className="questionnaire-empty-icon"><FileText size={24} /></span><h3>Comece seu primeiro questionário</h3><p>Crie um formulário ou carregue a ficha inicial do Censo para editar e ativar.</p><button type="button" className="fleet-primary-button" onClick={startNewQuestionnaire} disabled={!backendReady}><Plus size={15} />Criar questionário</button></div>}
        {draft && <>
          <div className="fleet-panel questionnaire-editor-toolbar">
            <div className="questionnaire-editor-title"><span className={`questionnaire-status ${statusClass(draft.status)}`}>{statusLabels[draft.status]}</span><h3>{isNew ? 'Novo questionário' : draft.title || 'Questionário sem título'}</h3><small>{dirty ? 'Alterações não salvas' : `Atualizado em ${formatDate(draft.updated_at)}`}</small></div>
            <div className="questionnaire-toolbar-actions">
              <button type="button" className="fleet-secondary-button" onClick={() => setShowPreview((current) => !current)} disabled={saving}><Eye size={15} />{showPreview ? 'Fechar prévia' : 'Pré-visualizar'}</button>
              {!isNew && <button type="button" className={draft.status === 'ACTIVE' ? 'questionnaire-deactivate-button' : 'questionnaire-activate-button'} onClick={requestStatusChange} disabled={saving || !backendReady}><ShieldCheck size={15} />{draft.status === 'ACTIVE' ? 'Inativar' : 'Ativar'}</button>}
              {dirty && <button type="button" className="fleet-secondary-button" onClick={() => setConfirmation({ kind: 'discard', destination: isNew ? 'close' : forms.find((form) => form.id === draft.id) || draft })} disabled={saving}>Descartar</button>}
              <button type="button" className="fleet-primary-button" onClick={requestSave} disabled={saving || !supabase || !backendReady}><Save size={15} />{saving ? 'Salvando…' : 'Salvar questionário'}</button>
            </div>
          </div>

          <div className={`questionnaire-builder-layout${showPreview ? ' with-preview' : ''}`}>
            <div className="questionnaire-builder">
              <section className="fleet-panel questionnaire-details-card">
                <div className="questionnaire-card-heading"><div><span className="fleet-kicker">IDENTIFICAÇÃO</span><h3>Informações do questionário</h3></div><FileText size={18} /></div>
                <label>Título do questionário<input value={draft.title} onChange={(event) => updateDraft((current) => ({ ...current, title: event.target.value }))} placeholder="Ex.: Ficha de cadastro domiciliar" disabled={saving} /></label>
                <label>Subtítulo<input value={draft.subtitle} onChange={(event) => updateDraft((current) => ({ ...current, subtitle: event.target.value }))} placeholder="Complemento ou finalidade" disabled={saving} /></label>
                <label>Descrição<textarea value={draft.description} onChange={(event) => updateDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Explique quando e por quem este questionário deve ser usado." rows={3} disabled={saving} /></label>
              </section>

              <div className="questionnaire-sections-heading"><div><span className="fleet-kicker">ESTRUTURA</span><h3>Seções e perguntas</h3><small>{draft.form_schema.sections.length} seção(ões) · {questionCount} pergunta(s)</small></div><button type="button" className="fleet-secondary-button" onClick={addSection} disabled={saving}><Plus size={15} />Adicionar seção</button></div>

              {!draft.form_schema.sections.length && <div className="questionnaire-add-first"><span><ClipboardList size={20} /></span><strong>Organize as perguntas por seção</strong><small>Adicione uma seção para começar a montar o formulário.</small><button type="button" className="fleet-primary-button" onClick={addSection} disabled={saving}><Plus size={15} />Criar primeira seção</button></div>}

              {draft.form_schema.sections.map((section, sectionIndex) => <section className="fleet-panel questionnaire-section-card" key={section.id}>
                <div className="questionnaire-section-top"><span className="questionnaire-section-number">{String(sectionIndex + 1).padStart(2, '0')}</span><div className="questionnaire-section-heading"><label>Título da seção<input value={section.title} onChange={(event) => updateSection(section.id, (current) => ({ ...current, title: event.target.value }))} disabled={saving} /></label><label>Instruções da seção<textarea value={section.description || ''} onChange={(event) => updateSection(section.id, (current) => ({ ...current, description: event.target.value }))} placeholder="Opcional" rows={2} disabled={saving} /></label></div><div className="questionnaire-reorder-actions"><button type="button" aria-label="Mover seção para cima" title="Mover para cima" disabled={saving || sectionIndex === 0} onClick={() => moveSection(sectionIndex, -1)}><ArrowUp size={15} /></button><button type="button" aria-label="Mover seção para baixo" title="Mover para baixo" disabled={saving || sectionIndex === draft.form_schema.sections.length - 1} onClick={() => moveSection(sectionIndex, 1)}><ArrowDown size={15} /></button><button type="button" aria-label="Remover seção" title="Remover seção" disabled={saving} onClick={() => removeSection(section.id)}><Trash2 size={15} /></button></div></div>
                <div className="questionnaire-questions">
                  {section.questions.map((question, questionIndex) => <QuestionEditor key={question.id} question={question} index={questionIndex} total={section.questions.length} disabled={saving} onUpdate={(update) => updateQuestion(section.id, question.id, update)} onMove={(offset) => moveQuestion(section.id, questionIndex, offset)} onRemove={() => removeQuestion(section.id, question.id)} />)}
                  {!section.questions.length && <p className="questionnaire-no-questions">Esta seção ainda não tem perguntas.</p>}
                </div>
                <button type="button" className="questionnaire-add-question" onClick={() => addQuestion(section.id)} disabled={saving}><Plus size={15} />Adicionar pergunta</button>
              </section>)}
            </div>
            {showPreview && <QuestionnairePreview form={draft} onClose={() => setShowPreview(false)} />}
          </div>
        </>}
      </div>
    </div>
    {confirmationDetails && <CensusWriteConfirmation {...confirmationDetails} onCancel={() => setConfirmation(null)} onConfirm={confirmPendingAction} />}
  </section>
}

function QuestionEditor({ question, index, total, disabled, onUpdate, onMove, onRemove }: { question: QuestionnaireQuestion; index: number; total: number; disabled: boolean; onUpdate: (update: (current: QuestionnaireQuestion) => QuestionnaireQuestion) => void; onMove: (offset: -1 | 1) => void; onRemove: () => void }) {
  const validation = question.validation || {}
  const isChoice = question.type === 'single_choice' || question.type === 'multiple_choice'
  const isText = question.type === 'short_text' || question.type === 'long_text' || question.type === 'phone'
  const isNumeric = question.type === 'number' || question.type === 'currency'
  function setValidation(key: keyof QuestionValidation, value: number | undefined) {
    onUpdate((current) => ({ ...current, validation: { ...(current.validation || {}), [key]: value } }))
  }
  function changeType(type: QuestionType) {
    onUpdate((current) => {
      const previous = current.validation || {}
      const validation = type === 'number' || type === 'currency' ? { min: previous.min, max: previous.max }
        : type === 'short_text' || type === 'long_text' || type === 'phone' ? { minLength: previous.minLength, maxLength: previous.maxLength }
          : type === 'multiple_choice' ? { minSelections: previous.minSelections, maxSelections: previous.maxSelections }
            : type === 'table' ? { minRows: previous.minRows, maxRows: previous.maxRows } : {}
      return { ...current, type, validation, options: type === 'single_choice' || type === 'multiple_choice' ? current.options?.length ? current.options : ['Opção 1'] : undefined, allowOther: type === 'single_choice' || type === 'multiple_choice' ? current.allowOther : false, columns: type === 'table' ? current.columns?.length ? current.columns : [{ id: crypto.randomUUID(), label: 'Resposta', type: 'short_text' }] : undefined }
    })
  }

  return <article className="questionnaire-question-card">
    <div className="questionnaire-question-top"><span className="questionnaire-question-number">{question.code || `Pergunta ${index + 1}`}</span><div className="questionnaire-reorder-actions"><button type="button" aria-label="Mover pergunta para cima" title="Mover para cima" disabled={disabled || index === 0} onClick={() => onMove(-1)}><ArrowUp size={14} /></button><button type="button" aria-label="Mover pergunta para baixo" title="Mover para baixo" disabled={disabled || index === total - 1} onClick={() => onMove(1)}><ArrowDown size={14} /></button><button type="button" aria-label="Remover pergunta" title="Remover pergunta" disabled={disabled} onClick={onRemove}><Trash2 size={14} /></button></div></div>
    <label>Texto da pergunta<textarea value={question.label} onChange={(event) => onUpdate((current) => ({ ...current, label: event.target.value }))} rows={2} disabled={disabled} /></label>
    <div className="questionnaire-question-settings">
      <label>Tipo de resposta<select value={question.type} onChange={(event) => changeType(event.target.value as QuestionType)} disabled={disabled}>{typeOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Texto de ajuda<input value={question.helpText || ''} onChange={(event) => onUpdate((current) => ({ ...current, helpText: event.target.value }))} placeholder="Opcional" disabled={disabled} /></label>
    </div>
    <label className="questionnaire-required-toggle"><input type="checkbox" checked={question.required} onChange={(event) => onUpdate((current) => ({ ...current, required: event.target.checked }))} disabled={disabled} /><span><strong>Resposta obrigatória</strong><small>Quem responder precisará preencher este campo.</small></span></label>

    {isChoice && <div className="questionnaire-options-editor"><strong>Opções de resposta</strong>{(question.options || []).map((option, optionIndex) => <div className="questionnaire-option-row" key={`${question.id}-option-${optionIndex}`}><span>{String.fromCharCode(65 + optionIndex)}</span><input value={option} onChange={(event) => onUpdate((current) => ({ ...current, options: (current.options || []).map((value, i) => i === optionIndex ? event.target.value : value) }))} aria-label={`Opção ${optionIndex + 1}`} disabled={disabled} /><button type="button" aria-label={`Remover opção ${optionIndex + 1}`} disabled={disabled || (question.options || []).length < 2} onClick={() => onUpdate((current) => ({ ...current, options: (current.options || []).filter((_, i) => i !== optionIndex) }))}><X size={14} /></button></div>)}<button type="button" className="questionnaire-text-action" onClick={() => onUpdate((current) => ({ ...current, options: [...(current.options || []), `Opção ${(current.options || []).length + 1}`] }))} disabled={disabled}><Plus size={14} />Adicionar opção</button><label className="questionnaire-allow-other"><input type="checkbox" checked={Boolean(question.allowOther)} onChange={(event) => onUpdate((current) => ({ ...current, allowOther: event.target.checked }))} disabled={disabled} />Permitir resposta “Outro”</label></div>}

    {question.type === 'table' && <div className="questionnaire-options-editor"><strong>Colunas da tabela</strong>{(question.columns || []).map((column, columnIndex) => <div className="questionnaire-column-row" key={column.id}><input value={column.label} onChange={(event) => onUpdate((current) => ({ ...current, columns: (current.columns || []).map((item, i) => i === columnIndex ? { ...item, label: event.target.value } : item) }))} aria-label={`Nome da coluna ${columnIndex + 1}`} disabled={disabled} /><select value={column.type} onChange={(event) => onUpdate((current) => ({ ...current, columns: (current.columns || []).map((item, i) => i === columnIndex ? { ...item, type: event.target.value as 'short_text' | 'number' } : item) }))} aria-label={`Tipo da coluna ${columnIndex + 1}`} disabled={disabled}><option value="short_text">Texto</option><option value="number">Número</option></select><button type="button" aria-label={`Remover coluna ${columnIndex + 1}`} disabled={disabled || (question.columns || []).length < 2} onClick={() => onUpdate((current) => ({ ...current, columns: (current.columns || []).filter((_, i) => i !== columnIndex) }))}><X size={14} /></button></div>)}<button type="button" className="questionnaire-text-action" onClick={() => onUpdate((current) => ({ ...current, columns: [...(current.columns || []), { id: crypto.randomUUID(), label: `Coluna ${(current.columns || []).length + 1}`, type: 'short_text' }] }))} disabled={disabled}><Plus size={14} />Adicionar coluna</button></div>}

    {(isNumeric || isText || question.type === 'multiple_choice' || question.type === 'table') && <div className="questionnaire-validation-editor"><strong>Validações</strong><div>
      {isNumeric && <><label>Mínimo<input type="number" value={validation.min ?? ''} onChange={(event) => setValidation('min', event.target.value === '' ? undefined : Number(event.target.value))} disabled={disabled} /></label><label>Máximo<input type="number" value={validation.max ?? ''} onChange={(event) => setValidation('max', event.target.value === '' ? undefined : Number(event.target.value))} disabled={disabled} /></label></>}
      {isText && <><label>Caracteres mínimos<input type="number" min="0" value={validation.minLength ?? ''} onChange={(event) => setValidation('minLength', event.target.value === '' ? undefined : Number(event.target.value))} disabled={disabled} /></label><label>Caracteres máximos<input type="number" min="1" value={validation.maxLength ?? ''} onChange={(event) => setValidation('maxLength', event.target.value === '' ? undefined : Number(event.target.value))} disabled={disabled} /></label></>}
      {question.type === 'multiple_choice' && <><label>Seleções mínimas<input type="number" min="0" value={validation.minSelections ?? ''} onChange={(event) => setValidation('minSelections', event.target.value === '' ? undefined : Number(event.target.value))} disabled={disabled} /></label><label>Seleções máximas<input type="number" min="1" value={validation.maxSelections ?? ''} onChange={(event) => setValidation('maxSelections', event.target.value === '' ? undefined : Number(event.target.value))} disabled={disabled} /></label></>}
      {question.type === 'table' && <><label>Linhas mínimas<input type="number" min="0" value={validation.minRows ?? ''} onChange={(event) => setValidation('minRows', event.target.value === '' ? undefined : Number(event.target.value))} disabled={disabled} /></label><label>Linhas máximas<input type="number" min="1" value={validation.maxRows ?? ''} onChange={(event) => setValidation('maxRows', event.target.value === '' ? undefined : Number(event.target.value))} disabled={disabled} /></label></>}
    </div></div>}
  </article>
}

function QuestionnairePreview({ form, onClose }: { form: QuestionnaireRecord; onClose: () => void }) {
  return <aside className="questionnaire-preview-panel">
    <div className="questionnaire-preview-heading"><span><Eye size={16} />Pré-visualização</span><button type="button" aria-label="Fechar pré-visualização" onClick={onClose}><X size={16} /></button></div>
    <div className="questionnaire-preview-note"><ShieldCheck size={15} /><span>Prévia visual. Nenhuma resposta é coletada ou salva.</span></div>
    <div className="questionnaire-preview-scroll"><div className="questionnaire-preview-form"><span className="fleet-kicker">CENSO MUNICIPAL</span><h3>{form.title || 'Título do questionário'}</h3>{form.subtitle && <h4>{form.subtitle}</h4>}{form.description && <p className="questionnaire-preview-description">{form.description}</p>}
      {form.form_schema.sections.map((section, sectionIndex) => <section className="questionnaire-preview-section" key={section.id}><h4>{section.title || `Seção ${sectionIndex + 1}`}</h4>{section.description && <p>{section.description}</p>}{section.questions.map((question) => <PreviewQuestion key={question.id} question={question} />)}</section>)}
    </div></div>
  </aside>
}

function PreviewQuestion({ question }: { question: QuestionnaireQuestion }) {
  return <div className="questionnaire-preview-question"><label>{question.label || 'Texto da pergunta'}{question.required && <b aria-label="Obrigatória"> *</b>}</label>{question.helpText && <small>{question.helpText}</small>}
    {question.type === 'short_text' && <input type="text" disabled placeholder="Sua resposta" />}
    {question.type === 'phone' && <input type="tel" disabled placeholder="(00) 00000-0000" />}
    {question.type === 'long_text' && <textarea disabled placeholder="Sua resposta" rows={3} />}
    {(question.type === 'number' || question.type === 'currency') && <input type="number" disabled placeholder={question.type === 'currency' ? 'R$ 0,00' : '0'} />}
    {question.type === 'date' && <input type="date" disabled />}
    {question.type === 'yes_no' && <div className="questionnaire-preview-choices"><label><input type="radio" disabled />Sim</label><label><input type="radio" disabled />Não</label></div>}
    {(question.type === 'single_choice' || question.type === 'multiple_choice') && <div className="questionnaire-preview-choices">{(question.options || []).map((option, index) => <label key={`${question.id}-preview-${index}`}><input type={question.type === 'single_choice' ? 'radio' : 'checkbox'} disabled />{option}</label>)}{question.allowOther && <><label><input type={question.type === 'single_choice' ? 'radio' : 'checkbox'} disabled />Outro</label><input type="text" disabled placeholder="Especifique" /></>}</div>}
    {question.type === 'table' && <div className="questionnaire-preview-table-wrap"><table className="questionnaire-preview-table"><thead><tr><th>#</th>{(question.columns || []).map((column) => <th key={column.id}>{column.label}</th>)}</tr></thead><tbody>{Array.from({ length: Math.min(question.validation?.maxRows || 3, 8) }, (_, index) => <tr key={`${question.id}-row-${index}`}><td>{question.rowLabels?.[index] || index + 1}</td>{(question.columns || []).map((column) => <td key={column.id}><span /></td>)}</tr>)}</tbody></table></div>}
    {question.type === 'signature' && <div className="questionnaire-preview-signature"><span>Assinatura</span></div>}
  </div>
}
