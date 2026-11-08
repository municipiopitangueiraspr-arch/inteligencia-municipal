import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowLeft, CheckCircle2, LockKeyhole, Mail, ShieldCheck, Store, UserRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatMunicipalDateTime } from '../lib/municipalTime'

type Props = { onBack: () => void; authenticatedEmail?: string }
type FirstAccessStatus = { request_id: string; status: string; station_id: string | null; razao_social: string; cnpj: string; requested_at: string; review_notes: string | null }
type FormState = { cnpj: string; razao_social: string; representante_nome: string; representante_documento: string; telefone: string; email: string; password: string; confirmPassword: string }
const emptyForm: FormState = { cnpj: '', razao_social: '', representante_nome: '', representante_documento: '', telefone: '', email: '', password: '', confirmPassword: '' }
const accessStatusLabel: Record<string, string> = { PENDENTE: 'Em análise', EM_ANALISE: 'Em análise', APROVADO: 'Aprovado', NEGADO: 'Revisado — acesso não aprovado', REJEITADO: 'Revisado — acesso não aprovado' }
function formatDate(value: string) { const formatted = formatMunicipalDateTime(value); return formatted === '—' ? value : formatted }
function normalizedCnpj(value: string) { return value.toLocaleUpperCase('pt-BR').replace(/[^0-9A-Z]/g, '') }
function validCnpj(value: string) {
  const cnpj = normalizedCnpj(value)
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false
  const digit = (base: string, weights: number[]) => {
    const sum = [...base].reduce((total, char, index) => total + (char.charCodeAt(0) - 48) * weights[index], 0)
    const remainder = sum % 11
    return String(remainder < 2 ? 0 : 11 - remainder)
  }
  const first = digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = digit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return cnpj.endsWith(first + second)
}

