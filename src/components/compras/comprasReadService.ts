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

export type ComprasReportData = {
  contratos: { total: number; vigentes: number; proximosVencimento: number }
  saldos: { itens: number; criticos: number; valorDisponivel: number; percentualDisponivel: number }
  pedidos: { total: number; pendentesEntrega: number; aguardandoDecisao: number; porSituacao: { label: string; total: number }[] }
  entregas: { pendentes: number; quantidadePendente: number }
  consumo: { descricao: string; consumida: number; contratada: number; percentual: number }[]
  execucao: { eventos: number; comEmpenho: number; pagos: number }
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

async function loadLegacyBalances(municipalityId: string | null, search = '', ataId = ''): Promise<ComprasBalanceItem[]> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  let itemsQuery = supabase.from('itens_ata').select('id,ata_id,municipio_id,descricao,quantidade_contratada,saldo_quantidade,saldo_valor,valor_unitario').order('ata_id', { ascending: true }).limit(5000)
  if (municipalityId) itemsQuery = itemsQuery.eq('municipio_id', municipalityId)
  if (ataId) itemsQuery = itemsQuery.eq('ata_id', Number(ataId))
  if (search.trim()) itemsQuery = itemsQuery.ilike('descricao', `%${search.trim()}%`)
  const itemsResult = await itemsQuery
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  const items = (itemsResult.data || []) as Array<{ id: number; ata_id: number; municipio_id: string; descricao: string; quantidade_contratada: number; saldo_quantidade: number; saldo_valor: number; valor_unitario: number }>
  const ids = items.map((item) => item.id)
  let reservationsQuery = supabase.from('pedidos_reservas').select('item_ata_id,quantidade,status').limit(5000)
  if (ids.length) reservationsQuery = reservationsQuery.in('item_ata_id', ids)
  else return []
  const reservationsResult = await reservationsQuery
  if (reservationsResult.error) throw new Error(reservationsResult.error.message)
  const reserved = new Map<number, number>()
  for (const row of (reservationsResult.data || []) as Array<{ item_ata_id: number; quantidade: number; status: string }>) {
    if (row.status === 'ATIVA') reserved.set(row.item_ata_id, (reserved.get(row.item_ata_id) || 0) + Number(row.quantidade || 0))
  }
  return items.map((item) => ({
    municipio_id: item.municipio_id,
    item_ata_id: item.id,
    ata_id: item.ata_id,
    descricao: item.descricao,
    quantidade_contratada: Number(item.quantidade_contratada || 0),
    saldo_quantidade: Number(item.saldo_quantidade || 0),
    saldo_valor: Number(item.saldo_valor || 0),
    quantidade_reservada: reserved.get(item.id) || 0,
    quantidade_utilizavel: Number(item.saldo_quantidade || 0) - (reserved.get(item.id) || 0),
  }))
}

export async function loadComprasDashboard(municipalityId: string | null): Promise<ComprasReadResult> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  let atasQuery = supabase.from('atas').select('id,numero_ata,objeto,valor_global,data_inicio_vigencia,data_fim_vigencia,situacao,municipio_id,created_at').order('data_inicio_vigencia', { ascending: false }).limit(250)
  let ordersQuery = supabase.from('pedidos').select('id,numero_pedido,status,status_aprovacao,created_at').order('created_at', { ascending: false }).limit(250)
  if (municipalityId) { atasQuery = atasQuery.eq('municipio_id', municipalityId); ordersQuery = ordersQuery.eq('municipio_id', municipalityId) }
  const [atas, balances, orders] = await Promise.all([atasQuery, loadLegacyBalances(municipalityId), ordersQuery])
  if (atas.error) throw new Error(atas.error.message)
  if (orders.error) throw new Error(orders.error.message)
  const ataRows = (atas.data || []) as Array<{ id: number; numero_ata: string | null; objeto: string | null; valor_global: number | null; situacao: string | null; created_at: string }>
  const orderRows = (orders.data || []) as Array<{ id: number; numero_pedido: string | null; status: string | null; status_aprovacao: string | null; created_at: string }>
  const pending = orderRows.filter((row) => /AGUARDANDO|ENVI|ANALISE|PENDENTE/i.test(`${row.status || ''} ${row.status_aprovacao || ''}`))
  const critical = balances.filter(isCriticalBalance)
  return {
    summary: { processos: ataRows.length, demandas: ataRows.length, pedidosPendentes: pending.length, entregasPendentes: pending.length, itensCriticos: critical.length },
    recentDemands: ataRows.slice(0, 6).map((row) => ({ id: String(row.id), numero: row.numero_ata, objeto: row.objeto || 'Objeto não informado', status: row.situacao || 'ATIVA', prioridade: 'ATA', valor_estimado: row.valor_global, created_at: row.created_at })),
    pendingDeliveries: pending.slice(0, 6).map((row) => ({ pedido_id: row.id, numero_pedido: row.numero_pedido, status: row.status, status_aprovacao: row.status_aprovacao, quantidade_pendente: null, entregas_registradas: null })),
  }
}

