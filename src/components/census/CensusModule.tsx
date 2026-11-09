import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, CheckCircle2, ClipboardList, FileText, FolderOpen, LayoutDashboard, LoaderCircle, LogOut, MapPinned, Minus, Move, Plus, RotateCcw, Save, ShieldCheck, Upload, UsersRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { assignLotToZone, assignLotsToZone, getLotFillColor, getLotKey, isImportableLotGeometry, mergeSelectedLotKeys, selectLotKeysInRect, shouldStartMapPan, withLotIds } from './mapLogic'
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
  zone_id?: string | null
}
type CensusZone = { id: string; name: string; color: string; active: boolean }
type CensusAcs = { id: string; full_name: string; email: string | null; phone: string | null; active: boolean }
type AreaSelectionGesture = { start: Point; current: Point; startClientX: number; startClientY: number; targetLotKey: string | null; additive: boolean }

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
function parseDxf(text: string) {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim())
  const polylines: Array<{ handle: string; layer: string; closed: boolean; points: Point[] }> = []
  let entity: { type: string; handle: string; layer: string; closed: boolean; points: Point[] } | null = null
  const flush = () => {
    if (!entity) return
    if (entity.type === 'LWPOLYLINE') polylines.push({ handle: entity.handle || `entity-${polylines.length + 1}`, layer: entity.layer, closed: entity.closed, points: entity.points })
  }
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = lines[i]; const value = lines[i + 1]
    if (code === '0') { flush(); entity = { type: value, handle: '', layer: '', closed: false, points: [] }; continue }
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
  }
  flush()
  const candidates = polylines.filter((polyline) => polyline.layer.trim().toLowerCase() === 'lotes urbanos')
  const source = candidates.filter((polyline) => isImportableLotGeometry(polyline.layer, polyline.closed, polyline.points))
  const lots: Lot[] = source.map((polyline) => {
    const area = polyline.points.length >= 3 ? areaOf(polyline.points) : 0
    return { source_handle: polyline.handle, label: null, layer_name: polyline.layer, geometry: polyline.points, area, is_valid: true, problem_reasons: [], zone_number: null }
  })
  const allPoints = lots.flatMap((lot) => lot.geometry)
  const bbox = allPoints.length ? { minX: Math.min(...allPoints.map((point) => point[0])), minY: Math.min(...allPoints.map((point) => point[1])), maxX: Math.max(...allPoints.map((point) => point[0])), maxY: Math.max(...allPoints.map((point) => point[1])) } : null
  return { lots, bbox, sourceLayer: source[0]?.layer || candidates[0]?.layer || 'Lotes Urbanos', ignoredGeometryCount: candidates.length - source.length }
}
async function chunks<T>(values: T[], size: number, callback: (chunk: T[]) => Promise<void>) {
  for (let index = 0; index < values.length; index += size) await callback(values.slice(index, index + size))
}

export function CensusModule({ userEmail, onBack, onLogout }: CensusModuleProps) {
  const [view, setView] = useState<CensusSection>('dwg')
  const [zones, setZones] = useState<CensusZone[]>([])
  const loadZones = async () => {
    if (!supabase) return
    const { data } = await supabase.from('census_zones').select('id,name,color,active').eq('active', true).order('created_at').limit(100)
    setZones((data || []) as CensusZone[])
  }
  useEffect(() => { void loadZones() }, [])

  return <div className="fleet-shell census-shell">
    <aside className="fleet-sidebar"><div className="fleet-sidebar-top"><button className="fleet-back" type="button" onClick={onBack}><ArrowLeft size={16} /> Voltar ao painel</button><div className="fleet-brand"><span className="fleet-brand-icon"><MapPinned size={20} /></span><div><strong>Censo Municipal</strong><small>Inteligência Municipal</small></div></div></div><div className="fleet-section-label">GESTÃO TERRITORIAL</div><nav className="fleet-nav" aria-label="Navegação do Censo Municipal">{navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={`fleet-nav-item${view === id ? ' active' : ''}`} onClick={() => setView(id)}><Icon size={17} />{label}</button>)}<button type="button" className="fleet-nav-item fleet-mobile-logout" onClick={onLogout}><LogOut size={17} />Sair</button></nav><div className="fleet-sidebar-bottom"><div className="fleet-user-chip"><span className="fleet-user-avatar">{(userEmail?.[0] || 'U').toUpperCase()}</span><div><strong>{userEmail || 'Usuário autenticado'}</strong><small>Preparação territorial aberta</small></div></div><button type="button" className="fleet-logout" onClick={onLogout}><LogOut size={16} /> Sair do sistema</button></div></aside>
    <main className="fleet-main census-main"><header className="fleet-header"><div><p className="fleet-kicker">MÓDULO MUNICIPAL</p><h1>Preparação do mapa</h1></div><div className="fleet-header-actions"><span className="fleet-protected"><ShieldCheck size={16} /> Ambiente aberto de desenvolvimento</span></div></header><div className="fleet-content census-content">
      {view !== 'dwg' && view !== 'zones' && <section className="fleet-section fleet-page-section"><div className="fleet-page-heading"><div><span className="fleet-kicker">ESTRUTURA DO CENSO</span><h2>{navItems.find((item) => item.id === view)?.label}</h2><p>Esta área será conectada ao mapa preparado nas próximas etapas.</p></div></div><div className="fleet-resource-placeholder census-coming-soon"><span className="fleet-resource-icon"><MapPinned size={21} /></span><strong>Estrutura em preparação</strong><span>Conclua a preparação territorial antes de iniciar esta etapa.</span><button type="button" className="fleet-primary-button" onClick={() => setView('dwg')}>Abrir preparação do mapa</button></div></section>}
      {view === 'zones' && <ZoneManagement zones={zones} onChanged={() => void loadZones()} />}
      {view === 'dwg' && <MapPreparationWorkspace />}

    </div></main>
  </div>
}

