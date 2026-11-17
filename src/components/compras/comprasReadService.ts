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

export type ComprasAta = {
  id: string
  ata_id: number | null
  numero: string | null
  objeto: string | null
  valor_inicial: number | null
  valor_atual: number | null
  vigencia_inicio: string | null
  vigencia_fim: string | null
  situacao: string | null
  processo_id: string | null
}

export type ComprasBalanceItem = {
  municipio_id: string
  item_ata_id: number
  ata_id: number
  descricao: string
  quantidade_contratada: number
  saldo_quantidade: number
  saldo_valor: number
  quantidade_reservada: number
  quantidade_utilizavel: number
}

export type ComprasAtaSummary = ComprasAta & {
  itens: number
  saldoValor: number
  saldoQuantidade: number
  quantidadeContratada: number
  criticos: number
}

export type ComprasOrder = {
  municipio_id: string
  pedido_id: number
  numero_pedido: string | null
  status: string | null
  status_aprovacao: string | null
  data_solicitacao: string | null
  quantidade_solicitada: number
  quantidade_entregue: number
  quantidade_pendente: number
  entregas_registradas: number
}

export type ComprasContractExecution = {
  id: string
  contrato_id: string
  tipo: string
  status: string
  ocorrido_em: string
  descricao: string | null
  quantidade: number | null
  unidade_medida: string | null
  empenho_numero: string | null
  pagamento_status: string | null
  valor_anterior: number | null
  valor_novo: number | null
}

export type ComprasOrderItem = {
  id: number
  item_ata_id: number
  lote_numero: string | null
  quantidade_solicitada: number
  valor_unitario: number | null
  valor_total: number | null
}

export type ComprasOrderEvent = {
  id: number
  evento: string
  status_anterior: string | null
  status_novo: string | null
  justificativa: string | null
  ocorrido_em: string
  metadados: Record<string, unknown> | null
}

export type ComprasDelivery = {
  id: string
  numero: number
  data_entrega: string
  tipo: string
  documento_referencia: string | null
  observacao: string | null
}

export type ComprasOccurrence = {
  id: number
  tipo: string
  severidade: string
  descricao: string
  resolvida: boolean
  created_at: string
}

export type ComprasOrderDetail = {
  pedido_id: number
  municipio_id: string
  numero_pedido: string | null
  status: string | null
  status_aprovacao: string | null
  data_solicitacao: string | null
  numero_requisicao: string | null
  observacoes: string | null
  justificativa: string | null
  local_entrega: string | null
  valor_total: number | null
  ata_id: number | null
  unidade_id: string | null
  unidade_organizacional_id: string | null
  data_aprovacao: string | null
  observacao_aprovacao: string | null
  created_at: string
  updated_at: string
  items: ComprasOrderItem[]
  events: ComprasOrderEvent[]
  deliveries: ComprasDelivery[]
  occurrences: ComprasOccurrence[]
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

  let demandQuery = supabase.from('compras_demandas').select('id,numero,objeto,status,prioridade,valor_estimado,created_at').order('created_at', { ascending: false }).limit(20)
  let processesQuery = supabase.from('compras_processos').select('id,status').limit(250)
  let balancesQuery = supabase.from('compras_vw_saldos_operacionais').select('item_ata_id,quantidade_contratada,saldo_quantidade,quantidade_reservada,quantidade_utilizavel').limit(500)
  let deliveriesQuery = supabase.from('compras_vw_pedidos_entregas').select('pedido_id,numero_pedido,status,status_aprovacao,quantidade_pendente,entregas_registradas').gt('quantidade_pendente', 0).order('data_solicitacao', { ascending: false }).limit(20)

  if (municipalityId) {
    demandQuery = demandQuery.eq('municipio_id', municipalityId)
    processesQuery = processesQuery.eq('municipio_id', municipalityId)
    balancesQuery = balancesQuery.eq('municipio_id', municipalityId)
    deliveriesQuery = deliveriesQuery.eq('municipio_id', municipalityId)
  }

  const [demands, processes, balances, deliveries] = await Promise.all([demandQuery, processesQuery, balancesQuery, deliveriesQuery])
  const failure = [demands.error, processes.error, balances.error, deliveries.error].find(Boolean)
  if (failure) throw new Error(failure.message)

  const demandRows = (demands.data || []) as ComprasRecentDemand[]
  const processRows = (processes.data || []) as { id: string; status: string | null }[]
  const balanceRows = (balances.data || []) as { quantidade_contratada: number | null; saldo_quantidade: number | null; quantidade_utilizavel: number | null }[]
  const deliveryRows = (deliveries.data || []) as ComprasPendingDelivery[]
  const pendingDemands = demandRows.filter((row) => ['rascunho', 'enviada', 'em_analise', 'pendente'].includes(String(row.status).toLowerCase())).length
  const criticalBalances = balanceRows.filter((row) => Number(row.quantidade_utilizavel ?? row.saldo_quantidade ?? 0) <= 0 || Number(row.saldo_quantidade || 0) <= Number(row.quantidade_contratada || 0) * 0.2).length

  return {
    summary: { processos: processRows.length, demandas: demandRows.length, pedidosPendentes: pendingDemands, entregasPendentes: deliveryRows.length, itensCriticos: criticalBalances },
    recentDemands: demandRows.slice(0, 6),
    pendingDeliveries: deliveryRows.slice(0, 6),
  }
}

