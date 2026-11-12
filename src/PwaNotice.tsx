import { useEffect, useState } from 'react'
import { Download, RefreshCw, X } from 'lucide-react'
import './PwaNotice.css'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaNotice() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null)
  const [updateReady, setUpdateReady] = useState(false)
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return
    let active = true
    let wasControlled = Boolean(navigator.serviceWorker.controller)
    let currentRegistration: ServiceWorkerRegistration | null = null

    const showIfWaiting = (candidate: ServiceWorkerRegistration) => {
      if (candidate.waiting && navigator.serviceWorker.controller) setUpdateReady(true)
    }
    const watchRegistration = (candidate: ServiceWorkerRegistration) => {
      if (!active) return
      currentRegistration = candidate
      setRegistration(candidate)
      showIfWaiting(candidate)
      const watchInstallingWorker = () => {
        const worker = candidate.installing
        if (!worker) return
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) setUpdateReady(true)
        })
      }
      candidate.addEventListener('updatefound', watchInstallingWorker)
      watchInstallingWorker()
      void candidate.update().catch(() => undefined)
    }

    const scriptUrl = new URL(`${import.meta.env.BASE_URL}sw.js`, window.location.origin)
    void navigator.serviceWorker.register(scriptUrl, { scope: import.meta.env.BASE_URL, updateViaCache: 'none' })
      .then(watchRegistration)
      .catch((error: unknown) => console.error('Não foi possível registrar o modo instalável:', error))

    const refreshCheck = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void currentRegistration?.update().catch(() => undefined)
    }
    const checkTimer = window.setInterval(refreshCheck, 3 * 60 * 1000)
    document.addEventListener('visibilitychange', refreshCheck)
    window.addEventListener('pageshow', refreshCheck)
    const onControllerChange = () => {
      if (wasControlled) window.location.reload()
      wasControlled = true
    }
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange)

    const onInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallPrompt(event as InstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', onInstallPrompt)
    window.addEventListener('appinstalled', () => setInstallPrompt(null))

    return () => {
      active = false
      window.clearInterval(checkTimer)
      document.removeEventListener('visibilitychange', refreshCheck)
      window.removeEventListener('pageshow', refreshCheck)
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange)
      window.removeEventListener('beforeinstallprompt', onInstallPrompt)
    }
  }, [])

  async function installApp() {
    if (!installPrompt) return
    await installPrompt.prompt()
    await installPrompt.userChoice
    setInstallPrompt(null)
  }

  function updateApp() {
    registration?.waiting?.postMessage({ type: 'SKIP_WAITING' })
  }

  if (dismissed || (!updateReady && !installPrompt)) return null

  return <aside className="pwa-notice" aria-live="polite" aria-atomic="true">
    <div className="pwa-notice-copy">
      <strong>{updateReady ? 'Nova versão disponível' : 'Instale no tablet'}</strong>
      <span>{updateReady ? 'Atualize quando terminar o que está fazendo.' : 'Acesse o sistema pela tela inicial do dispositivo.'}</span>
    </div>
    <div className="pwa-notice-actions">
      {updateReady && <button type="button" className="pwa-notice-action" onClick={updateApp}><RefreshCw size={17} /> Atualizar agora</button>}
      {!updateReady && installPrompt && <button type="button" className="pwa-notice-action" onClick={() => void installApp()}><Download size={17} /> Instalar</button>}
      <button type="button" className="pwa-notice-close" aria-label="Dispensar aviso" onClick={() => setDismissed(true)}><X size={18} /></button>
    </div>
  </aside>
}
