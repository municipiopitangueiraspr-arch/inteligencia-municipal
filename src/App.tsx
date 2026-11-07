import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Store } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { Dashboard } from './components/Dashboard'
import { FleetModule } from './components/FleetModule'
import { SupplierPortal } from './components/SupplierPortal'
import { SupplierAccessRequest } from './components/SupplierAccessRequest'
import type { Station } from './components/FleetResources'
import './App.css'

const assetBase = import.meta.env.BASE_URL
type SupplierContext = { station: Station; role: string }

function App() {
  const [signedIn, setSignedIn] = useState(false)
  const [activeArea, setActiveArea] = useState<'dashboard' | 'fleet'>('dashboard')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)
  const [supplierContext, setSupplierContext] = useState<SupplierContext | null>(null)
  const [supplierMode, setSupplierMode] = useState(() => new URLSearchParams(window.location.search).get('portal') === 'fornecedor' || window.location.hash === '#portal')
  const [showFirstAccess, setShowFirstAccess] = useState(false)

  useEffect(() => { if (!supplierMode) setShowFirstAccess(false) }, [supplierMode])
  async function resolveSupplierAccess() {
    if (!supabase) return null
    const contextResult = await supabase.rpc('fleet_supplier_access_context')
    if (contextResult.error || !contextResult.data) return null
    const context = contextResult.data as { station?: Station; role?: string }
    if (!context.station || !context.role) return null
    return { station: context.station, role: context.role } satisfies SupplierContext
  }
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(null)
    if (!supabase || !isSupabaseConfigured) { setMessage({ type: 'error', text: 'O ambiente do Supabase ainda não foi configurado.' }); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setLoading(false); setMessage({ type: 'error', text: 'Não foi possível entrar. Verifique o e-mail e a senha ou aguarde a aprovação do primeiro acesso.' }); return }
    if (supplierMode) {
      const context = await resolveSupplierAccess()
      if (!context) { await supabase.auth.signOut(); setLoading(false); setMessage({ type: 'error', text: 'Seu acesso ainda não está liberado para um posto credenciado. Aguarde a análise do Gestor de Frotas.' }); return }
      setSupplierContext(context)
    }
    setLoading(false); setSignedIn(true); setMessage({ type: 'success', text: supplierMode ? 'Acesso confirmado. Carregando o portal do posto…' : 'Acesso confirmado. Carregando seu ambiente municipal…' })
  }
  async function handleForgotPassword() { setMessage(null); if (!email) { setMessage({ type: 'error', text: 'Informe seu e-mail para receber as instruções de recuperação.' }); return } if (!supabase || !isSupabaseConfigured) return; const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha` }); setMessage(error ? { type: 'error', text: 'Não foi possível solicitar a recuperação agora.' } : { type: 'success', text: 'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.' }) }
  const logout = async () => { if (supabase) await supabase.auth.signOut(); setSignedIn(false); setActiveArea('dashboard'); setSupplierContext(null); setPassword(''); setMessage(null) }
  if (signedIn && supplierContext) return <SupplierPortal station={supplierContext.station} role={supplierContext.role} userEmail={email} onLogout={() => void logout()} />
  if (signedIn) { if (activeArea === 'fleet') return <FleetModule userEmail={email} onBack={() => setActiveArea('dashboard')} onLogout={() => void logout()} />; return <Dashboard userEmail={email} onOpenFleet={() => setActiveArea('fleet')} onLogout={() => void logout()} /> }
  if (showFirstAccess && supplierMode) return <SupplierAccessRequest onBack={() => setShowFirstAccess(false)} />
  return <main className="login-shell"><section className="institutional-panel" aria-label="Identidade institucional"><div className="panel-glow panel-glow-top" /><div className="panel-glow panel-glow-bottom" /><div className="institutional-content"><div className="brand-mark">{supplierMode ? <Store size={27} /> : <img src={`${assetBase}assets/brasao-pref.png`} alt="Brasão da Prefeitura Municipal de Pitangueiras" />}</div><p className="eyebrow">{supplierMode ? 'PORTAL DO FORNECEDOR' : 'PREFEITURA MUNICIPAL'}</p><h1>Pitangueiras<span>–PR</span></h1><div className="brand-divider" /><p className="platform-name">{supplierMode ? <>Acesso<br /><strong>do Posto</strong></> : <>Inteligência<br /><strong>Municipal</strong></>}</p><p className="platform-description">{supplierMode ? 'Operação segura para estabelecimentos credenciados.' : 'Gestão integrada para transformar dados públicos em decisões melhores.'}</p><div className="institutional-footer"><ShieldCheck size={16} /> Ambiente institucional protegido</div></div></section><section className="access-panel" aria-label="Formulário de acesso"><div className="access-inner"><div className="mobile-brand"><img src={`${assetBase}assets/brasao-pref.png`} alt="Brasão municipal" /><span>{supplierMode ? 'Portal do Posto' : 'Inteligência Municipal'}</span></div><div className="welcome-copy"><span className="section-kicker">{supplierMode ? 'PORTAL DO FORNECEDOR' : 'PORTAL DE GESTÃO'}</span><h2>{supplierMode ? 'Acesse o seu posto' : 'Bem-vindo de volta'}</h2><p>{supplierMode ? 'Entre com o e-mail e a senha definidos na solicitação de primeiro acesso.' : 'Entre com suas credenciais para acessar os módulos da Prefeitura.'}</p></div><form onSubmit={handleSubmit} className="login-form"><label htmlFor="email">E-mail de acesso</label><div className="input-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="email" placeholder={supplierMode ? 'contato@empresa.com.br' : 'seu.nome@pitangueiras.pr.gov.br'} value={email} onChange={(event) => setEmail(event.target.value)} required /></div><div className="password-heading"><label htmlFor="password">Senha</label><button type="button" className="text-button" onClick={handleForgotPassword}>Esqueci minha senha</button></div><div className="input-wrap"><LockKeyhole size={18} /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="icon-button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>{message && <div className={`form-message ${message.type}`} role="alert">{message.text}</div>}<button className="submit-button" type="submit" disabled={loading}>{loading ? 'Validando acesso…' : 'Entrar no sistema'} {!loading && <ArrowRight size={18} />}</button></form>{supplierMode ? <p className="help-copy">Ainda não possui acesso? <button className="text-button" onClick={() => setShowFirstAccess(true)}>Solicitar primeiro acesso</button></p> : <p className="help-copy">Precisa de acesso? <span>Procure o administrador da sua unidade.</span></p>}<div className="portal-switch"><button onClick={() => { setSupplierMode(!supplierMode); setMessage(null) }}>{supplierMode ? 'Acesso institucional da Prefeitura' : 'Acesso administrativo do posto'}</button></div><div className="legal-line"><span>© 2026 Prefeitura Municipal de Pitangueiras–PR</span><span>Uso institucional</span></div></div></section></main>
}
export default App
