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
    getLotFillColor,
    getLotKey,
    isImportableLotGeometry,
    shouldStartMapPan,
    withLotIds,
  } = requireFromHere(join(outputDir, 'mapLogic.js'))

  const square = [[0, 0], [10, 0], [10, 10], [0, 10]]
  assert.equal(isImportableLotGeometry('Lotes Urbanos', true, square), true, 'polígono fechado de lote é aceito')
  assert.equal(isImportableLotGeometry('Lotes Urbanos', false, square), false, 'polilinha aberta é ignorada')
  assert.equal(isImportableLotGeometry('Sistema_Viario', true, square), false, 'outras camadas não viram lotes')
  assert.equal(isImportableLotGeometry('Lotes Urbanos', true, [[0, 0], [1, 1], [2, 2]]), false, 'área zero é ignorada')

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
  assert.equal(getLotFillColor(afterSingleClick[0], zones), '#edf5f4', 'lote sem zona mantém cor neutra')

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

  console.log('PASS: classificação geométrica, IDs, clique individual, seleção múltipla, cores de zona e pan.')
} finally {
  rmSync(outputDir, { recursive: true, force: true })
}
