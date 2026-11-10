import type { QuestionnaireRecord, QuestionnaireQuestion } from '../questionnaires/questionnaireTypes'

export type SignatureAnswer = { strokes: number[][][] }
export type QuestionnaireAnswers = Record<string, unknown>

const SIGNATURE_MAX_STROKES = 20
const SIGNATURE_MAX_POINTS = 600

function isBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim().length === 0
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object' && 'strokes' in value) {
    const strokes = (value as SignatureAnswer).strokes
    return !Array.isArray(strokes) || strokes.length === 0
  }
  return false
}

function isSignature(value: unknown): value is SignatureAnswer {
  if (!value || typeof value !== 'object' || !Array.isArray((value as SignatureAnswer).strokes)) return false
  const strokes = (value as SignatureAnswer).strokes
  if (!strokes.length || strokes.length > SIGNATURE_MAX_STROKES) return false
  const points = strokes.flat()
  if (points.length < 2 || points.length > SIGNATURE_MAX_POINTS) return false
  return strokes.every((stroke) => Array.isArray(stroke) && stroke.length > 0 && stroke.every((point) =>
    Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1])
    && point[0] >= 0 && point[0] <= 100 && point[1] >= 0 && point[1] <= 48,
  ))
}

function filledTableRows(value: unknown, question: QuestionnaireQuestion): number {
  if (!Array.isArray(value)) return 0
  const columns = question.columns || []
  return value.filter((row) => row && typeof row === 'object' && columns.some((column) => !isBlank((row as Record<string, unknown>)[column.id]))).length
}

function validateQuestion(question: QuestionnaireQuestion, value: unknown): string | null {
  const label = question.label || 'Pergunta sem título'
  const validation = question.validation || {}

  if (question.required && isBlank(value)) return `Preencha “${label}”.`
  if (isBlank(value)) return null

  if (question.type === 'short_text' || question.type === 'long_text' || question.type === 'phone') {
    if (typeof value !== 'string') return `Confira o campo “${label}”.`
    if (validation.minLength !== undefined && value.trim().length < validation.minLength) return `“${label}” deve ter pelo menos ${validation.minLength} caractere(s).`
    if (validation.maxLength !== undefined && value.length > validation.maxLength) return `“${label}” deve ter no máximo ${validation.maxLength} caractere(s).`
  }

  if (question.type === 'number' || question.type === 'currency') {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return `Informe um número válido em “${label}”.`
    if (question.type === 'number' && !Number.isInteger(numeric)) return `Informe um número inteiro em “${label}”.`
    if (validation.min !== undefined && numeric < validation.min) return `“${label}” deve ser no mínimo ${validation.min}.`
    if (validation.max !== undefined && numeric > validation.max) return `“${label}” deve ser no máximo ${validation.max}.`
  }

  if (question.type === 'single_choice') {
    if (typeof value !== 'string') return `Selecione uma opção válida em “${label}”.`
    if (question.allowOther && value.startsWith('Outro:')) {
      if (value.slice('Outro:'.length).trim().length === 0) return `Especifique a opção “Outro” em “${label}”.`
    } else if (!(question.options || []).includes(value)) return `Selecione uma opção válida em “${label}”.`
  }

  if (question.type === 'yes_no' && typeof value !== 'boolean') return `Escolha Sim ou Não em “${label}”.`

  if (question.type === 'multiple_choice') {
    if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || (!(question.options || []).includes(item) && !(question.allowOther && item.startsWith('Outro:'))))) return `Confira as opções selecionadas em “${label}”.`
    if (question.allowOther && value.some((item) => typeof item === 'string' && item.startsWith('Outro:') && item.slice('Outro:'.length).trim().length === 0)) return `Especifique a opção “Outro” em “${label}”.`
    if (validation.minSelections !== undefined && value.length < validation.minSelections) return `Selecione pelo menos ${validation.minSelections} opção(ões) em “${label}”.`
    if (validation.maxSelections !== undefined && value.length > validation.maxSelections) return `Selecione no máximo ${validation.maxSelections} opção(ões) em “${label}”.`
  }

  if (question.type === 'table') {
    if (!Array.isArray(value)) return `Confira a tabela “${label}”.`
    const rows = filledTableRows(value, question)
    for (const row of value) {
      if (!row || typeof row !== 'object') continue
      for (const column of question.columns || []) {
        if (column.type !== 'number' || isBlank((row as Record<string, unknown>)[column.id])) continue
        const numeric = Number((row as Record<string, unknown>)[column.id])
        if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return `Informe um número inteiro na coluna “${column.label}” de “${label}”.`
      }
    }
    if (question.required && rows === 0) return `Preencha pelo menos uma linha em “${label}”.`
    if (validation.minRows !== undefined && rows < validation.minRows) return `“${label}” precisa ter pelo menos ${validation.minRows} linha(s) preenchida(s).`
    if (validation.maxRows !== undefined && rows > validation.maxRows) return `“${label}” aceita no máximo ${validation.maxRows} linha(s).`
  }

  if (question.type === 'signature' && !isSignature(value)) return `A assinatura de “${label}” precisa conter traços válidos dentro da área de assinatura.`
  return null
}

export function validateQuestionnaireResponse(form: Pick<QuestionnaireRecord, 'form_schema'>, answers: QuestionnaireAnswers): string[] {
  const errors: string[] = []
  for (const section of form.form_schema.sections) {
    for (const question of section.questions) {
      const error = validateQuestion(question, answers[question.id])
      if (error) errors.push(error)
    }
  }
  return errors
}

export function countFilledTableRows(value: unknown, question: QuestionnaireQuestion): number {
  return filledTableRows(value, question)
}

export function hasAnswer(value: unknown): boolean {
  return !isBlank(value)
}
