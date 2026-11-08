import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ExternalLink, FileCheck2, History, Plus, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatMunicipalDateTime, municipalDateTimeInputValue, municipalLocalInputToDate } from '../lib/municipalTime'
import type { Vehicle } from './FleetVehicleDetails'

type Unit = { id: string; nome: string; sigla?: string | null }
type UseAuthorization = {
  id: string
  responsible_unit_id: string
  beneficiary_unit_id: string
  requested_by: number
  authorized_by: number | null
  purpose: string
  valid_from: string
  valid_until: string
  status: string
  approval_notes: string | null
  supporting_document_path: string | null
  supporting_document_name: string | null
  supporting_document_mime_type: string | null
  supporting_document_size_bytes: number | null
  created_at: string
  beneficiary?: { nome?: string; sigla?: string | null } | null
}
type AuthorizationHistory = { id: string; event_type: string; previous_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; reason: string | null; changed_at: string; authorization_id: string }
const asLocalInput = (d = new Date()) => municipalDateTimeInputValue(d)
const dateTime = (v: string) => formatMunicipalDateTime(v)
const allowedMime = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])

export function FleetVehicleUseAuthorizations({ vehicle, units, canManage }: { vehicle: Vehicle; units: Unit[]; canManage: boolean }) {
  const [records, setRecords] = useState<UseAuthorization[]>([])
  const [history, setHistory] = useState<AuthorizationHistory[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [beneficiaryId, setBeneficiaryId] = useState('')
  const [purpose, setPurpose] = useState('')
  const [validFrom, setValidFrom] = useState(asLocalInput())
  const [validUntil, setValidUntil] = useState('')
  const [approvalNotes, setApprovalNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    if (!supabase || !canManage) { setRecords([]); setHistory([]); setLoading(false); return }
    setLoading(true)
    const [authorizationResult, historyResult] = await Promise.all([
      supabase.from('fleet_vehicle_authorizations').select('id,responsible_unit_id,beneficiary_unit_id,requested_by,authorized_by,purpose,valid_from,valid_until,status,approval_notes,supporting_document_path,supporting_document_name,supporting_document_mime_type,supporting_document_size_bytes,created_at').eq('vehicle_id', vehicle.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('fleet_vehicle_authorization_history').select('id,event_type,previous_data,new_data,reason,changed_at,authorization_id').eq('vehicle_id', vehicle.id).order('changed_at', { ascending: false }).limit(100),
    ])
    if (authorizationResult.error || historyResult.error) setError('Não foi possível carregar todas as autorizações de uso e seu histórico.')
    setRecords((authorizationResult.data || []) as unknown as UseAuthorization[])
    setHistory((historyResult.data || []) as AuthorizationHistory[])
    setLoading(false)
  }, [canManage, vehicle.id])
  useEffect(() => { void load() }, [load])

  function resetForm() {
    setShowForm(false); setBeneficiaryId(''); setPurpose(''); setValidFrom(asLocalInput()); setValidUntil(''); setApprovalNotes(''); setFile(null); setError('')
  }

  async function attachLegacyDocument(record: UseAuthorization, document: File) {
    if (!supabase) return
    if (record.status !== 'APROVADA' || record.supporting_document_path || record.authorized_by == null || record.responsible_unit_id !== vehicle.responsible_unit_id) {
      setError('Esta autorização legada não pode receber comprovante e ser reutilizada; cancele-a e registre uma nova cessão vinculada à lotação atual.')
      return
    }
    if (!allowedMime.has(document.type) || document.size < 1 || document.size > 10 * 1024 * 1024) { setError('Use PDF/JPG/PNG/WEBP com tamanho máximo de 10 MB.'); return }
    setSaving(true); setError(''); setNotice('')
    let storagePath = ''
    try {
      const safeName = document.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'autorizacao'
      storagePath = `${vehicle.municipio_id}/${vehicle.id}/${crypto.randomUUID()}-${safeName}`
      const upload = await supabase.storage.from('fleet-vehicle-documents').upload(storagePath, document, { cacheControl: '3600', upsert: false, contentType: document.type })
      if (upload.error) { setError('Não foi possível salvar o comprovante no armazenamento privado.'); return }
      const result = await supabase.from('fleet_vehicle_authorizations').update({ supporting_document_path: storagePath, supporting_document_name: document.name, supporting_document_mime_type: document.type, supporting_document_size_bytes: document.size, updated_at: new Date().toISOString() }).eq('id', record.id).eq('status', 'APROVADA').is('supporting_document_path', null).select('id').maybeSingle()
      if (result.error || !result.data) {
        await supabase.storage.from('fleet-vehicle-documents').remove([storagePath]); storagePath = ''
        setError('O comprovante não foi vinculado. A autorização pode ter mudado; atualize a ficha e tente novamente.')
        return
      }
      storagePath = ''
      setNotice('Comprovante privado anexado. A autorização só poderá ser utilizada se sua vigência e lotação ainda forem válidas.')
      await load()
    } catch {
      if (storagePath) await supabase.storage.from('fleet-vehicle-documents').remove([storagePath])
      setError('Falha de conexão ao anexar o comprovante. Atualize a ficha antes de tentar novamente.')
    } finally { setSaving(false) }
  }

  async function createAuthorization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase) { setError('O serviço de dados está indisponível.'); return }
    if (!vehicle.responsible_unit_id) { setError('O veículo precisa ter uma secretaria responsável antes da cessão.'); return }
    if (!beneficiaryId || beneficiaryId === vehicle.responsible_unit_id) { setError('Selecione uma secretaria beneficiária diferente da responsável.'); return }
    if (!purpose.trim() || purpose.trim().length < 5) { setError('Informe a finalidade administrativa da cessão.'); return }
    if (!file || !allowedMime.has(file.type) || file.size < 1 || file.size > 10 * 1024 * 1024) { setError('Anexe o documento de autorização em PDF/JPG/PNG/WEBP, com tamanho máximo de 10 MB.'); return }
    const start = municipalLocalInputToDate(validFrom)
    const end = municipalLocalInputToDate(validUntil)
    if (!validFrom || !validUntil || !Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { setError('A data final da autorização deve ser posterior à data inicial.'); return }
    setSaving(true); setError('')
    let storagePath = ''
    try {
      const [municipality, user] = await Promise.all([supabase.rpc('fleet_current_municipio_id'), supabase.rpc('fleet_current_usuario_id')])
      if (municipality.error || !municipality.data || user.error || user.data == null) { setError('Não foi possível identificar o município e o usuário autenticado.'); return }
      const safeName = file.name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(-100) || 'autorizacao'
      storagePath = `${vehicle.municipio_id}/${vehicle.id}/${crypto.randomUUID()}-${safeName}`
      const upload = await supabase.storage.from('fleet-vehicle-documents').upload(storagePath, file, { cacheControl: '3600', upsert: false, contentType: file.type })
      if (upload.error) { setError('Não foi possível salvar o comprovante no armazenamento privado. Verifique o acesso e tente novamente.'); return }
      const insert = await supabase.from('fleet_vehicle_authorizations').insert({
        municipio_id: municipality.data, vehicle_id: vehicle.id, responsible_unit_id: vehicle.responsible_unit_id,
        beneficiary_unit_id: beneficiaryId, requested_by: user.data, authorized_by: user.data,
        purpose: purpose.trim(), valid_from: start.toISOString(), valid_until: end.toISOString(),
        status: 'APROVADA', approval_notes: approvalNotes.trim() || null,
        supporting_document_path: storagePath, supporting_document_name: file.name,
        supporting_document_mime_type: file.type, supporting_document_size_bytes: file.size,
      }).select('id').single()
      if (insert.error || !insert.data) {
        await supabase.storage.from('fleet-vehicle-documents').remove([storagePath])
        storagePath = ''
        setError(insert.error?.message.toLowerCase().includes('responsável') || insert.error?.message.toLowerCase().includes('responsavel') ? 'A unidade responsável do veículo mudou. Atualize a ficha e tente novamente.' : 'Não foi possível registrar a autorização aprovada. Confira a vigência e as permissões.')
        return
      }
      storagePath = ''
      resetForm()
      await load()
    } catch {
      if (storagePath) await supabase.storage.from('fleet-vehicle-documents').remove([storagePath])
      setError('Falha de conexão ao registrar a autorização. Atualize a ficha antes de tentar novamente.')
    } finally { setSaving(false) }
  }

  async function cancelAuthorization(record: UseAuthorization) {
    if (!supabase) return
    const reason = window.prompt('Informe o motivo do cancelamento da autorização (mínimo 5 caracteres):')?.trim()
    if (!reason || reason.length < 5) { setError('Cancelamento não realizado: informe um motivo com pelo menos 5 caracteres.'); return }
    setSaving(true); setError('')
    const note = [record.approval_notes, `Cancelada em ${formatMunicipalDateTime(new Date())} (America/Sao_Paulo): ${reason}`].filter(Boolean).join('\n')
    const result = await supabase.from('fleet_vehicle_authorizations').update({ status: 'CANCELADA', approval_notes: note, updated_at: new Date().toISOString() }).eq('id', record.id).eq('status', 'APROVADA').select('id').maybeSingle()
    if (result.error || !result.data) setError('Não foi possível cancelar. A autorização pode ter sido alterada por outro gestor; atualize a ficha.')
    else await load()
    setSaving(false)
  }

  async function openDocument(record: UseAuthorization) {
    if (!supabase || !record.supporting_document_path) return
    const tab = window.open('about:blank', '_blank')
    if (!tab) { setError('O navegador bloqueou a nova aba. Permita pop-ups para abrir o comprovante privado.'); return }
    tab.opener = null
    const result = await supabase.storage.from('fleet-vehicle-documents').createSignedUrl(record.supporting_document_path, 300)
    if (result.error || !result.data?.signedUrl) { tab.close(); setError('Não foi possível abrir o comprovante privado da autorização.'); return }
    tab.location.href = result.data.signedUrl
  }

  const beneficiaryName = (record: UseAuthorization) => record.beneficiary?.nome || units.find((u) => u.id === record.beneficiary_unit_id)?.nome || 'Secretaria beneficiária'
  const historyByAuthorization = (id: string) => history.filter((item) => item.authorization_id === id)

  return <section className="fv-detail-card">
    <h3><FileCheck2 size={15} /> Cessões e autorizações de uso</h3>
    <p className="fv-notes">Registre a secretaria responsável separadamente da beneficiária. Somente autorizações aprovadas, vigentes e com comprovante privado podem ser vinculadas a abastecimentos de outra secretaria.</p>
    {error && <p className="fv-inline-error" role="alert">{error}</p>}{notice && <p className="fv-inline-success" role="status">{notice}</p>}
    {canManage && <button className="fleet-secondary-button" type="button" onClick={() => { setError(''); setShowForm((v) => !v) }}><Plus size={14} /> Registrar autorização aprovada</button>}
    {showForm && canManage && <form className="fv-inline-form fv-form-grid" onSubmit={createAuthorization}>
      <label>Secretaria responsável<input value={units.find((u) => u.id === vehicle.responsible_unit_id)?.nome || 'Não definida'} readOnly /></label>
      <label>Secretaria beneficiária *<select required value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)}><option value="">Selecione outra secretaria</option>{units.filter((u) => u.id !== vehicle.responsible_unit_id).map((u) => <option key={u.id} value={u.id}>{u.nome}{u.sigla ? ` (${u.sigla})` : ''}</option>)}</select></label>
      <label>Válida desde * (America/Sao_Paulo)<input type="datetime-local" required value={validFrom} onChange={(e) => setValidFrom(e.target.value)} /></label>
      <label>Válida até * (America/Sao_Paulo)<input type="datetime-local" required value={validUntil} onChange={(e) => setValidUntil(e.target.value)} /></label>
      <label className="fleet-form-wide">Finalidade *<textarea required minLength={5} maxLength={1000} rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Finalidade administrativa do uso temporário" /></label>
      <label className="fleet-form-wide">Observações da aprovação<textarea maxLength={1000} rows={2} value={approvalNotes} onChange={(e) => setApprovalNotes(e.target.value)} /></label>
      <label className="fv-file-label fleet-form-wide"><FileCheck2 size={14} /> Comprovante oficial obrigatório<input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} /><small>PDF/JPG/PNG/WEBP; até 10 MB. O arquivo será privado, acessível a gestores.</small></label>
      <div className="fleet-modal-actions fleet-form-wide"><button type="button" className="fleet-secondary-button" onClick={resetForm} disabled={saving}><X size={14} /> Cancelar</button><button className="fleet-primary-button" disabled={saving}>{saving ? 'Salvando…' : 'Registrar como aprovada'}</button></div>
      <small className="fleet-form-wide">Esta ação registra a aprovação administrativa, identifica o usuário autenticado como solicitante e autorizador e preserva o histórico da autorização.</small>
    </form>}
    {loading ? <p>Carregando autorizações…</p> : records.length ? <div className="fv-record-list">{records.map((record) => <article key={record.id}>
      <div><strong>{beneficiaryName(record)} · {record.status}</strong><small>Responsável: {units.find((u) => u.id === record.responsible_unit_id)?.nome || '—'}</small>{record.responsible_unit_id !== vehicle.responsible_unit_id && <small className="fv-inline-error">Lotação divergente da atual: esta autorização não pode ser vinculada a novos abastecimentos. Cancele e registre outra.</small>}{record.status === 'APROVADA' && (!record.authorized_by || !record.supporting_document_path) && <small className="fv-inline-error">Autorização legada incompleta: falta autorizador ou comprovante; não é elegível para abastecimento.</small>}<small>Vigência: {dateTime(record.valid_from)} a {dateTime(record.valid_until)}</small><small>Finalidade: {record.purpose}</small>{record.approval_notes && <small>Observações: {record.approval_notes}</small>}{record.supporting_document_name && <small>Comprovante: {record.supporting_document_name}</small>}
        {historyByAuthorization(record.id).length > 0 && <details><summary><History size={13} /> Histórico de alterações ({historyByAuthorization(record.id).length})</summary>{historyByAuthorization(record.id).map((entry) => <p key={entry.id}>{dateTime(entry.changed_at)} · {entry.event_type.replaceAll('_', ' ')}{entry.reason ? ` · ${entry.reason}` : ''}</p>)}</details>}
      </div><div className="fleet-row-actions">{record.supporting_document_path && <button className="fleet-secondary-button" type="button" onClick={() => void openDocument(record)}><ExternalLink size={13} /> Comprovante</button>}{canManage && record.status === 'APROVADA' && !record.supporting_document_path && record.authorized_by != null && record.responsible_unit_id === vehicle.responsible_unit_id && <label className="fv-file-label"><FileCheck2 size={13} /> Anexar comprovante<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" disabled={saving} onChange={(e) => { const selected = e.target.files?.[0]; if (selected) void attachLegacyDocument(record, selected); e.currentTarget.value = '' }} /></label>}{canManage && record.status === 'APROVADA' && <button className="fleet-secondary-button" type="button" disabled={saving} onClick={() => void cancelAuthorization(record)}>Cancelar</button>}</div>
    </article>)}</div> : <p>Nenhuma autorização de uso registrada.</p>}
  </section>
}
