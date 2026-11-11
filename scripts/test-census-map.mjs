import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const outputDir = mkdtempSync(join(tmpdir(), 'census-map-test-'))

try {
  execFileSync('npx', [
    'tsc',
    '--target', 'ES2022',
    '--module', 'commonjs',
    '--skipLibCheck',
    '--ignoreConfig',
    '--outDir', outputDir,
    'src/components/census/mapLogic.ts',
  ], { stdio: 'inherit' })

  const requireFromHere = createRequire(import.meta.url)
  const {
    assignLotToZone,
    assignLotsToZone,
    filterUnassignedLots,
    getLotFillColor,
    getLotKey,
    groupLotSaveAssignments,
    isImportableLotGeometry,
    mergeSelectedLotKeys,
    parseDxfLotBoundaries,
    selectLotKeysInRect,
    shouldStartMapPan,
    withLotIds,
    zoomMapViewAtOffset,
  } = requireFromHere(join(outputDir, 'mapLogic.js'))

  const square = [[0, 0], [10, 0], [10, 10], [0, 10]]
  assert.equal(isImportableLotGeometry('Lotes Urbanos', true, square), true, 'polígono fechado de lote é aceito')
  assert.equal(isImportableLotGeometry('Lotes Urbanos', false, square), false, 'polilinha aberta é ignorada')
  assert.equal(isImportableLotGeometry('Sistema_Viario', true, square), false, 'outras camadas não viram lotes')
  assert.equal(isImportableLotGeometry('Lotes Urbanos', true, [[0, 0], [1, 1], [2, 2]]), false, 'área zero é ignorada')

  const dxfFixture = [
    '0', 'SECTION', '2', 'BLOCKS',
    '0', 'LWPOLYLINE', '5', 'BLOCK-ONLY', '8', 'Lotes Urbanos', '90', '4', '70', '1', '10', '100', '20', '100', '10', '110', '20', '100', '10', '110', '20', '110', '10', '100', '20', '110',
    '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    '0', 'LWPOLYLINE', '5', 'LOT-A', '8', 'Lotes Urbanos', '90', '4', '70', '1', '10', '0', '20', '0', '10', '10', '20', '0', '10', '10', '20', '10', '10', '0', '20', '10',
    '0', 'HATCH', '8', 'Lotes Urbanos', '1', 'SOLID',
    '0', 'MTEXT', '8', 'Lotes Urbanos', '1', 'Rótulo que não deve virar atributo',
    '0', 'LWPOLYLINE', '5', 'OPEN', '8', 'Lotes Urbanos', '90', '4', '70', '0', '10', '20', '20', '20', '10', '30', '20', '20', '10', '30', '20', '30', '10', '20', '20', '30',
    '0', 'LWPOLYLINE', '5', 'ZERO', '8', 'Lotes Urbanos', '90', '3', '70', '1', '10', '40', '20', '40', '10', '41', '20', '41', '10', '42', '20', '42',
    '0', 'LWPOLYLINE', '5', 'ROAD', '8', 'Sistema_Viario', '90', '4', '70', '1', '10', '50', '20', '50', '10', '60', '20', '50', '10', '60', '20', '60', '10', '50', '20', '60',
    '0', 'ENDSEC', '0', 'EOF',
  ].join('\n')
  const parsedDxf = parseDxfLotBoundaries(dxfFixture)
  assert.equal(parsedDxf.lots.length, 1, 'somente o contorno fechado no ENTITIES e na camada de lotes é importado')
  assert.equal(parsedDxf.ignoredGeometryCount, 2, 'polilinhas abertas e sem área são contadas como geometria ignorada')
  assert.equal(parsedDxf.lots[0].source_handle, 'LOT-A', 'o handle CAD permanece apenas como chave técnica')
  assert.equal(parsedDxf.lots[0].label, null, 'textos do DXF não são importados como atributo do lote')
  assert.deepEqual(parsedDxf.lots[0].geometry, square, 'o registro contém apenas os pontos do contorno')
  assert.deepEqual(parsedDxf.bbox, { minX: 0, minY: 0, maxX: 10, maxY: 10 }, 'o enquadramento é derivado dos contornos aceitos')

  const unpannedView = { zoom: 1, pan: { x: 0, y: 0 } }
  const cursorAnchor = { x: 160, y: -75 }
  const zoomedAtCursor = zoomMapViewAtOffset(unpannedView, 2, cursorAnchor)
  assert.deepEqual(zoomedAtCursor, { zoom: 2, pan: { x: -160, y: 75 } }, 'o zoom no cursor ajusta o pan para preservar o ponto observado')
  const pannedView = { zoom: 3, pan: { x: -72, y: 31 } }
  const pannedZoom = zoomMapViewAtOffset(pannedView, 1.5, { x: 180, y: -60 })
  assert.equal(pannedZoom.zoom, 4.5, 'zoom conserva o fator aplicado')
  assert.ok(Math.abs((180 - pannedView.pan.x) / pannedView.zoom - (180 - pannedZoom.pan.x) / pannedZoom.zoom) < 1e-9, 'o ponto horizontal sob o cursor não deriva')
  assert.ok(Math.abs((-60 - pannedView.pan.y) / pannedView.zoom - (-60 - pannedZoom.pan.y) / pannedZoom.zoom) < 1e-9, 'o ponto vertical sob o cursor não deriva')
  assert.equal(zoomMapViewAtOffset(unpannedView, 1000, { x: 0, y: 0 }).zoom, 64, 'zoom máximo é limitado a 64x')
  assert.equal(zoomMapViewAtOffset({ zoom: 0.7, pan: { x: 0, y: 0 } }, 0.01, { x: 0, y: 0 }).zoom, 0.65, 'zoom mínimo continua limitado')

  let nextId = 0
  const importedLots = withLotIds([
    { source_handle: 'DXF-A', label: 'texto antigo A', zone_id: null },
    { source_handle: 'DXF-B', label: 'texto antigo B', zone_id: null },
    { source_handle: 'DXF-C', label: null, zone_id: null },
  ], () => `lot-${++nextId}`)
  assert.deepEqual(importedLots.map((lot) => lot.id), ['lot-1', 'lot-2', 'lot-3'], 'cada geometria recebe ID próprio')

  const zones = [
    { id: 'zone-green', color: '#16a34a' },
    { id: 'zone-red', color: '#dc2626' },
  ]
  const clickedLotKey = getLotKey(importedLots[1])
  const afterSingleClick = assignLotToZone(importedLots, clickedLotKey, 'zone-green')
  assert.deepEqual(afterSingleClick.map((lot) => lot.zone_id), [null, 'zone-green', null], 'clique individual altera somente o lote clicado')
  assert.equal(getLotFillColor(afterSingleClick[1], zones), '#16a34a', 'lote recebe a cor exata da zona ativa')
  assert.equal(getLotFillColor(afterSingleClick[0], zones), '#4b5563', 'lote sem zona usa cinza-escuro padrão')
  assert.deepEqual(filterUnassignedLots(afterSingleClick, true).map((lot) => lot.source_handle), ['DXF-A', 'DXF-C'], 'filtro sem zona exibe apenas lotes não atribuídos')
  assert.equal(filterUnassignedLots(afterSingleClick, false).length, afterSingleClick.length, 'com o filtro desligado, todos os lotes continuam visíveis')

  const legacyLotsWithoutIds = [
    { source_handle: 'legacy-A', zone_id: null },
    { source_handle: 'legacy-B', zone_id: null },
  ]
  const afterLegacyClick = assignLotToZone(legacyLotsWithoutIds, getLotKey(legacyLotsWithoutIds[0]), 'zone-green')
  assert.deepEqual(afterLegacyClick.map((lot) => lot.zone_id), ['zone-green', null], 'sem ID de banco, a chave DXF estável impede alterar todos os lotes')

  const afterGroupClick = assignLotsToZone(afterSingleClick, [getLotKey(importedLots[0]), getLotKey(importedLots[2])], 'zone-red')
  assert.deepEqual(afterGroupClick.map((lot) => lot.zone_id), ['zone-red', 'zone-green', 'zone-red'], 'seleção múltipla atribui todos e preserva o lote não selecionado')
  assert.deepEqual(afterGroupClick.map((lot) => getLotFillColor(lot, zones)), ['#dc2626', '#16a34a', '#dc2626'], 'cada lote exibe a cor correspondente à sua zona')

  assert.equal(shouldStartMapPan(true), false, 'pointer-down no polígono não captura o clique do lote')
  assert.equal(shouldStartMapPan(false), true, 'arrastar o fundo continua movendo o mapa')

  const areaLots = [
    { key: 'inside', points: [[2, 2], [4, 2], [4, 4], [2, 4]] },
    { key: 'crossing', points: [[9, 2], [12, 2], [12, 4], [9, 4]] },
    { key: 'outside', points: [[12, 12], [14, 12], [14, 14], [12, 14]] },
    { key: 'surrounding', points: [[-2, -2], [12, -2], [12, 12], [-2, 12]] },
  ]
  const selectionRect = { left: 0, top: 0, right: 10, bottom: 10 }
  assert.deepEqual(selectLotKeysInRect(areaLots, selectionRect, 'window'), ['inside'], 'janela esquerda→direita inclui somente lotes inteiramente contidos')
  assert.deepEqual(selectLotKeysInRect(areaLots, selectionRect, 'crossing'), ['inside', 'crossing', 'surrounding'], 'cruzamento direita→esquerda inclui polígonos que tocam ou envolvem a área')
  assert.deepEqual(mergeSelectedLotKeys(['prior'], ['inside', 'crossing'], true), ['prior', 'inside', 'crossing'], 'Shift/Ctrl/Cmd acrescenta os lotes à seleção atual')
  assert.deepEqual(mergeSelectedLotKeys(['prior'], ['inside'], false), ['inside'], 'sem modificador, a nova janela substitui a seleção atual')

  const saveGroups = groupLotSaveAssignments([
    { id: 'lot-1', source_handle: 'A', zone_id: 'zone-red' },
    { id: 'lot-2', source_handle: 'B', zone_id: 'zone-red' },
    { id: 'lot-3', source_handle: 'C', zone_id: null },
  ])
  assert.deepEqual(saveGroups, [{ zoneId: 'zone-red', lotIds: ['lot-1', 'lot-2'] }, { zoneId: null, lotIds: ['lot-3'] }], 'atualizações de salvamento são agrupadas por zona e incluem lotes desatribuídos')
  assert.throws(() => groupLotSaveAssignments([{ source_handle: 'missing-id' }]), /sem UUID/, 'save não pode transformar uma atribuição parcial em inserção')
  assert.throws(() => groupLotSaveAssignments([{ id: 'same', source_handle: 'A' }, { id: 'same', source_handle: 'B' }]), /repetidos/, 'IDs repetidos são rejeitados antes da gravação')

  console.log('PASS: parser de contornos, zoom no cursor, IDs, clique individual, seleção múltipla, paleta, filtro de lotes sem zona, pan e seleção por área (janela/cruzamento).')
} finally {
  rmSync(outputDir, { recursive: true, force: true })
}
