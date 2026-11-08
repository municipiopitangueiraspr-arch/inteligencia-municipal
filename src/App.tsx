import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Store } from 'lucide-react'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { Dashboard } from './components/Dashboard'
import { FleetModule } from './components/FleetModule'
import { SupplierPortal } from './components/SupplierPortal'
import { SupplierAccessRequest } from './components/SupplierAccessRequest'
import type { Station } from './components/FleetResources'
import './App.css'

const assetBase = import.meta.env.BASE_URL
type SupplierContext = { station: Station; role: string; vehicleId: string | null; accessAvailable: boolean; accessReason: string | null }

function isSupplierIdentity(user: User) {
  const metadata = user.user_metadata || {}
  return String(metadata.perfil || '').startsWith('POSTO_') || Boolean(metadata.station_id)
}
async function resolveSupplierAccess(): Promise<SupplierContext | null> {
  if (!supabase) return null
  const contextResult = await supabase.rpc('fleet_supplier_access_context')
  if (contextResult.error || !contextResult.data) return null
  const context = contextResult.data as { station?: Station; role?: string; access_available?: boolean; access_reason?: string | null }
  if (!context.station || !context.role) return null
  const candidate = new URLSearchParams(window.location.search).get('vehicle')
  const vehicleId = candidate && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(candidate) ? candidate : null
  return { station: context.station, role: context.role, vehicleId, accessAvailable: context.access_available === true, accessReason: context.access_reason || null }
}

