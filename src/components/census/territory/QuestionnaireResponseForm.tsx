import { useMemo, useRef, useState } from 'react'
import { AlertCircle, Eraser, FileSignature, LoaderCircle, Save, Send, X } from 'lucide-react'
import type { QuestionnaireQuestion, QuestionnaireRecord, QuestionnaireSection } from '../questionnaires/questionnaireTypes'
import { CensusWriteConfirmation } from '../CensusWriteConfirmation'
import { hasAnswer, validateQuestionnaireResponse, type QuestionnaireAnswers, type SignatureAnswer } from './questionnaireResponseLogic'
import { useCensusDialogFocus } from './useCensusDialogFocus'

type QuestionnaireFormSnapshot = Pick<QuestionnaireRecord, 'id' | 'slug' | 'title' | 'subtitle' | 'description' | 'version' | 'form_schema'>
type ResponseStatus = 'DRAFT' | 'SUBMITTED'

type QuestionnaireResponseFormProps = {
  form: QuestionnaireFormSnapshot
  initialAnswers: QuestionnaireAnswers
  readOnly: boolean
  saving: boolean
  responseStatus: ResponseStatus
  onSave: (answers: QuestionnaireAnswers, status: ResponseStatus) => void
  onClose: () => void
}

export function QuestionnaireResponseForm({ form, initialAnswers, readOnly, saving, responseStatus, onSave, onClose }: QuestionnaireResponseFormProps) {
  const [answers, setAnswers] = useState<QuestionnaireAnswers>(initialAnswers)
  const [validationError, setValidationError] = useState('')
  const [confirmClose, setConfirmClose] = useState(false)
  const answersErrors = useMemo(() => validateQuestionnaireResponse(form, answers), [form, answers])
  const isDirty = useMemo(() => JSON.stringify(answers) !== JSON.stringify(initialAnswers), [answers, initialAnswers])

  function updateAnswer(id: string, value: unknown) {
    setAnswers((current) => ({ ...current, [id]: value }))
    setValidationError('')
  }

  function requestSubmit() {
    if (answersErrors.length) {
      setValidationError(answersErrors[0])
      return
    }
    onSave(answers, 'SUBMITTED')
  }

  function requestClose() {
    if (isDirty && !readOnly) setConfirmClose(true)
    else onClose()
  }

  const dialogRef = useCensusDialogFocus(true, requestClose)

  return <div className="census-response-backdrop" role="presentation">
    <section ref={dialogRef} tabIndex={-1} className="census-response-sheet" role="dialog" aria-modal="true" aria-labelledby="census-response-title">
      <header className="census-response-header">
        <div><span className="fleet-kicker">RESPOSTA DO CENSO · VERSÃO {form.version}</span><h2 id="census-response-title">{form.title}</h2>{form.subtitle && <p>{form.subtitle}</p>}</div>
        <button type="button" className="census-icon-button" aria-label="Fechar resposta" onClick={requestClose} disabled={saving}><X size={20} /></button>
      </header>
      {form.description && <p className="census-response-description">{form.description}</p>}
      <div className="census-response-context"><FileSignature size={16} /><span>{readOnly ? `Resposta ${responseStatus === 'SUBMITTED' ? 'enviada' : 'em rascunho'} · histórico preservado` : 'As respostas ficam vinculadas à visita e à versão deste questionário.'}</span></div>
      {validationError && <div className="census-response-alert error" role="alert"><AlertCircle size={16} />{validationError}</div>}
      <div className="census-response-scroll">
        {form.form_schema.sections.map((section, index) => <ResponseSection key={section.id} section={section} sectionIndex={index} answers={answers} readOnly={readOnly} onChange={updateAnswer} />)}
      </div>
      <footer className="census-response-footer">
        <span>{readOnly ? 'Somente leitura' : answersErrors.length ? `${answersErrors.length} campo(s) obrigatório(s) ou inválido(s)` : 'Campos válidos para envio'}</span>
        <div>
          <button type="button" className="fleet-secondary-button" onClick={requestClose} disabled={saving}>Fechar</button>
          {!readOnly && <>
            <button type="button" className="fleet-secondary-button" onClick={() => onSave(answers, 'DRAFT')} disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />}Salvar rascunho</button>
            <button type="button" className="fleet-primary-button" onClick={requestSubmit} disabled={saving}>{saving ? <LoaderCircle className="spin" size={15} /> : <Send size={15} />}Enviar resposta</button>
          </>}
        </div>
      </footer>
    </section>
    {confirmClose && <CensusWriteConfirmation title="Descartar esta resposta?" description="As alterações ainda não salvas serão perdidas. Se preferir, salve o rascunho antes de fechar." confirmLabel="Descartar resposta" onCancel={() => setConfirmClose(false)} onConfirm={onClose} />}
  </div>
}

