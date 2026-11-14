import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Settings,
} from 'lucide-react'
import type {
  MunicipalModule,
  MunicipalSecretariat,
  MunicipalSecretariatModule,
} from '../lib/municipal-catalog'
import { getMunicipalIcon } from '../lib/municipal-catalog'
import { supabase } from '../lib/supabase'
import { MatrixHeader } from './MatrixHeader'
import './Dashboard.css'
const selectedSecretariatStorageKey = 'inteligencia-municipal.selected-secretariat'

type DashboardProps = {
  userEmail?: string
  onOpenFleet: () => void
  onOpenCensus: () => void
  onOpenMedicalVisits: () => void
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

const plannedHealthAreas = [
  { id: 'health-surveillance', label: 'Vigilância Sanitária', description: 'Inspeções, licenças e acompanhamento sanitário.', icon_name: 'ShieldCheck' },
  { id: 'primary-care', label: 'Atenção Básica', description: 'Linhas de cuidado e acompanhamento da rede.', icon_name: 'HeartPulse' },
  { id: 'pharmacy', label: 'Farmácia e Assistência', description: 'Gestão de medicamentos e dispensação.', icon_name: 'Package' },
  { id: 'medical-regulation', label: 'Regulação e Encaminhamentos', description: 'Organização de solicitações e referências.', icon_name: 'Stethoscope' },
  { id: 'dental-care', label: 'Saúde Bucal', description: 'Atendimento e acompanhamento odontológico.', icon_name: 'HeartHandshake' },
  { id: 'health-transport', label: 'Transporte Sanitário', description: 'Solicitações e logística de deslocamentos.', icon_name: 'Truck' },
] as const

export function Dashboard({ userEmail, onOpenFleet, onOpenCensus, onOpenMedicalVisits, onOpenGovernance, onLogout }: DashboardProps) {
  const [secretariats, setSecretariats] = useState<MunicipalSecretariat[]>([])
  const [modules, setModules] = useState<MunicipalModule[]>([])
  const [secretariatModules, setSecretariatModules] = useState<MunicipalSecretariatModule[]>([])
  const [canManageGovernance, setCanManageGovernance] = useState(false)
  const [userName, setUserName] = useState('')
  const [userAvatarUrl, setUserAvatarUrl] = useState('')
  const [moduleSearchQuery, setModuleSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [selectedSecretariatId, setSelectedSecretariatId] = useState<string | null>(() => {
    try { return window.sessionStorage.getItem(selectedSecretariatStorageKey) }
    catch { return null }
  })

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
      const [secretariatResult, moduleResult, mappingResult, adminResult, userResult] = await Promise.all([
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
        supabase.auth.getUser(),
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
      const metadata = (userResult.data.user?.user_metadata || {}) as Record<string, unknown>
      setUserName(String(metadata.full_name || metadata.name || metadata.nome_completo || ''))
      setUserAvatarUrl(String(metadata.avatar_url || metadata.photo_url || ''))
      setLoading(false)
    }

    void loadHall()
    return () => { mounted = false }
  }, [])

  const selectSecretariat = (id: string) => {
    setSelectedSecretariatId(id)
    setModuleSearchQuery('')
    try { window.sessionStorage.setItem(selectedSecretariatStorageKey, id) }
    catch { /* If storage is unavailable, navigation still works for this view. */ }
  }

  const returnToSecretariats = () => {
    setSelectedSecretariatId(null)
    try { window.sessionStorage.removeItem(selectedSecretariatStorageKey) }
    catch { /* If storage is unavailable, navigation still works for this view. */ }
  }

  const selectedSecretariat = secretariats.find((secretariat) => secretariat.id === selectedSecretariatId)
  const availableModules = selectedSecretariat
    ? secretariatModules
      .filter((mapping) => mapping.secretariat_id === selectedSecretariat.id)
      .map((mapping) => modules.find((module) => module.id === mapping.module_id))
      .filter((module): module is MunicipalModule => Boolean(module) && (module?.id !== 'medical-visits' || canManageGovernance))
    : []
  const normalizedModuleQuery = moduleSearchQuery.trim().toLocaleLowerCase('pt-BR')
  const visibleModules = availableModules.filter((module) => {
    if (!normalizedModuleQuery) return true
    return `${module.label} ${module.description || ''} ${module.status_label || ''}`.toLocaleLowerCase('pt-BR').includes(normalizedModuleQuery)
  })
  const filteredPlannedHealthAreas = plannedHealthAreas.filter((area) => {
    if (!normalizedModuleQuery) return true
    return `${area.label} ${area.description}`.toLocaleLowerCase('pt-BR').includes(normalizedModuleQuery)
  })
  const searchItems = selectedSecretariat
    ? [...availableModules.map((module) => ({ id: module.id, name: module.label, description: module.description })), ...plannedHealthAreas.map((area) => ({ id: area.id, name: area.label, description: area.description }))]
    : secretariats.map((secretariat) => ({ id: secretariat.id, name: secretariat.name, description: secretariat.description }))
  const handleHeaderSearchSelect = selectedSecretariat
    ? (id: string) => setModuleSearchQuery(availableModules.find((module) => module.id === id)?.label || plannedHealthAreas.find((area) => area.id === id)?.label || '')
    : selectSecretariat

  const openModule = (id: string) => {
    if (id === 'fleet') onOpenFleet()
    if (id === 'census') onOpenCensus()
    if (id === 'medical-visits') onOpenMedicalVisits()
  }

  return (
    <div className="dashboard-shell">
      <MatrixHeader
        key={selectedSecretariatId || 'hall'}
        userEmail={userEmail}
        userName={userName}
        userAvatarUrl={userAvatarUrl}
        searchItems={searchItems}
        onSearchSelect={handleHeaderSearchSelect}
        searchPlaceholder={selectedSecretariat ? 'Buscar módulos...' : 'Secretarias'}
        onSearchQueryChange={selectedSecretariat ? setModuleSearchQuery : undefined}
        onLogout={onLogout}
      />

      <main className="dashboard-main">
        <div className="dashboard-content">
          {selectedSecretariatId && loading ? (
            <section className="department-view" role="status"><div className="secretariat-empty"><p>Carregando módulos da secretaria…</p></div></section>
          ) : selectedSecretariat ? (
            <section className="department-view" aria-labelledby="departmentTitle">
              <button className="secretariat-back-button" type="button" onClick={returnToSecretariats}>
                <ArrowLeft size={17} aria-hidden="true" />
                Secretarias
              </button>

              <div className="department-heading">
                <span className="department-heading-icon" aria-hidden="true">
                  {(() => { const Icon = getMunicipalIcon(selectedSecretariat.icon_name); return <Icon size={30} strokeWidth={2.3} /> })()}
                </span>
                <div>
                  <h1 id="departmentTitle">{selectedSecretariat.name}</h1>
                  <p>Escolha um módulo para continuar.</p>
                </div>
              </div>

              {selectedSecretariat.id === 'health' ? (
                <div className="health-command-panel">
                  <div className="health-panel-intro">
                    <div>
                      <span className="health-panel-kicker">CENTRAL DA SECRETARIA</span>
                      <h2>Painel de Saúde</h2>
                      <p>Central de módulos, operações e acompanhamento da Secretaria de Saúde.</p>
                    </div>
                    <span className="health-panel-status"><span className="health-status-dot" /> Ambiente operacional</span>
                  </div>

                  <div className="health-metrics" aria-label="Resumo da Secretaria de Saúde">
                    <div><strong>{availableModules.length}</strong><span>Módulos ativos</span></div>
                    <div><strong>{plannedHealthAreas.length}</strong><span>Áreas planejadas</span></div>
                    <div><strong>{availableModules.length + plannedHealthAreas.length}</strong><span>Frentes da Saúde</span></div>
                    <div><strong>Atual</strong><span>Acesso disponível</span></div>
                  </div>

                  {visibleModules.length > 0 || filteredPlannedHealthAreas.length > 0 ? (
                    <>
                      <div className="health-section-heading">
                        <div><span className="health-panel-kicker">MÓDULO PRINCIPAL</span><h2>Operação em destaque</h2></div>
                        <span>{visibleModules.length} operacional{visibleModules.length === 1 ? '' : 'is'}</span>
                      </div>
                      <div className="health-feature-layout">
                        {visibleModules.slice(0, 1).map((module) => {
                          const Icon = getMunicipalIcon(module.icon_name)
                          const hasRoute = module.id === 'fleet' || module.id === 'census' || (module.id === 'medical-visits' && canManageGovernance)
                          const canOpen = module.is_ready && hasRoute
                          return <button key={module.id} className={`module-card module-card--featured module-card--${moduleToneById[module.id] || 'fleet'}`} type="button" disabled={!canOpen} onClick={() => openModule(module.id)}>
                            <span className="module-card-top"><span className="module-icon"><Icon size={30} strokeWidth={2.2} aria-hidden="true" /></span><span className="module-status module-status--active"><span className="status-dot" />Operacional</span></span>
                            <span className="module-card-title">{module.label}</span>
                            <span className="module-card-description">{module.description}</span>
                            <span className="module-card-action">Acessar módulo <ArrowRight size={17} aria-hidden="true" /></span>
                          </button>
                        })}
                        <div className="health-planned-panel">
                          <div className="health-section-heading health-section-heading--compact"><div><span className="health-panel-kicker">EXPANSÃO</span><h2>Próximas áreas</h2></div><span>{filteredPlannedHealthAreas.length} planejadas</span></div>
                          <div className="health-planned-grid">
                            {filteredPlannedHealthAreas.map((area) => { const Icon = getMunicipalIcon(area.icon_name); return <div className="health-planned-card" key={area.id}><span className="health-planned-icon"><Icon size={19} aria-hidden="true" /></span><span><strong>{area.label}</strong><small>{area.description}</small></span><em>Planejado</em></div> })}
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="secretariat-empty" role="status"><span className="secretariat-empty-icon"><Building2 size={24} aria-hidden="true" /></span><h2>Nenhum módulo encontrado</h2><p>Não encontramos uma área para “{moduleSearchQuery}”.</p></div>
                  )}
                </div>
              ) : visibleModules.length > 0 ? (
                <div className={`module-grid${selectedSecretariat.id === 'health' ? ' module-grid--health' : ''}`} aria-label={`Módulos de ${selectedSecretariat.name}`}>
                  {visibleModules.map((module) => {
                    const Icon = getMunicipalIcon(module.icon_name)
                    const hasRoute = module.id === 'fleet' || module.id === 'census' || (module.id === 'medical-visits' && canManageGovernance)
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
                  <h2>{normalizedModuleQuery ? 'Nenhum módulo encontrado' : 'Nenhum módulo disponível ainda'}</h2>
                  <p>{normalizedModuleQuery ? `Não encontramos módulos para “${moduleSearchQuery}”.` : 'Os módulos desta secretaria serão adicionados conforme os fluxos forem definidos.'}</p>
                </div>
              )}
            </section>
          ) : (
            <section className="secretariat-section" aria-labelledby="secretariatTitle">
              <div className="hall-heading">
                <span className="hall-kicker">MATRIXIA · INTRANET</span>
                <h1 id="secretariatTitle">Hall da Intranet</h1>
                <p>Escolha uma área para acessar os módulos integrados.</p>
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
                        onClick={() => selectSecretariat(secretariat.id)}
                      >
                        <span className="secretariat-card-icon"><Icon size={29} strokeWidth={2.3} aria-hidden="true" /></span>
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
