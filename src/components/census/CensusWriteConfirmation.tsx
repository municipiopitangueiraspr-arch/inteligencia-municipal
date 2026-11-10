import { ShieldCheck } from 'lucide-react'
import { useCensusDialogFocus } from './territory/useCensusDialogFocus'

export type CensusWriteConfirmationProps = {
  title: string
  description: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: () => void
}

export function CensusWriteConfirmation({ title, description, confirmLabel, onCancel, onConfirm }: CensusWriteConfirmationProps) {
  const dialogRef = useCensusDialogFocus(true, onCancel)

  return <div className="census-confirmation-backdrop">
    <section ref={dialogRef} tabIndex={-1} className="census-confirmation-dialog" role="alertdialog" aria-modal="true" aria-labelledby="census-confirmation-title" aria-describedby="census-confirmation-description">
      <span className="census-confirmation-icon"><ShieldCheck size={23} /></span>
      <span className="fleet-kicker">CONFIRMAÇÃO NECESSÁRIA</span>
      <h2 id="census-confirmation-title">{title}</h2>
      <p id="census-confirmation-description">{description}</p>
      <div className="census-confirmation-actions">
        <button type="button" className="fleet-secondary-button" autoFocus onClick={onCancel}>Cancelar</button>
        <button type="button" className="fleet-primary-button" onClick={onConfirm}><ShieldCheck size={16} />{confirmLabel}</button>
      </div>
    </section>
  </div>
}
