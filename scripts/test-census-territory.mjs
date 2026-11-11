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
    '--outDir', outputDir, 'src/components/census/territory/questionnaireResponseLogic.ts', 'src/components/census/territory/lotDisplay.ts',
  ], { stdio: 'inherit' })

  const requireFromHere = createRequire(import.meta.url)
  const { countFilledTableRows, hasAnswer, validateQuestionnaireResponse } = requireFromHere(join(outputDir, 'territory/questionnaireResponseLogic.js'))
  const { getMapLotCode, normalizeCadLabel } = requireFromHere(join(outputDir, 'territory/lotDisplay.js'))
  const migration = readFileSync('supabase/migrations/202611091915_census_households_visits_responses.sql', 'utf8')
  const lotAcsMigration = readFileSync('supabase/migrations/202611100910_census_lot_acs_assignments.sql', 'utf8')
  const territoryCode = readFileSync('src/components/census/territory/CensusTerritory.tsx', 'utf8')
  const responseFormCode = readFileSync('src/components/census/territory/QuestionnaireResponseForm.tsx', 'utf8')
  const focusHookCode = readFileSync('src/components/census/territory/useCensusDialogFocus.ts', 'utf8')
  const confirmationCode = readFileSync('src/components/census/CensusWriteConfirmation.tsx', 'utf8')
  const censusModuleCode = readFileSync('src/components/census/CensusModule.tsx', 'utf8')
  const familiesCode = readFileSync('src/components/census/CensusFamiliesVisits.tsx', 'utf8')
  const overviewCode = readFileSync('src/components/census/CensusOverview.tsx', 'utf8')
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
  assert.equal(normalizeCadLabel('\\fSegoe UI Black|i0|b1;\\H1.68674;40-A-REM-REM'), '40-A-REM-REM', 'remove formatação CAD e preserva o código legível')
  assert.equal(normalizeCadLabel('\fSegoe UI Black|i0|b1;\\H1.68674;40-A-REM-REM'), '40-A-REM-REM', 'limpa o caractere de controle CAD quando ele é importado literalmente')
  assert.equal(normalizeCadLabel('Lote {\\C7; 12\\PQuadra 3}'), 'Lote 12 Quadra 3', 'remove códigos inline e converte quebras CAD em espaços')
  assert.equal(getMapLotCode('\\fArial;40-A-REM-REM', '1A2B', 1), '40-A-REM-REM', 'prioriza o rótulo legível do mapa')
  assert.equal(getMapLotCode(null, '1A2B', 1), '1A2B', 'usa handle persistente quando não há rótulo')
  assert.equal(getMapLotCode(null, null, 7), 'Lote 0007', 'usa ordinal apenas como último recurso')

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
  assert.match(censusModuleCode, /update\(\{ division_saved_at: null \}\)/)
  assert.match(censusModuleCode, /division_saved_at: savedAt/)
  assert.match(migration, /grant select, insert, update on table public\.census_households, public\.census_visits, public\.census_questionnaire_responses to authenticated/i)
  assert.doesNotMatch(migration, /grant[^;]*\bdelete\b[^;]*to authenticated/i)
  assert.doesNotMatch(migration, /\bdrop\s+table\b|\btruncate\b/i, 'migration preserva estrutura e dados existentes')
  assert.match(lotAcsMigration, /create table if not exists public\.census_lot_acs_assignments/i)
  assert.match(lotAcsMigration, /create unique index if not exists census_lot_acs_assignments_one_active_per_lot_idx/i)
  assert.match(lotAcsMigration, /create or replace function public\.census_user_can_access_lot[\s\S]*?census_lot_acs_assignments[\s\S]*?census_acs_zone_assignments/i)
  assert.match(lotAcsMigration, /create or replace function public\.census_get_lot_acs/i)
  assert.match(lotAcsMigration, /create or replace function public\.census_assign_acs_to_lot[\s\S]*?current_user_is_admin\(\)/i)
  assert.match(lotAcsMigration, /grant execute on function public\.census_assign_acs_to_lot\(uuid, uuid\) to authenticated/i)
  assert.match(lotAcsMigration, /revoke all on table public\.census_lot_acs_assignments from public, anon, authenticated/i)
  assert.doesNotMatch(lotAcsMigration, /\bdrop\s+table\b|\btruncate\b/i, 'migration do vínculo preserva os registros existentes')
  assert.match(territoryCode, /census_get_lot_acs/)
  assert.match(territoryCode, /census_assign_acs_to_lot/)
  assert.match(territoryCode, /Aplicar questionário/)
  assert.match(territoryCode, /fetchAllPages<TerritoryLot>/)
  assert.match(territoryCode, /fetchAllPages<Household>/)
  assert.match(censusModuleCode, /\.from\('census_territory_map_imports'\)/, 'Preparar mapa consulta a mesma origem publicada do Mapa territorial')
  assert.match(censusModuleCode, /\.from\('census_territory_map_lots'\)/, 'Preparar mapa consulta os mesmos lotes publicados do Mapa territorial')
  assert.match(censusModuleCode, /fetchTerritoryLots\(supabase, current\.id\)/, 'Preparar mapa pagina os lotes publicados sem limite arbitrário de 5.000')
  assert.match(censusModuleCode, /status', 'DRAFT'/, 'Preparar mapa mantém fallback para rascunho recém-importado')
  assert.match(censusModuleCode, /CensusFamiliesVisits/, 'a navegação abre o painel de Famílias e Visitas')
  assert.match(familiesCode, /census_families_visits_dashboard_rows/, 'o painel consulta a view consolidada de Famílias e visitas')
  assert.match(familiesCode, /latest_visit_status|visit_count/, 'a view fornece estado e contagem de visitas')
  assert.match(familiesCode, /submitted_questionnaire_count|latest_questionnaire_status/, 'a view fornece estado e contagem de questionários')
  assert.match(overviewCode, /census_map_lots/, 'a visão geral consulta lotes do mapa')
  assert.match(overviewCode, /census_visits/, 'a visão geral consulta visitas')
  assert.match(overviewCode, /Até onde o trabalho já avançou/, 'a visão geral explica o progresso de forma objetiva')
  assert.match(overviewCode, /Lotes com visita concluída/, 'a visão geral mostra a etapa de visitas no funil')
  assert.match(overviewCode, /census-overview-context-copy/, 'a visão geral destaca a próxima atenção necessária')
  assert.match(censusModuleCode, /supabase\.auth\.getUser/, 'o usuário do módulo vem da sessão autenticada')
  assert.match(censusModuleCode, /avatar_url|photo_url/, 'o perfil aceita foto do usuário autenticado')
  assert.match(censusModuleCode, /census-mobile-menu/, 'o Censo possui menu compacto para telas menores')
  assert.doesNotMatch(censusModuleCode, /from\('census_acs'\).*full_name.*authUser\.email/, 'ACS não é usado como usuário alternativo')
  assert.match(territoryCode, /pointerMapRef/, 'Mapa territorial acompanha múltiplos dedos')
  assert.match(territoryCode, /pinchRef/, 'Mapa territorial possui pinch-to-zoom')
  assert.match(territoryCode, /pendingLotRef/, 'Mapa territorial permite iniciar pan sobre um lote')
  assert.match(censusModuleCode, /pointerMapRef/, 'Preparar mapa acompanha múltiplos dedos')
  assert.match(censusModuleCode, /pinchRef/, 'Preparar mapa possui pinch-to-zoom')
  assert.match(censusModuleCode, /pendingLotKeyRef/, 'Preparar mapa diferencia toque de pan sobre lote')
  assert.match(territoryCode, /function movePan\(event: ReactPointerEvent<HTMLDivElement>\) \{\s*if \(!pointerMapRef\.current\.has\(event\.pointerId\)\) return/, 'Mapa territorial só move após pointer-down')
  assert.match(censusModuleCode, /function moveDrag\(event: React\.PointerEvent<HTMLDivElement>\) \{\s*if \(!pointerMapRef\.current\.has\(event\.pointerId\)\) return/, 'Preparar mapa só move após pointer-down')
  assert.match(territoryCode, /type MapMode = 'zones' \| 'questionnaire' \| 'visits'/, 'Mapa Territorial possui os três modos de visualização')
  assert.match(territoryCode, /census-map-mode-tabs/, 'Mapa Territorial exibe seletor dos modos')
  assert.match(territoryCode, /census-map-metrics/, 'Mapa Territorial exibe indicadores de cobertura')
  assert.match(territoryCode, /showOnlyPending/, 'Mapa Territorial permite mostrar somente pendências')
  assert.match(territoryCode, /coverageResponses/, 'Mapa Territorial calcula cobertura pelas respostas reais')
  assert.match(territoryCode, /type VisitMapStatus = 'completed' \| 'in_progress' \| 'no_contact' \| 'no_visit' \| 'no_activity' \| 'cancelled'/, 'Situação das visitas distingue cadastro sem atividade')
  assert.match(territoryCode, /visitStatusByLot/, 'Situação das visitas é calculada sem respostas de questionários')
  assert.match(territoryCode, /mapMode === 'visits' \? visitStatusColors/, 'Modo visitas usa cores próprias')
  assert.match(territoryCode, /mapMode === 'questionnaire' && <div className="census-map-filter-row"/, 'Seletor de questionário aparece apenas na cobertura')
  assert.match(territoryCode, /no_activity: 'Sem cadastro e sem atividade'/, 'Legenda nomeia lotes sem cadastro e sem atividade')
  assert.match(territoryCode, /mapMode === 'zones' \? \(lot\.zone_id \? getLotFillColor\(lot, zones\) : 'var\(--acs-chart-no-activity\)'\)/, 'Lotes sem zona usam a cor neutra escura')
  assert.match(territoryCode, /const fill = mapMode === 'zones' \? .*: statusColors\[status\]/, 'Cobertura do questionário usa cor própria para cada estado')
  assert.doesNotMatch(territoryCode, /stroke=\"none\" strokeWidth=\"0\"/, 'Contorno dos lotes é controlado pelo tema do mapa')
  assert.match(censusModuleCode, /stroke=\"none\" strokeWidth=\"0\"/, 'Preparar mapa não desenha borda nos lotes')
  const territoryCss = readFileSync('src/components/census/territory/CensusTerritory.css', 'utf8')
  const moduleCss = readFileSync('src/components/census/CensusModule.css', 'utf8')
  assert.match(territoryCss, /census-selected-lot-pulse/, 'Mapa territorial destaca o lote selecionado com pulso')
  assert.match(moduleCss, /census-selected-lot-pulse-prep/, 'Preparar mapa destaca o lote selecionado com pulso')
  assert.match(territoryCss, /polygon:not\(\.selected\)\{stroke:#fff!important/, 'Mapa territorial usa contornos claros entre os lotes')
  assert.match(moduleCss, /polygon\.census-lot-selected\{stroke:none!important/, 'Preparar mapa não cria moldura no lote selecionado')
  assert.match(territoryCss, /polygon:focus,\.census-territory-svg polygon:focus-visible\{outline:none!important/, 'Mapa territorial remove o retângulo nativo de foco')
  assert.match(moduleCss, /polygon:focus,\.census-workspace-svg polygon:focus-visible\{outline:none!important/, 'Preparar mapa remove o retângulo nativo de foco')
  assert.match(territoryCode, /Aplicar questionário/, 'Dossiê oferece aplicação de questionário por domicílio')
  assert.match(territoryCode, /Adicionar domicílio/, 'Dossiê permite adicionar mais de um domicílio no lote')
  assert.doesNotMatch(territoryCode, /census-household-visit-button.*Registrar visita/, 'Ação principal do domicílio não é mais registrar visita')

  console.log('PASS: respostas, rótulos CAD, códigos de lote, RLS por zona/lote, atribuição ACS, histórico e migration aditiva.')
} finally {
  rmSync(outputDir, { recursive: true, force: true })
}
