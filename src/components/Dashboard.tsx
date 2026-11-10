import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  LogOut,
  Settings,
} from 'lucide-react'
import type {
  MunicipalModule,
  MunicipalSecretariat,
  MunicipalSecretariatModule,
} from '../lib/municipal-catalog'
import { getMunicipalIcon } from '../lib/municipal-catalog'
import { supabase } from '../lib/supabase'
import './Dashboard.css'

const assetBase = import.meta.env.BASE_URL

type DashboardProps = {
  userEmail?: string
  onOpenFleet: () => void
  onOpenCensus: () => void
  onOpenGovernance: () => void
  onLogout: () => void
}

const moduleToneById: Record<string, string> = {
  fleet: 'fleet',
  census: 'census',
  'medical-visits': 'health',
  atas: 'records',
  compras: 'procurement',
  acts: 'official',
}

export function Dashboard({ userEmail, onOpenFleet, onOpenCensus, onOpenGovernance, onLogout }: DashboardProps) {
  const [secretariats, setSecretariats] = useState<MunicipalSecretariat[]>([])
  const [modules, setModules] = useState<MunicipalModule[]>([])
  const [secretariatModules, setSecretariatModules] = useState<MunicipalSecretariatModule[]>([])
  const [canManageGovernance, setCanManageGovernance] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedSecretariatId, setSelectedSecretariatId] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    const loadHall = async () => {
      if (!supabase) {
        if (mounted) {
          setLoadError('O serviço de dados não está configurado. Entre em contato com o administrador.')
          setLoading(false)
        }
        return
      }

      // Associação de catálogo para organizar os cards por secretaria, igualmente visível a todos; não é uma permissão individual.
      const [secretariatResult, moduleResult, mappingResult, adminResult] = await Promise.all([
        supabase
          .from('municipal_secretariats')
          .select('id,name,description,icon_name,sort_order,is_active')
          .eq('is_active', true)
          .order('sort_order', { ascending: true }),
        supabase
          .from('municipal_modules')
          .select('id,label,description,icon_name,is_ready,status_label,sort_order')
          .order('sort_order', { ascending: true }),
        supabase
          .from('municipal_secretariat_modules')
          .select('secretariat_id,module_id,sort_order')
          .order('sort_order', { ascending: true }),
        supabase.rpc('municipal_governance_is_admin'),
      ])

      if (!mounted) return
      const failures = [secretariatResult.error, moduleResult.error, mappingResult.error].filter(Boolean)
      if (failures.length > 0) {
        setLoadError('Não foi possível carregar as secretarias e os módulos. Tente atualizar a página.')
      } else {
        setSecretariats((secretariatResult.data || []) as unknown as MunicipalSecretariat[])
        setModules((moduleResult.data || []) as unknown as MunicipalModule[])
        setSecretariatModules((mappingResult.data || []) as unknown as MunicipalSecretariatModule[])
      }
      setCanManageGovernance(!adminResult.error && adminResult.data === true)
      setLoading(false)
    }

    void loadHall()
    return () => { mounted = false }
  }, [])

  const selectedSecretariat = secretariats.find((secretariat) => secretariat.id === selectedSecretariatId)
  const visibleModules = selectedSecretariat
    ? secretariatModules
      .filter((mapping) => mapping.secretariat_id === selectedSecretariat.id)
      .map((mapping) => modules.find((module) => module.id === mapping.module_id))
      .filter((module): module is MunicipalModule => Boolean(module))
    : []

  const openModule = (id: string) => {
    if (id === 'fleet') onOpenFleet()
    if (id === 'census') onOpenCensus()
  }

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div className="dashboard-brand">
            <span className="dashboard-brand-mark">
              <img src={`${assetBase}assets/brasao-pref.png`} alt="" />
            </span>
            <span className="dashboard-brand-copy">
              <strong>Inteligência Municipal</strong>
            </span>
          </div>
          <div className="dashboard-account">
            <span className="user-avatar" aria-hidden="true">{(userEmail?.[0] || 'U').toUpperCase()}</span>
            <span className="user-details">
              <strong>{userEmail || 'Usuário institucional'}</strong>
            </span>
            <button className="logout-button" type="button" aria-label="Sair do sistema" onClick={onLogout}>
              <LogOut size={17} aria-hidden="true" />
              <span>Sair</span>
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="dashboard-content">
          {selectedSecretariat ? (
            <section className="department-view" aria-labelledby="departmentTitle">
              <button className="secretariat-back-button" type="button" onClick={() => setSelectedSecretariatId(null)}>
                <ArrowLeft size={17} aria-hidden="true" />
                Secretarias
              </button>

              <div className="department-heading">
                <span className="department-heading-icon" aria-hidden="true">
                  {(() => {
                    const Icon = getMunicipalIcon(selectedSecretariat.icon_name)
                    return <Icon size={30} strokeWidth={1.8} />
                  })()}
                </span>
                <div>
                  <h1 id="departmentTitle">{selectedSecretariat.name}</h1>
                  <p>Escolha um módulo para continuar.</p>
                </div>
              </div>

              {visibleModules.length > 0 ? (
                <div className={`module-grid${selectedSecretariat.id === 'health' ? ' module-grid--health' : ''}`} aria-label={`Módulos de ${selectedSecretariat.name}`}>
                  {visibleModules.map((module) => {
                    const Icon = getMunicipalIcon(module.icon_name)
                    const hasRoute = module.id === 'fleet' || module.id === 'census'
                    const canOpen = module.is_ready && hasRoute
                    return (
                      <button
                        key={module.id}
                        className={`module-card module-card--${moduleToneById[module.id] || 'fleet'}`}
                        type="button"
                        disabled={!canOpen}
                        aria-label={canOpen ? `Acessar ${module.label}` : `${module.label}, ${module.status_label}`}
                        onClick={() => openModule(module.id)}
                      >
                        <span className="module-card-top">
                          <span className="module-icon"><Icon size={27} strokeWidth={1.8} aria-hidden="true" /></span>
                          {module.id !== 'census' && (
                            <span className={`module-status${module.is_ready ? ' module-status--active' : ''}`}>
                              <span className="status-dot" aria-hidden="true" />
                              {module.status_label}
                            </span>
                          )}
                        </span>
                        <span className="module-card-title">{module.label}</span>
                        <span className="module-card-description">{module.description}</span>
                        <span className={`module-card-action${canOpen ? '' : ' module-card-action--disabled'}`}>
                          {canOpen ? 'Acessar módulo' : 'Em breve'}
                          {canOpen && <ArrowRight size={17} aria-hidden="true" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="secretariat-empty" role="status">
                  <span className="secretariat-empty-icon"><Building2 size={24} aria-hidden="true" /></span>
                  <h2>Nenhum módulo disponível ainda</h2>
                  <p>Os módulos desta secretaria serão adicionados conforme os fluxos forem definidos.</p>
                </div>
              )}
            </section>
          ) : (
            <section className="secretariat-section" aria-labelledby="secretariatTitle">
              <div className="hall-heading">
                <h1 id="secretariatTitle">Secretarias</h1>
                <p>Escolha uma secretaria para acessar seus módulos.</p>
              </div>

              {loading ? (
                <div className="secretariat-empty" role="status"><p>Carregando secretarias…</p></div>
              ) : loadError ? (
                <div className="secretariat-empty" role="alert"><p>{loadError}</p></div>
              ) : secretariats.length === 0 ? (
                <div className="secretariat-empty" role="status">
                  <span className="secretariat-empty-icon"><Building2 size={24} aria-hidden="true" /></span>
                  <h2>Nenhuma secretaria ativa</h2>
                  <p>Entre em contato com o administrador do sistema.</p>
                </div>
              ) : (
                <div className="secretariat-grid">
                  {secretariats.map((secretariat) => {
                    const Icon = getMunicipalIcon(secretariat.icon_name)
                    return (
                      <button
                        key={secretariat.id}
                        className={`secretariat-card secretariat-card--${secretariat.id}`}
                        type="button"
                        aria-label={`Acessar secretaria: ${secretariat.name}`}
                        onClick={() => setSelectedSecretariatId(secretariat.id)}
                      >
                        <span className="secretariat-card-icon"><Icon size={25} strokeWidth={1.9} aria-hidden="true" /></span>
                        <span className="secretariat-card-title">{secretariat.name}</span>
                        <span className="secretariat-card-description">{secretariat.description}</span>
                        <span className="secretariat-card-action">Acessar secretaria <ArrowRight size={16} aria-hidden="true" /></span>
                      </button>
                    )
                  })}
                  {canManageGovernance && (
                    <button
                      className="secretariat-card governance-card"
                      type="button"
                      aria-label="Acessar Governança municipal"
                      onClick={onOpenGovernance}
                    >
                      <span className="secretariat-card-icon"><Settings size={25} strokeWidth={1.9} aria-hidden="true" /></span>
                      <span className="secretariat-card-title">Governança</span>
                      <span className="secretariat-card-description">Configure secretarias, usuários e módulos.</span>
                      <span className="secretariat-card-action">Acessar painel <ArrowRight size={16} aria-hidden="true" /></span>
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  )
}
