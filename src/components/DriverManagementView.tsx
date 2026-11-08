import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BadgeCheck, ChevronLeft, ChevronRight, History, Pencil, Plus, Search, ShieldCheck, UserRound, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatMunicipalDate, formatMunicipalDateTime, municipalTodayDate } from '../lib/municipalTime'
import './DriverManagementView.css'

type DriverRow = {
  id: string
  nome: string
  matricula: string | null
  cpf_masked: string | null
  cnh_masked: string | null
  cnh_category: string | null
  cnh_valid_until: string | null
  unidade_id: string | null
  unidade_nome: string | null
  ativo: boolean
  authorization_count: number
  total_count: number
}
type DriverRecord = {
  id: string
  nome: string
  matricula: string | null
  cpf: string | null
  telefone: string | null
  cnh_number: string | null
  cnh_category: string | null
  cnh_valid_until: string | null
  unidade_id: string | null
  ativo: boolean
}
type Summary = { total_count: number; active_count: number; inactive_count: number; cnh_expired_count: number; cnh_expires_60_days_count: number; cnh_without_validity_count: number }
type Unit = { id: string; nome: string; sigla?: string | null; ativo?: boolean }
type Authorization = { id: string; vehicle_id: string; valid_from: string; valid_until: string | null; status: string; reason: string | null; created_by: number | null; created_at: string; ended_at: string | null; ended_by: number | null; ended_reason: string | null }
type DriverAudit = { id: string; event_type: string; changed_fields: string[] | null; reason: string | null; actor_id: number | null; performed_at: string }
type Vehicle = { id: string; placa: string; marca: string | null; modelo: string | null }
type DriverForm = { nome: string; matricula: string; cpf: string; telefone: string; cnh_number: string; cnh_category: string; cnh_valid_until: string; unidade_id: string; ativo: boolean; reason: string }

const pageSize = 50
const cnhCategories = ['ACC', 'A', 'B', 'C', 'D', 'E', 'AB', 'AC', 'AD', 'AE']
const emptyForm = (): DriverForm => ({ nome: '', matricula: '', cpf: '', telefone: '', cnh_number: '', cnh_category: '', cnh_valid_until: '', unidade_id: '', ativo: true, reason: '' })
const dateLabel = (value?: string | null) => formatMunicipalDate(value)
const dateTimeLabel = (value?: string | null) => formatMunicipalDateTime(value)

