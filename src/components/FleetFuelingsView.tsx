import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, Clock3, Download, Eye, FilePlus2, Filter, Fuel, LoaderCircle, Plus, RefreshCw, Search, Settings2, ShieldCheck, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatMunicipalDateTime, municipalDateEndExclusiveIso, municipalDateStartIso, municipalDateTimeInputValue, municipalLocalInputToDate, municipalLocalInputToIso } from '../lib/municipalTime'
import './FleetFuelingsView.css'

type Station = { id: string; nome_fantasia_snapshot: string | null; razao_social_snapshot: string }
type FuelType = { id: string; nome: string; sigla: string | null; unidade_medida: string }
type Unit = { id: string; nome: string; sigla: string | null }
type Vehicle = { id: string; placa: string; modelo: string | null; fuel_type_id: string | null; responsible_unit_id: string | null; operational_status: string; tank_capacity_l: number | null; current_odometer_km: number | null }
type Driver = { id: string; nome: string; matricula: string | null; cnh_valid_until: string | null; cnh_category?: string | null }
type Document = { id: string; file_name: string; storage_path: string; mime_type: string; file_size_bytes: number; document_type: string; notes: string | null; document_status: string; uploaded_at: string; due_at: string | null; is_current: boolean; rejection_reason: string | null; reviewed_by: number | null; reviewed_at: string | null }
type Alert = { id: string; code: string; severity: string; title: string; description: string; status: string; created_at: string; resolution_notes: string | null }
type Fueling = {
  total_count: number; id: string; protocol_number: string; vehicle_id: string; vehicle_plate: string; vehicle_model: string | null;
  driver_id: string | null; driver_name: string | null; driver_registration: string | null; station_id: string; station_name: string;
  fuel_type_id: string; fuel_type_name: string; responsible_unit_id: string | null; responsible_unit_name: string | null;
  beneficiary_unit_id: string | null; beneficiary_unit_name: string | null; authorization_id: string | null; performed_at: string;
  submitted_at: string; recorded_at: string; entry_type: string; record_origin: string; late_entry_reason: string | null;
  liters: number; unit_price: number; total_amount: number; odometer_km: number; station_receipt_number: string | null; notes: string | null;
  status: string; operational_status: string; review_status: string; review_pending_reason: string | null; created_by: number | null;
  registered_officially_by: number | null; registered_officially_at: string | null; cancellation_reason: string | null;
  documents: Document[]; alerts: Alert[];
}
type Policy = { municipio_id?: string; normal_entry_window_minutes: number; max_posterior_days: number; future_tolerance_minutes: number; require_late_reason: boolean; short_interval_minutes: number; odometer_tolerance_km: number; price_deviation_percent: number; price_reference_per_liter: number | null; usual_start_hour: number; usual_end_hour: number; updated_by?: number }
type Authorization = { id: string; beneficiary_unit_id: string; valid_from: string; valid_until: string; purpose: string; supporting_document_path: string | null; authorized_by: number | null }
type Adjustment = { id: string; reason: string; proposed_changes: Record<string, unknown>; requested_at: string; requested_by: number; approval_status: string; decision_notes: string | null }
type Audit = { id: string; event_type: string; field_name: string | null; old_value: unknown; new_value: unknown; reason: string | null; actor_type: string; performed_at: string; performed_by: number | null }

type Filters = { search: string; from: string; to: string; station: string; responsible: string; beneficiary: string; vehicle: string; driver: string; fuel: string; status: string; review: string; document: string; missingDocument: boolean; alert: boolean; late: boolean }
type FormState = { stationId: string; vehicleId: string; fuelTypeId: string; driverId: string; performedAt: string; liters: string; unitPrice: string; odometerKm: string; receipt: string; notes: string; lateReason: string; responsibleUnitId: string; beneficiaryId: string; authorizationId: string; files: File[] }

const labels: Record<string, string> = {
  RASCUNHO: 'Rascunho', ENVIADO_PELO_POSTO: 'Enviado pelo posto', PENDENTE_DE_COMPROVANTE: 'Pendente de comprovante',
  PENDENTE_DE_CONFERENCIA: 'Pendente de conferência', EM_ANALISE: 'Em análise', COM_INCONSISTENCIA: 'Com inconsistência',
  SOLICITADA_CORRECAO: 'Correção solicitada', CORRIGIDO: 'Corrigido', CONFERIDO: 'Conferido', INCLUIDO_NO_FECHAMENTO: 'No fechamento', CANCELADO: 'Cancelado',
  REGISTRADO: 'Registrado', AGUARDANDO_COMPLEMENTACAO: 'Aguardando complemento', SINALIZADO: 'Sinalizado',
  NORMAL: 'No prazo', POSTERIOR: 'Lançamento posterior', ACEITO: 'Aceito', REJEITADO: 'Rejeitado', ENVIADO: 'Enviado', SUBSTITUIDO: 'Substituído',
}
const pageSize = 50
const emptyFilters: Filters = { search: '', from: '', to: '', station: '', responsible: '', beneficiary: '', vehicle: '', driver: '', fuel: '', status: '', review: '', document: '', missingDocument: false, alert: false, late: false }
const newForm = (): FormState => ({ stationId: '', vehicleId: '', fuelTypeId: '', driverId: '', performedAt: municipalDateTimeInputValue(new Date(Date.now() - 60_000)), liters: '', unitPrice: '', odometerKm: '', receipt: '', notes: '', lateReason: '', responsibleUnitId: '', beneficiaryId: '', authorizationId: '', files: [] })

function money(value: number | string | null | undefined) { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0)) }
function quantity(value: number | string | null | undefined, digits = 2) { return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number(value || 0)) }
function dateTime(value?: string | null) { return formatMunicipalDateTime(value) }
function errorText(error: unknown) { return error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String((error as { message: unknown }).message) : 'A operação não pôde ser concluída.' }
function localDateStart(value: string | null) { return value ? municipalDateStartIso(value) || null : null }
function localDateEnd(value: string | null) { return value ? municipalDateEndExclusiveIso(value) || null : null }
function safeFileName(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) }

