export type MapLotPoint = readonly [number, number]
export type MapViewState = { zoom: number; pan: { x: number; y: number } }
export type MapViewAnchor = { x: number; y: number }

export type MapLotAssignment = {
  id?: string
  source_handle: string
  zone_id?: string | null
  zone_number?: number | null
}

export type MapLotMergeMatch = { matched_lot_id: string | null; merge_status: 'MATCHED' | 'NEW' }

export type MapZoneColor = { id: string; color: string }
export type MapSelectionRect = { left: number; top: number; right: number; bottom: number }
export type MapPolygonForSelection = { key: string; points: MapLotPoint[] }
export type LotSaveGroup = { zoneId: string | null; lotIds: string[] }
export type DxfLotBoundary = {
  id?: string
  source_handle: string
  label: null
  layer_name: string
  geometry: [number, number][]
  area: number
  is_valid: true
  problem_reasons: string[]
  zone_number: null
}
export type DxfLotParseResult = {
  lots: DxfLotBoundary[]
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null
  sourceLayer: string
  ignoredGeometryCount: number
}

export const MIN_MAP_ZOOM = 0.65
export const MAX_MAP_ZOOM = 64

export function getLotKey(lot: MapLotAssignment) {
  return lot.id || lot.source_handle
}

export function withLotIds<T extends { id?: string }>(lots: T[], createId: () => string): Array<T & { id: string }> {
  return lots.map((lot) => ({ ...lot, id: createId() }))
}

function normalizedCoordinate(value: number) {
  return Object.is(value, -0) ? '0' : String(value)
}

/** Canonical exact fingerprint: ring start and winding direction do not affect a match. */
export function exactLotGeometryFingerprint(geometry: readonly MapLotPoint[]) {
  const points = geometry.map(([x, y]) => [normalizedCoordinate(x), normalizedCoordinate(y)] as const)
  if (points.length > 1 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1]) points.pop()
  if (!points.length) return ''
  const rings = [points, [...points].reverse()]
  const candidates = rings.flatMap((ring) => ring.map((_, start) => [...ring.slice(start), ...ring.slice(0, start)].map(([x, y]) => `${x},${y}`).join(';')))
  return candidates.sort()[0]
}

/** Match only unique, byte-exact geometries; ambiguous or changed lots require human review. */
export function matchDraftLotsToCurrent<D extends { geometry: [number, number][]; zone_id?: string | null }, C extends { id?: string; geometry: readonly MapLotPoint[]; zone_id?: string | null }>(draftLots: D[], currentLots: C[]): Array<D & MapLotMergeMatch> {
  const byGeometry = new Map<string, C[]>()
  for (const lot of currentLots) {
    const fingerprint = exactLotGeometryFingerprint(lot.geometry)
    if (!fingerprint) continue
    byGeometry.set(fingerprint, [...(byGeometry.get(fingerprint) || []), lot])
  }
  const used = new Set<string>()
  return draftLots.map((lot) => {
    const candidates = byGeometry.get(exactLotGeometryFingerprint(lot.geometry)) || []
    const match = candidates.length === 1 && candidates[0].id && !used.has(candidates[0].id) ? candidates[0] : null
    if (match?.id) used.add(match.id)
    return {
      ...lot,
      matched_lot_id: match?.id || null,
      merge_status: match ? 'MATCHED' : 'NEW',
      ...(match ? { zone_id: match.zone_id ?? null } : {}),
    }
  })
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

export function groupLotSaveAssignments(lots: MapLotAssignment[]): LotSaveGroup[] {
  const ids = lots.map((lot) => lot.id).filter((id): id is string => Boolean(id))
  if (ids.length !== lots.length) throw new Error('Há lote(s) sem UUID. Recarregue o mapa antes de salvar.')
  if (new Set(ids).size !== ids.length) throw new Error('Há UUIDs de lote repetidos. Recarregue o mapa antes de salvar.')
  const groups = new Map<string | null, string[]>()
  for (const lot of lots) {
    const id = lot.id as string
    const zoneId = lot.zone_id || null
    groups.set(zoneId, [...(groups.get(zoneId) || []), id])
  }
  return Array.from(groups, ([zoneId, lotIds]) => ({ zoneId, lotIds }))
}

export function getLotFillColor(lot: MapLotAssignment, zones: MapZoneColor[]) {
  return zones.find((zone) => zone.id === lot.zone_id)?.color || '#4b5563'
}

export function filterUnassignedLots<T extends { zone_id?: string | null }>(lots: T[], onlyUnassigned: boolean) {
  return onlyUnassigned ? lots.filter((lot) => !lot.zone_id) : lots
}

export function shouldStartMapPan(targetIsLot: boolean) {
  return !targetIsLot
}

export function zoomMapViewAtOffset(view: MapViewState, factor: number, anchor: MapViewAnchor): MapViewState {
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 1
  const zoom = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, view.zoom * safeFactor))
  const ratio = zoom / view.zoom
  return {
    zoom,
    pan: {
      x: anchor.x - (anchor.x - view.pan.x) * ratio,
      y: anchor.y - (anchor.y - view.pan.y) * ratio,
    },
  }
}

