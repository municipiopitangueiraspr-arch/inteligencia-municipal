import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Ban, BadgeCheck, CalendarClock, Download, ExternalLink, FileText, History, Plus, QrCode, ShieldCheck, Upload, UserRoundPlus, X } from 'lucide-react'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase'
import { FleetVehicleUseAuthorizations } from './FleetVehicleUseAuthorizations'

type Option = { id:string; nome:string; sigla?:string|null; ativo?:boolean }
export type Vehicle = { id:string; municipio_id:string; placa:string; marca:string|null; modelo:string|null; ano_fabricacao:number|null; ano_modelo:number|null; chassi:string|null; renavam:string|null; category_id:string|null; fuel_type_id:string|null; tank_capacity_l:number; responsible_unit_id:string|null; operational_status:string; current_odometer_km:number|null; acquisition_date:string|null; acquisition_value:number|null; ownership_type:string|null; notes:string|null; created_at:string; updated_at?:string }
type Restriction = { id:string; reason:string; starts_at:string; ends_at:string|null; active:boolean; released_at:string|null; release_reason:string|null }
type Authorization = { id:string; driver_id:string; valid_from:string; valid_until:string|null; status:string; reason:string|null; created_at:string; ended_at?:string|null; ended_by?:number|null; ended_reason?:string|null; driver?:{id:string;nome:string;matricula:string|null;cnh_valid_until:string|null;cnh_category?:string|null;ativo:boolean}|null }
type Document = { id:string; file_name:string; storage_path:string; mime_type:string; file_size_bytes:number; document_type:string; description:string|null; uploaded_at:string }
type History = { id:string; event_type:string; previous_data:Record<string,unknown>|null; new_data:Record<string,unknown>|null; reason:string|null; changed_at:string }
type Department = { id:string; from_unit_id:string|null; to_unit_id:string|null; started_at:string; ended_at:string|null; reason:string|null }
type Fueling = { id:string; performed_at:string; liters:number; total_amount:number; odometer_km:number; status:string; station_receipt_number:string|null; fuel_type_id:string; stations?:{nome_fantasia_snapshot?:string|null}|null }
type Driver = { id:string; nome:string; matricula:string|null; cnh_valid_until:string|null; cnh_category:string|null; ativo:boolean }
type Props = { vehicle:Vehicle; units:Option[]; fuels:Option[]; categories:Option[]; canManage:boolean; blocked:boolean; onClose:()=>void; onChanged:()=>Promise<void> }
const today = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date())
const when = (value?:string|null) => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value)) : '—'
const dateOnly = (value?:string|null) => value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'UTC'}).format(/^\d{4}-\d{2}-\d{2}$/.test(value)?new Date(`${value}T12:00:00Z`):new Date(value)) : '—'

