import { useCallback, useEffect, useState } from 'react'
import type { CSSProperties, FormEvent } from 'react'
import {
  ArrowLeft,
  Building2,
  Check,
  CircleAlert,
  FilePlus2,
  LayoutGrid,
  ListTree,
  LogOut,
  MailPlus,
  Pencil,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'
import {
  getMunicipalIcon,
  MUNICIPAL_ICON_OPTIONS,
  MUNICIPAL_PROFILES,
} from '../lib/municipal-catalog'
import type { MunicipalModule, MunicipalSecretariat } from '../lib/municipal-catalog'
import { supabase } from '../lib/supabase'
import './GovernancePanel.css'

const assetBase = import.meta.env.BASE_URL

type GovernancePanelProps = {
  userEmail?: string
  onBack: () => void
  onLogout: () => void
}

type GovernanceUser = {
  user_id: number
  uuid: string
  name: string | null
  email: string
  perfil_municipal: string | null
  ativo: boolean
  legacy_admin: boolean
  secretariat_ids: string[] | null
  module_ids: string[] | null
}

type SecretariatDraft = {
  id: string | null
  name: string
  description: string
  icon_name: string
  sort_order: string
  is_active: boolean
}

type UserDraft = {
  user_id: number | null
  name: string
  email: string
  perfil_municipal: string
  legacy_admin: boolean
  secretariat_ids: string[]
  module_ids: string[]
}

type OrgUnit = {
  id: string
  parent_id: string | null
  code: string
  name: string
  unit_type: string
  description: string
  sort_order: number
  is_active: boolean
}

type OrgUnitDraft = {
  id: string
  parent_id: string
  code: string
  name: string
  unit_type: string
  description: string
  sort_order: string
  is_active: boolean
}

type PanelTab = 'organization' | 'secretariats' | 'users' | 'modules'

type OrderedOrgUnit = OrgUnit & { level: number }

function orderOrgUnits(units: OrgUnit[]): OrderedOrgUnit[] {
  const children = new Map<string | null, OrgUnit[]>()
  for (const unit of units) {
    const siblings = children.get(unit.parent_id) || []
    siblings.push(unit)
    children.set(unit.parent_id, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name, 'pt-BR'))
  }

  const ordered: OrderedOrgUnit[] = []
  const visited = new Set<string>()
  const visit = (unit: OrgUnit, level: number) => {
    if (visited.has(unit.id)) return
    visited.add(unit.id)
    ordered.push({ ...unit, level })
    for (const child of children.get(unit.id) || []) visit(child, level + 1)
  }

  for (const root of children.get(null) || []) visit(root, 0)
  // Registros órfãos não desaparecem da administração se uma unidade superior tiver sido removida.
  for (const unit of units) if (!visited.has(unit.id)) visit(unit, 0)
  return ordered
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : 'Não foi possível concluir a operação.'
}

function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function profileLabel(value: string | null) {
  return MUNICIPAL_PROFILES.find((profile) => profile.value === value)?.label || 'Perfil não definido'
}

