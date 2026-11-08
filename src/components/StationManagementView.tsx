import { useEffect, useState } from 'react'
import { BellRing, ClipboardCheck, Store } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { StationsView } from './FleetResources'
import { StationAccessRequests } from './StationAccessRequests'

export function StationManagementView({ onSaved }: { onSaved: () => Promise<void> }) {
  const [tab, setTab] = useState<'stations' | 'requests'>('stations')
  const [pending, setPending] = useState(0)

  async function loadPending() {
    if (!supabase) return
    const result = await supabase.from('fleet_station_access_requests').select('id', { count: 'exact', head: true }).eq('status', 'PENDENTE')
    if (!result.error) setPending(result.count || 0)
  }

  useEffect(() => { void loadPending() }, [])

  return <section className="station-management">
    <div className="station-management-heading">
      <div><span className="fleet-kicker">CREDENCIAMENTO E ACESSO EXTERNO</span><h2>Gestão de postos credenciados</h2><p>Cadastre estabelecimentos, acompanhe pedidos de primeiro acesso e administre os usuários autorizados.</p></div>
    </div>
    <div className="station-management-tabs" role="tablist">
      <button className={tab === 'stations' ? 'active' : ''} onClick={() => setTab('stations')}><Store size={16} /> Postos credenciados</button>
      <button className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}><BellRing size={16} /> Pedidos de primeiro acesso {pending > 0 && <b>{pending}</b>}</button>
    </div>
    {pending > 0 && <button className="station-management-alert" onClick={() => setTab('requests')}><BellRing size={17} /><span><strong>{pending} pedido{pending > 1 ? 's' : ''} aguardando análise</strong><small>O fornecedor será avisado por e-mail assim que o pedido for recebido.</small></span><ClipboardCheck size={17} /></button>}
    {tab === 'stations' ? <StationsView onSaved={async () => { await onSaved(); await loadPending() }} /> : <StationAccessRequests onSaved={async () => { await onSaved(); await loadPending() }} />}
  </section>
}
