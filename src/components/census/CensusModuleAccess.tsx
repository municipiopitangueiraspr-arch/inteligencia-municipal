import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, LoaderCircle, LockKeyhole, RefreshCw, Search, ShieldCheck, UserRoundCog, UsersRound, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import './CensusModuleAccess.css'

type ModuleRole = { id: string; label: string; description: string }
type OrgUnit = { id: string; code: string; name: string }
type ScopedAssignment = {
  id: string
  role_id: string
  role_label: string
  org_unit_id: string
  org_unit_name: string
  active: boolean
  valid_from: string
  valid_until: string | null
  module_ids: string[]
}
type ModuleUser = {
  user_id: number
  name: string
  email: string
  account_active: boolean
  is_self: boolean
  has_access: boolean
  outside_scope: boolean
  protected: boolean
  manageable: boolean
  in_scope: boolean
  assignments: ScopedAssignment[]
}
type ModuleAccessResult = {
  module_id: string
  module_label: string
  roles: ModuleRole[]
  org_units: OrgUnit[]
  users: ModuleUser[]
}
type AccessDraft = { user: ModuleUser; role_id: string; org_unit_id: string; valid_until: string }
type Notice = { tone: 'success' | 'error'; text: string }

export function CensusModuleAccess() {
  const [data, setData] = useState<ModuleAccessResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<AccessDraft | null>(null)

  const load = useCallback(async () => {
    if (!supabase) {
      setError('O serviço Supabase não está configurado nesta aplicação.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const result = await supabase.rpc('municipal_module_access_list', { p_module_id: 'census' })
    if (result.error) {
      setError(result.error.message.includes('autorizado') || result.error.code === '42501'
        ? 'Seu usuário não possui papel de gestão de acessos no módulo Saúde ou a sessão perdeu a autorização. Peça ao Admin do Sistema para revisar o vínculo.'
        : result.error.message)
      setData(null)
    } else {
      setData(result.data as ModuleAccessResult)
    }
    setLoading(false)
  }, [])

  useEffect(() => { void load() }, [load])

  const visibleUsers = useMemo(() => {
    const users = data?.users || []
    const normalized = search.trim().toLocaleLowerCase('pt-BR')
    if (!normalized) return users
    return users.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase('pt-BR').includes(normalized))
  }, [data, search])

  const openEditor = (user: ModuleUser) => {
    const current = user.assignments[0]
    const defaultRole = data?.roles.find((role) => role.id === current?.role_id)?.id || data?.roles[0]?.id || ''
    setNotice(null)
    setDraft({
      user,
      role_id: defaultRole,
      org_unit_id: current?.org_unit_id || data?.org_units[0]?.id || '',
      valid_until: current?.valid_until || '',
    })
  }

  const save = async (active: boolean) => {
    if (!supabase || !draft) return
    if (active && (!draft.role_id || !draft.org_unit_id)) {
      setNotice({ tone: 'error', text: 'Selecione o papel e a unidade organizacional.' })
      return
    }
    setSaving(true)
    setNotice(null)
    const result = await supabase.rpc('municipal_module_access_save', {
      p_module_id: 'census',
      p_user_id: draft.user.user_id,
      p_role_id: draft.role_id || draft.user.assignments[0]?.role_id || 'READ_ONLY',
      p_org_unit_id: draft.org_unit_id || draft.user.assignments[0]?.org_unit_id || data?.org_units[0]?.id || '',
      p_active: active,
      p_valid_until: active && draft.valid_until ? draft.valid_until : null,
    })
    setSaving(false)
    if (result.error) {
      setNotice({ tone: 'error', text: result.error.message })
      return
    }
    setDraft(null)
    setNotice({ tone: 'success', text: active ? 'Acesso ao módulo Saúde atualizado.' : 'Acesso ao módulo Saúde revogado. Os outros módulos da conta foram preservados.' })
    await load()
  }

  const revoke = () => {
    if (!draft) return
    const confirmed = window.confirm(`Revogar somente o acesso de ${draft.user.name || draft.user.email} ao módulo Saúde? Outros módulos e a conta continuarão ativos.`)
    if (confirmed) void save(false)
  }

  const assignedUsers = (data?.users || []).filter((user) => user.has_access).length
  const noAccessUsers = (data?.users || []).length - assignedUsers

  return <section className="census-access-page" aria-busy={loading || saving}>
    <header className="census-access-heading">
      <div><span className="fleet-kicker">GOVERNANÇA · ESCOPO SAÚDE</span><h2>Usuários e acessos da Saúde</h2><p>Gerencie o acesso de contas existentes apenas ao módulo Saúde e às unidades que estão dentro do seu escopo autorizado.</p></div>
      <button type="button" className="fleet-secondary-button" onClick={() => void load()} disabled={loading || saving}>{loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Atualizar</button>
    </header>

    <div className="census-access-boundary"><ShieldCheck size={19} /><p><strong>Seu alcance é limitado.</strong> Esta tela não cria contas, não envia convites, não altera outros módulos e não permite administrar outros gestores. Convites, papéis de gestão e acessos globais continuam com o Admin do Sistema.</p></div>
    <div className="census-access-boundary census-access-boundary--identity"><UserRoundCog size={19} /><p><strong>Acesso ao sistema não é cadastro profissional.</strong> Dar o papel ACS habilita a entrada no módulo; o cadastro em Profissionais e ACS e os vínculos oficiais de equipe e microárea continuam separados em Administração da Saúde.</p></div>
    {notice && <div className={`census-access-notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.tone === 'success' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}{notice.text}</div>}
    {error && <div className="census-access-notice error" role="alert"><AlertTriangle size={17} />{error}</div>}

    <div className="census-access-metrics" aria-label="Resumo de contas do módulo">
      <article><UsersRound size={18} /><span><strong>{data?.users.length ?? '—'}</strong><small>contas no escopo</small></span></article>
      <article><CheckCircle2 size={18} /><span><strong>{data ? assignedUsers : '—'}</strong><small>com acesso à Saúde</small></span></article>
      <article><LockKeyhole size={18} /><span><strong>{data ? noAccessUsers : '—'}</strong><small>sem acesso à Saúde</small></span></article>
    </div>

    <div className="census-access-toolbar"><label className="census-access-search"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conta por nome ou e-mail" /></label><span>{visibleUsers.length} conta(s) exibida(s)</span></div>

    {loading && !data ? <div className="census-access-empty"><LoaderCircle className="spin" size={24} /><strong>Carregando contas e vínculos autorizados…</strong></div> : null}
    {!loading && data && data.org_units.length === 0 && <div className="census-access-empty"><LockKeyhole size={24} /><strong>Nenhuma unidade ativa dentro do seu escopo</strong><p>Peça ao Admin do Sistema para revisar a unidade organizacional vinculada ao seu papel de gestão.</p></div>}
    {!loading && data && data.users.length === 0 && <div className="census-access-empty"><UsersRound size={24} /><strong>Nenhuma conta municipal elegível encontrada</strong><p>O Admin do Sistema precisa criar ou vincular a conta à estrutura organizacional antes que ela possa receber acesso a este módulo.</p></div>}
    {!loading && data && visibleUsers.length > 0 && <div className="census-access-list">
      {visibleUsers.map((user) => {
        const current = user.assignments[0]
        const cannotManage = !user.manageable || user.protected || user.is_self || user.outside_scope || !user.in_scope
        const status = user.outside_scope ? 'Acesso fora do escopo' : user.protected ? 'Gestão reservada ao Admin' : user.is_self ? 'Sua própria conta' : user.has_access ? 'Acesso ativo' : 'Sem acesso à Saúde'
        return <article className="census-access-user" key={user.user_id}>
          <div className="census-access-user-icon"><UsersRound size={18} /></div>
          <div className="census-access-user-main"><strong>{user.name || 'Nome não informado'}</strong><span>{user.email}</span><small>{user.has_access && current ? `${current.role_label} · ${current.org_unit_name}${current.valid_until ? ` · até ${new Date(`${current.valid_until}T12:00:00`).toLocaleDateString('pt-BR')}` : ''}` : 'A conta municipal existe, mas ainda não tem acesso ativo à Saúde.'}</small></div>
          <span className={`census-access-status${user.has_access ? ' active' : ''}`}>{status}</span>
          <button type="button" className="fleet-secondary-button" onClick={() => openEditor(user)} disabled={cannotManage || !data.roles.length || !data.org_units.length || saving}>{user.has_access ? 'Gerenciar' : 'Conceder acesso'}</button>
        </article>
      })}
      {!visibleUsers.length && <div className="census-access-empty"><Search size={22} /><strong>Nenhuma conta encontrada</strong><p>Revise o nome ou o e-mail digitado.</p></div>}
    </div>}

    {draft && <div className="census-access-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setDraft(null) }}><section className="census-access-dialog" role="dialog" aria-modal="true" aria-labelledby="censusAccessDialogTitle"><div className="census-access-dialog-heading"><div><span className="fleet-kicker">ACESSO LIMITADO AO MÓDULO</span><h3 id="censusAccessDialogTitle">{draft.user.has_access ? 'Editar acesso à Saúde' : 'Conceder acesso à Saúde'}</h3><p>{draft.user.name || draft.user.email} · {draft.user.email}</p></div><button type="button" aria-label="Fechar" onClick={() => setDraft(null)} disabled={saving}><X size={19} /></button></div>
      {draft.user.assignments.length > 1 && <div className="census-access-notice error"><AlertTriangle size={17} />Há mais de um vínculo ativo de Saúde dentro do seu escopo. Ao salvar, eles serão consolidados em um único vínculo; acessos de outros módulos serão preservados.</div>}
      <form onSubmit={(event) => { event.preventDefault(); void save(true) }}>
        <label>Papel de acesso<select value={draft.role_id} onChange={(event) => setDraft({ ...draft, role_id: event.target.value })} required><option value="">Selecione</option>{data?.roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
        <p className="census-access-dialog-note">Esta lista inclui apenas papéis com fluxo ativo nesta tela. Convites e papéis de gestão ou de outras funções profissionais continuam na Governança global; cada fluxo clínico/ACE precisa ser liberado antes de conceder acesso operacional.</p>
        <label>Unidade dentro do seu escopo<select value={draft.org_unit_id} onChange={(event) => setDraft({ ...draft, org_unit_id: event.target.value })} required><option value="">Selecione</option>{data?.org_units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
        <label>Válido até <span>(opcional)</span><input type="date" value={draft.valid_until} onChange={(event) => setDraft({ ...draft, valid_until: event.target.value })} /></label>
        <p className="census-access-dialog-note">A alteração substitui somente os vínculos atuais desta conta com o módulo Saúde. Concessões a outros módulos permanecem intactas e a mudança é registrada na auditoria.</p>
        <div className="census-access-dialog-actions"><button type="button" className="fleet-secondary-button" onClick={() => setDraft(null)} disabled={saving}>Cancelar</button>{draft.user.has_access && <button type="button" className="census-access-revoke" onClick={revoke} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}Revogar acesso</button>}<button type="submit" className="fleet-primary-button" disabled={saving || !draft.role_id || !draft.org_unit_id}>{saving ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{saving ? 'Salvando…' : draft.user.has_access ? 'Salvar acesso' : 'Conceder acesso'}</button></div>
      </form></section></div>}
  </section>
}
