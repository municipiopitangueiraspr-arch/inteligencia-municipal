import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Clock3, Filter, RotateCcw, Search, ShieldCheck, Store, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { FleetOperationConfirmation, type FleetConfirmationRequest } from './FleetOperationConfirmation'

type RequestItem = { id: string; cnpj: string; razao_social: string; representante_nome: string; representante_documento: string | null; representante_email: string; representante_telefone: string | null; status: string; requested_at: string; review_notes: string | null }
type StationOption = { id: string; cnpj_snapshot: string; status: string; credenciamento_started_at: string | null; credenciamento_ends_at: string | null }
type RequestSortKey = 'requester' | 'company' | 'contact' | 'requested_at' | 'status'
type SortDirection = 'asc' | 'desc'
type CnpjFilter = '' | 'CADASTRADO' | 'NAO_CADASTRADO' | 'INVALIDO' | 'INDISPONIVEL'
type CnpjValidation = 'CADASTRADO' | 'NAO_CADASTRADO' | 'INVALIDO' | 'DUPLICADO' | 'INDISPONIVEL'

function fmt(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
function cnpjKey(value: string | null | undefined) { return (value || '').toUpperCase().replace(/[^A-Z0-9]/g, '') }
function isValidCnpj(value: string | null | undefined) {
  const cnpj = cnpjKey(value)
  if (cnpj.length !== 14 || !/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || /^([A-Z0-9])\1{13}$/.test(cnpj)) return false
  const calculateDigit = (base: string) => {
    const values = [...base].map((character) => character.charCodeAt(0) - 48)
    const weightsFromRight = [2, 3, 4, 5, 6, 7, 8, 9]
    const sum = values.slice().reverse().reduce((total, value, index) => total + value * weightsFromRight[index % weightsFromRight.length], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  const first = calculateDigit(cnpj.slice(0, 12))
  if (first !== Number(cnpj[12])) return false
  const second = calculateDigit(`${cnpj.slice(0, 12)}${first}`)
  return second === Number(cnpj[13])
}
function localDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)
}
function validateRequestCnpj(item: RequestItem, stations: StationOption[], lookupReady: boolean): CnpjValidation {
  if (!lookupReady) return 'INDISPONIVEL'
  if (!isValidCnpj(item.cnpj)) return 'INVALIDO'
  const digits = cnpjKey(item.cnpj)
  const matches = stations.filter((station) => cnpjKey(station.cnpj_snapshot) === digits)
  if (matches.length > 1) return 'DUPLICADO'
  return matches.length === 1 ? 'CADASTRADO' : 'NAO_CADASTRADO'
}

export function StationAccessRequests({ onSaved }: { onSaved: () => Promise<void> }) {
  const [items, setItems] = useState<RequestItem[]>([])
  const [stations, setStations] = useState<StationOption[]>([])
  const [cnpjLookupReady, setCnpjLookupReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<RequestItem | null>(null)
  const [notes, setNotes] = useState('')
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cnpjFilter, setCnpjFilter] = useState<CnpjFilter>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sortKey, setSortKey] = useState<RequestSortKey>('requested_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [confirmation, setConfirmation] = useState<FleetConfirmationRequest | null>(null)

  async function loadAllStations() {
    if (!supabase) return { values: [] as StationOption[], error: false }
    const values: StationOption[] = []
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const result = await supabase.from('fleet_fuel_stations').select('id,cnpj_snapshot,status,credenciamento_started_at,credenciamento_ends_at').order('id').range(offset, offset + pageSize - 1)
      if (result.error) return { values, error: true }
      const rows = (result.data || []) as StationOption[]
      values.push(...rows)
      if (rows.length < pageSize) break
    }
    return { values, error: false }
  }

  async function loadAllRequests() {
    if (!supabase) return { values: [] as RequestItem[], error: false }
    const values: RequestItem[] = []
    const pageSize = 500
    for (let offset = 0; ; offset += pageSize) {
      const result = await supabase.from('fleet_station_access_requests').select('id,cnpj,razao_social,representante_nome,representante_documento,representante_email,representante_telefone,status,requested_at,review_notes').order('requested_at', { ascending: false }).order('id').range(offset, offset + pageSize - 1)
      if (result.error) return { values, error: true }
      const rows = (result.data || []) as RequestItem[]
      values.push(...rows)
      if (rows.length < pageSize) break
    }
    return { values, error: false }
  }

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    setCnpjLookupReady(false)
    try {
      const [requests, stationResult] = await Promise.all([
        loadAllRequests(),
        loadAllStations(),
      ])
      if (requests.error) {
        setItems([])
        setError('Não foi possível carregar as solicitações de primeiro acesso.')
      } else {
        setItems(requests.values)
        if (stationResult.error) {
          setStations([])
          setCnpjLookupReady(false)
          setError('Solicitações carregadas, mas não foi possível validar os CNPJs dos postos. Atualize antes de aprovar.')
        } else {
          setStations(stationResult.values)
          setCnpjLookupReady(true)
        }
      }
    } catch {
      setItems([])
      setStations([])
      setError('Não foi possível carregar os dados. Verifique a conexão e tente novamente.')
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  function matchingStations(item: RequestItem) {
    const digits = cnpjKey(item.cnpj)
    return stations.filter((station) => digits && cnpjKey(station.cnpj_snapshot) === digits)
  }
  function cnpjValidation(item: RequestItem): CnpjValidation {
    if (!cnpjLookupReady) return 'INDISPONIVEL'
    if (!isValidCnpj(item.cnpj)) return 'INVALIDO'
    const matches = matchingStations(item)
    if (matches.length > 1) return 'DUPLICADO'
    return matches.length === 1 ? 'CADASTRADO' : 'NAO_CADASTRADO'
  }
  function cnpjWarningText(item: RequestItem) {
    const result = cnpjValidation(item)
    if (result === 'INDISPONIVEL') return 'Não foi possível validar o CNPJ agora. Atualize os dados antes de decidir.'
    if (result === 'INVALIDO') return 'CNPJ inválido: confira os 12 caracteres iniciais e os dois dígitos verificadores.'
    if (result === 'NAO_CADASTRADO') return 'CNPJ não corresponde a nenhum posto credenciado. Verifique o cadastro antes de aprovar.'
    if (result === 'DUPLICADO') return 'Mais de um posto está cadastrado com este CNPJ. Regularize o cadastro antes de aprovar.'
    return ''
  }
  function selectedStation() {
    if (!selected || cnpjValidation(selected) !== 'CADASTRADO') return null
    return matchingStations(selected)[0] || null
  }

  const filteredItems = useMemo(() => items.filter((item) => {
    const haystack = `${item.representante_nome} ${item.representante_documento || ''} ${item.razao_social} ${item.cnpj} ${item.representante_email} ${item.representante_telefone || ''}`.toLocaleLowerCase('pt-BR')
    const requestDate = localDate(item.requested_at)
    return haystack.includes(query.trim().toLocaleLowerCase('pt-BR'))
      && (!statusFilter || item.status === statusFilter)
      && (!cnpjFilter || validateRequestCnpj(item, stations, cnpjLookupReady) === cnpjFilter)
      && (!dateFrom || requestDate >= dateFrom)
      && (!dateTo || requestDate <= dateTo)
  }), [items, query, statusFilter, cnpjFilter, dateFrom, dateTo, cnpjLookupReady, stations])
  const sortedItems = useMemo(() => [...filteredItems].sort((a, b) => {
    const value = (item: RequestItem) => sortKey === 'requester' ? item.representante_nome
      : sortKey === 'company' ? item.razao_social
        : sortKey === 'contact' ? `${item.representante_email} ${item.representante_telefone || ''}`
          : sortKey === 'status' ? item.status : item.requested_at
    const comparison = sortKey === 'requested_at'
      ? new Date(value(a)).getTime() - new Date(value(b)).getTime()
      : value(a).localeCompare(value(b), 'pt-BR', { numeric: true, sensitivity: 'base' })
    return sortDirection === 'asc' ? comparison : -comparison
  }), [filteredItems, sortKey, sortDirection])
  const activeFilterCount = Number(Boolean(query.trim())) + Number(Boolean(statusFilter)) + Number(Boolean(cnpjFilter)) + Number(Boolean(dateFrom)) + Number(Boolean(dateTo))
  function clearFilters() { setQuery(''); setStatusFilter(''); setCnpjFilter(''); setDateFrom(''); setDateTo('') }
  function toggleSort(key: RequestSortKey) {
    if (sortKey === key) setSortDirection((direction) => direction === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDirection(key === 'requested_at' ? 'desc' : 'asc') }
  }
  function sortHeading(key: RequestSortKey, label: string) {
    const active = sortKey === key
    const Icon = !active ? ArrowUpDown : sortDirection === 'asc' ? ArrowUp : ArrowDown
    return <th aria-sort={active ? sortDirection === 'asc' ? 'ascending' : 'descending' : 'none'}><button type="button" className="fleet-sort-button" onClick={() => toggleSort(key)}>{label}<Icon size={12} /></button></th>
  }
  function openReview(item: RequestItem) {
    setSelected(item)
    setNotes('')
    setError('')
  }
  function askReview(decision: 'APROVAR' | 'NEGAR') {
    if (!selected) return
    const validation = cnpjValidation(selected)
    if (decision === 'APROVAR' && validation !== 'CADASTRADO') { setError(`Aprovação indisponível: ${cnpjWarningText(selected)} Regularize o CNPJ e o cadastro do posto antes de liberar o acesso.`); return }
    const station = selectedStation()
    setConfirmation({
      eyebrow: 'INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS',
      title: decision === 'APROVAR' ? 'Confirmar aprovação do vínculo' : 'Confirmar negativa de acesso',
      message: decision === 'APROVAR'
        ? 'O representante será vinculado ao único posto com CNPJ válido correspondente. Se o posto ainda estiver em análise, o acesso operacional só ficará disponível após a ativação municipal.'
        : 'O pedido de primeiro acesso será negado e a decisão ficará registrada para este solicitante.',
      details: [
        `Solicitante: ${selected.representante_nome}`,
        `Empresa informada: ${selected.razao_social}`,
        `CNPJ informado: ${selected.cnpj}`,
        ...(decision === 'APROVAR' && station ? ['Vínculo automático validado pelo CNPJ do pedido.'] : []),
        ...(notes.trim() ? [`Observação: ${notes.trim()}`] : []),
      ],
      confirmLabel: decision === 'APROVAR' ? 'Aprovar vínculo' : 'Negar pedido',
      tone: decision === 'NEGAR' ? 'danger' : undefined,
      onConfirm: () => review(decision),
    })
  }
  async function review(decision: 'APROVAR' | 'NEGAR'): Promise<string | null> {
    if (!supabase || !selected) return 'O pedido não está mais disponível para análise.'
    if (decision === 'APROVAR' && !selectedStation()) return 'Aprovação indisponível: é necessário um único posto credenciado com CNPJ válido correspondente.'
    setSaving(selected.id)
    setError('')
    const requestId = selected.id
    let result
    try {
      result = await supabase.rpc('fleet_review_station_access_request', { p_request_id: requestId, p_decision: decision, p_station_id: decision === 'APROVAR' ? selectedStation()?.id : null, p_role: 'REPRESENTANTE_LEGAL', p_notes: notes.trim() || null })
    } catch {
      setSaving('')
      return 'Não foi possível concluir a decisão por uma falha de conexão.'
    }
    if (result.error) {
      setSaving('')
      return result.error.message || 'Não foi possível concluir a decisão.'
    }
    let emailFailed = false
    try {
      const emailResult = await supabase.functions.invoke('notify-station-access-request', { body: { request_id: requestId } })
      emailFailed = Boolean(emailResult.error)
    } catch { emailFailed = true }
    setSaving('')
    setSelected(null)
    setNotes('')
    try { await load() } catch { setError('Decisão registrada, mas os dados não puderam ser atualizados. Atualize a tela.') }
    try { await onSaved() } catch { setError('Decisão registrada, mas houve uma falha ao atualizar a tela. Atualize os dados para ver o estado mais recente.') }
    if (emailFailed) setError('Decisão registrada, mas o aviso por e-mail não foi enviado. Configure o segredo GMAIL_APP_PASSWORD no Supabase e tente novamente.')
    return null
  }

  return <section className="fleet-section fleet-page-section">
    <div className="fleet-page-heading"><div><span className="fleet-kicker">CONTROLE DE ACESSO EXTERNO</span><h2>Pedidos de primeiro acesso</h2><p>Lista exclusiva de solicitações recebidas pelo portal do posto.</p></div><button className="fleet-secondary-button" onClick={() => void load()} disabled={loading}><Clock3 size={15} /> Atualizar</button></div>
    {error && <div className="fleet-inline-error" role="alert">{error}</div>}
    <div className="fleet-access-note"><ShieldCheck size={16} /><span>Esta lista mostra apenas solicitações de acesso. Os postos credenciados são consultados somente para validar o CNPJ e vincular uma aprovação; a decisão do Gestor sempre exige confirmação.</span></div>
    <section className="fleet-vehicle-filters access-request-filters"><div className="fleet-vehicle-filter-heading"><div><Filter size={15} /><strong>Filtros de solicitações</strong><span>{filteredItems.length} resultado(s) · {activeFilterCount} filtro(s) ativo(s)</span></div><button type="button" onClick={clearFilters} disabled={!activeFilterCount}><RotateCcw size={12} /> Limpar</button></div>
      <div className="fleet-vehicle-filter-grid access-request-filter-grid"><label className="fleet-vehicle-search"><span>Solicitante, empresa, CNPJ ou contato</span><div><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar solicitação…" /></div></label>
        <label>Situação<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Todas</option><option value="PENDENTE">Pendente</option><option value="APROVADO">Aprovado</option><option value="NEGADO">Negado</option></select></label>
        <label>Validação do CNPJ<select value={cnpjFilter} onChange={(event) => setCnpjFilter(event.target.value as CnpjFilter)}><option value="">Todas</option><option value="CADASTRADO">Válido e cadastrado</option><option value="NAO_CADASTRADO">Sem posto correspondente</option><option value="INVALIDO">CNPJ inválido</option><option value="DUPLICADO">CNPJ duplicado no cadastro</option><option value="INDISPONIVEL">Validação indisponível</option></select></label>
        <label>Solicitado a partir de<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
        <label>Solicitado até<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
      </div>
    </section>
    <div className="fleet-table-panel">{loading ? <div className="fleet-loading">Carregando solicitações…</div> : filteredItems.length ? <table className="fleet-table fleet-access-table"><thead><tr>{sortHeading('requester', 'Solicitante')}{sortHeading('company', 'Empresa / CNPJ')}{sortHeading('contact', 'Contato')}{sortHeading('requested_at', 'Solicitado em')}{sortHeading('status', 'Status')}<th>Ação</th></tr></thead><tbody>{sortedItems.map((item) => {
      const cnpjState = cnpjValidation(item)
      return <tr key={item.id}>
        <td><strong>{item.representante_nome}</strong><small>{item.representante_documento || 'Documento não informado'}</small></td>
        <td><strong>{item.razao_social}</strong><small>CNPJ: {item.cnpj}</small>{cnpjState !== 'CADASTRADO' && <div className="fleet-station-cnpj-warning" role={cnpjState === 'INDISPONIVEL' ? 'status' : 'alert'}><AlertTriangle size={13} /><span>{cnpjWarningText(item)}</span></div>}</td>
        <td><small>{item.representante_email}</small><small>{item.representante_telefone || 'Telefone não informado'}</small></td>
        <td>{fmt(item.requested_at)}</td>
        <td><span className={`fleet-status ${item.status === 'APROVADO' ? 'success' : item.status === 'NEGADO' ? 'danger' : 'warning'}`}>{item.status}</span></td>
        <td>{item.status === 'PENDENTE' ? <button className="fleet-primary-button fleet-access-action" onClick={() => openReview(item)}>Analisar</button> : <span className="fleet-access-reviewed">Revisado</span>}</td>
      </tr>
    })}</tbody></table> : <div className="fleet-empty"><span><Store size={24} /></span><strong>{activeFilterCount ? 'Nenhuma solicitação corresponde aos filtros' : 'Nenhuma solicitação encontrada'}</strong><p>{activeFilterCount ? 'Ajuste os critérios ou limpe os filtros.' : 'Os pedidos recebidos pelo portal do posto aparecerão aqui.'}</p>{activeFilterCount && <button className="fleet-secondary-button" onClick={clearFilters}><RotateCcw size={14} /> Limpar filtros</button>}</div>}</div>
    {selected && <div className="fleet-modal-backdrop" role="presentation"><section className="fleet-modal fleet-access-modal"><div className="fleet-modal-heading"><div><span className="fleet-kicker">ANÁLISE DO GESTOR</span><h2>Solicitação de primeiro acesso</h2></div><button className="fleet-close" onClick={() => setSelected(null)} aria-label="Fechar"><XCircle size={19} /></button></div>
      <div className="fleet-access-request-card"><strong>{selected.representante_nome}</strong><span>{selected.representante_email}</span><span>{selected.razao_social} · CNPJ {selected.cnpj}</span></div>
      {cnpjValidation(selected) === 'CADASTRADO' ? <div className="fleet-access-match-note"><CheckCircle2 size={16} /><span>O CNPJ válido do pedido corresponde a um único cadastro. A aprovação será vinculada automaticamente.</span></div> : <div className="fleet-station-cnpj-warning fleet-station-cnpj-warning--large" role={cnpjValidation(selected) === 'INDISPONIVEL' ? 'status' : 'alert'}><AlertTriangle size={16} /><span><strong>Validação do CNPJ requer atenção.</strong> {cnpjWarningText(selected)} Para aprovar, regularize o CNPJ e o cadastro do posto e atualize os dados.</span></div>}
      <label>Observação da decisão<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Informe uma justificativa ou orientação para o solicitante." /></label>
      <div className="fleet-modal-actions"><button className="fleet-secondary-button" onClick={() => askReview('NEGAR')} disabled={Boolean(saving)}><XCircle size={15} /> Negar acesso</button><button className="fleet-primary-button" onClick={() => askReview('APROVAR')} disabled={Boolean(saving)}><CheckCircle2 size={15} /> Aprovar e liberar</button></div>
    </section></div>}
    {confirmation && <FleetOperationConfirmation request={confirmation} onClose={() => setConfirmation(null)} />}
  </section>
}