export function SupplierAccessRequest({ onBack, authenticatedEmail }: Props) {
  const authenticated = Boolean(authenticatedEmail)
  const [form, setForm] = useState<FormState>({ ...emptyForm, email: authenticatedEmail || '' })
  const [saving, setSaving] = useState(false)
  const [loadingStatus, setLoadingStatus] = useState(authenticated)
  const [statusError, setStatusError] = useState('')
  const [requests, setRequests] = useState<FirstAccessStatus[]>([])
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function loadOwnStatus() {
    if (!authenticated || !supabase) return
    setLoadingStatus(true)
    setStatusError('')
    const result = await supabase.rpc('fleet_supplier_first_access_status')
    if (result.error) {
      setStatusError('Não foi possível consultar o estado da sua solicitação. Tente novamente antes de enviar outro pedido.')
      setRequests([])
    } else {
      setRequests((result.data || []) as FirstAccessStatus[])
    }
    setLoadingStatus(false)
  }
  useEffect(() => { if (authenticated) void loadOwnStatus() }, [authenticated, authenticatedEmail])

  function update(key: keyof FormState, value: string) { setForm((current) => ({ ...current, [key]: value })) }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    if (!supabase) { setMessage({ type: 'error', text: 'O ambiente de autenticação não está configurado.' }); return }
    const email = authenticatedEmail || form.email.trim()
    if (!validCnpj(form.cnpj)) { setMessage({ type: 'error', text: 'Informe um CNPJ válido com 14 caracteres e dígitos verificadores corretos.' }); return }
    if (form.razao_social.trim().length < 2) { setMessage({ type: 'error', text: 'Informe a razão social do estabelecimento.' }); return }
    if (form.representante_nome.trim().length < 2) { setMessage({ type: 'error', text: 'Informe o nome completo do representante legal.' }); return }
    if (!authenticated) {
      if (form.password.length < 10) { setMessage({ type: 'error', text: 'A senha deve ter pelo menos 10 caracteres.' }); return }
      if (form.password !== form.confirmPassword) { setMessage({ type: 'error', text: 'A confirmação da senha não confere.' }); return }
    }
    setSaving(true)
    if (!authenticated) {
      const redirectTo = `${window.location.origin}${window.location.pathname}?portal=fornecedor`
      const signup = await supabase.auth.signUp({
        email,
        password: form.password,
        options: {
          emailRedirectTo: redirectTo,
          data: {
            nome: form.representante_nome.trim(),
            perfil: 'POSTO_REPRESENTANTE',
            cargo: 'Representante legal de posto',
            telefone: form.telefone.trim() || null,
            primeiro_acesso: true,
            cadastro_por_convite: false,
          },
        },
      })
      if (signup.error || !signup.data.user) {
        setSaving(false)
        const message = signup.error?.message || ''
        setMessage({ type: 'error', text: /already registered|already exists/i.test(message) ? 'Este e-mail já possui uma conta. Entre no portal com essa conta para concluir o primeiro acesso.' : 'Não foi possível iniciar o cadastro da conta. Verifique o e-mail e tente novamente.' })
        return
      }
      if (!signup.data.session) {
        setSaving(false)
        setMessage({ type: 'success', text: 'A conta foi iniciada. Confirme o e-mail enviado pela plataforma; depois volte ao login do fornecedor, autentique-se e conclua a solicitação. Nenhum pedido foi enviado antes da autenticação.' })
        return
      }
    }
    const result = await supabase.rpc('fleet_submit_station_access_request', {
      p_cnpj: normalizedCnpj(form.cnpj),
      p_razao_social: form.razao_social.trim(),
      p_representante_nome: form.representante_nome.trim(),
      p_representante_documento: form.representante_documento.trim() || null,
      p_representante_email: email,
      p_representante_telefone: form.telefone.trim() || null,
    })
    if (result.error) {
      setSaving(false)
      const serverMessage = result.error.message || ''
      const friendlyMessage = /CNPJ|representante|solicita|e-mail|empresa|confirm|caracteres|já existe|duplicad/i.test(serverMessage)
        ? serverMessage.replace(/^\w+:\s*/, '')
        : 'A conta está autenticada, mas a solicitação não foi registrada. Confira os dados ou tente novamente.'
      setMessage({ type: 'error', text: friendlyMessage })
      return
    }
    const value = Array.isArray(result.data) ? result.data[0] : result.data
    const requestId = typeof value === 'string' ? value : value?.request_id || value?.id
    let notificationWarning = ''
    if (requestId) {
      const notification = await supabase.functions.invoke('notify-station-access-request', { body: { request_id: requestId } })
      if (notification.error) notificationWarning = ' A solicitação foi registrada, mas o aviso por e-mail não pôde ser enviado.'
    }
    setSaving(false)
    setMessage({ type: 'success', text: `Solicitação registrada. Acompanhe a análise nesta tela.${notificationWarning}` })
    if (authenticated) await loadOwnStatus()
  }

  const hasUnresolvedRequest = requests.some((request) => ['PENDENTE', 'APROVADO'].includes(request.status))
  const isAuthenticatedRequest = authenticated && !hasUnresolvedRequest && !loadingStatus && !statusError
  return <main className="login-shell supplier-access-shell">
    <section className="institutional-panel" aria-label="Identidade institucional"><div className="panel-glow panel-glow-top" /><div className="panel-glow panel-glow-bottom" /><div className="institutional-content"><div className="brand-mark"><Store size={27} /></div><p className="eyebrow">PORTAL DO FORNECEDOR</p><h1>Pitangueiras<span>–PR</span></h1><div className="brand-divider" /><p className="platform-name">Acesso<br /><strong>do Posto</strong></p><p className="platform-description">Solicite ou acompanhe com segurança o acesso do seu estabelecimento credenciado.</p><div className="institutional-footer"><ShieldCheck size={16} /> Aprovação municipal obrigatória</div></div></section>
    <section className="access-panel" aria-label={authenticated ? 'Primeiro acesso autenticado' : 'Solicitação de primeiro acesso'}><div className="access-inner supplier-access-inner">
      <button className="access-back" onClick={onBack}><ArrowLeft size={15} /> {authenticated ? 'Sair e voltar ao login' : 'Voltar para login'}</button>
      <div className="welcome-copy"><span className="section-kicker">{authenticated ? 'CONTA AUTENTICADA' : 'PRIMEIRO ACESSO'}</span><h2>{authenticated ? 'Acesso ao posto' : 'Solicite o acesso do posto'}</h2><p>{authenticated ? `Conta autenticada: ${authenticatedEmail}. Acompanhe a revisão da solicitação ou envie o primeiro pedido.` : 'Informe os dados do CNPJ e do representante legal. A solicitação só será enviada após a autenticação da conta.'}</p></div>
      {loadingStatus && <div className="fleet-loading">Consultando suas solicitações…</div>}
      {statusError && <div className="form-message error" role="alert">{statusError}<button type="button" className="text-button" onClick={() => void loadOwnStatus()}> Tentar novamente</button></div>}
      {!loadingStatus && !statusError && requests.length > 0 && <section className="supplier-own-requests" aria-live="polite"><h3>Solicitações vinculadas à sua conta</h3>{requests.map((request) => <article key={request.request_id}><div><span>{accessStatusLabel[request.status] || request.status.replaceAll('_', ' ')}</span><strong>{request.razao_social}</strong><small>CNPJ {request.cnpj} · enviada em {formatDate(request.requested_at)}</small></div>{request.review_notes && <p>Observação da análise: {request.review_notes}</p>}</article>)}</section>}
      {!authenticated && <form onSubmit={submit} className="supplier-access-form">
        <CompanyFields form={form} update={update} />
        <div className="supplier-access-section"><span><UserRound size={15} /> Representante legal · contato principal</span><label>Nome completo<input required value={form.representante_nome} onChange={(event) => update('representante_nome', event.target.value)} /></label><label>Documento<input value={form.representante_documento} onChange={(event) => update('representante_documento', event.target.value)} placeholder="CPF" /></label><label>Telefone<input value={form.telefone} onChange={(event) => update('telefone', event.target.value)} /></label></div>
        <div className="supplier-access-section"><span><LockKeyhole size={15} /> Criar conta para autenticar</span><label>E-mail para login<div className="input-wrap"><Mail size={17} /><input required type="email" value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="contato@empresa.com.br" /></div></label><label>Senha<input required type="password" minLength={10} value={form.password} onChange={(event) => update('password', event.target.value)} /></label><label>Confirmar senha<input required type="password" minLength={10} value={form.confirmPassword} onChange={(event) => update('confirmPassword', event.target.value)} /></label></div>
        {message && <div className={`form-message ${message.type}`} role="alert">{message.type === 'success' && <CheckCircle2 size={15} />} {message.text}</div>}
        <button className="submit-button" type="submit" disabled={saving}>{saving ? 'Autenticando e enviando…' : 'Criar conta e solicitar acesso'}</button>
      </form>}
      {isAuthenticatedRequest && <form onSubmit={submit} className="supplier-access-form">
        <CompanyFields form={form} update={update} />
        <div className="supplier-access-section"><span><UserRound size={15} /> Representante legal · contato principal</span><label>Nome completo<input required value={form.representante_nome} onChange={(event) => update('representante_nome', event.target.value)} /></label><label>Documento<input value={form.representante_documento} onChange={(event) => update('representante_documento', event.target.value)} placeholder="CPF" /></label><label>Telefone<input value={form.telefone} onChange={(event) => update('telefone', event.target.value)} /></label></div>
        <div className="supplier-access-section"><span><LockKeyhole size={15} /> Conta autenticada</span><label>E-mail da conta<input type="email" value={authenticatedEmail || ''} readOnly aria-readonly="true" /></label></div>
        {message && <div className={`form-message ${message.type}`} role="alert">{message.type === 'success' && <CheckCircle2 size={15} />} {message.text}</div>}
        <button className="submit-button" type="submit" disabled={saving}>{saving ? 'Enviando solicitação…' : 'Concluir solicitação de acesso'}</button>
      </form>}
      {authenticated && !loadingStatus && !statusError && requests.length > 0 && <div className="form-message success" role="status"><CheckCircle2 size={15} /> {message?.text || 'Esta é a situação mais recente retornada pelo portal.'}</div>}
      <p className="help-copy">{authenticated ? 'A solicitação fica associada à sua conta autenticada.' : <>Já possui acesso? <button className="text-button" onClick={onBack}>Entrar no portal</button></>}</p>
    </div></section>
  </main>
}

function CompanyFields({ form, update }: { form: FormState; update: (key: keyof FormState, value: string) => void }) {
  return <div className="supplier-access-section"><span><Store size={15} /> Dados da empresa</span><label>CNPJ<input required value={form.cnpj} onChange={(event) => update('cnpj', event.target.value)} placeholder="00.000.000/0001-00" /></label><label>Razão social<input required value={form.razao_social} onChange={(event) => update('razao_social', event.target.value)} /></label></div>
}
