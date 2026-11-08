import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, CalendarCheck, CheckCircle2, CircleAlert, Eye, FileCheck2, FileText, History, MessageSquareText, RefreshCw, Send, Store, Upload, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { formatMunicipalDateTime, municipalDateStartIso } from '../lib/municipalTime'
import type { Station } from './FleetResources'
import './SupplierMonthlyClosuresView.css'

type ParentClosure = { id: string; reference_year: number; reference_month: number; status: string; started_at: string | null; checked_at: string | null; closed_at: string | null; reopened_at: string | null; reopening_reason: string | null; notes: string | null }
type StationClosure = { id: string; closure_id: string; station_id: string; registered_fueling_count: number; registered_liters: number; registered_amount: number; invoiced_amount: number | null; divergence_amount: number | null; documents_pending_count: number; status: string; closure_status: string; requested_at: string | null; no_activity_reported: boolean; no_activity_confirmed: boolean; checked_at: string | null; review_notes: string | null; notes: string | null }
type InvoiceDocument = { id: string; closure_id: string; station_check_id: string; station_id: string; document_type: string; document_number: string | null; document_series: string | null; access_key: string | null; issue_date: string | null; issuer_document: string | null; document_amount: number; file_name: string; storage_path: string; mime_type: string; document_status: string; uploaded_at: string; reviewed_at: string | null; rejection_reason: string | null; is_current: boolean; notes: string | null; replaced_document_id: string | null }
type Discrepancy = { id: string; discrepancy_type: string; severity: string; description: string; amount_involved: number | null; status: string; identified_at: string; response_deadline: string | null; resolution_notes: string | null }
type ClosureMessage = { id: string; discrepancy_id: string | null; sender_scope: string; message_type: string; message: string; created_at: string }
type AuditEvent = { id: string; entity_table: string; action_type: string; previous_status: string | null; new_status: string | null; reason: string | null; performed_at: string }
type ClosureVersion = { id: string; version_number: number; total_transactions: number; total_liters: number; total_amount: number; invoice_amount: number | null; difference_amount: number | null; created_at: string; reason: string | null }
type Fueling = { id: string; vehicle_id: string; status: string; performed_at: string; submitted_at: string; liters: number; unit_price: number; total_amount: number; odometer_km: number; station_receipt_number: string | null; vehicles?: { placa?: string; marca?: string | null; modelo?: string | null } | null; fuel_type?: { nome?: string; sigla?: string | null } | null; documents?: Array<{ id: string; file_name: string; storage_path: string; mime_type: string; document_status: string; uploaded_at: string; is_current: boolean; rejection_reason: string | null }> | null }

const money = (value: number | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0))
const number = (value: number | null | undefined, digits=2) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits })
const dateTime = (value?: string | null) => formatMunicipalDateTime(value)
const dateOnly = (value?: string | null) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(new Date(`${value.slice(0,10)}T12:00:00Z`)) : '—'
const currentPeriod = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0,7)
const statusInfo = (value: string) => ({ ABERTO:['Aberto','open'], EM_CONFERENCIA:['Em conferência','review'], COM_DIVERGENCIA:['Com divergência','danger'], CONFERIDO:['Conferido','success'], FECHADO:['Fechado','closed'], REABERTO:['Reaberto','warning'] }[value] || [value.replaceAll('_',' '),'neutral']) as [string,string]
const documentInfo = (value: string) => ({ PENDENTE:['Pendente','warning'], ENVIADO:['Enviado','review'], EM_ANALISE:['Em análise','review'], ACEITO:['Aceito','success'], REJEITADO:['Rejeitado','danger'], SUBSTITUIDO:['Substituído','neutral'] }[value] || [value.replaceAll('_',' '),'neutral']) as [string,string]
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const fileSafeName = (name: string) => name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^\.+/,'').slice(-120) || 'documento'

