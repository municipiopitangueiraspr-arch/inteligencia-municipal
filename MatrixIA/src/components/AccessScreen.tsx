import { useState, type FormEvent } from "react";
import {
  Activity,
  ArrowRight,
  Building2,
  Check,
  Eye,
  EyeOff,
  LayoutDashboard,
  UsersRound,
} from "lucide-react";
import { loadMunicipalUser, supabase, type MatrixUser } from "../lib/supabase";

type Experience = "mayor" | "secretary" | "operator";

const roleOptions: {
  id: Experience;
  title: string;
  description: string;
  account: string;
  icon: typeof Building2;
}[] = [
  {
    id: "mayor",
    title: "Prefeito",
    description: "Visão do município, decisões e prioridades.",
    account: "prefeito@demo.matrixia",
    icon: LayoutDashboard,
  },
  {
    id: "secretary",
    title: "Secretário",
    description: "Gestão de uma pasta e serviços da secretaria.",
    account: "secretario@demo.matrixia",
    icon: Building2,
  },
  {
    id: "operator",
    title: "Operador",
    description: "Agenda, tarefas e registros da rotina.",
    account: "operador@demo.matrixia",
    icon: Activity,
  },
];

const secretariatNames = [
  "Administração e Finanças",
  "Agricultura e Meio Ambiente",
  "Assistência Social",
  "Cultura e Turismo",
  "Desenvolvimento Econômico",
  "Educação",
  "Esporte e Lazer",
  "Obras",
  "Planejamento e Urbanismo",
  "Saúde e Vigilância Sanitária",
  "Segurança Pública e Trânsito",
];

type AccessScreenProps = {
  onAuthenticated: (user: MatrixUser) => void;
};

export default function AccessScreen({ onAuthenticated }: AccessScreenProps) {
  const [experience, setExperience] = useState<Experience>("mayor");
  const [email, setEmail] = useState("prefeito@demo.matrixia");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  const chooseExperience = (next: Experience) => {
    setExperience(next);
    setEmail(roleOptions.find((role) => role.id === next)?.account ?? "");
    setMessage("");
  };

  const enterDemo = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email.trim() || !password.trim()) {
      setMessage(
        "Informe seu e-mail e sua senha para continuar.",
      );
      return;
    }
    setMessage("");
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !data.user) {
      setMessage(error?.message ?? "Não foi possível autenticar este usuário.");
      return;
    }
    try {
      onAuthenticated(await loadMunicipalUser(data.user.id, data.user.email));
    } catch {
      setMessage("Usuário autenticado, mas sem perfil municipal cadastrado.");
      await supabase.auth.signOut();
    }
  };

  const selectedRole = roleOptions.find((role) => role.id === experience)!;

  return (
    <main className="access-page">
      <section className="access-showcase">
        <div className="access-showcase-orbit access-orbit-one" />
        <div className="access-showcase-orbit access-orbit-two" />
        <div className="access-brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="brand-text">
            <strong>
              Matrix<span>IA</span>
            </strong>
            <small>INTELIGÊNCIA MUNICIPAL</small>
          </div>
        </div>

        <div className="access-pitch">
          <div className="access-kicker">
            <span /> UMA PREFEITURA, UMA PLATAFORMA
          </div>
          <h1>A cidade inteira, conectada para decidir e fazer.</h1>
          <p>
            Gestão municipal, serviços e rotinas das secretarias em uma mesma
            experiência — com uma visão adequada a cada trabalho.
          </p>
        </div>

        <div className="access-secretariats">
          <div className="access-secretariats-heading">
            <span className="access-mini-icon">
              <Building2 size={15} />
            </span>
            <div>
              <strong>11 secretarias</strong>
              <small>Uma visão transversal do município</small>
            </div>
            <Check size={16} />
          </div>
          <div className="secretariat-name-grid">
            {secretariatNames.map((name) => (
              <span key={name}>{name}</span>
            ))}
          </div>
        </div>

        <div className="access-showcase-footer">
          <UsersRound size={15} />
          <span>Decidir · coordenar · atender</span>
          <span className="access-simulated-chip">DEMONSTRAÇÃO FICTÍCIA</span>
        </div>
      </section>

      <section className="access-panel-wrap">
        <div className="access-panel">
          <div className="access-panel-heading">
            <div className="access-mobile-brand">
              <div className="brand-mark" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
              <strong>
                Matrix<span>IA</span>
              </strong>
            </div>
            <div className="access-kicker access-kicker-light">
              <span /> ACESSO AO MUNICÍPIO-PILOTO
            </div>
            <h2>Entre na plataforma</h2>
            <p>Escolha a experiência que deseja explorar no protótipo.</p>
          </div>

          <div
            className="experience-choices"
            role="group"
            aria-label="Escolher visão demonstrativa"
          >
            {roleOptions.map((role) => {
              const Icon = role.icon;
              const selected = experience === role.id;
              return (
                <button
                  type="button"
                  className={`experience-choice ${selected ? "is-selected" : ""}`}
                  key={role.id}
                  aria-pressed={selected}
                  onClick={() => chooseExperience(role.id)}
                >
                  <span className="experience-choice-icon">
                    <Icon size={18} />
                  </span>
                  <span className="experience-choice-copy">
                    <strong>{role.title}</strong>
                    <small>{role.description}</small>
                  </span>
                  <span className="experience-radio" aria-hidden="true">
                    {selected && <i />}
                  </span>
                </button>
              );
            })}
          </div>

          <form className="access-form" onSubmit={enterDemo}>
            <label htmlFor="demo-email">E-mail institucional</label>
            <input
              id="demo-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <div className="access-password-label">
              <label htmlFor="demo-password">Senha</label>
              <button
                type="button"
                onClick={() =>
                  setMessage(
                    "A redefinição de senha faz parte do fluxo do sistema final; nesta demonstração, use qualquer senha fictícia.",
                  )
                }
              >
                Esqueci minha senha
              </button>
            </div>
            <div className="password-field">
              <input
                id="demo-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Digite sua senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                onClick={() => setShowPassword((current) => !current)}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <p className="access-demo-note">Acesso protegido pelo Supabase. O papel é carregado do perfil municipal vinculado ao login.</p>
            {message && (
              <p className="access-message" role="status">
                {message}
              </p>
            )}
            <button className="access-submit" type="submit">
              Entrar como {selectedRole.title}
              <ArrowRight size={16} />
            </button>
          </form>

          <div className="access-help-line">
            <span>Precisa de ajuda para explorar?</span>
            <button
              type="button"
              onClick={() =>
                setMessage("Use um usuário autorizado do ambiente de homologação e a senha cadastrada no Supabase.")
              }
            >
              Ver orientação
            </button>
          </div>
          <div className="access-panel-bottom">
            <span>MatrixIA · Pitangueiras/PR</span>
            <span>Protótipo para validação da equipe</span>
          </div>
        </div>
      </section>
    </main>
  );
}