export function FleetFuelingsView({ onPendingCountRefresh }: { onPendingCountRefresh: () => Promise<void> }) {
  const [rows, setRows] = useState<Fueling[]>([])
  const [total, setTotal] = useState(0)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [stations, setStations] = useState<Station[]>([])
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [fuels, setFuels] = useState<FuelType[]>([])
  const [authorizedFuelIds, setAuthorizedFuelIds] = useState<string[]>([])
  const [fuelOptionsLoading, setFuelOptionsLoading] = useState(false)
  const [units, setUnits] = useState<Unit[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [filterDrivers, setFilterDrivers] = useState<Driver[]>([])
  const [driversLoading, setDriversLoading] = useState(false)
  const [authorizations, setAuthorizations] = useState<Authorization[]>([])
  const [policies, setPolicies] = useState<Policy | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [showRules, setShowRules] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [form, setForm] = useState<FormState>(newForm())
  const [details, setDetails] = useState<Fueling | null>(null)
  const [detailDocs, setDetailDocs] = useState<Document[]>([])
  const [audit, setAudit] = useState<Audit[]>([])
  const [adjustments, setAdjustments] = useState<Adjustment[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [rulesDraft, setRulesDraft] = useState<Policy | null>(null)
  const [rulesSaving, setRulesSaving] = useState(false)
  const [rulesError, setRulesError] = useState('')

  const selectedVehicle = useMemo(() => vehicles.find((item) => item.id === form.vehicleId) || null, [vehicles, form.vehicleId])
  const calculatedTotal = useMemo(() => Number(form.liters || 0) * Number(form.unitPrice || 0), [form.liters, form.unitPrice])
  const needsLateReason = useMemo(() => {
    if (!form.performedAt) return false
    const mins = (Date.now() - municipalLocalInputToDate(form.performedAt).getTime()) / 60_000
    return mins > (policies?.normal_entry_window_minutes ?? 30)
  }, [form.performedAt, policies])

  const loadOptions = useCallback(async () => {
    if (!supabase) return
    const [stationResult, vehicleResult, fuelResult, unitResult, policyResult] = await Promise.all([
      supabase.from('fleet_fuel_stations').select('id,nome_fantasia_snapshot,razao_social_snapshot').eq('status', 'ATIVO').order('nome_fantasia_snapshot').limit(500),
      supabase.from('fleet_vehicles').select('id,placa,modelo,fuel_type_id,responsible_unit_id,operational_status,tank_capacity_l,current_odometer_km').order('placa').limit(1000),
      supabase.from('fleet_fuel_types').select('id,nome,sigla,unidade_medida').eq('ativo', true).order('nome').limit(500),
      supabase.from('unidades_organizacionais').select('id,nome,sigla').eq('ativo', true).order('nome').limit(500),
      supabase.from('fleet_fueling_policies').select('*').limit(1).maybeSingle(),
    ])
    const failure = stationResult.error || vehicleResult.error || fuelResult.error || unitResult.error || policyResult.error
    if (failure) setError('Algumas opções operacionais não puderam ser carregadas. Atualize a tela ou valide as permissões municipais.')
    setStations((stationResult.data || []) as Station[])
    setVehicles((vehicleResult.data || []) as Vehicle[])
    setFuels((fuelResult.data || []) as FuelType[])
    setUnits((unitResult.data || []) as Unit[])
    if (policyResult.data) setPolicies(policyResult.data as Policy)
    const { data: driverRows, error: driverError } = await supabase.rpc('fleet_search_drivers', { p_search: null, p_status: 'ATIVO', p_cnh_status: null, p_page: 0, p_page_size: 100 })
    if (driverError) setError('Os filtros de motorista não puderam ser carregados.')
    else setFilterDrivers((driverRows || []) as Driver[])
  }, [])

  const loadRows = useCallback(async (quiet = false) => {
    if (!supabase) { setLoading(false); setError('Serviço de dados indisponível.'); return }
    if (!quiet) setLoading(true); else setRefreshing(true)
    setError('')
    const args = {
      p_search: filters.search.trim() || null,
      p_from: localDateStart(filters.from), p_to: localDateEnd(filters.to),
      p_station_id: filters.station || null, p_responsible_unit_id: filters.responsible || null,
      p_beneficiary_unit_id: filters.beneficiary || null, p_vehicle_id: filters.vehicle || null,
      p_driver_id: filters.driver || null, p_fuel_type_id: filters.fuel || null,
      p_status: filters.status || null, p_operational_status: null,
      p_review_status: filters.review || null, p_document_status: filters.document || null,
      p_missing_document: filters.missingDocument, p_has_alert: filters.alert ? true : null,
      p_late: filters.late ? true : null, p_limit: pageSize, p_offset: page * pageSize,
    }
    const { data, error: resultError } = await supabase.rpc('fleet_search_fuelings', args)
    if (resultError) { setError(`Não foi possível consultar a fila no servidor: ${resultError.message}`); setRows([]); setTotal(0) }
    else {
      const result = (data || []) as unknown as Fueling[]
      setRows(result)
      setTotal(Number(result[0]?.total_count || 0))
    }
    setLoading(false); setRefreshing(false)
  }, [filters, page])

  useEffect(() => { void loadOptions() }, [loadOptions])
  useEffect(() => { const timer = window.setTimeout(() => { void loadRows() }, filters.search ? 250 : 0); return () => window.clearTimeout(timer) }, [loadRows])

  async function loadDrivers(vehicleId: string, dateValue: string) {
    if (!supabase || !vehicleId) { setDrivers([]); return }
    setDriversLoading(true)
    const instant = dateValue ? municipalLocalInputToDate(dateValue) : new Date()
    if (!Number.isFinite(instant.getTime())) { setDrivers([]); setDriversLoading(false); return }
    const { data, error: driverError } = await supabase.rpc('fleet_manager_vehicle_driver_options', { p_vehicle_id: vehicleId, p_performed_at: instant.toISOString(), p_require_authorization: true })
    if (driverError) { setDrivers([]); setFormError('Não foi possível verificar autorização, CNH e categoria do motorista para a data escolhida.'); }
    else setDrivers((data || []) as Driver[])
    setDriversLoading(false)
  }

  async function loadAuthorizations(vehicleId: string, dateValue: string) {
    if (!supabase || !vehicleId) { setAuthorizations([]); return }
    const timestamp = dateValue ? municipalLocalInputToIso(dateValue) : new Date().toISOString()
    const { data, error: resultError } = await supabase.from('fleet_vehicle_authorizations').select('id,beneficiary_unit_id,valid_from,valid_until,purpose,supporting_document_path,authorized_by').eq('vehicle_id', vehicleId).eq('status', 'APROVADA').lte('valid_from', timestamp).gte('valid_until', timestamp).not('authorized_by', 'is', null).not('supporting_document_path', 'is', null).order('valid_until').limit(100)
    if (resultError) { setAuthorizations([]); setFormError('Não foi possível verificar autorizações de cessão vigentes.'); return }
    setAuthorizations((data || []) as Authorization[])
  }

  async function loadAuthorizedFuels(stationId: string, vehicleId: string, dateValue = form.performedAt) {
    if (!supabase || !stationId) { setAuthorizedFuelIds([]); return }
    setFuelOptionsLoading(true)
    const eventTime = dateValue ? municipalLocalInputToDate(dateValue) : new Date()
    const { data, error: resultError } = await supabase.rpc('fleet_supplier_fuel_options', { p_station_id: stationId, p_vehicle_id: vehicleId || null, p_performed_at: eventTime.toISOString() })
    if (resultError) { setAuthorizedFuelIds([]); setFormError('Não foi possível consultar os combustíveis habilitados para o posto.'); }
    else setAuthorizedFuelIds(((data || []) as { id: string }[]).map((item) => item.id))
    setFuelOptionsLoading(false)
  }

  async function resolveVehicleUnit(vehicleId: string, dateValue: string) {
    if (!supabase || !vehicleId) return
    const vehicle = vehicles.find((item) => item.id === vehicleId)
    const at = dateValue ? municipalLocalInputToIso(dateValue) : new Date().toISOString()
    const { data } = await supabase.from('fleet_vehicle_department_history').select('to_unit_id,started_at,ended_at').eq('vehicle_id', vehicleId).order('started_at', { ascending: false }).limit(200)
    const match = ((data || []) as { to_unit_id: string; started_at: string; ended_at: string | null }[]).find((item) => new Date(item.started_at) <= new Date(at) && (!item.ended_at || new Date(item.ended_at) > new Date(at)))
    const responsible = match?.to_unit_id || vehicle?.responsible_unit_id || ''
    setForm((current) => ({ ...current, responsibleUnitId: responsible, beneficiaryId: responsible, authorizationId: '' }))
  }

  function openCreate() {
    const next = newForm()
    if (stations.length === 1) next.stationId = stations[0].id
    setForm(next); setFormError(''); setNotice(''); setShowCreate(true)
  }
  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) { setForm((current) => ({ ...current, [key]: value })) }
  function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || [])
    const invalid = files.find((file) => !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)
    if (invalid) { setFormError(`${invalid.name}: anexe PDF/JPG/PNG/WEBP de até 10 MB cada.`); return }
    updateForm('files', files)
  }

  async function uploadDocuments(fuelingId: string, files: File[], replacedDocumentId: string | null = null) {
    if (!supabase || !files.length) return ''
    const [{ data: municipality }, { data: userId }] = await Promise.all([supabase.rpc('fleet_current_municipio_id'), supabase.rpc('fleet_current_usuario_id')])
    if (!municipality || !userId) throw new Error('Não foi possível identificar o escopo municipal do documento.')
    for (const file of files) {
      const path = `${municipality}/fuelings/${fuelingId}/${crypto.randomUUID()}-${safeFileName(file.name)}`
      const upload = await supabase.storage.from('fleet-documents').upload(path, file, { contentType: file.type, upsert: false })
      if (upload.error) throw upload.error
      const result = await supabase.rpc('fleet_register_fueling_document', {
        p_fueling_id: fuelingId, p_file_name: file.name, p_storage_path: path, p_mime_type: file.type,
        p_file_size_bytes: file.size, p_document_type: 'COMPROVANTE_DE_ABASTECIMENTO', p_notes: null, p_replaced_document_id: replacedDocumentId,
      })
      if (result.error) throw result.error
    }
    return ''
  }

  async function createFueling(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase) return
    setSaving(true); setFormError(''); setNotice('')
    try {
      if (!form.stationId || !form.vehicleId || !form.fuelTypeId || !form.driverId || !form.performedAt || Number(form.liters) <= 0 || Number(form.unitPrice) <= 0 || !form.odometerKm) throw new Error('Preencha posto, veículo, combustível, motorista autorizado, data/hora, quantidade, preço e hodômetro.')
      if (needsLateReason && form.lateReason.trim().length < 8) throw new Error('Lançamento posterior ao prazo exige justificativa com pelo menos 8 caracteres.')
      const responsible = form.responsibleUnitId || selectedVehicle?.responsible_unit_id || null
      const beneficiary = form.beneficiaryId || responsible
      if ((selectedVehicle?.operational_status === 'CEDIDO' || (responsible && beneficiary && responsible !== beneficiary)) && !form.authorizationId) throw new Error('Veículo cedido ou uso por outra secretaria exige autorização administrativa aprovada, vigente e documentada.')
      const idempotencyKey = crypto.randomUUID()
      const { data, error: submitError } = await supabase.rpc('fleet_submit_fueling', {
        p_idempotency_key: idempotencyKey, p_station_id: form.stationId, p_vehicle_id: form.vehicleId,
        p_fuel_type_id: form.fuelTypeId, p_driver_id: form.driverId, p_responsible_unit_id: responsible,
        p_beneficiary_unit_id: beneficiary, p_authorization_id: form.authorizationId || null,
        p_performed_at: municipalLocalInputToIso(form.performedAt), p_liters: Number(form.liters),
        p_unit_price: Number(form.unitPrice), p_odometer_km: Number(form.odometerKm),
        p_station_receipt_number: form.receipt.trim() || null, p_notes: form.notes.trim() || null,
        p_late_entry_reason: form.lateReason.trim() || null, p_source: 'MUNICIPIO',
      })
      if (submitError) throw submitError
      const record = Array.isArray(data) ? data[0] : data
      const id = record?.fueling_id
      if (!id) throw new Error('O abastecimento foi enviado, mas não retornou o protocolo esperado.')
      let attachmentWarning = ''
      if (form.files.length) {
        try { await uploadDocuments(id, form.files) }
        catch (cause) { attachmentWarning = ` O registro ${record.protocol_number || ''} foi criado, mas um comprovante não pôde ser anexado: ${errorText(cause)}` }
      }
      setShowCreate(false); setForm(newForm()); setNotice(`Abastecimento ${record.protocol_number || ''} registrado. ${form.files.length ? (attachmentWarning ? attachmentWarning : 'Comprovante(s) enviado(s) para conferência.') : 'Comprovante pendente dentro do prazo de 24 horas.'}`)
      await loadRows(true)
      await onPendingCountRefresh()
    } catch (cause) { setFormError(errorText(cause)) }
    finally { setSaving(false) }
  }

  async function openDetails(row: Fueling) {
    setDetails(row); setDetailLoading(true); setDetailDocs([]); setAudit([]); setAdjustments([])
    if (!supabase) { setDetailLoading(false); return }
    const [docResult, auditResult, adjustmentResult] = await Promise.all([
      supabase.from('fleet_fueling_documents').select('id,file_name,storage_path,mime_type,file_size_bytes,document_type,notes,document_status,uploaded_at,due_at,is_current,rejection_reason,reviewed_by,reviewed_at').eq('fueling_id', row.id).order('uploaded_at', { ascending: false }).limit(100),
      supabase.from('fleet_fueling_audit').select('id,event_type,field_name,old_value,new_value,reason,actor_type,performed_at,performed_by').eq('fueling_id', row.id).order('performed_at', { ascending: false }).limit(100),
      supabase.from('fleet_fueling_adjustments').select('id,reason,proposed_changes,requested_at,requested_by,approval_status,decision_notes').eq('fueling_id', row.id).order('requested_at', { ascending: false }).limit(50),
    ])
    if (docResult.error || auditResult.error || adjustmentResult.error) setError('Detalhes carregados parcialmente; verifique as permissões de documentos e histórico.')
    setDetailDocs((docResult.data || []) as Document[]); setAudit((auditResult.data || []) as Audit[]); setAdjustments((adjustmentResult.data || []) as Adjustment[]); setDetailLoading(false)
  }

  async function attachDocument(file: File, replacedDocumentId: string | null = null) {
    if (!details) return
    if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) { setError('Selecione PDF, JPG, PNG ou WEBP de até 10 MB.'); return }
    try {
      await uploadDocuments(details.id, [file], replacedDocumentId)
      setNotice('Comprovante anexado e encaminhado para conferência.')
      await loadRows(true); await openDetails(details); await onPendingCountRefresh()
    } catch (cause) { setError(`O registro permanece salvo, mas o documento não foi concluído: ${errorText(cause)}`) }
  }

  async function signedDocument(document: Document) {
    if (!supabase) return
    const { data, error: urlError } = await supabase.storage.from('fleet-documents').createSignedUrl(document.storage_path, 300)
    if (urlError) { setError(`Não foi possível abrir o arquivo: ${urlError.message}`); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function reviewDocument(document: Document, decision: 'ACEITO' | 'REJEITADO') {
    if (!supabase || !details) return
    let reason = ''
    if (decision === 'REJEITADO') { reason = window.prompt('Informe o motivo da rejeição (mínimo 8 caracteres):', '') || ''; if (reason.trim().length < 8) return }
    const { error: resultError } = await supabase.rpc('fleet_review_fueling_document', { p_document_id: document.id, p_decision: decision, p_reason: reason || null })
    if (resultError) { setError(resultError.message); return }
    setNotice(decision === 'ACEITO' ? 'Comprovante aceito.' : 'Comprovante rejeitado com motivo registrado.')
    await loadRows(true); await openDetails(details); await onPendingCountRefresh()
  }

  async function reviewFueling(status: 'EM_ANALISE' | 'CONFERIDO' | 'COM_PENDENCIA' | 'CONTESTADO' | 'REGULARIZADO') {
    if (!supabase || !details) return
    const prompt = status === 'CONFERIDO' ? 'Observações da conferência (opcional):' : 'Justificativa/observações (mínimo 8 caracteres):'
    const notes = window.prompt(prompt, '') || ''
    if (status !== 'CONFERIDO' && notes.trim().length < 8) return
    const { error: resultError } = await supabase.rpc('fleet_review_fueling', { p_fueling_id: details.id, p_review_status: status, p_notes: notes || null, p_pending_reason: status === 'COM_PENDENCIA' || status === 'CONTESTADO' ? notes : null })
    if (resultError) { setError(resultError.message); return }
    setNotice(`Conferência atualizada: ${labels[status] || status}.`); await loadRows(true); await openDetails({ ...details, review_status: status }); await onPendingCountRefresh()
  }

  async function cancelFueling(row: Fueling) {
    if (!supabase) return
    const reason = window.prompt(`Cancelar ${row.protocol_number}. Informe justificativa (mínimo 8 caracteres):`, '') || ''
    if (reason.trim().length < 8) return
    const { error: resultError } = await supabase.rpc('fleet_cancel_fueling', { p_fueling_id: row.id, p_reason: reason })
    if (resultError) { setError(resultError.message); return }
    setNotice(`Registro ${row.protocol_number} cancelado com justificativa e trilha de auditoria.`); setDetails(null); await loadRows(true); await onPendingCountRefresh()
  }

  async function resolveAlert(alert: Alert) {
    if (!supabase) return
    const reason = window.prompt(`Providência para o alerta “${alert.title}” (mínimo 8 caracteres):`, '') || ''
    if (reason.trim().length < 8) return
    const { error: resultError } = await supabase.rpc('fleet_resolve_fueling_alert', { p_alert_id: alert.id, p_resolution_notes: reason })
    if (resultError) { setError(resultError.message); return }
    setNotice('Alerta resolvido com responsável, data e providência registrada.'); await loadRows(true); if (details) await openDetails(details); await onPendingCountRefresh()
  }

  async function decideAdjustment(adjustment: Adjustment, decision: 'APROVADA' | 'REJEITADA') {
    if (!supabase) return
    const notes = window.prompt(`Justificativa da decisão ${decision === 'APROVADA' ? 'de aprovação' : 'de rejeição'} (mínimo 8 caracteres):`, '') || ''
    if (notes.trim().length < 8) return
    const { error: resultError } = await supabase.rpc('fleet_decide_fueling_adjustment', { p_adjustment_id: adjustment.id, p_decision: decision, p_notes: notes })
    if (resultError) { setError(resultError.message); return }
    setNotice(`Solicitação de correção ${decision.toLocaleLowerCase('pt-BR')}.`); await loadRows(true); if (details) await openDetails(details); await onPendingCountRefresh()
  }

  async function saveRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !rulesDraft) return
    setRulesSaving(true); setRulesError('')
    try {
      const [{ data: municipio, error: municipioError }, { data: userId, error: userError }] = await Promise.all([supabase.rpc('fleet_current_municipio_id'), supabase.rpc('fleet_current_usuario_id')])
      if (municipioError || userError || !municipio || !userId) throw new Error('Não foi possível confirmar o escopo municipal.')
      const payload = { ...rulesDraft, municipio_id: municipio, updated_by: userId, updated_at: new Date().toISOString() }
      const { error: saveError } = await supabase.from('fleet_fueling_policies').upsert(payload, { onConflict: 'municipio_id' })
      if (saveError) throw saveError
      setPolicies(payload); setShowRules(false); setNotice('Regras municipais salvas; o backend aplicará os limites em cada registro.')
    } catch (cause) { setRulesError(errorText(cause)) }
    finally { setRulesSaving(false) }
  }

  function resetFilters() { setFilters(emptyFilters); setPage(0) }
  function setFilter<K extends keyof Filters>(key: K, value: Filters[K]) { setPage(0); setFilters((current) => ({ ...current, [key]: value })) }

  return <section className="fueling-view">
    <div className="fueling-toolbar"><div><p className="fueling-eyebrow">REGISTRO, CONFERÊNCIA E RASTREABILIDADE</p><h2>Abastecimentos</h2><p className="fueling-subtitle">Consulta paginada no servidor. Valores, alertas, documentos e histórico são verificados pelo backend.</p></div><div className="fueling-toolbar-actions"><button className="fueling-button secondary" onClick={() => { setRulesDraft(policies || { normal_entry_window_minutes: 30, max_posterior_days: 30, future_tolerance_minutes: 5, require_late_reason: true, short_interval_minutes: 60, odometer_tolerance_km: 0, price_deviation_percent: 20, price_reference_per_liter: null, usual_start_hour: 6, usual_end_hour: 22 }); setRulesError(''); setShowRules(true) }}><Settings2 size={15} /> Regras</button><button className="fueling-button secondary" onClick={() => void loadRows(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? 'fueling-spin' : ''} /> Atualizar</button><button className="fueling-button primary" onClick={openCreate}><Plus size={16} /> Novo abastecimento</button></div></div>
    <div className="fueling-summary-strip"><span><strong>{total.toLocaleString('pt-BR')}</strong> registro(s) na consulta</span><span><ShieldCheck size={15} /> Protocolo e total gerados/validados no servidor</span><span><Clock3 size={15} /> Comprovante em até 24 h</span></div>
    {error && <div className="fueling-alert error" role="alert"><AlertTriangle size={16} /> {error}<button onClick={() => setError('')} aria-label="Fechar aviso"><X size={14} /></button></div>}
    {notice && <div className="fueling-alert success" role="status"><Check size={16} /> {notice}<button onClick={() => setNotice('')} aria-label="Fechar aviso"><X size={14} /></button></div>}
    <div className="fueling-filter-panel"><div className="fueling-filter-heading"><strong><Filter size={15} /> Filtros</strong><button type="button" onClick={resetFilters}>Limpar</button></div><div className="fueling-filter-grid">
      <label className="fueling-search"><span>Busca livre</span><div><Search size={15} /><input value={filters.search} onChange={(e) => setFilter('search', e.target.value)} placeholder="Protocolo, placa, motorista, posto…" /></div></label>
      <label><span>De</span><input type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} /></label><label><span>Até</span><input type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} /></label>
      <label><span>Posto</span><select value={filters.station} onChange={(e) => setFilter('station', e.target.value)}><option value="">Todos</option>{stations.map((item) => <option key={item.id} value={item.id}>{item.nome_fantasia_snapshot || item.razao_social_snapshot}</option>)}</select></label>
      <label><span>Secretaria responsável</span><select value={filters.responsible} onChange={(e) => setFilter('responsible', e.target.value)}><option value="">Todas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label><span>Secretaria beneficiária</span><select value={filters.beneficiary} onChange={(e) => setFilter('beneficiary', e.target.value)}><option value="">Todas</option>{units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label><span>Veículo</span><select value={filters.vehicle} onChange={(e) => setFilter('vehicle', e.target.value)}><option value="">Todos</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.placa} · {item.modelo || 'Veículo'}</option>)}</select></label>
      <label><span>Combustível</span><select value={filters.fuel} onChange={(e) => setFilter('fuel', e.target.value)}><option value="">Todos</option>{fuels.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label><span>Motorista</span><select value={filters.driver} onChange={(e) => setFilter('driver', e.target.value)}><option value="">Todos</option>{filterDrivers.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
      <label><span>Situação do registro</span><select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}><option value="">Todas</option>{['RASCUNHO','ENVIADO_PELO_POSTO','PENDENTE_DE_COMPROVANTE','PENDENTE_DE_CONFERENCIA','EM_ANALISE','COM_INCONSISTENCIA','SOLICITADA_CORRECAO','CORRIGIDO','CONFERIDO','INCLUIDO_NO_FECHAMENTO','CANCELADO'].map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
      <label><span>Conferência</span><select value={filters.review} onChange={(e) => setFilter('review', e.target.value)}><option value="">Todas</option>{['PENDENTE_DE_CONFERENCIA','EM_ANALISE','COM_PENDENCIA','CONTESTADO','REGULARIZADO','CONFERIDO','ENCERRADO_NO_FECHAMENTO'].map((value) => <option key={value} value={value}>{labels[value] || value.replaceAll('_',' ')}</option>)}</select></label>
      <label><span>Comprovante</span><select value={filters.document} onChange={(e) => setFilter('document', e.target.value)}><option value="">Todos</option>{['ENVIADO','ACEITO','REJEITADO'].map((value) => <option key={value} value={value}>{labels[value]}</option>)}</select></label>
    </div><div className="fueling-toggle-filters"><label><input type="checkbox" checked={filters.missingDocument} onChange={(e) => setFilter('missingDocument', e.target.checked)} /> Sem comprovante atual</label><label><input type="checkbox" checked={filters.alert} onChange={(e) => setFilter('alert', e.target.checked)} /> Com alerta aberto</label><label><input type="checkbox" checked={filters.late} onChange={(e) => setFilter('late', e.target.checked)} /> Lançamento posterior</label></div></div>
    <div className="fueling-table-wrap"><table className="fueling-table"><thead><tr><th>Protocolo / data</th><th>Veículo / motorista</th><th>Posto / secretaria</th><th>Combustível</th><th>Quantidade / valor</th><th>Comprovante</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={8} className="fueling-table-state"><LoaderCircle size={18} className="fueling-spin" /> Consultando o backend…</td></tr> : rows.length ? rows.map((row) => <tr key={row.id}>
        <td><strong>{row.protocol_number || 'Sem protocolo'}</strong><small>{dateTime(row.performed_at)}</small><small>Enviado: {dateTime(row.submitted_at)}</small></td>
        <td><strong>{row.vehicle_plate}</strong><small>{row.vehicle_model || '—'}</small><small>{row.driver_name || 'Motorista não identificado'}</small></td>
        <td><strong>{row.station_name}</strong><small>Resp.: {row.responsible_unit_name || '—'}</small><small>Benef.: {row.beneficiary_unit_name || row.responsible_unit_name || '—'}</small></td>
        <td>{row.fuel_type_name}<small>{row.entry_type === 'POSTERIOR' ? <span className="fueling-chip warning">Posterior</span> : 'No prazo'}</small></td>
        <td><strong>{quantity(row.liters)} L</strong><small>{money(row.unit_price)} / L</small><strong>{money(row.total_amount)}</strong></td>
        <td>{row.documents?.length ? <span className={`fueling-chip ${row.documents[0].document_status === 'ACEITO' ? 'success' : row.documents[0].document_status === 'REJEITADO' ? 'danger' : 'warning'}`}>{labels[row.documents[0].document_status] || row.documents[0].document_status}</span> : <span className="fueling-chip danger">Ausente</span>}{row.alerts?.length ? <small className="fueling-danger-text">{row.alerts.length} alerta(s)</small> : null}</td>
        <td><span className={`fueling-chip ${row.status === 'CONFERIDO' || row.status === 'INCLUIDO_NO_FECHAMENTO' ? 'success' : row.status === 'CANCELADO' ? 'muted' : row.status === 'COM_INCONSISTENCIA' || row.status === 'SOLICITADA_CORRECAO' ? 'danger' : 'warning'}`}>{labels[row.status] || row.status}</span><small>{labels[row.review_status] || row.review_status}</small></td>
        <td className="fueling-actions"><button className="fueling-icon-action" title="Abrir ficha completa" onClick={() => void openDetails(row)}><Eye size={15} /></button>{row.status !== 'CANCELADO' && row.status !== 'INCLUIDO_NO_FECHAMENTO' && <button className="fueling-text-action danger" onClick={() => void cancelFueling(row)}>Cancelar</button>}</td>
      </tr>) : <tr><td colSpan={8} className="fueling-table-state">Nenhum abastecimento corresponde aos filtros atuais.</td></tr>}
    </tbody></table></div>
    <div className="fueling-pagination"><span>Exibindo {total ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, total)} de {total.toLocaleString('pt-BR')}</span><div><button onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0 || loading}><ArrowLeft size={15} /> Anterior</button><span>Página {page + 1} de {Math.max(1, Math.ceil(total / pageSize))}</span><button onClick={() => setPage((value) => value + 1)} disabled={loading || (page + 1) * pageSize >= total}>Próxima <ArrowRight size={15} /></button></div></div>

    {showCreate && <div className="fueling-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !saving && setShowCreate(false)}><section className="fueling-modal wide" role="dialog" aria-modal="true" aria-labelledby="fueling-create-title"><div className="fueling-modal-head"><div><p>NOVO LANÇAMENTO MUNICIPAL</p><h3 id="fueling-create-title">Registrar abastecimento</h3></div><button className="fueling-icon-action" onClick={() => setShowCreate(false)} disabled={saving}><X size={18} /></button></div>
      {formError && <div className="fueling-alert error"><AlertTriangle size={16} /> {formError}</div>}
      <form onSubmit={(e) => void createFueling(e)}><div className="fueling-form-grid">
        <label><span>Posto credenciado *</span><select required value={form.stationId} onChange={(e) => { const stationId = e.target.value; setForm((current) => ({ ...current, stationId, fuelTypeId: '' })); setFormError(''); if (stationId) void loadAuthorizedFuels(stationId, form.vehicleId, form.performedAt); else setAuthorizedFuelIds([]) }}><option value="">Selecione</option>{stations.map((item) => <option key={item.id} value={item.id}>{item.nome_fantasia_snapshot || item.razao_social_snapshot}</option>)}</select></label>
        <label><span>Veículo *</span><select required value={form.vehicleId} onChange={(e) => { const id = e.target.value; const vehicle = vehicles.find((item) => item.id === id); setForm((current) => ({ ...current, vehicleId: id, fuelTypeId: '', driverId: '', responsibleUnitId: vehicle?.responsible_unit_id || '', beneficiaryId: vehicle?.responsible_unit_id || '', authorizationId: '', odometerKm: vehicle?.current_odometer_km == null ? '' : String(vehicle.current_odometer_km) })); setFormError(''); if (id) { void loadDrivers(id, form.performedAt); void loadAuthorizations(id, form.performedAt); void resolveVehicleUnit(id, form.performedAt); if (form.stationId) void loadAuthorizedFuels(form.stationId, id, form.performedAt) } else { setDrivers([]); setAuthorizations([]); setAuthorizedFuelIds([]) } }}><option value="">Selecione</option>{vehicles.map((item) => <option key={item.id} value={item.id}>{item.placa} · {item.modelo || 'Veículo'}{item.operational_status === 'CEDIDO' ? ' · CEDIDO' : ''}</option>)}</select>{selectedVehicle && <small>Lotação na data: {units.find((u) => u.id === form.responsibleUnitId)?.nome || 'consultando…'} · Capacidade: {quantity(selectedVehicle.tank_capacity_l)} L</small>}</label>
        <label><span>Combustível autorizado no posto *</span><select required value={form.fuelTypeId} onChange={(e) => updateForm('fuelTypeId', e.target.value)} disabled={fuelOptionsLoading || !form.stationId || !form.vehicleId}><option value="">{fuelOptionsLoading ? 'Validando autorização…' : 'Selecione'}</option>{fuels.filter((fuel) => authorizedFuelIds.includes(fuel.id) && (!selectedVehicle?.fuel_type_id || fuel.id === selectedVehicle.fuel_type_id)).map((item) => <option key={item.id} value={item.id}>{item.nome}{item.sigla ? ` (${item.sigla})` : ''}</option>)}</select><small>O servidor verifica autorização do posto e compatibilidade do veículo.</small></label>
        <label><span>Motorista autorizado *</span><select required value={form.driverId} onChange={(e) => updateForm('driverId', e.target.value)} disabled={!form.vehicleId || driversLoading}><option value="">{driversLoading ? 'Validando…' : form.vehicleId ? 'Selecione motorista' : 'Selecione o veículo primeiro'}</option>{drivers.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.matricula ? ` · ${item.matricula}` : ''}{item.cnh_category ? ` · Cat. ${item.cnh_category}` : ''}</option>)}</select>{form.vehicleId && !driversLoading && !drivers.length && <small className="fueling-danger-text">Não há autorização vigente com CNH válida para a data.</small>}</label>
        <label><span>Data e hora efetivas * (America/Sao_Paulo)</span><input type="datetime-local" required value={form.performedAt} onChange={(e) => { const value = e.target.value; updateForm('performedAt', value); if (form.vehicleId) { void loadDrivers(form.vehicleId, value); void loadAuthorizations(form.vehicleId, value); void resolveVehicleUnit(form.vehicleId, value); if (form.stationId) void loadAuthorizedFuels(form.stationId, form.vehicleId, value) } }} /></label>
        <label><span>Hodômetro (km) *</span><input type="number" required min="0" step="0.1" value={form.odometerKm} onChange={(e) => updateForm('odometerKm', e.target.value)} /></label>
        <label><span>Quantidade (L) *</span><input type="number" required min="0.01" step="0.001" value={form.liters} onChange={(e) => updateForm('liters', e.target.value)} /></label>
        <label><span>Preço por litro (R$) *</span><input type="number" required min="0.001" step="0.001" value={form.unitPrice} onChange={(e) => updateForm('unitPrice', e.target.value)} /></label>
        <label><span>Valor total calculado</span><input value={money(calculatedTotal)} readOnly /><small>Recalculado e persistido pelo banco.</small></label>
        <label><span>Número do cupom/nota</span><input value={form.receipt} onChange={(e) => updateForm('receipt', e.target.value)} maxLength={80} /></label>
        <label><span>Secretaria responsável</span><input readOnly value={units.find((u) => u.id === form.responsibleUnitId)?.nome || 'Derivada da lotação vigente do veículo'} /></label>
        <label><span>Secretaria beneficiária</span><select value={form.beneficiaryId} onChange={(e) => { updateForm('beneficiaryId', e.target.value); updateForm('authorizationId', '') }}><option value="">Igual à responsável</option>{units.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}</select></label>
        {(selectedVehicle?.operational_status === 'CEDIDO' || Boolean(form.responsibleUnitId && form.beneficiaryId && form.responsibleUnitId !== form.beneficiaryId)) && <label className="fueling-form-full"><span>Autorização administrativa de uso *</span><select required value={form.authorizationId} onChange={(e) => updateForm('authorizationId', e.target.value)}><option value="">Selecione autorização vigente</option>{authorizations.filter((a) => a.beneficiary_unit_id === form.beneficiaryId).map((item) => <option key={item.id} value={item.id}>{units.find((u) => u.id === item.beneficiary_unit_id)?.nome || 'Unidade beneficiária'} · {item.purpose}</option>)}</select><small>Somente autorizações aprovadas, vigentes, assinadas e com documento são aceitas pelo backend.</small></label>}
        {needsLateReason && <label className="fueling-form-full"><span>Justificativa do lançamento posterior *</span><textarea required minLength={8} value={form.lateReason} onChange={(e) => updateForm('lateReason', e.target.value)} placeholder="Explique o motivo do registro fora da janela normal." /></label>}
        <label className="fueling-form-full"><span>Comprovante (PDF/JPG/PNG/WEBP até 10 MB)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={onFiles} /><small>O comprovante pode ser anexado agora ou em até 24 horas; sem arquivo, o registro permanece pendente.</small></label>
        <label className="fueling-form-full"><span>Observações</span><textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} maxLength={2000} /></label>
      </div><div className="fueling-form-footer"><span>{form.files.length ? `${form.files.length} arquivo(s) · ` : ''}Total estimado: <strong>{money(calculatedTotal)}</strong></span><div><button type="button" className="fueling-button secondary" onClick={() => setShowCreate(false)} disabled={saving}>Cancelar</button><button type="submit" className="fueling-button primary" disabled={saving || driversLoading}>{saving ? <><LoaderCircle size={15} className="fueling-spin" /> Registrando…</> : <><Fuel size={15} /> Registrar</>}</button></div></div></form>
    </section></div>}

    {showRules && rulesDraft && <div className="fueling-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && !rulesSaving && setShowRules(false)}><section className="fueling-modal" role="dialog" aria-modal="true" aria-labelledby="fueling-rules-title"><div className="fueling-modal-head"><div><p>CONFIGURAÇÃO MUNICIPAL</p><h3 id="fueling-rules-title">Regras de lançamento e alertas</h3></div><button className="fueling-icon-action" onClick={() => setShowRules(false)}><X size={18} /></button></div><p className="fueling-modal-note">Os limites são aplicados no banco para lançamento pelo posto e pela Prefeitura. Alertas nunca substituem conferência humana.</p>{rulesError && <div className="fueling-alert error">{rulesError}</div>}<form onSubmit={(e) => void saveRules(e)}><div className="fueling-form-grid">
      <label><span>Janela normal (minutos)</span><input type="number" min="1" max="1440" value={rulesDraft.normal_entry_window_minutes} onChange={(e) => setRulesDraft({ ...rulesDraft, normal_entry_window_minutes: Number(e.target.value) })} /></label>
      <label><span>Máximo retroativo (dias)</span><input type="number" min="1" max="365" value={rulesDraft.max_posterior_days} onChange={(e) => setRulesDraft({ ...rulesDraft, max_posterior_days: Number(e.target.value) })} /></label>
      <label><span>Tolerância futura (minutos)</span><input type="number" min="0" max="60" value={rulesDraft.future_tolerance_minutes} onChange={(e) => setRulesDraft({ ...rulesDraft, future_tolerance_minutes: Number(e.target.value) })} /></label>
      <label><span>Intervalo mínimo para alerta (minutos)</span><input type="number" min="1" max="1440" value={rulesDraft.short_interval_minutes} onChange={(e) => setRulesDraft({ ...rulesDraft, short_interval_minutes: Number(e.target.value) })} /></label>
      <label><span>Tolerância de odômetro (km)</span><input type="number" min="0" max="100000" step="0.1" value={rulesDraft.odometer_tolerance_km} onChange={(e) => setRulesDraft({ ...rulesDraft, odometer_tolerance_km: Number(e.target.value) })} /></label>
      <label><span>Desvio de preço para alerta (%)</span><input type="number" min="0" max="500" step="0.1" value={rulesDraft.price_deviation_percent} onChange={(e) => setRulesDraft({ ...rulesDraft, price_deviation_percent: Number(e.target.value) })} /></label>
      <label><span>Preço municipal de referência (R$/L, opcional)</span><input type="number" min="0" step="0.001" value={rulesDraft.price_reference_per_liter ?? ''} onChange={(e) => setRulesDraft({ ...rulesDraft, price_reference_per_liter: e.target.value === '' ? null : Number(e.target.value) })} /></label>
      <label><span>Início do horário habitual</span><input type="number" min="0" max="23" value={rulesDraft.usual_start_hour} onChange={(e) => setRulesDraft({ ...rulesDraft, usual_start_hour: Number(e.target.value) })} /></label>
      <label><span>Fim do horário habitual</span><input type="number" min="0" max="23" value={rulesDraft.usual_end_hour} onChange={(e) => setRulesDraft({ ...rulesDraft, usual_end_hour: Number(e.target.value) })} /></label>
      <label className="fueling-check-option"><input type="checkbox" checked={rulesDraft.require_late_reason} onChange={(e) => setRulesDraft({ ...rulesDraft, require_late_reason: e.target.checked })} /> Exigir justificativa para lançamento posterior</label>
    </div><div className="fueling-form-footer"><span>Regras submetidas a validação no servidor.</span><div><button type="button" className="fueling-button secondary" onClick={() => setShowRules(false)}>Cancelar</button><button className="fueling-button primary" disabled={rulesSaving}>{rulesSaving ? 'Salvando…' : 'Salvar regras'}</button></div></div></form></section></div>}

    {details && <div className="fueling-modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setDetails(null)}><section className="fueling-modal wide detail-modal" role="dialog" aria-modal="true" aria-labelledby="fueling-detail-title"><div className="fueling-modal-head"><div><p>{details.protocol_number} · {dateTime(details.performed_at)}</p><h3 id="fueling-detail-title">{details.vehicle_plate} · {details.station_name}</h3></div><button className="fueling-icon-action" onClick={() => setDetails(null)}><X size={18} /></button></div>
      {detailLoading ? <div className="fueling-table-state"><LoaderCircle size={18} className="fueling-spin" /> Carregando ficha e trilha de auditoria…</div> : <>
        <div className="fueling-detail-grid"><div><small>Motorista</small><strong>{details.driver_name || 'Não identificado'}</strong></div><div><small>Combustível</small><strong>{details.fuel_type_name}</strong></div><div><small>Quantidade</small><strong>{quantity(details.liters)} L</strong></div><div><small>Preço / total</small><strong>{money(details.unit_price)} / L · {money(details.total_amount)}</strong></div><div><small>Hodômetro</small><strong>{quantity(details.odometer_km, 1)} km</strong></div><div><small>Responsável / beneficiária</small><strong>{details.responsible_unit_name || '—'} / {details.beneficiary_unit_name || details.responsible_unit_name || '—'}</strong></div><div><small>Data efetiva / envio</small><strong>{dateTime(details.performed_at)} / {dateTime(details.submitted_at)}</strong></div><div><small>Origem / lançamento</small><strong>{details.record_origin} · {labels[details.entry_type] || details.entry_type}</strong></div><div className="fueling-detail-full"><small>Observações / justificativa de atraso</small><strong>{details.notes || '—'}{details.late_entry_reason ? ` · ${details.late_entry_reason}` : ''}</strong></div></div>
        <div className="fueling-detail-section"><div className="fueling-detail-section-head"><h4>Comprovantes</h4><span>{detailDocs.length} arquivo(s)</span><label className="fueling-file-action"><FilePlus2 size={14} /> {detailDocs.some((doc) => doc.is_current && doc.document_status === 'REJEITADO') ? 'Substituir rejeitado' : 'Anexar'}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={detailDocs.some((doc) => doc.is_current && doc.document_status !== 'REJEITADO')} onChange={(e) => { const file = e.target.files?.[0]; if (file) { const rejected = detailDocs.find((doc) => doc.is_current && doc.document_status === 'REJEITADO'); void attachDocument(file, rejected?.id || null) } e.currentTarget.value = '' }} /></label></div>{detailDocs.length ? <div className="fueling-doc-list">{detailDocs.map((doc) => <div className="fueling-doc-row" key={doc.id}><div><strong>{doc.file_name}</strong><small>{labels[doc.document_status] || doc.document_status} · enviado {dateTime(doc.uploaded_at)}{doc.due_at ? ` · prazo ${dateTime(doc.due_at)}` : ''}</small>{doc.rejection_reason && <small className="fueling-danger-text">Motivo: {doc.rejection_reason}</small>}</div><div><button className="fueling-button secondary small" onClick={() => void signedDocument(doc)}><Download size={14} /> Abrir</button>{doc.is_current && doc.document_status === 'ENVIADO' && <><button className="fueling-button primary small" onClick={() => void reviewDocument(doc, 'ACEITO')}><Check size={14} /> Aceitar</button><button className="fueling-button danger small" onClick={() => void reviewDocument(doc, 'REJEITADO')}>Rejeitar</button></>}</div></div>)}</div> : <p className="fueling-empty-note">Nenhum comprovante registrado. A conferência permanece pendente.</p>}</div>
        <div className="fueling-detail-section"><div className="fueling-detail-section-head"><h4>Alertas e inconsistências</h4><span>{details.alerts?.length || 0} aberto(s)</span></div>{details.alerts?.length ? details.alerts.map((alert) => <div className="fueling-alert-detail" key={alert.id}><AlertTriangle size={16} /><div><strong>{alert.title} · {alert.severity}</strong><p>{alert.description}</p><small>{dateTime(alert.created_at)}</small></div><button className="fueling-button secondary small" onClick={() => void resolveAlert(alert)}>Resolver com justificativa</button></div>) : <p className="fueling-empty-note">Nenhum alerta em aberto.</p>}</div>
        <div className="fueling-detail-section"><div className="fueling-detail-section-head"><h4>Solicitações de correção</h4><span>{adjustments.filter((item) => item.approval_status === 'PENDENTE').length} pendente(s)</span></div>{adjustments.length ? adjustments.map((adjustment) => <div className="fueling-adjustment-row" key={adjustment.id}><div><strong>{adjustment.reason}</strong><small>{dateTime(adjustment.requested_at)} · {adjustment.approval_status}</small><pre>{JSON.stringify(adjustment.proposed_changes, null, 2)}</pre>{adjustment.decision_notes && <small>{adjustment.decision_notes}</small>}</div>{adjustment.approval_status === 'PENDENTE' && <div><button className="fueling-button primary small" onClick={() => void decideAdjustment(adjustment, 'APROVADA')}>Aprovar</button><button className="fueling-button danger small" onClick={() => void decideAdjustment(adjustment, 'REJEITADA')}>Rejeitar</button></div>}</div>) : <p className="fueling-empty-note">Nenhuma solicitação de retificação.</p>}</div>
        <div className="fueling-detail-section"><div className="fueling-detail-section-head"><h4>Trilha de auditoria</h4><span>{audit.length} evento(s)</span></div>{audit.length ? <div className="fueling-timeline">{audit.map((item) => <div key={item.id}><i /><span><strong>{item.event_type.replaceAll('_',' ')}</strong>{item.field_name ? ` · ${item.field_name}` : ''}<small>{dateTime(item.performed_at)} · {item.actor_type}{item.reason ? ` · ${item.reason}` : ''}</small></span></div>)}</div> : <p className="fueling-empty-note">Nenhum evento adicional registrado.</p>}</div>
        <div className="fueling-detail-actions"><span className={`fueling-chip ${details.status === 'CONFERIDO' ? 'success' : 'warning'}`}>{labels[details.status] || details.status} · {labels[details.review_status] || details.review_status}</span><div><button className="fueling-button secondary" onClick={() => void reviewFueling('EM_ANALISE')}>Em análise</button><button className="fueling-button secondary" onClick={() => void reviewFueling('COM_PENDENCIA')}>Com pendência</button><button className="fueling-button primary" onClick={() => void reviewFueling('CONFERIDO')}>Conferir</button></div></div>
      </>}</section></div>}
  </section>
}
