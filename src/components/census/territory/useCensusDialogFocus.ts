import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useCensusDialogFocus<T extends HTMLElement = HTMLElement>(open: boolean, onEscape: () => void) {
  const dialogRef = useRef<T | null>(null)
  const escapeHandlerRef = useRef(onEscape)

  useEffect(() => {
    escapeHandlerRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog) return

    const focusableElements = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true' && element.getClientRects().length > 0)

    const animationFrame = window.requestAnimationFrame(() => {
      const first = dialog.querySelector<HTMLElement>('[autofocus]') || focusableElements()[0] || dialog
      first.focus({ preventScroll: true })
    })

    function handleKeyDown(event: KeyboardEvent) {
      const activeModals = Array.from(document.querySelectorAll<HTMLElement>(
        '[role="dialog"][aria-modal="true"], [role="alertdialog"][aria-modal="true"]',
      ))
      if (activeModals.at(-1) !== dialog) return

      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        escapeHandlerRef.current()
        return
      }

      if (event.key !== 'Tab') return
      const focusable = focusableElements()
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus({ preventScroll: true })
        return
      }

      const index = focusable.indexOf(document.activeElement as HTMLElement)
      if (event.shiftKey && index <= 0) {
        event.preventDefault()
        focusable[focusable.length - 1].focus({ preventScroll: true })
      } else if (!event.shiftKey && (index === focusable.length - 1 || index < 0)) {
        event.preventDefault()
        focusable[0].focus({ preventScroll: true })
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
    }
  }, [open])

  return dialogRef
}