function ResponseSection({ section, sectionIndex, answers, readOnly, onChange }: { section: QuestionnaireSection; sectionIndex: number; answers: QuestionnaireAnswers; readOnly: boolean; onChange: (id: string, value: unknown) => void }) {
  return <section className="census-response-section">
    <header><span>{String(sectionIndex + 1).padStart(2, '0')}</span><div><h3>{section.title || `Seção ${sectionIndex + 1}`}</h3>{section.description && <p>{section.description}</p>}</div></header>
    {section.questions.map((question) => <ResponseQuestion key={question.id} question={question} value={answers[question.id]} readOnly={readOnly} onChange={(value) => onChange(question.id, value)} />)}
  </section>
}

function ResponseQuestion({ question, value, readOnly, onChange }: { question: QuestionnaireQuestion; value: unknown; readOnly: boolean; onChange: (value: unknown) => void }) {
  const required = question.required && !readOnly
  const fieldLabel = <span className="census-response-label">{question.label}{required && <b aria-label="obrigatória"> *</b>}</span>
  const help = question.helpText && <small className="census-response-help">{question.helpText}</small>
  const invalidClass = question.required && !hasAnswer(value) && !readOnly ? ' invalid' : ''

  if (question.type === 'short_text' || question.type === 'phone' || question.type === 'date' || question.type === 'number' || question.type === 'currency') {
    const type = question.type === 'phone' ? 'tel' : question.type === 'date' ? 'date' : question.type === 'number' || question.type === 'currency' ? 'number' : 'text'
    return <label className={`census-response-question${invalidClass}`}>{fieldLabel}{help}<input type={type} step={question.type === 'currency' ? '0.01' : question.type === 'number' ? '1' : undefined} min={question.validation?.min} max={question.validation?.max} minLength={question.validation?.minLength} maxLength={question.validation?.maxLength} value={value === undefined || value === null ? '' : String(value)} onChange={(event) => onChange(type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} disabled={readOnly} /></label>
  }

  if (question.type === 'long_text') {
    return <label className={`census-response-question${invalidClass}`}>{fieldLabel}{help}<textarea rows={3} minLength={question.validation?.minLength} maxLength={question.validation?.maxLength} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)} disabled={readOnly} /></label>
  }

  if (question.type === 'yes_no') {
    return <fieldset className={`census-response-question census-response-choice${invalidClass}`}><legend>{fieldLabel}{help}</legend><div>{[['Sim', true], ['Não', false]].map(([label, answer]) => <label key={String(label)}><input type="radio" name={question.id} checked={value === answer} onChange={() => onChange(answer)} disabled={readOnly} />{label}</label>)}</div></fieldset>
  }

  if (question.type === 'single_choice') {
    const otherSelected = question.allowOther && typeof value === 'string' && value.startsWith('Outro:')
    const otherText = otherSelected ? value.slice('Outro:'.length).trimStart() : ''
    return <fieldset className={`census-response-question census-response-choice${invalidClass}`}><legend>{fieldLabel}{help}</legend><div>{(question.options || []).map((option) => <label key={option}><input type="radio" name={question.id} checked={value === option} onChange={() => onChange(option)} disabled={readOnly} />{option}</label>)}{question.allowOther && <label><input type="radio" name={question.id} checked={Boolean(otherSelected)} onChange={() => onChange('Outro:')} disabled={readOnly} />Outro</label>}</div>{otherSelected && <input type="text" value={otherText} placeholder="Especifique" onChange={(event) => onChange(`Outro: ${event.target.value}`)} disabled={readOnly} />}</fieldset>
  }

  if (question.type === 'multiple_choice') {
    const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
    const otherValue = question.allowOther ? selected.find((item) => item.startsWith('Outro:')) : undefined
    const otherText = otherValue ? otherValue.slice('Outro:'.length).trimStart() : ''
    return <fieldset className={`census-response-question census-response-choice${invalidClass}`}><legend>{fieldLabel}{help}</legend><div>{(question.options || []).map((option) => <label key={option}><input type="checkbox" checked={selected.includes(option)} onChange={(event) => onChange(event.target.checked ? [...selected, option] : selected.filter((item) => item !== option))} disabled={readOnly} />{option}</label>)}{question.allowOther && <label><input type="checkbox" checked={Boolean(otherValue)} onChange={(event) => onChange(event.target.checked ? [...selected, 'Outro:'] : selected.filter((item) => !item.startsWith('Outro:')))} disabled={readOnly} />Outro</label>}</div>{otherValue && <input type="text" value={otherText} placeholder="Especifique" onChange={(event) => onChange(selected.map((item) => item.startsWith('Outro:') ? `Outro: ${event.target.value}` : item))} disabled={readOnly} />}{question.validation?.maxSelections !== undefined && <small className="census-response-help">Selecione até {question.validation.maxSelections} opção(ões).</small>}</fieldset>
  }

  if (question.type === 'table') {
    const rows = Array.isArray(value) ? value as Array<Record<string, unknown>> : []
    const rowCount = Math.min(question.validation?.maxRows ?? question.rowLabels?.length ?? 8, 12)
    return <div className={`census-response-question census-response-table-question${invalidClass}`}><div>{fieldLabel}{help}</div><div className="census-response-table-wrap"><table className="census-response-table"><thead><tr><th>#</th>{(question.columns || []).map((column) => <th key={column.id}>{column.label}</th>)}</tr></thead><tbody>{Array.from({ length: rowCount }, (_, rowIndex) => <tr key={`${question.id}-row-${rowIndex}`}><th>{question.rowLabels?.[rowIndex] || rowIndex + 1}</th>{(question.columns || []).map((column) => <td key={column.id}><input aria-label={`${question.label}, linha ${rowIndex + 1}, ${column.label}`} type={column.type === 'number' ? 'number' : 'text'} value={String(rows[rowIndex]?.[column.id] ?? '')} disabled={readOnly} onChange={(event) => { const next = rows.slice(); const row = { ...(next[rowIndex] || {}) }; row[column.id] = column.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value; next[rowIndex] = row; onChange(next) }} /></td>)}</tr>)}</tbody></table></div></div>
  }

  if (question.type === 'signature') {
    return <SignatureQuestion question={question} value={value} readOnly={readOnly} onChange={onChange} />
  }

  return <div className="census-response-question"><span>{question.label}</span><p>Este tipo de pergunta ainda não está disponível para preenchimento.</p></div>
}

