import type { QuestionnaireRecord, QuestionnaireSchema, QuestionnaireSection, QuestionnaireQuestion, QuestionType } from './questionnaireTypes'

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  phone: 'Telefone',
  number: 'Número',
  currency: 'Moeda',
  date: 'Data',
  yes_no: 'Sim / Não',
  single_choice: 'Escolha única',
  multiple_choice: 'Múltipla escolha',
  table: 'Tabela repetível',
  signature: 'Assinatura',
}

export function createEmptyQuestionnaire(): QuestionnaireRecord {
  const id = crypto.randomUUID()
  return {
    id,
    slug: `questionario-${id}`,
    title: '',
    subtitle: '',
    description: '',
    status: 'DRAFT',
    version: 1,
    form_schema: { sections: [] },
    created_at: '',
    updated_at: '',
  }
}

export function createEmptySection(): QuestionnaireSection {
  return { id: crypto.randomUUID(), title: 'Nova seção', description: '', questions: [] }
}

export function createEmptyQuestion(): QuestionnaireQuestion {
  return { id: crypto.randomUUID(), label: 'Nova pergunta', type: 'short_text', required: false, helpText: '', validation: {} }
}

export function moveItem<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items
  const next = [...items]
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}

export function validateQuestionnaire(form: Pick<QuestionnaireRecord, 'title' | 'form_schema'>): string[] {
  const errors: string[] = []
  if (!form.title.trim()) errors.push('Informe o título do questionário.')
  if (!form.form_schema.sections.length) errors.push('Adicione pelo menos uma seção.')

  for (const [sectionIndex, section] of form.form_schema.sections.entries()) {
    if (!section.title.trim()) errors.push(`Informe o título da seção ${sectionIndex + 1}.`)
    for (const [questionIndex, question] of section.questions.entries()) {
      if (!question.label.trim()) errors.push(`Informe o texto da pergunta ${questionIndex + 1} da seção “${section.title || sectionIndex + 1}”.`)
      if ((question.type === 'single_choice' || question.type === 'multiple_choice') && !(question.options || []).some((option) => option.trim())) {
        errors.push(`Adicione pelo menos uma opção à pergunta “${question.label || questionIndex + 1}”.`)
      }
      if (question.type === 'table' && !(question.columns || []).some((column) => column.label.trim())) {
        errors.push(`Adicione pelo menos uma coluna à pergunta “${question.label || questionIndex + 1}”.`)
      }
      const rules = question.validation || {}
      if (rules.min !== undefined && rules.max !== undefined && rules.min > rules.max) errors.push(`O valor mínimo não pode superar o máximo em “${question.label}”.`)
      if (rules.minLength !== undefined && rules.maxLength !== undefined && rules.minLength > rules.maxLength) errors.push(`O tamanho mínimo não pode superar o máximo em “${question.label}”.`)
      if (rules.minSelections !== undefined && rules.maxSelections !== undefined && rules.minSelections > rules.maxSelections) errors.push(`A seleção mínima não pode superar o máximo em “${question.label}”.`)
      if (rules.minRows !== undefined && rules.maxRows !== undefined && rules.minRows > rules.maxRows) errors.push(`O mínimo de linhas não pode superar o máximo em “${question.label}”.`)
    }
  }
  return errors
}

export function questionnaireQuestionCount(schema: QuestionnaireSchema): number {
  return schema.sections.reduce((total, section) => total + section.questions.length, 0)
}

export function cloneQuestionnaire(form: QuestionnaireRecord): QuestionnaireRecord {
  return structuredClone(form)
}
