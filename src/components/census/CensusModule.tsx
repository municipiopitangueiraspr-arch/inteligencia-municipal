import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardList, FileText, FolderOpen, LayoutDashboard, LoaderCircle, LogOut, MapPinned, Save, ShieldCheck, Upload, UsersRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import '../FleetModule.css'
import './CensusModule.css'
import './CensusDWG.css'

type Point = [number, number]
type Lot = {
  id?: string
  source_handle: string
  label: string | null
  layer_name: string
  geometry: Point[]
  area: number
  is_valid: boolean
  problem_reasons: string[]
  zone_number: number | null
}
type MapImport = {
  id: string
  file_name: string
  mime_type: string
  file_size: number
  storage_path: string
  source_layer: string | null
  status: 'DRAFT' | 'PUBLISHED' | 'ERROR'
  total_features: number
  valid_features: number
  problematic_features: number
  bbox: { minX: number; minY: number; maxX: number; maxY: number } | null
  updated_at: string
  published_at: string | null
}
type CensusSection = 'overview' | 'territory' | 'dwg' | 'families' | 'forms' | 'zones'
type CensusModuleProps = { userEmail?: string; onBack: () => void; onLogout: () => void }

const zoneColors = ['#2c7892', '#ad7b26', '#3c8a70', '#8b5d91', '#c05c4d']
const navItems: { id: CensusSection; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'overview', label: 'Visão geral', icon: LayoutDashboard },
  { id: 'territory', label: 'Mapa territorial', icon: MapPinned },
  { id: 'dwg', label: 'Preparar mapa', icon: FolderOpen },
  { id: 'families', label: 'Famílias e visitas', icon: UsersRound },
  { id: 'forms', label: 'Questionários', icon: FileText },
  { id: 'zones', label: 'Zonas e ACS', icon: ClipboardList },
]

function areaOf(points: Point[]) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]
    return sum + point[0] * next[1] - next[0] * point[1]
  }, 0) / 2)
}
function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0]; const yi = polygon[i][1]
    const xj = polygon[j][0]; const yj = polygon[j][1]
    const intersects = yi > point[1] !== yj > point[1] && point[0] < (xj - xi) * (point[1] - yi) / ((yj - yi) || Number.EPSILON) + xi
    if (intersects) inside = !inside
  }
  return inside
}
function parseDxf(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim())
  const polylines: Array<{ handle: string; layer: string; closed: boolean; points: Point[] }> = []
  const texts: Array<{ layer: string; point: Point; value: string }> = []
  let entity: { type: string; handle: string; layer: string; closed: boolean; points: Point[]; point: Point; value: string } | null = null
  const flush = () => {
    if (!entity) return
    if (entity.type === 'LWPOLYLINE') polylines.push({ handle: entity.handle || `entity-${polylines.length + 1}`, layer: entity.layer, closed: entity.closed, points: entity.points })
    if (entity.type === 'MTEXT' && entity.value && Number.isFinite(entity.point[0]) && Number.isFinite(entity.point[1])) texts.push({ layer: entity.layer, point: entity.point, value: entity.value.replace(/\\P/g, ' ').replace(/\\~/g, ' ').trim() })
  }
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i]; const value = lines[i + 1]
    if (code === '0') { flush(); entity = { type: value, handle: '', layer: '', closed: false, points: [], point: [NaN, NaN], value: '' }; continue }
    if (!entity) continue
    if (code === '5') entity.handle = value
    if (code === '8') entity.layer = value
    if (entity.type === 'LWPOLYLINE') {
      if (code === '70') entity.closed = (Number(value) & 1) === 1
      if (code === '10') {
        const x = Number(value); const nextCode = lines[i + 2]; const y = nextCode === '20' ? Number(lines[i + 3]) : NaN
        if (Number.isFinite(x) && Number.isFinite(y)) { entity.points.push([x, y]); i += 2 }
      }
    }
    if (entity.type === 'MTEXT') {
      if (code === '10') entity.point[0] = Number(value)
      if (code === '20') entity.point[1] = Number(value)
      if (code === '1' || code === '3') entity.value += value
    }
  }
  flush()
  const source = polylines.filter((polyline) => polyline.layer.toLowerCase() === 'lotes urbanos')
  const lots: Lot[] = source.map((polyline) => {
    const area = polyline.points.length >= 3 ? areaOf(polyline.points) : 0
    const reasons: string[] = []
    if (!polyline.closed) reasons.push('Polilinha aberta')
    if (polyline.points.length < 3 || area <= 0) reasons.push('Área zero ou geometria insuficiente')
    const label = texts.find((item) => item.layer.toLowerCase() === 'lotes urbanos' && pointInPolygon(item.point, polyline.points))?.value || null
    if (!label) reasons.push('Sem identificador textual')
    return { source_handle: polyline.handle, label, layer_name: polyline.layer, geometry: polyline.points, area, is_valid: reasons.length === 0, problem_reasons: reasons, zone_number: null }
  })
  const allPoints = lots.flatMap((lot) => lot.geometry)
  const bbox = allPoints.length ? { minX: Math.min(...allPoints.map((point) => point[0])), minY: Math.min(...allPoints.map((point) => point[1])), maxX: Math.max(...allPoints.map((point) => point[0])), maxY: Math.max(...allPoints.map((point) => point[1])) } : null
  return { lots, bbox, textCount: texts.length, sourceLayer: source[0]?.layer || 'Lotes Urbanos' }
}
async function chunks<T>(values: T[], size: number, callback: (chunk: T[]) => Promise<void>) {
  for (let index = 0; index < values.length; index += size) await callback(values.slice(index, index + size))
}

