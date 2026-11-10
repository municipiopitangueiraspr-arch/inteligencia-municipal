export type QuestionnaireStatus = 'DRAFT' | 'ACTIVE' | 'INACTIVE'

export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'phone'
  | 'number'
  | 'currency'
  | 'date'
  | 'yes_no'
  | 'single_choice'
  | 'multiple_choice'
  | 'table'
  | 'signature'

export type QuestionValidation = {
  min?: number
  max?: number
  minLength?: number
  maxLength?: number
  minSelections?: number
  maxSelections?: number
  minRows?: number
  maxRows?: number
}

export type QuestionnaireTableColumn = {
  id: string
  label: string
  type: 'short_text' | 'number'
}

export type QuestionnaireQuestion = {
  id: string
  code?: string
  label: string
  type: QuestionType
  required: boolean
  helpText?: string
  options?: string[]
  allowOther?: boolean
  columns?: QuestionnaireTableColumn[]
  rowLabels?: string[]
  validation?: QuestionValidation
}

export type QuestionnaireSection = {
  id: string
  title: string
  description?: string
  questions: QuestionnaireQuestion[]
}

export type QuestionnaireSchema = {
  sections: QuestionnaireSection[]
}

export type QuestionnaireRecord = {
  id: string
  slug: string
  title: string
  subtitle: string
  description: string
  status: QuestionnaireStatus
  version: number
  form_schema: QuestionnaireSchema
  created_at: string
  updated_at: string
}
