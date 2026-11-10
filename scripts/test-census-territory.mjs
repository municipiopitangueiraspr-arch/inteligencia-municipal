import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const outputDir = mkdtempSync(join(tmpdir(), 'census-territory-test-'))

try {
  execFileSync('npx', [
    'tsc', '--target', 'ES2022', '--module', 'commonjs', '--skipLibCheck', '--ignoreConfig',
    '--outDir', outputDir, 'src/components/census/territory/questionnaireResponseLogic.ts',
  ], { stdio: 'inherit' })

  const requireFromHere = createRequire(import.meta.url)
  const { countFilledTableRows, hasAnswer, validateQuestionnaireResponse } = requireFromHere(join(outputDir, 'territory/questionnaireResponseLogic.js'))
  const migration = readFileSync('supabase/migrations/202611091915_census_households_visits_responses.sql', 'utf8')
  const territoryCode = readFileSync('src/components/census/territory/CensusTerritory.tsx', 'utf8')
  const responseFormCode = readFileSync('src/components/census/territory/QuestionnaireResponseForm.tsx', 'utf8')
  const focusHookCode = readFileSync('src/components/census/territory/useCensusDialogFocus.ts', 'utf8')
  const confirmationCode = readFileSync('src/components/census/CensusWriteConfirmation.tsx', 'utf8')
  const mapPreparationCode = readFileSync('src/components/census/CensusModule.tsx', 'utf8')
  const questions = [
    { id: 'name', label: 'Nome', type: 'short_text', required: true, validation: { minLength: 2, maxLength: 60 } },
    { id: 'people', label: 'Pessoas', type: 'number', required: true, validation: { min: 1, max: 20 } },
    { id: 'housing', label: 'Situação do imóvel', type: 'single_choice', required: true, options: ['Própria', 'Alugada'], allowOther: true },
    { id: 'benefits', label: 'Benefícios', type: 'multiple_choice', required: false, options: ['Bolsa Família', 'BPC'], allowOther: true, validation: { minSelections: 1, maxSelections: 3 } },
    { id: 'residents', label: 'Moradores', type: 'table', required: true, columns: [{ id: 'name', label: 'Nome', type: 'short_text' }, { id: 'age', label: 'Idade', type: 'number' }], validation: { minRows: 1, maxRows: 2 } },
    { id: 'signature', label: 'Assinatura', type: 'signature', required: true },
  ]
  const form = { form_schema: { sections: [{ id: 'section-1', title: 'Cadastro', questions }] } }
  const validAnswers = {
    name: 'Ana da Silva', people: 3, housing: 'Própria', benefits: ['Bolsa Família', 'Outro: auxílio local'],
    residents: [{ name: 'Ana da Silva', age: 42 }, { name: 'Pedro', age: 13 }],
    signature: { strokes: [[[2, 3], [14, 18], [34, 20]]] },
  }

  assert.deepEqual(validateQuestionnaireResponse(form, validAnswers), [], 'respostas válidas passam pelas regras')
  assert.equal(countFilledTableRows(validAnswers.residents, questions[4]), 2, 'conta apenas linhas preenchidas da tabela')
  assert.equal(hasAnswer(validAnswers.signature), true, 'assinatura com traços não é vazia')
  assert.equal(hasAnswer({ strokes: [] }), false, 'assinatura sem traços é vazia')

  const missing = validateQuestionnaireResponse(form, {})
  assert.ok(missing.some((message) => message.includes('Nome')))
  assert.ok(missing.some((message) => message.includes('Pessoas')))
  assert.ok(missing.some((message) => message.includes('Moradores')))
  assert.ok(missing.some((message) => message.includes('Assinatura')))

  const outOfRange = validateQuestionnaireResponse(form, {
    ...validAnswers, people: 0, name: 'A', housing: 'Outro:',
    benefits: ['BPC', 'Bolsa Família', 'Outro: extra', 'Outra: inválida'],
    residents: [{ name: 'A', age: 1 }, { name: 'B', age: 2 }, { name: 'C', age: 3 }],
  })
  assert.ok(outOfRange.some((message) => message.includes('mínimo 1')))
  assert.ok(outOfRange.some((message) => message.includes('pelo menos 2')))
  assert.ok(outOfRange.some((message) => message.includes('Especifique')))
  assert.ok(outOfRange.some((message) => message.includes('opções selecionadas')))
  assert.ok(outOfRange.some((message) => message.includes('no máximo 2 linha(s)')))

  const fractional = validateQuestionnaireResponse(form, {
    ...validAnswers, people: 2.5, residents: [{ name: 'Ana', age: 3.5 }],
  })
  assert.ok(fractional.some((message) => message.includes('número inteiro em “Pessoas”')))
  assert.ok(fractional.some((message) => message.includes('número inteiro na coluna “Idade”')))
  const malformedSignature = validateQuestionnaireResponse(form, { ...validAnswers, signature: { strokes: [[]] } })
  assert.ok(malformedSignature.some((message) => message.includes('traços válidos')))
  const outOfBoundsSignature = validateQuestionnaireResponse(form, { ...validAnswers, signature: { strokes: [[[2, 3], [101, 10]]] } })
  assert.ok(outOfBoundsSignature.some((message) => message.includes('traços válidos')))

  assert.match(migration, /create table if not exists public\.census_households/i)
  assert.match(migration, /create table if not exists public\.census_visits/i)
  assert.match(migration, /create table if not exists public\.census_questionnaire_responses/i)
  assert.match(migration, /questionnaire_snapshot jsonb not null/i)
  assert.match(migration, /on delete restrict/i)
  assert.match(migration, /division_saved_at timestamptz/i)
  assert.match(migration, /create or replace view public\.census_territory_map_imports[\s\S]*?division_saved_at is not null/i)
  assert.match(migration, /create or replace view public\.census_territory_map_lots[\s\S]*?security_invoker\s*=\s*true/i)
  assert.match(migration, /create or replace view public\.census_household_map_summary[\s\S]*?security_invoker\s*=\s*true/i)
  assert.match(migration, /assignment\.active is true[\s\S]*?acs\.active is true[\s\S]*?auth\.jwt\(\)/i)
  assert.match(migration, /census_map_lots_admin_manage[\s\S]*?app_private\.current_user_is_admin\(\)/i)
  assert.match(migration, /census_maps_storage_admin_manage[\s\S]*?app_private\.current_user_is_admin\(\)/i)
  assert.match(migration, /census_questionnaires_admin_manage[\s\S]*?app_private\.current_user_is_admin\(\)/i)
  assert.match(migration, /census_visits_assign_acs_actor[\s\S]*?auth\.jwt\(\)/i)
  assert.match(migration, /census_map_imports_select_accessible[\s\S]*?census_user_can_access_import\(id\)/i)
  assert.match(migration, /census_acs_zone_assignments_admin_manage[\s\S]*?app_private\.current_user_is_admin\(\)/i)
  assert.match(migration, /census_questionnaires_active_read[\s\S]*?status = 'ACTIVE'/i)
  assert.match(migration, /new\.questionnaire_version <> questionnaire\.version/i)
  assert.match(migration, /census_validate_questionnaire_answers\(p_form_schema jsonb, p_answers jsonb, p_require_complete boolean\)/i)
  assert.match(migration, /new\.questionnaire_snapshot -> 'form_schema', new\.answers, new\.status = 'SUBMITTED'/i)
  assert.match(migration, /p_require_complete and required_value/i)
  assert.match(migration, /numeric_value <> trunc\(numeric_value\)/i)
  assert.match(migration, /selected_count > 600/i)
  assert.match(migration, /census_validate_questionnaire_answers/i)
  assert.match(migration, /Uma resposta enviada não pode ser alterada/i)
  assert.doesNotMatch(migration, /create policy census_(?:map_imports|map_lots|acs|zones)_open_authenticated/i)
  assert.match(territoryCode, /\.from\('census_territory_map_imports'\)/)
  assert.match(territoryCode, /useCensusDialogFocus\(Boolean\(visitDraft\)/)
  assert.match(responseFormCode, /useCensusDialogFocus\(true/)
  assert.match(focusHookCode, /event\.key === 'Escape'/)
  assert.match(focusHookCode, /event\.key !== 'Tab'/)
  assert.match(confirmationCode, /useCensusDialogFocus\(true/)
  assert.match(mapPreparationCode, /update\(\{ division_saved_at: null \}\)/)
  assert.match(mapPreparationCode, /division_saved_at: savedAt/)
  assert.match(migration, /grant select, insert, update on table public\.census_households, public\.census_visits, public\.census_questionnaire_responses to authenticated/i)
  assert.doesNotMatch(migration, /grant[^;]*\bdelete\b[^;]*to authenticated/i)
  assert.doesNotMatch(migration, /\bdrop\s+table\b|\btruncate\b/i, 'migration preserva estrutura e dados existentes')

  console.log('PASS: respostas válidas e inválidas, tabela, “Outro”, assinatura, RLS por zona, snapshot e histórico imutável.')
} finally {
  rmSync(outputDir, { recursive: true, force: true })
}
