import { supabase } from '../../lib/supabase'

export type ComprasDashboardSummary = {
  processos: number
  demandas: number
  pedidosPendentes: number
  entregasPendentes: number
  itensCriticos: number
}

export type ComprasAccessContext = {
  municipalityId: string | null
  role: 'admin' | 'gestor' | 'prefeito' | 'operador' | 'consulta'
  scopeLabel: string
}

export type ComprasRecentDemand = {
  id: string
  numero: string | null
  objeto: string
  status: string
  prioridade: string
  valor_estimado: number | null
  created_at: string
}

export type ComprasPendingDelivery = {
  pedido_id: number
  numero_pedido: string | null
  status: string | null
  status_aprovacao: string | null
  quantidade_pendente: number | null
  entregas_registradas: number | null
}

export type ComprasReadResult = {
  summary: ComprasDashboardSummary
  recentDemands: ComprasRecentDemand[]
  pendingDeliveries: ComprasPendingDelivery[]
}

function normalizeRole(roleLabel: string, isAdministrator: boolean): ComprasAccessContext['role'] {
  if (isAdministrator || /admin/i.test(roleLabel)) return 'admin'
  if (/prefeito/i.test(roleLabel)) return 'prefeito'
  if (/gestor|secret/i.test(roleLabel)) return 'gestor'
  if (/operador|administrativo|solicit/i.test(roleLabel)) return 'operador'
  return 'consulta'
}

export function resolveComprasAccess(
  accessContext: { isAdministrator: boolean; foundation: { municipality: { id: string } | null } | null; assignments: { roleLabel: string; orgUnitName: string }[] },
): ComprasAccessContext {
  const assignment = accessContext.assignments[0]
  return {
    municipalityId: accessContext.foundation?.municipality?.id || null,
    role: normalizeRole(assignment?.roleLabel || '', accessContext.isAdministrator),
    scopeLabel: assignment?.orgUnitName || 'Escopo municipal autorizado',
  }
}

export async function loadComprasDashboard(municipalityId: string | null): Promise<ComprasReadResult> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')

  let demandQuery = supabase
    .from('compras_demandas')
    .select('id,numero,objeto,status,prioridade,valor_estimado,created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  let processesQuery = supabase
    .from('compras_processos')
    .select('id,status')
    .limit(250)

  let balancesQuery = supabase
    .from('compras_vw_saldos_operacionais')
    .select('item_ata_id,quantidade_contratada,saldo_quantidade,quantidade_reservada,quantidade_utilizavel')
    .limit(500)

  let deliveriesQuery = supabase
    .from('compras_vw_pedidos_entregas')
    .select('pedido_id,numero_pedido,status,status_aprovacao,quantidade_pendente,entregas_registradas')
    .gt('quantidade_pendente', 0)
    .order('data_solicitacao', { ascending: false })
    .limit(20)

  if (municipalityId) {
    demandQuery = demandQuery.eq('municipio_id', municipalityId)
    processesQuery = processesQuery.eq('municipio_id', municipalityId)
    balancesQuery = balancesQuery.eq('municipio_id', municipalityId)
    deliveriesQuery = deliveriesQuery.eq('municipio_id', municipalityId)
  }

  const [demands, processes, balances, deliveries] = await Promise.all([
    demandQuery,
    processesQuery,
    balancesQuery,
    deliveriesQuery,
  ])

  const failure = [demands.error, processes.error, balances.error, deliveries.error].find(Boolean)
  if (failure) throw new Error(failure.message)

  const demandRows = (demands.data || []) as ComprasRecentDemand[]
  const processRows = (processes.data || []) as { id: string; status: string | null }[]
  const balanceRows = (balances.data || []) as { item_ata_id: number; quantidade_contratada: number | null; saldo_quantidade: number | null; quantidade_reservada: number | null; quantidade_utilizavel: number | null }[]
  const deliveryRows = (deliveries.data || []) as ComprasPendingDelivery[]

  const pendingDemands = demandRows.filter((row) => ['rascunho', 'enviada', 'em_analise', 'pendente'].includes(String(row.status).toLowerCase())).length
  const criticalBalances = balanceRows.filter((row) => Number(row.quantidade_utilizavel ?? row.saldo_quantidade ?? 0) <= 0 || Number(row.saldo_quantidade || 0) <= Number(row.quantidade_contratada || 0) * 0.2).length

  return {
    summary: {
      processos: processRows.length,
      demandas: demandRows.length,
      pedidosPendentes: pendingDemands,
      entregasPendentes: deliveryRows.length,
      itensCriticos: criticalBalances,
    },
    recentDemands: demandRows.slice(0, 6),
    pendingDeliveries: deliveryRows.slice(0, 6),
  }
}
