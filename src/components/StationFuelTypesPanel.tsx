import { useEffect, useState } from 'react'
import { AlertTriangle, Fuel, LoaderCircle, Save, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Station } from './FleetResources'
import './StationFuelTypesPanel.css'

type FuelType = { id: string; nome: string; sigla: string | null; unidade_medida: string; ativo: boolean }
type Mapping = { fuel_type_id: string; active: boolean }

export function StationFuelTypesPanel({ station, onClose, onSaved }: { station: Station; onClose: () => void; onSaved: () => Promise<void> }) {
  const [fuelTypes, setFuelTypes] = useState<FuelType[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const stationName = station.nome_fantasia_snapshot || station.razao_social_snapshot

  async function load() {
    if (!supabase) { setLoading(false); setError('Serviço de dados indisponível.'); return }
    setLoading(true); setError('')
    const [fuelResult, mappingResult] = await Promise.all([
      supabase.from('fleet_fuel_types').select('id,nome,sigla,unidade_medida,ativo').eq('ativo', true).order('nome').limit(200),
      supabase.from('fleet_station_fuel_types').select('fuel_type_id,active').eq('station_id', station.id).limit(200),
    ])
    if (fuelResult.error || mappingResult.error) setError('Não foi possível ler o catálogo e as autorizações atuais deste posto.')
    else {
      setFuelTypes((fuelResult.data || []) as FuelType[])
      setSelected(new Set(((mappingResult.data || []) as Mapping[]).filter((item) => item.active).map((item) => item.fuel_type_id)))
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [station.id])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
    setNotice('')
  }

  async function save() {
    const client = supabase
    if (!client) { setError('Serviço de dados indisponível.'); return }
    setSaving(true); setError(''); setNotice('')
    try {
      const [{ data: municipio, error: municipalityError }, { data: userId, error: userError }] = await Promise.all([
        client.rpc('fleet_current_municipio_id'), client.rpc('fleet_current_usuario_id'),
      ])
      if (municipalityError || userError || !municipio || !userId) throw new Error('Não foi possível identificar município e usuário autenticado.')
      const { data: existingData, error: existingError } = await client.from('fleet_station_fuel_types').select('fuel_type_id,active').eq('station_id', station.id).limit(200)
      if (existingError) throw existingError
      const existing = new Set(((existingData || []) as Mapping[]).map((item) => item.fuel_type_id))
      const operations = fuelTypes.map((fuel) => {
        if (selected.has(fuel.id)) return client.from('fleet_station_fuel_types').upsert({
          municipio_id: municipio, station_id: station.id, fuel_type_id: fuel.id, active: true,
          configured_by: userId, configured_at: new Date().toISOString(),
        }, { onConflict: 'station_id,fuel_type_id' })
        if (existing.has(fuel.id)) return client.from('fleet_station_fuel_types').update({ active: false, configured_by: userId, configured_at: new Date().toISOString() }).eq('station_id', station.id).eq('fuel_type_id', fuel.id)
        return Promise.resolve({ error: null })
      })
      const results = await Promise.all(operations)
      const failed = results.find((result) => result.error)
      if (failed?.error) throw failed.error
      await onSaved()
      setNotice('Combustíveis autorizados atualizados. Novos abastecimentos serão validados pelo backend.')
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar as autorizações de combustível.')
    } finally { setSaving(false) }
  }

  return <div className="fleet-modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
    <section className="fleet-modal station-fuel-types-modal" role="dialog" aria-modal="true" aria-labelledby="station-fuel-types-title">
      <div className="fleet-modal-heading"><div><span className="fleet-kicker">AUTORIZAÇÃO OPERACIONAL</span><h2 id="station-fuel-types-title">Combustíveis do posto</h2><p>{stationName}</p></div><button type="button" className="fleet-close" aria-label="Fechar" onClick={onClose}><X size={18} /></button></div>
      <div className="station-fuel-types-warning"><AlertTriangle size={17} /><span>A autorização é específica por estabelecimento e será conferida novamente no banco ao registrar cada abastecimento. Revise o credenciamento antes de liberar novos produtos.</span></div>
      {error && <div className="fleet-inline-error" role="alert">{error}</div>}
      {notice && <div className="fleet-inline-success" role="status">{notice}</div>}
      <div className="station-fuel-types-list">
        {loading ? <div className="fleet-loading"><LoaderCircle size={16} className="spin" /> Carregando catálogo…</div> : fuelTypes.length ? fuelTypes.map((fuel) => <label key={fuel.id} className="station-fuel-type-option">
          <input type="checkbox" checked={selected.has(fuel.id)} onChange={() => toggle(fuel.id)} />
          <span className="station-fuel-type-icon"><Fuel size={16} /></span>
          <span><strong>{fuel.nome}{fuel.sigla ? ` (${fuel.sigla})` : ''}</strong><small>Unidade: {fuel.unidade_medida}</small></span>
          <span className={selected.has(fuel.id) ? 'station-fuel-type-state active' : 'station-fuel-type-state'}>{selected.has(fuel.id) ? 'Autorizado' : 'Não autorizado'}</span>
        </label>) : <div className="fleet-empty"><strong>Nenhum combustível ativo</strong><p>Cadastre ou ative um tipo de combustível antes de configurar o posto.</p></div>}
      </div>
      <div className="fleet-modal-actions"><button type="button" className="fleet-secondary-button" onClick={onClose} disabled={saving}>Fechar</button><button type="button" className="fleet-primary-button" onClick={() => void save()} disabled={loading || saving || !fuelTypes.length}>{saving ? <><LoaderCircle size={15} className="spin" /> Salvando…</> : <><Save size={15} /> Salvar autorizações</>}</button></div>
    </section>
  </div>
}