export async function loadComprasAtas(municipalityId: string | null, search = '', situation = ''): Promise<ComprasAtaSummary[]> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  let contracts = supabase.from('compras_contratos').select('id,ata_id,numero,objeto,valor_inicial,valor_atual,vigencia_inicio,vigencia_fim,situacao,processo_id').order('vigencia_fim', { ascending: true, nullsFirst: false }).limit(100)
  if (municipalityId) contracts = contracts.eq('municipio_id', municipalityId)
  if (situation) contracts = contracts.eq('situacao', situation)
  if (search.trim()) contracts = contracts.or(`numero.ilike.%${search.trim()}%,objeto.ilike.%${search.trim()}%`)

  let balances = supabase.from('compras_vw_saldos_operacionais').select('municipio_id,item_ata_id,ata_id,descricao,quantidade_contratada,saldo_quantidade,saldo_valor,quantidade_reservada,quantidade_utilizavel').limit(2000)
  if (municipalityId) balances = balances.eq('municipio_id', municipalityId)
  const [contractResult, balanceResult] = await Promise.all([contracts, balances])
  if (contractResult.error) throw new Error(contractResult.error.message)
  if (balanceResult.error) throw new Error(balanceResult.error.message)

  const byAta = new Map<number, ComprasBalanceItem[]>()
  for (const row of (balanceResult.data || []) as ComprasBalanceItem[]) {
    const list = byAta.get(Number(row.ata_id)) || []
    list.push(row)
    byAta.set(Number(row.ata_id), list)
  }
  return ((contractResult.data || []) as ComprasAta[]).map((ata) => {
    const items = ata.ata_id == null ? [] : (byAta.get(Number(ata.ata_id)) || [])
    return { ...ata, itens: items.length, saldoValor: items.reduce((sum, item) => sum + Number(item.saldo_valor || 0), 0), saldoQuantidade: items.reduce((sum, item) => sum + Number(item.saldo_quantidade || 0), 0), quantidadeContratada: items.reduce((sum, item) => sum + Number(item.quantidade_contratada || 0), 0), criticos: items.filter(isCriticalBalance).length }
  })
}

export async function loadComprasBalances(municipalityId: string | null, search = '', ataId = ''): Promise<ComprasBalanceItem[]> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  let query = supabase.from('compras_vw_saldos_operacionais').select('municipio_id,item_ata_id,ata_id,descricao,quantidade_contratada,saldo_quantidade,saldo_valor,quantidade_reservada,quantidade_utilizavel').order('ata_id', { ascending: true }).order('descricao', { ascending: true }).limit(500)
  if (municipalityId) query = query.eq('municipio_id', municipalityId)
  if (ataId) query = query.eq('ata_id', Number(ataId))
  if (search.trim()) query = query.ilike('descricao', `%${search.trim()}%`)
  const result = await query
  if (result.error) throw new Error(result.error.message)
  return (result.data || []) as ComprasBalanceItem[]
}

export async function loadComprasOrders(municipalityId: string | null, search = '', status = ''): Promise<ComprasOrder[]> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  let query = supabase.from('compras_vw_pedidos_entregas').select('municipio_id,pedido_id,numero_pedido,status,status_aprovacao,data_solicitacao,quantidade_solicitada,quantidade_entregue,quantidade_pendente,entregas_registradas').order('data_solicitacao', { ascending: false }).limit(200)
  if (municipalityId) query = query.eq('municipio_id', municipalityId)
  if (status) query = query.eq('status', status)
  if (search.trim()) query = query.ilike('numero_pedido', `%${search.trim()}%`)
  const result = await query
  if (result.error) throw new Error(result.error.message)
  return (result.data || []) as ComprasOrder[]
}

export async function loadComprasContractExecutions(municipalityId: string | null, search = ''): Promise<ComprasContractExecution[]> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  let query = supabase.from('compras_execucoes_contratuais').select('id,contrato_id,tipo,status,ocorrido_em,descricao,quantidade,unidade_medida,empenho_numero,pagamento_status,valor_anterior,valor_novo').order('ocorrido_em', { ascending: false }).limit(200)
  if (municipalityId) query = query.eq('municipio_id', municipalityId)
  if (search.trim()) query = query.or(`empenho_numero.ilike.%${search.trim()}%,descricao.ilike.%${search.trim()}%`)
  const result = await query
  if (result.error) throw new Error(result.error.message)
  return (result.data || []) as ComprasContractExecution[]
}

