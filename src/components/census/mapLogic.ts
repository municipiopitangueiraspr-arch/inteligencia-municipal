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
  label: string | null
  cadastral_label?: string | null
  street_name?: string | null
  neighborhood_name?: string | null
  block_reference?: string | null
  layer_name: string
  geometry: [number, number][]
  area: number
  is_valid: true
  problem_reasons: string[]
  zone_number: null
}
export type DxfEntity = {
  entity_index: number
  entity_type: string
  layer_name: string | null
  handle: string | null
  text_content: string | null
  insertion_point: [number, number] | null
  geometry: [number, number][] | null
  raw_pairs: [string, string][]
  metadata: { closed?: boolean }
}
export type DxfLotParseResult = {
  lots: DxfLotBoundary[]
  entities: DxfEntity[]
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

function cleanDxfText(value: string) {
  return value
    .replace(/\\f[^;]+;/gi, '')
    .replace(/\\H[^;]+;/gi, '')
    .replace(/\\[Pp]/g, ' ')
    .replace(/\\~/g, ' ')
    .replace(/\\U\+[0-9A-F]{4}/gi, (match) => String.fromCharCode(parseInt(match.slice(3), 16)))
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseDxfLotBoundaries(text: string): DxfLotParseResult {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim())
  const pairs: [string, string][] = []
  for (let i = 0; i + 1 < lines.length; i += 2) pairs.push([lines[i], lines[i + 1]])
  const entities: DxfEntity[] = []
  let section = ''
  let entity: { type: string; layer: string | null; handle: string | null; text: string[]; x: number | null; y: number | null; pendingX: number | null; closed: boolean; geometry: [number, number][]; raw: [string, string][] } | null = null
  const flush = () => {
    if (!entity || section !== 'ENTITIES') return
    entities.push({
      entity_index: entities.length,
      entity_type: entity.type,
      layer_name: entity.layer,
      handle: entity.handle,
      text_content: entity.text.length ? cleanDxfText(entity.text.join('')) : null,
      insertion_point: entity.x !== null && entity.y !== null ? [entity.x, entity.y] : null,
      geometry: entity.geometry.length ? entity.geometry : null,
      raw_pairs: entity.raw,
      metadata: { closed: entity.closed },
    })
  }
  for (const [code, value] of pairs) {
    if (code === '0' && value === 'SECTION') { flush(); entity = null; section = 'PENDING'; continue }
    if (section === 'PENDING' && code === '2') { section = value.toUpperCase(); continue }
    if (code === '0' && value === 'ENDSEC') { flush(); entity = null; section = ''; continue }
    if (code === '0') { flush(); entity = section === 'ENTITIES' ? { type: value, layer: null, handle: null, text: [], x: null, y: null, pendingX: null, closed: false, geometry: [], raw: [] } : null; continue }
    if (!entity || section !== 'ENTITIES') continue
    entity.raw.push([code, value])
    if (code === '5') entity.handle = value
    if (code === '8') entity.layer = value
    if (code === '1' || code === '3') entity.text.push(value)
    if (code === '10') { const x = Number(value); if (Number.isFinite(x)) { entity.x = entity.x ?? x; entity.pendingX = x } }
    if (code === '20') { const y = Number(value); if (Number.isFinite(y)) { entity.y = entity.y ?? y; if (entity.pendingX !== null && entity.type === 'LWPOLYLINE') { entity.geometry.push([entity.pendingX, y]); entity.pendingX = null } } }
    if (code === '70' && entity.type === 'LWPOLYLINE') entity.closed = (Number(value) & 1) === 1
  }
  flush()

  const candidates = entities.filter((item) => item.entity_type === 'LWPOLYLINE' && item.layer_name?.trim().toLowerCase() === 'lotes urbanos')
  const source = candidates.filter((item) => isImportableLotGeometry(item.layer_name || '', Boolean(item.metadata.closed), item.geometry || []))
  const cadastralTexts = entities.filter((item) => item.entity_type === 'MTEXT' && item.layer_name?.trim().toLowerCase() === 'lotes urbanos' && item.text_content && item.insertion_point)
  const streetTexts = entities.filter((item) => item.entity_type === 'MTEXT' && item.layer_name === 'Sistema_Viario' && item.text_content && item.insertion_point)
  const neighborhoodTexts = entities.filter((item) => item.entity_type === 'MTEXT' && item.layer_name === 'Quadras_Point' && item.text_content && item.insertion_point)
  const centroid = (points: [number, number][]) => points.reduce((acc, point) => [acc[0] + point[0] / points.length, acc[1] + point[1] / points.length], [0, 0] as [number, number])
  const nearestText = (point: [number, number], rows: DxfEntity[]) => rows.reduce<{ distance: number; text: string | null } | null>((best, row) => { const at = row.insertion_point as [number, number]; const distance = Math.hypot(at[0] - point[0], at[1] - point[1]); return !best || distance < best.distance ? { distance, text: row.text_content } : best }, null)?.text || null
  const textInside = (point: [number, number], polygon: [number, number][]) => { let inside = false; for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) { const a = polygon[i]; const b = polygon[j]; const cross = ((a[1] > point[1]) !== (b[1] > point[1])) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]; if (cross) inside = !inside } return inside }
  const lots: DxfLotBoundary[] = source.map((item, index) => {
    const geometry = (item.geometry || []) as [number, number][]
    const area = Math.abs(geometry.reduce((sum, point, pointIndex) => {
      const next = geometry[(pointIndex + 1) % geometry.length]
      return sum + point[0] * next[1] - next[0] * point[1]
    }, 0) / 2)
    const center = centroid(geometry)
    const cadastral = cadastralTexts.find((text) => text.insertion_point && textInside(text.insertion_point, geometry))?.text_content || null
    const neighborhood = nearestText(center, neighborhoodTexts)
    const neighborhoodMatch = neighborhood?.match(/^([^\s]+)\s+(.+)$/)
    return {
      source_handle: item.handle || `entity-${index + 1}`,
      label: cadastral,
      cadastral_label: cadastral,
      street_name: nearestText(center, streetTexts),
      neighborhood_name: neighborhoodMatch?.[2]?.trim() || neighborhood,
      block_reference: neighborhoodMatch?.[1] || neighborhood,
      layer_name: item.layer_name || 'Lotes Urbanos',
      geometry,
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
    entities,
    bbox,
    sourceLayer: source[0]?.layer_name || candidates[0]?.layer_name || 'Lotes Urbanos',
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