function SignatureQuestion({ question, value, readOnly, onChange }: { question: QuestionnaireQuestion; value: unknown; readOnly: boolean; onChange: (value: SignatureAnswer) => void }) {
  const signature = value && typeof value === 'object' && 'strokes' in value && Array.isArray((value as SignatureAnswer).strokes) ? value as SignatureAnswer : { strokes: [] }
  const drawing = useRef(false)

  function getPoint(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    return [Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100)), Math.max(0, Math.min(48, ((event.clientY - rect.top) / rect.height) * 48))]
  }

  function start(event: React.PointerEvent<SVGSVGElement>) {
    if (readOnly) return
    const totalPoints = signature.strokes.reduce((total, stroke) => total + stroke.length, 0)
    if (signature.strokes.length >= 20 || totalPoints >= 600) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drawing.current = true
    const point = getPoint(event)
    onChange({ strokes: [...signature.strokes, [point]] })
    event.preventDefault()
  }

  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (!drawing.current || readOnly) return
    const point = getPoint(event)
    const last = signature.strokes.length - 1
    const totalPoints = signature.strokes.reduce((total, stroke) => total + stroke.length, 0)
    if ((signature.strokes[last]?.length || 0) >= 300 || totalPoints >= 600) return
    const strokes = signature.strokes.map((stroke, index) => index === last ? [...stroke, point] : stroke)
    onChange({ strokes })
    event.preventDefault()
  }

  function end() { drawing.current = false }

  return <div className={`census-response-question census-signature-question${question.required && !hasAnswer(signature) && !readOnly ? ' invalid' : ''}`}>
    <span className="census-response-label">{question.label}{question.required && !readOnly && <b aria-label="obrigatória"> *</b>}</span>
    {question.helpText && <small className="census-response-help">{question.helpText}</small>}
    <svg className={readOnly ? 'census-signature-pad readonly' : 'census-signature-pad'} viewBox="0 0 100 48" preserveAspectRatio="none" aria-label={`Assinatura: ${question.label}`} role="img" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      <line x1="4" y1="40" x2="96" y2="40" />
      {signature.strokes.map((stroke, index) => <polyline key={index} points={stroke.map((point) => `${point[0]},${point[1]}`).join(' ')} />)}
    </svg>
    {!readOnly && <button type="button" className="census-signature-clear" onClick={() => onChange({ strokes: [] })} disabled={!signature.strokes.length}><Eraser size={14} />Limpar assinatura</button>}
  </div>
}