export function SupplierMonthlyClosuresView({ station }: { station: Station }) {
  const [period,setPeriod]=useState(currentPeriod)
  const [closure,setClosure]=useState<ParentClosure|null>(null)
  const [check,setCheck]=useState<StationClosure|null>(null)
  const [documents,setDocuments]=useState<InvoiceDocument[]>([])
  const [discrepancies,setDiscrepancies]=useState<Discrepancy[]>([])
  const [messages,setMessages]=useState<ClosureMessage[]>([])
  const [history,setHistory]=useState<AuditEvent[]>([])
  const [versions,setVersions]=useState<ClosureVersion[]>([])
  const [fuelings,setFuelings]=useState<Fueling[]>([])
  const [fuelingCount,setFuelingCount]=useState(0)
  const [offset,setOffset]=useState(0)
  const [hasMore,setHasMore]=useState(false)
  const [loading,setLoading]=useState(!!supabase)
  const [loadingMore,setLoadingMore]=useState(false)
  const [working,setWorking]=useState(false)
  const [error,setError]=useState(supabase?'':'O serviço de dados está indisponível.')
  const [notice,setNotice]=useState('')
  const [file,setFile]=useState<File|null>(null)
  const [preview,setPreview]=useState<{title:string,url:string,mimeType:string}|null>(null)
  const [selectedDiscrepancy,setSelectedDiscrepancy]=useState('')
  const [acknowledged,setAcknowledged]=useState(false)

  const loadFuelingPage = useCallback(async (from:number, append:boolean) => {
    if(!supabase)return
    const [year,month]=period.split('-').map(Number)
    const start=municipalDateStartIso(`${period}-01`)
    const endDate=month===12?`${year+1}-01-01`:`${year}-${String(month+1).padStart(2,'0')}-01`
    const end=municipalDateStartIso(endDate)
    const result=await supabase.from('fleet_fuelings').select('id,vehicle_id,status,performed_at,submitted_at,liters,unit_price,total_amount,odometer_km,station_receipt_number,vehicles:fleet_vehicles(placa,marca,modelo),fuel_type:fleet_fuel_types(nome,sigla),documents:fleet_fueling_documents(id,file_name,storage_path,mime_type,document_status,uploaded_at,is_current,rejection_reason)',{count:'exact'}).eq('station_id',station.id).gte('performed_at',start).lt('performed_at',end).order('performed_at',{ascending:false}).range(from,from+499)
    if(result.error)throw result.error
    let vehicleById=new Map<string,{placa:string;marca?:string|null;modelo?:string|null}>()
    try {
      const vehicleResult=await supabase.rpc('fleet_supplier_vehicle_options_v2',{p_station_id:station.id})
      if(!vehicleResult.error){
        const options=(vehicleResult.data||[]) as Array<{id:string;placa:string;marca?:string|null;modelo?:string|null}>
        vehicleById=new Map(options.map((vehicle)=>[vehicle.id,vehicle]))
      }
    } catch {
      // Vehicle labels are supplementary; keep the scoped fueling history usable if this lookup is unavailable.
    }
    const page=((result.data||[]) as unknown as Fueling[]).map((fueling)=>({...fueling,vehicles:fueling.vehicles||vehicleById.get(fueling.vehicle_id)||null}))
    setFuelings((previous)=>append?[...previous,...page]:page)
    setFuelingCount(result.count??page.length)
    setOffset(from+page.length)
    setHasMore(from+page.length<(result.count??page.length))
  },[period,station.id])

  const load = useCallback(async () => {
    if(!supabase)return
    try {
      const [year,month]=period.split('-').map(Number)
      const closureResult=await supabase.rpc('fleet_supplier_monthly_closure',{p_station_id:station.id,p_reference_year:year,p_reference_month:month})
      if(closureResult.error)throw closureResult.error
      const payload=closureResult.data as {closure?:ParentClosure|null;station_check?:StationClosure|null}|null
      const currentClosure=payload?.closure||null
      const currentCheck=payload?.station_check||null
      setClosure(currentClosure);setCheck(currentCheck)
      if(!currentClosure||!currentCheck){setDocuments([]);setDiscrepancies([]);setMessages([]);setHistory([]);setVersions([]);setFuelings([]);setFuelingCount(0);return}
      const [documentResult,discrepancyResult,messageResult,historyResult,versionResult]=await Promise.all([
        supabase.from('fleet_monthly_closure_documents').select('id,closure_id,station_check_id,station_id,document_type,document_number,document_series,access_key,issue_date,issuer_document,document_amount,file_name,storage_path,mime_type,document_status,uploaded_at,reviewed_at,rejection_reason,is_current,notes,replaced_document_id').eq('closure_id',currentClosure.id).eq('station_id',station.id).order('uploaded_at',{ascending:false}).limit(500),
        supabase.from('fleet_monthly_closure_discrepancies').select('id,discrepancy_type,severity,description,amount_involved,status,identified_at,response_deadline,resolution_notes').eq('closure_id',currentClosure.id).eq('station_id',station.id).order('identified_at',{ascending:false}).limit(250),
        supabase.from('fleet_monthly_closure_messages').select('id,discrepancy_id,sender_scope,message_type,message,created_at').eq('closure_id',currentClosure.id).eq('station_id',station.id).order('created_at',{ascending:false}).limit(250),
        supabase.from('fleet_monthly_closure_history').select('id,entity_table,action_type,previous_status,new_status,reason,performed_at').eq('closure_id',currentClosure.id).eq('station_id',station.id).order('performed_at',{ascending:false}).limit(100),
        supabase.from('fleet_monthly_closure_versions').select('id,version_number,total_transactions,total_liters,total_amount,invoice_amount,difference_amount,created_at,reason').eq('closure_id',currentClosure.id).eq('station_id',station.id).order('created_at',{ascending:false}).limit(100),
      ])
      const queryError=documentResult.error||discrepancyResult.error||messageResult.error||historyResult.error||versionResult.error
      if(queryError)throw queryError
      setDocuments((documentResult.data||[]) as InvoiceDocument[]);setDiscrepancies((discrepancyResult.data||[]) as Discrepancy[]);setMessages((messageResult.data||[]) as ClosureMessage[]);setHistory((historyResult.data||[]) as AuditEvent[]);setVersions((versionResult.data||[]) as ClosureVersion[])
      await loadFuelingPage(0,false)
    } catch(cause){setError(`Não foi possível abrir sua competência. ${failure(cause)}`)}
    finally{setLoading(false)}
  },[period,station.id,loadFuelingPage])
  const changePeriod=(nextPeriod:string)=>{
    if(nextPeriod===period){if(!supabase){setError('O serviço de dados está indisponível.');return}setLoading(true);setError('');setNotice('');void load();return}
    setPeriod(nextPeriod);setLoading(!!supabase);setError(supabase?'':'O serviço de dados está indisponível.');setNotice('')
  }
  const refresh=()=>{if(!supabase){setError('O serviço de dados está indisponível.');return}setLoading(true);setError('');setNotice('');void load()}
  useEffect(()=>{void load()},[load])

  const currentDocs=documents.filter((document)=>document.is_current&&document.document_status!=='SUBSTITUIDO')
  const invoices=currentDocs.filter((document)=>document.document_type==='NOTA_FISCAL'&&document.document_status!=='REJEITADO')
  const pendingDiscrepancies=discrepancies.filter((item)=>item.status!=='RESOLVIDA')
  const canRequest=!!check&&['ABERTO','REABERTO'].includes(check.closure_status)&&((check.registered_fueling_count===0&&acknowledged)||(check.registered_fueling_count>0&&invoices.length>0&&acknowledged))

  async function submitDocument(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!supabase||!closure||!check||!file)return
    if(!['application/pdf','image/jpeg','image/png'].includes(file.type)){setError('Use arquivo PDF, JPG ou PNG.');return}
    if(file.size>10*1024*1024){setError('O arquivo excede o limite de 10 MB.');return}
    const form=event.currentTarget
    const values=new FormData(form)
    const amount=Number(values.get('document_amount'))
    if(!Number.isFinite(amount)||amount<=0){setError('Informe um valor fiscal maior que zero.');return}
    setWorking(true);setError('');setNotice('')
    let storagePath=''
    try {
      const municipioResult=await supabase.rpc('fleet_current_municipio_id')
      if(municipioResult.error||!municipioResult.data)throw municipioResult.error||new Error('Não foi possível identificar o município autenticado.')
      storagePath=`${municipioResult.data}/monthly-closures/${closure.id}/${station.id}/${crypto.randomUUID()}-${fileSafeName(file.name)}`
      const uploaded=await supabase.storage.from('fleet-documents').upload(storagePath,file,{contentType:file.type,upsert:false,cacheControl:'3600'})
      if(uploaded.error)throw uploaded.error
      const replaceId=String(values.get('replaced_document_id')||'').trim()||null
      const registered=await supabase.rpc('fleet_register_monthly_closure_document',{
        p_closure_id:closure.id,p_station_id:station.id,p_document_type:String(values.get('document_type')||'NOTA_FISCAL'),
        p_document_number:String(values.get('document_number')||'').trim()||null,p_document_series:String(values.get('document_series')||'').trim()||null,
        p_access_key:String(values.get('access_key')||'').replace(/\D/g,'')||null,p_issue_date:String(values.get('issue_date')||'')||null,
        p_issuer_document:String(values.get('issuer_document')||'').replace(/\D/g,'')||null,p_document_amount:amount,
        p_file_name:file.name,p_storage_path:storagePath,p_mime_type:file.type,p_file_size_bytes:file.size,
        p_replaced_document_id:replaceId,p_notes:String(values.get('notes')||'').trim()||null,
      })
      if(registered.error)throw registered.error
      setFile(null);form.reset();setNotice('Documento anexado ao fechamento privado e enviado para validação municipal.');await load()
    } catch(cause) {
      if(storagePath)await supabase.storage.from('fleet-documents').remove([storagePath]).catch(()=>undefined)
      setError(`O documento não foi registrado. ${failure(cause)}`)
    } finally {setWorking(false)}
  }

  async function requestClosure() {
    if(!supabase||!closure||!check||!canRequest)return
    setWorking(true);setError('');setNotice('')
    try {
      const result=await supabase.rpc('fleet_request_monthly_closure',{p_closure_id:closure.id,p_station_id:station.id,p_no_activity:check.registered_fueling_count===0})
      if(result.error)throw result.error
      setAcknowledged(false);setNotice('Solicitação formal enviada à Prefeitura; seu horário e a composição foram registrados.');await load()
    } catch(cause){setError(`Não foi possível solicitar a conferência. ${failure(cause)}`)}
    finally{setWorking(false)}
  }

  async function sendMessage(event:FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if(!supabase||!closure||!check)return
    const form=event.currentTarget
    const values=new FormData(form)
    const message=String(values.get('message')||'').trim()
    if(message.length<3)return
    const discrepancyId=String(values.get('discrepancy_id')||'').trim()||null
    const messageType=discrepancyId?'RESPOSTA':'OBSERVACAO'
    setWorking(true);setError('');setNotice('')
    try {
      const result=await supabase.rpc('fleet_send_monthly_closure_message',{p_closure_id:closure.id,p_station_id:station.id,p_discrepancy_id:discrepancyId,p_message_type:messageType,p_message:message})
      if(result.error)throw result.error
      ;form.reset();setNotice('Mensagem registrada e encaminhada à Prefeitura.');await load()
    }catch(cause){setError(`A mensagem não foi enviada. ${failure(cause)}`)}finally{setWorking(false)}
  }

  async function openFile(storagePath:string,title:string,mimeType:string) {
    if(!supabase)return
    const result=await supabase.storage.from('fleet-documents').createSignedUrl(storagePath,300)
    if(result.error||!result.data?.signedUrl){setError('Não foi possível abrir o arquivo privado.');return}
    setPreview({title,url:result.data.signedUrl,mimeType})
  }
  async function loadMore() {
    if(loadingMore||!hasMore)return
    setLoadingMore(true)
    try{await loadFuelingPage(offset,true)}catch(cause){setError(`Não foi possível carregar mais abastecimentos. ${failure(cause)}`)}finally{setLoadingMore(false)}
  }

  const state=check?statusInfo(check.closure_status):['Não disponível','neutral'] as [string,string]
  return <section className="supplier-closure">
    <header className="supplier-closure-heading"><div><span className="supplier-closure-kicker">CONCILIAÇÃO DOCUMENTAL · V2.0</span><h2>Fechamento mensal</h2><p>Acompanhe sua composição, envie os documentos fiscais e responda solicitações. O fluxo não autoriza pagamento.</p></div><label><CalendarCheck size={15}/><input aria-label="Competência" type="month" value={period} onChange={(event)=>changePeriod(event.target.value)}/><button type="button" onClick={refresh} disabled={loading||working}><RefreshCw size={13}/>Atualizar</button></label></header>
    {error&&<div className="supplier-closure-alert error"><CircleAlert size={15}/>{error}</div>}{notice&&<div className="supplier-closure-alert success"><CheckCircle2 size={15}/>{notice}</div>}
    {loading?<div className="supplier-closure-loading"><RefreshCw className="spin" size={19}/>Carregando competência e registros do posto…</div>:<>
      <div className="supplier-closure-hero"><div className="supplier-closure-identity"><span><Store size={18}/></span><div><small>ESTABELECIMENTO AUTENTICADO</small><strong>{station.nome_fantasia_snapshot||station.razao_social_snapshot}</strong><small>CNPJ {station.cnpj_snapshot}</small></div></div><div className="supplier-closure-period-state"><strong>{new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date(`${period}-01T12:00:00-03:00`))}</strong><span className={`supplier-closure-status ${state[1]}`}>{state[0]}</span></div></div>
      {check?<>
        {closure?.reopening_reason&&closure.status==='REABERTO'&&<div className="supplier-closure-alert warning"><AlertTriangle size={15}/><span><strong>Período reaberto pela Prefeitura.</strong> {closure.reopening_reason}</span></div>}
        <div className="supplier-closure-metrics"><article><span>Abastecimentos válidos</span><strong>{Number(check.registered_fueling_count).toLocaleString('pt-BR')}</strong><small>{number(check.registered_liters,3)} L · cancelados excluídos</small></article><article><span>Valor registrado</span><strong>{money(check.registered_amount)}</strong><small>Conferência usa o período efetivo</small></article><article><span>Documentos fiscais</span><strong>{invoices.length}</strong><small>Valor considerado: {money(check.invoiced_amount)}</small></article><article><span>Diferença / pendências</span><strong className={Math.abs(Number(check.divergence_amount||0))>0.009?'danger':''}>{check.divergence_amount==null?'—':money(check.divergence_amount)}</strong><small>{check.documents_pending_count} pendência(s) · {pendingDiscrepancies.length} divergência(s) em aberto</small></article></div>
        {check.review_notes&&<div className="supplier-closure-admin-note"><strong>Orientação municipal</strong><p>{check.review_notes}</p></div>}
        <section className="supplier-closure-panel"><header><div><span>DOCUMENTOS DO MÊS</span><h3>Notas fiscais e demonstrativos</h3><p>PDF ou imagem · limite 10 MB · anexos privados com trilha de auditoria.</p></div><FileCheck2 size={19}/></header>
          <div className="supplier-closure-doc-list">{documents.length?documents.map((document)=>{const label=documentInfo(document.document_status);return <article className="supplier-closure-doc" key={document.id}><div className="supplier-closure-doc-icon"><FileText size={17}/></div><div className="supplier-closure-doc-main"><strong>{document.document_type.replaceAll('_',' ')}{document.document_number?` · Nº ${document.document_number}`:''}{document.document_series?` · série ${document.document_series}`:''}</strong><small>{document.issue_date?`Emissão ${dateOnly(document.issue_date)} · `:''}{money(document.document_amount)}{document.issuer_document?` · CNPJ ${document.issuer_document}`:''}</small><small>{document.file_name} · enviado {dateTime(document.uploaded_at)}{document.reviewed_at?` · revisado ${dateTime(document.reviewed_at)}`:''}{!document.is_current?' · versão substituída':''}</small>{document.rejection_reason&&<p className="supplier-closure-rejection"><strong>Motivo da rejeição:</strong> {document.rejection_reason}</p>}</div><span className={`supplier-closure-status ${label[1]}`}>{label[0]}</span><button type="button" onClick={()=>void openFile(document.storage_path,document.file_name,document.mime_type)}><Eye size={13}/>Visualizar</button></article>}) : <p className="supplier-closure-empty">Nenhum documento fiscal anexado nesta competência.</p>}</div>
          {closure&&<form className="supplier-closure-upload" onSubmit={(event)=>void submitDocument(event)}><div className="supplier-closure-upload-title"><Upload size={15}/><strong>Anexar nota fiscal ou demonstrativo</strong></div><div className="supplier-closure-form-grid"><label>Tipo<select name="document_type" required><option value="NOTA_FISCAL">Nota fiscal</option><option value="DEMONSTRATIVO">Demonstrativo mensal</option><option value="OUTRO">Documento complementar</option></select></label><label>Número<input name="document_number" maxLength={60} placeholder="Número da NF"/></label><label>Série<input name="document_series" maxLength={30} placeholder="Série"/></label><label>Data de emissão<input name="issue_date" type="date" required/></label><label>Valor fiscal (R$)<input name="document_amount" type="number" min="0.01" step="0.01" required/></label><label>CNPJ do emitente<input name="issuer_document" inputMode="numeric" maxLength={18} defaultValue={station.cnpj_snapshot} placeholder="Somente números"/></label><label className="supplier-closure-wide">Chave de acesso (opcional)<input name="access_key" inputMode="numeric" maxLength={50} placeholder="Chave da NF-e"/></label><label className="supplier-closure-wide">Substituir documento (opcional)<select name="replaced_document_id"><option value="">Manter como documento adicional</option>{currentDocs.map((document)=><option key={document.id} value={document.id}>{document.document_type.replaceAll('_',' ')} · {document.document_number||document.file_name} · {fileLabelSafe(document.document_status)}</option>)}</select></label><label className="supplier-closure-wide">Observação<input name="notes" maxLength={1000} placeholder="Informação complementar (opcional)"/></label><label className="supplier-closure-wide supplier-closure-file">Arquivo fiscal<input type="file" accept="application/pdf,image/jpeg,image/png" onChange={(event)=>setFile(event.target.files?.[0]||null)} required/><small>{file?`${file.name} · ${(file.size/1024/1024).toLocaleString('pt-BR',{maximumFractionDigits:2})} MB`:'Selecione PDF, JPG ou PNG (máximo 10 MB).'}</small></label></div><button className="supplier-closure-submit" type="submit" disabled={working||!file||['CONFERIDO','FECHADO'].includes(check.closure_status)}><Upload size={14}/>{working?'Enviando…':'Enviar documento fiscal'}</button></form>}
        </section>

        <section className="supplier-closure-panel"><header><div><span>SOLICITAÇÃO FORMAL</span><h3>Enviar fechamento à Prefeitura</h3><p>O posto solicita conferência; a conclusão pertence exclusivamente ao gestor municipal.</p></div><Send size={18}/></header><div className="supplier-closure-request"><div><span className="supplier-closure-status">Situação do posto: {statusInfo(check.closure_status)[0]}</span><p>{check.registered_fueling_count===0?'Sem movimentação na competência? Confirme formalmente abaixo.':'A solicitação será habilitada após anexar ao menos uma nota fiscal ou demonstrativo fiscal atual.'}</p>{check.requested_at&&<small>Última solicitação enviada em {dateTime(check.requested_at)}.</small>}</div><label className="supplier-closure-ack"><input type="checkbox" checked={acknowledged} onChange={(event)=>setAcknowledged(event.target.checked)}/>{check.registered_fueling_count===0?'Confirmo que não houve abastecimentos nesta competência.':'Confirmo que os documentos fiscais da competência foram enviados e estão corretos.'}</label><button type="button" className="supplier-closure-submit" onClick={()=>void requestClosure()} disabled={!canRequest||working}><Send size={14}/>{working?'Enviando…':check.registered_fueling_count===0?'Confirmar ausência de movimentação':'Solicitar conferência municipal'}</button></div></section>

        <section className="supplier-closure-panel"><header><div><span>TRATATIVAS</span><h3>Divergências e mensagens</h3><p>Responda pedidos de esclarecimento vinculados à competência; o diálogo fica visível para seu estabelecimento e para a Prefeitura.</p></div><MessageSquareText size={18}/></header>{pendingDiscrepancies.length>0&&<div className="supplier-closure-discrepancy-list">{pendingDiscrepancies.map((item)=><article key={item.id}><div><strong>{item.discrepancy_type.replaceAll('_',' ')} · {item.severity}</strong><span className={`supplier-closure-status ${item.status==='RESPONDIDA'?'review':'warning'}`}>{item.status.replaceAll('_',' ')}</span></div><p>{item.description}</p><small>{item.amount_involved!=null?`Valor ${money(item.amount_involved)} · `:''}registrada em {dateTime(item.identified_at)}{item.response_deadline?` · prazo ${dateTime(item.response_deadline)}`:''}</small>{item.resolution_notes&&<small>Decisão municipal: {item.resolution_notes}</small>}</article>)}</div>}{messages.map((message)=><article className="supplier-closure-message" key={message.id}><span>{message.sender_scope==='MUNICIPAL'?'Prefeitura':'Seu estabelecimento'} · {message.message_type.replaceAll('_',' ')}</span><p>{message.message}</p><small>{dateTime(message.created_at)}</small></article>)}<form className="supplier-closure-reply" onSubmit={(event)=>void sendMessage(event)}><label>Resposta vinculada a<select name="discrepancy_id" value={selectedDiscrepancy} onChange={(event)=>setSelectedDiscrepancy(event.target.value)}><option value="">Mensagem geral</option>{pendingDiscrepancies.map((item)=><option key={item.id} value={item.id}>{item.discrepancy_type.replaceAll('_',' ')}</option>)}</select></label><label>Mensagem<textarea name="message" rows={3} required minLength={3} maxLength={5000} placeholder="Informe a resposta ou o complemento solicitado."/></label><button type="submit" className="supplier-closure-submit" disabled={working||['CONFERIDO','FECHADO'].includes(check.closure_status)}><MessageSquareText size={14}/>Enviar resposta</button></form></section>

        <section className="supplier-closure-panel"><header><div><span>REGISTROS E VERSÕES</span><h3>Abastecimentos e histórico</h3><p>Os abastecimentos cancelados permanecem no histórico e não integram o total líquido.</p></div><History size={18}/></header><div className="supplier-closure-fueling-table"><table><thead><tr><th>Data efetiva</th><th>Veículo / combustível</th><th>Litros</th><th>Valor</th><th>Recibo</th><th>Situação</th><th>Comprovante</th></tr></thead><tbody>{fuelings.map((fueling)=>{const proof=[...(fueling.documents||[])].filter((item)=>item.is_current).sort((a,b)=>Date.parse(b.uploaded_at)-Date.parse(a.uploaded_at))[0];return <tr key={fueling.id}><td>{dateTime(fueling.performed_at)}</td><td><strong>{fueling.vehicles?.placa||'—'}</strong><small>{fueling.fuel_type?.nome||'—'}</small></td><td>{number(fueling.liters,3)} L</td><td>{money(fueling.total_amount)}</td><td>{fueling.station_receipt_number||'—'}</td><td>{fueling.status.replaceAll('_',' ')}</td><td>{proof?<button type="button" onClick={()=>void openFile(proof.storage_path,proof.file_name,proof.mime_type)}><Eye size={13}/>Abrir</button>:<span>Ausente</span>}</td></tr>})}</tbody></table>{fuelings.length===0&&<p className="supplier-closure-empty">Nenhum abastecimento na competência.</p>}{hasMore&&<button className="supplier-closure-more" type="button" onClick={()=>void loadMore()} disabled={loadingMore}>{loadingMore?'Carregando…':'Carregar mais 500 abastecimentos'}<RefreshCw size={13}/></button>}<small className="supplier-closure-count">{fuelings.length} exibido(s) de {fuelingCount} no período.</small></div><div className="supplier-closure-history-grid"><div><h4>Snapshots preservados</h4>{versions.length?versions.slice(0,10).map((version)=><article key={version.id}><strong>Versão {version.version_number} · {dateTime(version.created_at)}</strong><small>{version.total_transactions} abastecimento(s) · {number(version.total_liters,3)} L · {money(version.total_amount)} · fiscal {money(version.invoice_amount)}{version.difference_amount!=null?` · diferença ${money(version.difference_amount)}`:''}</small>{version.reason&&<small>{version.reason}</small>}</article>):<p className="supplier-closure-empty">Ainda não há snapshot de conferência.</p>}</div><div><h4>Histórico de auditoria</h4>{history.length?history.slice(0,15).map((event)=><article key={event.id}><strong>{event.action_type==='INSERT'?'Registro criado':event.action_type==='UPDATE'?'Registro atualizado':event.action_type.replaceAll('_',' ')}</strong><small>{event.entity_table.replace('fleet_monthly_closure_','').replaceAll('_',' ')} · {event.new_status?`${event.previous_status||'—'} → ${event.new_status} · `:''}{dateTime(event.performed_at)}</small>{event.reason&&<small>{event.reason}</small>}</article>):<p className="supplier-closure-empty">Sem eventos de auditoria registrados.</p>}</div></div></section>
      </>:<div className="supplier-closure-alert warning"><AlertTriangle size={16}/><span>O fechamento da competência não está disponível para este posto. Verifique o credenciamento ou contate a Prefeitura.</span></div>}
    </>}
    {preview&&<div className="supplier-closure-preview-backdrop" role="presentation" onMouseDown={(event)=>{if(event.target===event.currentTarget)setPreview(null)}}><section role="dialog" aria-modal="true" aria-labelledby="supplier-monthly-preview-title"><header><div><small>ARQUIVO PRIVADO · LINK TEMPORÁRIO</small><h3 id="supplier-monthly-preview-title">{preview.title}</h3></div><button type="button" onClick={()=>setPreview(null)} aria-label="Fechar"><X size={17}/></button></header><div className="supplier-closure-preview-body">{preview.mimeType.startsWith('image/')?<img src={preview.url} alt={preview.title}/>:<iframe src={preview.url} title={`Visualização de ${preview.title}`}/>}</div><footer>O link assinado expira em 5 minutos.</footer></section></div>}
  </section>
}

function fileLabelSafe(value:string){return documentInfo(value)[0]}
