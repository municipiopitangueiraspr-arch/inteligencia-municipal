export const MUNICIPAL_TIME_ZONE = 'America/Sao_Paulo'

const dateTimePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MUNICIPAL_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function zonedParts(date: Date) {
  const parts = dateTimePartsFormatter.formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') }
}

export function municipalDateTimeInputValue(date = new Date()) {
  const parts = zonedParts(date)
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
}

/** Convert a datetime-local wall-clock value in America/Sao_Paulo into an absolute instant. */
export function municipalLocalInputToDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value)
  if (!match) return new Date(Number.NaN)
  const [, year, month, day, hour, minute] = match
  const targetWallTime = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute))
  const calendarDate = new Date(targetWallTime)
  if (calendarDate.getUTCFullYear() !== Number(year) || calendarDate.getUTCMonth() + 1 !== Number(month) || calendarDate.getUTCDate() !== Number(day) || calendarDate.getUTCHours() !== Number(hour) || calendarDate.getUTCMinutes() !== Number(minute)) return new Date(Number.NaN)
  let instant = targetWallTime

  // Iteratively compensate for the difference between UTC and the municipality's wall clock.
  // This keeps datetime-local inputs independent of the browser's configured timezone.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(instant))
    const representedWallTime = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute))
    const correction = targetWallTime - representedWallTime
    instant += correction
    if (correction === 0) break
  }
  const resolved = new Date(instant)
  const parts = zonedParts(resolved)
  if (parts.year !== year || parts.month !== month || parts.day !== day || parts.hour !== hour || parts.minute !== minute) return new Date(Number.NaN)
  return resolved
}

export function municipalLocalInputToIso(value: string) {
  const date = municipalLocalInputToDate(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString()
}

export function municipalDateStartIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return ''
  const midnight = municipalLocalInputToIso(`${value}T00:00`)
  if (midnight) return midnight

  // A historical DST transition can skip midnight; use the first valid local minute of that civil day.
  for (let minute = 1; minute <= 180; minute += 1) {
    const candidate = new Date(Date.UTC(year, month - 1, day, 0, minute))
    const wallTime = `${value}T${String(candidate.getUTCHours()).padStart(2, '0')}:${String(candidate.getUTCMinutes()).padStart(2, '0')}`
    const iso = municipalLocalInputToIso(wallTime)
    if (iso) return iso
  }
  return ''
}

export function municipalDateEndExclusiveIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return ''
  const [, year, month, day] = match
  const calendarDate = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (calendarDate.getUTCFullYear() !== Number(year) || calendarDate.getUTCMonth() + 1 !== Number(month) || calendarDate.getUTCDate() !== Number(day)) return ''
  const nextDay = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day) + 1))
  const nextDate = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDay.getUTCDate()).padStart(2, '0')}`
  return municipalDateStartIso(nextDate)
}

export function municipalTodayDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: MUNICIPAL_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function formatMunicipalDateTime(value?: string | Date | null) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: MUNICIPAL_TIME_ZONE }).format(date)
}

export function formatMunicipalDate(value?: string | null) {
  if (!value) return '—'
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const date = new Date(dateOnly ? `${value}T12:00:00Z` : value)
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: dateOnly ? 'UTC' : MUNICIPAL_TIME_ZONE }).format(date)
}