export async function loadComprasAtas(municipalityId: string | null, search = '', situation = ''): Promise<ComprasAtaSummary[]> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  let query = supabase.from('atas').select('id,numero_ata,objeto,valor_global,data_inicio_vigencia,data_fim_vigencia,situacao,municipio_id,created_at').order('data_inicio_vigencia', { ascending: true, nullsFirst: false }).limit(250)
  if (municipalityId) query = query.eq('municipio_id', municipalityId)
  if (situation) query = query.eq('situacao', situation)
  if (search.trim()) query = query.or(`numero_ata.ilike.%${search.trim()}%,objeto.ilike.%${search.trim()}%`)
  const result = await query
  if (result.error) throw new Error(result.error.message)
  const rows = (result.data || []) as Array<{ id: number; numero_ata: string | null; objeto: string | null; valor_global: number | null; data_inicio_vigencia: string | null; data_fim_vigencia: string | null; situacao: string | null; municipio_id: string; created_at: string }>
  const balances = await loadLegacyBalances(municipalityId)
  const byAta = new Map<number, ComprasBalanceItem[]>()
  for (const item of balances) byAta.set(item.ata_id, [...(byAta.get(item.ata_id) || []), item])
  return rows.map((row) => { const items = byAta.get(row.id) || []; return { id: String(row.id), ata_id: row.id, numero: row.numero_ata, objeto: row.objeto, valor_inicial: row.valor_global, valor_atual: row.valor_global, vigencia_inicio: row.data_inicio_vigencia, vigencia_fim: row.data_fim_vigencia, situacao: row.situacao, processo_id: null, itens: items.length, saldoValor: items.reduce((sum, item) => sum + Number(item.saldo_valor || 0), 0), saldoQuantidade: items.reduce((sum, item) => sum + Number(item.saldo_quantidade || 0), 0), quantidadeContratada: items.reduce((sum, item) => sum + Number(item.quantidade_contratada || 0), 0), criticos: items.filter(isCriticalBalance).length } })
}

export async function loadComprasBalances(municipalityId: string | null, search = '', ataId = ''): Promise<ComprasBalanceItem[]> {
  return loadLegacyBalances(municipalityId, search, ataId)
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
  let query = supabase.from('consumos').select('id,ata_id,quantidade,valor_total,created_at').order('created_at', { ascending: false }).limit(200)
  if (municipalityId) query = query.eq('municipio_id', municipalityId)
  if (search.trim()) query = query.ilike('descricao', `%${search.trim()}%`)
  const result = await query
  if (result.error) throw new Error(result.error.message)
  return ((result.data || []) as Array<{ id: number; ata_id: number; quantidade: number; valor_total: number; created_at: string }>).map((row) => ({ id: String(row.id), contrato_id: String(row.ata_id), tipo: 'CONSUMO', status: 'REGISTRADO', ocorrido_em: row.created_at, descricao: 'Consumo registrado no módulo legado', quantidade: row.quantidade, unidade_medida: null, empenho_numero: null, pagamento_status: null, valor_anterior: null, valor_novo: row.valor_total }))
}

