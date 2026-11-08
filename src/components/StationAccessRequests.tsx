import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown, CheckCircle2, Clock3, ShieldCheck, Store, XCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { FleetOperationConfirmation, type FleetConfirmationRequest } from './FleetOperationConfirmation'

type RequestItem = { id: string; cnpj: string; razao_social: string; representante_nome: string; representante_documento: string | null; representante_email: string; representante_telefone: string | null; status: string; requested_at: string; review_notes: string | null }
type StationOption = { id: string; cnpj_snapshot: string; nome_fantasia_snapshot: string | null; razao_social_snapshot: string }
type RequestSortKey = 'requester' | 'company' | 'contact' | 'requested_at' | 'status'
type SortDirection = 'asc' | 'desc'

function fmt(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) }
function cnpjDigits(value: string | null | undefined) { return (value || '').replace(/\D/g, '') }

export function StationAccessRequests({ onSaved }: { onSaved: () => Promise<void> }) {
  const [items, setItems] = useState<RequestItem[]>([])
  const [stations, setStations] = useState<StationOption[]>([])
  const [registeredCnpjs, setRegisteredCnpjs] = useState<string[]>([])
  const [cnpjLookupReady, setCnpjLookupReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<RequestItem | null>(null)
  const [stationId, setStationId] = useState('')
  const [notes, setNotes] = useState('')
  const [sortKey, setSortKey] = useState<RequestSortKey>('requested_at')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [confirmation, setConfirmation] = useState<FleetConfirmationRequest | null>(null)

  async function loadAllStationCnpjs() {
    if (!supabase) return { values: [] as string[], error: false }
    const values: string[] = []
    const pageSize = 1000
    for (let offset = 0; ; offset += pageSize) {
      const result = await supabase.from('fleet_fuel_stations').select('cnpj_snapshot').range(offset, offset + pageSize - 1)
      if (result.error) return { values, error: true }
      const rows = result.data || []
      values.push(...rows.map((row) => cnpjDigits(row.cnpj_snapshot)).filter(Boolean))
      if (rows.length < pageSize) break
    }
    return { values: [...new Set(values)], error: false }
  }

  async function load() {
    if (!supabase) return
    setLoading(true)
    setError('')
    const [requests, stationResult, cnpjResult] = await Promise.all([
      supabase.from('fleet_station_access_requests').select('id,cnpj,razao_social,representante_nome,representante_documento,representante_email,representante_telefone,status,requested_at,review_notes').order('requested_at', { ascending: false }).limit(100),
      supabase.from('fleet_fuel_stations').select('id,cnpj_snapshot,nome_fantasia_snapshot,razao_social_snapshot').order('nome_fantasia_snapshot').limit(100),
      loadAllStationCnpjs(),
    ])
    if (requests.error || stationResult.error) setError('Não foi possível carregar as solicitações de primeiro acesso.')
    else {
      setItems((requests.data || []) as RequestItem[])
      setStations((stationResult.data || []) as StationOption[])
      setCnpjLookupReady(!cnpjResult.error)
      setRegisteredCnpjs(cnpjResult.error ? [] : cnpjResult.values)
      if (cnpjResult.error) setError('Solicitações carregadas, mas não foi possível comparar os CNPJs com o cadastro. Atualize antes de decidir.')
    }
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  const sortedItems = useMemo(() => [...items].sort((a, b) => {
    const value = (item: RequestItem) => sortKey === 'requester' ? item.representante_nome
      : sortKey === 'company' ? item.razao_social
        : sortKey === 'contact' ? `${item.representante_email} ${item.representante_telefone || ''}`
          : sortKey === 'status' ? item.status : item.requested_at
    const comparison = sortKey === 'requested_at'
      ? new Date(value(a)).getTime() - new Date(value(b)).getTime()
      : value(a).localeCompare(value(b), 'pt-BR', { numeric: true, sensitivity: 'base' })
    return sortDirection === 'asc' ? comparison : -comparison
  }), [items, sortKey, sortDirection])

  function requestHasRegisteredCnpj(item: RequestItem) {
    const digits = cnpjDigits(item.cnpj)
    return cnpjLookupReady && Boolean(digits) && registeredCnpjs.includes(digits)
  }
  function selectedStation() { return stations.find((station) => station.id === stationId) || null }
  function selectedCnpjMismatch() {
    const station = selectedStation()
    return Boolean(station && cnpjDigits(station.cnpj_snapshot) !== cnpjDigits(selected?.cnpj))
  }
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
    const match = stations.find((station) => cnpjDigits(station.cnpj_snapshot) === cnpjDigits(item.cnpj))
    setStationId(match?.id || '')
    setNotes('')
    setError('')
  }
  function askReview(decision: 'APROVAR' | 'NEGAR') {
    if (!selected) return
    if (decision === 'APROVAR' && !stationId) { setError('Selecione o posto que será vinculado ao representante.'); return }
    const station = selectedStation()
    const mismatch = decision === 'APROVAR' && selectedCnpjMismatch()
    setConfirmation({
      eyebrow: 'INTELIGÊNCIA MUNICIPAL · GESTÃO DE FROTAS',
      title: decision === 'APROVAR' ? mismatch ? 'Aprovar com CNPJ divergente?' : 'Confirmar liberação de acesso' : 'Confirmar negativa de acesso',
      message: decision === 'APROVAR'
        ? mismatch ? 'O CNPJ informado no pedido não corresponde ao posto selecionado. Confira a documentação cadastral antes de liberar o vínculo.' : 'O representante será vinculado ao posto selecionado e receberá acesso ao portal.'
        : 'O pedido de primeiro acesso será negado e a decisão ficará registrada para este solicitante.',
      details: [
        `Solicitante: ${selected.representante_nome}`,
        `Empresa informada: ${selected.razao_social}`,
        `CNPJ informado: ${selected.cnpj}`,
        ...(decision === 'APROVAR' && station ? [`Posto selecionado: ${station.nome_fantasia_snapshot || station.razao_social_snapshot}`, `CNPJ cadastrado: ${station.cnpj_snapshot}`] : []),
        ...(notes.trim() ? [`Observação: ${notes.trim()}`] : []),
      ],
      confirmLabel: decision === 'APROVAR' ? mismatch ? 'Aprovar apesar da divergência' : 'Aprovar e liberar' : 'Negar pedido',
      tone: decision === 'NEGAR' || mismatch ? 'danger' : undefined,
      onConfirm: () => review(decision),
    })
  }
  async function review(decision: 'APROVAR' | 'NEGAR'): Promise<string | null> {
    if (!supabase || !selected) return 'O pedido não está mais disponível para análise.'
    if (decision === 'APROVAR' && !stationId) return 'Selecione o posto que será vinculado ao representante.'
    setSaving(selected.id)
    setError('')
    const requestId = selected.id
    let result
    try {
      result = await supabase.rpc('fleet_review_station_access_request', { p_request_id: requestId, p_decision: decision, p_station_id: decision === 'APROVAR' ? stationId : null, p_role: 'REPRESENTANTE_LEGAL', p_notes: notes.trim() || null })
    } catch {
      setSaving('')
      return 'Não foi possível concluir a decisão por uma falha de conexão.'
    }
    if (result.error) {
      setSaving('')
      return result.error.message || 'Não foi possível concluir a decisão.'
    }
    const notificationType = decision === 'APROVAR' ? 'ACESSO_LIBERADO' : 'PRIMEIRO_ACESSO_NEGADO'
    let emailFailed = false
    try {
      const emailResult = await supabase.functions.invoke('notify-station-access-request', { body: { request_id: requestId, notification_type: notificationType } })
      emailFailed = Boolean(emailResult.error)
    } catch { emailFailed = true }
    setSaving('')
    setSelected(null)
    setStationId('')
    setNotes('')
    try { await load() } catch { setError('Decisão registrada, mas os dados não puderam ser atualizados. Atualize a tela.') }
    try { await onSaved() } catch { setError('Decisão registrada, mas houve uma falha ao atualizar a tela. Atualize os dados para ver o estado mais recente.') }
    if (emailFailed) setError('Decisão registrada, mas o aviso por e-mail não foi enviado. Configure o segredo GMAIL_APP_PASSWORD no Supabase e tente novamente.')
    return null
  }

  return <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">CONTROLE DE ACESSO EXTERNO</span><h2>Primeiro acesso de postos</h2><p>Analise solicitações de representantes legais e libere o vínculo ao estabelecimento correto.</p></div><button className="fleet-secondary-button" onClick={() => void load()} disabled={loading}><Clock3 size={15} /> Atualizar</button></div>
    {error && <div className="fleet-inline-error" role="alert">{error}</div>}
    <div className="fleet-access-note"><ShieldCheck size={16} /><span>A aprovação não expõe dados de outros postos. Ela cria o usuário institucional e o vínculo do representante somente após a decisão do Gestor.</span></div>
    <div className="fleet-table-panel">{loading ? <div className="fleet-loading">Carregando solicitações…</div> : items.length ? <table className="fleet-table fleet-access-table"><thead><tr>{sortHeading('requester', 'Solicitante')}{sortHeading('company', 'Empresa / CNPJ')}{sortHeading('contact', 'Contato')}{sortHeading('requested_at', 'Solicitado em')}{sortHeading('status', 'Status')}<th>Ação</th></tr></thead><tbody>{sortedItems.map((item) => {
      const cnpjKnown = requestHasRegisteredCnpj(item)
      return <tr key={item.id}>
        <td><strong>{item.representante_nome}</strong><small>{item.representante_documento || 'Documento não informado'}</small></td>
        <td><strong>{item.razao_social}</strong><small>CNPJ: {item.cnpj}</small>{!cnpjLookupReady ? <div className="fleet-station-cnpj-warning" role="status"><AlertTriangle size={13} /><span>Não foi possível validar este CNPJ agora. Atualize os dados antes de decidir.</span></div> : !cnpjKnown && <div className="fleet-station-cnpj-warning" role="alert"><AlertTriangle size={13} /><span>CNPJ do pedido não localizado entre os postos cadastrados. Verifique antes de aprovar.</span></div>}</td>
        <td><small>{item.representante_email}</small><small>{item.representante_telefone || 'Telefone não informado'}</small></td>
        <td>{fmt(item.requested_at)}</td>
        <td><span className={`fleet-status ${item.status === 'APROVADO' ? 'success' : item.status === 'NEGADO' ? 'danger' : 'warning'}`}>{item.status}</span></td>
        <td>{item.status === 'PENDENTE' ? <button className="fleet-primary-button fleet-access-action" onClick={() => openReview(item)}>Analisar</button> : <span className="fleet-access-reviewed">Revisado</span>}</td>
      </tr>
    })}</tbody></table> : <div className="fleet-empty"><span><Store size={24} /></span><strong>Nenhuma solicitação pendente</strong><p>Os pedidos públicos de primeiro acesso aparecerão nesta área.</p></div>}</div>
    {selected && <div className="fleet-modal-backdrop" role="presentation"><section className="fleet-modal fleet-access-modal"><div className="fleet-modal-heading"><div><span className="fleet-kicker">ANÁLISE DO GESTOR</span><h2>Solicitação de primeiro acesso</h2></div><button className="fleet-close" onClick={() => setSelected(null)} aria-label="Fechar"><XCircle size={19} /></button></div>
      <div className="fleet-access-request-card"><strong>{selected.representante_nome}</strong><span>{selected.representante_email}</span><span>{selected.razao_social} · CNPJ {selected.cnpj}</span></div>
      {!cnpjLookupReady ? <div className="fleet-station-cnpj-warning fleet-station-cnpj-warning--large" role="status"><AlertTriangle size={16} /><span><strong>Validação de CNPJ indisponível.</strong> Atualize os dados antes de decidir.</span></div> : !requestHasRegisteredCnpj(selected) && <div className="fleet-station-cnpj-warning fleet-station-cnpj-warning--large" role="alert"><AlertTriangle size={16} /><span><strong>CNPJ não localizado no cadastro de postos.</strong> Confira a documentação e o CNPJ do estabelecimento antes de vincular este representante.</span></div>}
      <label>Vincular ao posto<select value={stationId} onChange={(event) => setStationId(event.target.value)}><option value="">Selecione o posto credenciado</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.nome_fantasia_snapshot || station.razao_social_snapshot} · CNPJ {station.cnpj_snapshot}</option>)}</select></label>
      {selectedCnpjMismatch() && selectedStation() && <div className="fleet-station-cnpj-warning fleet-station-cnpj-warning--large" role="alert"><AlertTriangle size={16} /><span><strong>Divergência de CNPJ entre pedido e posto selecionado.</strong> Pedido: {selected.cnpj} · Cadastro: {selectedStation()?.cnpj_snapshot}. A aprovação continuará disponível, mas confirme os documentos antes de prosseguir.</span></div>}
      <label>Observação da decisão<textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Informe uma justificativa ou orientação para o solicitante." /></label>
      <div className="fleet-modal-actions"><button className="fleet-secondary-button" onClick={() => askReview('NEGAR')} disabled={Boolean(saving)}><XCircle size={15} /> Negar acesso</button><button className="fleet-primary-button" onClick={() => askReview('APROVAR')} disabled={Boolean(saving)}><CheckCircle2 size={15} /> Aprovar e liberar</button></div>
    </section></div>}
    {confirmation && <FleetOperationConfirmation request={confirmation} onClose={() => setConfirmation(null)} />}
  </section>
}
