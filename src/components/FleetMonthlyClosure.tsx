import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle, BadgeCheck, CalendarCheck, CheckCircle2, CircleAlert, Clock3, Eye, FileCheck2,
  FileText, History, MessageSquareText, RefreshCw, Search, ShieldCheck, Store, X,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import './FleetMonthlyClosure.css'

type Closure = {
  id: string
  reference_year: number
  reference_month: number
  status: string
  started_at: string | null
  checked_at: string | null
  closed_at: string | null
  reopened_at?: string | null
  reopening_reason?: string | null
  notes?: string | null
}
type MunicipalSummaryData = {
  closure: { reference_year: number; reference_month: number; status: string; started_at: string | null; checked_at: string | null; closed_at: string | null; reopened_at: string | null } | null
  summary: { station_count: number; stations_requested: number; stations_reviewed: number; stations_pending: number; fueling_count: number; liters: number; registered_amount: number; invoice_amount: number | null; difference_amount: number | null; documents_pending: number; unresolved_discrepancies: number }
}
type StationCheck = {
  id: string
  closure_id: string
  station_id: string
  registered_fueling_count: number
  registered_liters: number
  registered_amount: number
  invoiced_amount: number | null
  divergence_amount: number | null
  documents_pending_count: number
  status: string
  closure_status: string
  requested_at: string | null
  requested_by: number | null
  no_activity_reported: boolean
  no_activity_confirmed: boolean
  checked_by: number | null
  checked_at: string | null
  review_notes: string | null
  notes: string | null
  stations?: Station | null
}
type Station = { id: string; nome_fantasia_snapshot: string | null; razao_social_snapshot: string; status: string }
type FiscalDocument = {
  id: string; closure_id: string; station_check_id: string; station_id: string; document_type: string
  document_number: string | null; document_series: string | null; access_key: string | null
  issue_date: string | null; issuer_document: string | null; document_amount: number
  file_name: string; storage_path: string; mime_type: string; file_size_bytes: number
  document_status: string; uploaded_by: number; uploaded_at: string; reviewed_by: number | null
  reviewed_at: string | null; rejection_reason: string | null; replaced_document_id: string | null
  is_current: boolean; notes: string | null
}
type FuelingProof = { id: string; file_name: string; storage_path: string; mime_type: string; document_status: string; uploaded_at: string; is_current: boolean; rejection_reason: string | null }
type Fueling = {
  id: string; status: string; performed_at: string; submitted_at: string; liters: number; unit_price: number
  total_amount: number; odometer_km: number; station_receipt_number: string | null; station_id: string
  vehicle_id: string; fuel_type_id: string; notes: string | null; inconsistency_notes: string | null
  registered_officially_by: number | null; registered_officially_at: string | null
  vehicles?: { placa?: string; marca?: string | null; modelo?: string | null } | null
  fuel_type?: { nome?: string; sigla?: string | null } | null
  documents?: FuelingProof[] | null
}
type Discrepancy = {
  id: string; closure_id: string; station_check_id: string; station_id: string; fueling_id: string | null
  discrepancy_type: string; severity: string; description: string; amount_involved: number | null
  status: string; is_system_generated: boolean; identified_at: string; response_deadline: string | null
  resolved_at: string | null; resolution_notes: string | null
}
type ClosureMessage = { id: string; station_check_id: string; station_id: string; discrepancy_id: string | null; sender_scope: string; message_type: string; message: string; created_at: string }
type ClosureHistory = { id: string; station_check_id: string | null; station_id: string | null; entity_table: string; action_type: string; previous_status: string | null; new_status: string | null; reason: string | null; performed_at: string; metadata: Record<string, unknown> }
type ClosureVersion = { id: string; station_check_id: string; station_id: string; version_number: number; total_transactions: number; total_liters: number; total_amount: number; invoice_amount: number | null; difference_amount: number | null; created_at: string; reason: string | null; snapshot_data: Record<string, unknown> }
type Dialog =
  | { kind: 'start'; check: StationCheck }
  | { kind: 'confirm-station'; check: StationCheck }
  | { kind: 'close' }
  | { kind: 'reopen' }
  | { kind: 'discrepancy'; check: StationCheck }
  | { kind: 'message'; check: StationCheck; discrepancyId?: string; fuelingId?: string }
  | { kind: 'resolve'; discrepancy: Discrepancy }
  | { kind: 'review-document'; document: FiscalDocument; target: 'ACEITO' | 'REJEITADO' }

const closureStatus: Record<string, { label: string; tone: string }> = {
  ABERTO: { label: 'Aberto', tone: 'open' },
  EM_CONFERENCIA: { label: 'Em conferência', tone: 'review' },
  COM_DIVERGENCIA: { label: 'Com divergência', tone: 'danger' },
  CONFERIDO: { label: 'Conferido', tone: 'success' },
  FECHADO: { label: 'Fechado', tone: 'closed' },
  REABERTO: { label: 'Reaberto', tone: 'warning' },
}
const documentStatus: Record<string, { label: string; tone: string }> = {
  PENDENTE: { label: 'Pendente', tone: 'warning' }, ENVIADO: { label: 'Enviado', tone: 'review' },
  EM_ANALISE: { label: 'Em análise', tone: 'review' }, ACEITO: { label: 'Aceito', tone: 'success' },
  REJEITADO: { label: 'Rejeitado', tone: 'danger' }, SUBSTITUIDO: { label: 'Substituído', tone: 'neutral' },
}
const money = (value: number | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
const number = (value: number | null | undefined, maximumFractionDigits = 2) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits })
const dateTime = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
const stateLabel = (value: string) => closureStatus[value]?.label || value.replaceAll('_', ' ')
const fileLabel = (value: string) => documentStatus[value]?.label || value.replaceAll('_', ' ')
const startPeriod = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7)
const periodParts = (period: string) => {
  const [year, month] = period.split('-').map(Number)
  const start = new Date(`${period}-01T00:00:00-03:00`)
  const end = new Date(month === 12 ? `${year + 1}-01-01T00:00:00-03:00` : `${year}-${String(month + 1).padStart(2, '0')}-01T00:00:00-03:00`)
  return { year, month, start: start.toISOString(), end: end.toISOString() }
}
const periodName = (period: string) => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }).format(new Date(`${period}-01T12:00:00-03:00`))
const currentProof = (fueling: Fueling) => [...(fueling.documents || [])].filter((doc) => doc.is_current).sort((a, b) => Date.parse(b.uploaded_at) - Date.parse(a.uploaded_at))[0]
const getError = (error: unknown) => error instanceof Error ? error.message : String(error)