function App() {
  const [signedIn, setSignedIn] = useState(false)
  const [sessionChecking, setSessionChecking] = useState(true)
  const [requiresPasswordSetup, setRequiresPasswordSetup] = useState(false)
  const [isSupplierAccount, setIsSupplierAccount] = useState(false)
  const [activeArea, setActiveArea] = useState<'dashboard' | 'fleet'>('dashboard')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [supplierContext, setSupplierContext] = useState<SupplierContext | null>(null)
  const [supplierMode, setSupplierMode] = useState(() => new URLSearchParams(window.location.search).get('portal') === 'fornecedor' || window.location.hash === '#portal')
  const [showFirstAccess, setShowFirstAccess] = useState(false)

  useEffect(() => {
    if (!supabase) { setSessionChecking(false); return }
    let mounted = true
    const applySession = (session: Session | null, event = '') => {
      if (!mounted || !session) return
      const user = session.user
      const supplierIdentity = isSupplierIdentity(user)
      const supplierRoute = new URLSearchParams(window.location.search).get('portal') === 'fornecedor' || window.location.hash === '#portal'
      setEmail(user.email || '')
      const profileName = String(user.user_metadata?.full_name || user.user_metadata?.name || user.user_metadata?.nome || '').trim()
      setDisplayName(profileName || user.email || '')
      setIsSupplierAccount(supplierIdentity)
      if (supplierIdentity || supplierRoute) {
        setSupplierMode(true)
        setTimeout(() => { void resolveSupplierAccess().then((context) => { if (mounted) setSupplierContext(context) }) }, 0)
      }
      if (event === 'PASSWORD_RECOVERY' || user.user_metadata?.cadastro_por_convite === true) setRequiresPasswordSetup(true)
      setSignedIn(true)
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setSignedIn(false); setSupplierContext(null); setRequiresPasswordSetup(false); setIsSupplierAccount(false)
      } else if (session) applySession(session, event)
      setSessionChecking(false)
    })
    void supabase.auth.getSession().then(({ data }) => { if (mounted && data.session) applySession(data.session) }).catch(() => undefined).finally(() => { if (mounted) setSessionChecking(false) })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    if (!supabase || !isSupabaseConfigured) {
      setMessage({ type: 'error', text: 'O ambiente do Supabase ainda não foi configurado.' })
      return
    }
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      setMessage({ type: 'error', text: 'Não foi possível entrar. Verifique o e-mail e a senha ou aguarde a aprovação do primeiro acesso.' })
      return
    }
    const accountEmail = data.user.email || email
    const supplierIdentity = isSupplierIdentity(data.user)
    const useSupplierPortal = supplierMode || supplierIdentity
    setEmail(accountEmail)
    const profileName = String(data.user.user_metadata?.full_name || data.user.user_metadata?.name || data.user.user_metadata?.nome || '').trim()
    setDisplayName(profileName || accountEmail)
    setIsSupplierAccount(supplierIdentity)
    if (supplierIdentity) setSupplierMode(true)
    setRequiresPasswordSetup(data.user.user_metadata?.cadastro_por_convite === true)
    if (useSupplierPortal) {
      const context = await resolveSupplierAccess()
      setSupplierContext(context)
    }
    setLoading(false)
    setSignedIn(true)
    setMessage({ type: 'success', text: useSupplierPortal ? 'Acesso confirmado. Carregando o portal do posto…' : 'Acesso confirmado. Carregando seu ambiente municipal…' })
  }

  async function handleForgotPassword() {
    setMessage(null)
    if (!email) { setMessage({ type: 'error', text: 'Informe seu e-mail para receber as instruções de recuperação.' }); return }
    if (!supabase || !isSupabaseConfigured) return
    const query = supplierMode ? '?portal=fornecedor' : ''
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}${window.location.pathname}${query}` })
    setMessage(error ? { type: 'error', text: 'Não foi possível solicitar a recuperação agora.' } : { type: 'success', text: 'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.' })
  }

  const logout = async () => {
    if (supabase) await supabase.auth.signOut()
    setSignedIn(false)
    setActiveArea('dashboard')
    setDisplayName('')
    setSupplierContext(null)
    setRequiresPasswordSetup(false)
    setIsSupplierAccount(false)
    setPassword('')
    setMessage(null)
    setShowFirstAccess(false)
  }

  if (sessionChecking) return <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', color: '#344054', background: '#f6f8fb' }}>Verificando sessão segura…</div>
  if (signedIn && requiresPasswordSetup) return <FirstAccessPasswordSetup isSupplier={isSupplierAccount} onComplete={() => setRequiresPasswordSetup(false)} onLogout={() => void logout()} />
  if (signedIn && supplierMode && supplierContext) return <SupplierPortal station={supplierContext.station} role={supplierContext.role} userEmail={email} userDisplayName={displayName || email} initialVehicleId={supplierContext.vehicleId} accessReason={supplierContext.accessReason} onLogout={() => void logout()} />
  if (signedIn && supplierMode) return <SupplierAccessRequest authenticatedEmail={email} onBack={() => void logout()} />
  if (signedIn) {
    if (activeArea === 'fleet') return <FleetModule userEmail={email} onBack={() => setActiveArea('dashboard')} onLogout={() => void logout()} />
    return <Dashboard userEmail={email} onOpenFleet={() => setActiveArea('fleet')} onLogout={() => void logout()} />
  }
  if (showFirstAccess && supplierMode) return <SupplierAccessRequest onBack={() => setShowFirstAccess(false)} />

  return <main className="login-shell">
    <section className="institutional-panel" aria-label="Identidade institucional">
      <div className="panel-glow panel-glow-top" /><div className="panel-glow panel-glow-bottom" />
      <div className="institutional-content">
        <div className="brand-mark">{supplierMode ? <Store size={27} /> : <img src={`${assetBase}assets/brasao-pref.png`} alt="Brasão da Prefeitura Municipal de Pitangueiras" />}</div>
        <p className="eyebrow">{supplierMode ? 'PORTAL DO FORNECEDOR' : 'PREFEITURA MUNICIPAL'}</p>
        <h1>Pitangueiras<span>–PR</span></h1><div className="brand-divider" />
        <p className="platform-name">{supplierMode ? <>Acesso<br /><strong>do Posto</strong></> : <>Inteligência<br /><strong>Municipal</strong></>}</p>
        <p className="platform-description">{supplierMode ? 'Operação segura para estabelecimentos credenciados.' : 'Gestão integrada para transformar dados públicos em decisões melhores.'}</p>
        <div className="institutional-footer"><ShieldCheck size={16} /> Ambiente institucional protegido</div>
      </div>
    </section>
    <section className="access-panel" aria-label="Formulário de acesso">
      <div className="access-inner">
        <div className="mobile-brand"><img src={`${assetBase}assets/brasao-pref.png`} alt="Brasão municipal" /><span>{supplierMode ? 'Portal do Posto' : 'Inteligência Municipal'}</span></div>
        <div className="welcome-copy"><span className="section-kicker">{supplierMode ? 'PORTAL DO FORNECEDOR' : 'PORTAL DE GESTÃO'}</span><h2>{supplierMode ? 'Acesse o seu posto' : 'Bem-vindo de volta'}</h2><p>{supplierMode ? 'Entre com sua conta confirmada para acessar seu posto ou acompanhar o primeiro acesso.' : 'Entre com suas credenciais para acessar os módulos da Prefeitura.'}</p></div>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="email">E-mail de acesso</label><div className="input-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="email" placeholder={supplierMode ? 'contato@empresa.com.br' : 'seu.nome@pitangueiras.pr.gov.br'} value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="password-heading"><label htmlFor="password">Senha</label><button type="button" className="text-button" onClick={() => void handleForgotPassword()}>Esqueci minha senha</button></div>
          <div className="input-wrap"><LockKeyhole size={18} /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="icon-button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {message && <div className={`form-message ${message.type}`} role="alert">{message.text}</div>}
          <button className="submit-button" type="submit" disabled={loading}>{loading ? 'Validando acesso…' : 'Entrar no sistema'} {!loading && <ArrowRight size={18} />}</button>
        </form>
        {supplierMode ? <p className="help-copy">Ainda não possui acesso? <button className="text-button" onClick={() => setShowFirstAccess(true)}>Solicitar primeiro acesso</button></p> : <p className="help-copy">Precisa de acesso? <span>Procure o administrador da sua unidade.</span></p>}
        <div className="portal-switch"><button onClick={() => { setSupplierMode(!supplierMode); setMessage(null) }}>{supplierMode ? 'Acesso institucional da Prefeitura' : 'Acesso administrativo do posto'}</button></div>
        <div className="legal-line"><span>© 2026 Prefeitura Municipal de Pitangueiras–PR</span><span>Uso institucional</span></div>
      </div>
    </section>
  </main>
}

function FirstAccessPasswordSetup({ isSupplier, onComplete, onLogout }: { isSupplier: boolean; onComplete: () => void; onLogout: () => void }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (newPassword.length < 10) { setError('Use uma senha com pelo menos 10 caracteres.'); return }
    if (newPassword !== confirmPassword) { setError('A confirmação da senha não confere.'); return }
    if (!supabase) { setError('O serviço de autenticação não está disponível.'); return }
    setSaving(true)
    const updated = await supabase.auth.updateUser({ password: newPassword })
    if (updated.error) { setSaving(false); setError('Não foi possível atualizar a senha. Tente novamente ou solicite outra recuperação.'); return }
    if (isSupplier) {
      const completed = await supabase.rpc('fleet_supplier_complete_first_access')
      if (completed.error) { setSaving(false); setError('A senha foi alterada, mas a conclusão do primeiro acesso ainda não foi registrada. Confirme se o vínculo com o posto está ativo e tente novamente.'); return }
    }
    await supabase.auth.updateUser({ data: { cadastro_por_convite: false, senha_configurada: true } })
    setSaving(false)
    onComplete()
  }
  return <main className="login-shell supplier-access-shell"><section className="institutional-panel" aria-label="Identidade institucional"><div className="panel-glow panel-glow-top" /><div className="panel-glow panel-glow-bottom" /><div className="institutional-content"><div className="brand-mark"><Store size={27} /></div><p className="eyebrow">ACESSO SEGURO</p><h1>Pitangueiras<span>–PR</span></h1><div className="brand-divider" /><p className="platform-name">Primeiro<br /><strong>acesso</strong></p><p className="platform-description">Defina uma senha individual para sua conta. A senha é gerenciada pelo Supabase Auth e não é armazenada no perfil.</p><div className="institutional-footer"><ShieldCheck size={16} /> Conta individual</div></div></section><section className="access-panel" aria-label="Definir senha"><div className="access-inner supplier-access-inner"><span className="section-kicker">CONFIGURAÇÃO DE CREDENCIAIS</span><h2>Defina sua senha</h2><p>Use uma senha própria, com no mínimo 10 caracteres. Não compartilhe suas credenciais com outras pessoas.</p><form className="supplier-access-form" onSubmit={(event) => void submit(event)}><label>Nova senha<input type="password" autoComplete="new-password" minLength={10} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><label>Confirmar senha<input type="password" autoComplete="new-password" minLength={10} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>{error && <div className="form-message error" role="alert">{error}</div>}<button className="submit-button" disabled={saving}>{saving ? 'Salvando…' : 'Salvar senha e continuar'}</button></form><button className="access-back" onClick={onLogout}>Sair</button></div></section></main>
}

export default App