export function CensusModule({ userEmail, onBack, onLogout }: CensusModuleProps) {
  const [view, setView] = useState<CensusSection>('dwg')
  const [mapImport, setMapImport] = useState<MapImport | null>(null)
  const [lots, setLots] = useState<Lot[]>([])
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([])
  const [activeZone, setActiveZone] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [reviewConfirmed, setReviewConfirmed] = useState(false)
  const [search, setSearch] = useState('')

  const loadSavedMap = async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    const { data: imports, error } = await supabase.from('census_map_imports').select('id,file_name,mime_type,file_size,storage_path,source_layer,status,total_features,valid_features,problematic_features,bbox,updated_at,published_at').in('status', ['DRAFT', 'PUBLISHED']).order('updated_at', { ascending: false }).limit(1)
    if (error || !imports?.[0]) { setMapImport(null); setLots([]); setLoading(false); return }
    const current = imports[0] as MapImport
    const { data: rows } = await supabase.from('census_map_lots').select('id,source_handle,label,layer_name,geometry,area,is_valid,problem_reasons,zone_number').eq('import_id', current.id).order('source_handle').limit(5000)
    setMapImport(current); setLots((rows || []) as Lot[]); setLoading(false)
  }
  useEffect(() => { void loadSavedMap() }, [])

  const filteredLots = useMemo(() => lots.filter((lot) => !search || `${lot.label || ''} ${lot.source_handle}`.toLowerCase().includes(search.toLowerCase())), [lots, search])
  const counts = useMemo(() => [1, 2, 3, 4, 5].map((zone) => lots.filter((lot) => lot.zone_number === zone).length), [lots])
  const problematic = lots.filter((lot) => !lot.is_valid)
  const currentBbox = mapImport?.bbox || (lots.length ? { minX: Math.min(...lots.flatMap((lot) => lot.geometry.map((point) => point[0]))), minY: Math.min(...lots.flatMap((lot) => lot.geometry.map((point) => point[1]))), maxX: Math.max(...lots.flatMap((lot) => lot.geometry.map((point) => point[0]))), maxY: Math.max(...lots.flatMap((lot) => lot.geometry.map((point) => point[1]))) } : null)
  const mapWidth = currentBbox ? Math.max(currentBbox.maxX - currentBbox.minX, 1) : 1
  const mapHeight = currentBbox ? Math.max(currentBbox.maxY - currentBbox.minY, 1) : 1
  const toSvg = (point: Point) => currentBbox ? `${((point[0] - currentBbox.minX) / mapWidth) * 1000},${((currentBbox.maxY - point[1]) / mapHeight) * 1000}` : '0,0'

  function toggleLot(lot: Lot) {
    if (!lot.id) return
    setSelectedLotIds((current) => current.includes(lot.id as string) ? current.filter((id) => id !== lot.id) : [...current, lot.id as string])
  }
  function applyZone() {
    if (!selectedLotIds.length) return
    setLots((current) => current.map((lot) => lot.id && selectedLotIds.includes(lot.id) ? { ...lot, zone_number: activeZone } : lot))
    setSelectedLotIds([]); setReviewConfirmed(false)
  }
  function clearZone() {
    if (!selectedLotIds.length) return
    setLots((current) => current.map((lot) => lot.id && selectedLotIds.includes(lot.id) ? { ...lot, zone_number: null } : lot))
    setSelectedLotIds([]); setReviewConfirmed(false)
  }
  async function importMap() {
    const db = supabase
    if (!db || !file) return
    setProcessing(true); setMessage(null)
    try {
      if (!/\.dxf$/i.test(file.name)) throw new Error('Nesta primeira versão, importe um DXF ASCII. O suporte a DWG será adicionado após conversão.')
      const parsed = parseDxf(await file.text())
      if (!parsed.lots.length) throw new Error('Não encontrei polilinhas na camada Lotes Urbanos.')
      const id = crypto.randomUUID()
      const storagePath = `imports/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: uploadError } = await db.storage.from('census-maps').upload(storagePath, file, { contentType: file.type || 'application/dxf', upsert: false })
      if (uploadError) throw new Error(`Falha ao salvar o arquivo original: ${uploadError.message}`)
      const draft = { id, file_name: file.name, mime_type: file.type || 'application/dxf', file_size: file.size, storage_path: storagePath, source_layer: parsed.sourceLayer, status: 'DRAFT', total_features: parsed.lots.length, valid_features: parsed.lots.filter((lot) => lot.is_valid).length, problematic_features: parsed.lots.filter((lot) => !lot.is_valid).length, bbox: parsed.bbox, raw_metadata: { text_count: parsed.textCount, parser: 'client-dxf-lwpolyline-v1' } }
      const { error: importError } = await db.from('census_map_imports').insert(draft)
      if (importError) throw new Error(`Falha ao registrar a importação: ${importError.message}`)
      await db.from('census_map_zones').insert([1, 2, 3, 4, 5].map((zone) => ({ import_id: id, zone_number: zone, name: `Zona ${zone}`, color: zoneColors[zone - 1] })))
      const rows = parsed.lots.map((lot) => ({ ...lot, import_id: id }))
      await chunks(rows, 100, async (chunk) => { const { error } = await db.from('census_map_lots').insert(chunk); if (error) throw new Error(`Falha ao salvar os lotes: ${error.message}`) })
      setMapImport({ ...draft, status: 'DRAFT', updated_at: new Date().toISOString(), published_at: null } as MapImport); setLots(parsed.lots); setFile(null); setMessage({ type: 'success', text: `${parsed.lots.length.toLocaleString('pt-BR')} lotes extraídos e salvos como rascunho.` })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível importar o mapa.' }) }
    finally { setProcessing(false) }
  }
  async function saveDraft() {
    const db = supabase
    if (!db || !mapImport) return
    setProcessing(true); setMessage(null)
    try {
      await chunks(lots.filter((lot) => lot.id), 100, async (chunk) => { const { error } = await db.from('census_map_lots').upsert(chunk.map((lot) => ({ id: lot.id, import_id: mapImport.id, zone_number: lot.zone_number })), { onConflict: 'id' }); if (error) throw error })
      const { error } = await db.from('census_map_imports').update({ status: 'DRAFT', published_at: null }).eq('id', mapImport.id)
      if (error) throw error
      setMapImport({ ...mapImport, status: 'DRAFT', published_at: null, updated_at: new Date().toISOString() }); setMessage({ type: 'success', text: 'Divisão salva como rascunho. O mapa original permanece no Storage.' })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar o rascunho.' }) }
    finally { setProcessing(false) }
  }
  async function publishMap() {
    const db = supabase
    if (!db || !mapImport || !reviewConfirmed) return
    setProcessing(true); setMessage(null)
    try {
      await chunks(lots.filter((lot) => lot.id), 100, async (chunk) => { const { error } = await db.from('census_map_lots').upsert(chunk.map((lot) => ({ id: lot.id, import_id: mapImport.id, zone_number: lot.zone_number })), { onConflict: 'id' }); if (error) throw error })
      const { error } = await db.from('census_map_imports').update({ status: 'PUBLISHED', published_at: new Date().toISOString() }).eq('id', mapImport.id)
      if (error) throw error
      setMapImport({ ...mapImport, status: 'PUBLISHED', published_at: new Date().toISOString() }); setMessage({ type: 'success', text: 'Divisão publicada. O mapa está pronto para ser usado pelo Censo.' })
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível publicar a divisão.' }) }
    finally { setProcessing(false) }
  }

  return <div className="fleet-shell census-shell">
    <aside className="fleet-sidebar"><div className="fleet-sidebar-top"><button className="fleet-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Voltar ao painel</button><div className="fleet-brand"><span className="fleet-brand-icon"><MapPinned size={20} /></span><div><strong>Censo Municipal</strong><small>Inteligência Municipal</small></div></div></div><div className="fleet-section-label">GESTÃO TERRITORIAL</div><nav className="fleet-nav" aria-label="Navegação do Censo Municipal">{navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`fleet-nav-item${view === id ? ' active' : ''}`} onClick={() => setView(id)}><Icon size={17} />{label}</button>)}<button type="button" className="fleet-nav-item fleet-mobile-logout" onClick={onLogout}><LogOut size={17} />Sair</button></nav><div className="fleet-sidebar-bottom"><div className="fleet-user-chip"><span className="fleet-user-avatar">{(userEmail?.[0] || 'U').toUpperCase()}</span><div><strong>{userEmail || 'Usuário autenticado'}</strong><small>Preparação territorial aberta</small></div></div><button type="button" className="fleet-logout" onClick={onLogout}><LogOut size={16} /> Sair do sistema</button></div></aside>
    <main className="fleet-main census-main"><header className="fleet-header"><div><p className="fleet-kicker">MÓDULO MUNICIPAL</p><h1>Preparação do mapa</h1></div><div className="fleet-header-actions"><span className="fleet-protected"><ShieldCheck size={16} /> Ambiente aberto de desenvolvimento</span></div></header><div className="fleet-content census-content">
      {view !== 'dwg' && <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">{view === 'overview' ? 'VISÃO TERRITORIAL' : 'ESTRUTURA DO CENSO'}</span><h2>{view === 'overview' ? 'Mapa municipal' : navItems.find((item) => item.id === view)?.label}</h2><p>{view === 'overview' ? 'A preparação do mapa e a divisão das zonas ficam concentradas nesta tela.' : 'Esta área será conectada ao mapa preparado nas próximas etapas.'}</p></div></div>{view === 'territory' && mapImport ? <MapCanvas lots={filteredLots} bbox={currentBbox} toSvg={toSvg} selectedLotIds={selectedLotIds} onToggle={toggleLot} /> : <div className="fleet-resource-placeholder census-coming-soon"><span className="fleet-resource-icon">{view === 'overview' ? <MapPinned size={21} /> : view === 'families' ? <UsersRound size={21} /> : view === 'forms' ? <FileText size={21} /> : <ClipboardList size={21} />}</span><strong>{view === 'overview' ? 'O mapa será exibido aqui após a preparação' : 'Estrutura em preparação'}</strong><span>{view === 'overview' ? 'Importe um DXF na tela Preparar mapa para começar a classificar os lotes.' : 'Conclua a divisão territorial antes de iniciar esta etapa.'}</span><button type="button" className="fleet-primary-button" onClick={() => setView('dwg')}>Abrir preparação do mapa</button></div>}</section>}
      {view === 'dwg' && <><section className="fleet-hero census-hero"><div><span className="fleet-hero-kicker">PREPARAÇÃO CARTOGRÁFICA</span><h2>Importe, confira e divida os lotes por zona.</h2><p>O arquivo original fica preservado no Storage e a versão processada permanece no banco para você reabrir o mapa sem novo upload.</p></div><div className="fleet-hero-mark"><MapPinned size={34} /></div></section>{message && <div className={`fleet-inline-${message.type === 'error' ? 'error' : 'success'}`} role="status">{message.type === 'error' ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />}{message.text}</div>}<section className="fleet-section fleet-page-section census-prep-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">ARQUIVO DO MAPA</span><h2>Importar e extrair lotes</h2><p>Na primeira versão, o importador processa arquivos DXF ASCII e extrai a camada <strong>Lotes Urbanos</strong>.</p></div></div><div className="census-import-toolbar"><label className="census-file-picker"><Upload size={18} /><span><strong>{file ? file.name : 'Escolher arquivo DXF'}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB selecionado` : 'O original será salvo no Supabase Storage'}</small></span><input type="file" accept=".dxf,application/dxf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button type="button" className="fleet-primary-button" disabled={!file || processing} onClick={() => void importMap()}>{processing ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} Importar e extrair</button>{mapImport && <button type="button" className="fleet-secondary-button" disabled={processing} onClick={() => void loadSavedMap()}><FolderOpen size={15} /> Reabrir mapa salvo</button>}</div></section>{loading ? <div className="fleet-loading"><LoaderCircle className="spin" size={18} /> Carregando mapa salvo…</div> : mapImport ? <><section className="fleet-section census-map-section"><div className="fleet-section-heading"><div><span className="fleet-kicker">MAPA PROCESSADO</span><h2>{mapImport.file_name}</h2></div><div className="census-map-badges"><span className={`fleet-status ${mapImport.status === 'PUBLISHED' ? 'success' : 'warning'}`}>{mapImport.status === 'PUBLISHED' ? 'Publicado' : 'Rascunho'}</span><span className="fleet-period">{mapImport.total_features.toLocaleString('pt-BR')} lotes</span></div></div><MapCanvas lots={filteredLots} bbox={currentBbox} toSvg={toSvg} selectedLotIds={selectedLotIds} onToggle={toggleLot} /></section><section className="fleet-section census-classification-section"><div className="fleet-section-heading"><div><span className="fleet-kicker">CLASSIFICAÇÃO TERRITORIAL</span><h2>Distribuir lotes nas cinco zonas</h2></div><span className="fleet-period">{selectedLotIds.length} selecionado(s)</span></div><div className="census-zone-workbench"><div className="census-zone-list">{[1, 2, 3, 4, 5].map((zone) => <button key={zone} type="button" className={`census-zone-option${activeZone === zone ? ' active' : ''}`} onClick={() => setActiveZone(zone)}><i style={{ background: zoneColors[zone - 1] }} /><span><strong>Zona {zone}</strong><small>{counts[zone - 1].toLocaleString('pt-BR')} lote(s)</small></span><Check size={15} /></button>)}</div><div className="census-zone-actions"><p>Selecione lotes no mapa e escolha a zona de destino. Você pode mover um lote de zona a qualquer momento.</p><div><button type="button" className="fleet-primary-button" disabled={!selectedLotIds.length} onClick={applyZone}>Classificar na Zona {activeZone}</button><button type="button" className="fleet-secondary-button" disabled={!selectedLotIds.length} onClick={clearZone}>Remover classificação</button></div></div></div></section><section className="fleet-section census-review-section"><div className="fleet-section-heading"><div><span className="fleet-kicker">CONFERÊNCIA E PUBLICAÇÃO</span><h2>Salvar divisão territorial</h2></div><span className="fleet-period">{problematic.length} pendência(s)</span></div><div className="census-review-grid"><div className="census-review-card"><span className="census-review-icon"><AlertTriangle size={18} /></span><div><strong>Lotes problemáticos</strong><p>{problematic.length ? `${problematic.length.toLocaleString('pt-BR')} lote(s) precisam de revisão geométrica ou identificador.` : 'Nenhuma pendência foi identificada na importação.'}</p></div></div><div className="census-review-card"><span className="census-review-icon positive"><CheckCircle2 size={18} /></span><div><strong>Divisão atual</strong><p>{lots.filter((lot) => lot.zone_number).length.toLocaleString('pt-BR')} de {lots.length.toLocaleString('pt-BR')} lote(s) classificados.</p></div></div></div><label className="census-review-check"><input type="checkbox" checked={reviewConfirmed} onChange={(event) => setReviewConfirmed(event.target.checked)} /><span>Conferi a classificação no mapa e estou ciente de que a publicação transforma esta divisão em referência do Censo.</span></label><div className="census-publish-actions"><button type="button" className="fleet-secondary-button" disabled={processing} onClick={() => void saveDraft()}><Save size={15} /> Salvar como rascunho</button><button type="button" className="fleet-primary-button" disabled={processing || !reviewConfirmed} onClick={() => void publishMap()}><CheckCircle2 size={15} /> Publicar divisão conferida</button></div></section><section className="fleet-section census-lot-list-section"><div className="fleet-section-heading"><div><span className="fleet-kicker">REVISÃO RÁPIDA</span><h2>Identificadores e pendências</h2></div><input className="census-search" placeholder="Buscar lote ou identificador" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="census-lot-list">{filteredLots.slice(0, 80).map((lot) => <button key={lot.id || lot.source_handle} type="button" className={`census-lot-row${lot.id && selectedLotIds.includes(lot.id) ? ' selected' : ''}`} onClick={() => toggleLot(lot)}><span className="census-lot-dot" style={{ background: lot.zone_number ? zoneColors[lot.zone_number - 1] : '#d7e1e4' }} /><span><strong>{lot.label || 'Sem identificador'}</strong><small>Ref. {lot.source_handle} · {lot.zone_number ? `Zona ${lot.zone_number}` : 'Sem zona'}{lot.problem_reasons.length ? ` · ${lot.problem_reasons.join(', ')}` : ''}</small></span>{lot.problem_reasons.length ? <AlertTriangle size={15} /> : <Check size={15} />}</button>)}</div>{filteredLots.length > 80 && <p className="census-list-note">Mostrando os primeiros 80 resultados. Use a busca para localizar outros lotes.</p>}</section></> : <div className="fleet-panel census-empty-map"><FolderOpen size={28} /><strong>Nenhum mapa salvo ainda</strong><p>Escolha o arquivo DXF acima para criar a primeira importação persistida do Censo Municipal.</p></div>}</>}
    </div></main>
  </div>
}