export function FleetMonthlyClosure() {
  const [period, setPeriod] = useState(startPeriod)
  const [closure, setClosure] = useState<Closure | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [accessVerified, setAccessVerified] = useState(false)
  const [municipalSummary, setMunicipalSummary] = useState<MunicipalSummaryData | null>(null)
  const [checks, setChecks] = useState<StationCheck[]>([])
  const [stations, setStations] = useState<Station[]>([])
  const [fiscalDocuments, setFiscalDocuments] = useState<FiscalDocument[]>([])
  const [fuelings, setFuelings] = useState<Fueling[]>([])
  const [fuelingCount, setFuelingCount] = useState(0)
  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([])
  const [messages, setMessages] = useState<ClosureMessage[]>([])
  const [history, setHistory] = useState<ClosureHistory[]>([])
  const [versions, setVersions] = useState<ClosureVersion[]>([])
  const [selectedStation, setSelectedStation] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [closureFilter, setClosureFilter] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(!!supabase)
  const [loadingMore, setLoadingMore] = useState(false)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState(supabase ? '' : 'O serviço de dados está indisponível.')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [preview, setPreview] = useState<{ title: string; url: string; mimeType: string } | null>(null)
  const [selectedFueling, setSelectedFueling] = useState<Fueling | null>(null)

  const loadFuelingPage = useCallback(async (from: number, append: boolean) => {
    if (!supabase) return
    const bounds = periodParts(period)
    const result = await supabase.from('fleet_fuelings').select(
      'id,status,performed_at,submitted_at,liters,unit_price,total_amount,odometer_km,station_receipt_number,station_id,vehicle_id,fuel_type_id,notes,inconsistency_notes,registered_officially_by,registered_officially_at,vehicles:fleet_vehicles(placa,marca,modelo),fuel_type:fleet_fuel_types(nome,sigla),documents:fleet_fueling_documents(id,file_name,storage_path,mime_type,document_status,uploaded_at,is_current,rejection_reason)',
      { count: 'exact' },
    ).gte('performed_at', bounds.start).lt('performed_at', bounds.end).order('performed_at', { ascending: false }).order('id', { ascending: true }).range(from, from + 499)
    if (result.error) throw result.error
    const page = (result.data || []) as unknown as Fueling[]
    setFuelings((current) => append ? [...current, ...page] : page)
    setFuelingCount(result.count ?? page.length)
    setOffset(from + page.length)
    setHasMore(from + page.length < (result.count ?? page.length))
  }, [period])

  const load = useCallback(async () => {
    if (!supabase) return
    try {
      const managerAccess = await supabase.rpc('fleet_is_closure_manager')
      if (managerAccess.error) throw managerAccess.error
      if (managerAccess.data !== true) {
        setReadOnly(true)
        const periodValues = periodParts(period)
        const summaryResult = await supabase.rpc('fleet_monthly_closure_municipal_summary', { p_reference_year: periodValues.year, p_reference_month: periodValues.month })
        if (summaryResult.error) throw summaryResult.error
        setMunicipalSummary(summaryResult.data as MunicipalSummaryData)
        setChecks([]); setStations([]); setFiscalDocuments([]); setDiscrepancies([]); setMessages([]); setHistory([]); setVersions([]); setFuelings([]); setFuelingCount(0); setClosure(null)
        setAccessVerified(true)
        return
      }
      setReadOnly(false); setAccessVerified(true)
      const bounds = periodParts(period)
      let closureQuery = await supabase.from('fleet_monthly_closures')
        .select('id,reference_year,reference_month,status,started_at,checked_at,closed_at,reopened_at,reopening_reason,notes')
        .eq('reference_year', bounds.year).eq('reference_month', bounds.month).maybeSingle()
      if (closureQuery.error) throw closureQuery.error
      let currentClosure = closureQuery.data as Closure | null
      if (currentClosure && !['CONFERIDO', 'FECHADO'].includes(currentClosure.status)) {
        const refreshed = await supabase.rpc('fleet_refresh_monthly_closure', { p_closure_id: currentClosure.id })
        if (refreshed.error) throw refreshed.error
        closureQuery = await supabase.from('fleet_monthly_closures')
          .select('id,reference_year,reference_month,status,started_at,checked_at,closed_at,reopened_at,reopening_reason,notes')
          .eq('id', currentClosure.id).maybeSingle()
        if (closureQuery.error) throw closureQuery.error
        currentClosure = closureQuery.data as Closure | null
      }
      setClosure(currentClosure)
      if (!currentClosure) {
        setChecks([]); setStations([]); setFiscalDocuments([]); setDiscrepancies([]); setMessages([]); setHistory([]); setVersions([])
        await loadFuelingPage(0, false)
      } else {
        const [checksResult, documentsResult, discrepancyResult, messagesResult, historyResult, versionsResult] = await Promise.all([
          supabase.from('fleet_monthly_closure_station_checks').select('id,closure_id,station_id,registered_fueling_count,registered_liters,registered_amount,invoiced_amount,divergence_amount,documents_pending_count,status,closure_status,requested_at,requested_by,no_activity_reported,no_activity_confirmed,checked_by,checked_at,review_notes,notes').eq('closure_id', currentClosure.id).order('station_id').limit(250),
          supabase.from('fleet_monthly_closure_documents').select('id,closure_id,station_check_id,station_id,document_type,document_number,document_series,access_key,issue_date,issuer_document,document_amount,file_name,storage_path,mime_type,file_size_bytes,document_status,uploaded_by,uploaded_at,reviewed_by,reviewed_at,rejection_reason,replaced_document_id,is_current,notes').eq('closure_id', currentClosure.id).order('uploaded_at', { ascending: false }).limit(1000),
          supabase.from('fleet_monthly_closure_discrepancies').select('id,closure_id,station_check_id,station_id,fueling_id,discrepancy_type,severity,description,amount_involved,status,is_system_generated,identified_at,response_deadline,resolved_at,resolution_notes').eq('closure_id', currentClosure.id).order('identified_at', { ascending: false }).limit(500),
          supabase.from('fleet_monthly_closure_messages').select('id,station_check_id,station_id,discrepancy_id,sender_scope,message_type,message,created_at').eq('closure_id', currentClosure.id).order('created_at', { ascending: false }).limit(500),
          supabase.from('fleet_monthly_closure_history').select('id,station_check_id,station_id,entity_table,action_type,previous_status,new_status,reason,performed_at,metadata').eq('closure_id', currentClosure.id).order('performed_at', { ascending: false }).limit(250),
          supabase.from('fleet_monthly_closure_versions').select('id,station_check_id,station_id,version_number,total_transactions,total_liters,total_amount,invoice_amount,difference_amount,created_at,reason,snapshot_data').eq('closure_id', currentClosure.id).order('created_at', { ascending: false }).limit(250),
        ])
        const queryError = checksResult.error || documentsResult.error || discrepancyResult.error || messagesResult.error || historyResult.error || versionsResult.error
        if (queryError) throw queryError
        const checkRows = (checksResult.data || []) as unknown as StationCheck[]
        setChecks(checkRows)
        const stationIds = [...new Set(checkRows.map((item) => item.station_id))]
        if (stationIds.length) {
          const stationResult = await supabase.from('fleet_fuel_stations').select('id,nome_fantasia_snapshot,razao_social_snapshot,status').in('id', stationIds).limit(250)
          if (stationResult.error) throw stationResult.error
          const stationRows = (stationResult.data || []) as Station[]
          setStations(stationRows)
          const nameById = new Map(stationRows.map((item) => [item.id, item]))
          setChecks(checkRows.map((item) => ({ ...item, stations: nameById.get(item.station_id) || null })))
        } else setStations([])
        setFiscalDocuments((documentsResult.data || []) as FiscalDocument[])
        setDiscrepancies((discrepancyResult.data || []) as Discrepancy[])
        setMessages((messagesResult.data || []) as ClosureMessage[])
        setHistory((historyResult.data || []) as ClosureHistory[])
        setVersions((versionsResult.data || []) as ClosureVersion[])
        await loadFuelingPage(0, false)
      }
    } catch (cause) {
      setError(`Não foi possível carregar a competência ou este perfil não possui consulta gerencial. ${getError(cause)}`)
    } finally { setLoading(false) }
  }, [period, loadFuelingPage])
  const handleRefresh = () => {
    if (!supabase) { setLoading(false); setError('O serviço de dados está indisponível.'); return }
    setLoading(true); setError(''); setAccessVerified(false); setMunicipalSummary(null); setNotice('')
    void load()
  }
  const handlePeriodChange = (nextPeriod: string) => {
    if (nextPeriod === period) { handleRefresh(); return }
    setPeriod(nextPeriod); setLoading(!!supabase); setError(supabase ? '' : 'O serviço de dados está indisponível.')
    setAccessVerified(false); setMunicipalSummary(null); setNotice('')
  }
  useEffect(() => { void load() }, [load])

  const selectedFuelingCheck = selectedFueling ? checks.find((item) => item.station_id === selectedFueling.station_id) : undefined
  const visibleChecks = checks.filter((item) => !closureFilter || item.closure_status === closureFilter)
  const totalFuelings = checks.reduce((sum, item) => sum + Number(item.registered_fueling_count || 0), 0)
  const totalLiters = checks.reduce((sum, item) => sum + Number(item.registered_liters || 0), 0)
  const totalRegistered = checks.reduce((sum, item) => sum + Number(item.registered_amount || 0), 0)
  const totalFiscal = checks.reduce((sum, item) => sum + Number(item.invoiced_amount || 0), 0)
  const totalDifference = checks.reduce((sum, item) => sum + Number(item.divergence_amount || 0), 0)
  const unresolvedCount = discrepancies.filter((item) => item.status !== 'RESOLVIDA').length
  const pendingStations = checks.filter((item) => !['CONFERIDO', 'FECHADO'].includes(item.closure_status)).length
  const currentStationFuelings = useMemo(() => {
    const stationId = selectedStation
    const q = search.trim().toLocaleLowerCase('pt-BR')
    return fuelings.filter((item) => (!stationId || item.station_id === stationId) && (!statusFilter || item.status === statusFilter) && (!q || [item.vehicles?.placa,item.vehicles?.marca,item.vehicles?.modelo,item.fuel_type?.nome,item.station_receipt_number,item.notes].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(q)))
  }, [fuelings, selectedStation, statusFilter, search])
  const statuses = ['RASCUNHO','ENVIADO_PELO_POSTO','PENDENTE_DE_COMPROVANTE','PENDENTE_DE_CONFERENCIA','EM_ANALISE','COM_INCONSISTENCIA','SOLICITADA_CORRECAO','CORRIGIDO','CONFERIDO','INCLUIDO_NO_FECHAMENTO','CANCELADO']

  if (!accessVerified) return <section className="fleet-section fleet-page-section fleet-closure-v2-readonly"><div className="fleet-page-heading"><div><span className="fleet-kicker">FECHAMENTO MENSAL</span><h2>Consulta gerencial</h2><p>Verificando o perfil e o escopo de acesso municipal…</p></div><input type="month" aria-label="Competência" value={period} onChange={(event)=>handlePeriodChange(event.target.value)}/></div>{error&&<div className="fleet-inline-error" role="alert"><CircleAlert size={15}/>{error}</div>}{loading?<div className="fleet-loading"><RefreshCw className="spin" size={18}/> Validando as permissões…</div>:<button className="fleet-secondary-button" type="button" onClick={handleRefresh}>Tentar novamente</button>}</section>
  if (readOnly) return <MunicipalReadOnlyClosure period={period} setPeriod={handlePeriodChange} data={municipalSummary} loading={loading} error={error} onRefresh={handleRefresh} />

  async function runRpc(name: string, args: Record<string, unknown>, success: string) {
    if (!supabase) return
    setWorking(true); setError(''); setNotice('')
    try {
      const result = await supabase.rpc(name, args)
      if (result.error) throw result.error
      setDialog(null); setNotice(success); await load()
    } catch (cause) { setError(`A operação não foi concluída. ${getError(cause)}`) }
    finally { setWorking(false) }
  }
  async function prepareMonth() {
    const bounds = periodParts(period)
    await runRpc('fleet_prepare_monthly_closure', { p_reference_year: bounds.year, p_reference_month: bounds.month, p_notes: 'Competência preparada para conferência v2.0.' }, 'Competência preparada. Os totais por posto foram calculados pelo servidor.')
  }
  async function loadMoreFuelings() {
    if (!supabase || loadingMore || !hasMore) return
    setLoadingMore(true)
    try { await loadFuelingPage(offset, true) }
    catch (cause) { setError(`Não foi possível carregar mais abastecimentos. ${getError(cause)}`) }
    finally { setLoadingMore(false) }
  }

  async function openFiscalDocument(document: FiscalDocument) {
    if (!supabase) return
    const result = await supabase.storage.from('fleet-documents').createSignedUrl(document.storage_path, 300)
    if (result.error || !result.data?.signedUrl) { setError('Não foi possível abrir o documento fiscal; confirme as permissões do arquivo privado.'); return }
    setPreview({ title: document.file_name, url: result.data.signedUrl, mimeType: document.mime_type })
  }
  async function reviewFueling(fueling: Fueling) {
    if (!supabase) return
    const document = currentProof(fueling)
    if (!document?.storage_path || document.document_status === 'REJEITADO' || document.document_status === 'SUBSTITUIDO') {
      setError('O comprovante individual atual está ausente ou rejeitado. Solicite a complementação ao posto.'); return
    }
    if (fueling.status === 'COM_INCONSISTENCIA') { setError(fueling.inconsistency_notes || 'Resolva a inconsistência antes de conferir este abastecimento.'); return }
    setWorking(true); setError(''); setNotice('')
    try {
      const result = await supabase.rpc('fleet_review_monthly_closure_fueling', {
        p_fueling_id: fueling.id, p_document_id: document.id,
        p_notes: 'Comprovante individual aceito na conferência do fechamento mensal.',
      })
      if (result.error) throw result.error
      setSelectedFueling(null); setNotice('Comprovante aceito e abastecimento conferido com registro de auditoria no Supabase.')
      await load()
    } catch (cause) { setError(`Não foi possível conferir o abastecimento. ${getError(cause)}`) }
    finally { setWorking(false) }
  }

  async function submitDialog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!dialog || !supabase) return
    const values = new FormData(event.currentTarget)
    const text = String(values.get('reason') || values.get('message') || '').trim()
    setWorking(true); setError(''); setNotice('')
    try {
      if (dialog.kind === 'start') {
        const response = await supabase.rpc('fleet_start_monthly_closure_station_review', { p_closure_id: dialog.check.closure_id, p_station_id: dialog.check.station_id, p_reason: text || null })
        if (response.error) throw response.error
        setNotice(`Conferência iniciada para ${stationName(dialog.check.station_id)}.`)
      } else if (dialog.kind === 'confirm-station') {
        const noActivity = dialog.check.registered_fueling_count === 0
        const response = await supabase.rpc('fleet_confirm_monthly_closure_station', { p_closure_id: dialog.check.closure_id, p_station_id: dialog.check.station_id, p_notes: text || null, p_confirm_no_activity: noActivity })
        if (response.error) throw response.error
        setNotice(noActivity ? 'Ausência de movimentação confirmada para o posto.' : `Conferência concluída para ${stationName(dialog.check.station_id)}.`)
      } else if (dialog.kind === 'close') {
        const response = await supabase.rpc('fleet_close_month', { p_closure_id: closure?.id })
        if (response.error) throw response.error
        setNotice('Competência fechada após a validação municipal de todos os postos.')
      } else if (dialog.kind === 'reopen') {
        const response = await supabase.rpc('fleet_reopen_monthly_closure', { p_closure_id: closure?.id, p_reason: text })
        if (response.error) throw response.error
        setNotice('Competência reaberta. A composição anterior foi preservada em versão e histórico.')
      } else if (dialog.kind === 'discrepancy') {
        const amountText = String(values.get('amount') || '').trim()
        const response = await supabase.rpc('fleet_record_monthly_closure_discrepancy', {
          p_closure_id: dialog.check.closure_id, p_station_id: dialog.check.station_id, p_fueling_id: null,
          p_discrepancy_type: String(values.get('type') || 'DIVERGENCIA_ADMINISTRATIVA'),
          p_severity: String(values.get('severity') || 'BLOQUEIO'), p_description: text,
          p_amount_involved: amountText ? Number(amountText) : null, p_response_deadline: null,
        })
        if (response.error) throw response.error
        setNotice('Divergência oficial registrada na trilha do fechamento.')
      } else if (dialog.kind === 'message') {
        let discrepancyId = dialog.discrepancyId
        if (dialog.fuelingId) {
          const linked = await supabase.rpc('fleet_record_monthly_closure_discrepancy', {
            p_closure_id: dialog.check.closure_id, p_station_id: dialog.check.station_id, p_fueling_id: dialog.fuelingId,
            p_discrepancy_type: 'ESCLARECIMENTO_ABASTECIMENTO', p_severity: 'BLOQUEIO',
            p_description: text, p_amount_involved: null, p_response_deadline: null,
          })
          if (linked.error) throw linked.error
          discrepancyId = String(linked.data)
        }
        const response = await supabase.rpc('fleet_send_monthly_closure_message', {
          p_closure_id: dialog.check.closure_id, p_station_id: dialog.check.station_id,
          p_discrepancy_id: discrepancyId || null, p_message_type: discrepancyId ? 'SOLICITACAO_ESCLARECIMENTO' : 'OBSERVACAO', p_message: text,
        })
        if (response.error) throw response.error
        setNotice('Solicitação registrada no histórico e disponibilizada ao posto.')
      } else if (dialog.kind === 'resolve') {
        const response = await supabase.rpc('fleet_resolve_monthly_closure_discrepancy', {
          p_discrepancy_id: dialog.discrepancy.id, p_resolution_status: String(values.get('decision') || 'RESOLVIDA'), p_resolution_notes: text,
        })
        if (response.error) throw response.error
        setNotice('Decisão da divergência registrada com justificativa.')
      } else if (dialog.kind === 'review-document') {
        const response = await supabase.rpc('fleet_review_monthly_closure_document', {
          p_document_id: dialog.document.id, p_document_status: dialog.target,
          p_rejection_reason: dialog.target === 'REJEITADO' ? text : null,
        })
        if (response.error) throw response.error
        setNotice(dialog.target === 'ACEITO' ? 'Documento fiscal validado.' : 'Documento fiscal rejeitado; o motivo ficou registrado para o posto.')
      }
      setDialog(null)
      await load()
    } catch (cause) { setError(`A operação não foi concluída. ${getError(cause)}`) }
    finally { setWorking(false) }
  }
  function stationName(id: string) {
    const station = stations.find((item) => item.id === id)
    return station?.nome_fantasia_snapshot || station?.razao_social_snapshot || 'Estabelecimento'
  }
  const docsFor = (check: StationCheck) => fiscalDocuments.filter((doc) => doc.station_check_id === check.id)
  const discrepanciesFor = (check: StationCheck) => discrepancies.filter((item) => item.station_check_id === check.id)
  const messagesFor = (check: StationCheck) => messages.filter((item) => item.station_check_id === check.id)
  const versionsFor = (check: StationCheck) => versions.filter((item) => item.station_check_id === check.id)
  const historyFor = (check: StationCheck) => history.filter((item) => item.station_check_id === check.id || (item.station_id === check.station_id && !item.station_check_id))
  const canStartReview = (check: StationCheck) => ['ABERTO', 'REABERTO'].includes(check.closure_status)
  const canConfirm = (check: StationCheck) => check.closure_status === 'EM_CONFERENCIA'

  return <section className="fleet-section fleet-page-section fleet-closure-v2">
    <div className="fleet-page-heading fleet-closure-v2-heading">
      <div><span className="fleet-kicker">CONFERÊNCIA ADMINISTRATIVA · V2.0</span><h2>Fechamento mensal por posto</h2><p>Concilie abastecimentos, notas fiscais e divergências por estabelecimento. O fechamento não realiza liquidação nem pagamento.</p></div>
      <div className="fleet-closure-v2-period"><CalendarCheck size={16} /><input aria-label="Competência do fechamento" type="month" value={period} onChange={(event) => handlePeriodChange(event.target.value)} /><button type="button" className="fleet-secondary-button" onClick={handleRefresh} disabled={loading || working}><RefreshCw size={14} /> Atualizar</button></div>
    </div>
    {error && <div className="fleet-inline-error" role="alert"><CircleAlert size={15} />{error}</div>}
    {notice && <div className="fleet-inline-success" role="status"><CheckCircle2 size={15} />{notice}</div>}

    <div className="fleet-closure-v2-banner">
      <div><span className="fleet-kicker">COMPETÊNCIA MUNICIPAL</span><strong>{periodName(period)}</strong><p>{closure ? `Situação consolidada: ${stateLabel(closure.status)} · ${checks.length} posto(s) no período.` : 'A competência ainda não foi preparada; os abastecimentos existentes continuam preservados.'}</p></div>
      <div className="fleet-closure-v2-banner-actions">
        {!closure && <button type="button" className="fleet-primary-button" onClick={() => void prepareMonth()} disabled={working || loading}><CalendarCheck size={15} /> Preparar competência</button>}
        {closure?.status === 'CONFERIDO' && <button type="button" className="fleet-primary-button" onClick={() => setDialog({ kind: 'close' })} disabled={working || pendingStations>0 || unresolvedCount>0}><CheckCircle2 size={15} /> Fechar mês</button>}
        {closure && ['CONFERIDO', 'FECHADO'].includes(closure.status) && <button type="button" className="fleet-secondary-button fleet-closure-v2-reopen" onClick={() => setDialog({ kind: 'reopen' })} disabled={working}><RefreshCw size={14} /> Reabrir com justificativa</button>}
        {closure?.status === 'FECHADO' && <span className="fleet-closure-v2-status closed"><BadgeCheck size={14} /> Fechado {dateTime(closure.closed_at)}</span>}
      </div>
    </div>

    <div className="fleet-metric-grid fleet-closure-v2-metrics">
      <article className="fleet-metric"><span className="fleet-metric-icon blue"><Store size={18} /></span><div><span>Postos na competência</span><strong>{checks.length.toLocaleString('pt-BR')}</strong><small>{pendingStations} aguardando conferência/fechamento</small></div></article>
      <article className="fleet-metric"><span className="fleet-metric-icon green"><FileCheck2 size={18} /></span><div><span>Abastecimentos válidos</span><strong>{totalFuelings.toLocaleString('pt-BR')}</strong><small>{number(totalLiters,3)} L · {periodName(period)}</small></div></article>
      <article className="fleet-metric"><span className="fleet-metric-icon violet"><FileText size={18} /></span><div><span>Valor registrado</span><strong>{money(totalRegistered)}</strong><small>Somado no servidor · cancelados excluídos</small></div></article>
      <article className="fleet-metric"><span className="fleet-metric-icon amber"><AlertTriangle size={18} /></span><div><span>Valor fiscal / diferença</span><strong>{money(totalFiscal)}</strong><small className={Math.abs(totalDifference)>0.009 ? 'fleet-closure-v2-difference' : ''}>Diferença líquida: {money(totalDifference)} · {unresolvedCount} divergência(s) aberta(s)</small></div></article>
    </div>

    {closure && <section className="fleet-closure-v2-section">
      <header className="fleet-closure-v2-section-heading"><div><span className="fleet-kicker">CONCILIAÇÃO INDIVIDUAL</span><h3>Postos e notas fiscais da competência</h3><p>Valores consolidados no banco por data efetiva do abastecimento. Divergência não recebe tolerância automática.</p></div><label>Filtrar situação<select value={closureFilter} onChange={(event) => setClosureFilter(event.target.value)}><option value="">Todas as situações</option>{Object.keys(closureStatus).map((item) => <option key={item} value={item}>{stateLabel(item)}</option>)}</select></label></header>
      {loading ? <div className="fleet-loading"><RefreshCw className="spin" size={18} /> Carregando fechamentos por posto…</div> : checks.length ? <div className="fleet-closure-v2-station-list">{visibleChecks.map((check) => {
        const stationDocs = docsFor(check)
        const stationDiscrepancies = discrepanciesFor(check)
        const stationMessages = messagesFor(check)
        const stationVersions = versionsFor(check)
        const stationHistory = historyFor(check)
        const checkStatus = closureStatus[check.closure_status] || { label: check.closure_status, tone: 'neutral' }
        return <article className={`fleet-closure-v2-station ${selectedStation===check.station_id?'selected':''}`} key={check.id}>
          <header className="fleet-closure-v2-station-head">
            <div className="fleet-closure-v2-station-title"><span className="fleet-closure-v2-station-icon"><Store size={17} /></span><div><h4>{stationName(check.station_id)}</h4><small>{check.registered_fueling_count===0?'Sem abastecimentos registrados':`${Number(check.registered_fueling_count).toLocaleString('pt-BR')} abastecimento(s)`}{check.requested_at?` · solicitado pelo posto ${dateTime(check.requested_at)}`:' · aguardando solicitação do posto'}</small></div></div>
            <span className={`fleet-closure-v2-status ${checkStatus.tone}`}>{checkStatus.label}</span>
          </header>
          <div className="fleet-closure-v2-totals">
            <div><span>Registrado</span><strong>{money(check.registered_amount)}</strong><small>{number(check.registered_liters,3)} L</small></div>
            <div><span>Documento fiscal</span><strong>{check.invoiced_amount==null?'Não informado':money(check.invoiced_amount)}</strong><small>{stationDocs.filter((doc)=>doc.is_current&&doc.document_type==='NOTA_FISCAL').length} nota(s) atual(is)</small></div>
            <div><span>Diferença</span><strong className={check.divergence_amount!=null&&Math.abs(Number(check.divergence_amount))>0.009?'fleet-closure-v2-difference':''}>{check.divergence_amount==null?'—':money(check.divergence_amount)}</strong><small>{check.documents_pending_count} pendência(s) documental(is)/operacional(is)</small></div>
          </div>
          {check.review_notes && <p className="fleet-closure-v2-note"><strong>Observação administrativa:</strong> {check.review_notes}</p>}

          <details className="fleet-closure-v2-details" onToggle={(event)=>{if((event.currentTarget as HTMLDetailsElement).open)setSelectedStation(check.station_id)}}>
            <summary><FileText size={14} /> Documentos fiscais, divergências e tratativas <span>{stationDocs.length} doc · {stationDiscrepancies.filter((d)=>d.status!=='RESOLVIDA').length} pendência(s) · {stationMessages.length} mensagem(ns)</span></summary>
            <div className="fleet-closure-v2-detail-body">
              <div className="fleet-closure-v2-docs">
                <h5><FileCheck2 size={15} /> Documentos fiscais ({stationDocs.length})</h5>
                {stationDocs.length ? stationDocs.map((doc) => {
                  const state = documentStatus[doc.document_status] || { label: doc.document_status, tone: 'neutral' }
                  return <div className="fleet-closure-v2-document" key={doc.id}>
                    <div className="fleet-closure-v2-document-icon"><FileText size={16} /></div><div className="fleet-closure-v2-document-main"><strong>{doc.document_type.replaceAll('_',' ')}{doc.document_number?` · Nº ${doc.document_number}`:''}{doc.document_series?` · série ${doc.document_series}`:''}</strong><small>{doc.issue_date?`Emitida ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'UTC'}).format(new Date(`${doc.issue_date}T12:00:00Z`))} · `:''}{money(doc.document_amount)}{doc.issuer_document?` · CNPJ ${doc.issuer_document}`:''}</small><small>{doc.file_name} · enviada {dateTime(doc.uploaded_at)}{doc.reviewed_at?` · revisada ${dateTime(doc.reviewed_at)}`:''}{!doc.is_current?' · versão substituída':''}</small>{doc.rejection_reason&&<small className="fleet-closure-v2-danger-text">Motivo da rejeição: {doc.rejection_reason}</small>}</div>
                    <span className={`fleet-closure-v2-status ${state.tone}`}>{state.label}</span>
                    <div className="fleet-closure-v2-document-actions"><button type="button" className="fleet-secondary-button" onClick={()=>void openFiscalDocument(doc)}><Eye size={13}/> Ver</button>{doc.is_current&&doc.document_status!=='ACEITO'&&doc.document_status!=='SUBSTITUIDO'&&doc.document_status!=='REJEITADO'&&<><button type="button" className="fleet-secondary-button" onClick={()=>setDialog({kind:'review-document',document:doc,target:'REJEITADO'})} disabled={['CONFERIDO','FECHADO'].includes(check.closure_status)}>Rejeitar</button><button type="button" className="fleet-primary-button" onClick={()=>setDialog({kind:'review-document',document:doc,target:'ACEITO'})} disabled={['CONFERIDO','FECHADO'].includes(check.closure_status)}>Aceitar</button></>}</div>
                  </div>
                }) : <p className="fleet-closure-v2-empty">O posto ainda não anexou nota fiscal ou demonstrativo mensal.</p>}
              </div>

              <div className="fleet-closure-v2-discrepancies">
                <div className="fleet-closure-v2-subheading"><h5><AlertTriangle size={15}/> Divergências</h5><button type="button" className="fleet-secondary-button" onClick={()=>setDialog({kind:'discrepancy',check})} disabled={['CONFERIDO','FECHADO'].includes(check.closure_status)}><CircleAlert size={13}/> Registrar divergência</button></div>
                {stationDiscrepancies.length ? stationDiscrepancies.map((item)=><article className="fleet-closure-v2-discrepancy" key={item.id}><div><strong>{item.discrepancy_type.replaceAll('_',' ')} · {item.severity}</strong><span className={`fleet-closure-v2-status ${item.status==='RESOLVIDA'?'success':'danger'}`}>{item.status.replaceAll('_',' ')}</span></div><p>{item.description}</p><small>{item.amount_involved!=null?`Valor envolvido ${money(item.amount_involved)} · `:''}registrada {dateTime(item.identified_at)}{item.response_deadline?` · prazo ${dateTime(item.response_deadline)}`:''}{item.is_system_generated?' · alerta automático de conciliação':''}</small>{item.resolution_notes&&<small>Decisão: {item.resolution_notes}</small>}{item.status!=='RESOLVIDA'&&<div className="fleet-closure-v2-inline-actions"><button type="button" className="fleet-secondary-button" onClick={()=>setDialog({kind:'message',check,discrepancyId:item.id})}><MessageSquareText size={13}/> Solicitar esclarecimento</button><button type="button" className="fleet-primary-button" onClick={()=>setDialog({kind:'resolve',discrepancy:item})}>Registrar decisão</button></div>}</article>) : <p className="fleet-closure-v2-empty">Nenhuma divergência oficial registrada para o posto.</p>}
              </div>

              <div className="fleet-closure-v2-message-list"><h5><MessageSquareText size={15}/> Mensagens e respostas</h5>{stationMessages.length?stationMessages.slice(0,12).map((message)=><article key={message.id}><span className={message.sender_scope==='MUNICIPAL'?'municipal':'station'}>{message.sender_scope==='MUNICIPAL'?'Prefeitura':'Posto'} · {message.message_type.replaceAll('_',' ')}</span><p>{message.message}</p><small>{dateTime(message.created_at)}</small></article>):<p className="fleet-closure-v2-empty">Ainda não há solicitações ou respostas registradas.</p>}<button type="button" className="fleet-secondary-button" onClick={()=>setDialog({kind:'message',check})} disabled={['CONFERIDO','FECHADO'].includes(check.closure_status)}><MessageSquareText size={13}/> Enviar mensagem ao posto</button></div>

              <div className="fleet-closure-v2-history"><h5><History size={15}/> Histórico e versões ({stationHistory.length} evento(s) · {stationVersions.length} versão(ões))</h5><div className="fleet-closure-v2-version-list">{stationVersions.slice(0,4).map((version)=><details key={version.id}><summary>Versão {version.version_number} · {dateTime(version.created_at)} · {money(version.total_amount)} {version.difference_amount!=null?`· diferença ${money(version.difference_amount)}`:''}</summary><p>{version.reason||'Snapshot da composição e documentos.'} · {version.total_transactions} abastecimento(s) · {number(version.total_liters,3)} L</p><pre>{JSON.stringify(version.snapshot_data,null,2)}</pre></details>)}</div>{stationHistory.slice(0,8).map((event)=><div className="fleet-closure-v2-history-event" key={event.id}><span>{event.action_type==='INSERT'?'Registro criado':event.action_type==='UPDATE'?'Registro atualizado':event.action_type.replaceAll('_',' ')}</span><small>{event.entity_table.replace('fleet_monthly_closure_','').replaceAll('_',' ')} · {event.new_status?`${event.previous_status||'—'} → ${event.new_status}`:''} · {dateTime(event.performed_at)}</small>{event.reason&&<p>{event.reason}</p>}</div>)}</div>
            </div>
          </details>
          <footer className="fleet-closure-v2-station-actions">
            {canStartReview(check)&&<button type="button" className="fleet-secondary-button" onClick={()=>setDialog({kind:'start',check})} disabled={working}><Clock3 size={14}/> Iniciar conferência</button>}
            {canConfirm(check)&&<button type="button" className="fleet-primary-button" onClick={()=>setDialog({kind:'confirm-station',check})} disabled={working}><CheckCircle2 size={14}/>{check.registered_fueling_count===0?'Confirmar sem movimentação':'Conferir posto'}</button>}
            {check.closure_status==='CONFERIDO'&&<span className="fleet-closure-v2-status success"><BadgeCheck size={13}/> Posto conferido</span>}
            {check.closure_status==='FECHADO'&&<span className="fleet-closure-v2-status closed"><ShieldCheck size={13}/> Posto fechado</span>}
          </footer>
        </article>
      })}</div> : <div className="fleet-empty"><span><Store size={24}/></span><strong>Nenhum posto vinculado à competência</strong><p>Atualize a tela ou confira os estabelecimentos ativos do município.</p></div>}
    </section>}

    <section className="fleet-closure-v2-section">
      <header className="fleet-closure-v2-section-heading"><div><span className="fleet-kicker">DATA EFETIVA · PERÍODO {periodName(period).toLocaleUpperCase('pt-BR')}</span><h3>Abastecimentos da competência</h3><p>Consulta paginada; a decisão de conferência e os totais são recalculados no backend.</p></div><label>Posto<select value={selectedStation} onChange={(event)=>setSelectedStation(event.target.value)}><option value="">Todos os postos</option>{checks.map((check)=><option key={check.station_id} value={check.station_id}>{stationName(check.station_id)}</option>)}</select></label></header>
      <div className="fleet-closure-v2-fuel-filters"><label><Search size={14}/><input type="search" value={search} onChange={(event)=>setSearch(event.target.value)} placeholder="Buscar placa, recibo ou combustível"/></label><label>Situação<select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}><option value="">Todas</option>{statuses.map((status)=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></label><span>{currentStationFuelings.length} exibido(s) · {fuelingCount} no período · primeira página de até 500</span></div>
      <div className="fleet-table-panel">{loading?<div className="fleet-loading"><RefreshCw className="spin" size={18}/> Carregando abastecimentos…</div>:currentStationFuelings.length?<table className="fleet-table fleet-closure-v2-table"><thead><tr><th>Data efetiva</th><th>Posto</th><th>Veículo / combustível</th><th>Volume</th><th>Valor</th><th>Comprovante individual</th><th>Situação</th><th></th></tr></thead><tbody>{currentStationFuelings.map((fueling)=>{const proof=currentProof(fueling);const fuelingCheck=checks.find((item)=>item.station_id===fueling.station_id);const canReviewFueling=Boolean(fuelingCheck&&['EM_CONFERENCIA','COM_DIVERGENCIA'].includes(fuelingCheck.closure_status));return <tr key={fueling.id}><td><strong>{dateTime(fueling.performed_at)}</strong><small>Lançado {dateTime(fueling.submitted_at)}</small></td><td>{stationName(fueling.station_id)}</td><td><strong>{fueling.vehicles?.placa||'—'}</strong><small>{fueling.fuel_type?.nome||'Combustível'}{fueling.fuel_type?.sigla?` (${fueling.fuel_type.sigla})`:''}</small></td><td>{number(fueling.liters,3)} L</td><td>{money(fueling.total_amount)}</td><td>{proof?<><button type="button" className="fleet-link-button" onClick={()=>void openFuelingProof(proof)}><Eye size={13}/> Ver comprovante</button><small>{proof.file_name} · {fileLabel(proof.document_status)}</small></>:<span className="fleet-closure-v2-status danger">Ausente</span>}</td><td><span className={`fleet-closure-v2-status ${fueling.status==='CONFERIDO'?'success':fueling.status==='CANCELADO'?'neutral':'warning'}`}>{fueling.status.replaceAll('_',' ')}</span></td><td>{fueling.status==='CANCELADO'?<span className="fleet-closure-v2-status neutral">Excluído do total</span>:<button type="button" className="fleet-secondary-button" onClick={()=>setSelectedFueling(fueling)} disabled={working} title={!canReviewFueling?'Inicie a conferência do posto para habilitar a decisão oficial.':undefined}><Eye size={13}/> Revisar</button>}</td></tr>})}</tbody></table>:<div className="fleet-empty"><span><FileCheck2 size={23}/></span><strong>Nenhum abastecimento corresponde aos filtros</strong><p>Cancelados permanecem no histórico, mas não integram o valor líquido.</p></div>}
      {hasMore&&!loading&&<div className="fleet-closure-v2-load-more"><span>Exibindo {fuelings.length.toLocaleString('pt-BR')} de {fuelingCount.toLocaleString('pt-BR')} registros da competência.</span><button type="button" className="fleet-secondary-button" onClick={()=>void loadMoreFuelings()} disabled={loadingMore}>{loadingMore?'Carregando…':'Carregar mais 500'}<RefreshCw size={13}/></button></div>}</div>
    </section>

    {preview&&<div className="fleet-proof-preview-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setPreview(null)}}><section className="fleet-proof-preview" role="dialog" aria-modal="true" aria-labelledby="fleet-monthly-preview-title"><header><div><span className="fleet-kicker">DOCUMENTO PRIVADO · LINK TEMPORÁRIO</span><h2 id="fleet-monthly-preview-title">{preview.title}</h2></div><button type="button" className="fleet-close" onClick={()=>setPreview(null)} aria-label="Fechar"><X size={18}/></button></header><div className="fleet-proof-preview-body">{preview.mimeType.startsWith('image/')?<img src={preview.url} alt={preview.title}/>:<iframe title={`Visualização de ${preview.title}`} src={preview.url}/>}</div><footer><span>URL assinada temporária · expira em 5 minutos.</span></footer></section></div>}
    {selectedFueling&&<div className="fleet-confirm-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!working)setSelectedFueling(null)}}><section className="fleet-confirm-dialog fleet-closure-v2-review-dialog" role="dialog" aria-modal="true" aria-labelledby="fleet-fueling-review-title"><header className="fleet-confirm-heading"><span className="fleet-confirm-emblem"><FileCheck2 size={18}/></span><div><span className="fleet-kicker">CONFERÊNCIA INDIVIDUAL</span><h2 id="fleet-fueling-review-title">Revisar abastecimento</h2></div><button type="button" className="fleet-close" onClick={()=>setSelectedFueling(null)} aria-label="Fechar"><X size={18}/></button></header><div className="fleet-closure-v2-review-data"><div><span>Data efetiva</span><strong>{dateTime(selectedFueling.performed_at)}</strong></div><div><span>Data de lançamento</span><strong>{dateTime(selectedFueling.submitted_at)}</strong></div><div><span>Posto</span><strong>{stationName(selectedFueling.station_id)}</strong></div><div><span>Veículo</span><strong>{selectedFueling.vehicles?.placa||'—'} · {[selectedFueling.vehicles?.marca,selectedFueling.vehicles?.modelo].filter(Boolean).join(' ')}</strong></div><div><span>Combustível</span><strong>{selectedFueling.fuel_type?.nome||'—'}</strong></div><div><span>Recibo</span><strong>{selectedFueling.station_receipt_number||'Não informado'}</strong></div><div><span>Litros / preço</span><strong>{number(selectedFueling.liters,3)} L · {money(selectedFueling.unit_price)}/L</strong></div><div><span>Valor calculado</span><strong>{money(selectedFueling.total_amount)}</strong></div><div><span>Hodômetro</span><strong>{number(selectedFueling.odometer_km)} km</strong></div></div>{selectedFueling.notes&&<p className="fleet-closure-v2-note"><strong>Observação:</strong> {selectedFueling.notes}</p>}{selectedFueling.inconsistency_notes&&<div className="fleet-inline-error"><CircleAlert size={14}/>{selectedFueling.inconsistency_notes}</div>}{currentProof(selectedFueling)&&<div className="fleet-closure-v2-proof-line"><span>{currentProof(selectedFueling)?.file_name} · {fileLabel(currentProof(selectedFueling)?.document_status||'')}</span><button type="button" className="fleet-secondary-button" onClick={()=>{const proof=currentProof(selectedFueling);if(proof)void openFuelingProof(proof)}}><Eye size={13}/> Visualizar</button></div>}<footer className="fleet-confirm-actions"><button type="button" className="fleet-secondary-button" onClick={()=>setSelectedFueling(null)} disabled={working}>Voltar</button>{!currentProof(selectedFueling)?.storage_path&&selectedFuelingCheck&&<button type="button" className="fleet-secondary-button" onClick={()=>{setDialog({kind:'message',check:selectedFuelingCheck,fuelingId:selectedFueling.id});setSelectedFueling(null)}} disabled={working}><MessageSquareText size={13}/> Solicitar esclarecimento</button>}{currentProof(selectedFueling)?.storage_path&&selectedFuelingCheck&&['EM_CONFERENCIA','COM_DIVERGENCIA'].includes(selectedFuelingCheck.closure_status)&&selectedFueling.status!=='COM_INCONSISTENCIA'&&selectedFueling.status!=='CONFERIDO'&&<button type="button" className="fleet-primary-button" onClick={()=>void reviewFueling(selectedFueling)} disabled={working}><CheckCircle2 size={14}/>{working?'Salvando…':'Aceitar e conferir'}</button>}</footer></section></div>}
    {dialog&&<div className="fleet-confirm-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget&&!working)setDialog(null)}}><section className="fleet-confirm-dialog fleet-closure-v2-dialog" role="dialog" aria-modal="true" aria-labelledby="fleet-monthly-action-title"><header className="fleet-confirm-heading"><span className="fleet-confirm-emblem"><ShieldCheck size={18}/></span><div><span className="fleet-kicker">AÇÃO AUDITADA · {periodName(period).toLocaleUpperCase('pt-BR')}</span><h2 id="fleet-monthly-action-title">{dialogTitle(dialog)}</h2></div><button type="button" className="fleet-close" onClick={()=>setDialog(null)} aria-label="Fechar" disabled={working}><X size={18}/></button></header><form onSubmit={(event)=>void submitDialog(event)}><p className="fleet-confirm-message">{dialogMessage(dialog,stationName)}</p>
      {dialog.kind==='start'&&<label className="fleet-closure-v2-dialog-field">Observação/justificativa da abertura<textarea name="reason" rows={3} required={!dialog.check.requested_at&&dialog.check.registered_fueling_count>0} minLength={!dialog.check.requested_at&&dialog.check.registered_fueling_count>0?5:undefined} placeholder="Obrigatória se a Prefeitura iniciar sem solicitação do posto."/></label>}
      {dialog.kind==='confirm-station'&&<><label className="fleet-closure-v2-dialog-field">Observação da conferência<textarea name="reason" rows={3} placeholder="Registre ressalvas ou fundamento da decisão."/></label>{dialog.check.registered_fueling_count===0&&<p className="fleet-inline-success"><CheckCircle2 size={14}/>Ao confirmar, ficará registrada a declaração administrativa de sem movimentação.</p>}</>}
      {dialog.kind==='close'&&<label className="fleet-closure-v2-confirm-check"><input type="checkbox" name="ack" required/>Confirmo que todos os postos foram conferidos e que o fechamento não substitui a liquidação nem autoriza pagamento.</label>}
      {dialog.kind==='reopen'&&<label className="fleet-closure-v2-dialog-field">Justificativa obrigatória<textarea name="reason" rows={4} required minLength={10} placeholder="Explique a necessidade, o escopo e o que será revisto (mínimo 10 caracteres)."/></label>}
      {dialog.kind==='discrepancy'&&<><label className="fleet-closure-v2-dialog-field">Tipo<select name="type"><option value="DIVERGENCIA_ADMINISTRATIVA">Divergência administrativa</option><option value="DOCUMENTO_FISCAL">Documento fiscal</option><option value="VALOR_FISCAL">Valor fiscal</option><option value="COMPROVANTE_INDIVIDUAL">Comprovante individual</option><option value="DADOS_DO_ABASTECIMENTO">Dados do abastecimento</option><option value="OUTRA">Outra</option></select></label><label className="fleet-closure-v2-dialog-field">Gravidade<select name="severity"><option value="BLOQUEIO">Bloqueio</option><option value="ATENCAO">Atenção</option><option value="INFORMATIVO">Informativo</option></select></label><label className="fleet-closure-v2-dialog-field">Valor envolvido (opcional)<input name="amount" type="number" min="0" step="0.01"/></label><label className="fleet-closure-v2-dialog-field">Descrição<textarea name="reason" rows={4} required minLength={5} placeholder="Descreva a inconsistência e a providência esperada."/></label></>}
      {dialog.kind==='message'&&<label className="fleet-closure-v2-dialog-field">Solicitação/mensagem ao posto<textarea name="message" rows={4} required minLength={3} maxLength={5000} placeholder="Informe o esclarecimento ou complemento solicitado."/></label>}
      {dialog.kind==='resolve'&&<><label className="fleet-closure-v2-dialog-field">Decisão<select name="decision"><option value="RESOLVIDA">Divergência resolvida</option><option value="MANTIDA">Divergência mantida (continua bloqueando)</option></select></label><label className="fleet-closure-v2-dialog-field">Justificativa da decisão<textarea name="reason" rows={4} required minLength={5} placeholder="Registre a análise e o fundamento da decisão."/></label></>}
      {dialog.kind==='review-document'&&dialog.target==='REJEITADO'&&<label className="fleet-closure-v2-dialog-field">Motivo da rejeição<textarea name="reason" rows={4} required minLength={5} placeholder="Explique o que o posto precisa corrigir."/></label>}
      {dialog.kind==='review-document'&&dialog.target==='ACEITO'&&<p className="fleet-closure-v2-confirm-check">Confirma que os metadados e o arquivo fiscal estão legíveis e correspondem à competência? A decisão será registrada com usuário e horário.</p>}
      <footer className="fleet-confirm-actions"><button type="button" className="fleet-secondary-button" onClick={()=>setDialog(null)} disabled={working}>Cancelar</button><button type="submit" className="fleet-primary-button" disabled={working}>{working?'Salvando…':dialogSubmitLabel(dialog)}</button></footer>
    </form></section></div>}
  </section>

  async function openFuelingProof(proof: FuelingProof) {
    if (!supabase) return
    const result = await supabase.storage.from('fleet-documents').createSignedUrl(proof.storage_path,300)
    if (result.error||!result.data?.signedUrl) { setError('Não foi possível abrir o comprovante individual.'); return }
    setPreview({title:proof.file_name,url:result.data.signedUrl,mimeType:proof.mime_type})
  }
}

function dialogTitle(dialog: Dialog) {
  switch(dialog.kind){case 'start':return 'Iniciar conferência do posto';case 'confirm-station':return dialog.check.registered_fueling_count===0?'Confirmar sem movimentação':'Conferir posto';case 'close':return 'Fechar competência mensal';case 'reopen':return 'Reabrir competência';case 'discrepancy':return 'Registrar divergência oficial';case 'message':return 'Solicitar esclarecimento ao posto';case 'resolve':return 'Decidir divergência';case 'review-document':return dialog.target==='ACEITO'?'Aceitar documento fiscal':'Rejeitar documento fiscal'}
}
function dialogMessage(dialog: Dialog, stationName: (id:string)=>string) {
  switch(dialog.kind){case 'start':return `A conferência de ${stationName(dialog.check.station_id)} ficará em análise municipal; o estado e o ator serão auditados.`;case 'confirm-station':return dialog.check.registered_fueling_count===0?'A confirmação registrará que o posto não teve movimentação, sem inventar nota fiscal ou valor.':'O backend validará individualmente abastecimentos, comprovantes, nota(s) fiscal(is), diferença e divergências antes de confirmar.';case 'close':return 'O fechamento final só será permitido se todos os postos estiverem conferidos e sem divergências/documentos pendentes.';case 'reopen':return 'A reabertura preserva a composição anterior em uma versão e exige justificativa administrativa.';case 'discrepancy':return `A divergência ficará vinculada ao posto ${stationName(dialog.check.station_id)} e impedirá o fechamento até decisão.`;case 'message':return 'A mensagem será preservada no histórico e ficará visível somente à Prefeitura e ao próprio estabelecimento.';case 'resolve':return `Decida a divergência “${dialog.discrepancy.discrepancy_type.replaceAll('_',' ')}”. Uma divergência mantida continua bloqueando o fechamento.`;case 'review-document':return `${dialog.document.file_name} · ${money(dialog.document.document_amount)}. A decisão será validada pelo servidor e auditada.`}
}
function dialogSubmitLabel(dialog: Dialog) {
  switch(dialog.kind){case 'start':return 'Iniciar conferência';case 'confirm-station':return 'Confirmar conferência';case 'close':return 'Fechar mês';case 'reopen':return 'Reabrir período';case 'discrepancy':return 'Registrar divergência';case 'message':return 'Enviar solicitação';case 'resolve':return 'Salvar decisão';case 'review-document':return dialog.target==='ACEITO'?'Confirmar aceite':'Registrar rejeição'}
}


function MunicipalReadOnlyClosure({ period, setPeriod, data, loading, error, onRefresh }: { period: string; setPeriod: (value: string) => void; data: MunicipalSummaryData | null; loading: boolean; error: string; onRefresh: () => void }) {
  const summary=data?.summary
  const parent=data?.closure
  return <section className="fleet-section fleet-page-section fleet-closure-v2-readonly"><div className="fleet-page-heading"><div><span className="fleet-kicker">PERFIL PREFEITO · CONSULTA CONSOLIDADA</span><h2>Fechamento mensal</h2><p>Visão gerencial municipal somente leitura. Conferência oficial, documentos por posto, divergências e reabertura não são disponibilizados neste perfil.</p></div><div className="fleet-closure-v2-period"><CalendarCheck size={15}/><input aria-label="Competência" type="month" value={period} onChange={(event)=>setPeriod(event.target.value)}/><button type="button" className="fleet-secondary-button" onClick={onRefresh} disabled={loading}><RefreshCw size={13}/>Atualizar</button></div></div>{error&&<div className="fleet-inline-error" role="alert"><CircleAlert size={15}/>{error}</div>}{loading?<div className="fleet-loading"><RefreshCw className="spin" size={18}/>Consultando consolidação…</div>:!parent?<div className="fleet-empty"><span><CalendarCheck size={22}/></span><strong>Competência ainda não preparada</strong><p>Não há fechamento mensal municipal registrado para {periodName(period)}.</p></div>:<><div className="fleet-closure-v2-banner"><div><span className="fleet-kicker">COMPETÊNCIA MUNICIPAL</span><strong>{periodName(period)}</strong><p>Situação: {stateLabel(parent.status)} · atualizado conforme a conferência do Município.</p></div><span className={`fleet-closure-v2-status ${closureStatus[parent.status]?.tone||'neutral'}`}>{stateLabel(parent.status)}</span></div><div className="fleet-metric-grid fleet-closure-v2-metrics"><article className="fleet-metric"><span className="fleet-metric-icon blue"><Store size={18}/></span><div><span>Postos na competência</span><strong>{Number(summary?.station_count||0).toLocaleString('pt-BR')}</strong><small>{Number(summary?.stations_reviewed||0)} conferido(s) · {Number(summary?.stations_pending||0)} pendente(s)</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon green"><FileCheck2 size={18}/></span><div><span>Abastecimentos válidos</span><strong>{Number(summary?.fueling_count||0).toLocaleString('pt-BR')}</strong><small>{number(summary?.liters||0,3)} L</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon violet"><FileText size={18}/></span><div><span>Valor registrado</span><strong>{money(summary?.registered_amount)}</strong><small>Consolidado municipal · cancelados excluídos</small></div></article><article className="fleet-metric"><span className="fleet-metric-icon amber"><AlertTriangle size={18}/></span><div><span>Conciliação fiscal</span><strong>{summary?.invoice_amount==null?'—':money(summary.invoice_amount)}</strong><small>Diferença {summary?.difference_amount==null?'—':money(summary.difference_amount)} · {Number(summary?.unresolved_discrepancies||0)} divergência(s) · {Number(summary?.documents_pending||0)} pendência(s)</small></div></article></div><div className="fleet-closure-v2-readonly-note"><ShieldCheck size={17}/><span>Consulta consolidada sem autorização para conferir, registrar divergência, fechar ou reabrir a competência.</span></div></>}</section>
}
