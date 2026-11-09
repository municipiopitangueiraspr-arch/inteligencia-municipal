import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const outputDir = mkdtempSync(join(tmpdir(), 'census-questionnaires-test-'))

try {
  execFileSync('npx', [
    'tsc',
    '--target', 'ES2022',
    '--module', 'commonjs',
    '--skipLibCheck',
    '--ignoreConfig',
    '--outDir', outputDir,
    'src/components/census/questionnaires/questionnaireLogic.ts',
  ], { stdio: 'inherit' })

  const requireFromHere = createRequire(import.meta.url)
  const { moveItem, questionnaireQuestionCount, validateQuestionnaire } = requireFromHere(join(outputDir, 'questionnaireLogic.js'))
  const migration = readFileSync('supabase/migrations/202611091853_census_questionnaires.sql', 'utf8')
  const seedMatch = migration.match(/\$questionnaire\$\s*([\s\S]*?)\s*\$questionnaire\$/)
  assert.ok(seedMatch, 'migration contém a ficha inicial em JSONB')

  const form = {
    title: 'FICHA DE CADASTRO E ACOMPANHAMENTO DOMICILIAR',
    subtitle: 'Levantamento Socioeconômico, Habitacional e de Saúde Familiar',
    status: 'DRAFT',
    form_schema: JSON.parse(seedMatch[1]),
  }
  const sections = form.form_schema.sections
  const questions = sections.flatMap((section) => section.questions)
  const types = new Set(questions.map((question) => question.type))
  const questionIds = questions.map((question) => question.id)

  assert.equal(form.title, 'FICHA DE CADASTRO E ACOMPANHAMENTO DOMICILIAR')
  assert.equal(form.subtitle, 'Levantamento Socioeconômico, Habitacional e de Saúde Familiar')
  assert.equal(form.status, 'DRAFT', 'a ficha fica pronta para revisão antes de ser ativada')
  assert.deepEqual(sections.slice(1).map((section) => section.title), [
    '1. COMPOSIÇÃO FAMILIAR',
    '2. CONDIÇÕES DE MORADIA E INFRAESTRUTURA',
    '3. TRABALHO, RENDA E BENEFÍCIOS SOCIAIS',
    '4. CONDIÇÕES DE SAÚDE DA FAMÍLIA',
  ])
  assert.equal(new Set(questionIds).size, questionIds.length, 'IDs de perguntas são únicos')
  assert.equal(questionnaireQuestionCount(form.form_schema), questions.length)
  assert.deepEqual(validateQuestionnaire(form), [], 'a ficha inicial passa pelas validações do editor')
  assert.deepEqual(moveItem(['A', 'B', 'C'], 1, -1), ['B', 'A', 'C'], 'reordenação move a seção na direção solicitada')
  assert.deepEqual(questions.filter((question) => question.code).map((question) => question.code), ['1.1', '1.2', '2.1', '2.2', '2.3', '3.1', '3.2', '3.3', '4.1', '4.2', '4.3', '4.4'])
  const exactPrompts = [
    '1.1. Quantas pessoas moram na residência (incluindo crianças e idosos)?',
    '1.2. Relação de moradores e suas respectivas idades:',
    '2.1. Situação do imóvel:',
    '2.2. Quantos cômodos possui a casa ao todo (incluindo banheiro e cozinha)?',
    "2.3. A residência possui caixa d'água?",
    '3.1. Quantas pessoas trabalham na residência (trabalho formal ou informal)?',
    '3.2. Qual é a renda familiar mensal aproximada (soma de todos os moradores)?',
    '3.3. A família recebe algum benefício municipal ou federal?',
    '4.1. Alguma pessoa na residência possui algum tipo de doença crônica?',
    '4.2. Há alguém na residência aguardando algum tipo de serviço médico?',
    '4.3. Alguém na residência faz uso de medicamentos contínuos?',
    '4.4. Alguém na casa fuma?',
  ]
  for (const prompt of exactPrompts) assert.ok(questions.some((question) => question.label === prompt), `pergunta preservada: ${prompt}`)

  const residents = questions.find((question) => question.code === '1.2')
  assert.equal(residents.type, 'table')
  assert.deepEqual(residents.columns.map((column) => column.label), ['Nome / Parentesco do Morador', 'Idade'])
  assert.equal(residents.validation.maxRows, 8)
  assert.deepEqual(residents.rowLabels, ['1. (Responsável)', '2.', '3.', '4.', '5.', '6.', '7.', '8.'])
  assert.deepEqual(questions.find((question) => question.code === '2.1').options, ['Própria', 'Alugada', 'Cedida / Emprestada', 'Outra (com especificação)'])
  assert.deepEqual(questions.find((question) => question.code === '3.2').options, ['Sem renda', 'Até 1 salário mínimo', 'De 1 a 2 salários mínimos', 'De 2 a 3 salários mínimos', 'Acima de 3 salários mínimos'])
  assert.deepEqual(questions.find((question) => question.id === 'q-3-3-beneficios').options, ['Bolsa Família', 'BPC / LOAS', 'Auxílio Gás', 'Tarifa Social de Energia', 'Outro(s) benefício(s) — especificar'])
  assert.deepEqual(questions.find((question) => question.id === 'q-4-2-servicos').options, ['Cirurgia', 'Consulta Especializada', 'Exame de média/alta complexidade'])
  assert.ok(types.has('date') && types.has('phone') && types.has('currency') && types.has('yes_no') && types.has('single_choice') && types.has('multiple_choice') && types.has('signature'))
  assert.ok(questions.some((question) => question.label === 'Outro(s) benefício(s), com especificação em texto:'))
  assert.ok(questions.some((question) => question.label === "2.3. A residência possui caixa d'água?"))

  assert.ok(validateQuestionnaire({ title: '', form_schema: { sections: [] } }).length >= 2, 'título e seção vazios são rejeitados')
  const invalidRange = structuredClone(form)
  invalidRange.form_schema.sections[1].questions[0].validation = { min: 9, max: 1 }
  assert.ok(validateQuestionnaire(invalidRange).some((message) => message.includes('valor mínimo')))
  assert.match(migration, /alter table public\.census_questionnaires enable row level security/i)
  assert.match(migration, /grant select, insert, update on table public\.census_questionnaires to authenticated/i)
  assert.match(migration, /on conflict \(slug\) do nothing/i)

  console.log(`PASS: ficha inicial, ${sections.length} seções, ${questions.length} perguntas, tabela de 8 moradores, validações e proteção RLS.`)
} finally {
  rmSync(outputDir, { recursive: true, force: true })
}