export function DriversView({ onSaved }: { onSaved?: () => Promise<void> | void }) {
  const [rows, setRows] = useState<DriverRow[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [summary, setSummary] = useState<Summary>({ total_count: 0, active_count: 0, inactive_count: 0, cnh_expired_count: 0, cnh_expires_60_days_count: 0, cnh_without_validity_count: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [cnhStatus, setCnhStatus] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [canManage, setCanManage] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<DriverForm>(emptyForm())
  const [formError, setFormError] = useState('')
  const [historyDriver, setHistoryDriver] = useState<DriverRow | null>(null)
  const [authorizations, setAuthorizations] = useState<Authorization[]>([])
  const [audits, setAudits] = useState<DriverAudit[]>([])
  const [vehicles, setVehicles] = useState<Map<string, Vehicle>>(new Map())
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const requestId = useRef(0)

  const loadSummary = useCallback(async () => {
    if (!supabase) return
    const { data, error: resultError } = await supabase.rpc('fleet_driver_summary')
    if (!resultError && data) {
      const result = (Array.isArray(data) ? data[0] : data) as Partial<Summary> | null
      if (result) setSummary({ total_count: Number(result.total_count || 0), active_count: Number(result.active_count || 0), inactive_count: Number(result.inactive_count || 0), cnh_expired_count: Number(result.cnh_expired_count || 0), cnh_expires_60_days_count: Number(result.cnh_expires_60_days_count || 0), cnh_without_validity_count: Number(result.cnh_without_validity_count || 0) })
    }
  }, [])

  const loadRows = useCallback(async () => {
    if (!supabase) { setError('O serviço de dados está indisponível.'); setLoading(false); return }
    const request = ++requestId.current
    setLoading(true); setError('')
    const { data, error: queryError } = await supabase.rpc('fleet_search_drivers', {
      p_search: search.trim() || null,
      p_status: status || null,
      p_cnh_status: cnhStatus || null,
      p_page: page,
      p_page_size: pageSize,
    })
    if (request !== requestId.current) return
    if (queryError) {
      setError('Não foi possível consultar motoristas. Verifique sua permissão e tente novamente.')
      setRows([]); setTotal(0)
    } else {
      const result = (data || []) as DriverRow[]
      setRows(result)
      setTotal(Number(result[0]?.total_count || 0))
    }
    setLoading(false)
  }, [search, status, cnhStatus, page])

  useEffect(() => {
    if (!supabase) return
    void Promise.all([
      supabase.rpc('fleet_is_manager').then(({ data }) => setCanManage(Boolean(data))),
      supabase.from('unidades_organizacionais').select('id,nome,sigla,ativo').order('nome').limit(500).then(({ data }) => setUnits((data || []) as Unit[])),
      loadSummary(),
    ])
  }, [loadSummary])
  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRows() }, search.trim() ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [loadRows, search])

  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const openNew = () => { setEditingId(null); setForm(emptyForm()); setFormError(''); setShowForm(true) }
  const openEdit = async (row: DriverRow) => {
    if (!supabase) return
    setFormError(''); setError('')
    const { data, error: detailError } = await supabase.rpc('fleet_get_driver', { p_driver_id: row.id })
    if (detailError || !data) { setError('Não foi possível abrir os dados completos do motorista.'); return }
    const record = (Array.isArray(data) ? data[0] : data) as DriverRecord
    if (!record) { setError('O cadastro não foi encontrado.'); return }
    setEditingId(record.id)
    setForm({ nome: record.nome || '', matricula: record.matricula || '', cpf: record.cpf || '', telefone: record.telefone || '', cnh_number: record.cnh_number || '', cnh_category: record.cnh_category || '', cnh_valid_until: record.cnh_valid_until || '', unidade_id: record.unidade_id || '', ativo: Boolean(record.ativo), reason: '' })
    setShowForm(true)
  }
  const updateForm = <K extends keyof DriverForm>(key: K, value: DriverForm[K]) => { setForm((current) => ({ ...current, [key]: value })); setFormError('') }

  async function saveDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || saving || !canManage) return
    const cpfDigits = form.cpf.replace(/\D/g, '')
    const cnhDigits = form.cnh_number.replace(/\D/g, '')
    const phoneDigits = form.telefone.replace(/\D/g, '')
    if (cpfDigits && cpfDigits.length !== 11) { setFormError('O CPF deve conter 11 dígitos.'); return }
    if (cnhDigits && cnhDigits.length !== 11) { setFormError('O número da CNH deve conter 11 dígitos.'); return }
    if (form.ativo && !cnhDigits) { setFormError('Motoristas ativos devem possuir número de CNH cadastrado.'); return }
    if (phoneDigits && (phoneDigits.length < 10 || phoneDigits.length > 13)) { setFormError('Informe um telefone com DDD, contendo de 10 a 13 dígitos.'); return }
    if (form.reason.trim().length < 5) { setFormError(editingId ? 'Informe o motivo da alteração (mínimo 5 caracteres).' : 'Informe o motivo do cadastro (mínimo 5 caracteres).'); return }
    if (editingId && !form.ativo && rows.find((row) => row.id === editingId)?.ativo && !window.confirm('Inativar este motorista? O histórico e os abastecimentos permanecerão preservados, mas novas operações serão bloqueadas.')) return
    setSaving(true); setFormError('')
    const { error: saveError } = await supabase.rpc('fleet_save_driver', {
      p_driver_id: editingId,
      p_nome: form.nome.trim(),
      p_matricula: form.matricula.trim() || null,
      p_cpf: cpfDigits || null,
      p_telefone: phoneDigits || null,
      p_cnh_number: cnhDigits || null,
      p_cnh_category: form.cnh_category || null,
      p_cnh_valid_until: form.cnh_valid_until || null,
      p_unidade_id: form.unidade_id || null,
      p_ativo: form.ativo,
      p_reason: form.reason.trim() || null,
    })
    setSaving(false)
    if (saveError) {
      const message = `${saveError.message || ''} ${saveError.details || ''}`.toLocaleLowerCase('pt-BR')
      setFormError(message.includes('cpf') ? 'CPF inválido ou já cadastrado entre motoristas ativos.' : message.includes('cnh') ? 'Confira o número e a validade da CNH.' : message.includes('23505') || message.includes('duplicate') ? 'CPF ou matrícula já está vinculado a outro motorista ativo.' : message.includes('unidade') ? 'A unidade selecionada não pertence ao município atual.' : saveError.message || 'Não foi possível salvar o motorista.')
      return
    }
    setShowForm(false); setEditingId(null); setForm(emptyForm()); setNotice(editingId ? 'Cadastro atualizado e alterações auditadas.' : 'Motorista cadastrado.')
    setPage(0); await loadSummary(); if (page === 0) await loadRows(); await onSaved?.()
  }

  async function openHistory(row: DriverRow) {
    if (!supabase) return
    setHistoryDriver(row); setHistoryLoading(true); setHistoryError(''); setAuthorizations([]); setAudits([]); setVehicles(new Map())
    const [authResult, auditResult] = await Promise.all([
      supabase.from('fleet_vehicle_driver_authorizations').select('id,vehicle_id,valid_from,valid_until,status,reason,created_by,created_at,ended_at,ended_by,ended_reason').eq('driver_id', row.id).order('created_at', { ascending: false }).limit(200),
      supabase.from('fleet_driver_history').select('id,event_type,changed_fields,reason,actor_id,performed_at').eq('driver_id', row.id).order('performed_at', { ascending: false }).limit(100),
    ])
    if (authResult.error || auditResult.error) setHistoryError('Não foi possível carregar todo o histórico. Tente atualizar ou verifique o acesso.')
    const authRows = (authResult.data || []) as Authorization[]
    setAuthorizations(authRows); setAudits((auditResult.data || []) as DriverAudit[])
    const vehicleIds = [...new Set(authRows.map((item) => item.vehicle_id))]
    if (vehicleIds.length) {
      const { data, error: vehicleError } = await supabase.from('fleet_vehicles').select('id,placa,marca,modelo').in('id', vehicleIds).limit(200)
      if (vehicleError) setHistoryError('As autorizações carregaram, mas os dados dos veículos não puderam ser consultados.')
      setVehicles(new Map(((data || []) as Vehicle[]).map((vehicle) => [vehicle.id, vehicle])))
    }
    setHistoryLoading(false)
  }

  return <section className="fleet-section fleet-page-section drivers-view">
    <div className="drivers-heading"><div><span className="fleet-kicker">CADASTRO FUNCIONAL</span><h2>Motoristas</h2><p>Identificação, habilitação, situação funcional e autorizações históricas de condução.</p></div>{canManage && <button className="fleet-primary-button" onClick={openNew}><Plus size={15}/> Novo motorista</button>}</div>
    {notice && <div className="drivers-message success" role="status"><BadgeCheck size={15}/>{notice}<button onClick={() => setNotice('')} aria-label="Fechar"><X size={14}/></button></div>}
    {error && <div className="drivers-message error" role="alert">{error}<button onClick={() => setError('')} aria-label="Fechar"><X size={14}/></button></div>}
    <div className="drivers-summary">
      <div><small>Total</small><strong>{summary.total_count.toLocaleString('pt-BR')}</strong></div><div><small>Ativos</small><strong>{summary.active_count.toLocaleString('pt-BR')}</strong></div><div><small>Inativos</small><strong>{summary.inactive_count.toLocaleString('pt-BR')}</strong></div><div className="attention"><small>CNH vencida</small><strong>{summary.cnh_expired_count.toLocaleString('pt-BR')}</strong></div><div className="attention"><small>Vence em até 60 dias</small><strong>{summary.cnh_expires_60_days_count.toLocaleString('pt-BR')}</strong></div><div><small>Sem validade</small><strong>{summary.cnh_without_validity_count.toLocaleString('pt-BR')}</strong></div>
    </div>
    <div className="drivers-filter-panel">
      <label className="drivers-search"><span>Pesquisar</span><div><Search size={15}/><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0) }} placeholder="Nome, matrícula, CPF ou CNH" /></div></label>
      <label>Situação<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0) }}><option value="">Todas</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label>
      <label>Validade da CNH<select value={cnhStatus} onChange={(event) => { setCnhStatus(event.target.value); setPage(0) }}><option value="">Todas</option><option value="VALIDA">Válida</option><option value="VENCIDA">Vencida</option><option value="VENCE_EM_60_DIAS">Vence em até 60 dias</option><option value="SEM_VALIDADE">Sem validade</option></select></label>
      <span className="drivers-result-count">{loading ? 'Consultando…' : `${total.toLocaleString('pt-BR')} motorista(s)`}</span>
    </div>
    <div className="drivers-table-wrap"><table className="drivers-table"><thead><tr><th>Motorista</th><th>Matrícula</th><th>CPF</th><th>CNH / categoria</th><th>Validade</th><th>Unidade</th><th>Situação</th><th>Ações</th></tr></thead><tbody>
      {loading ? <tr><td colSpan={8} className="drivers-empty">Carregando motoristas…</td></tr> : rows.length ? rows.map((row) => <tr key={row.id}><td><strong>{row.nome}</strong><small>{row.authorization_count.toLocaleString('pt-BR')} autorização(ões) registrada(s)</small></td><td>{row.matricula || '—'}</td><td>{row.cpf_masked || '—'}</td><td>{row.cnh_masked || '—'}{row.cnh_category && <small>Categoria {row.cnh_category}</small>}</td><td><span className={row.cnh_valid_until && row.cnh_valid_until < municipalTodayDate() ? 'drivers-expired' : ''}>{dateLabel(row.cnh_valid_until)}</span></td><td>{row.unidade_nome || '—'}</td><td><span className={`drivers-status ${row.ativo ? 'active' : 'inactive'}`}>{row.ativo ? 'Ativo' : 'Inativo'}</span></td><td><div className="drivers-actions"><button className="fleet-row-action" aria-label={`Histórico de ${row.nome}`} onClick={() => void openHistory(row)}><History size={15}/></button>{canManage && <button className="fleet-row-action" aria-label={`Editar ${row.nome}`} onClick={() => void openEdit(row)}><Pencil size={15}/></button>}</div></td></tr>) : <tr><td colSpan={8} className="drivers-empty">{total ? 'Nenhum motorista corresponde aos filtros.' : 'Nenhum motorista cadastrado.'}</td></tr>}
    </tbody></table></div>
    <div className="drivers-pagination"><span>Página {page + 1} de {pageCount} · {rows.length} exibido(s)</span><div><button className="fleet-secondary-button" disabled={page <= 0 || loading} onClick={() => setPage((current) => Math.max(0, current - 1))}><ChevronLeft size={15}/> Anterior</button><button className="fleet-secondary-button" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}>Próxima <ChevronRight size={15}/></button></div></div>

    {showForm && <div className="fleet-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setShowForm(false) }}><form className="fleet-modal drivers-form-modal" onSubmit={(event) => void saveDriver(event)}><div className="fleet-modal-heading"><div><span className="fleet-kicker">CADASTRO MUNICIPAL</span><h2>{editingId ? 'Editar motorista' : 'Novo motorista'}</h2></div><button type="button" className="fleet-close" onClick={() => setShowForm(false)} aria-label="Fechar"><X size={18}/></button></div><p className="drivers-form-note"><ShieldCheck size={15}/> CPF e CNH completos ficam restritos ao formulário autorizado; a listagem apresenta somente dados mascarados.</p>
      <div className="drivers-form-grid"><label className="drivers-wide">Nome completo *<input required maxLength={180} value={form.nome} onChange={(event) => updateForm('nome', event.target.value)} autoFocus/></label><label>Matrícula funcional<input maxLength={60} value={form.matricula} onChange={(event) => updateForm('matricula', event.target.value)}/></label><label>Unidade / secretaria<select value={form.unidade_id} onChange={(event) => updateForm('unidade_id', event.target.value)}><option value="">Não informada</option>{units.filter((unit) => unit.ativo !== false || unit.id === form.unidade_id).map((unit) => <option key={unit.id} value={unit.id}>{unit.nome}{unit.sigla ? ` (${unit.sigla})` : ''}</option>)}</select></label><label>CPF<input inputMode="numeric" autoComplete="off" maxLength={14} value={form.cpf} onChange={(event) => updateForm('cpf', event.target.value)} placeholder="Opcional"/></label><label>Telefone<input type="tel" autoComplete="tel" maxLength={20} value={form.telefone} onChange={(event) => updateForm('telefone', event.target.value)} placeholder="(00) 00000-0000"/></label><label>Número da CNH{form.ativo ? ' *' : ''}<input required={form.ativo} inputMode="numeric" autoComplete="off" maxLength={14} value={form.cnh_number} onChange={(event) => updateForm('cnh_number', event.target.value)} placeholder="11 dígitos"/></label><label>Categoria da CNH<select value={form.cnh_category} onChange={(event) => updateForm('cnh_category', event.target.value)}><option value="">Não informada</option>{cnhCategories.map((category) => <option key={category} value={category}>{category}</option>)}</select></label><label>Validade da CNH<input type="date" value={form.cnh_valid_until} onChange={(event) => updateForm('cnh_valid_until', event.target.value)}/></label><label>Situação<select value={form.ativo ? 'true' : 'false'} onChange={(event) => updateForm('ativo', event.target.value === 'true')}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>{!editingId && <label className="drivers-wide">Motivo do cadastro *<textarea required minLength={5} rows={2} value={form.reason} onChange={(event) => updateForm('reason', event.target.value)} placeholder="Informe a finalidade do cadastro"/></label>}{editingId && <label className="drivers-wide">Motivo da alteração *<textarea required minLength={5} rows={2} value={form.reason} onChange={(event) => updateForm('reason', event.target.value)} placeholder="Descreva por que os dados foram alterados"/></label>}</div>
      {formError && <p className="drivers-inline-error" role="alert">{formError}</p>}<div className="fleet-modal-actions"><button type="button" className="fleet-secondary-button" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</button><button type="submit" className="fleet-primary-button" disabled={saving}>{saving ? 'Salvando…' : editingId ? 'Salvar alterações' : 'Cadastrar motorista'}</button></div>
    </form></div>}

    {historyDriver && <div className="fleet-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setHistoryDriver(null) }}><section className="fleet-modal drivers-history-modal"><div className="fleet-modal-heading"><div><span className="fleet-kicker">TRILHA DE AUDITORIA</span><h2>{historyDriver.nome}</h2><p>{historyDriver.matricula ? `Matrícula ${historyDriver.matricula}` : 'Histórico funcional e de autorizações'}</p></div><button className="fleet-close" onClick={() => setHistoryDriver(null)} aria-label="Fechar"><X size={18}/></button></div>{historyLoading ? <div className="drivers-history-state">Carregando histórico…</div> : <>{historyError && <p className="drivers-inline-error" role="alert">{historyError}</p>}<div className="drivers-history-section"><h3><UserRound size={16}/> Alterações cadastrais</h3>{audits.length ? <div className="drivers-timeline">{audits.map((item) => <article key={item.id}><strong>{item.event_type.replaceAll('_', ' ')}</strong><small>{dateTimeLabel(item.performed_at)} · {item.actor_id ? `Usuário ${item.actor_id}` : 'Usuário não identificado'}</small>{item.changed_fields?.length ? <p>Campos: {item.changed_fields.join(', ')}</p> : null}{item.reason && <p>Motivo: {item.reason}</p>}</article>)}</div> : <p className="drivers-history-state">Nenhuma alteração registrada.</p>}</div><div className="drivers-history-section"><h3><History size={16}/> Veículos autorizados e períodos</h3>{authorizations.length ? <div className="drivers-auth-list">{authorizations.map((item) => { const vehicle = vehicles.get(item.vehicle_id); return <article key={item.id}><div className="drivers-auth-heading"><strong>{vehicle ? `${vehicle.placa} · ${[vehicle.marca, vehicle.modelo].filter(Boolean).join(' ')}` : `Veículo ${item.vehicle_id.slice(0, 8)}`}</strong><span className={`drivers-status ${item.status === 'ATIVA' ? 'active' : 'inactive'}`}>{item.status}</span></div><p>Vigência: {dateLabel(item.valid_from)} a {dateLabel(item.valid_until)}</p><small>Concedida em {dateTimeLabel(item.created_at)}{item.created_by ? ` · Usuário ${item.created_by}` : ''}</small>{item.reason && <p>Motivo: {item.reason}</p>}{item.ended_at && <small>Encerrada em {dateTimeLabel(item.ended_at)}{item.ended_by ? ` · Usuário ${item.ended_by}` : ''}{item.ended_reason ? ` · ${item.ended_reason}` : ''}</small>}</article>})}</div> : <p className="drivers-history-state">Nenhuma autorização registrada.</p>}</div></>}</section></div>}
  </section>
}