export async function loadComprasOrderDetail(municipalityId: string | null, pedidoId: number): Promise<ComprasOrderDetail> {
  if (!supabase) throw new Error('O serviço de dados não está configurado.')
  let orderQuery = supabase.from('pedidos').select('id,municipio_id,numero_pedido,numero_requisicao,ata_id,status,status_aprovacao,data_solicitacao,observacoes,justificativa,local_entrega,valor_total,unidade_id,unidade_organizacional_id,data_aprovacao,observacao_aprovacao,created_at,updated_at').eq('id', pedidoId)
  let itemsQuery = supabase.from('itens_pedido').select('id,item_ata_id,lote_numero,quantidade_solicitada,valor_unitario,valor_total').eq('pedido_id', pedidoId).order('id', { ascending: true }).limit(100)
  let eventsQuery = supabase.from('pedidos_eventos').select('id,evento,status_anterior,status_novo,justificativa,ocorrido_em,metadados').eq('pedido_id', pedidoId).order('ocorrido_em', { ascending: false }).limit(100)
  let deliveriesQuery = supabase.from('pedidos_entregas').select('id,numero,data_entrega,tipo,documento_referencia,observacao').eq('pedido_id', pedidoId).order('numero', { ascending: false }).limit(100)
  let occurrencesQuery = supabase.from('pedidos_ocorrencias').select('id,tipo,severidade,descricao,resolvida,created_at').eq('pedido_id', pedidoId).order('created_at', { ascending: false }).limit(100)
  if (municipalityId) orderQuery = orderQuery.eq('municipio_id', municipalityId)
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

export async function loadComprasReports(municipalityId: string | null): Promise<ComprasReportData> {
  const [atas, balances, orders] = await Promise.all([loadComprasAtas(municipalityId), loadLegacyBalances(municipalityId), loadComprasOrders(municipalityId)])
  const today = new Date(); const inThirtyDays = new Date(today.getTime() + 30 * 86400000)
  const available = balances.reduce((sum, row) => sum + Number(row.quantidade_utilizavel || 0), 0)
  const contracted = balances.reduce((sum, row) => sum + Number(row.quantidade_contratada || 0), 0)
  const consumption = balances.map((row) => ({ descricao: row.descricao, contratada: Number(row.quantidade_contratada || 0), consumida: Math.max(Number(row.quantidade_contratada || 0) - Number(row.saldo_quantidade || 0), 0), percentual: Number(row.quantidade_contratada || 0) ? Math.min((Math.max(Number(row.quantidade_contratada || 0) - Number(row.saldo_quantidade || 0), 0) / Number(row.quantidade_contratada || 0)) * 100, 100) : 0 })).sort((a, b) => b.consumida - a.consumida).slice(0, 8)
  const situationMap = new Map<string, number>(); for (const row of orders) { const label = row.status_aprovacao || row.status || 'SEM_SITUACAO'; situationMap.set(label, (situationMap.get(label) || 0) + 1) }
  return { contratos: { total: atas.length, vigentes: atas.filter((row) => /ATIV|PROXIM/i.test(String(row.situacao))).length, proximosVencimento: atas.filter((row) => row.vigencia_fim && new Date(row.vigencia_fim) >= today && new Date(row.vigencia_fim) <= inThirtyDays).length }, saldos: { itens: balances.length, criticos: balances.filter(isCriticalBalance).length, valorDisponivel: balances.reduce((sum, row) => sum + Number(row.saldo_valor || 0), 0), percentualDisponivel: contracted ? (available / contracted) * 100 : 0 }, pedidos: { total: orders.length, pendentesEntrega: orders.filter((row) => Number(row.quantidade_pendente || 0) > 0).length, aguardandoDecisao: orders.filter((row) => /ENVI|ANALISE|PENDENTE/i.test(`${row.status || ''} ${row.status_aprovacao || ''}`)).length, porSituacao: Array.from(situationMap.entries()).map(([label, total]) => ({ label, total })).sort((a, b) => b.total - a.total) }, entregas: { pendentes: orders.filter((row) => Number(row.quantidade_pendente || 0) > 0).length, quantidadePendente: orders.reduce((sum, row) => sum + Number(row.quantidade_pendente || 0), 0) }, consumo: consumption, execucao: { eventos: 0, comEmpenho: 0, pagos: 0 } }
}

export function isCriticalBalance(item: Pick<ComprasBalanceItem, 'quantidade_contratada' | 'saldo_quantidade' | 'quantidade_utilizavel'>) {
  const available = Number(item.quantidade_utilizavel ?? item.saldo_quantidade ?? 0)
  return available <= 0 || available <= Number(item.quantidade_contratada || 0) * 0.1
}
