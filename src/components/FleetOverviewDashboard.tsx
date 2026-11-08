import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, CalendarDays, CheckCircle2, ChevronRight,
  CircleDollarSign, ClipboardCheck, Clock3, Download, Droplets, FileSpreadsheet, FileText, Filter,
  Fuel, Gauge, RefreshCw, ShieldAlert, Store, Truck, Users, X,
} from 'lucide-react'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { supabase } from '../lib/supabase'
import { addMunicipalExcelWorksheet, addMunicipalPdfFooters, drawMunicipalPdfHeader, loadMunicipalCrestDataUrl, REPORT_TABLE_START_Y } from '../lib/reportStandards'
import { MUNICIPAL_TIME_ZONE } from '../lib/municipalTime'

type FleetRoute = 'fuelings' | 'closure' | 'drivers' | 'vehicles'
type Props = { userEmail?: string; onNavigate: (view: FleetRoute) => void; onPendingCount: (count: number) => void; readOnly: boolean; scopeRole: 'manager' | 'mayor' | 'fiscal' | 'secretary'; scopeLabel: string }
type Option = { id: string; label?: string; name?: string; acronym?: string }
type FilterOptions = { units: Option[]; vehicles: Option[]; drivers: Option[]; stations: Option[]; fuel_types: Option[] }
type MetricRow = { id: string | null; label: string; acronym?: string; description?: string; amount: number; liters: number; fueling_count: number; weighted_price_per_liter?: number | null; last_fueling_at?: string | null }
type MonthRow = { month: string; amount: number; liters: number; fueling_count: number }
type Summary = {
  fueling_count: number; liters: number; registered_amount: number; confirmed_amount: number; confirmed_count: number;
  pending_confirmation_count: number; pending_document_count: number; fueling_alert_count: number; distinct_vehicles: number;
  distinct_stations: number; average_per_fueling: number; weighted_price_per_liter: number | null; active_vehicle_count: number;
  year_to_date_amount: number; year_to_date_count: number; previous_period_amount: number; previous_period_count: number;
  previous_year_to_date_amount: number; previous_year_to_date_count: number; today_amount: number; today_count: number;
  current_month_amount: number; current_month_count: number;
  period_variation_percent: number | null; period_variation_base_missing: boolean; open_inconsistency_count: number;
  open_closure_count: number; cnh_expired_or_due_count: number;
}
type RecentRow = {
  id: string; status: string; performed_at: string; submitted_at: string | null; vehicle_id: string | null; placa: string | null;
  driver_id: string | null; driver_name: string | null; station_id: string | null; station_name: string | null;
  fuel_type_id: string | null; fuel_type_name: string | null; liters: number; amount: number; unit_price: number | null;
  odometer_km: number | null; document_status: string | null; entered_later: boolean;
}
type AlertRow = { id: string; kind: string; severity: string; label: string; description: string; status: string; created_at: string; fueling_id: string | null; vehicle_id: string | null; placa: string | null; resolved_at: string | null; resolution_notes: string | null }
type ClosureRow = { closure_id: string; reference_year: number; reference_month: number; closure_status: string; station_id: string | null; station_name: string; registered_fueling_count: number; registered_liters: number; registered_amount: number; invoiced_amount: number | null; divergence_amount: number | null; documents_pending_count: number; station_check_status: string | null; last_updated_at: string | null }
type FinancialAlert = { closure_id: string; reference_year: number; reference_month: number; station_id: string; station_name: string; registered_amount: number; invoiced_amount: number | null; divergence_amount: number; station_check_status: string; label: string }
type CnhAlert = { id: string; driver_name: string; cnh_valid_until: string; alert_status: 'VENCIDA' | 'VENCE_EM_ATE_60_DIAS'; days_until_expiry: number }
type MovementRow = { id: string; vehicle_id: string; placa: string | null; responsible_unit_name: string; beneficiary_unit_name: string; purpose: string; valid_from: string; valid_until: string; status: string }
type Payload = {
  period: { start_month: string; end_month_exclusive: string; timezone: string }; updated_at: string; summary: Summary;
  monthly: MonthRow[]; by_responsible_unit: MetricRow[]; by_beneficiary_unit: MetricRow[]; by_vehicle: MetricRow[];
  by_driver: MetricRow[]; by_station: MetricRow[]; by_fuel_type: MetricRow[]; recent: RecentRow[]; alerts: AlertRow[];
  financial_alerts: FinancialAlert[]; closures: ClosureRow[]; cnh_alerts: CnhAlert[];
  vehicle_status: { status: string; vehicle_count: number }[]; approved_movements: MovementRow[]; filter_options: FilterOptions;
}
type Filters = { responsible: string; beneficiary: string; vehicle: string; driver: string; station: string; fuel: string; status: string; document: string }
type DetailRow = { id: string; status: string; performed_at: string; submitted_at: string | null; plate: string | null; vehicle_description: string | null; driver_name: string | null; station_name: string | null; fuel_type_name: string | null; responsible_unit_name: string | null; beneficiary_unit_name: string | null; liters: number; amount: number; unit_price: number | null; odometer_km: number | null; document_status: string | null }
type DetailSpec = { dimension: string; id: string | null; label: string; from: string; to: string }

