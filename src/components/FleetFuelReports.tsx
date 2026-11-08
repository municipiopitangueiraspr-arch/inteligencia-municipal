import { useEffect, useMemo, useRef, useState } from 'react'
import { BarChart3, CalendarDays, Download, FileSpreadsheet, FileText, Filter, Fuel, Gauge, RefreshCw, Store, Truck } from 'lucide-react'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import './FleetFuelReports.css'

type Props = { userEmail?: string }
type Option = { id: string; name?: string; acronym?: string; label?: string }
type MetricRow = { id: string | null; label: string; description?: string | null; acronym?: string | null; fueling_count: number; liters: number; amount: number; weighted_price_per_liter?: number | null; last_fueling_at?: string | null }
type MonthRow = { month: string; amount: number; liters: number; fueling_count: number }
type RecentRow = { id: string; status: string; performed_at: string; submitted_at: string | null; plate: string | null; driver_name: string | null; station_name: string | null; fuel_type_name: string | null; liters: number; amount: number; unit_price: number | null; document_status: string | null; entered_later?: boolean }
type DetailRow = { id: string; status: string; performed_at: string; submitted_at: string | null; plate: string | null; vehicle_description: string | null; driver_name: string | null; station_name: string | null; fuel_type_name: string | null; responsible_unit_name: string | null; beneficiary_unit_name: string | null; liters: number; amount: number; unit_price: number | null; odometer_km: number | null; document_status: string | null }
type AlertRow = { id: string; kind: string; severity: string; label: string; description: string; status: string; created_at: string; plate: string | null; resolved_at: string | null }
type ClosureRow = { closure_id: string; reference_year: number; reference_month: number; closure_status: string; station_name: string; registered_fueling_count: number; registered_liters: number; registered_amount: number; invoiced_amount: number | null; divergence_amount: number | null; documents_pending_count: number; station_check_status: string; last_updated_at: string }
type FinancialAlert = { reference_year: number; reference_month: number; station_name: string; registered_amount: number; invoiced_amount: number; divergence_amount: number; label: string }
type Summary = { fueling_count: number; liters: number; registered_amount: number; confirmed_amount: number; confirmed_count: number; pending_confirmation_count: number; pending_document_count: number; distinct_vehicles: number; distinct_stations: number; average_per_fueling: number; weighted_price_per_liter: number | null; today_amount: number; current_month_amount: number; year_to_date_amount: number; year_to_date_count: number; previous_year_to_date_amount: number; previous_year_to_date_count: number; previous_period_amount: number; previous_period_count: number; period_variation_percent: number | null; period_variation_base_missing: boolean; open_inconsistency_count: number; open_closure_count: number; cnh_expired_or_due_count: number }
type Overview = { updated_at: string; summary: Summary; monthly: MonthRow[]; by_responsible_unit: MetricRow[]; by_beneficiary_unit: MetricRow[]; by_vehicle: MetricRow[]; by_driver: MetricRow[]; by_station: MetricRow[]; by_fuel_type: MetricRow[]; recent: RecentRow[]; alerts: AlertRow[]; financial_alerts: FinancialAlert[]; closures: ClosureRow[]; report_detail?: { rows?: DetailRow[]; total_count?: number }; filter_options: { units: Option[]; vehicles: Option[]; drivers: Option[]; stations: Option[]; fuel_types: Option[] } }
type ReportContext = { municipality_name: string; municipality_id: string; generated_at: string; user_email: string | null; role: string; scope: string; units: { id: string; name: string; acronym?: string }[] }
type ReportResult = { context: ReportContext; data: Overview }
type Filters = { fromMonth: string; toMonth: string; responsible: string; beneficiary: string; vehicle: string; driver: string; station: string; fuel: string; status: string; document: string; recentLimit: number }
type Dimension = 'responsible' | 'beneficiary' | 'vehicle' | 'driver' | 'station' | 'fuel'

