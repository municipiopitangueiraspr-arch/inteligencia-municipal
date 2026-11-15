import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20261115190000_module_scoped_access_governance.sql', 'utf8')
const grantableRoles = readFileSync('supabase/migrations/20261115191000_module_access_grantable_roles.sql', 'utf8')
const panel = readFileSync('src/components/GovernancePanel.tsx', 'utf8')
const module = readFileSync('src/components/census/CensusModule.tsx', 'utf8')
const accessScreen = readFileSync('src/components/census/CensusModuleAccess.tsx', 'utf8')
const edgeFunction = readFileSync('supabase/functions/invite-municipal-user/index.ts', 'utf8')

for (const roleId of ['ACS', 'ACE', 'HEALTH_MANAGER', 'HEALTH_SUPERVISOR', 'HEALTH_PROFESSIONAL', 'NURSE', 'PHYSICIAN']) {
  assert.ok(migration.includes(`('${roleId}', 'census')`), `${roleId} fica restrito ao módulo Saúde`)
}
assert.match(migration, /municipal_role_module_compatible/i)
assert.match(migration, /O papel selecionado não é compatível com um ou mais módulos/i)
assert.match(migration, /municipal_module_access_can_manage/i)
assert.match(migration, /governance\.module_access\.manage/i)
assert.match(migration, /WITH RECURSIVE roots AS/i, 'o escopo do gestor inclui a unidade raiz e as descendentes')
assert.match(migration, /outside_scope/i)
assert.match(migration, /protected/i, 'papéis de administração/gestão não são alteráveis por gestor de módulo')
assert.match(migration, /replaced_assignment_ids/i, 'a auditoria guarda a transição e preserva concessões de outros módulos')
assert.match(migration, /MODULE_ACCESS_SAVE/i)
assert.match(migration, /MODULE_ACCESS_REVOKE/i)
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.municipal_module_access_list\(text\) TO authenticated/i)
assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.municipal_module_access_save\(text, integer, text, text, boolean, date\) TO authenticated/i)
assert.match(migration, /REVOKE ALL ON TABLE public\.municipal_role_module_restrictions FROM PUBLIC, anon, authenticated/i)
assert.match(grantableRoles, /VALUES \('census', 'ACS'\), \('census', 'HEALTH_SUPERVISOR'\)/)
assert.match(grantableRoles, /municipal_module_access_role_grantable/i, 'o servidor impede papéis sem fluxo ativo, mesmo se a RPC for chamada diretamente')
assert.match(grantableRoles, /REVOKE ALL ON FUNCTION public\.municipal_module_access_list_internal\(text\) FROM PUBLIC, anon, authenticated/i)
assert.match(grantableRoles, /REVOKE ALL ON FUNCTION public\.municipal_module_access_save_internal\(text, integer, text, text, boolean, date\) FROM PUBLIC, anon, authenticated/i)

assert.match(module, /hasPermission\('governance\.module_access\.manage'\)/)
assert.match(module, /hasRole\('HEALTH_MANAGER'\) \|\| accessContext\.hasRole\('UNIT_MANAGER'\)/)
assert.match(module, /view === 'access' && canManageModuleAccess/)
assert.match(module, /useState<CensusSection>\('denied'\)/, 'nenhum painel deve renderizar antes da validação do escopo')
assert.match(module, /missingAcsIdentity/, 'papel ACS sem identidade profissional não cai na visão gerencial')
assert.match(module, /setView\(denied \? 'denied' : 'territory'\)/, 'o ACS autorizado continua entrando pelo Mapa territorial')
assert.match(module, /Seu acesso recebeu o papel ACS|Sua conta recebeu o papel ACS/)
assert.ok(!module.includes("view === 'access' && access.role === 'acs'"), 'ACS não recebe o painel de gestão de acessos')

assert.match(accessScreen, /municipal_module_access_list/)
assert.match(accessScreen, /municipal_module_access_save/)
assert.match(accessScreen, /não cria contas, não envia convites, não altera outros módulos/i)
assert.match(accessScreen, /cadastro em Profissionais e ACS e os vínculos oficiais de equipe e microárea/i)
assert.match(accessScreen, /Esta lista inclui apenas papéis com fluxo ativo nesta tela/i)
assert.doesNotMatch(accessScreen, /\.from\(['"]municipal_user_assignments['"]\)/, 'o cliente não grava diretamente em tabelas de atribuição')
assert.doesNotMatch(accessScreen, /inviteUserByEmail|invite-municipal-user/i, 'a gestão de módulo não cria convites')

assert.match(panel, /HEALTH_DOMAIN_ROLE_IDS/)
assert.match(panel, /isModuleRoleAllowed\(draft\.role_id, module\.id\)/)
assert.match(panel, /setRoles\(\(roleResult\.data \|\| \[\]\) as unknown as GovernanceRole\[\]\)/, 'o Admin vê os papéis de domínio ativos')
assert.doesNotMatch(panel, /BUSINESS_ROLE_IDS/)

const validationIndex = edgeFunction.indexOf('municipal_governance_validate_assignment')
const inviteIndex = edgeFunction.indexOf('inviteUserByEmail')
assert.ok(validationIndex >= 0 && inviteIndex > validationIndex, 'a validação de papel×módulo ocorre antes do envio do convite')

console.log('Governança de acessos: escopo de módulo, matriz papel×módulo, auditoria e separação do cadastro profissional verificados.')
