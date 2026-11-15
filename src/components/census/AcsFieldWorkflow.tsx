import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, CheckCircle2, ClipboardList, LoaderCircle, MapPinned, UserRound, UsersRound } from 'lucide-react'
import type { MunicipalAccessContextValue } from '../../auth/MunicipalAccessContext'
import { supabase } from '../../lib/supabase'
import './AcsFieldWorkflow.css'

type Task = { id: string; due_date: string; priority: number; status: 'PLANNED' | 'IN_PROGRESS'; task_type: string; instructions: string; household_id: string | null; family_id: string | null; citizen_id: string | null; family_reference: string | null; citizen_name: string | null; reason_code: string | null; reason_label: string | null; address_line: string | null; address_number: string | null; address_complement: string | null; neighborhood: string | null; locality: string | null; postal_code: string | null }
type Catalog = { id: string; code: string; label: string; version: number }
type Scope = { municipality: string; establishment: string; team: string; microarea: string }

function formatDate(value: string) {
  const date = new Date(`${value.slice(0, 10)}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date)
}

function digits(value: string) { return value.replace(/\D/g, '') }

function isValidCpf(value: string) {
  const cpf = digits(value)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  let sum = 0
  for (let index = 0; index < 9; index += 1) sum += Number(cpf[index]) * (10 - index)
  let digit = (sum * 10) % 11
  if (digit === 10) digit = 0
  if (digit !== Number(cpf[9])) return false
  sum = 0
  for (let index = 0; index < 10; index += 1) sum += Number(cpf[index]) * (11 - index)
  digit = (sum * 10) % 11
  if (digit === 10) digit = 0
  return digit === Number(cpf[10])
}

export function AcsFieldWorkflow({ accessContext, onOpenTerritory }: { accessContext: MunicipalAccessContextValue; onOpenTerritory: () => void }) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [scope, setScope] = useState<Scope>({ municipality: 'Município', establishment: 'Não atribuído', team: 'Não atribuído', microarea: 'Não atribuído' })
  const [reasons, setReasons] = useState<Catalog[]>([])
  const [outcomes, setOutcomes] = useState<Catalog[]>([])
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [selectedReasons, setSelectedReasons] = useState<string[]>([])
  const [outcome, setOutcome] = useState('REALIZADA')
  const [visitDate, setVisitDate] = useState(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()))
  const [notes, setNotes] = useState('')
  const [guidance, setGuidance] = useState('')
  const [referral, setReferral] = useState('')
  const [returnDate, setReturnDate] = useState('')
  const [familyReference, setFamilyReference] = useState('')
  const [citizenName, setCitizenName] = useState('')
  const [citizenBirthDate, setCitizenBirthDate] = useState('')
  const [citizenSex, setCitizenSex] = useState('NI')
  const [citizenCns, setCitizenCns] = useState('')
  const [citizenCpf, setCitizenCpf] = useState('')
  const [savingPerson, setSavingPerson] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const orderedTasks = useMemo(() => [...tasks].sort((a, b) => a.due_date.localeCompare(b.due_date) || b.priority - a.priority), [tasks])
  const selectedTask = useMemo(() => orderedTasks.find((task) => task.id === selectedTaskId) || null, [selectedTaskId, orderedTasks])
  const professional = accessContext.foundation?.professional
  const selectedOutcome = outcomes.find((item) => item.code === outcome)

  async function load() {
    if (!supabase) return
    setLoading(true); setError('')
    const [contextResult, reasonsResult, outcomesResult] = await Promise.all([
      supabase.rpc('census_foundation_my_context'),
      supabase.from('census_visit_reason_catalog').select('id,code,label,version').eq('active', true).order('label').limit(100),
      supabase.from('census_visit_outcome_catalog').select('id,code,label,version').eq('active', true).order('label').limit(50),
    ])
    if (contextResult.error) setError(contextResult.error.message)
    else {
      const context = (contextResult.data || {}) as Record<string, unknown>
      setTasks((context.tasks || []) as Task[])
      const assignment = (Array.isArray(context.assignments) ? context.assignments : [])[0] as Record<string, string> | undefined
      const municipalityId = professional?.municipalityId || assignment?.municipality_id
      const establishmentId = assignment?.establishment_id
      const teamId = assignment?.team_id
      const microareaId = assignment?.microarea_id
      const [municipalityResult, establishmentResult, teamResult, microareaResult] = await Promise.all([
        municipalityId ? supabase.from('municipalities').select('name').eq('id', municipalityId).limit(1).maybeSingle() : Promise.resolve({ data: null }),
        establishmentId ? supabase.from('health_establishments').select('name').eq('id', establishmentId).limit(1).maybeSingle() : Promise.resolve({ data: null }),
        teamId ? supabase.from('health_teams').select('name').eq('id', teamId).limit(1).maybeSingle() : Promise.resolve({ data: null }),
        microareaId ? supabase.from('health_microareas').select('name,code').eq('id', microareaId).limit(1).maybeSingle() : Promise.resolve({ data: null }),
      ])
      setScope({ municipality: municipalityResult.data?.name || 'Município', establishment: establishmentResult.data?.name || 'Não atribuído', team: teamResult.data?.name || 'Não atribuído', microarea: microareaResult.data ? `${microareaResult.data.name || 'Microárea'}${microareaResult.data.code ? ` · ${microareaResult.data.code}` : ''}` : 'Não atribuído' })
    }
    if (reasonsResult.error) setError(reasonsResult.error.message); else setReasons((reasonsResult.data || []) as Catalog[])
    if (outcomesResult.error) setError(outcomesResult.error.message); else setOutcomes((outcomesResult.data || []) as Catalog[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [])

  async function createFamilyAndCitizen() {
    if (!supabase || !selectedTask?.household_id || !familyReference.trim() || !citizenName.trim()) return
    const cns = digits(citizenCns)
    const cpf = digits(citizenCpf)
    if (cns && cns.length !== 15) { setError('O CNS deve conter 15 dígitos.'); return }
    if (cpf && !isValidCpf(cpf)) { setError('Informe um CPF válido ou deixe o campo em branco.'); return }
    setSavingPerson(true); setError(''); setNotice('')
    try {
      const familyResult = selectedTask.family_id
        ? { data: { id: selectedTask.family_id }, error: null }
        : await supabase.from('census_families').insert({ household_id: selectedTask.household_id, family_reference: familyReference.trim() }).select('id').single()
      if (familyResult.error || !familyResult.data) throw new Error(familyResult.error?.message || 'Não foi possível criar a família.')
      const citizenResult = await supabase.from('census_citizens').insert({ family_id: familyResult.data.id, full_name: citizenName.trim(), birth_date: citizenBirthDate || null, sex: citizenSex, cns: cns || null, cpf: cpf || null, identification_status: cns || cpf ? 'DECLARED' : 'PROVISIONAL', data_source: 'CITIZEN_REPORTED' }).select('id').single()
      if (citizenResult.error || !citizenResult.data) throw new Error(citizenResult.error?.message || 'Não foi possível cadastrar o cidadão.')
      const memberResult = await supabase.from('census_family_members').insert({ family_id: familyResult.data.id, citizen_id: citizenResult.data.id, relationship_code: 'MEMBER', is_responsible: true })
      if (memberResult.error) throw new Error(memberResult.error.message)
      const linkResult = await supabase.rpc('census_attach_task_subject', { p_task_id: selectedTask.id, p_family_id: familyResult.data.id, p_citizen_id: citizenResult.data.id })
      if (linkResult.error) throw new Error(linkResult.error.message)
      setCitizenCns(''); setCitizenCpf('')
      setNotice(`Família e cidadão cadastrados. ${cns || cpf ? 'Os identificadores foram validados localmente e permanecem declarados até a confirmação oficial.' : 'O histórico será mantido como identificação provisória até validação posterior.'}`)
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível salvar a família e o cidadão.') }
    finally { setSavingPerson(false) }
  }

  async function registerFvd() {
    if (!supabase || !selectedTask?.household_id || !selectedReasons.length || !outcome || !visitDate) return
    if (outcome !== 'REALIZADA' && !notes.trim()) { setError('Informe a justificativa para este desfecho.'); return }
    setSaving(true); setError(''); setNotice('')
    const result = await supabase.rpc('census_register_fvd', { p_task_id: selectedTask.id, p_household_id: selectedTask.household_id, p_family_id: selectedTask.family_id, p_citizen_id: selectedTask.citizen_id, p_visit_date: visitDate, p_reason_codes: selectedReasons, p_outcome_code: outcome, p_notes: notes.trim(), p_guidance: guidance.trim(), p_referral: referral.trim(), p_return_date: returnDate || null })
    if (result.error) setError(result.error.message)
    else { setNotice('FVD registrada e tarefa concluída. O registro foi validado localmente e permanece auditável.'); setNotes(''); setGuidance(''); setReferral(''); setReturnDate(''); setSelectedTaskId(''); await load() }
    setSaving(false)
  }

  return <section className="acs-field-workflow" aria-busy={loading || saving}>
    <div className="acs-field-heading"><div><span className="fleet-kicker">ROTINA DE CAMPO · {professional?.professionalCategory || 'ACS'}</span><h2>Agenda e FVD</h2><p>Veja o próximo trabalho, identifique a família e registre a visita com motivo e desfecho codificados.</p></div><button type="button" className="fleet-secondary-button" onClick={onOpenTerritory}><MapPinned size={15} />Abrir meus domicílios</button></div>
    {notice && <div className="acs-field-notice success"><CheckCircle2 size={16} />{notice}</div>}
    {error && <div className="acs-field-notice error">{error}</div>}
    {!loading && <div className="acs-scope-strip"><span><small>Município</small><strong>{scope.municipality}</strong></span><span><small>Estabelecimento</small><strong>{scope.establishment}</strong></span><span><small>Equipe</small><strong>{scope.team}</strong></span><span><small>Microárea</small><strong>{scope.microarea}</strong></span></div>}
    {loading ? <div className="acs-field-empty"><LoaderCircle className="spin" size={22} />Carregando sua agenda…</div> : <div className="acs-field-grid">
      <section className="acs-task-list"><header><div><span className="acs-field-eyebrow"><CalendarClock size={14} /> PRÓXIMAS ATIVIDADES</span><h3>{orderedTasks.length ? `${orderedTasks.length} tarefa(s) em aberto` : 'Nenhuma tarefa planejada'}</h3></div></header>{orderedTasks.length === 0 ? <div className="acs-field-empty"><ClipboardList size={24} /><strong>Sua agenda está livre</strong><span>Quando uma tarefa for atribuída à sua equipe ou microárea, ela aparecerá aqui.</span></div> : <div className="acs-task-items">{orderedTasks.map((task) => <button type="button" key={task.id} className={`acs-task-item${selectedTaskId === task.id ? ' active' : ''}`} onClick={() => setSelectedTaskId(task.id)}><span className="acs-task-priority">{task.priority}</span><span><strong>{task.citizen_name || task.family_reference || 'Domicílio da microárea'}</strong><small>{formatDate(task.due_date)} · {task.reason_label || 'Atividade de campo'}{task.address_line ? ` · ${task.address_line}${task.address_number ? `, ${task.address_number}` : ''}` : ''}{task.neighborhood || task.locality ? ` · ${task.neighborhood || task.locality}` : ''}{task.instructions ? ` · ${task.instructions}` : ''}</small></span></button>)}</div>}</section>
      {selectedTask && <section className="acs-fvd-card"><header><div><span className="acs-field-eyebrow"><ClipboardList size={14} /> FICHA DE VISITA DOMICILIAR</span><h3>{selectedTask.citizen_name || selectedTask.family_reference || 'Domicílio selecionado'}</h3><p>{selectedTask.address_line ? `Endereço: ${selectedTask.address_line}${selectedTask.address_number ? `, ${selectedTask.address_number}` : ''}${selectedTask.neighborhood || selectedTask.locality ? ` · ${selectedTask.neighborhood || selectedTask.locality}` : ''}. ` : ''}Tarefa prevista para {formatDate(selectedTask.due_date)}. O desfecho será salvo com a versão vigente do catálogo.</p></div></header>
        {!selectedTask.family_id && <div className="acs-person-block"><h4><UsersRound size={15} />Cadastrar família e cidadão</h4><div className="acs-form-grid"><label>Referência da família<input value={familyReference} onChange={(event) => setFamilyReference(event.target.value)} placeholder="Ex.: Família 01" /></label><label>Nome do cidadão<input value={citizenName} onChange={(event) => setCitizenName(event.target.value)} placeholder="Nome informado pelo cidadão" /></label><label>Data de nascimento<input type="date" value={citizenBirthDate} onChange={(event) => setCitizenBirthDate(event.target.value)} /></label><label>Sexo<select value={citizenSex} onChange={(event) => setCitizenSex(event.target.value)}><option value="NI">Não informado</option><option value="F">Feminino</option><option value="M">Masculino</option><option value="O">Outro</option></select></label><label>CNS (opcional)<input value={citizenCns} onChange={(event) => setCitizenCns(event.target.value)} inputMode="numeric" maxLength={18} placeholder="15 dígitos" /></label><label>CPF (opcional)<input value={citizenCpf} onChange={(event) => setCitizenCpf(event.target.value)} inputMode="numeric" maxLength={14} placeholder="000.000.000-00" /></label></div><button type="button" className="fleet-secondary-button" onClick={() => void createFamilyAndCitizen()} disabled={savingPerson || !familyReference.trim() || !citizenName.trim()}>{savingPerson ? 'Salvando…' : 'Salvar família e cidadão'}</button><small>CNS e CPF são normalizados e validados localmente. Não invente identificadores; a confirmação oficial permanece pendente.</small></div>}
        <div className="acs-person-context"><UserRound size={16} /><span>{selectedTask.citizen_name ? `Cidadão: ${selectedTask.citizen_name}` : 'A visita pode ser registrada para o domicílio/família enquanto a identificação individual não estiver disponível.'}</span></div>
        <fieldset><legend>Motivos da visita</legend><div className="acs-reason-grid">{reasons.map((reason) => <label key={reason.id}><input type="checkbox" checked={selectedReasons.includes(reason.code)} onChange={(event) => setSelectedReasons((current) => event.target.checked ? [...current, reason.code] : current.filter((code) => code !== reason.code))} />{reason.label}</label>)}</div></fieldset>
        <div className="acs-form-grid"><label>Data da visita<input type="date" value={visitDate} onChange={(event) => setVisitDate(event.target.value)} /></label><label>Desfecho<select value={outcome} onChange={(event) => setOutcome(event.target.value)}>{outcomes.map((item) => <option key={item.id} value={item.code}>{item.label}</option>)}</select></label><label>Data de retorno (opcional)<input type="date" min={visitDate} value={returnDate} onChange={(event) => setReturnDate(event.target.value)} /></label></div>
        <div className="acs-form-grid"><label>Justificativa / observação<textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder={outcome === 'REALIZADA' ? 'Observação objetiva da visita' : 'Obrigatória para este desfecho'} /></label><label>Orientação realizada<textarea value={guidance} onChange={(event) => setGuidance(event.target.value)} /></label><label>Encaminhamento / próximo passo<textarea value={referral} onChange={(event) => setReferral(event.target.value)} /></label></div>
        <footer><small>{selectedOutcome?.label || 'Selecione um desfecho'} · escopo profissional vigente · registro local validado</small><button type="button" className="fleet-primary-button" onClick={() => void registerFvd()} disabled={saving || !selectedReasons.length || !outcome}>{saving ? <LoaderCircle className="spin" size={15} /> : <CheckCircle2 size={15} />}Registrar FVD</button></footer>
      </section>}
    </div>}
  </section>
}
