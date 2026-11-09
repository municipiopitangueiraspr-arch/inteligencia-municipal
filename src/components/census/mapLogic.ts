export type MapLotPoint = readonly [number, number]

export type MapLotAssignment = {
  id?: string
  source_handle: string
  zone_id?: string | null
  zone_number?: number | null
}

export type MapZoneColor = { id: string; color: string }

export function getLotKey(lot: MapLotAssignment) {
  return lot.id || lot.source_handle
}

export function withLotIds<T extends { id?: string }>(lots: T[], createId: () => string): Array<T & { id: string }> {
  return lots.map((lot) => ({ ...lot, id: createId() }))
}

export function assignLotToZone<T extends MapLotAssignment>(lots: T[], key: string, zoneId: string): T[] {
  return lots.map((lot) => getLotKey(lot) === key ? { ...lot, zone_id: zoneId, zone_number: null } : lot)
}

export function assignLotsToZone<T extends MapLotAssignment>(lots: T[], keys: Iterable<string>, zoneId: string): T[] {
  const selected = new Set(keys)
  return lots.map((lot) => selected.has(getLotKey(lot)) ? { ...lot, zone_id: zoneId, zone_number: null } : lot)
}

export function getLotFillColor(lot: MapLotAssignment, zones: MapZoneColor[]) {
  return zones.find((zone) => zone.id === lot.zone_id)?.color || '#edf5f4'
}

export function shouldStartMapPan(targetIsLot: boolean) {
  return !targetIsLot
}

export function isImportableLotGeometry(layer: string, closed: boolean, points: MapLotPoint[]) {
  if (layer.trim().toLowerCase() !== 'lotes urbanos' || !closed || points.length < 3) return false
  const area = Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2)
  return area > 0
}
