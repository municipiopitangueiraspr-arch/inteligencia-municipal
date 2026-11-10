export function normalizeCadLabel(value: string | null | undefined): string {
  if (!value) return ''

  return value
    .replace(/\\U\+([0-9a-f]{4,6})/gi, (_match, code: string) => {
      const point = Number.parseInt(code, 16)
      return Number.isFinite(point) && point <= 0x10ffff ? String.fromCodePoint(point) : ''
    })
    .replace(/\f[^;]*;/g, '')
    .replace(/\\[fF][^;]*;/g, '')
    .replace(/\\[hHwWtTqQcCaApPsS][^;]*;/g, '')
    .replace(/\\[Pp]/g, ' ')
    .replace(/\\[lLoOkK]/g, '')
    .replace(/\\~/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/%%[dpc]/gi, (token) => ({ '%%d': '°', '%%p': '±', '%%c': 'Ø' })[token.toLowerCase()] || token)
    .replace(/\s+/g, ' ')
    .trim()
}

export function getMapLotCode(label: string | null | undefined, sourceHandle: string | null | undefined, index: number): string {
  return normalizeCadLabel(label)
    || normalizeCadLabel(sourceHandle)
    || `Lote ${String(index).padStart(4, '0')}`
}