function MapCanvas({ lots, bbox, toSvg, selectedLotIds, onToggle }: { lots: Lot[]; bbox: MapImport['bbox']; toSvg: (point: Point) => string; selectedLotIds: string[]; onToggle: (lot: Lot) => void }) {
  return <div className="census-map-frame">{bbox ? <svg className="census-map-svg" viewBox="0 0 1000 1000" role="img" aria-label="Mapa dos lotes municipais">{lots.map((lot) => { const selected = lot.id ? selectedLotIds.includes(lot.id) : false; const points = lot.geometry.map(toSvg).join(' '); const fill = selected ? '#e2a63d' : lot.zone_number ? `${zoneColors[lot.zone_number - 1]}b8` : lot.is_valid ? '#eef5f4' : '#f7d9d4'; return <polygon key={lot.id || lot.source_handle} points={points} fill={fill} stroke={selected ? '#8d5c12' : lot.is_valid ? '#8baeb1' : '#b74b3e'} strokeWidth={selected ? 2.3 : 0.8} vectorEffect="non-scaling-stroke" onClick={() => onToggle(lot)}><title>{lot.label || 'Sem identificador'} · {lot.zone_number ? `Zona ${lot.zone_number}` : 'Sem zona'}{lot.problem_reasons.length ? ` · ${lot.problem_reasons.join(', ')}` : ''}</title></polygon> })}</svg> : <div className="census-map-empty"><MapPinned size={25} /><strong>Mapa sem geometria</strong></div>}<div className="census-map-legend"><span><i className="unassigned" />Sem zona</span><span><i className="problem" />Revisar</span><span><i className="selected" />Selecionado</span></div><span className="census-map-help">Clique nos lotes para selecionar. Passe o cursor para ver o identificador.</span></div>
}
