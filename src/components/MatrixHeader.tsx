import { ChevronDown, LogOut, Search } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './MatrixHeader.css'

export type MatrixHeaderSearchItem = {
  id: string
  name: string
  description?: string
}

type MatrixHeaderProps = {
  userEmail?: string
  userName?: string
  userAvatarUrl?: string
  searchItems?: MatrixHeaderSearchItem[]
  onSearchSelect?: (id: string) => void
  searchPlaceholder?: string
  onSearchQueryChange?: (query: string) => void
  onLogout: () => void
}

const initialsFrom = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U'

export function MatrixHeader({ userEmail, userName, userAvatarUrl, searchItems = [], onSearchSelect, searchPlaceholder = 'Secretarias', onSearchQueryChange, onLogout }: MatrixHeaderProps) {
  const [query, setQuery] = useState('')
  const [accountOpen, setAccountOpen] = useState(false)
  const accountRef = useRef<HTMLDivElement>(null)
  const displayName = userName || userEmail || 'Usuário institucional'
  const filteredItems = searchItems.filter((item) => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    if (!normalizedQuery) return true
    return `${item.name} ${item.description || ''}`.toLocaleLowerCase('pt-BR').includes(normalizedQuery)
  }).slice(0, 8)
  const shouldShowSuggestions = query.trim().length >= 3

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false)
    }
    document.addEventListener('mousedown', closeOnOutsideClick)
    return () => document.removeEventListener('mousedown', closeOnOutsideClick)
  }, [])

  const chooseSearchItem = (id: string) => {
    onSearchSelect?.(id)
    setQuery('')
  }

  return (
    <header className="matrix-header">
      <div className="matrix-header-inner">
        <div className="matrix-header-brand" aria-label="MatrixIA">
          <span className="matrix-header-mark"><img src={`${import.meta.env.BASE_URL}assets/matrixia-mark.png`} alt="" /></span>
          <span className="matrix-header-wordmark">Matrix<span>IA</span></span>
        </div>

        <div className="matrix-header-search">
          <Search className="matrix-search-leading-icon" size={18} aria-hidden="true" />
          <input
            type="search"
            aria-label="Buscar secretarias"
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => { setQuery(event.target.value); onSearchQueryChange?.(event.target.value) }}
            onKeyDown={(event) => { if (event.key === 'Escape') { setQuery(''); onSearchQueryChange?.('') } }}
          />
          {shouldShowSuggestions && filteredItems.length > 0 && (
            <div className="matrix-search-results" role="listbox" aria-label="Secretarias encontradas">
              {filteredItems.map((item) => (
                <button key={item.id} type="button" role="option" className="matrix-search-result" onClick={() => chooseSearchItem(item.id)}>
                  <span className="matrix-search-result-icon"><Search size={15} aria-hidden="true" /></span>
                  <span><strong>{item.name}</strong>{item.description && <small>{item.description}</small>}</span>
                </button>
              ))}
            </div>
          )}
          {shouldShowSuggestions && filteredItems.length === 0 && <div className="matrix-search-empty">Nenhuma secretaria encontrada.</div>}
        </div>

        <div className="matrix-account" ref={accountRef}>
          <button className="matrix-account-trigger" type="button" aria-expanded={accountOpen} onClick={() => setAccountOpen((current) => !current)}>
            <span className="matrix-avatar">{userAvatarUrl ? <img src={userAvatarUrl} alt="" /> : initialsFrom(displayName)}</span>
            <span className="matrix-account-name">{displayName}</span>
            <ChevronDown size={17} aria-hidden="true" />
          </button>
          {accountOpen && (
            <div className="matrix-account-menu">
              <div className="matrix-account-summary">
                <span className="matrix-avatar matrix-avatar--menu">{userAvatarUrl ? <img src={userAvatarUrl} alt="" /> : initialsFrom(displayName)}</span>
                <div><strong>{displayName}</strong><small>{userEmail || 'E-mail não informado'}</small></div>
              </div>
              <button className="matrix-logout-action" type="button" onClick={onLogout}><LogOut size={16} aria-hidden="true" /> Sair</button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