export function FleetVehicleDetails({vehicle,units,fuels,categories,canManage,blocked,onClose,onChanged}:Props) {
  const [history,setHistory] = useState<History[]>([])
  const [departments,setDepartments] = useState<Department[]>([])
  const [fuelings,setFuelings] = useState<Fueling[]>([])
  const [restrictions,setRestrictions] = useState<Restriction[]>([])
  const [authorizations,setAuthorizations] = useState<Authorization[]>([])
  const [documents,setDocuments] = useState<Document[]>([])
  const [drivers,setDrivers] = useState<Driver[]>([])
  const [driversLoading,setDriversLoading] = useState(false)
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [showBlock,setShowBlock] = useState(false)
  const [showDriver,setShowDriver] = useState(false)
  const [blockReason,setBlockReason] = useState('')
  const [blockStart,setBlockStart] = useState(new Date().toISOString().slice(0,16))
  const [blockEnd,setBlockEnd] = useState('')
  const [releaseReason,setReleaseReason] = useState('')
  const [driverId,setDriverId] = useState('')
  const [validFrom,setValidFrom] = useState(today())
  const [validUntil,setValidUntil] = useState('')
  const [authorizationReason,setAuthorizationReason] = useState('')
  const [docType,setDocType] = useState('DOCUMENTO_VEICULO')
  const [docDescription,setDocDescription] = useState('')
  const [qrData,setQrData] = useState('')
  const [qrUrl,setQrUrl] = useState('')

  const load = useCallback(async () => {
    if (!supabase) return
    setLoading(true);setError('')
    const [historyResult,departmentResult,fuelingResult,restrictionResult,authorizationResult,documentResult] = await Promise.all([
      supabase.from('fleet_vehicle_history').select('id,event_type,previous_data,new_data,reason,changed_at').eq('vehicle_id',vehicle.id).order('changed_at',{ascending:false}).limit(100),
      supabase.from('fleet_vehicle_department_history').select('id,from_unit_id,to_unit_id,started_at,ended_at,reason').eq('vehicle_id',vehicle.id).order('started_at',{ascending:false}).limit(100),
      supabase.from('fleet_fuelings').select('id,performed_at,liters,total_amount,odometer_km,status,station_receipt_number,fuel_type_id,stations:fleet_fuel_stations(nome_fantasia_snapshot)').eq('vehicle_id',vehicle.id).order('performed_at',{ascending:false}).limit(50),
      supabase.from('fleet_vehicle_restrictions').select('id,reason,starts_at,ends_at,active,released_at,release_reason').eq('vehicle_id',vehicle.id).order('created_at',{ascending:false}).limit(50),
      supabase.from('fleet_vehicle_driver_authorizations').select('id,driver_id,valid_from,valid_until,status,reason,created_at,ended_at,ended_by,ended_reason,driver:fleet_drivers(id,nome,matricula,cnh_valid_until,cnh_category,ativo)').eq('vehicle_id',vehicle.id).order('created_at',{ascending:false}).limit(100),
      supabase.from('fleet_vehicle_documents').select('id,file_name,storage_path,mime_type,file_size_bytes,document_type,description,uploaded_at').eq('vehicle_id',vehicle.id).order('uploaded_at',{ascending:false}).limit(100),
    ])
    const failure = historyResult.error||departmentResult.error||fuelingResult.error||restrictionResult.error||authorizationResult.error||documentResult.error
    if (failure) setError('Algumas partes da ficha não puderam ser carregadas. Verifique as permissões e tente atualizar.')
    setHistory((historyResult.data||[]) as History[]);setDepartments((departmentResult.data||[]) as Department[]);setFuelings((fuelingResult.data||[]) as unknown as Fueling[]);setRestrictions((restrictionResult.data||[]) as Restriction[]);setAuthorizations((authorizationResult.data||[]) as unknown as Authorization[]);setDocuments((documentResult.data||[]) as Document[])
    setLoading(false)
  },[vehicle.id])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{
    if(!showDriver||!supabase)return
    let cancelled=false
    const instant=new Date(`${validFrom}T12:00:00-03:00`)
    if(!Number.isFinite(instant.getTime()))return
    setDriversLoading(true)
    void supabase.rpc('fleet_manager_vehicle_driver_options',{p_vehicle_id:vehicle.id,p_performed_at:instant.toISOString(),p_require_authorization:false}).then(({data,error:resultError})=>{
      if(cancelled)return
      if(resultError){setDrivers([]);setError('Não foi possível carregar motoristas ativos com CNH compatível na data escolhida.')}else setDrivers((data||[]) as Driver[])
      setDriversLoading(false)
    })
    return()=>{cancelled=true}
  },[showDriver,vehicle.id,validFrom])
  useEffect(()=>{
    const url = new URL(import.meta.env.BASE_URL,window.location.origin)
    url.searchParams.set('portal','fornecedor');url.searchParams.set('vehicle',vehicle.id)
    setQrUrl(url.toString())
    void QRCode.toDataURL(url.toString(),{width:320,margin:2,errorCorrectionLevel:'M',color:{dark:'#12394d',light:'#ffffff'}}).then(setQrData).catch(()=>setQrData(''))
  },[vehicle.id])
  const activeRestriction = useMemo(()=>restrictions.find(r=>r.active&&!r.released_at&&Date.parse(r.starts_at)<=Date.now()&&(!r.ends_at||Date.parse(r.ends_at)>Date.now())),[restrictions])
  function unitName(id:string|null) { return units.find(x=>x.id===id)?.nome||'—' }
  function fuelName(id:string|null) { return fuels.find(x=>x.id===id)?.nome||'—' }

  async function createRestriction(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!supabase||!canManage||blockReason.trim().length<5)return;setSaving(true);setError('')
    const [{data:municipio},{data:usuario}] = await Promise.all([supabase.rpc('fleet_current_municipio_id'),supabase.rpc('fleet_current_usuario_id')])
    const {error:saveError}=await supabase.from('fleet_vehicle_restrictions').insert({municipio_id:municipio,vehicle_id:vehicle.id,reason:blockReason.trim(),starts_at:new Date(blockStart).toISOString(),ends_at:blockEnd?new Date(blockEnd).toISOString():null,active:true,created_by:usuario})
    setSaving(false)
    if(saveError){setError(saveError.code==='23505'?'Já existe um bloqueio vigente para este veículo.':'Não foi possível registrar o bloqueio.');return}
    setShowBlock(false);setBlockReason('');setNotice('Bloqueio registrado. O backend impedirá abastecimentos durante sua vigência.');await load();await onChanged()
  }
  async function releaseRestriction(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!supabase||!canManage||!activeRestriction||releaseReason.trim().length<5)return;setSaving(true)
    const {data:usuario}=await supabase.rpc('fleet_current_usuario_id')
    const {error:saveError}=await supabase.from('fleet_vehicle_restrictions').update({active:false,released_at:new Date().toISOString(),released_by:usuario,release_reason:releaseReason.trim()}).eq('id',activeRestriction.id)
    setSaving(false)
    if(saveError){setError('Não foi possível encerrar o bloqueio.');return}
    setReleaseReason('');setNotice('Bloqueio encerrado e registrado.');await load();await onChanged()
  }
  async function openDriverForm() {
    if(!supabase)return
    setError('');setDriverId('');setShowDriver(true)
  }
  async function createDriverAuthorization(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!supabase||!canManage||!driverId||authorizationReason.trim().length<5)return;setSaving(true)
    const {error:saveError}=await supabase.rpc('fleet_create_vehicle_driver_authorization',{p_vehicle_id:vehicle.id,p_driver_id:driverId,p_valid_from:validFrom,p_valid_until:validUntil||null,p_reason:authorizationReason.trim()})
    setSaving(false)
    if(saveError){setError(saveError.code==='23505'?'Já existe uma autorização ativa para esse motorista e veículo.':'Não foi possível autorizar o motorista.');return}
    setShowDriver(false);setDriverId('');setAuthorizationReason('');setNotice('Autorização de condução registrada.');await load()
  }
  async function endDriverAuthorization(item:Authorization) {
    if(!supabase||!canManage)return
    const reason=window.prompt('Informe o motivo do encerramento da autorização:')?.trim()
    if(!reason||reason.length<5)return
    const {error:saveError}=await supabase.rpc('fleet_end_vehicle_driver_authorization',{p_authorization_id:item.id,p_end_date:today(),p_reason:reason})
    if(saveError){setError('Não foi possível encerrar a autorização.');return}setNotice('Autorização encerrada.');await load()
  }
  async function uploadDocument(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();if(!supabase||!canManage)return
    const formElement=event.currentTarget;const input=formElement.querySelector<HTMLInputElement>('input[type=file]');const file=input?.files?.[0]
    if(!file)return
    if(file.size>10*1024*1024){setError('O arquivo deve ter no máximo 10 MB.');return}
    if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type)){setError('Use PDF, JPG, PNG ou WEBP.');return}
    setSaving(true);setError('')
    const {data:municipio}=await supabase.rpc('fleet_current_municipio_id')
    const safeName=file.name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]/g,'_').slice(-120)
    const path=`${municipio}/${vehicle.id}/${crypto.randomUUID()}-${safeName}`
    const {error:uploadError}=await supabase.storage.from('fleet-vehicle-documents').upload(path,file,{contentType:file.type,upsert:false})
    if(uploadError){setSaving(false);setError('Não foi possível enviar o documento para o armazenamento privado.');return}
    const {data:usuario}=await supabase.rpc('fleet_current_usuario_id')
    const {error:metadataError}=await supabase.from('fleet_vehicle_documents').insert({municipio_id:municipio,vehicle_id:vehicle.id,file_name:file.name,storage_path:path,mime_type:file.type,file_size_bytes:file.size,document_type:docType,description:docDescription.trim()||null,uploaded_by:usuario})
    if(metadataError){await supabase.storage.from('fleet-vehicle-documents').remove([path]);setSaving(false);setError('O arquivo foi enviado, mas não foi possível registrar seus metadados.');return}
    setSaving(false);setDocDescription('');formElement.reset();setNotice('Documento armazenado com acesso privado.');await load()
  }
  async function viewDocument(doc:Document) {
    if(!supabase)return
    const {data,error:signedError}=await supabase.storage.from('fleet-vehicle-documents').createSignedUrl(doc.storage_path,60)
    if(signedError||!data?.signedUrl){setError('Não foi possível abrir o documento.');return}
    window.open(data.signedUrl,'_blank','noopener,noreferrer')
  }
  function downloadQr() { if(!qrData)return;const anchor=document.createElement('a');anchor.href=qrData;anchor.download=`QR-veiculo-${vehicle.placa}.png`;anchor.click() }

  return <div className="fleet-modal-backdrop fv-detail-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="fleet-modal fv-detail-modal" role="dialog" aria-modal="true" aria-labelledby="fv-detail-title"><header className="fleet-modal-heading"><div><span className="fleet-kicker">FICHA DO VEÍCULO · {vehicle.id.slice(0,8)}</span><h2 id="fv-detail-title">{vehicle.placa} · {[vehicle.marca,vehicle.modelo].filter(Boolean).join(' ')}</h2><p className="fv-subheading">{vehicle.operational_status} · {unitName(vehicle.responsible_unit_id)}</p></div><button className="fleet-close" onClick={onClose} aria-label="Fechar"><X size={18}/></button></header>
    {error&&<p className="fv-inline-error" role="alert">{error}</p>}{notice&&<p className="fv-inline-success" role="status">{notice}</p>}{loading&&<p className="fv-subheading">Carregando histórico e documentos…</p>}
    <div className="fv-detail-scroll"><section className="fv-detail-card"><h3><ShieldCheck size={15}/> Dados cadastrais</h3><div className="fv-detail-grid"><span>Categoria<b>{categories.find(x=>x.id===vehicle.category_id)?.nome||'—'}</b></span><span>Combustível<b>{fuelName(vehicle.fuel_type_id)}</b></span><span>Tanque<b>{Number(vehicle.tank_capacity_l).toLocaleString('pt-BR')} L</b></span><span>Odômetro<b>{vehicle.current_odometer_km??'—'} km</b></span><span>Chassi<b>{vehicle.chassi||'—'}</b></span><span>RENAVAM<b>{vehicle.renavam||'—'}</b></span><span>Propriedade<b>{vehicle.ownership_type||'—'}</b></span><span>Aquisição<b>{dateOnly(vehicle.acquisition_date)}{vehicle.acquisition_value!=null?` · R$ ${Number(vehicle.acquisition_value).toLocaleString('pt-BR')}`:''}</b></span><span>Cadastro<b>{when(vehicle.created_at)}</b></span></div>{vehicle.notes&&<p className="fv-notes">{vehicle.notes}</p>}</section>
    <section className="fv-detail-card"><h3><Ban size={15}/> Restrições de abastecimento</h3>{activeRestriction||blocked?<div className="fv-restriction-alert"><strong>Bloqueio vigente</strong><p>{activeRestriction?.reason||'Este veículo está bloqueado.'} {activeRestriction?.ends_at?`Até ${when(activeRestriction.ends_at)}`:'Sem data final.'}</p>{canManage&&activeRestriction&&<form className="fv-inline-form" onSubmit={releaseRestriction}><input required minLength={5} value={releaseReason} onChange={e=>setReleaseReason(e.target.value)} placeholder="Motivo para encerrar o bloqueio"/><button className="fleet-secondary-button" disabled={saving}>Encerrar bloqueio</button></form>}</div>:<p>Nenhum bloqueio vigente.</p>}{canManage&&!activeRestriction&&<button className="fleet-secondary-button" onClick={()=>setShowBlock(!showBlock)}><Ban size={14}/> Bloquear abastecimento</button>}{showBlock&&<form className="fv-inline-form fv-form-grid" onSubmit={createRestriction}><label>Motivo *<input required minLength={5} value={blockReason} onChange={e=>setBlockReason(e.target.value)}/></label><label>Início *<input required type="datetime-local" value={blockStart} onChange={e=>setBlockStart(e.target.value)}/></label><label>Fim (opcional)<input type="datetime-local" value={blockEnd} onChange={e=>setBlockEnd(e.target.value)}/></label><button className="fleet-primary-button" disabled={saving}>Registrar bloqueio</button></form>}{restrictions.filter(r=>!r.active||r.released_at).length>0&&<details><summary>Bloqueios anteriores</summary>{restrictions.filter(r=>!r.active||r.released_at).map(r=><p key={r.id}>{when(r.starts_at)} — {r.reason}{r.release_reason?` · Encerrado: ${r.release_reason}`:''}</p>)}</details>}</section>
    <section className="fv-detail-card"><h3><UserRoundPlus size={15}/> Motoristas autorizados</h3>{canManage&&<button className="fleet-secondary-button" onClick={()=>void openDriverForm()}><Plus size={14}/> Autorizar motorista</button>}{authorizations.length?<div className="fv-record-list">{authorizations.map(a=><article key={a.id}><div><strong>{a.driver?.nome||`Motorista ${a.driver_id.slice(0,8)}`}</strong><small>{a.driver?.matricula?`Matrícula ${a.driver.matricula} · `:''}CNH válida até {dateOnly(a.driver?.cnh_valid_until)}</small><small>Vigência: {dateOnly(a.valid_from)} a {dateOnly(a.valid_until)} · {a.status}</small><small>{a.reason||''}</small></div>{canManage&&a.status==='ATIVA'&&<button className="fleet-secondary-button" onClick={()=>void endDriverAuthorization(a)}>Encerrar</button>}</article>)}</div>:<p>Nenhuma autorização de motorista cadastrada.</p>}</section>
    <FleetVehicleUseAuthorizations vehicle={vehicle} units={units} canManage={canManage} />
    <section className="fv-detail-card"><h3><FileText size={15}/> Documentos e fotos</h3>{canManage&&<form className="fv-document-form" onSubmit={uploadDocument}><label>Tipo<select value={docType} onChange={e=>setDocType(e.target.value)}>{['DOCUMENTO_VEICULO','LICENCIAMENTO','SEGURO','AQUISICAO','FOTO','OUTRO'].map(t=><option key={t} value={t}>{t.replaceAll('_',' ')}</option>)}</select></label><label>Descrição<input value={docDescription} onChange={e=>setDocDescription(e.target.value)} maxLength={200}/></label><label className="fv-file-label"><Upload size={14}/> Selecionar arquivo<input required type="file" accept="application/pdf,image/jpeg,image/png,image/webp"/></label><button className="fleet-primary-button" disabled={saving}>{saving?'Enviando…':'Enviar em área privada'}</button><small>PDF/JPG/PNG/WEBP; até 10 MB. Acesso restrito a gestores.</small></form>}{documents.length?<div className="fv-record-list">{documents.map(d=><article key={d.id}><div><strong>{d.file_name}</strong><small>{d.document_type.replaceAll('_',' ')} · {(d.file_size_bytes/1024/1024).toFixed(2)} MB · {when(d.uploaded_at)}</small>{d.description&&<small>{d.description}</small>}</div><button className="fleet-secondary-button" onClick={()=>void viewDocument(d)}><ExternalLink size={13}/> Abrir</button></article>)}</div>:<p>Nenhum documento anexado.</p>}</section>
    <section className="fv-detail-card"><h3><QrCode size={15}/> Identificação por QR Code</h3><p>O QR contém somente o UUID do veículo na URL do portal do posto. A leitura identifica; o backend continua validando a operação.</p>{qrData&&<div className="fv-qr-box"><img src={qrData} alt={`QR Code do veículo ${vehicle.placa}`}/><code>{qrUrl}</code><button className="fleet-secondary-button" onClick={downloadQr}><Download size={14}/> Baixar PNG</button></div>}</section>
    <section className="fv-detail-card"><h3><CalendarClock size={15}/> Histórico de lotação</h3>{departments.length?<div className="fv-record-list">{departments.map(d=><article key={d.id}><div><strong>{unitName(d.from_unit_id)} → {unitName(d.to_unit_id)}</strong><small>{dateOnly(d.started_at)} até {d.ended_at?dateOnly(d.ended_at):'atual'}</small>{d.reason&&<small>{d.reason}</small>}</div></article>)}</div>:<p>Nenhuma transferência registrada.</p>}</section>
    <section className="fv-detail-card"><h3><History size={15}/> Histórico de alterações</h3>{history.length?<div className="fv-record-list">{history.map(h=><article key={h.id}><div><strong>{h.event_type.replaceAll('_',' ')}</strong><small>{when(h.changed_at)}{h.reason?` · ${h.reason}`:''}</small><details><summary>Dados alterados</summary><pre>{JSON.stringify({anterior:h.previous_data,novo:h.new_data},null,2)}</pre></details></div></article>)}</div>:<p>Nenhum evento histórico disponível.</p>}</section>
    <section className="fv-detail-card"><h3><BadgeCheck size={15}/> Abastecimentos recentes</h3>{fuelings.length?<div className="fv-record-list">{fuelings.map(f=><article key={f.id}><div><strong>{when(f.performed_at)} · {Number(f.liters).toLocaleString('pt-BR')} L · {fuelName(f.fuel_type_id)}</strong><small>{f.stations?.nome_fantasia_snapshot||'Posto não informado'} · {f.status} · Hodômetro {f.odometer_km} km</small><small>{f.station_receipt_number||''}</small></div></article>)}</div>:<p>Nenhum abastecimento registrado.</p>}</section></div>
    {showDriver&&<div className="fleet-modal-backdrop fv-nested-backdrop"><form className="fleet-modal fv-small-modal" onSubmit={createDriverAuthorization}><div className="fleet-modal-heading"><h2>Autorizar motorista</h2><button type="button" className="fleet-close" onClick={()=>setShowDriver(false)}><X size={17}/></button></div><label>Motorista ativo *<select required value={driverId} onChange={e=>setDriverId(e.target.value)} disabled={driversLoading}><option value="">{driversLoading?'Carregando…':'Selecione'}</option>{drivers.map(d=><option key={d.id} value={d.id}>{d.nome}{d.matricula?` — ${d.matricula}`:''}{d.cnh_category?` · Cat. ${d.cnh_category}`:''}{d.cnh_valid_until&&` · CNH até ${dateOnly(d.cnh_valid_until)}`}</option>)}</select></label><div className="fv-form-grid"><label>Válida desde *<input type="date" required value={validFrom} onChange={e=>setValidFrom(e.target.value)}/></label><label>Válida até<input type="date" value={validUntil} onChange={e=>setValidUntil(e.target.value)}/></label></div><label>Motivo *<textarea required minLength={5} value={authorizationReason} onChange={e=>setAuthorizationReason(e.target.value)}/></label><div className="fleet-modal-actions"><button type="button" className="fleet-secondary-button" onClick={()=>setShowDriver(false)}>Cancelar</button><button className="fleet-primary-button" disabled={saving}>Autorizar</button></div></form></div>}
    </section></div>
}