function ZoneManagement({ zones, onChanged }: { zones: CensusZone[]; onChanged: () => void }) {
  const [acs, setAcs] = useState<CensusAcs[]>([])
  const [assignments, setAssignments] = useState<Array<{ acs_id: string; zone_id: string }>>([])
  const [zoneName, setZoneName] = useState('')
  const [zoneColor, setZoneColor] = useState('#2c7892')
  const [acsName, setAcsName] = useState('')
  const [acsEmail, setAcsEmail] = useState('')
  const [acsPhone, setAcsPhone] = useState('')
  const [selectedAcs, setSelectedAcs] = useState('')
  const [selectedZone, setSelectedZone] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)

  const loadAcs = async () => {
    if (!supabase) return
    const [{ data: people }, { data: links }] = await Promise.all([
      supabase.from('census_acs').select('id,full_name,email,phone,active').eq('active', true).order('full_name').limit(500),
      supabase.from('census_acs_zone_assignments').select('acs_id,zone_id').eq('active', true).limit(1000),
    ])
    setAcs((people || []) as CensusAcs[])
    setAssignments((links || []) as Array<{ acs_id: string; zone_id: string }>)
  }
  useEffect(() => { void loadAcs() }, [])
  useEffect(() => { if (!selectedZone && zones[0]) setSelectedZone(zones[0].id) }, [selectedZone, zones])

  async function createZone() {
    if (!supabase || !zoneName.trim()) return
    setSaving(true); setNotice('')
    const { error } = await supabase.from('census_zones').insert({ name: zoneName.trim(), color: zoneColor })
    setSaving(false)
    if (error) { setNotice(`Não foi possível criar a zona: ${error.message}`); return }
    setZoneName(''); setNotice('Zona criada com sucesso.'); onChanged()
  }
  async function createAcs() {
    if (!supabase || !acsName.trim()) return
    setSaving(true); setNotice('')
    const { error } = await supabase.from('census_acs').insert({ full_name: acsName.trim(), email: acsEmail.trim() || null, phone: acsPhone.trim() || null })
    setSaving(false)
    if (error) { setNotice(`Não foi possível cadastrar o ACS: ${error.message}`); return }
    setAcsName(''); setAcsEmail(''); setAcsPhone(''); setNotice('ACS cadastrado no catálogo municipal.'); void loadAcs()
  }
  async function linkAcs() {
    if (!supabase || !selectedAcs || !selectedZone) return
    setSaving(true); setNotice('')
    const { error } = await supabase.from('census_acs_zone_assignments').upsert({ acs_id: selectedAcs, zone_id: selectedZone, active: true }, { onConflict: 'acs_id,zone_id' })
    setSaving(false)
    if (error) { setNotice(`Não foi possível vincular o ACS: ${error.message}`); return }
    setNotice('ACS vinculado à zona.'); void loadAcs()
  }
  const zoneNameFor = (acsId: string) => assignments.filter((link) => link.acs_id === acsId).map((link) => zones.find((zone) => zone.id === link.zone_id)?.name).filter(Boolean).join(', ') || 'Sem zona vinculada'

  return <section className="fleet-section fleet-page-section census-zones-page"><div className="fleet-page-heading"><div><span className="fleet-kicker">CADASTRO MUNICIPAL</span><h2>Zonas e ACS</h2><p>Cadastre a quantidade de zonas que o município precisar e mantenha o catálogo de ACS disponível para os demais módulos.</p></div><span className="fleet-status success">Cadastro aberto</span></div>{notice && <div className="fleet-inline-success"><CheckCircle2 size={15} />{notice}</div>}<div className="census-management-grid"><section className="fleet-panel census-management-card"><div className="census-management-heading"><div><span className="fleet-kicker">ZONAS</span><h3>Criar zona</h3></div><MapPinned size={19} /></div><p>Não há limite fixo de cinco zonas. Crie, por exemplo, três, quatro, seis ou mais zonas.</p><div className="census-form-stack"><label>Nome da zona<input value={zoneName} onChange={(event) => setZoneName(event.target.value)} placeholder="Ex.: Zona Norte" /></label><label>Cor no mapa<div className="census-color-input"><input type="color" value={zoneColor} onChange={(event) => setZoneColor(event.target.value)} /><span>{zoneColor}</span></div></label><button type="button" className="fleet-primary-button" disabled={saving || !zoneName.trim()} onClick={() => void createZone()}><MapPinned size={15} /> Criar zona</button></div><div className="census-catalog-list">{zones.map((zone) => <div className="census-catalog-row" key={zone.id}><i style={{ background: zone.color }} /><strong>{zone.name}</strong><small>Ativa</small></div>)}{!zones.length && <span>Nenhuma zona cadastrada.</span>}</div></section><section className="fleet-panel census-management-card"><div className="census-management-heading"><div><span className="fleet-kicker">CADASTRO GLOBAL</span><h3>Cadastrar ACS</h3></div><UsersRound size={19} /></div><p>Este é o cadastro operacional do ACS. As regras de acesso e limitações serão definidas quando o módulo estiver consolidado.</p><div className="census-form-stack"><label>Nome completo<input value={acsName} onChange={(event) => setAcsName(event.target.value)} placeholder="Ex.: Maria da Silva" /></label><div className="census-form-row"><label>E-mail<input type="email" value={acsEmail} onChange={(event) => setAcsEmail(event.target.value)} placeholder="Opcional" /></label><label>Telefone<input value={acsPhone} onChange={(event) => setAcsPhone(event.target.value)} placeholder="Opcional" /></label></div><button type="button" className="fleet-primary-button" disabled={saving || !acsName.trim()} onClick={() => void createAcs()}><UsersRound size={15} /> Cadastrar ACS</button></div><div className="census-catalog-list">{acs.map((person) => <div className="census-catalog-row census-acs-row" key={person.id}><span className="fleet-user-avatar">{person.full_name[0]?.toUpperCase()}</span><span><strong>{person.full_name}</strong><small>{zoneNameFor(person.id)}</small></span></div>)}{!acs.length && <span>Nenhum ACS cadastrado.</span>}</div></section></div><section className="fleet-panel census-link-card"><div className="census-management-heading"><div><span className="fleet-kicker">VÍNCULO TERRITORIAL</span><h3>Ligar um ACS a uma zona</h3></div><ClipboardList size={19} /></div><p>Um ACS pode ser vinculado a uma ou mais zonas nesta fase aberta. A limitação para uma zona será definida depois.</p><div className="census-link-form"><label>ACS<select value={selectedAcs} onChange={(event) => setSelectedAcs(event.target.value)}><option value="">Selecione o ACS</option>{acs.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label><label>Zona<select value={selectedZone} onChange={(event) => setSelectedZone(event.target.value)}><option value="">Selecione a zona</option>{zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}</select></label><button type="button" className="fleet-primary-button" disabled={saving || !selectedAcs || !selectedZone} onClick={() => void linkAcs()}><Check size={15} /> Vincular ACS à zona</button></div></section></section>
}

