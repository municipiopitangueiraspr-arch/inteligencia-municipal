export type MapLotPoint = readonly [number, number]

export type MapLotAssignment = {
  id?: string
  source_handle: string
  zone_id?: string | null
  zone_number?: number | null
}

export type MapZoneColor = { id: string; color: string }
export type MapSelectionRect = { left: number; top: number; right: number; bottom: number }
export type MapPolygonForSelection = { key: string; points: MapLotPoint[] }

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

export function mergeSelectedLotKeys(current: string[], picked: string[], additive: boolean) {
  return additive ? Array.from(new Set([...current, ...picked])) : picked
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

function pointInRect(point: MapLotPoint, rect: MapSelectionRect) {
  return point[0] >= rect.left && point[0] <= rect.right && point[1] >= rect.top && point[1] <= rect.bottom
}

function pointOnSegment(point: MapLotPoint, start: MapLotPoint, end: MapLotPoint) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1])
  if (Math.abs(cross) > 1e-7) return false
  return point[0] >= Math.min(start[0], end[0]) - 1e-7 && point[0] <= Math.max(start[0], end[0]) + 1e-7 && point[1] >= Math.min(start[1], end[1]) - 1e-7 && point[1] <= Math.max(start[1], end[1]) + 1e-7
}

function pointInPolygon(point: MapLotPoint, polygon: MapLotPoint[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const current = polygon[i]
    const previous = polygon[j]
    if (pointOnSegment(point, previous, current)) return true
    const crosses = (current[1] > point[1]) !== (previous[1] > point[1]) && point[0] < (previous[0] - current[0]) * (point[1] - current[1]) / (previous[1] - current[1]) + current[0]
    if (crosses) inside = !inside
  }
  return inside
}

function orientation(a: MapLotPoint, b: MapLotPoint, c: MapLotPoint) {
  const value = (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1])
  return Math.abs(value) < 1e-7 ? 0 : value > 0 ? 1 : 2
}

function segmentsIntersect(a: MapLotPoint, b: MapLotPoint, c: MapLotPoint, d: MapLotPoint) {
  const o1 = orientation(a, b, c)
  const o2 = orientation(a, b, d)
  const o3 = orientation(c, d, a)
  const o4 = orientation(c, d, b)
  if (o1 !== o2 && o3 !== o4) return true
  return (o1 === 0 && pointOnSegment(c, a, b)) || (o2 === 0 && pointOnSegment(d, a, b)) || (o3 === 0 && pointOnSegment(a, c, d)) || (o4 === 0 && pointOnSegment(b, c, d))
}

function polygonIntersectsRect(polygon: MapLotPoint[], rect: MapSelectionRect) {
  if (!polygon.length) return false
  if (polygon.some((point) => pointInRect(point, rect))) return true
  const corners: MapLotPoint[] = [[rect.left, rect.top], [rect.right, rect.top], [rect.right, rect.bottom], [rect.left, rect.bottom]]
  if (corners.some((corner) => pointInPolygon(corner, polygon))) return true
  const rectEdges: Array<[MapLotPoint, MapLotPoint]> = corners.map((point, index) => [point, corners[(index + 1) % corners.length]])
  return polygon.some((point, index) => rectEdges.some(([start, end]) => segmentsIntersect(point, polygon[(index + 1) % polygon.length], start, end)))
}

export function selectLotKeysInRect(polygons: MapPolygonForSelection[], rect: MapSelectionRect, mode: 'window' | 'crossing') {
  return polygons.filter(({ points }) => mode === 'window' ? points.length > 0 && points.every((point) => pointInRect(point, rect)) : polygonIntersectsRect(points, rect)).map(({ key }) => key)
}
