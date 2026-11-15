import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, LoaderCircle, LockKeyhole, MailPlus, RefreshCw, Search, ShieldCheck, UserRoundCog, UsersRound, X } from 'lucide-react'
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
type InviteRequest = {
  id: string
  invitee_name: string
  invitee_email: string
  module_id: string
  module_label: string
  role_id: string
  role_label: string
  org_unit_id: string
  org_unit_name: string
  status: 'SENDING' | 'PENDING_ADMIN_APPROVAL' | 'APPROVED' | 'REJECTED' | 'FAILED'
  requested_at: string
  invitation_sent_at: string | null
  failure_reason: string | null
}
type AccessDraft = { user: ModuleUser; role_id: string; org_unit_id: string; valid_until: string }
type InviteDraft = { name: string; email: string; role_id: string; org_unit_id: string }
type Notice = { tone: 'success' | 'error'; text: string }

function inviteStatusLabel(status: InviteRequest['status']) {
  if (status === 'SENDING') return 'Enviando convite'
  if (status === 'PENDING_ADMIN_APPROVAL') return 'Aguardando aprovação do Admin'
  if (status === 'APPROVED') return 'Aprovado · acesso liberado'
  if (status === 'REJECTED') return 'Rejeitado'
  return 'Falha no envio'
}

async function edgeFunctionErrorMessage(error: unknown) {
  const context = (error as { context?: unknown } | null)?.context
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json() as { error?: unknown }
      if (typeof payload.error === 'string') return payload.error
    } catch { /* A resposta pode não ser JSON; usa-se o erro padrão. */ }
  }
  return error instanceof Error ? error.message : 'Não foi possível enviar o convite.'
}