function MapPreparationWorkspace() {
  const [mapImport, setMapImport] = useState<MapImport | null>(null)
  const [lots, setLots] = useState<Lot[]>([])
  const [zones, setZones] = useState<CensusZone[]>([])
  const [activeZoneId, setActiveZoneId] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [areaSelectMode, setAreaSelectMode] = useState(false)
  const [isAreaSelecting, setIsAreaSelecting] = useState(false)
  const [selectedLotKeys, setSelectedLotKeys] = useState<string[]>([])
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 })
  const mapViewportRef = useRef<HTMLDivElement | null>(null)
  const areaGestureRef = useRef<AreaSelectionGesture | null>(null)
  const areaRectOverlayRef = useRef<SVGRectElement | null>(null)

  const loadWorkspace = async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    const [{ data: imports }, { data: zoneRows }] = await Promise.all([
      supabase.from('census_map_imports').select('id,file_name,mime_type,file_size,storage_path,source_layer,status,total_features,valid_features,problematic_features,bbox,updated_at,published_at').in('status', ['DRAFT', 'PUBLISHED']).order('updated_at', { ascending: false }).limit(1),
      supabase.from('census_zones').select('id,name,color,active').eq('active', true).order('created_at').limit(100),
    ])
    const nextZones = (zoneRows || []) as CensusZone[]
    setZones(nextZones); setActiveZoneId((current) => current || nextZones[0]?.id || '')
    const current = imports?.[0] as MapImport | undefined
    if (current) {
      const { data: rows } = await supabase.from('census_map_lots').select('id,source_handle,label,layer_name,geometry,area,is_valid,problem_reasons,zone_number,zone_id').eq('import_id', current.id).order('source_handle').limit(5000)
      setMapImport(current); setLots((rows || []) as Lot[])
    }
    setLoading(false)
  }
  useEffect(() => { void loadWorkspace() }, [])
  useEffect(() => {
    const viewport = mapViewportRef.current
    if (!viewport) return

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault()
      setZoom((current) => Math.min(24, Math.max(0.65, current * (event.deltaY < 0 ? 1.15 : 1 / 1.15))))
    }

    viewport.addEventListener('wheel', handleWheel, { passive: false })
    return () => viewport.removeEventListener('wheel', handleWheel)
  }, [loading])

  const bbox = mapImport?.bbox || (lots.length ? { minX: Math.min(...lots.flatMap((lot) => lot.geometry.map((point) => point[0]))), minY: Math.min(...lots.flatMap((lot) => lot.geometry.map((point) => point[1]))), maxX: Math.max(...lots.flatMap((lot) => lot.geometry.map((point) => point[0]))), maxY: Math.max(...lots.flatMap((lot) => lot.geometry.map((point) => point[1]))) } : null)
  const width = bbox ? Math.max(bbox.maxX - bbox.minX, 1) : 1
  const height = bbox ? Math.max(bbox.maxY - bbox.minY, 1) : 1
  const toSvgPoint = (point: Point): Point => bbox ? [((point[0] - bbox.minX) / width) * 1000, ((bbox.maxY - point[1]) / height) * 1000] : [0, 0]
  const toSvg = (point: Point) => toSvgPoint(point).join(',')
  const assignedCount = lots.filter((lot) => lot.zone_id).length
  const zoneCount = (zoneId: string) => lots.filter((lot) => lot.zone_id === zoneId).length

  function clientToSvgPoint(clientX: number, clientY: number): Point | null {
    const svg = mapViewportRef.current?.querySelector('svg')
    const matrix = svg?.getScreenCTM()
    if (!matrix) return null
    const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse())
    return [point.x, point.y]
  }
  function updateAreaRectOverlay(start: Point, current: Point, crossing: boolean) {
    const overlay = areaRectOverlayRef.current
    if (!overlay) return
    overlay.setAttribute('x', String(Math.min(start[0], current[0])))
    overlay.setAttribute('y', String(Math.min(start[1], current[1])))
    overlay.setAttribute('width', String(Math.abs(current[0] - start[0])))
    overlay.setAttribute('height', String(Math.abs(current[1] - start[1])))
    overlay.setAttribute('class', `census-area-selection-rect ${crossing ? 'crossing' : 'window'}`)
    overlay.removeAttribute('display')
  }
  function clearAreaRectOverlay() {
    areaRectOverlayRef.current?.setAttribute('display', 'none')
  }

  function assignLot(lot: Lot, multiSelect = false) {
    if (areaSelectMode || multiSelect) {
      const key = getLotKey(lot)
      setSelectedLotKeys((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
      return
    }
    if (!activeZoneId) { setNotice('Cadastre e selecione uma zona antes de clicar nos lotes.'); return }
    const key = getLotKey(lot)
    setLots((current) => assignLotToZone(current, key, activeZoneId))
  }
  function assignSelectedLots() {
    if (!activeZoneId) { setNotice('Selecione uma zona antes de atribuir os lotes.'); return }
    if (!selectedLotKeys.length) return
    setLots((current) => assignLotsToZone(current, selectedLotKeys, activeZoneId))
    setSelectedLotKeys([])
  }
  function startDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (areaSelectMode) {
      const start = clientToSvgPoint(event.clientX, event.clientY)
      if (!start) return
      const target = event.target instanceof Element ? event.target.closest('[data-lot-key]') : null
      const targetLotKey = target?.getAttribute('data-lot-key') || null
      areaGestureRef.current = { start, current: start, startClientX: event.clientX, startClientY: event.clientY, targetLotKey, additive: event.shiftKey || event.ctrlKey || event.metaKey }
      setIsAreaSelecting(true)
      event.currentTarget.setPointerCapture(event.pointerId)
      updateAreaRectOverlay(start, start, false)
      event.preventDefault()
      return
    }
    const targetIsLot = event.target instanceof Element && event.target.closest('polygon') !== null
    if (!shouldStartMapPan(targetIsLot)) return
    setDragging(true); dragStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; event.currentTarget.setPointerCapture(event.pointerId)
  }
  function moveDrag(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = areaGestureRef.current
    if (areaSelectMode && gesture) {
      const current = clientToSvgPoint(event.clientX, event.clientY)
      if (!current) return
      gesture.current = current
      updateAreaRectOverlay(gesture.start, current, event.clientX < gesture.startClientX)
      return
    }
    if (!dragging) return
    setPan({ x: dragStart.current.panX + event.clientX - dragStart.current.x, y: dragStart.current.panY + event.clientY - dragStart.current.y })
  }
  function finishPointerAction(event: React.PointerEvent<HTMLDivElement>) {
    const gesture = areaGestureRef.current
    if (!gesture) { setDragging(false); return }
    const end = clientToSvgPoint(event.clientX, event.clientY) || gesture.current
    const distance = Math.hypot(event.clientX - gesture.startClientX, event.clientY - gesture.startClientY)
    let picked: string[]
    if (distance < 4) {
      picked = gesture.targetLotKey ? [gesture.targetLotKey] : []
    } else {
      const rect = { left: Math.min(gesture.start[0], end[0]), top: Math.min(gesture.start[1], end[1]), right: Math.max(gesture.start[0], end[0]), bottom: Math.max(gesture.start[1], end[1]) }
      const polygons = lots.map((lot) => ({ key: getLotKey(lot), points: lot.geometry.map(toSvgPoint) }))
      picked = selectLotKeysInRect(polygons, rect, event.clientX < gesture.startClientX ? 'crossing' : 'window')
    }
    setSelectedLotKeys((current) => mergeSelectedLotKeys(current, picked, gesture.additive))
    areaGestureRef.current = null
    setIsAreaSelecting(false)
    setDragging(false)
    clearAreaRectOverlay()
  }
  function cancelPointerAction() {
    areaGestureRef.current = null
    setIsAreaSelecting(false)
    setDragging(false)
    clearAreaRectOverlay()
  }
  function zoomBy(factor: number) { setZoom((current) => Math.min(24, Math.max(0.65, current * factor))) }
  function resetView() { setZoom(1); setPan({ x: 0, y: 0 }); setSelectedLotKeys([]); setAreaSelectMode(false); cancelPointerAction() }
  function toggleAreaSelectMode() {
    if (areaSelectMode) {
      setAreaSelectMode(false)
      cancelPointerAction()
    } else {
      setAreaSelectMode(true)
    }
  }
  useEffect(() => {
    if (!areaSelectMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setSelectedLotKeys([])
      setAreaSelectMode(false)
      areaGestureRef.current = null
      setIsAreaSelecting(false)
      setDragging(false)
      areaRectOverlayRef.current?.setAttribute('display', 'none')
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [areaSelectMode])
  async function importWorkspaceMap() {
    const db = supabase
    if (!db || !file) return
    setSaving(true); setNotice('')
    try {
      if (!/\.dxf$/i.test(file.name)) throw new Error('Selecione um arquivo DXF ASCII.')
      const parsed = parseDxf(await file.text())
      if (!parsed.lots.length) throw new Error('A camada Lotes Urbanos não contém polígonos fechados com área válida.')
      const id = crypto.randomUUID(); const path = `imports/${id}/${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const upload = await db.storage.from('census-maps').upload(path, file, { contentType: file.type || 'application/dxf', upsert: false })
      if (upload.error) throw new Error(upload.error.message)
      const record = { id, file_name: file.name, mime_type: file.type || 'application/dxf', file_size: file.size, storage_path: path, source_layer: parsed.sourceLayer, status: 'DRAFT', total_features: parsed.lots.length + parsed.ignoredGeometryCount, valid_features: parsed.lots.length, problematic_features: parsed.ignoredGeometryCount, bbox: parsed.bbox, raw_metadata: { parser: 'client-dxf-geometry-only-v2', ignored_geometry_count: parsed.ignoredGeometryCount } }
      const inserted = await db.from('census_map_imports').insert(record)
      if (inserted.error) throw new Error(inserted.error.message)
      const rows = withLotIds(parsed.lots, () => crypto.randomUUID()).map((lot) => ({ ...lot, import_id: id, zone_id: null }))
      await chunks(rows, 100, async (chunk) => { const result = await db.from('census_map_lots').insert(chunk); if (result.error) throw new Error(result.error.message) })
      setMapImport({ ...record, status: 'DRAFT', updated_at: new Date().toISOString(), published_at: null } as MapImport); setLots(rows as Lot[]); setFile(null); resetView(); setNotice(`${parsed.lots.length.toLocaleString('pt-BR')} polígonos fechados reconhecidos como lotes.${parsed.ignoredGeometryCount ? ` ${parsed.ignoredGeometryCount.toLocaleString('pt-BR')} elemento(s) sem geometria válida foram ignorados.` : ''} Selecione uma zona e clique nos lotes.`)
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível importar o mapa.') }
    finally { setSaving(false) }
  }
  async function saveWorkspace() {
    const db = supabase
    if (!db || !mapImport) return
    setSaving(true); setNotice('')
    try {
      await chunks(lots.filter((lot) => lot.id), 100, async (chunk) => { const result = await db.from('census_map_lots').upsert(chunk.map((lot) => ({ id: lot.id, import_id: mapImport.id, zone_id: lot.zone_id || null, zone_number: null })), { onConflict: 'id' }); if (result.error) throw new Error(result.error.message) })
      const result = await db.from('census_map_imports').update({ status: 'DRAFT', published_at: null }).eq('id', mapImport.id)
      if (result.error) throw new Error(result.error.message)
      setNotice('Divisão atual salva como rascunho.')
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Não foi possível salvar a divisão.') }
    finally { setSaving(false) }
  }

  return <section className="census-workspace"><div className="census-workspace-top"><div className="census-workspace-upload"><label className="census-file-picker"><Upload size={18} /><span><strong>{file ? file.name : 'Importar mapa DXF'}</strong><small>{file ? 'Arquivo selecionado' : 'O mapa importado fica salvo para reabertura'}</small></span><input type="file" accept=".dxf,application/dxf" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button type="button" className="fleet-primary-button" disabled={!file || saving} onClick={() => void importWorkspaceMap()}>{saving ? <LoaderCircle className="spin" size={15} /> : <Upload size={15} />} Importar mapa</button></div><div className="census-workspace-actions"><span>{mapImport ? `${mapImport.file_name} · ${assignedCount.toLocaleString('pt-BR')}/${lots.length.toLocaleString('pt-BR')} lotes classificados` : 'Nenhum mapa carregado'}</span><button type="button" className="fleet-secondary-button" disabled={saving || !mapImport} onClick={() => void saveWorkspace()}><Save size={15} /> Salvar divisão</button></div></div>{notice && <div className="census-workspace-notice"><CheckCircle2 size={15} />{notice}</div>}{loading ? <div className="fleet-loading"><LoaderCircle className="spin" size={18} /> Carregando mapa…</div> : <div className="census-workspace-grid"><div className="census-workspace-map"><div className="census-map-toolbar"><span><Move size={14} /> {areaSelectMode ? 'Arraste da esquerda para a direita para incluir lotes inteiros; da direita para a esquerda para incluir os que cruzam a área. Esc cancela.' : 'Arraste para mover · clique aplica a zona · Ctrl/Cmd+clique seleciona · role para zoom'}</span><div><button type="button" className={`census-area-selection-toggle${areaSelectMode ? ' active' : ''}`} aria-pressed={areaSelectMode} onClick={toggleAreaSelectMode}><Move size={14} /><span>{areaSelectMode ? 'Sair da seleção por área' : 'Selecionar por área'}</span></button><button type="button" onClick={() => zoomBy(1.25)} aria-label="Aumentar zoom"><Plus size={15} /></button><b>{Math.round(zoom * 100)}%</b><button type="button" onClick={() => zoomBy(1 / 1.25)} aria-label="Reduzir zoom"><Minus size={15} /></button><button type="button" onClick={resetView} aria-label="Restaurar enquadramento"><RotateCcw size={15} /></button></div></div><div ref={mapViewportRef} className={`census-map-viewport${dragging ? ' dragging' : ''}${areaSelectMode ? ' area-select-mode' : ''}${isAreaSelecting ? ' area-selecting' : ''}`} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={finishPointerAction} onPointerCancel={cancelPointerAction}>{bbox ? <svg className="census-workspace-svg" viewBox="0 0 1000 1000" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }} role="img" aria-label="Mapa de lotes para classificação">{lots.map((lot, index) => { const zone = zones.find((item) => item.id === lot.zone_id); const assigned = Boolean(zone); const selected = selectedLotKeys.includes(getLotKey(lot)); return <polygon key={getLotKey(lot)} data-lot-key={getLotKey(lot)} className={selected ? 'census-lot-selected' : undefined} points={lot.geometry.map(toSvg).join(' ')} fill={getLotFillColor(lot, zones)} stroke={selected ? '#e59a22' : assigned ? zone?.color || '#2c7892' : '#7da6aa'} strokeWidth={selected ? 3 : 1} vectorEffect="non-scaling-stroke" onClick={(event) => { event.stopPropagation(); if (!areaSelectMode) assignLot(lot, event.ctrlKey || event.metaKey) }}><title>{`Lote ${String(index + 1).padStart(4, '0')}`} · {zone?.name || 'sem zona'}</title></polygon> })}<rect ref={areaRectOverlayRef} className="census-area-selection-rect window" display="none" pointerEvents="none" /></svg> : <div className="census-map-empty"><MapPinned size={25} /><strong>Importe um mapa para começar</strong></div>}</div><div className="census-map-legend"><span><i className="unassigned" />Sem zona</span><span><i className="selected" />Lote selecionado</span><span><i className="selected" />Zona ativa: {zones.find((zone) => zone.id === activeZoneId)?.name || 'selecione ao lado'}</span></div></div><aside className="census-workspace-zones"><div className="census-workspace-zones-heading"><div><span className="fleet-kicker">CLASSIFICAÇÃO</span><h2>Escolha uma zona</h2></div><span>{zones.length} zona(s)</span></div>{zones.length ? <div className="census-workspace-zone-list">{zones.map((zone) => <button type="button" key={zone.id} className={activeZoneId === zone.id ? 'active' : ''} onClick={() => setActiveZoneId(zone.id)}><i style={{ background: zone.color }} /><span><strong>{zone.name}</strong><small>{zoneCount(zone.id).toLocaleString('pt-BR')} lote(s)</small></span><Check size={15} /></button>)}</div> : <div className="census-no-zones"><strong>Cadastre uma zona primeiro.</strong><small>Abra o menu Zonas e ACS para criar as zonas do município.</small></div>}{selectedLotKeys.length > 0 && <div className="census-selection-actions"><strong>{selectedLotKeys.length.toLocaleString('pt-BR')} lote(s) selecionado(s)</strong><button type="button" className="fleet-primary-button" disabled={!activeZoneId} onClick={assignSelectedLots}><Check size={15} /> Aplicar zona a {selectedLotKeys.length.toLocaleString('pt-BR')} lote(s)</button><button type="button" className="census-selection-clear" onClick={() => setSelectedLotKeys([])}>Limpar seleção</button></div>}<div className="census-workspace-tip"><MapPinned size={16} /><span>Clique em um lote para aplicar a zona imediatamente ou use Ctrl/Cmd+clique para seleção individual. Em “Selecionar por área”, arraste uma janela: esquerda → direita seleciona lotes totalmente contidos; direita → esquerda seleciona os que cruzam o retângulo. A seleção só recebe a zona ao clicar em Aplicar zona.</span></div></aside></div>}</section>
}