export function isImportableLotGeometry(layer: string, closed: boolean, points: MapLotPoint[]) {
  if (layer.trim().toLowerCase() !== 'lotes urbanos' || !closed || points.length < 3) return false
  const area = Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2)
  return area > 0
}

export function parseDxfLotBoundaries(text: string): DxfLotParseResult {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim())
  const polylines: Array<{ handle: string; layer: string; closed: boolean; points: [number, number][] }> = []
  let section = ''
  let waitingForSectionName = false
  let entity: { type: string; handle: string; layer: string; closed: boolean; points: [number, number][] } | null = null

  const flush = () => {
    if (entity?.type === 'LWPOLYLINE') {
      polylines.push({ handle: entity.handle, layer: entity.layer, closed: entity.closed, points: entity.points })
    }
  }

  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i]
    const value = lines[i + 1]

    if (code === '0' && value === 'SECTION') {
      flush()
      entity = null
      waitingForSectionName = true
      continue
    }
    if (waitingForSectionName && code === '2') {
      section = value.toUpperCase()
      waitingForSectionName = false
      continue
    }
    if (code === '0' && value === 'ENDSEC') {
      flush()
      entity = null
      section = ''
      waitingForSectionName = false
      continue
    }
    if (code === '0') {
      flush()
      entity = section === 'ENTITIES' ? { type: value, handle: '', layer: '', closed: false, points: [] } : null
      continue
    }
    if (!entity || section !== 'ENTITIES') continue

    if (code === '5') entity.handle = value
    if (code === '8') entity.layer = value
    if (entity.type === 'LWPOLYLINE') {
      if (code === '70') entity.closed = (Number(value) & 1) === 1
      if (code === '10') {
        const x = Number(value)
        const nextCode = lines[i + 2]
        const y = nextCode === '20' ? Number(lines[i + 3]) : NaN
        if (Number.isFinite(x) && Number.isFinite(y)) {
          entity.points.push([x, y])
          i += 2
        }
      }
    }
  }
  flush()

  const candidates = polylines.filter((polyline) => polyline.layer.trim().toLowerCase() === 'lotes urbanos')
  const source = candidates.filter((polyline) => isImportableLotGeometry(polyline.layer, polyline.closed, polyline.points))
  const lots: DxfLotBoundary[] = source.map((polyline, index) => {
    const area = Math.abs(polyline.points.reduce((sum, point, pointIndex) => {
      const next = polyline.points[(pointIndex + 1) % polyline.points.length]
      return sum + point[0] * next[1] - next[0] * point[1]
    }, 0) / 2)
    return {
      source_handle: polyline.handle || `entity-${index + 1}`,
      label: null,
      layer_name: polyline.layer,
      geometry: polyline.points,
      area,
      is_valid: true,
      problem_reasons: [],
      zone_number: null,
    }
  })

  let bbox: DxfLotParseResult['bbox'] = null
  for (const lot of lots) {
    for (const [x, y] of lot.geometry) {
      if (!bbox) bbox = { minX: x, minY: y, maxX: x, maxY: y }
      else {
        bbox.minX = Math.min(bbox.minX, x)
        bbox.minY = Math.min(bbox.minY, y)
        bbox.maxX = Math.max(bbox.maxX, x)
        bbox.maxY = Math.max(bbox.maxY, y)
      }
    }
  }

  return {
    lots,
    bbox,
    sourceLayer: source[0]?.layer || candidates[0]?.layer || 'Lotes Urbanos',
    ignoredGeometryCount: candidates.length - source.length,
  }
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