export function CensusModuleAccess({ isAdministrator = false }: { isAdministrator?: boolean }) {
  const [data, setData] = useState<ModuleAccessResult | null>(null)
  const [inviteRequests, setInviteRequests] = useState<InviteRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState<Notice | null>(null)
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState<AccessDraft | null>(null)
  const [inviteDraft, setInviteDraft] = useState<InviteDraft | null>(null)

  const load = useCallback(async () => {
    if (!supabase) {
      setError('O serviço Supabase não está configurado nesta aplicação.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    const accessPromise = supabase.rpc('municipal_module_access_list', { p_module_id: 'census' })
    const requestsPromise = isAdministrator
      ? Promise.resolve({ data: [] as InviteRequest[], error: null })
      : supabase.rpc('municipal_module_invite_requests_list')
    const [accessResult, requestsResult] = await Promise.all([accessPromise, requestsPromise])
    if (accessResult.error || requestsResult.error) {
      const failure = accessResult.error || requestsResult.error
      setError(failure?.message.includes('autorizado') || failure?.code === '42501'
        ? 'Seu usuário não possui papel de gestão de acessos no módulo Saúde ou a sessão perdeu a autorização. Peça ao Admin do Sistema para revisar o vínculo.'
        : failure?.message || 'Não foi possível carregar convites e acessos.')
      setData(null)
      setInviteRequests([])
    } else {
      setData(accessResult.data as ModuleAccessResult)
      setInviteRequests((requestsResult.data || []) as InviteRequest[])
    }
    setLoading(false)
  }, [isAdministrator])

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

  const openInvite = () => {
    setNotice(null)
    setInviteDraft({ name: '', email: '', role_id: data?.roles[0]?.id || '', org_unit_id: data?.org_units[0]?.id || '' })
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

  const invite = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !inviteDraft) return
    if (!inviteDraft.role_id || !inviteDraft.org_unit_id) {
      setNotice({ tone: 'error', text: 'Selecione o papel e a unidade dentro do seu escopo.' })
      return
    }
    setSaving(true)
    setNotice(null)
    const { data: response, error: invokeError } = await supabase.functions.invoke('invite-municipal-user', {
      body: {
        request_type: 'health_manager_invite',
        nome: inviteDraft.name.trim(),
        email: inviteDraft.email.trim().toLowerCase(),
        role_id: inviteDraft.role_id,
        org_unit_id: inviteDraft.org_unit_id,
      },
    })
    setSaving(false)
    if (invokeError) {
      setNotice({ tone: 'error', text: await edgeFunctionErrorMessage(invokeError) })
      return
    }
    if (response?.registration_pending) {
      setInviteDraft(null)
      setNotice({ tone: 'error', text: String(response.error || 'O convite pode ter sido enviado, mas a vinculação do pedido falhou. O acesso permanece bloqueado; contate o Admin do Sistema.') })
      await load()
      return
    }
    if (response?.error) {
      setNotice({ tone: 'error', text: String(response.error) })
      return
    }
    setInviteDraft(null)
    setNotice({ tone: 'success', text: `Convite enviado para ${inviteDraft.email.trim()}. A conta permanecerá sem acesso até a aprovação do Admin do Sistema.` })
    await load()
  }

  const revoke = () => {
    if (!draft) return
    const confirmed = window.confirm(`Revogar somente o acesso de ${draft.user.name || draft.user.email} ao módulo Saúde? Outros módulos e a conta continuarão ativos.`)
    if (confirmed) void save(false)
  }

  const assignedUsers = (data?.users || []).filter((user) => user.has_access).length
  const noAccessUsers = (data?.users || []).length - assignedUsers
  const pendingCount = inviteRequests.filter((request) => request.status === 'SENDING' || request.status === 'PENDING_ADMIN_APPROVAL').length

  return <section className="census-access-page" aria-busy={loading || saving}>
    <header className="census-access-heading">
      <div><span className="fleet-kicker">GOVERNANÇA · ESCOPO SAÚDE</span><h2>Usuários e acessos da Saúde</h2><p>Gerencie contas existentes e, se você é Gestor autorizado, convide uma nova pessoa para a sua unidade sem duplicar a identidade municipal.</p></div>
      <div className="census-access-heading-actions">
        {!isAdministrator && <button type="button" className="fleet-primary-button" onClick={openInvite} disabled={loading || saving || !data?.roles.length || !data?.org_units.length}><MailPlus size={16} />Convidar usuário</button>}
        <button type="button" className="fleet-secondary-button" onClick={() => void load()} disabled={loading || saving}>{loading ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />}Atualizar</button>
      </div>
    </header>

    <div className="census-access-boundary"><ShieldCheck size={19} /><p><strong>Seu alcance é limitado.</strong> Você pode gerir contas existentes e enviar convites somente para papéis liberados e unidades dentro do seu escopo. O convite por e-mail é enviado agora, mas a nova conta permanece bloqueada e sem acesso até o Admin do Sistema aprovar; convites, papéis de gestão e acessos globais continuam sob controle do Admin.</p></div>
    <div className="census-access-boundary census-access-boundary--identity"><UserRoundCog size={19} /><p><strong>Acesso ao sistema não é cadastro profissional.</strong> Aprovar o papel ACS habilita a entrada no módulo; o cadastro em Profissionais e ACS e os vínculos oficiais de equipe e microárea continuam separados em Administração da Saúde.</p></div>
    {notice && <div className={`census-access-notice ${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.tone === 'success' ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}{notice.text}</div>}
    {error && <div className="census-access-notice error" role="alert"><AlertTriangle size={17} />{error}</div>}

    {!isAdministrator && <section className="census-access-requests" aria-labelledby="inviteRequestsHeading">
      <div className="census-access-requests-heading"><div><span className="fleet-kicker">CONVITES DA SUA ÁREA</span><h3 id="inviteRequestsHeading">Acompanhamento de convites</h3><p>A aprovação global libera somente o vínculo solicitado. E-mails já vinculados a uma conta existente não geram uma segunda identidade.</p></div><span className="census-access-request-count"><Clock3 size={15} />{pendingCount} pendente(s)</span></div>
      {loading && !data ? <div className="census-access-empty"><LoaderCircle className="spin" size={22} /><strong>Carregando solicitações…</strong></div> : inviteRequests.length === 0 ? <div className="census-access-empty census-access-empty--compact"><UsersRound size={21} /><strong>Nenhum convite nesta unidade</strong><p>Quando você enviar um convite, o estado de aprovação aparecerá aqui.</p></div> : <div className="census-access-request-list">
        {inviteRequests.map((request) => <article className="census-access-request-row" key={`${request.id}-${request.org_unit_id}`}>
          <div className="census-access-user-icon"><MailPlus size={17} /></div>
          <div className="census-access-user-main"><strong>{request.invitee_name || 'Nome não informado'}</strong><span>{request.invitee_email}</span><small>{request.role_label} · {request.module_label} · {request.org_unit_name} · solicitado em {new Date(request.requested_at).toLocaleDateString('pt-BR')}</small></div>
          <span className={`census-access-status${request.status === 'APPROVED' ? ' active' : ''}${request.status === 'REJECTED' || request.status === 'FAILED' ? ' rejected' : ''}`}>{inviteStatusLabel(request.status)}</span>
          {request.status === 'FAILED' && request.failure_reason && <small className="census-access-request-failure">{request.failure_reason}</small>}
        </article>)}
      </div>}
    </section>}

    <div className="census-access-metrics" aria-label="Resumo de contas do módulo">
      <article><UsersRound size={18} /><span><strong>{data?.users.length ?? '—'}</strong><small>contas no escopo</small></span></article>
      <article><CheckCircle2 size={18} /><span><strong>{data ? assignedUsers : '—'}</strong><small>com acesso à Saúde</small></span></article>
      <article><LockKeyhole size={18} /><span><strong>{data ? noAccessUsers : '—'}</strong><small>sem acesso à Saúde</small></span></article>
      {!isAdministrator && <article><Clock3 size={18} /><span><strong>{pendingCount}</strong><small>convites aguardando</small></span></article>}
    </div>

    <div className="census-access-toolbar"><label className="census-access-search"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conta por nome ou e-mail" /></label><span>{visibleUsers.length} conta(s) exibida(s)</span></div>

    {loading && !data ? <div className="census-access-empty"><LoaderCircle className="spin" size={24} /><strong>Carregando contas e vínculos autorizados…</strong></div> : null}
    {!loading && data && data.org_units.length === 0 && <div className="census-access-empty"><LockKeyhole size={24} /><strong>Nenhuma unidade ativa dentro do seu escopo</strong><p>Peça ao Admin do Sistema para revisar a unidade organizacional vinculada ao seu papel de gestão.</p></div>}
    {!loading && data && data.users.length === 0 && <div className="census-access-empty"><UsersRound size={24} /><strong>Nenhuma conta municipal elegível encontrada</strong><p>Você ainda pode enviar convites para novas contas; contas já existentes precisam ser vinculadas à estrutura pelo Admin antes de aparecerem nesta lista.</p></div>}
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
        <p className="census-access-dialog-note">Esta lista inclui apenas papéis com fluxo ativo nesta tela. Papéis de gestão ou de outras funções profissionais continuam sob controle do Admin; cada fluxo clínico/ACE precisa ser liberado antes de conceder acesso operacional.</p>
        <label>Unidade dentro do seu escopo<select value={draft.org_unit_id} onChange={(event) => setDraft({ ...draft, org_unit_id: event.target.value })} required><option value="">Selecione</option>{data?.org_units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
        <label>Válido até <span>(opcional)</span><input type="date" value={draft.valid_until} onChange={(event) => setDraft({ ...draft, valid_until: event.target.value })} /></label>
        <p className="census-access-dialog-note">A alteração substitui somente os vínculos atuais desta conta com o módulo Saúde. Concessões a outros módulos permanecem intactas e a mudança é registrada na auditoria.</p>
        <div className="census-access-dialog-actions"><button type="button" className="fleet-secondary-button" onClick={() => setDraft(null)} disabled={saving}>Cancelar</button>{draft.user.has_access && <button type="button" className="census-access-revoke" onClick={revoke} disabled={saving}>{saving ? <LoaderCircle className="spin" size={16} /> : <LockKeyhole size={16} />}Revogar acesso</button>}<button type="submit" className="fleet-primary-button" disabled={saving || !draft.role_id || !draft.org_unit_id}>{saving ? <LoaderCircle className="spin" size={16} /> : <ShieldCheck size={16} />}{saving ? 'Salvando…' : draft.user.has_access ? 'Salvar acesso' : 'Conceder acesso'}</button></div>
      </form></section></div>}

    {inviteDraft && <div className="census-access-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) setInviteDraft(null) }}><section className="census-access-dialog" role="dialog" aria-modal="true" aria-labelledby="censusInviteDialogTitle"><div className="census-access-dialog-heading"><div><span className="fleet-kicker">CONVITE CENTRAL · ACESSO PENDENTE</span><h3 id="censusInviteDialogTitle">Convidar pessoa para Saúde</h3><p>O e-mail será enviado agora; o acesso só será ativado após aprovação do Admin.</p></div><button type="button" aria-label="Fechar" onClick={() => setInviteDraft(null)} disabled={saving}><X size={19} /></button></div>
      <form onSubmit={(event) => void invite(event)}>
        <label>Nome completo<input type="text" autoComplete="name" maxLength={160} value={inviteDraft.name} onChange={(event) => setInviteDraft({ ...inviteDraft, name: event.target.value })} required /></label>
        <label>E-mail<input type="email" autoComplete="email" maxLength={254} value={inviteDraft.email} onChange={(event) => setInviteDraft({ ...inviteDraft, email: event.target.value })} required /></label>
        <label>Papel solicitado<select value={inviteDraft.role_id} onChange={(event) => setInviteDraft({ ...inviteDraft, role_id: event.target.value })} required><option value="">Selecione</option>{data?.roles.map((role) => <option key={role.id} value={role.id}>{role.label}</option>)}</select></label>
        <label>Unidade dentro do seu escopo<select value={inviteDraft.org_unit_id} onChange={(event) => setInviteDraft({ ...inviteDraft, org_unit_id: event.target.value })} required><option value="">Selecione</option>{data?.org_units.map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
        <p className="census-access-dialog-note">Se este e-mail já tiver uma conta municipal, a plataforma não criará uma identidade duplicada. O papel ACS também exige cadastro profissional, equipe e microárea depois que o acesso for aprovado.</p>
        <div className="census-access-dialog-actions"><button type="button" className="fleet-secondary-button" onClick={() => setInviteDraft(null)} disabled={saving}>Cancelar</button><button type="submit" className="fleet-primary-button" disabled={saving || !inviteDraft.role_id || !inviteDraft.org_unit_id}>{saving ? <LoaderCircle className="spin" size={16} /> : <MailPlus size={16} />}{saving ? 'Enviando convite…' : 'Enviar convite'}</button></div>
      </form></section></div>}
  </section>
}
