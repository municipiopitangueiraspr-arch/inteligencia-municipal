import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import './App.css'

function App() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage(null)
    if (!supabase || !isSupabaseConfigured) {
      setMessage({ type: 'error', text: 'O ambiente do Supabase ainda não foi configurado. Defina as variáveis do projeto para habilitar o acesso.' })
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    setMessage(error
      ? { type: 'error', text: 'Não foi possível entrar. Verifique o e-mail e a senha ou procure o administrador do sistema.' }
      : { type: 'success', text: 'Acesso confirmado. Carregando seu ambiente municipal…' })
  }

  async function handleForgotPassword() {
    setMessage(null)
    if (!email) {
      setMessage({ type: 'error', text: 'Informe seu e-mail para receber as instruções de recuperação.' })
      return
    }
    if (!supabase || !isSupabaseConfigured) {
      setMessage({ type: 'error', text: 'O ambiente do Supabase ainda não foi configurado.' })
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/redefinir-senha` })
    setMessage(error
      ? { type: 'error', text: 'Não foi possível solicitar a recuperação agora.' }
      : { type: 'success', text: 'Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.' })
  }

  return (
    <main className="login-shell">
      <section className="institutional-panel" aria-label="Identidade institucional">
        <div className="panel-glow panel-glow-top" /><div className="panel-glow panel-glow-bottom" />
        <div className="institutional-content">
          <div className="brand-mark"><img src="/assets/brasao-pref.png" alt="Brasão da Prefeitura Municipal de Pitangueiras" /></div>
          <p className="eyebrow">PREFEITURA MUNICIPAL</p><h1>Pitangueiras<span>–PR</span></h1><div className="brand-divider" />
          <p className="platform-name">Inteligência<br /><strong>Municipal</strong></p>
          <p className="platform-description">Gestão integrada para transformar dados públicos em decisões melhores.</p>
          <div className="institutional-footer"><ShieldCheck size={16} /> Ambiente institucional protegido</div>
        </div>
      </section>
      <section className="access-panel" aria-label="Formulário de acesso"><div className="access-inner">
        <div className="mobile-brand"><img src="/assets/brasao-pref.png" alt="Brasão municipal" /><span>Inteligência Municipal</span></div>
        <div className="welcome-copy"><span className="section-kicker">PORTAL DE GESTÃO</span><h2>Bem-vindo de volta</h2><p>Entre com suas credenciais para acessar os módulos da Prefeitura.</p></div>
        <form onSubmit={handleSubmit} className="login-form">
          <label htmlFor="email">E-mail institucional</label><div className="input-wrap"><Mail size={18} /><input id="email" type="email" autoComplete="email" placeholder="seu.nome@pitangueiras.pr.gov.br" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
          <div className="password-heading"><label htmlFor="password">Senha</label><button type="button" className="text-button" onClick={handleForgotPassword}>Esqueci minha senha</button></div>
          <div className="input-wrap"><LockKeyhole size={18} /><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Digite sua senha" value={password} onChange={(event) => setPassword(event.target.value)} required /><button type="button" className="icon-button" aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div>
          {message && <div className={`form-message ${message.type}`} role="alert">{message.text}</div>}
          <button className="submit-button" type="submit" disabled={loading}>{loading ? 'Validando acesso…' : 'Entrar no sistema'} {!loading && <ArrowRight size={18} />}</button>
        </form>
        <p className="help-copy">Precisa de acesso? <span>Procure o administrador da sua unidade.</span></p>
        <div className="legal-line"><span>© 2026 Prefeitura Municipal de Pitangueiras–PR</span><span>Uso institucional</span></div>
      </div></section>
    </main>
  )
}

export default App