export async function loadComprasOrderDetail(municipalityId: string | null, pedidoId: number): Promise<ComprasOrderDetail> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  let orderQuery = supabase.from('pedidos').select('id,municipio_id,numero_pedido,numero_requisicao,ata_id,status,status_aprovacao,data_solicitacao,observacoes,justificativa,local_entrega,valor_total,unidade_id,unidade_organizacional_id,data_aprovacao,observacao_aprovacao,created_at,updated_at').eq('id', pedidoId)
  let itemsQuery = supabase.from('itens_pedido').select('id,item_ata_id,lote_numero,quantidade_solicitada,valor_unitario,valor_total').eq('pedido_id', pedidoId).order('id', { ascending: true }).limit(100)
  let eventsQuery = supabase.from('pedidos_eventos').select('id,evento,status_anterior,status_novo,justificativa,ocorrido_em,metadados').eq('pedido_id', pedidoId).order('ocorrido_em', { ascending: false }).limit(100)
  let deliveriesQuery = supabase.from('pedidos_entregas').select('id,numero,data_entrega,tipo,documento_referencia,observacao').eq('pedido_id', pedidoId).order('numero', { ascending: false }).limit(100)
  let occurrencesQuery = supabase.from('pedidos_ocorrencias').select('id,tipo,severidade,descricao,resolvida,created_at').eq('pedido_id', pedidoId).order('created_at', { ascending: false }).limit(100)
  if (municipalityId) {
    orderQuery = orderQuery.eq('municipio_id', municipalityId)
    itemsQuery = itemsQuery.eq('municipio_id', municipalityId)
    eventsQuery = eventsQuery.eq('municipio_id', municipalityId)
    deliveriesQuery = deliveriesQuery.eq('municipio_id', municipalityId)
    occurrencesQuery = occurrencesQuery.eq('municipio_id', municipalityId)
  }
  const [order, items, events, deliveries, occurrences] = await Promise.all([orderQuery.limit(1).maybeSingle(), itemsQuery, eventsQuery, deliveriesQuery, occurrencesQuery])
  const failure = [order.error, items.error, events.error, deliveries.error, occurrences.error].find(Boolean)
  if (failure) throw new Error(failure.message)
  if (!order.data) throw new Error('Pedido não encontrado ou fora do escopo autorizado.')
  return { ...(order.data as unknown as Omit<ComprasOrderDetail, 'pedido_id' | 'items' | 'events' | 'deliveries' | 'occurrences'>), pedido_id: Number(order.data.id), items: (items.data || []) as ComprasOrderItem[], events: (events.data || []) as ComprasOrderEvent[], deliveries: (deliveries.data || []) as ComprasDelivery[], occurrences: (occurrences.data || []) as ComprasOccurrence[] }
}

export async function executeComprasOrderAction(action: 'enviar' | 'aprovar' | 'rejeitar' | 'cancelar' | 'encerrar', pedidoId: number, justification = '') {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  const rpcByAction = { enviar: 'compras_enviar_pedido_aprovacao', aprovar: 'compras_aprovar_pedido', rejeitar: 'compras_rejeitar_pedido', cancelar: 'compras_cancelar_pedido', encerrar: 'compras_encerrar_pedido' } as const
  const rpc = rpcByAction[action]
  const args = action === 'rejeitar' ? { p_pedido_id: pedidoId, p_justificativa: justification } : action === 'cancelar' ? { p_pedido_id: pedidoId, p_justificativa: justification } : action === 'encerrar' ? { p_pedido_id: pedidoId, p_observacao: justification } : { p_pedido_id: pedidoId }
  const result = await supabase.rpc(rpc, args)
  if (result.error) throw new Error(result.error.message)
  return result.data
}

export async function executeComprasDelivery(pedidoId: number, items: { item_pedido_id: number; quantidade: number; observacao?: string }[], tipo: 'PARCIAL' | 'FINAL', dataEntrega: string, documento: string, observacao: string) {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  const result = await supabase.rpc('compras_registrar_entrega', { p_pedido_id: pedidoId, p_itens: items, p_tipo: tipo, p_data_entrega: dataEntrega, p_documento: documento || null, p_observacao: observacao || null })
  if (result.error) throw new Error(result.error.message)
  return result.data
}

export async function executeComprasOccurrence(pedidoId: number, tipo: string, descricao: string, severidade: string, entregaId: string | null) {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  const result = await supabase.rpc('compras_registrar_ocorrencia', { p_pedido_id: pedidoId, p_tipo: tipo, p_descricao: descricao, p_severidade: severidade, p_entrega_id: entregaId })
  if (result.error) throw new Error(result.error.message)
  return result.data
}

export function isCriticalBalance(item: Pick<ComprasBalanceItem, 'quantidade_contratada' | 'saldo_quantidade' | 'quantidade_utilizavel'>) {
  const available = Number(item.quantidade_utilizavel ?? item.saldo_quantidade ?? 0)
  return available <= 0 || available <= Number(item.quantidade_contratada || 0) * 0.1
}
