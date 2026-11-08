import { useState } from 'react'
import { CheckCircle2, CircleAlert, ShieldCheck } from 'lucide-react'

export type FleetConfirmationRequest = {
  eyebrow: string
  title: string
  message: string
  details: string[]
  confirmLabel: string
  tone?: 'danger'
  onConfirm: () => Promise<string | null | void>
}

export function FleetOperationConfirmation({ request, onClose }: { request: FleetConfirmationRequest; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function confirm() {
    setBusy(true)
    setError('')
    try {
      const result = await request.onConfirm()
      if (result) {
        setError(result)
        setBusy(false)
        return
      }
      onClose()
    } catch {
      setError('A operação não pôde ser concluída. Tente novamente.')
      setBusy(false)
    }
  }

  return <div className="fleet-confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="fleet-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="fleet-operation-confirm-title">
      <header className="fleet-confirm-heading"><span className={`fleet-confirm-emblem ${request.tone === 'danger' ? 'danger' : ''}`}><ShieldCheck size={20} /></span><div><span className="fleet-kicker">{request.eyebrow}</span><h2 id="fleet-operation-confirm-title">{request.title}</h2></div></header>
      <p className="fleet-confirm-message">{request.message}</p>
      {request.details.length > 0 && <div className="fleet-confirm-details">{request.details.map((detail) => <div key={detail}><CheckCircle2 size={14} /><span>{detail}</span></div>)}</div>}
      {error && <div className="fleet-confirm-error" role="alert"><CircleAlert size={15} />{error}</div>}
      <footer className="fleet-confirm-actions"><button className="fleet-secondary-button" type="button" onClick={onClose} disabled={busy}>Cancelar</button><button className={`fleet-primary-button ${request.tone === 'danger' ? 'fleet-confirm-danger' : ''}`} type="button" onClick={() => void confirm()} disabled={busy}><ShieldCheck size={15} />{busy ? 'Processando…' : request.confirmLabel}</button></footer>
    </section>
  </div>
}