export function GovernancePanel({ userEmail, onBack, onLogout }: GovernancePanelProps) {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<PanelTab>('secretariats')
  const [secretariats, setSecretariats] = useState<MunicipalSecretariat[]>([])
  const [modules, setModules] = useState<MunicipalModule[]>([])
  const [users, setUsers] = useState<GovernanceUser[]>([])
  const [orgUnits, setOrgUnits] = useState<OrgUnit[]>([])
  const [secretariatDraft, setSecretariatDraft] = useState<SecretariatDraft | null>(null)
  const [orgUnitDraft, setOrgUnitDraft] = useState<OrgUnitDraft | null>(null)
  const [userDraft, setUserDraft] = useState<UserDraft | null>(null)
  const [saving, setSaving] = useState(false)

  const loadPanel = useCallback(async (showLoading: boolean) => {
    if (!supabase) {
      setAuthorized(false)
      setLoadError('O serviço de dados não está configurado.')
      setLoading(false)
      return
    }
    if (showLoading) setLoading(true)
    setLoadError('')
    const { data: admin, error: adminError } = await supabase.rpc('municipal_governance_is_admin')
    if (adminError || admin !== true) {
      setAuthorized(false)
      setLoadError(adminError ? 'Não foi possível validar o perfil administrativo.' : 'Esta área está disponível somente para usuários administradores ativos.')
      setLoading(false)
      return
    }
    setAuthorized(true)

    const [secretariatResult, moduleResult, userResult, orgResult] = await Promise.all([
      supabase.from('municipal_secretariats').select('id,name,description,icon_name,sort_order,is_active').order('sort_order', { ascending: true }),
      supabase.from('municipal_modules').select('id,label,description,icon_name,is_ready,status_label,sort_order').order('sort_order', { ascending: true }),
      supabase.rpc('municipal_governance_list_users'),
      supabase.rpc('municipal_governance_list_org_units'),
    ])
    const failed = secretariatResult.error || moduleResult.error || userResult.error || orgResult.error
    if (failed) {
      setLoadError('Não foi possível carregar os cadastros de Governança. Verifique se a estrutura do Supabase está atualizada.')
      setLoading(false)
      return
    }

    setSecretariats((secretariatResult.data || []) as unknown as MunicipalSecretariat[])
    setModules((moduleResult.data || []) as unknown as MunicipalModule[])
    setUsers((userResult.data || []) as unknown as GovernanceUser[])
    setOrgUnits((orgResult.data || []) as unknown as OrgUnit[])
    setLoading(false)
  }, [])

  useEffect(() => { void loadPanel(false) }, [loadPanel])

  const saveSecretariat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !secretariatDraft) return
    const name = secretariatDraft.name.trim()
    const description = secretariatDraft.description.trim()
    const sortOrder = Number(secretariatDraft.sort_order)
    if (!name || !Number.isInteger(sortOrder) || sortOrder < 1) {
      setMessage({ type: 'error', text: 'Informe um nome e uma ordem inteira maior que zero.' })
      return
    }
    const id = secretariatDraft.id || slugify(name)
    if (!id) {
      setMessage({ type: 'error', text: 'Não foi possível gerar um identificador para esta secretaria.' })
      return
    }

    setSaving(true)
    setMessage(null)
    const payload = {
      name,
      description,
      icon_name: secretariatDraft.icon_name,
      sort_order: sortOrder,
      is_active: secretariatDraft.is_active,
      updated_at: new Date().toISOString(),
    }
    const result = secretariatDraft.id
      ? await supabase.from('municipal_secretariats').update(payload).eq('id', id)
      : await supabase.from('municipal_secretariats').insert({ id, ...payload })
    if (result.error) {
      setSaving(false)
      setMessage({ type: 'error', text: result.error.code === '23505' ? 'Já existe uma secretaria com esse identificador. Edite o cadastro existente ou escolha outro nome.' : 'Não foi possível salvar a secretaria. Confira os dados e tente novamente.' })
      return
    }
    setSecretariatDraft(null)
    setSaving(false)
    setMessage({ type: 'success', text: secretariatDraft.id ? 'Secretaria atualizada.' : 'Secretaria cadastrada.' })
    await loadPanel(false)
  }

  const saveOrgUnit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase || !orgUnitDraft) return
    const id = slugify(orgUnitDraft.id || orgUnitDraft.name)
    const sortOrder = Number(orgUnitDraft.sort_order)
    if (!id || !orgUnitDraft.code.trim() || !orgUnitDraft.name.trim() || !Number.isInteger(sortOrder)) {
      setMessage({ type: 'error', text: 'Informe identificador, sigla, nome e uma ordem inteira para a unidade.' })
      return
    }
    setSaving(true)
    setMessage(null)
    const { error } = await supabase.rpc('municipal_governance_save_org_unit', {
      p_id: id,
      p_parent_id: orgUnitDraft.parent_id || null,
      p_code: orgUnitDraft.code.trim(),
      p_name: orgUnitDraft.name.trim(),
      p_unit_type: orgUnitDraft.unit_type,
      p_description: orgUnitDraft.description.trim(),
      p_sort_order: sortOrder,
      p_is_active: orgUnitDraft.is_active,
    })
    setSaving(false)
    if (error) {
      setMessage({ type: 'error', text: errorText(error) })
      return
    }
    setOrgUnitDraft(null)
    setMessage({ type: 'success', text: 'Unidade organizacional salva.' })
    await loadPanel(false)
  }

  const saveUser = async (draft: UserDraft) => {
    if (!supabase) return
    if (!draft.perfil_municipal) {
      setMessage({ type: 'error', text: 'Selecione um perfil municipal.' })
      return
    }
    setSaving(true)
    setMessage(null)
    try {
      if (draft.user_id === null) {
        const { data, error } = await supabase.functions.invoke('invite-municipal-user', {
          body: {
            nome: draft.name.trim(),
            email: draft.email.trim().toLowerCase(),
            perfil_municipal: draft.perfil_municipal,
            secretariat_ids: draft.secretariat_ids,
            module_ids: draft.module_ids,
          },
        })
        if (error) throw new Error(error.message || 'Não foi possível enviar o convite.')
        if (data?.registration_pending) {
          setUserDraft(null)
          setMessage({ type: 'error', text: String(data.error || 'O convite foi enviado, mas os vínculos precisam ser conferidos na lista de usuários antes de reenviar.') })
          await loadPanel(false)
          return
        }
        if (data?.error) throw new Error(String(data.error))
        setUserDraft(null)
        setMessage({ type: 'success', text: `Convite enviado para ${draft.email.trim()}. O usuário definirá a própria senha no primeiro acesso.` })
      } else {
        const { error } = await supabase.rpc('municipal_governance_save_user_assignments', {
          p_user_id: draft.user_id,
          p_profile: draft.perfil_municipal,
          p_secretariat_ids: draft.secretariat_ids,
          p_module_ids: draft.module_ids,
        })
        if (error) throw error
        setUserDraft(null)
        setMessage({ type: 'success', text: 'Perfil e vínculos cadastrais atualizados. Os acessos atuais permanecem inalterados.' })
      }
      await loadPanel(false)
    } catch (error) {
      setMessage({ type: 'error', text: errorText(error) })
    } finally {
      setSaving(false)
    }
  }

  const openNewSecretariat = () => {
    setMessage(null)
    setSecretariatDraft({
      id: null,
      name: '',
      description: '',
      icon_name: 'Building2',
      sort_order: String(Math.max(0, ...secretariats.map((item) => item.sort_order)) + 1),
      is_active: true,
    })
  }

  const openNewOrgUnit = () => {
    setMessage(null)
    setOrgUnitDraft({ id: '', parent_id: 'municipality', code: '', name: '', unit_type: 'UNIDADE', description: '', sort_order: String(orgUnits.length + 1), is_active: true })
  }

  const openEditUser = (user: GovernanceUser) => {
    setMessage(null)
    setUserDraft({
      user_id: user.user_id,
      name: user.name || '',
      email: user.email,
      perfil_municipal: user.perfil_municipal || '',
      legacy_admin: user.legacy_admin,
      secretariat_ids: user.secretariat_ids || [],
      module_ids: user.module_ids || [],
    })
  }

  const activeSecretariatCount = secretariats.filter((item) => item.is_active).length
  const orderedOrgUnits = orderOrgUnits(orgUnits)

  return (
    <div className="governance-shell">
      <header className="governance-header">
        <div className="governance-header-inner">
          <div className="governance-brand">
            <span className="governance-brand-mark"><img src={`${assetBase}assets/brasao-pref.png`} alt="" /></span>
            <span><strong>Inteligência Municipal</strong><small>Governança</small></span>
          </div>
          <div className="governance-header-actions">
            <span className="governance-user-email">{userEmail || 'Administrador'}</span>
            <button className="governance-logout" type="button" onClick={onLogout} aria-label="Sair do sistema"><LogOut size={17} /><span>Sair</span></button>
          </div>
        </div>
      </header>

      <main className="governance-main">
        <div className="governance-content">
          <button className="governance-back" type="button" onClick={onBack}><ArrowLeft size={17} />Voltar ao hall</button>

          {loading ? (
            <div className="governance-empty" role="status">Verificando acesso e carregando cadastros…</div>
          ) : authorized !== true ? (
            <section className="governance-empty governance-empty--error" role="alert">
              <ShieldCheck size={28} aria-hidden="true" />
              <h1>Governança indisponível</h1>
              <p>{loadError || 'Acesso administrativo necessário.'}</p>
            </section>
          ) : (
            <>
              <div className="governance-heading">
                <div>
                  <span className="governance-eyebrow">PAINEL ADMINISTRATIVO</span>
                  <h1>Governança municipal</h1>
                  <p>Organize as secretarias, os perfis e o catálogo de módulos.</p>
                </div>
              </div>

              <aside className="governance-policy-note" role="note">
                <CircleAlert size={20} aria-hidden="true" />
              <p><strong>Núcleo de acesso ativo:</strong> a estrutura organizacional, os papéis e as concessões de módulo são mantidos no Supabase. O módulo Saúde da Família/ACS já usa essa concessão em conjunto com o escopo territorial de zona e lote.</p>
              </aside>

              {message && <div className={`governance-message governance-message--${message.type}`} role={message.type === 'error' ? 'alert' : 'status'}>{message.type === 'success' ? <Check size={17} /> : <CircleAlert size={17} />}{message.text}</div>}

              <nav className="governance-tabs" aria-label="Seções de Governança">
                <button className={activeTab === 'organization' ? 'is-active' : ''} type="button" aria-pressed={activeTab === 'organization'} onClick={() => setActiveTab('organization')}><ListTree size={17} />Estrutura<span>{orgUnits.length}</span></button>
                <button className={activeTab === 'secretariats' ? 'is-active' : ''} type="button" aria-pressed={activeTab === 'secretariats'} onClick={() => setActiveTab('secretariats')}><Building2 size={17} />Secretarias<span>{activeSecretariatCount}</span></button>
                <button className={activeTab === 'users' ? 'is-active' : ''} type="button" aria-pressed={activeTab === 'users'} onClick={() => setActiveTab('users')}><Users size={17} />Usuários<span>{users.length}</span></button>
                <button className={activeTab === 'modules' ? 'is-active' : ''} type="button" aria-pressed={activeTab === 'modules'} onClick={() => setActiveTab('modules')}><LayoutGrid size={17} />Catálogo de módulos<span>{modules.length}</span></button>
              </nav>

              {activeTab === 'organization' && (
                <section className="governance-section" aria-labelledby="organizationHeading">
                  <div className="governance-section-heading">
                    <div><h2 id="organizationHeading">Estrutura organizacional</h2><p>Unidades permanentes do organograma. Inativar uma unidade preserva o histórico e impede novos vínculos.</p></div>
                    <button className="governance-primary-button" type="button" onClick={openNewOrgUnit}><FilePlus2 size={17} />Nova unidade</button>
                  </div>
                  <div className="governance-org-list">
                    {orderedOrgUnits.map((unit) => {
                      const levelStyle = { '--org-level': unit.level } as CSSProperties
                      return <article className={`governance-org-row governance-org-row--${unit.unit_type.toLowerCase()}${unit.level > 0 ? ' has-parent' : ''}${unit.is_active ? '' : ' is-inactive'}`} style={levelStyle} key={unit.id}>
                        <span className="governance-org-code" style={{ marginLeft: `${unit.level * 24}px` }}>{unit.code}</span>
                        <div className="governance-org-copy" style={{ paddingLeft: `${unit.level * 24}px` }}><strong>{unit.name}</strong><span>{unit.unit_type}{unit.description ? ` · ${unit.description}` : ''}</span></div>
                        <span className={`governance-status${unit.is_active ? ' is-active' : ''}`}>{unit.is_active ? 'Ativa' : 'Inativa'}</span>
                        <button className="governance-edit-button" type="button" onClick={() => setOrgUnitDraft({ id: unit.id, parent_id: unit.parent_id || '', code: unit.code, name: unit.name, unit_type: unit.unit_type, description: unit.description, sort_order: String(unit.sort_order), is_active: unit.is_active })}><Pencil size={16} /><span>Editar</span></button>
                      </article>
                    })}
                  </div>
                </section>
              )}

              {activeTab === 'secretariats' && (
                <section className="governance-section" aria-labelledby="secretariatsHeading">
                  <div className="governance-section-heading">
                    <div><h2 id="secretariatsHeading">Secretarias</h2><p>Os cadastros são permanentes; marque como inativa para retirar um card do hall.</p></div>
                    <button className="governance-primary-button" type="button" onClick={openNewSecretariat}><FilePlus2 size={17} />Nova secretaria</button>
                  </div>
                  {secretariats.length === 0 ? (
                    <div className="governance-empty">Nenhuma secretaria cadastrada.</div>
                  ) : (
                    <div className="governance-secretariat-grid">
                      {secretariats.map((secretariat) => {
                        const Icon = getMunicipalIcon(secretariat.icon_name)
                        return (
                          <article className={`governance-secretariat-card${secretariat.is_active ? '' : ' is-inactive'}`} key={secretariat.id}>
                            <div className="governance-secretariat-top">
                              <span className="governance-secretariat-icon"><Icon size={22} aria-hidden="true" /></span>
                              <span className={`governance-status${secretariat.is_active ? ' is-active' : ''}`}>{secretariat.is_active ? 'Ativa no hall' : 'Inativa'}</span>
                            </div>
                            <h3>{secretariat.name}</h3>
                            <p>{secretariat.description || 'Sem descrição cadastrada.'}</p>
                            <div className="governance-secretariat-footer">
                              <span>Ordem {secretariat.sort_order}</span>
                              <button className="governance-text-button" type="button" onClick={() => { setMessage(null); setSecretariatDraft({ id: secretariat.id, name: secretariat.name, description: secretariat.description, icon_name: secretariat.icon_name, sort_order: String(secretariat.sort_order), is_active: secretariat.is_active }) }}><Pencil size={15} />Editar</button>
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'users' && (
                <section className="governance-section" aria-labelledby="usersHeading">
                  <div className="governance-section-heading">
                    <div><h2 id="usersHeading">Usuários</h2><p>Associe uma pessoa a várias secretarias e escolha módulos sem depender dessas associações.</p></div>
                <button className="governance-primary-button" type="button" onClick={() => { setMessage(null); setUserDraft({ user_id: null, name: '', email: '', perfil_municipal: '', legacy_admin: false, secretariat_ids: [], module_ids: [] }) }}><MailPlus size={17} />Convidar usuário</button>
                  </div>
                  {users.length === 0 ? (
                    <div className="governance-empty">Nenhum usuário municipal ativo foi encontrado.</div>
                  ) : (
                    <div className="governance-user-list">
                      {users.map((user) => (
                        <article className="governance-user-row" key={user.user_id}>
                          <span className="governance-user-avatar" aria-hidden="true">{(user.name || user.email || 'U').trim()[0]?.toUpperCase()}</span>
                          <div className="governance-user-main"><strong>{user.name || 'Nome não informado'}</strong><span>{user.email}</span></div>
                          <span className="governance-profile-badge">{profileLabel(user.perfil_municipal)}</span>
                          <span className="governance-user-summary">{user.secretariat_ids?.length || 0} secretarias · {user.module_ids?.length || 0} módulos</span>
                          <button className="governance-edit-button" type="button" aria-label={`Editar perfil e vínculos de ${user.name || user.email}`} onClick={() => openEditUser(user)}><Pencil size={16} /><span>Editar</span></button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'modules' && (
                <section className="governance-section" aria-labelledby="modulesHeading">
                  <div className="governance-section-heading">
                    <div><h2 id="modulesHeading">Catálogo de módulos</h2><p>Este catálogo serve para registrar atribuições. A situação do módulo não altera o acesso atual.</p></div>
                  </div>
                  <div className="governance-module-grid">
                    {modules.map((module) => {
                      const Icon = getMunicipalIcon(module.icon_name)
                      return (
                        <article className="governance-module-card" key={module.id}>
                          <span className="governance-module-icon"><Icon size={22} aria-hidden="true" /></span>
                          <div className="governance-module-copy"><h3>{module.label}</h3><p>{module.description}</p></div>
                          <span className={`governance-status${module.is_ready ? ' is-active' : ''}`}>{module.status_label}</span>
                        </article>
                      )
                    })}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </main>

      {secretariatDraft && (
        <SecretariatDialog
          draft={secretariatDraft}
          saving={saving}
          onChange={setSecretariatDraft}
          onCancel={() => setSecretariatDraft(null)}
          onSubmit={(event) => void saveSecretariat(event)}
        />
      )}
      {orgUnitDraft && (
        <OrgUnitDialog draft={orgUnitDraft} units={orgUnits} saving={saving} onChange={setOrgUnitDraft} onCancel={() => setOrgUnitDraft(null)} onSubmit={(event) => void saveOrgUnit(event)} />
      )}
      {userDraft && (
        <UserDialog
          initial={userDraft}
          secretariats={secretariats}
          modules={modules}
          saving={saving}
          onCancel={() => setUserDraft(null)}
          onSubmit={(draft) => void saveUser(draft)}
        />
      )}
    </div>
  )
}

function OrgUnitDialog({
  draft,
  units,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: OrgUnitDraft
  units: OrgUnit[]
  saving: boolean
  onChange: (draft: OrgUnitDraft) => void
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  const unitTypes = ['ORGAO', 'SECRETARIA', 'DEPARTAMENTO', 'DIVISAO', 'ASSESSORIA', 'COMISSAO', 'UNIDADE']
  return (
    <div className="governance-overlay">
      <section className="governance-dialog" role="dialog" aria-modal="true" aria-labelledby="orgUnitDialogTitle">
        <div className="governance-dialog-heading"><div><span className="governance-eyebrow">ESTRUTURA PERMANENTE</span><h2 id="orgUnitDialogTitle">{draft.id ? 'Editar unidade' : 'Nova unidade'}</h2></div><button className="governance-close" type="button" aria-label="Fechar" onClick={onCancel}><X size={20} /></button></div>
        <form onSubmit={onSubmit}>
          <div className="governance-form-grid governance-form-grid--two">
            <label className="governance-field">Identificador<input value={draft.id} onChange={(event) => onChange({ ...draft, id: event.target.value })} placeholder="ex.: saude-familia" maxLength={80} required /></label>
            <label className="governance-field">Sigla ou código<input value={draft.code} onChange={(event) => onChange({ ...draft, code: event.target.value })} maxLength={40} required /></label>
            <label className="governance-field governance-field--full">Nome da unidade<input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} maxLength={160} required /></label>
            <label className="governance-field">Unidade superior<select value={draft.parent_id} onChange={(event) => onChange({ ...draft, parent_id: event.target.value })}><option value="">Sem superior</option>{units.filter((unit) => unit.id !== draft.id).map((unit) => <option key={unit.id} value={unit.id}>{unit.code} · {unit.name}</option>)}</select></label>
            <label className="governance-field">Tipo<select value={draft.unit_type} onChange={(event) => onChange({ ...draft, unit_type: event.target.value })}>{unitTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label className="governance-field">Ordem<input type="number" min={0} step={1} value={draft.sort_order} onChange={(event) => onChange({ ...draft, sort_order: event.target.value })} required /></label>
            <label className="governance-field governance-field--full">Descrição<textarea value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} rows={3} maxLength={500} /></label>
            <label className="governance-check governance-field--full"><input type="checkbox" checked={draft.is_active} onChange={(event) => onChange({ ...draft, is_active: event.target.checked })} /><span><strong>Unidade ativa</strong><small>Unidades inativas não recebem novos vínculos, mas permanecem no histórico.</small></span></label>
          </div>
          <div className="governance-dialog-actions"><button className="governance-secondary-button" type="button" onClick={onCancel}>Cancelar</button><button className="governance-primary-button" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar unidade'}</button></div>
        </form>
      </section>
    </div>
  )
}

function SecretariatDialog({
  draft,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: SecretariatDraft
  saving: boolean
  onChange: (draft: SecretariatDraft) => void
  onCancel: () => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <div className="governance-overlay">
      <section className="governance-dialog" role="dialog" aria-modal="true" aria-labelledby="secretariatDialogTitle">
        <div className="governance-dialog-heading"><div><span className="governance-eyebrow">CADASTRO PERMANENTE</span><h2 id="secretariatDialogTitle">{draft.id ? 'Editar secretaria' : 'Nova secretaria'}</h2></div><button className="governance-close" type="button" aria-label="Fechar" onClick={onCancel}><X size={20} /></button></div>
        <form onSubmit={onSubmit}>
          <div className="governance-form-grid">
            <label className="governance-field governance-field--full">Nome da secretaria<input value={draft.name} onChange={(event) => onChange({ ...draft, name: event.target.value })} maxLength={120} required /></label>
            <label className="governance-field governance-field--full">Descrição<textarea value={draft.description} onChange={(event) => onChange({ ...draft, description: event.target.value })} rows={3} maxLength={500} /></label>
            <label className="governance-field">Ícone<select value={draft.icon_name} onChange={(event) => onChange({ ...draft, icon_name: event.target.value })}>{MUNICIPAL_ICON_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="governance-field">Ordem no hall<input type="number" min={1} step={1} value={draft.sort_order} onChange={(event) => onChange({ ...draft, sort_order: event.target.value })} required /></label>
            <label className="governance-check governance-field--full"><input type="checkbox" checked={draft.is_active} onChange={(event) => onChange({ ...draft, is_active: event.target.checked })} /><span><strong>Secretaria ativa</strong><small>Quando ativa, aparece como card no hall para todos os usuários.</small></span></label>
          </div>
          <div className="governance-dialog-actions"><button className="governance-secondary-button" type="button" onClick={onCancel}>Cancelar</button><button className="governance-primary-button" type="submit" disabled={saving}>{saving ? 'Salvando…' : 'Salvar secretaria'}</button></div>
        </form>
      </section>
    </div>
  )
}

function UserDialog({
  initial,
  secretariats,
  modules,
  saving,
  onCancel,
  onSubmit,
}: {
  initial: UserDraft
  secretariats: MunicipalSecretariat[]
  modules: MunicipalModule[]
  saving: boolean
  onCancel: () => void
  onSubmit: (draft: UserDraft) => void
}) {
  const [draft, setDraft] = useState<UserDraft>(initial)
  const isInvite = draft.user_id === null

  const toggleId = (key: 'secretariat_ids' | 'module_ids', id: string) => {
    const current = draft[key]
    setDraft({ ...draft, [key]: current.includes(id) ? current.filter((item) => item !== id) : [...current, id] })
  }

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit(draft)
  }

  return (
    <div className="governance-overlay">
      <section className="governance-dialog governance-dialog--wide" role="dialog" aria-modal="true" aria-labelledby="userDialogTitle">
        <div className="governance-dialog-heading"><div><span className="governance-eyebrow">{isInvite ? 'CONVITE INDIVIDUAL' : 'CADASTRO MUNICIPAL'}</span><h2 id="userDialogTitle">{isInvite ? 'Convidar usuário' : 'Perfil e vínculos do usuário'}</h2></div><button className="governance-close" type="button" aria-label="Fechar" onClick={onCancel}><X size={20} /></button></div>
        <form onSubmit={submit}>
          {isInvite ? (
            <div className="governance-form-grid governance-form-grid--two">
              <label className="governance-field">Nome completo<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} autoComplete="name" maxLength={160} required /></label>
              <label className="governance-field">E-mail<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} autoComplete="email" maxLength={254} required /></label>
            </div>
          ) : (
            <div className="governance-user-identity"><strong>{draft.name || 'Nome não informado'}</strong><span>{draft.email}</span></div>
          )}

          <label className="governance-field governance-profile-field">Perfil municipal<select value={draft.perfil_municipal} onChange={(event) => setDraft({ ...draft, perfil_municipal: event.target.value })} required disabled={draft.legacy_admin}><option value="">Selecione um perfil</option>{MUNICIPAL_PROFILES.map((profile) => <option key={profile.value} value={profile.value}>{profile.label}</option>)}</select>{draft.legacy_admin && <small className="governance-field-hint">O administrador ativo existente permanece administrador nesta etapa.</small>}</label>

          <div className="governance-assignment-note"><ShieldCheck size={18} aria-hidden="true" /><p>É possível selecionar mais de uma secretaria e módulos de qualquer área. Nesta etapa, os vínculos são apenas registrados e não alteram os acessos atuais.</p></div>

          <div className="governance-assignment-columns">
            <fieldset className="governance-check-group">
              <legend>Secretarias associadas</legend>
              <p>Selecione todas as áreas às quais a pessoa pertence.</p>
              <div className="governance-checkbox-list">
                {secretariats.map((secretariat) => (
                  <label className="governance-check" key={secretariat.id}>
                    <input type="checkbox" checked={draft.secretariat_ids.includes(secretariat.id)} onChange={() => toggleId('secretariat_ids', secretariat.id)} />
                    <span><strong>{secretariat.name}</strong>{!secretariat.is_active && <small>Inativa no hall</small>}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <fieldset className="governance-check-group">
              <legend>Módulos atribuídos</legend>
              <p>Escolha independentemente das secretarias associadas.</p>
              <div className="governance-checkbox-list">
                {modules.map((module) => (
                  <label className="governance-check" key={module.id}>
                    <input type="checkbox" checked={draft.module_ids.includes(module.id)} onChange={() => toggleId('module_ids', module.id)} />
                    <span><strong>{module.label}</strong><small>{module.status_label}</small></span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>
          <div className="governance-dialog-actions"><button className="governance-secondary-button" type="button" onClick={onCancel}>Cancelar</button><button className="governance-primary-button" type="submit" disabled={saving}>{saving ? 'Salvando…' : isInvite ? 'Enviar convite' : 'Salvar vínculos'}</button></div>
        </form>
      </section>
    </div>
  )
}