const EMPTY_FILTERS: Filters = { fromMonth: '', toMonth: '', responsible: '', beneficiary: '', vehicle: '', driver: '', station: '', fuel: '', status: '', document: '', recentLimit: 50 }
const STATUS_OPTIONS = [
  ['ENVIADO_PELO_POSTO', 'Enviado pelo posto'], ['PENDENTE_DE_COMPROVANTE', 'Pendente de comprovante'], ['PENDENTE_DE_CONFERENCIA', 'Pendente de conferência'],
  ['EM_ANALISE', 'Em análise'], ['COM_INCONSISTENCIA', 'Com inconsistência'], ['SOLICITADA_CORRECAO', 'Correção solicitada'], ['CORRIGIDO', 'Corrigido'], ['CONFERIDO', 'Conferido'], ['INCLUIDO_NO_FECHAMENTO', 'Incluído no fechamento'],
] as const
const DOCUMENT_OPTIONS = [['SEM_COMPROVANTE', 'Sem comprovante'], ['PENDENTE', 'Pendente'], ['ENVIADO', 'Enviado'], ['EM_ANALISE', 'Em análise'], ['ACEITO', 'Aceito'], ['REJEITADO', 'Rejeitado'], ['SUBSTITUIDO', 'Substituído']] as const
const number = (value: unknown) => Number(value || 0)
const money = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number(value))
const quantity = (value: unknown, maximumFractionDigits = 2) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(number(value))
const currentMonth = () => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`
}
const shiftMonth = (key: string, amount: number) => {
  const [year, month] = key.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1 + amount, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
const monthName = (key: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`))
const periodName = (from: string, to: string) => `${monthName(from)}${from === to ? '' : ` a ${monthName(to)}`}`
const timestamp = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '—'
const statusName = (value?: string | null) => {
  if (!value) return 'Sem comprovante'
  const known: Record<string, string> = Object.fromEntries([...STATUS_OPTIONS, ...DOCUMENT_OPTIONS])
  return known[value] || value.replaceAll('_', ' ')
}
const csvValue = (value: unknown) => {
  let text = String(value ?? '')
  if (typeof value !== 'number' && /^\s*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}
const download = (filename: string, content: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const formatMonth = (value: string) => {
  const [year, month] = value.split('-')
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${year}-${month}-01T00:00:00Z`))
}

const dimensions: { id: Dimension; label: string; rows: keyof Pick<Overview, 'by_responsible_unit' | 'by_beneficiary_unit' | 'by_vehicle' | 'by_driver' | 'by_station' | 'by_fuel_type'> }[] = [
  { id: 'responsible', label: 'Secretaria responsável', rows: 'by_responsible_unit' },
  { id: 'beneficiary', label: 'Secretaria beneficiária', rows: 'by_beneficiary_unit' },
  { id: 'vehicle', label: 'Veículo', rows: 'by_vehicle' },
  { id: 'driver', label: 'Motorista', rows: 'by_driver' },
  { id: 'station', label: 'Posto', rows: 'by_station' },
  { id: 'fuel', label: 'Combustível', rows: 'by_fuel_type' },
]

export function FleetFuelReports({ userEmail }: Props) {
  const current = currentMonth()
  const initialFilters = useMemo(() => ({ ...EMPTY_FILTERS, fromMonth: shiftMonth(current, -11), toMonth: current }), [current])
  const [draft, setDraft] = useState<Filters>(initialFilters)
  const [applied, setApplied] = useState<Filters>(initialFilters)
  const [result, setResult] = useState<ReportResult | null>(null)
  const [dimension, setDimension] = useState<Dimension>('station')
  const [loading, setLoading] = useState(Boolean(supabase))
  const [error, setError] = useState(supabase ? '' : 'O serviço de dados está indisponível.')
  const [detailRows, setDetailRows] = useState<DetailRow[]>([])
  const [detailTotal, setDetailTotal] = useState(0)
  const [detailPage, setDetailPage] = useState(0)
  const [detailLoading, setDetailLoading] = useState(Boolean(supabase))
  const [detailError, setDetailError] = useState(supabase ? '' : 'O serviço de dados está indisponível.')
  const requestId = useRef(0)
  const detailRequestId = useRef(0)

  useEffect(() => {
    const id = ++requestId.current
    if (!supabase) return
    void Promise.resolve(supabase.rpc('fleet_fuel_report', {
      p_start_month: `${applied.fromMonth}-01`, p_end_month_exclusive: `${shiftMonth(applied.toMonth, 1)}-01`,
      p_responsible_unit_id: applied.responsible || null, p_beneficiary_unit_id: applied.beneficiary || null,
      p_vehicle_id: applied.vehicle || null, p_driver_id: applied.driver || null, p_station_id: applied.station || null,
      p_fuel_type_id: applied.fuel || null, p_fueling_status: applied.status || null,
      p_document_status: applied.document || null, p_recent_limit: applied.recentLimit,
    })).then(({ data, error: requestError }) => {
      if (id !== requestId.current) return
      if (requestError) {
        setResult(null)
        setDetailLoading(false)
        setError(requestError.message.includes('42501') ? 'Seu perfil não tem permissão para gerar este relatório.' : 'Não foi possível carregar o relatório de abastecimentos. Confira os filtros e tente novamente.')
      } else {
        const payload = data as unknown as ReportResult
        setResult(payload)
        setDetailRows(payload.data.report_detail?.rows || [])
        setDetailTotal(number(payload.data.report_detail?.total_count))
        setDetailError('')
        setDetailLoading(false)
      }
      setLoading(false)
    }).catch(() => {
      if (id !== requestId.current) return
      setResult(null)
      setDetailLoading(false)
      setError('Não foi possível conectar ao serviço de relatórios. Verifique sua conexão e tente novamente.')
      setLoading(false)
    })
    return () => { requestId.current += 1 }
  }, [applied])

  const data = result?.data
  const context = result?.context
  const options = data?.filter_options
  const summary = data?.summary
  const selectedGroup = dimensions.find((item) => item.id === dimension)!
  const selectedRows = data ? data[selectedGroup.rows] : []
  const selectedRowsLabel = selectedGroup.label
  const period = applied.fromMonth && applied.toMonth ? periodName(applied.fromMonth, applied.toMonth) : '—'
  const detailPageCount = Math.max(1, Math.min(2001, Math.ceil(detailTotal / 50)))
  const filterLabels = useMemo(() => {
    if (!options) return [] as string[]
    const label = (values: Option[], id: string) => values.find((item) => item.id === id)?.label || values.find((item) => item.id === id)?.name || id
    const values = [`Período: ${period}`]
    if (applied.responsible) values.push(`Secretaria responsável: ${label(options.units, applied.responsible)}`)
    if (applied.beneficiary) values.push(`Secretaria beneficiária: ${label(options.units, applied.beneficiary)}`)
    if (applied.vehicle) values.push(`Veículo: ${label(options.vehicles, applied.vehicle)}`)
    if (applied.driver) values.push(`Motorista: ${label(options.drivers, applied.driver)}`)
    if (applied.station) values.push(`Posto: ${label(options.stations, applied.station)}`)
    if (applied.fuel) values.push(`Combustível: ${label(options.fuel_types, applied.fuel)}`)
    if (applied.status) values.push(`Situação: ${statusName(applied.status)}`)
    if (applied.document) values.push(`Comprovante: ${statusName(applied.document)}`)
    return values
  }, [applied, options, period])

  useEffect(() => {
    if (detailPage === 0 || !supabase) return
    const id = ++detailRequestId.current
    void Promise.resolve(supabase.rpc('fleet_dashboard_detail', {
      p_start_month: `${applied.fromMonth}-01`, p_end_month_exclusive: `${shiftMonth(applied.toMonth, 1)}-01`,
      p_dimension: 'all', p_dimension_id: null,
      p_responsible_unit_id: applied.responsible || null, p_beneficiary_unit_id: applied.beneficiary || null,
      p_vehicle_id: applied.vehicle || null, p_driver_id: applied.driver || null, p_station_id: applied.station || null,
      p_fuel_type_id: applied.fuel || null, p_fueling_status: applied.status || null,
      p_document_status: applied.document || null, p_limit: 50, p_offset: detailPage * 50,
    })).then(({ data: pageData, error: pageError }) => {
      if (id !== detailRequestId.current) return
      if (pageError) { setDetailRows([]); setDetailTotal(0); setDetailError('Não foi possível carregar o detalhamento paginado dos abastecimentos.') }
      else { const payload = pageData as { rows?: DetailRow[]; total_count?: number }; setDetailRows(payload.rows || []); setDetailTotal(number(payload.total_count)) }
      setDetailLoading(false)
    }).catch(() => {
      if (id !== detailRequestId.current) return
      setDetailRows([])
      setDetailTotal(0)
      setDetailError('Falha de conexão ao carregar esta página de abastecimentos. Tente novamente ou volte à primeira página.')
      setDetailLoading(false)
    })
    return () => { detailRequestId.current += 1 }
  }, [applied, detailPage])

  const setFilter = (key: keyof Filters, value: string) => setDraft((previous) => ({ ...previous, [key]: value }))
  const applyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const span = draft.fromMonth && draft.toMonth ? (Number(draft.toMonth.slice(0, 4)) - Number(draft.fromMonth.slice(0, 4))) * 12 + Number(draft.toMonth.slice(5, 7)) - Number(draft.fromMonth.slice(5, 7)) + 1 : 0
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.fromMonth) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(draft.toMonth) || draft.fromMonth > draft.toMonth) { setError('Informe um mês inicial e final válidos, em ordem cronológica.'); return }
    if (span > 120) { setError('O intervalo máximo permitido é de 120 meses.'); return }
    if (draft.toMonth > currentMonth()) { setError('O relatório não permite competências futuras.'); return }
    setLoading(true)
    setError('')
    setDetailPage(0)
    setDetailLoading(true)
    setDetailError('')
    setApplied({ ...draft })
  }

  const metadataRows = () => [
    { Campo: 'Relatório', Valor: 'Relatório gerencial de abastecimentos e postos' },
    { Campo: 'Município', Valor: context?.municipality_name || '—' },
    { Campo: 'Período analisado', Valor: period },
    { Campo: 'Critério de data', Valor: 'Data/hora real da operação (performed_at), apresentada no fuso America/Sao_Paulo; submitted_at é informada separadamente.' },
    { Campo: 'Filtros utilizados', Valor: filterLabels.join(' | ') },
    { Campo: 'Data/hora da geração no servidor', Valor: timestamp(context?.generated_at) },
    { Campo: 'Usuário responsável', Valor: context?.user_email || userEmail || 'Usuário autenticado' },
    { Campo: 'Perfil de acesso', Valor: context?.role || '—' },
    { Campo: 'Escopo', Valor: context?.scope === 'UNIDADES' ? (context.units || []).map((unit) => unit.acronym || unit.name).join(', ') : 'Municipal' },
    { Campo: 'Metodologia', Valor: 'Valor registrado calculado no backend; preço médio ponderado = valor registrado ÷ litros abastecidos. Abastecimentos em rascunho, cancelados ou estornados são excluídos dos totais conforme o modelo operacional.' },
    { Campo: 'Ressalva', Valor: 'Litros abastecidos não equivalem necessariamente ao combustível efetivamente consumido; consumo médio efetivo não é estimado sem metodologia e hodômetros válidos.' },
    { Campo: 'Escopo dos fechamentos', Valor: context?.scope === 'UNIDADES' ? 'Fechamentos e valores fiscais não são disponibilizados a este perfil.' : 'Fechamentos e divergências fiscais são filtrados por competência e posto; filtros de secretaria, veículo, motorista, combustível, situação e comprovante aplicam-se aos abastecimentos, não aos fechamentos.' },
    { Campo: 'Abrangência', Valor: `Totais agregados são integrais ao escopo autorizado. Rankings mostram até 12 itens; detalhe paginado: página ${detailPage + 1} de ${detailPageCount}; recentes seguem o limite escolhido.` },
  ]
  const summaryRows = () => {
    if (!summary) return []
    return [
      { Indicador: 'Abastecimentos válidos', Valor: number(summary.fueling_count) },
      { Indicador: 'Litros abastecidos', Valor: number(summary.liters) },
      { Indicador: 'Valor registrado (R$)', Valor: number(summary.registered_amount) },
      { Indicador: 'Valor conferido (R$)', Valor: number(summary.confirmed_amount) },
      { Indicador: 'Preço médio ponderado (R$/L)', Valor: summary.weighted_price_per_liter == null ? '' : number(summary.weighted_price_per_liter) },
      { Indicador: 'Média por abastecimento (R$)', Valor: number(summary.average_per_fueling) },
      { Indicador: 'Veículos distintos', Valor: number(summary.distinct_vehicles) },
      { Indicador: 'Postos distintos', Valor: number(summary.distinct_stations) },
      { Indicador: 'Valor abastecido hoje (R$)', Valor: number(summary.today_amount) },
      { Indicador: 'Valor abastecido no mês atual (R$)', Valor: number(summary.current_month_amount) },
      { Indicador: 'Valor do período anterior equivalente (R$)', Valor: number(summary.previous_period_amount) },
      { Indicador: 'Abastecimentos no período anterior equivalente', Valor: number(summary.previous_period_count) },
      { Indicador: 'Quantidade no exercício da consulta', Valor: number(summary.year_to_date_count) },
      { Indicador: 'Quantidade no período equivalente do exercício anterior', Valor: number(summary.previous_year_to_date_count) },
      { Indicador: 'Abastecimentos pendentes de conferência', Valor: number(summary.pending_confirmation_count) },
      { Indicador: 'Comprovantes pendentes', Valor: number(summary.pending_document_count) },
      { Indicador: 'Valor no exercício (R$)', Valor: number(summary.year_to_date_amount) },
      { Indicador: 'Valor no período equivalente do exercício anterior (R$)', Valor: number(summary.previous_year_to_date_amount) },
      { Indicador: 'Variação versus período anterior (%)', Valor: summary.period_variation_percent == null ? 'Base anterior sem valor; percentual indisponível' : number(summary.period_variation_percent) },
    ]
  }
  const dimensionRows = () => dimensions.flatMap((group) => (data?.[group.rows] || []).map((row) => ({ Dimensão: group.label, Identificação: row.label, Complemento: row.description || row.acronym || '', Abastecimentos: number(row.fueling_count), 'Litros abastecidos': number(row.liters), 'Valor registrado (R$)': number(row.amount), 'Preço médio ponderado (R$/L)': row.weighted_price_per_liter == null && number(row.liters) ? number(row.amount) / number(row.liters) : row.weighted_price_per_liter == null ? '' : number(row.weighted_price_per_liter) })))
  const monthRows = () => (data?.monthly || []).map((row) => ({ Competência: row.month, Abastecimentos: number(row.fueling_count), 'Litros abastecidos': number(row.liters), 'Valor registrado (R$)': number(row.amount), 'Preço médio ponderado (R$/L)': number(row.liters) ? number(row.amount) / number(row.liters) : '' }))
  const recentRows = () => (data?.recent || []).map((row) => ({ 'Data do abastecimento': timestamp(row.performed_at), 'Data/hora do lançamento': timestamp(row.submitted_at), Veículo: row.plate || '—', Motorista: row.driver_name || '—', Posto: row.station_name || '—', Combustível: row.fuel_type_name || '—', 'Litros abastecidos': number(row.liters), 'Valor registrado (R$)': number(row.amount), 'Preço unitário (R$/L)': row.unit_price == null ? '' : number(row.unit_price), Situação: statusName(row.status), Comprovante: statusName(row.document_status), 'Lançado posteriormente': row.entered_later ? 'Sim' : 'Não' }))
  const detailExportRows = () => detailRows.map((row) => ({ 'Data/hora da operação': timestamp(row.performed_at), 'Data/hora do lançamento': timestamp(row.submitted_at), Veículo: row.plate || row.vehicle_description || '—', Motorista: row.driver_name || '—', Posto: row.station_name || '—', Combustível: row.fuel_type_name || '—', 'Secretaria responsável': row.responsible_unit_name || '—', 'Secretaria beneficiária': row.beneficiary_unit_name || '—', 'Litros abastecidos': number(row.liters), 'Valor registrado (R$)': number(row.amount), 'Preço unitário (R$/L)': row.unit_price == null ? '' : number(row.unit_price), Hodômetro: row.odometer_km == null ? '' : number(row.odometer_km), Situação: statusName(row.status), Comprovante: statusName(row.document_status) }))
  const alertRows = () => (data?.alerts || []).map((row) => ({ Tipo: row.kind, Prioridade: row.severity, Alerta: row.label, Descrição: row.description, Veículo: row.plate || '—', Situação: statusName(row.status), 'Identificado em': timestamp(row.created_at) }))
  const closureRows = () => (data?.closures || []).map((row) => ({ Posto: row.station_name, Competência: `${row.reference_year}-${String(row.reference_month).padStart(2, '0')}`, Situação: statusName(row.closure_status), Abastecimentos: number(row.registered_fueling_count), 'Litros registrados': number(row.registered_liters), 'Valor registrado (R$)': number(row.registered_amount), 'Valor fiscal (R$)': row.invoiced_amount == null ? '' : number(row.invoiced_amount), 'Diferença (R$)': row.divergence_amount == null ? '' : number(row.divergence_amount), 'Documentos pendentes': number(row.documents_pending_count), 'Atualizado em': timestamp(row.last_updated_at) }))
  const financialRows = () => (data?.financial_alerts || []).map((row) => ({ Posto: row.station_name, Competência: `${row.reference_year}-${String(row.reference_month).padStart(2, '0')}`, Alerta: row.label, 'Valor registrado (R$)': number(row.registered_amount), 'Valor fiscal (R$)': row.invoiced_amount == null ? '' : number(row.invoiced_amount), 'Diferença (R$)': row.divergence_amount == null ? '' : number(row.divergence_amount) }))

  const exportCsv = () => {
    if (!data || !context) return
    const rows: unknown[][] = [['METADADOS'], ['Campo', 'Valor'], ...metadataRows().map((row) => [row.Campo, row.Valor]), [], ['RESUMO'], ['Indicador', 'Valor'], ...summaryRows().map((row) => [row.Indicador, row.Valor]), [], ['EVOLUÇÃO MENSAL'], ['Competência', 'Abastecimentos', 'Litros abastecidos', 'Valor registrado (R$)', 'Preço médio ponderado (R$/L)'], ...monthRows().map((row) => Object.values(row)), [], ['RANKINGS (até 12 por dimensão)'], ['Dimensão', 'Identificação', 'Complemento', 'Abastecimentos', 'Litros abastecidos', 'Valor registrado (R$)', 'Preço médio ponderado (R$/L)'], ...dimensionRows().map((row) => Object.values(row)), [], ['ABASTECIMENTOS RECENTES'], ['Data do abastecimento', 'Data/hora do lançamento', 'Veículo', 'Motorista', 'Posto', 'Combustível', 'Litros abastecidos', 'Valor registrado (R$)', 'Preço unitário (R$/L)', 'Situação', 'Comprovante', 'Lançado posteriormente'], ...recentRows().map((row) => Object.values(row)), [], [`ABASTECIMENTOS DETALHADOS · página ${detailPage + 1} de ${detailPageCount} · ${detailTotal} registros no filtro`], ...detailRows.length ? [Object.keys(detailExportRows()[0]), ...detailExportRows().map((row) => Object.values(row))] : [['Sem registros nesta página']], [], ['ALERTAS DE ABASTECIMENTO E DOCUMENTOS'], ['Tipo', 'Prioridade', 'Alerta', 'Descrição', 'Veículo', 'Situação', 'Identificado em'], ...alertRows().map((row) => Object.values(row)), [], ['FECHAMENTOS POR POSTO'], ['Posto', 'Competência', 'Situação', 'Abastecimentos', 'Litros registrados', 'Valor registrado (R$)', 'Valor fiscal (R$)', 'Diferença (R$)', 'Documentos pendentes', 'Atualizado em'], ...closureRows().map((row) => Object.values(row)), [], ['DIVERGÊNCIAS FINANCEIRAS POR POSTO'], ['Posto', 'Competência', 'Alerta', 'Valor registrado (R$)', 'Valor fiscal (R$)', 'Diferença (R$)'], ...financialRows().map((row) => Object.values(row))]
    download(`relatorio-abastecimentos-postos-${applied.fromMonth}-${applied.toMonth}.csv`, `\uFEFF${rows.map((row) => row.map(csvValue).join(';')).join('\r\n')}`, 'text/csv;charset=utf-8')
  }
  const exportExcel = () => {
    if (!data || !context) return
    const workbook = XLSX.utils.book_new()
    const addSheet = (name: string, rows: object[]) => {
      const safeRows = (rows.length ? rows : [{ Informação: 'Sem dados para os filtros selecionados' }]).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? `'${value}` : value])))
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(safeRows), name)
    }
    addSheet('Metadados', metadataRows())
    addSheet('Resumo', summaryRows())
    addSheet('Evolução mensal', monthRows())
    addSheet('Dimensões', dimensionRows())
    addSheet('Abastecimentos recentes', recentRows())
    addSheet(`Detalhe página ${detailPage + 1}`, detailExportRows().length ? detailExportRows() : [{ Informação: 'Sem registros nesta página' }])
    addSheet('Alertas', alertRows())
    addSheet('Fechamentos por posto', closureRows())
    addSheet('Divergências fiscais', financialRows())
    XLSX.writeFile(workbook, `relatorio-abastecimentos-postos-${applied.fromMonth}-${applied.toMonth}.xlsx`)
  }
  const exportPdf = () => {
    if (!data || !context) return
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
    const pageWidth = doc.internal.pageSize.getWidth()
    doc.setTextColor(11, 41, 64); doc.setFontSize(16); doc.text('Relatório gerencial de abastecimentos e postos', 14, 16)
    doc.setFontSize(9); doc.setTextColor(75, 96, 108)
    const closureScope = context.scope === 'UNIDADES' ? 'Fechamentos e valores fiscais não disponíveis para este perfil.' : 'Fechamentos filtrados por competência e posto; demais filtros aplicam-se aos abastecimentos, não aos fechamentos.'
    const meta = [context.municipality_name, `Período: ${period}`, 'Critério de data: ocorrência real do abastecimento; o lançamento é informado separadamente.', `Gerado: ${timestamp(context.generated_at)}`, `Usuário: ${context.user_email || userEmail || 'Usuário autenticado'}`, `Perfil: ${context.role}`, `Filtros: ${filterLabels.join(' · ')}`, closureScope]
    let y = 23
    for (const text of meta) { const lines = doc.splitTextToSize(text, pageWidth - 28); doc.text(lines, 14, y); y += lines.length * 4.5 }
    const methodNotes = [
      'Método: preço médio ponderado = valor registrado ÷ litros abastecidos. Litros não equivalem necessariamente a combustível efetivamente consumido.',
      'Ressalva: alertas são sinalizadores para análise e não comprovam, por si sós, irregularidade.'
    ]
    for (const note of methodNotes) { const lines = doc.splitTextToSize(note, pageWidth - 28); doc.text(lines, 14, y + 1); y += lines.length * 4.2 }
    y += 4
    const addTable = (title: string, head: string[], body: (string | number)[][]) => {
      if (y > 175) { doc.addPage(); y = 16 }
      doc.setTextColor(11, 41, 64); doc.setFontSize(11); doc.text(title, 14, y)
      autoTable(doc, { startY: y + 3, head: [head], body: body.length ? body : [['Sem dados para os filtros selecionados']], styles: { fontSize: 7, cellPadding: 2 }, headStyles: { fillColor: [15, 88, 115] }, alternateRowStyles: { fillColor: [245, 248, 250] }, margin: { left: 14, right: 14 } })
      y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 9 : y + 30
    }
    addTable('Indicadores consolidados', ['Indicador', 'Valor'], summaryRows().map((row) => [row.Indicador, typeof row.Valor === 'number' ? quantity(row.Valor) : row.Valor]))
    addTable(`Quebra por dimensão: ${selectedRowsLabel}`, [selectedRowsLabel, 'Abastecimentos', 'Litros', 'Valor registrado', 'Preço médio ponderado'], selectedRows.map((row) => [row.label, number(row.fueling_count), quantity(row.liters), money(row.amount), row.weighted_price_per_liter == null && !number(row.liters) ? '—' : money(row.weighted_price_per_liter == null ? number(row.amount) / number(row.liters) : row.weighted_price_per_liter)]))
    addTable('Preço médio ponderado por posto', ['Posto', 'Abastecimentos', 'Litros', 'Valor registrado', 'Preço médio/L'], (data.by_station || []).map((row) => [row.label, number(row.fueling_count), quantity(row.liters), money(row.amount), row.weighted_price_per_liter == null ? '—' : money(row.weighted_price_per_liter)]))
    addTable('Evolução mensal', ['Competência', 'Abastecimentos', 'Litros', 'Valor registrado', 'Preço médio/L'], (data.monthly || []).map((row) => [formatMonth(row.month), number(row.fueling_count), quantity(row.liters), money(row.amount), number(row.liters) ? money(number(row.amount) / number(row.liters)) : '—']))
    addTable(`Abastecimentos detalhados · página ${detailPage + 1} de ${detailPageCount}`, ['Data da operação', 'Data do lançamento', 'Veículo', 'Motorista', 'Posto', 'Combustível', 'Litros', 'Valor', 'Situação'], detailRows.map((row) => [timestamp(row.performed_at), timestamp(row.submitted_at), row.plate || row.vehicle_description || '—', row.driver_name || '—', row.station_name || '—', row.fuel_type_name || '—', quantity(row.liters), money(row.amount), statusName(row.status)]))
    addTable('Abastecimentos recentes', ['Data da operação', 'Data do lançamento', 'Veículo', 'Motorista', 'Posto', 'Combustível', 'Litros', 'Valor', 'Situação', 'Lançado depois?'], (data.recent || []).map((row) => [timestamp(row.performed_at), timestamp(row.submitted_at), row.plate || '—', row.driver_name || '—', row.station_name || '—', row.fuel_type_name || '—', quantity(row.liters), money(row.amount), statusName(row.status), row.entered_later ? 'Sim' : 'Não']))
    addTable('Alertas de abastecimento e comprovantes', ['Tipo', 'Prioridade', 'Alerta', 'Descrição', 'Veículo', 'Situação', 'Identificado em'], (data.alerts || []).map((row) => [row.kind, row.severity, row.label, row.description, row.plate || '—', statusName(row.status), timestamp(row.created_at)]))
    addTable('Fechamentos e divergências por posto', ['Posto', 'Competência', 'Registrado', 'Fiscal', 'Diferença', 'Docs pendentes', 'Última movimentação', 'Situação'], (data.closures || []).map((row) => [row.station_name, `${row.reference_year}-${String(row.reference_month).padStart(2, '0')}`, money(row.registered_amount), row.invoiced_amount == null ? '—' : money(row.invoiced_amount), row.divergence_amount == null ? '—' : money(row.divergence_amount), number(row.documents_pending_count), timestamp(row.last_updated_at), statusName(row.station_check_status)]))
    addTable('Divergências financeiras por posto', ['Posto', 'Competência', 'Valor registrado', 'Valor fiscal', 'Diferença', 'Alerta'], (data.financial_alerts || []).map((row) => [row.station_name, `${row.reference_year}-${String(row.reference_month).padStart(2, '0')}`, money(row.registered_amount), row.invoiced_amount == null ? '—' : money(row.invoiced_amount), row.divergence_amount == null ? '—' : money(row.divergence_amount), row.label]))
    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page += 1) { doc.setPage(page); doc.setFontSize(8); doc.setTextColor(100, 112, 120); doc.text(`Página ${page} de ${pages}`, pageWidth - 31, doc.internal.pageSize.getHeight() - 7) }
    doc.save(`relatorio-abastecimentos-postos-${applied.fromMonth}-${applied.toMonth}.pdf`)
  }

  const setPresetAndApply = (preset: 'last3' | 'last6' | 'last12' | 'year') => {
    const now = currentMonth()
    const from = preset === 'last3' ? shiftMonth(now, -2) : preset === 'last6' ? shiftMonth(now, -5) : preset === 'last12' ? shiftMonth(now, -11) : `${now.slice(0, 4)}-01`
    const next = { ...draft, fromMonth: from, toMonth: now }
    setLoading(true)
    setError('')
    setDetailPage(0)
    setDetailLoading(true)
    setDetailError('')
    setDraft(next)
    setApplied(next)
  }
  const resetPeriod = () => { setLoading(true); setError(''); setDetailPage(0); setDetailLoading(true); setDetailError(''); setDraft({ ...initialFilters }); setApplied({ ...initialFilters }) }
  const goToPreviousDetailPage = () => {
    if (detailPage === 1 && result?.data.report_detail) {
      setDetailRows(result.data.report_detail.rows || [])
      setDetailTotal(number(result.data.report_detail.total_count))
      setDetailError('')
    }
    if (detailPage > 1) setDetailLoading(true)
    setDetailError('')
    setDetailPage((page) => Math.max(0, page - 1))
  }

  return <section className="fleet-section fleet-page-section fuel-report-page">
    <div className="fleet-page-heading"><div><span className="fleet-kicker">RELATÓRIOS OPERACIONAIS</span><h2>Abastecimentos e postos</h2><p>Litros, valores registrados, preço médio ponderado, veículos, motoristas, estabelecimentos e evolução por competência.</p></div><div className="fuel-report-heading-actions"><button type="button" className="fleet-icon-button" aria-label="Atualizar relatório" onClick={() => { setLoading(true); setError(''); setDetailPage(0); setDetailLoading(true); setDetailError(''); setApplied((value) => ({ ...value })) }} disabled={loading}><RefreshCw size={16} /></button><span className="fuel-report-timezone"><CalendarDays size={14} /> Fuso: America/Sao_Paulo</span></div></div>
    {error && <div className="fleet-inline-error" role="alert">{error}</div>}
    {loading && data && <div className="fuel-report-loading-note" role="status">Atualizando o relatório. Os dados abaixo ainda correspondem à consulta anterior; exportações ficam desabilitadas até a conclusão.</div>}
    <form className="fuel-report-filter-panel" onSubmit={applyFilters}>
      <div className="fuel-report-filter-heading"><div><Filter size={16} /><strong>Filtros do relatório</strong></div><div className="fuel-report-presets"><button type="button" onClick={() => setPresetAndApply('last3')}>3 meses</button><button type="button" onClick={() => setPresetAndApply('last6')}>6 meses</button><button type="button" onClick={() => setPresetAndApply('last12')}>12 meses</button><button type="button" onClick={() => setPresetAndApply('year')}>Ano atual</button></div></div>
      <div className="fuel-report-filter-grid">
        <label><span>De</span><input type="month" value={draft.fromMonth} max={current} onChange={(event) => setFilter('fromMonth', event.target.value)} required /></label>
        <label><span>Até</span><input type="month" value={draft.toMonth} max={current} onChange={(event) => setFilter('toMonth', event.target.value)} required /></label>
        <label><span>Secretaria responsável</span><select value={draft.responsible} onChange={(event) => setFilter('responsible', event.target.value)}><option value="">Todas no meu escopo</option>{(options?.units || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Secretaria beneficiária</span><select value={draft.beneficiary} onChange={(event) => setFilter('beneficiary', event.target.value)}><option value="">Todas no meu escopo</option>{(options?.units || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label><span>Veículo</span><select value={draft.vehicle} onChange={(event) => setFilter('vehicle', event.target.value)}><option value="">Todos no meu escopo</option>{(options?.vehicles || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Motorista</span><select value={draft.driver} onChange={(event) => setFilter('driver', event.target.value)}><option value="">Todos no meu escopo</option>{(options?.drivers || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Posto credenciado</span><select value={draft.station} onChange={(event) => setFilter('station', event.target.value)}><option value="">Todos no meu escopo</option>{(options?.stations || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Combustível</span><select value={draft.fuel} onChange={(event) => setFilter('fuel', event.target.value)}><option value="">Todos</option>{(options?.fuel_types || []).map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label><span>Situação do abastecimento</span><select value={draft.status} onChange={(event) => setFilter('status', event.target.value)}><option value="">Todas</option>{STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Situação do comprovante</span><select value={draft.document} onChange={(event) => setFilter('document', event.target.value)}><option value="">Todas</option>{DOCUMENT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>Abastecimentos recentes</span><select value={draft.recentLimit} onChange={(event) => setDraft((value) => ({ ...value, recentLimit: Number(event.target.value) }))}><option value={10}>10 registros</option><option value={20}>20 registros</option><option value={50}>50 registros</option></select></label>
      </div>
      <div className="fuel-report-filter-footer"><span>Filtros e período são validados novamente no Supabase; rascunhos e cancelamentos não compõem os totais.</span><div><button type="button" className="fleet-secondary-button" onClick={resetPeriod}>Limpar</button><button type="submit" className="fleet-primary-button" disabled={loading}><Filter size={14} /> Aplicar filtros</button></div></div>
    </form>
    {loading && !data ? <div className="fleet-loading"><RefreshCw className="spin" size={18} /> Carregando relatório seguro no Supabase…</div> : data && summary ? <>
      <div className="fuel-report-metadata"><span><strong>Município:</strong> {context?.municipality_name || '—'}</span><span><strong>Período:</strong> {period}</span><span><strong>Gerado:</strong> {timestamp(context?.generated_at)}</span><span><strong>Perfil:</strong> {context?.role || '—'} · {context?.scope === 'UNIDADES' ? (context.units || []).map((unit) => unit.acronym || unit.name).join(', ') : 'escopo municipal'}</span></div>
      <div className="fuel-report-actions"><button type="button" className="fleet-secondary-button" onClick={exportCsv} disabled={loading || detailLoading || Boolean(detailError)}><Download size={14} /> Exportar CSV</button><button type="button" className="fleet-secondary-button" onClick={exportExcel} disabled={loading || detailLoading || Boolean(detailError)}><FileSpreadsheet size={14} /> Exportar Excel</button><button type="button" className="fleet-primary-button" onClick={exportPdf} disabled={loading || detailLoading || Boolean(detailError)}><FileText size={14} /> Exportar PDF</button></div>
      <div className="fleet-metric-grid fuel-report-metrics">
        <article className="fleet-metric"><span className="fleet-metric-icon blue"><Fuel size={19} /></span><div><span>Abastecimentos válidos</span><strong>{quantity(summary.fueling_count, 0)}</strong><small>{period}</small></div></article>
        <article className="fleet-metric"><span className="fleet-metric-icon green"><Gauge size={19} /></span><div><span>Litros abastecidos</span><strong>{quantity(summary.liters)} L</strong><small>Volume abastecido, não consumo estimado</small></div></article>
        <article className="fleet-metric"><span className="fleet-metric-icon violet"><BarChart3 size={19} /></span><div><span>Valor registrado</span><strong>{money(summary.registered_amount)}</strong><small>Exclui rascunhos e cancelamentos</small></div></article>
        <article className="fleet-metric"><span className="fleet-metric-icon amber"><Fuel size={19} /></span><div><span>Preço médio ponderado</span><strong>{summary.weighted_price_per_liter == null ? '—' : `${money(summary.weighted_price_per_liter)}/L`}</strong><small>Valor registrado ÷ litros</small></div></article>
        <article className="fleet-metric"><span className="fleet-metric-icon blue"><Truck size={19} /></span><div><span>Veículos abastecidos</span><strong>{quantity(summary.distinct_vehicles, 0)}</strong><small>No período filtrado</small></div></article>
        <article className="fleet-metric"><span className="fleet-metric-icon green"><Store size={19} /></span><div><span>Postos utilizados</span><strong>{quantity(summary.distinct_stations, 0)}</strong><small>No período filtrado</small></div></article>
      </div>
      <div className="fuel-report-comparison"><strong>Comparações e pendências</strong><span>Hoje (independente do período selecionado): {money(summary.today_amount)}</span><span>Mês atual (independente do período selecionado): {money(summary.current_month_amount)}</span><span>Acumulado no exercício da consulta: {money(summary.year_to_date_amount)}</span><span>Período equivalente do exercício anterior: {money(summary.previous_year_to_date_amount)}</span><span>Período anterior equivalente: {money(summary.previous_period_amount)} · {quantity(summary.previous_period_count, 0)} abastecimentos</span><span>Variação do período anterior: {summary.period_variation_percent == null ? 'sem base anterior comparável' : `${quantity(summary.period_variation_percent)}%`}</span><span>Conferência pendente: {quantity(summary.pending_confirmation_count, 0)}</span><span>Comprovantes pendentes: {quantity(summary.pending_document_count, 0)}</span></div>
      <div className="fuel-report-panel">
        <div className="fuel-report-section-heading"><div><span className="fleet-kicker">COMPARATIVOS</span><h3>Detalhamento por dimensão</h3></div><label><span>Agrupar por</span><select value={dimension} onChange={(event) => setDimension(event.target.value as Dimension)}>{dimensions.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label></div>
        <div className="fleet-table-panel fuel-report-table-wrap"><table className="fleet-table fuel-report-table"><thead><tr><th>{selectedRowsLabel}</th><th>Abastecimentos</th><th>Litros</th><th>Valor registrado</th><th>Preço médio ponderado</th></tr></thead><tbody>{selectedRows.length ? selectedRows.map((row) => <tr key={row.id || row.label}><td><strong>{row.label}</strong><small>{row.description || row.acronym || ''}</small></td><td>{quantity(row.fueling_count, 0)}</td><td>{quantity(row.liters)} L</td><td>{money(row.amount)}</td><td>{row.weighted_price_per_liter == null && !number(row.liters) ? '—' : money(row.weighted_price_per_liter == null ? number(row.amount) / number(row.liters) : row.weighted_price_per_liter)}</td></tr>) : <tr><td colSpan={5}>Sem dados para esta dimensão e filtros.</td></tr>}</tbody></table></div>
        <p className="fuel-report-method-note">O ranking mostra até 12 itens por dimensão. Os cartões e os totais por período são calculados integralmente no backend e respeitam o escopo do usuário.</p>
      </div>
      <div className="fuel-report-panel">
        <div className="fuel-report-section-heading"><div><span className="fleet-kicker">POSTOS CREDENCIADOS</span><h3>Preço médio ponderado por posto</h3></div></div>
        <div className="fleet-table-panel fuel-report-table-wrap"><table className="fleet-table fuel-report-table"><thead><tr><th>Posto</th><th>Abastecimentos</th><th>Litros</th><th>Valor registrado</th><th>Preço médio ponderado/L</th></tr></thead><tbody>{data.by_station.length ? data.by_station.map((row) => <tr key={row.id || row.label}><td><strong>{row.label}</strong></td><td>{quantity(row.fueling_count, 0)}</td><td>{quantity(row.liters)} L</td><td>{money(row.amount)}</td><td>{row.weighted_price_per_liter == null ? '—' : money(row.weighted_price_per_liter)}</td></tr>) : <tr><td colSpan={5}>Nenhum abastecimento registrado para os filtros.</td></tr>}</tbody></table></div>
      </div>
      <div className="fuel-report-panel">
        <div className="fuel-report-section-heading"><div><span className="fleet-kicker">SÉRIE TEMPORAL</span><h3>Evolução mensal de litros, valores e operações</h3></div></div>
        <div className="fleet-table-panel fuel-report-table-wrap"><table className="fleet-table fuel-report-table"><thead><tr><th>Competência</th><th>Abastecimentos</th><th>Litros</th><th>Valor registrado</th><th>Preço médio ponderado/L</th></tr></thead><tbody>{data.monthly.map((row) => <tr key={row.month}><td>{formatMonth(row.month)}</td><td>{quantity(row.fueling_count, 0)}</td><td>{quantity(row.liters)} L</td><td>{money(row.amount)}</td><td>{number(row.liters) ? money(number(row.amount) / number(row.liters)) : '—'}</td></tr>)}</tbody></table></div>
      </div>
      <div className="fuel-report-panel">
        <div className="fuel-report-section-heading"><div><span className="fleet-kicker">ATIVIDADE OPERACIONAL</span><h3>Abastecimentos recentes</h3></div><span className="fuel-report-result-count">Até {applied.recentLimit} registros</span></div>
        <div className="fleet-table-panel fuel-report-table-wrap"><table className="fleet-table fuel-report-table"><thead><tr><th>Data/hora da operação</th><th>Data/hora do lançamento</th><th>Veículo</th><th>Motorista</th><th>Posto</th><th>Combustível</th><th>Litros</th><th>Valor</th><th>Preço/L</th><th>Situação</th><th>Comprovante</th></tr></thead><tbody>{data.recent.length ? data.recent.map((row) => <tr key={row.id}><td>{timestamp(row.performed_at)}{row.entered_later && <small> Lançado posteriormente</small>}</td><td>{timestamp(row.submitted_at)}</td><td>{row.plate || '—'}</td><td>{row.driver_name || '—'}</td><td>{row.station_name || '—'}</td><td>{row.fuel_type_name || '—'}</td><td>{quantity(row.liters)} L</td><td>{money(row.amount)}</td><td>{row.unit_price == null ? '—' : money(row.unit_price)}</td><td>{statusName(row.status)}</td><td>{statusName(row.document_status)}</td></tr>) : <tr><td colSpan={11}>Nenhum abastecimento recente para os filtros.</td></tr>}</tbody></table></div>
      </div>
      <div className="fuel-report-panel">
        <div className="fuel-report-section-heading"><div><span className="fleet-kicker">REGISTROS DO PERÍODO</span><h3>Abastecimentos filtrados · detalhe paginado</h3></div><span className="fuel-report-result-count">{detailTotal.toLocaleString('pt-BR')} registros</span></div>
        {detailError && <div className="fleet-inline-error" role="alert">{detailError}</div>}
        <div className="fleet-table-panel fuel-report-table-wrap"><table className="fleet-table fuel-report-table fuel-report-detail-table"><thead><tr><th>Data/hora da operação</th><th>Data/hora do lançamento</th><th>Veículo</th><th>Motorista</th><th>Posto</th><th>Combustível</th><th>Secretaria responsável</th><th>Beneficiária</th><th>Litros</th><th>Valor</th><th>Preço/L</th><th>Situação</th><th>Comprovante</th></tr></thead><tbody>{detailLoading ? <tr><td colSpan={13}>Carregando página de registros…</td></tr> : detailRows.length ? detailRows.map((row) => <tr key={row.id}><td>{timestamp(row.performed_at)}</td><td>{timestamp(row.submitted_at)}</td><td>{row.plate || row.vehicle_description || '—'}</td><td>{row.driver_name || '—'}</td><td>{row.station_name || '—'}</td><td>{row.fuel_type_name || '—'}</td><td>{row.responsible_unit_name || '—'}</td><td>{row.beneficiary_unit_name || '—'}</td><td>{quantity(row.liters)} L</td><td>{money(row.amount)}</td><td>{row.unit_price == null ? '—' : money(row.unit_price)}</td><td>{statusName(row.status)}</td><td>{statusName(row.document_status)}</td></tr>) : <tr><td colSpan={13}>Nenhum abastecimento encontrado com estes filtros.</td></tr>}</tbody></table></div>
        <div className="fuel-report-pagination"><span>{detailTotal ? `Exibindo ${detailPage * 50 + 1}–${Math.min((detailPage + 1) * 50, detailTotal)} de ${detailTotal.toLocaleString('pt-BR')}` : 'Sem registros'}</span><div><button type="button" className="fleet-secondary-button" disabled={detailPage === 0 || detailLoading} onClick={goToPreviousDetailPage}>Anterior</button><span>Página {detailPage + 1} de {detailPageCount}</span><button type="button" className="fleet-secondary-button" disabled={detailLoading || (detailPage + 1) * 50 >= detailTotal || detailPage + 1 >= detailPageCount} onClick={() => { setDetailLoading(true); setDetailError(''); setDetailPage((page) => page + 1) }}>Próxima</button></div></div>
        <p className="fuel-report-method-note">Consulta paginada no Supabase, 50 registros por página. A exportação inclui a página atualmente aberta, além dos agregados integrais.</p>{detailTotal > 100050 && <p className="fuel-report-loading-note" role="status">O resultado excede o limite seguro de navegação de 100.050 registros; refine o período ou os filtros para alcançar os demais registros.</p>}
      </div>
      {(data.alerts.length > 0 || data.closures.length > 0 || data.financial_alerts.length > 0) && <div className="fuel-report-panel">
        <div className="fuel-report-section-heading"><div><span className="fleet-kicker">CONTROLE DE POSTOS E DOCUMENTOS</span><h3>Alertas, comprovantes e fechamentos</h3></div></div>
        <p className="fuel-report-method-note">Fechamentos e divergências fiscais seguem competência e posto selecionado. Os filtros de secretaria, veículo, motorista, combustível, situação e comprovante se aplicam aos abastecimentos, não aos fechamentos.</p>
        {data.alerts.length > 0 && <div className="fuel-report-subsection"><h4>Alertas de abastecimento e documentação</h4><div className="fleet-table-panel fuel-report-table-wrap"><table className="fleet-table fuel-report-table"><thead><tr><th>Tipo</th><th>Prioridade</th><th>Alerta</th><th>Veículo</th><th>Situação</th><th>Identificado</th></tr></thead><tbody>{data.alerts.map((row) => <tr key={`${row.kind}-${row.id}`}><td>{row.kind}</td><td>{row.severity}</td><td>{row.label}<small>{row.description}</small></td><td>{row.plate || '—'}</td><td>{statusName(row.status)}</td><td>{timestamp(row.created_at)}</td></tr>)}</tbody></table></div></div>}
        {data.closures.length > 0 && <div className="fuel-report-subsection"><h4>Fechamentos por posto</h4><div className="fleet-table-panel fuel-report-table-wrap"><table className="fleet-table fuel-report-table"><thead><tr><th>Posto</th><th>Competência</th><th>Abastecimentos</th><th>Valor registrado</th><th>Valor fiscal</th><th>Diferença</th><th>Documentos pendentes</th><th>Última movimentação</th><th>Situação</th></tr></thead><tbody>{data.closures.map((row) => <tr key={row.closure_id + row.station_name}><td>{row.station_name}</td><td>{row.reference_year}-{String(row.reference_month).padStart(2, '0')}</td><td>{quantity(row.registered_fueling_count, 0)}</td><td>{money(row.registered_amount)}</td><td>{row.invoiced_amount == null ? '—' : money(row.invoiced_amount)}</td><td>{row.divergence_amount == null ? '—' : money(row.divergence_amount)}</td><td>{quantity(row.documents_pending_count, 0)}</td><td>{timestamp(row.last_updated_at)}</td><td>{statusName(row.station_check_status || row.closure_status)}</td></tr>)}</tbody></table></div></div>}
        {data.financial_alerts.length > 0 && <div className="fuel-report-subsection"><h4>Divergências financeiras informadas pelos postos</h4><div className="fleet-table-panel fuel-report-table-wrap"><table className="fleet-table fuel-report-table"><thead><tr><th>Posto</th><th>Competência</th><th>Registrado</th><th>Fiscal</th><th>Diferença</th><th>Alerta</th></tr></thead><tbody>{data.financial_alerts.map((row, index) => <tr key={`${row.station_name}-${row.reference_year}-${row.reference_month}-${index}`}><td>{row.station_name}</td><td>{row.reference_year}-{String(row.reference_month).padStart(2, '0')}</td><td>{money(row.registered_amount)}</td><td>{money(row.invoiced_amount)}</td><td>{money(row.divergence_amount)}</td><td>{row.label}</td></tr>)}</tbody></table></div></div>}
      </div>}
      {context?.scope === 'UNIDADES' && <p className="fuel-report-method-note">Por segurança, fechamentos e valores fiscais dos postos não são disponibilizados neste perfil; os indicadores de abastecimento permanecem limitados às unidades autorizadas.</p>}
      <p className="fuel-report-method-note">Atualizado em {timestamp(data.updated_at)}. Valores e quantidades seguem os critérios de cálculo do Dashboard Gerencial. Anomalias são sinalizadores para análise, não conclusão automática de irregularidade. O preço médio é ponderado pelo volume; consumo efetivo não é estimado apenas pela soma dos litros abastecidos.</p>
    </> : !loading && <div className="fleet-empty"><span><BarChart3 size={24} /></span><strong>Nenhum dado para exibir</strong><p>Não há abastecimentos no período e no escopo selecionados.</p></div>}
  </section>
}