const statusLabels: Record<string, string> = {
  ENVIADO_PELO_POSTO: 'Enviado pelo posto', PENDENTE_DE_COMPROVANTE: 'Pendente de comprovante',
  PENDENTE_DE_CONFERENCIA: 'Pendente de conferência', EM_ANALISE: 'Em análise', COM_INCONSISTENCIA: 'Com inconsistência',
  SOLICITADA_CORRECAO: 'Correção solicitada', CORRIGIDO: 'Corrigido', CONFERIDO: 'Conferido',
  INCLUIDO_NO_FECHAMENTO: 'Incluído no fechamento', ACEITO: 'Aceito', REJEITADO: 'Rejeitado',
  ENVIADO: 'Enviado', PENDENTE: 'Pendente', SEM_COMPROVANTE: 'Sem comprovante', SUBSTITUIDO: 'Substituído',
}
const emptyFilters: Filters = { responsible: '', beneficiary: '', vehicle: '', driver: '', station: '', fuel: '', status: '', document: '' }
const number = (value: unknown) => Number(value || 0)
const money = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(number(value))
const integer = (value: unknown) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(number(value))
const liters = (value: unknown) => `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(number(value))} L`
const formatDate = (value?: string | null) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(date) }
const formatDay = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : '—'
const currentMonthKey = () => { const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date()); return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}` }
const shiftMonth = (key: string, offset: number) => { const [year, month] = key.split('-').map(Number); const d = new Date(Date.UTC(year, month - 1 + offset, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}` }
const monthDate = (key: string) => `${key}-01`
const monthLabel = (key: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(key) ? new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${key}-01T00:00:00Z`)) : 'Mês inválido'
const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`

function periodRange(preset: string, customFrom: string, customTo: string) {
  const now = currentMonthKey()
  if (preset === 'current') return { from: now, to: now }
  if (preset === 'previous') { const prev = shiftMonth(now, -1); return { from: prev, to: prev } }
  if (preset === 'last3') return { from: shiftMonth(now, -2), to: now }
  if (preset === 'last6') return { from: shiftMonth(now, -5), to: now }
  if (preset === 'last12') return { from: shiftMonth(now, -11), to: now }
  if (preset === 'year') return { from: `${now.slice(0, 4)}-01`, to: now }
  if (preset === 'previousYear') { const year = Number(now.slice(0, 4)) - 1; return { from: `${year}-01`, to: `${year}-12` } }
  return { from: customFrom, to: customTo }
}
function escapeCsv(rows: unknown[][]) { return `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}` }

export function FleetOverviewDashboard({ userEmail, onNavigate, onPendingCount, readOnly, scopeRole, scopeLabel }: Props) {
  const current = currentMonthKey()
  const [preset, setPreset] = useState('last12')
  const [fromMonth, setFromMonth] = useState(shiftMonth(current, -11))
  const [toMonth, setToMonth] = useState(current)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [recentLimit, setRecentLimit] = useState(20)
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [detail, setDetail] = useState<DetailSpec | null>(null)
  const [detailRows, setDetailRows] = useState<DetailRow[]>([])
  const [detailTotal, setDetailTotal] = useState(0)
  const [detailLoading, setDetailLoading] = useState(false)
  const [selectedRecord, setSelectedRecord] = useState<RecentRow | AlertRow | null>(null)
  const overviewRequestId = useRef(0)
  const detailRequestId = useRef(0)

  const startMonth = monthDate(fromMonth)
  const endMonthExclusive = monthDate(shiftMonth(toMonth, 1))
  const monthSpan = fromMonth && toMonth ? (Number(toMonth.slice(0, 4)) - Number(fromMonth.slice(0, 4))) * 12 + Number(toMonth.slice(5, 7)) - Number(fromMonth.slice(5, 7)) + 1 : 0
  const invalidRange = !fromMonth || !toMonth || fromMonth > toMonth || monthSpan > 120

  const load = useCallback(async () => {
    const requestId = ++overviewRequestId.current
    if (!supabase) { setData(null); setError('O serviço de dados está indisponível.'); setLoading(false); return }
    if (invalidRange) { setData(null); setError(monthSpan > 120 ? 'O período máximo permitido é de 120 meses.' : 'Escolha meses válidos e confirme que o mês inicial não é posterior ao mês final.'); setLoading(false); return }
    setLoading(true); setError('')
    const { data: result, error: requestError } = await supabase.rpc('fleet_dashboard_overview', {
      p_start_month: startMonth, p_end_month_exclusive: endMonthExclusive,
      p_responsible_unit_id: filters.responsible || null, p_beneficiary_unit_id: filters.beneficiary || null,
      p_vehicle_id: filters.vehicle || null, p_driver_id: filters.driver || null, p_station_id: filters.station || null,
      p_fuel_type_id: filters.fuel || null, p_fueling_status: filters.status || null,
      p_document_status: filters.document || null, p_recent_limit: recentLimit,
    })
    if (requestId !== overviewRequestId.current) return
    if (requestError) { setData(null); setError(requestError.message.includes('42501') ? 'Seu perfil não tem permissão para consultar este painel.' : 'Não foi possível carregar os indicadores. Tente atualizar; os totais não foram substituídos por uma amostra local.'); setLoading(false); return }
    const parsed = result as unknown as Payload
    setData(parsed)
    onPendingCount(number(parsed?.summary?.pending_confirmation_count))
    setLoading(false)
  }, [endMonthExclusive, filters, invalidRange, monthSpan, onPendingCount, recentLimit, startMonth])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!detail && !selectedRecord) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const root = document.querySelector<HTMLElement>('.fleet-overview-detail-modal, .fleet-overview-record-modal')
    document.body.style.overflow = 'hidden'
    const frame = window.requestAnimationFrame(() => root?.querySelector<HTMLElement>('button:not([disabled]),a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')?.focus())
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setDetail(null); setSelectedRecord(null); return }
      if (event.key !== 'Tab') return
      if (!root) return
      const focusable = Array.from(root.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
      if (!focusable.length) { event.preventDefault(); return }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [detail, selectedRecord])

  const updateFilter = (key: keyof Filters, value: string) => setFilters((old) => ({ ...old, [key]: value }))
  const clearFilters = () => setFilters(emptyFilters)
  const options = data?.filter_options
  const selectedFilterLabels = useMemo(() => {
    if (!options) return [] as string[]
    const findLabel = (items: Option[], id: string) => items.find((item) => item.id === id)?.label || items.find((item) => item.id === id)?.name || id
    const values: string[] = [`Referência: ${monthLabel(fromMonth)}${fromMonth !== toMonth ? ` a ${monthLabel(toMonth)}` : ''}`]
    if (filters.responsible) values.push(`Responsável: ${findLabel(options.units, filters.responsible)}`)
    if (filters.beneficiary) values.push(`Beneficiária: ${findLabel(options.units, filters.beneficiary)}`)
    if (filters.vehicle) values.push(`Veículo: ${findLabel(options.vehicles, filters.vehicle)}`)
    if (filters.driver) values.push(`Motorista: ${findLabel(options.drivers, filters.driver)}`)
    if (filters.station) values.push(`Posto: ${findLabel(options.stations, filters.station)}`)
    if (filters.fuel) values.push(`Combustível: ${findLabel(options.fuel_types, filters.fuel)}`)
    if (filters.status) values.push(`Abastecimento: ${statusLabels[filters.status] || filters.status}`)
    if (filters.document) values.push(`Comprovante: ${statusLabels[filters.document] || filters.document}`)
    return values
  }, [filters, fromMonth, options, toMonth])

  const openDimension = async (dimension: string, id: string | null, label: string, from = fromMonth, to = toMonth) => {
    const requestId = ++detailRequestId.current
    const spec = { dimension, id, label, from, to }
    setDetail(spec); setSelectedRecord(null); setDetailRows([]); setDetailTotal(0); setDetailLoading(true)
    if (!supabase) { setDetailLoading(false); return }
    const { data: result, error: detailError } = await supabase.rpc('fleet_dashboard_detail', {
      p_start_month: monthDate(from), p_end_month_exclusive: monthDate(shiftMonth(to, 1)),
      p_dimension: dimension, p_dimension_id: id,
      p_responsible_unit_id: filters.responsible || null, p_beneficiary_unit_id: filters.beneficiary || null,
      p_vehicle_id: filters.vehicle || null, p_driver_id: filters.driver || null, p_station_id: filters.station || null,
      p_fuel_type_id: filters.fuel || null, p_fueling_status: filters.status || null,
      p_document_status: filters.document || null, p_limit: 50, p_offset: 0,
    })
    if (requestId !== detailRequestId.current) return
    if (detailError) { setError('Não foi possível abrir o detalhamento deste indicador.'); setDetailLoading(false); return }
    const resultObject = result as { rows?: DetailRow[]; total_count?: number }
    setDetailRows(resultObject.rows || []); setDetailTotal(number(resultObject.total_count)); setDetailLoading(false)
  }

  const loadMoreDetail = async () => {
    if (!detail || !supabase || detailLoading || detailRows.length >= detailTotal) return
    setDetailLoading(true)
    const { data: result, error: detailError } = await supabase.rpc('fleet_dashboard_detail', {
      p_start_month: monthDate(detail.from), p_end_month_exclusive: monthDate(shiftMonth(detail.to, 1)),
      p_dimension: detail.dimension, p_dimension_id: detail.id,
      p_responsible_unit_id: filters.responsible || null, p_beneficiary_unit_id: filters.beneficiary || null,
      p_vehicle_id: filters.vehicle || null, p_driver_id: filters.driver || null, p_station_id: filters.station || null,
      p_fuel_type_id: filters.fuel || null, p_fueling_status: filters.status || null,
      p_document_status: filters.document || null, p_limit: 50, p_offset: detailRows.length,
    })
    if (detailError) setError('Não foi possível carregar mais detalhes.')
    else { const resultObject = result as { rows?: DetailRow[]; total_count?: number }; setDetailRows((rows) => [...rows, ...(resultObject.rows || [])]); setDetailTotal(number(resultObject.total_count)) }
    setDetailLoading(false)
  }

  const exportRows = () => {
    if (!data) return [] as unknown[][]
    const rows: unknown[][] = [['Dimensão', 'Identificação', 'Abastecimentos', 'Litros registrados', 'Valor registrado (R$)', 'Preço médio ponderado (R$/L)']]
    const groups: [string, MetricRow[]][] = [
      ['Secretaria responsável', data.by_responsible_unit], ['Secretaria beneficiária', data.by_beneficiary_unit],
      ['Veículo', data.by_vehicle], ['Motorista', data.by_driver], ['Posto', data.by_station], ['Combustível', data.by_fuel_type],
    ]
    for (const [dimension, values] of groups) for (const row of values) rows.push([dimension, row.label, row.fueling_count, number(row.liters), number(row.amount), row.weighted_price_per_liter ?? ''])
    return rows
  }

  const exportCsv = () => {
    if (!data) return
    const rows: unknown[][] = [
      ['Relatório gerencial de abastecimentos'], ['Período', `${monthLabel(fromMonth)}${fromMonth !== toMonth ? ` a ${monthLabel(toMonth)}` : ''}`],
      ['Perfil', scopeRole], ['Escopo', scopeLabel || 'Municipal'], ['Filtros aplicados', selectedFilterLabels.join(' | ')],
      ['Gerado em', formatDate(data.updated_at)], ['Usuário', userEmail || 'Usuário autenticado'], ['Fuso horário oficial', MUNICIPAL_TIME_ZONE], [],
      ['Indicador', 'Valor'], ['Hoje', number(data.summary.today_amount)], ['Mês atual', number(data.summary.current_month_amount)],
      ['Período selecionado', number(data.summary.registered_amount)], ['Valor conferido', number(data.summary.confirmed_amount)],
      ['Acumulado no exercício', number(data.summary.year_to_date_amount)], ['Acumulado no mesmo período do exercício anterior', number(data.summary.previous_year_to_date_amount)],
      ['Abastecimentos', number(data.summary.fueling_count)], ['Litros registrados', number(data.summary.liters)],
      ['Método', 'Totais integrais no escopo autorizado; dimensões limitadas ao Top 12, alertas a até 60 itens e recentes conforme seletor (10/20/50).'],
      ['Consumo médio efetivo', 'Não calculado: exige sequência confiável de hodômetros e metodologia de abastecimento validada.'],
    ]
    const section = (title: string, headers: unknown[], values: unknown[][]) => rows.push([], [title], headers, ...values)
    section('Evolução mensal', ['Mês', 'Abastecimentos', 'Litros', 'Valor registrado'], data.monthly.map((row) => [monthLabel(row.month), row.fueling_count, number(row.liters), number(row.amount)]))
    section('Dimensões (Top 12 por valor)', ['Dimensão', 'Identificação', 'Abastecimentos', 'Litros', 'Valor', 'Preço médio ponderado/L'], exportRows().slice(1))
    section('Abastecimentos recentes (limite selecionado)', ['Data', 'Placa', 'Motorista', 'Posto', 'Combustível', 'Litros', 'Valor', 'Situação', 'Comprovante'], data.recent.map((row) => [formatDate(row.performed_at), row.placa, row.driver_name, row.station_name, row.fuel_type_name, number(row.liters), number(row.amount), statusLabels[row.status] || row.status, statusLabels[row.document_status || 'SEM_COMPROVANTE'] || 'Sem comprovante']))
    section('Pendências e inconsistências (até 60 itens)', ['Tipo', 'Alerta', 'Situação', 'Descrição', 'Data', 'Placa'], data.alerts.map((row) => [row.kind, row.label, statusLabels[row.status] || row.status, row.description, formatDate(row.created_at), row.placa]))
    section('Divergências fiscais', ['Competência', 'Posto', 'Valor operacional', 'Valor fiscal', 'Diferença', 'Situação'], data.financial_alerts.map((row) => [`${String(row.reference_month).padStart(2,'0')}/${row.reference_year}`, row.station_name, number(row.registered_amount), row.invoiced_amount, row.divergence_amount, row.station_check_status]))
    section('Fechamentos mensais', ['Competência', 'Posto', 'Situação', 'Registros', 'Litros', 'Valor operacional', 'Valor fiscal', 'Documentos pendentes'], data.closures.map((row) => [`${String(row.reference_month).padStart(2,'0')}/${row.reference_year}`, row.station_name, row.closure_status, row.registered_fueling_count, number(row.registered_liters), number(row.registered_amount), row.invoiced_amount, row.documents_pending_count]))
    section('Movimentações autorizadas', ['Placa', 'Responsável', 'Beneficiária', 'Finalidade', 'Início', 'Fim', 'Situação'], data.approved_movements.map((row) => [row.placa, row.responsible_unit_name, row.beneficiary_unit_name, row.purpose, formatDay(row.valid_from), formatDay(row.valid_until), row.status]))
    section('CNH vencidas ou a vencer', ['Motorista', 'Validade', 'Situação', 'Dias'], data.cnh_alerts.map((row) => [row.driver_name, formatDay(row.cnh_valid_until), row.alert_status, row.days_until_expiry]))
    section('Situação cadastral da frota', ['Situação', 'Veículos'], data.vehicle_status.map((row) => [statusLabels[row.status] || row.status, row.vehicle_count]))
    rows.push([], ['Observação', 'Fechamentos, documentos fiscais, CNH e movimentações seguem seus escopos funcionais; filtros de combustível/comprovante não se aplicam a todos esses conjuntos.'])
    const url = URL.createObjectURL(new Blob([escapeCsv(rows)], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `painel-frotas-${fromMonth}-${toMonth}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const exportExcel = async () => {
    if (!data) return
    try {
      const [{ default: ExcelJS }, crest] = await Promise.all([import('exceljs'), loadMunicipalCrestDataUrl()])
      const workbook = new ExcelJS.Workbook()
      workbook.creator = 'Prefeitura Municipal de Pitangueiras – PR'
      workbook.subject = 'Relatório gerencial oficial de abastecimentos e frota'
      workbook.title = `Painel de Frotas ${fromMonth} a ${toMonth}`
      workbook.created = new Date()
      const metadata: Array<[string, string]> = [
        ['Período', `${monthLabel(fromMonth)}${fromMonth !== toMonth ? ` a ${monthLabel(toMonth)}` : ''}`],
        ['Perfil / escopo', `${scopeRole} · ${scopeLabel || 'Municipal'}`],
        ['Filtros', selectedFilterLabels.join(' | ') || 'Sem filtros adicionais'],
        ['Gerado em', formatDate(data.updated_at)],
        ['Usuário responsável', userEmail || 'Usuário autenticado'],
        ['Fuso horário', MUNICIPAL_TIME_ZONE],
      ]
      const addSheet = (name: string, title: string, headers: string[], rows: unknown[][], widths?: number[]) => addMunicipalExcelWorksheet(workbook, crest, { name, title, metadata, headers, rows, widths })
      addSheet('Resumo', 'Painel gerencial de abastecimentos', ['Indicador', 'Valor'], [
        ['Abastecimentos válidos', number(data.summary.fueling_count)], ['Litros registrados', number(data.summary.liters)],
        ['Valor registrado (R$)', number(data.summary.registered_amount)], ['Valor conferido (R$)', number(data.summary.confirmed_amount)],
        ['Valor registrado hoje (R$)', number(data.summary.today_amount)], ['Valor registrado no mês atual (R$)', number(data.summary.current_month_amount)],
        ['Acumulado no exercício (R$)', number(data.summary.year_to_date_amount)], ['Acumulado no mesmo período do exercício anterior (R$)', number(data.summary.previous_year_to_date_amount)],
        ['Variação anual (%)', annualVariation == null ? 'Sem base anterior' : annualVariation / 100],
        ['Pendentes de conferência', number(data.summary.pending_confirmation_count)], ['Pendências documentais', number(data.summary.pending_document_count)],
        ['Inconsistências abertas', number(data.summary.open_inconsistency_count)], ['Fechamentos pendentes', number(data.summary.open_closure_count)],
        ['Metodologia', 'Litros são volume abastecido, não consumo efetivo. Valores fiscais aparecem separadamente; consumo efetivo não é estimado sem hodômetros e metodologia validados.'],
      ], [42, 80])
      addSheet('Evolução mensal', 'Evolução mensal', ['Mês de referência', 'Abastecimentos', 'Litros', 'Valor registrado (R$)'], data.monthly.map((row) => [monthLabel(row.month), row.fueling_count, number(row.liters), number(row.amount)]))
      const groups: [string, MetricRow[]][] = [['Secretarias responsáveis', data.by_responsible_unit], ['Secretarias beneficiárias', data.by_beneficiary_unit], ['Veículos', data.by_vehicle], ['Motoristas', data.by_driver], ['Postos', data.by_station], ['Combustíveis', data.by_fuel_type]]
      for (const [name, group] of groups) addSheet(name, name, ['Identificação', 'Descrição', 'Abastecimentos', 'Litros', 'Valor registrado (R$)', 'Preço médio ponderado (R$/L)'], group.map((row) => [row.label, row.description || row.acronym || '', row.fueling_count, number(row.liters), number(row.amount), row.weighted_price_per_liter ?? '']))
      addSheet('Alertas', 'Alertas e divergências', ['Tipo', 'Alerta', 'Situação', 'Descrição', 'Data / competência', 'Placa'], [
        ...data.alerts.map((row) => [row.kind, row.label, statusLabels[row.status] || row.status, row.description, formatDate(row.created_at), row.placa || '—']),
        ...data.financial_alerts.map((row) => ['Divergência fiscal', row.label, row.station_check_status, row.station_name, `${row.reference_month}/${row.reference_year}`, '—']),
      ])
      addSheet('Recentes', 'Abastecimentos recentes', ['Data e hora (America/Sao_Paulo)', 'Placa', 'Motorista', 'Posto', 'Combustível', 'Litros', 'Valor (R$)', 'Situação', 'Comprovante'], data.recent.map((row) => [formatDate(row.performed_at), row.placa || '—', row.driver_name || '—', row.station_name || '—', row.fuel_type_name || '—', number(row.liters), number(row.amount), statusLabels[row.status] || row.status, statusLabels[row.document_status || 'SEM_COMPROVANTE'] || 'Sem comprovante']))
      addSheet('Fechamentos', 'Fechamentos mensais e conciliação fiscal', ['Competência', 'Posto', 'Situação', 'Registros', 'Litros', 'Valor operacional (R$)', 'Valor fiscal (R$)', 'Diferença (R$)', 'Documentos pendentes'], data.closures.map((row) => [`${String(row.reference_month).padStart(2, '0')}/${row.reference_year}`, row.station_name, row.closure_status, row.registered_fueling_count, number(row.registered_liters), number(row.registered_amount), row.invoiced_amount, row.divergence_amount, row.documents_pending_count]))
      addSheet('Movimentações', 'Movimentações autorizadas', ['Placa', 'Responsável', 'Beneficiária', 'Finalidade', 'Início', 'Fim', 'Situação'], data.approved_movements.map((row) => [row.placa || '—', row.responsible_unit_name, row.beneficiary_unit_name, row.purpose, formatDay(row.valid_from), formatDay(row.valid_until), row.status]))
      addSheet('CNH', 'Alertas de validade de CNH', ['Motorista', 'Validade', 'Situação', 'Dias até vencimento'], data.cnh_alerts.map((row) => [row.driver_name, formatDay(row.cnh_valid_until), row.alert_status, row.days_until_expiry]))
      addSheet('Situação da frota', 'Situação cadastral da frota', ['Situação', 'Veículos'], data.vehicle_status.map((row) => [statusLabels[row.status] || row.status, row.vehicle_count]))
      addSheet('Metodologia', 'Metodologia e abrangência', ['Tema', 'Descrição'], [
        ['Totais', 'Totais integrais ao escopo autorizado; dimensões exibidas como Top 12, alertas limitados a 60 e recentes conforme o seletor.'],
        ['Consumo efetivo', 'Não calculado sem sequência confiável de hodômetros e metodologia de abastecimento validada.'],
        ['Fuso', `Datas operacionais e geração apresentadas em ${MUNICIPAL_TIME_ZONE}.`],
        ['Escopos', 'Filtros de abastecimento não se aplicam automaticamente a dados de fechamento, CNH ou movimentação.'],
      ])
      const buffer = await workbook.xlsx.writeBuffer()
      const url = URL.createObjectURL(new Blob([buffer as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `painel-frotas-${fromMonth}-${toMonth}.xlsx`; anchor.click(); URL.revokeObjectURL(url)
    } catch {
      setError('Não foi possível gerar o Excel oficial com brasão. Atualize a tela e tente novamente.')
    }
  }

  const exportPdf = async () => {
    if (!data) return
    try {
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const title = 'Painel gerencial de abastecimentos'
      const crest = await loadMunicipalCrestDataUrl()
      const contextLine = `Referência: ${monthLabel(fromMonth)}${fromMonth !== toMonth ? ` a ${monthLabel(toMonth)}` : ''} · Perfil: ${scopeRole} · Escopo: ${scopeLabel || 'Municipal'} · Fuso: ${MUNICIPAL_TIME_ZONE} · Gerado em: ${formatDate(data.updated_at)}`
      const drawHeader = () => drawMunicipalPdfHeader(doc, title, crest, contextLine)
      const table = (options: Parameters<typeof autoTable>[1]) => autoTable(doc, {
        margin: { top: REPORT_TABLE_START_Y, bottom: 16, left: 13, right: 13 },
        styles: { fontSize: 8, cellPadding: 2.6, textColor: [41, 71, 87], lineColor: [224, 234, 237], lineWidth: 0.15, overflow: 'linebreak' },
        headStyles: { fillColor: [11, 60, 89], textColor: [255, 255, 255], fontStyle: 'bold', lineColor: [213, 167, 74], lineWidth: 0.5 },
        alternateRowStyles: { fillColor: [245, 248, 250] },
        didDrawPage: drawHeader,
        ...options,
      })
      table({ startY: REPORT_TABLE_START_Y + 4, head: [['Parâmetro', 'Informação']], body: [
        ['Filtros aplicados', selectedFilterLabels.join(' · ') || 'Nenhum filtro adicional'],
        ['Escopo de dados', scopeLabel || 'Municipal; sujeito às permissões do perfil'],
        ['Nota metodológica', 'Totais integrais no escopo autorizado; rankings Top 12 e alertas limitados a 60 itens. Litros abastecidos não equivalem necessariamente a consumo efetivo.'],
      ], styles: { fontSize: 7, cellPadding: 2.2, textColor: [41, 71, 87], lineColor: [224, 234, 237], lineWidth: 0.15, overflow: 'linebreak' } })
      table({ startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 4 : 55, head: [['Abastecimentos', 'Litros registrados', 'Valor registrado', 'Valor conferido', 'Acumulado no exercício', 'Pend. conferência', 'Pend. comprovante']], body: [[integer(data.summary.fueling_count), liters(data.summary.liters), money(data.summary.registered_amount), money(data.summary.confirmed_amount), money(data.summary.year_to_date_amount), integer(data.summary.pending_confirmation_count), integer(data.summary.pending_document_count)]] })
      table({ startY: (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ? (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable!.finalY + 5 : 55, head: [['Hoje', 'Mês atual', 'Exercício atual', 'Mesmo período, exercício anterior', 'Variação anual']], body: [[money(data.summary.today_amount), money(data.summary.current_month_amount), money(data.summary.year_to_date_amount), money(data.summary.previous_year_to_date_amount), annualVariation == null ? 'Sem base' : `${annualVariation.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`]] })
      const section = (label: string, head: string[], body: unknown[][], fontSize = 8) => {
        doc.addPage()
        doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(11, 41, 64); doc.text(label, 13, 47)
        table({ startY: 52, head: [head], body: body as (string | number)[][], styles: { fontSize, cellPadding: 2.2, textColor: [41, 71, 87], lineColor: [224, 234, 237], lineWidth: 0.15, overflow: 'linebreak' } })
      }
      const pageGroups: [string, MetricRow[]][] = [['Secretaria responsável', data.by_responsible_unit], ['Secretaria beneficiária', data.by_beneficiary_unit], ['Veículos — maiores despesas', data.by_vehicle], ['Motoristas', data.by_driver], ['Postos credenciados', data.by_station], ['Combustíveis', data.by_fuel_type]]
      for (const [label, rows] of pageGroups) section(label, ['Identificação', 'Abastecimentos', 'Litros', 'Valor registrado', 'Preço médio ponderado/L'], rows.map((row) => [row.label, integer(row.fueling_count), liters(row.liters), money(row.amount), row.weighted_price_per_liter == null ? '—' : money(row.weighted_price_per_liter)]))
      section('Evolução mensal', ['Mês', 'Abastecimentos', 'Litros registrados', 'Valor registrado'], data.monthly.map((row) => [monthLabel(row.month), integer(row.fueling_count), liters(row.liters), money(row.amount)]))
      section('Alertas e divergências registradas', ['Tipo', 'Alerta', 'Situação', 'Descrição', 'Data'], [...data.alerts.map((row) => [row.kind, row.label, row.status, row.description, formatDate(row.created_at)]), ...data.financial_alerts.map((row) => ['Divergência fiscal', row.label, row.station_check_status, row.station_name, `${row.reference_month}/${row.reference_year}`])], 7)
      section(`Abastecimentos recentes · até ${recentLimit} registros`, ['Data/hora (America/Sao_Paulo)', 'Placa', 'Motorista', 'Posto', 'Combustível', 'Litros', 'Valor', 'Situação'], data.recent.map((row) => [formatDate(row.performed_at), row.placa || '—', row.driver_name || '—', row.station_name || '—', row.fuel_type_name || '—', liters(row.liters), money(row.amount), statusLabels[row.status] || row.status]), 7)
      section('Fechamentos mensais e conciliação fiscal', ['Competência', 'Posto', 'Situação', 'Registros', 'Valor operacional', 'Valor fiscal', 'Diferença', 'Docs. pendentes'], data.closures.map((row) => [`${String(row.reference_month).padStart(2, '0')}/${row.reference_year}`, row.station_name, row.closure_status, integer(row.registered_fueling_count), money(row.registered_amount), row.invoiced_amount == null ? 'Não informado' : money(row.invoiced_amount), row.divergence_amount == null ? '—' : money(row.divergence_amount), integer(row.documents_pending_count)]), 7)
      section('Movimentações autorizadas e alertas de CNH', ['Placa', 'Responsável', 'Beneficiária', 'Finalidade', 'Vigência'], data.approved_movements.map((row) => [row.placa || '—', row.responsible_unit_name || '—', row.beneficiary_unit_name || '—', row.purpose, `${formatDay(row.valid_from)} a ${formatDay(row.valid_until)}`]), 7)
      const movementBottom = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || 52
      table({ startY: movementBottom + 8, head: [['Motorista', 'Validade CNH', 'Situação', 'Dias']], body: data.cnh_alerts.map((row) => [row.driver_name, formatDay(row.cnh_valid_until), row.alert_status, row.days_until_expiry]), styles: { fontSize: 7, cellPadding: 2 } })
      addMunicipalPdfFooters(doc)
      doc.save(`painel-frotas-${fromMonth}-${toMonth}.pdf`)
    } catch {
      setError('Não foi possível gerar o PDF oficial com brasão. Atualize a tela e tente novamente.')
    }
  }

  const metricGroups: { key: string; label: string; rows: MetricRow[]; dimension: string; icon: typeof Store; help: string }[] = data ? [
    { key: 'responsible', label: 'Gasto por secretaria responsável', rows: data.by_responsible_unit, dimension: 'responsible_unit', icon: Users, help: 'Vínculo registrado no abastecimento; não representa, por si só, unidade beneficiária.' },
    { key: 'beneficiary', label: 'Gasto por secretaria beneficiária', rows: data.by_beneficiary_unit, dimension: 'beneficiary_unit', icon: Users, help: 'Beneficiária registrada no abastecimento; distinta da secretaria responsável.' },
    { key: 'vehicle', label: 'Veículos com maiores despesas', rows: data.by_vehicle, dimension: 'vehicle', icon: Truck, help: 'Ranking pelo valor registrado no período filtrado.' },
    { key: 'driver', label: 'Gasto por motorista', rows: data.by_driver, dimension: 'driver', icon: Users, help: 'Somente o nome necessário à identificação gerencial; sem CPF ou CNH.' },
    { key: 'station', label: 'Gasto por estabelecimento', rows: data.by_station, dimension: 'station', icon: Store, help: 'Consolidação pelo posto vinculado ao abastecimento.' },
    { key: 'fuel', label: 'Gasto por combustível', rows: data.by_fuel_type, dimension: 'fuel_type', icon: Fuel, help: 'Preço médio ponderado = valor total ÷ litros registrados; não representa consumo efetivo.' },
  ] : []

  const monthMax = Math.max(1, ...(data?.monthly || []).map((row) => number(row.amount)))
  const periodLabel = fromMonth === toMonth ? monthLabel(fromMonth) : `${monthLabel(fromMonth)} a ${monthLabel(toMonth)}`
  const scopeNotice = scopeRole === 'secretary'
    ? `Consulta restrita às unidades vinculadas${scopeLabel ? `: ${scopeLabel}` : ''}. O recorte também é validado no servidor.`
    : scopeRole === 'fiscal'
      ? 'Perfil Fiscal de Contrato: consulta e exportação de dados municipais; alterações administrativas permanecem bloqueadas.'
      : scopeRole === 'mayor'
        ? 'Perfil Prefeito: visão municipal consolidada em modo somente leitura.'
        : ''
  const previousYearAmount = number(data?.summary.previous_year_to_date_amount)
  const annualVariation = previousYearAmount > 0 ? (number(data?.summary.year_to_date_amount) - previousYearAmount) / previousYearAmount * 100 : null

  return <div className="fleet-overview-dashboard">
    <section className="fleet-hero fleet-overview-hero"><div><span className="fleet-hero-kicker">CONTROLE OPERACIONAL · PAINEL GERENCIAL</span><h2>{scopeRole === 'secretary' ? 'Indicadores da sua secretaria.' : 'Visão consolidada da frota municipal.'}</h2><p>Indicadores calculados no Supabase para o período e filtros selecionados. Os gráficos mostram valores registrados e conferidos separadamente.</p></div><div className="fleet-hero-mark"><Gauge size={38} /></div></section>
    {scopeNotice && <div className="fleet-overview-scope-note" role="status"><ShieldAlert size={16} />{scopeNotice}</div>}

    <section className="fleet-section fleet-overview-filters" aria-label="Filtros globais do painel">
      <div className="fleet-overview-filter-heading"><div><span className="fleet-kicker">CONSULTA GLOBAL</span><h2><Filter size={16} /> Filtros do painel</h2></div><div className="fleet-overview-filter-actions"><button type="button" className="fleet-secondary-button" onClick={clearFilters} disabled={loading}><X size={14} /> Limpar filtros</button><button type="button" className="fleet-secondary-button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? 'spin' : ''} /> Atualizar</button></div></div>
      <div className="fleet-overview-filter-grid">
        <label className="fleet-overview-period-preset"><span>Período de referência</span><select value={preset} onChange={(event) => { const next = event.target.value; setPreset(next); const range = periodRange(next, fromMonth, toMonth); setFromMonth(range.from); setToMonth(range.to) }}><option value="current">Mês atual</option><option value="previous">Mês anterior</option><option value="last3">Últimos 3 meses</option><option value="last6">Últimos 6 meses</option><option value="last12">Últimos 12 meses</option><option value="year">Ano atual (acumulado)</option><option value="previousYear">Ano anterior</option><option value="custom">Período personalizado</option></select></label>
        <label><span>Mês inicial</span><input type="month" value={fromMonth} onChange={(event) => { setFromMonth(event.target.value); setPreset('custom') }} /></label>
        <label><span>Mês final</span><input type="month" value={toMonth} onChange={(event) => { setToMonth(event.target.value); setPreset('custom') }} /></label>
        <label><span>Secretaria responsável</span><select value={filters.responsible} onChange={(event) => updateFilter('responsible', event.target.value)}><option value="">Todas</option>{(options?.units || []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label><span>Secretaria beneficiária</span><select value={filters.beneficiary} onChange={(event) => updateFilter('beneficiary', event.target.value)}><option value="">Todas</option>{(options?.units || []).map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}</select></label>
        <label><span>Veículo</span><select value={filters.vehicle} onChange={(event) => updateFilter('vehicle', event.target.value)}><option value="">Todos</option>{(options?.vehicles || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label><span>Motorista</span><select value={filters.driver} onChange={(event) => updateFilter('driver', event.target.value)}><option value="">Todos</option>{(options?.drivers || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label><span>Posto / estabelecimento</span><select value={filters.station} onChange={(event) => updateFilter('station', event.target.value)}><option value="">Todos</option>{(options?.stations || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label><span>Tipo de combustível</span><select value={filters.fuel} onChange={(event) => updateFilter('fuel', event.target.value)}><option value="">Todos</option>{(options?.fuel_types || []).map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
        <label><span>Situação do abastecimento</span><select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}><option value="">Todas as situações válidas</option>{Object.entries(statusLabels).filter(([key]) => !['CANCELADO','RASCUNHO','ACEITO','REJEITADO','ENVIADO','PENDENTE','SEM_COMPROVANTE'].includes(key)).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label><span>Situação do comprovante</span><select value={filters.document} onChange={(event) => updateFilter('document', event.target.value)}><option value="">Todas</option><option value="SEM_COMPROVANTE">Sem comprovante</option><option value="PENDENTE">Pendente</option><option value="ENVIADO">Enviado</option><option value="EM_ANALISE">Em análise</option><option value="ACEITO">Aceito</option><option value="REJEITADO">Rejeitado</option></select></label>
      </div>
      {invalidRange && <p className="fleet-overview-error" role="alert">{monthSpan > 120 ? 'O período máximo permitido é de 120 meses.' : 'Escolha meses válidos e confirme que o mês inicial não é posterior ao mês final.'}</p>}
      <div className="fleet-overview-filter-footer"><span><CalendarDays size={14} /> Referência consultada: <strong>{periodLabel}</strong> · Fuso horário: America/São_Paulo</span><div className="fleet-overview-export"><button type="button" className="fleet-secondary-button" onClick={exportCsv} disabled={!data || loading}><Download size={14} /> CSV</button><button type="button" className="fleet-secondary-button" onClick={exportExcel} disabled={!data || loading}><FileSpreadsheet size={14} /> Excel</button><button type="button" className="fleet-primary-button" onClick={exportPdf} disabled={!data || loading}><FileText size={14} /> PDF</button></div></div>
    </section>

    {error && <div className="fleet-inline-error" role="alert"><AlertTriangle size={15} /> {error}</div>}
    {loading && !data ? <div className="fleet-loading"><RefreshCw className="spin" size={18} /> Calculando indicadores no backend…</div> : data && <>
      <div className="fleet-overview-updated"><span>{loading ? <><RefreshCw className="spin" size={13} /> Atualizando indicadores…</> : <><Clock3 size={13} /> Dados consultados em {formatDate(data.updated_at)}</>}</span><span>Origem: registros do Supabase · sem limite amostral nos totais</span></div>
      <section className="fleet-section fleet-overview-metrics" aria-label="Indicadores do período">
        <div className="fleet-metric-grid fleet-overview-metric-grid">
          <Metric icon={CircleDollarSign} tone="green" label="Valor registrado no período" value={money(data.summary.registered_amount)} helper={periodLabel} onClick={() => void openDimension('all', null, 'Abastecimentos do período')} />
          <Metric icon={CheckCircle2} tone="blue" label="Valor conferido" value={money(data.summary.confirmed_amount)} helper={`${integer(data.summary.confirmed_count)} registros conferidos`} onClick={!readOnly ? () => onNavigate('fuelings') : undefined} />
          <Metric icon={CircleDollarSign} tone="amber" label="Valor registrado hoje" value={money(data.summary.today_amount)} helper={`${integer(data.summary.today_count)} abastecimentos · horário de Brasília`} />
          <Metric icon={CalendarDays} tone="green" label="Valor no mês atual" value={money(data.summary.current_month_amount)} helper={`${integer(data.summary.current_month_count)} abastecimentos · horário de Brasília`} />
          <Metric icon={CalendarDays} tone="violet" label="Acumulado no exercício" value={money(data.summary.year_to_date_amount)} helper={`${integer(data.summary.year_to_date_count)} registros no exercício de ${toMonth.slice(0,4)}`} onClick={() => void openDimension('all', null, `Abastecimentos do exercício ${toMonth.slice(0,4)}`, `${toMonth.slice(0,4)}-01`, toMonth)} />
          <Metric icon={Droplets} tone="blue" label="Litros registrados" value={liters(data.summary.liters)} helper="Volume abastecido; não é consumo efetivo" onClick={() => void openDimension('all', null, 'Abastecimentos do período')} />
          <Metric icon={Fuel} tone="amber" label="Abastecimentos no período" value={integer(data.summary.fueling_count)} helper={`${integer(data.summary.distinct_vehicles)} veículos · ${integer(data.summary.distinct_stations)} postos`} onClick={() => void openDimension('all', null, 'Abastecimentos do período')} />
          <Metric icon={Truck} tone="violet" label="Veículos ativos no cadastro" value={integer(data.summary.active_vehicle_count)} helper="Frota cadastrada como ativa" onClick={!readOnly ? () => onNavigate('vehicles') : undefined} />
          <Metric icon={Gauge} tone="green" label="Preço médio ponderado" value={data.summary.weighted_price_per_liter == null ? '—' : `${money(data.summary.weighted_price_per_liter)}/L`} helper="Valor registrado ÷ litros, conforme combustível filtrado" onClick={() => void openDimension('all', null, 'Abastecimentos usados no cálculo do preço médio')} />
          <Metric icon={CircleDollarSign} tone="amber" label="Valor médio por abastecimento" value={money(data.summary.average_per_fueling)} helper="Valor registrado ÷ número de abastecimentos" onClick={() => void openDimension('all', null, 'Abastecimentos usados no cálculo da média')} />
          <article className="fleet-metric fleet-overview-variation"><span className={`fleet-metric-icon ${number(data.summary.period_variation_percent) > 0 ? 'amber' : 'green'}`}>{number(data.summary.period_variation_percent) > 0 ? <ArrowUpRight size={19} /> : <ArrowDownRight size={19} />}</span><div><span>Comparação com período anterior</span><strong>{data.summary.period_variation_percent == null ? 'Sem base' : `${number(data.summary.period_variation_percent) > 0 ? '+' : ''}${number(data.summary.period_variation_percent).toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}</strong><small>{money(data.summary.previous_period_amount)} no período equivalente anterior · variação é informativa, não indica irregularidade</small></div></article>
          <article className="fleet-metric fleet-overview-variation"><span className={`fleet-metric-icon ${annualVariation != null && annualVariation > 0 ? 'amber' : 'green'}`}><CalendarDays size={19} /></span><div><span>Comparativo anual (mesmos meses)</span><strong>{annualVariation == null ? 'Sem base' : `${annualVariation > 0 ? '+' : ''}${annualVariation.toLocaleString('pt-BR',{maximumFractionDigits:1})}%`}</strong><small>{money(data.summary.year_to_date_amount)} em {toMonth.slice(0,4)} vs. {money(data.summary.previous_year_to_date_amount)} em {Number(toMonth.slice(0,4))-1}, acumulado até a mesma competência</small></div></article>
        </div>
      </section>

      <section className="fleet-overview-queue-grid">
        <article className="fleet-panel fleet-overview-alert-panel"><div className="fleet-overview-section-title"><div><span className="fleet-kicker">AÇÕES E SINAIS REGISTRADOS</span><h2><ShieldAlert size={17} /> Alertas e pendências</h2></div>{!readOnly && <button className="fleet-link-button" onClick={() => onNavigate('fuelings')}>Abrir abastecimentos <ChevronRight size={14} /></button>}</div>
          <div className="fleet-overview-alert-counts"><button disabled={readOnly} onClick={() => onNavigate('fuelings')}><strong>{integer(data.summary.pending_confirmation_count)}</strong><span>Aguardando conferência</span></button><button disabled={readOnly} onClick={() => onNavigate('fuelings')}><strong>{integer(data.summary.pending_document_count)}</strong><span>Comprovante não aceito</span></button><button onClick={() => document.getElementById('fleet-overview-alert-list')?.scrollIntoView({behavior:'smooth',block:'center'})}><strong>{integer(data.summary.open_inconsistency_count)}</strong><span>Inconsistências abertas</span></button><button disabled={scopeRole === 'fiscal' || scopeRole === 'secretary'} onClick={() => onNavigate('closure')}><strong>{integer(data.summary.open_closure_count)}</strong><span>Fechamentos não encerrados</span></button><button disabled={readOnly} onClick={() => onNavigate('drivers')}><strong>{integer(data.summary.cnh_expired_or_due_count)}</strong><span>CNH vencida / até 60 dias</span></button></div>
          {data.alerts.length ? <ul id="fleet-overview-alert-list" className="fleet-overview-alert-list">{data.alerts.map((alert) => <li key={`${alert.kind}-${alert.id}`}><span className={`fleet-overview-alert-mark ${alert.severity === 'CRITICO' || alert.severity === 'CRÍTICO' ? 'critical' : ''}`}><AlertTriangle size={15} /></span><div><strong>{alert.label}</strong><p>{alert.description}</p><small>{alert.kind === 'INCONSISTENCIA' ? 'Inconsistência' : 'Comprovante'} · {statusLabels[alert.status] || alert.status} · {formatDate(alert.created_at)}{alert.placa ? ` · ${alert.placa}` : ''}</small></div><button aria-label={`Ver alerta: ${alert.label}`} onClick={() => { setSelectedRecord(alert); setDetail(null) }}><ChevronRight size={16} /></button></li>)}</ul> : <div className="fleet-overview-empty-note"><CheckCircle2 size={16} /> Nenhuma inconsistência ou pendência documental nesta referência e combinação de filtros.</div>}
          {data.financial_alerts.length > 0 && <div className="fleet-overview-financial-alerts"><strong><CircleDollarSign size={14} /> Divergências fiscais registradas</strong>{data.financial_alerts.map((alert) => <button key={alert.closure_id + alert.station_id} disabled={scopeRole === 'fiscal' || scopeRole === 'secretary'} onClick={() => onNavigate('closure')}><span>{alert.station_name} · {String(alert.reference_month).padStart(2,'0')}/{alert.reference_year}</span><b>{money(alert.divergence_amount)}</b></button>)}<small>Baseada nos valores informados no fechamento mensal; filtros de veículo, motorista e secretaria não se aplicam a esse documento por posto/competência.</small></div>}
        </article>
        <article className="fleet-panel fleet-overview-recent-panel"><div className="fleet-overview-section-title"><div><span className="fleet-kicker">OPERAÇÃO</span><h2><Clock3 size={17} /> Abastecimentos recentes</h2></div><label className="fleet-overview-limit">Mostrar<select value={recentLimit} onChange={(event) => setRecentLimit(Number(event.target.value))}><option value={10}>10</option><option value={20}>20</option><option value={50}>50</option></select></label></div>
          {data.recent.length ? <div className="fleet-overview-recent-list">{data.recent.map((row) => <button key={row.id} className="fleet-overview-recent-row" onClick={() => { setSelectedRecord(row); setDetail(null) }}><span className="fleet-overview-recent-icon"><Fuel size={15} /></span><span className="fleet-overview-recent-main"><strong>{row.placa || 'Veículo não identificado'} · {row.fuel_type_name || 'Combustível não identificado'}</strong><small>{formatDate(row.performed_at)} · {row.station_name || 'Posto não identificado'}{row.driver_name ? ` · ${row.driver_name}` : ''}</small>{row.entered_later && <small className="fleet-overview-late-entry">Lançado depois da data efetiva: {formatDate(row.submitted_at)}</small>}</span><span className="fleet-overview-recent-total"><strong>{money(row.amount)}</strong><small>{liters(row.liters)}</small></span></button>)}</div> : <div className="fleet-overview-empty-note">Nenhum abastecimento válido nesta referência.</div>}
        </article>
      </section>

      <section className="fleet-section fleet-overview-chart-section"><div className="fleet-section-heading"><div><span className="fleet-kicker">TENDÊNCIA TEMPORAL</span><h2>Evolução mensal</h2></div><span className="fleet-period">Clique em um mês para abrir os registros correspondentes.</span></div><div className="fleet-panel fleet-overview-month-chart"><div className="fleet-overview-month-bars">{data.monthly.map((row) => { const height = Math.max(3, number(row.amount) / monthMax * 100); return <button key={row.month} className="fleet-overview-month-bar" title={`${monthLabel(row.month)} · ${money(row.amount)} · ${liters(row.liters)}`} onClick={() => void openDimension('all',null,`Abastecimentos de ${monthLabel(row.month)}`,row.month,row.month)}><span className="fleet-overview-bar-amount">{money(row.amount)}</span><span className="fleet-overview-bar-track"><i style={{ height: `${height}%` }} /></span><span className="fleet-overview-bar-label">{monthLabel(row.month).replace(/ de \d{4}$/,'')}</span><small>{integer(row.fueling_count)} reg.</small></button> })}</div><div className="fleet-overview-chart-legend"><span><i /> Valor registrado no mês</span><small>Registros cancelados, estornados por cancelamento e rascunhos não entram nos totais.</small></div></div></section>

      <section className="fleet-section fleet-overview-dimensions"><div className="fleet-section-heading"><div><span className="fleet-kicker">COMPOSIÇÃO DOS GASTOS</span><h2>Análises por dimensão</h2></div><span className="fleet-period">Top 12 por valor · clique em uma linha para detalhar</span></div><div className="fleet-overview-dimension-grid">{metricGroups.map((group) => <DimensionPanel key={group.key} group={group} onSelect={(row) => row.id && void openDimension(group.dimension,row.id,row.label)} />)}</div></section>

      <section className="fleet-section fleet-overview-closure-grid"><article className="fleet-panel"><div className="fleet-overview-section-title"><div><span className="fleet-kicker">DOCUMENTAÇÃO E CONCILIAÇÃO</span><h2><ClipboardCheck size={17} /> Fechamentos e valores fiscais</h2></div>{scopeRole !== 'fiscal' && scopeRole !== 'secretary' && <button className="fleet-link-button" onClick={() => onNavigate('closure')}>Abrir fechamento <ChevronRight size={14} /></button>}</div><p className="fleet-overview-helper">Resumo por competência e posto. O valor fiscal informado não é somado ao valor operacional, evitando dupla contagem.</p>{scopeRole === 'secretary' ? <div className="fleet-overview-empty-note">Fechamentos municipais não fazem parte do escopo do Gestor de Secretaria.</div> : data.closures.length ? <div className="fleet-overview-closure-list">{data.closures.map((row) => <div key={`${row.closure_id}-${row.station_id}`}><span><strong>{row.station_name}</strong><small>{String(row.reference_month).padStart(2,'0')}/{row.reference_year} · {row.closure_status}{row.station_check_status ? ` · ${row.station_check_status}` : ''}</small></span><span><b>Operacional {money(row.registered_amount)}</b><small>Fiscal {row.invoiced_amount == null ? 'não informado' : money(row.invoiced_amount)} · pend. doc. {integer(row.documents_pending_count)}</small>{row.divergence_amount != null && <em className={number(row.divergence_amount) === 0 ? 'ok' : 'warning'}>Diferença {money(row.divergence_amount)}</em>}</span></div>)}</div> : <div className="fleet-overview-empty-note">Não há fechamento cadastrado neste período de referência.</div>}</article>
        <article className="fleet-panel"><div className="fleet-overview-section-title"><div><span className="fleet-kicker">MOVIMENTAÇÃO AUTORIZADA</span><h2><Truck size={17} /> Cessões e autorizações</h2></div></div><p className="fleet-overview-helper">Autorizações aprovadas sobrepostas ao período; secretaria responsável e beneficiária são apresentadas separadamente.</p>{data.approved_movements.length ? <div className="fleet-overview-movement-list">{data.approved_movements.map((row) => <div key={row.id}><strong>{row.placa || 'Veículo'} · {row.responsible_unit_name || 'Responsável não informado'} → {row.beneficiary_unit_name || 'Beneficiária não informada'}</strong><small>{row.purpose} · {formatDay(row.valid_from)} a {formatDay(row.valid_until)}</small></div>)}</div> : <div className="fleet-overview-empty-note">Nenhuma autorização aprovada vigente no período.</div>}{data.vehicle_status.length > 0 && <div className="fleet-overview-vehicle-status"><strong>Situação cadastral da frota</strong>{data.vehicle_status.map((row) => <span key={row.status}>{statusLabels[row.status] || row.status}: <b>{integer(row.vehicle_count)}</b></span>)}</div>}</article></section>

      <section className="fleet-section fleet-overview-cnh"><div className="fleet-section-heading"><div><span className="fleet-kicker">REGULARIDADE DOS MOTORISTAS</span><h2>CNHs vencidas ou a vencer</h2></div>{!readOnly && <button className="fleet-link-button" onClick={() => onNavigate('drivers')}>Ver motoristas <ChevronRight size={14} /></button>}</div>{data.cnh_alerts.length ? <div className="fleet-overview-cnh-grid">{data.cnh_alerts.map((row) => <article key={row.id} className={row.alert_status === 'VENCIDA' ? 'expired' : 'soon'}><span><AlertTriangle size={15} /></span><div><strong>{row.driver_name}</strong><small>Validade {formatDay(row.cnh_valid_until)} · {row.alert_status === 'VENCIDA' ? `vencida há ${Math.abs(row.days_until_expiry)} dia(s)` : `vence em ${row.days_until_expiry} dia(s)`}</small></div>{!readOnly && <button onClick={() => onNavigate('drivers')}>Atualizar</button>}</article>)}</div> : <div className="fleet-overview-empty-note"><CheckCircle2 size={15} /> Nenhuma CNH ativa vencida ou com vencimento nos próximos 60 dias.</div>}</section>
    </>}

    {detail && <div className="fleet-overview-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null) }}><section className="fleet-overview-detail-modal" role="dialog" aria-modal="true" aria-labelledby="fleet-overview-detail-title"><header><div><span className="fleet-kicker">DETALHAMENTO CONTEXTUAL · {periodLabel}</span><h2 id="fleet-overview-detail-title">{detail.label}</h2><small>{integer(detailTotal)} registro(s) correspondem a este recorte filtrado.</small></div><button aria-label="Fechar detalhamento" onClick={() => setDetail(null)}><X size={18} /></button></header><div className="fleet-table-panel"><table className="fleet-table fleet-overview-detail-table"><thead><tr><th>Data efetiva</th><th>Veículo / motorista</th><th>Posto / combustível</th><th>Secretarias</th><th>Litros</th><th>Valor registrado</th><th>Situação / comprovante</th></tr></thead><tbody>{detailRows.map((row) => <tr key={row.id}><td>{formatDate(row.performed_at)}{row.submitted_at && row.submitted_at > row.performed_at && <small>Inclusão {formatDate(row.submitted_at)}</small>}<small>ID {row.id.slice(0,8)}</small></td><td><strong>{row.plate || '—'}</strong><small>{row.vehicle_description || 'Veículo'} · {row.driver_name || 'Motorista não informado'}</small></td><td>{row.station_name || '—'}<small>{row.fuel_type_name || 'Combustível não informado'}</small></td><td>{row.responsible_unit_name || '—'}<small>Beneficiária: {row.beneficiary_unit_name || 'não informada'}</small></td><td>{liters(row.liters)}</td><td><strong>{money(row.amount)}</strong></td><td><span className="fleet-status warning">{statusLabels[row.status] || row.status}</span><small>{statusLabels[row.document_status || 'SEM_COMPROVANTE'] || 'Comprovante pendente'}</small></td></tr>)}</tbody></table>{detailLoading && <div className="fleet-loading"><RefreshCw className="spin" size={16} /> Carregando registros…</div>}{!detailLoading && !detailRows.length && <div className="fleet-overview-empty-note">Nenhum registro encontrado para este recorte.</div>}</div><footer>{!readOnly && <button className="fleet-secondary-button" onClick={() => onNavigate('fuelings')}>Abrir fila completa de abastecimentos <ChevronRight size={14} /></button>}{detailRows.length < detailTotal && <button className="fleet-primary-button" onClick={() => void loadMoreDetail()} disabled={detailLoading}>Carregar mais 50</button>}<button className="fleet-secondary-button" onClick={() => setDetail(null)}>Fechar</button></footer></section></div>}

    {selectedRecord && <div className="fleet-overview-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedRecord(null) }}><section className="fleet-overview-record-modal" role="dialog" aria-modal="true" aria-labelledby="fleet-overview-record-title"><header><div><span className="fleet-kicker">REGISTRO DE ORIGEM</span><h2 id="fleet-overview-record-title">{'kind' in selectedRecord ? selectedRecord.label : `${selectedRecord.placa || 'Veículo'} · ${selectedRecord.fuel_type_name || 'Abastecimento'}`}</h2></div><button aria-label="Fechar registro" onClick={() => setSelectedRecord(null)}><X size={18} /></button></header>{'kind' in selectedRecord ? <div className="fleet-overview-record-body"><p>{selectedRecord.description}</p><dl><dt>Tipo</dt><dd>{selectedRecord.kind}</dd><dt>Situação</dt><dd>{statusLabels[selectedRecord.status] || selectedRecord.status}</dd><dt>Identificado em</dt><dd>{formatDate(selectedRecord.created_at)}</dd><dt>Veículo</dt><dd>{selectedRecord.placa || 'Não identificado'}</dd><dt>ID do abastecimento</dt><dd>{selectedRecord.fueling_id || 'Sem vínculo direto'}</dd>{selectedRecord.resolution_notes && <><dt>Tratativa</dt><dd>{selectedRecord.resolution_notes}</dd></>}</dl></div> : <div className="fleet-overview-record-body"><dl><dt>Data efetiva da operação</dt><dd>{formatDate(selectedRecord.performed_at)}</dd><dt>Data do lançamento</dt><dd>{formatDate(selectedRecord.submitted_at)}</dd><dt>Veículo</dt><dd>{selectedRecord.placa || 'Não identificado'}</dd><dt>Motorista</dt><dd>{selectedRecord.driver_name || 'Não informado'}</dd><dt>Posto</dt><dd>{selectedRecord.station_name || 'Não informado'}</dd><dt>Combustível</dt><dd>{selectedRecord.fuel_type_name || 'Não informado'}</dd><dt>Volume abastecido</dt><dd>{liters(selectedRecord.liters)}</dd><dt>Valor registrado</dt><dd>{money(selectedRecord.amount)}</dd><dt>Situação</dt><dd>{statusLabels[selectedRecord.status] || selectedRecord.status}</dd><dt>Comprovante</dt><dd>{statusLabels[selectedRecord.document_status || 'SEM_COMPROVANTE']}</dd></dl></div>}<footer>{!readOnly && <button className="fleet-primary-button" onClick={() => onNavigate('fuelings')}>Abrir fila de abastecimentos <ChevronRight size={14} /></button>}<button className="fleet-secondary-button" onClick={() => setSelectedRecord(null)}>Fechar</button></footer></section></div>}
  </div>
}

function Metric({ icon: Icon, tone, label, value, helper, onClick }: { icon: typeof Fuel; tone: string; label: string; value: string; helper: string; onClick?: () => void }) {
  const content = <><span className={`fleet-metric-icon ${tone}`}><Icon size={19} /></span><div><span>{label}</span><strong>{value}</strong><small>{helper}</small></div></>
  return onClick ? <button type="button" className="fleet-metric fleet-overview-metric-button" onClick={onClick}>{content}</button> : <article className="fleet-metric">{content}</article>
}

function DimensionPanel({ group, onSelect }: { group: { label: string; rows: MetricRow[]; icon: typeof Store; help: string }; onSelect: (row: MetricRow) => void }) {
  const max = Math.max(1, ...group.rows.map((row) => number(row.amount)))
  const Icon = group.icon
  return <article className="fleet-panel fleet-overview-dimension-panel"><header><span className="fleet-overview-dimension-icon"><Icon size={16} /></span><div><h3>{group.label}</h3><small>{group.help}</small></div></header>{group.rows.length ? <div className="fleet-overview-dimension-rows">{group.rows.map((row) => <button key={`${row.id || 'sem-id'}-${row.label}`} onClick={() => onSelect(row)} disabled={!row.id}><span className="fleet-overview-dimension-label"><strong>{row.label}</strong>{row.description && <small>{row.description}</small>}{row.weighted_price_per_liter != null && <small>Preço médio ponderado: {money(row.weighted_price_per_liter)}/L</small>}<i><b style={{ width: `${Math.max(2, number(row.amount) / max * 100)}%` }} /></i></span><span className="fleet-overview-dimension-value"><strong>{money(row.amount)}</strong><small>{integer(row.fueling_count)} · {liters(row.liters)}</small></span></button>)}</div> : <div className="fleet-overview-empty-note">Sem dados para a dimensão no período selecionado.</div>}</article>
}
