import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BadgeCheck, ChevronLeft, ChevronRight, Filter, History, Plus, RotateCcw, Search, ShieldCheck, Truck, X, Pencil } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { FleetVehicleDetails, type Vehicle } from './FleetVehicleDetails'
import './FleetVehiclesView.css'

type Option = { id: string; nome: string; sigla?: string | null; ativo?: boolean; unidade_medida?: string; required_cnh_category?: string | null }
type FormState = { placa:string; marca:string; modelo:string; ano_fabricacao:string; ano_modelo:string; chassi:string; renavam:string; category_id:string; fuel_type_id:string; tank_capacity_l:string; responsible_unit_id:string; operational_status:string; current_odometer_km:string; acquisition_date:string; acquisition_value:string; ownership_type:string; notes:string; change_reason:string }
const pageSize = 50
const statuses = ['ATIVO','INATIVO','EM_MANUTENCAO','BAIXADO','CEDIDO','ALIENADO']
const statusLabel: Record<string,string> = { ATIVO:'Ativo', INATIVO:'Inativo', EM_MANUTENCAO:'Em manutenção', BAIXADO:'Baixado', CEDIDO:'Cedido', ALIENADO:'Alienado' }
const emptyForm = ():FormState => ({ placa:'', marca:'', modelo:'', ano_fabricacao:'', ano_modelo:'', chassi:'', renavam:'', category_id:'', fuel_type_id:'', tank_capacity_l:'60', responsible_unit_id:'', operational_status:'ATIVO', current_odometer_km:'', acquisition_date:'', acquisition_value:'', ownership_type:'', notes:'', change_reason:'' })
const normalizePlate = (value:string) => value.toUpperCase().replace(/[^A-Z0-9]/g,'')

export function FleetVehiclesView() {
  const [vehicles,setVehicles] = useState<Vehicle[]>([])
  const [units,setUnits] = useState<Option[]>([])
  const [fuels,setFuels] = useState<Option[]>([])
  const [categories,setCategories] = useState<Option[]>([])
  const [blockedIds,setBlockedIds] = useState<Set<string>>(new Set())
  const [canManage,setCanManage] = useState(false)
  const [loading,setLoading] = useState(true)
  const [saving,setSaving] = useState(false)
  const [error,setError] = useState('')
  const [notice,setNotice] = useState('')
  const [total,setTotal] = useState(0)
  const [page,setPage] = useState(0)
  const [search,setSearch] = useState('')
  const [unitFilter,setUnitFilter] = useState('')
  const [fuelFilter,setFuelFilter] = useState('')
  const [categoryFilter,setCategoryFilter] = useState('')
  const [statusFilter,setStatusFilter] = useState('')
  const [sort,setSort] = useState('placa')
  const [ascending,setAscending] = useState(true)
  const [showForm,setShowForm] = useState(false)
  const [editing,setEditing] = useState<Vehicle|null>(null)
  const [form,setForm] = useState<FormState>(emptyForm())
  const [formError,setFormError] = useState('')
  const [selected,setSelected] = useState<Vehicle|null>(null)
  const [showCategories,setShowCategories] = useState(false)
  const [newCategory,setNewCategory] = useState('')
  const [newCategoryCnh,setNewCategoryCnh] = useState('')
  const requestRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadOptions = useCallback(async () => {
    if (!supabase) return
    const [unitResult,fuelResult,categoryResult,permissionResult] = await Promise.all([
      supabase.from('unidades_organizacionais').select('id,nome,sigla,ativo').order('nome').limit(500),
      supabase.from('fleet_fuel_types').select('id,nome,sigla,ativo,unidade_medida').order('nome').limit(500),
      supabase.from('fleet_vehicle_categories').select('id,nome,ativo,required_cnh_category').order('nome').limit(500),
      supabase.rpc('fleet_is_manager'),
    ])
    if (!unitResult.error) setUnits((unitResult.data || []) as Option[])
    if (!fuelResult.error) setFuels((fuelResult.data || []) as Option[])
    if (!categoryResult.error) setCategories((categoryResult.data || []) as Option[])
    setCanManage(Boolean(permissionResult.data))
  },[])

  const loadVehicles = useCallback(async () => {
    if (!supabase) { setError('O serviço de dados está indisponível.'); setLoading(false); return }
    const id = ++requestRef.current; setLoading(true); setError('')
    try {
      const { data: municipality, error: municipalityError } = await supabase.rpc('fleet_current_municipio_id')
      if (municipalityError || !municipality) throw new Error('Não foi possível identificar o município autenticado.')
      let query = supabase.from('fleet_vehicles').select('id,municipio_id,placa,marca,modelo,ano_fabricacao,ano_modelo,chassi,renavam,category_id,fuel_type_id,tank_capacity_l,responsible_unit_id,operational_status,current_odometer_km,acquisition_date,acquisition_value,ownership_type,notes,created_at,updated_at',{count:'exact'}).eq('municipio_id',municipality)
      if (unitFilter) query = query.eq('responsible_unit_id',unitFilter)
      if (fuelFilter) query = query.eq('fuel_type_id',fuelFilter)
      if (categoryFilter) query = query.eq('category_id',categoryFilter)
      if (statusFilter) query = query.eq('operational_status',statusFilter)
      const term = search.trim().replace(/[^\p{L}\p{N}\s-]/gu,'').slice(0,80)
      if (term) {
        const pattern = `*${term}*`
        const matchingUnits = units.filter((unit) => `${unit.nome} ${unit.sigla || ''}`.toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR'))).map((unit) => unit.id)
        const unitExpr = matchingUnits.length ? `,responsible_unit_id.in.(${matchingUnits.join(',')})` : ''
        query = query.or(`placa.ilike.${pattern},marca.ilike.${pattern},modelo.ilike.${pattern},chassi.ilike.${pattern},renavam.ilike.${pattern}${unitExpr}`)
      }
      const column = ['placa','marca','modelo','created_at','operational_status'].includes(sort) ? sort : 'placa'
      const { data,error: queryError,count } = await query.order(column,{ascending}).order('id',{ascending:true}).range(page*pageSize,(page+1)*pageSize-1)
      if (queryError) throw queryError
      if (requestRef.current !== id) return
      const rows = (data || []) as Vehicle[]
      setVehicles(rows); setTotal(count || 0)
      if (rows.length) {
        const { data: restrictions } = await supabase.from('fleet_vehicle_restrictions').select('vehicle_id,starts_at,ends_at,active').eq('municipio_id',municipality).eq('active',true).in('vehicle_id',rows.map((row) => row.id))
        if (requestRef.current !== id) return
        const now = Date.now(); setBlockedIds(new Set((restrictions || []).filter((item: {vehicle_id:string;starts_at:string;ends_at:string|null;active:boolean}) => item.active && Date.parse(item.starts_at)<=now && (!item.ends_at || Date.parse(item.ends_at)>now)).map((item: {vehicle_id:string}) => item.vehicle_id)))
      } else setBlockedIds(new Set())
    } catch (cause) {
      if (requestRef.current !== id) return
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os veículos.')
    } finally { if (requestRef.current === id) setLoading(false) }
  },[page,search,unitFilter,fuelFilter,categoryFilter,statusFilter,sort,ascending,units])

  useEffect(() => { void loadOptions() },[loadOptions])
  useEffect(() => { const timer = window.setTimeout(() => { void loadVehicles() },250); return () => window.clearTimeout(timer) },[loadVehicles])
  useEffect(() => { if (showForm) inputRef.current?.focus() },[showForm])

  const pageCount = Math.max(1,Math.ceil(total/pageSize))
  const optionName = (id:string|null,options:Option[]) => options.find((item) => item.id===id)?.nome || 'Não informado'
  const activeFilterCount = Number(Boolean(search.trim()))+Number(Boolean(unitFilter))+Number(Boolean(fuelFilter))+Number(Boolean(categoryFilter))+Number(Boolean(statusFilter))
  function clearFilters() { setSearch('');setUnitFilter('');setFuelFilter('');setCategoryFilter('');setStatusFilter('');setPage(0) }
  function openNew() { setEditing(null);setForm(emptyForm());setFormError('');setShowForm(true) }
  function openEdit(vehicle:Vehicle) { setEditing(vehicle);setForm({ placa:vehicle.placa||'',marca:vehicle.marca||'',modelo:vehicle.modelo||'',ano_fabricacao:vehicle.ano_fabricacao?.toString()||'',ano_modelo:vehicle.ano_modelo?.toString()||'',chassi:vehicle.chassi||'',renavam:vehicle.renavam||'',category_id:vehicle.category_id||'',fuel_type_id:vehicle.fuel_type_id||'',tank_capacity_l:String(vehicle.tank_capacity_l||''),responsible_unit_id:vehicle.responsible_unit_id||'',operational_status:vehicle.operational_status||'ATIVO',current_odometer_km:vehicle.current_odometer_km?.toString()||'',acquisition_date:vehicle.acquisition_date||'',acquisition_value:vehicle.acquisition_value?.toString()||'',ownership_type:vehicle.ownership_type||'',notes:vehicle.notes||'',change_reason:''});setFormError('');setShowForm(true) }
  function update<K extends keyof FormState>(key:K,value:FormState[K]) { setForm((current) => ({...current,[key]:value}));setFormError('') }

  async function saveVehicle(event:FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || saving) return
    const plate = normalizePlate(form.placa)
    const originalPlate = editing ? normalizePlate(editing.placa) : ''
    const plateChanged = !editing || plate !== originalPlate
    if (plateChanged && !/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate)) { setFormError('Informe uma placa válida no padrão antigo ou Mercosul (ex.: ABC1D23).');return }
    const renavam = form.renavam.replace(/\D/g,'')
    const oldRenavam = (editing?.renavam||'').replace(/\D/g,'')
    if (form.renavam.trim() && (!editing || renavam!==oldRenavam) && !/^\d{11}$/.test(renavam)) { setFormError('O RENAVAM deve conter 11 dígitos.');return }
    if (!form.category_id || !form.fuel_type_id || !form.responsible_unit_id) { setFormError('Selecione categoria, combustível compatível e secretaria responsável.');return }
    const tank = Number(form.tank_capacity_l)
    if (!Number.isFinite(tank)||tank<=0) { setFormError('A capacidade do tanque deve ser maior que zero.');return }
    const changedTransfer = Boolean(editing && editing.responsible_unit_id!==form.responsible_unit_id)
    const changedStatus = Boolean(editing && editing.operational_status!==form.operational_status)
    if (editing && (changedTransfer||changedStatus) && form.change_reason.trim().length<5) { setFormError('Informe o motivo da alteração de situação ou lotação (mínimo 5 caracteres).');return }
    setSaving(true);setFormError('')
    try {
      const { data:municipio,error:municipioError } = await supabase.rpc('fleet_current_municipio_id')
      const { data:usuario } = await supabase.rpc('fleet_current_usuario_id')
      if (municipioError||!municipio) throw new Error('Não foi possível identificar o município autenticado.')
      const payload = { placa:editing && !plateChanged ? editing.placa : plate, marca:form.marca.trim()||null, modelo:form.modelo.trim()||null, ano_fabricacao:form.ano_fabricacao?Number(form.ano_fabricacao):null, ano_modelo:form.ano_modelo?Number(form.ano_modelo):null, chassi:form.chassi.trim()||null, renavam:form.renavam.trim()?(editing && renavam===oldRenavam?editing.renavam:renavam):null, category_id:form.category_id, fuel_type_id:form.fuel_type_id, tank_capacity_l:tank, responsible_unit_id:form.responsible_unit_id, operational_status:form.operational_status, current_odometer_km:form.current_odometer_km?Number(form.current_odometer_km):null, acquisition_date:form.acquisition_date||null, acquisition_value:form.acquisition_value?Number(form.acquisition_value):null, ownership_type:form.ownership_type||null, notes:form.notes.trim()||null }
      if (editing) {
        const {error:saveError} = await supabase.rpc('fleet_update_vehicle',{p_vehicle_id:editing.id,p_payload:payload,p_reason:form.change_reason.trim()||'Atualização do cadastro do veículo.'})
        if (saveError) throw saveError
      } else {
        const {error:saveError} = await supabase.from('fleet_vehicles').insert({...payload,municipio_id:municipio,created_by:usuario})
        if (saveError) throw saveError
      }
      setShowForm(false);setEditing(null);setForm(emptyForm());setNotice(editing?'Veículo atualizado e histórico registrado.':'Veículo cadastrado.');setPage(0);await loadVehicles()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message.toLocaleLowerCase('pt-BR') : ''
      setFormError(message.includes('23505')||message.includes('duplicate')?'Já existe outro veículo operacional com essa placa, chassi ou RENAVAM.':message.includes('placa')?'A placa é inválida; use letras e números no padrão nacional.':message.includes('renavam')?'O RENAVAM informado deve ter 11 dígitos.':cause instanceof Error?cause.message:'Não foi possível salvar o veículo. Verifique os dados e permissões.')
    } finally { setSaving(false) }
  }

  async function saveCategory(event:FormEvent<HTMLFormElement>) { event.preventDefault();if(!supabase||!canManage)return;const name=newCategory.trim();if(name.length<2)return;const {data:municipio}=await supabase.rpc('fleet_current_municipio_id');const {data:usuario}=await supabase.rpc('fleet_current_usuario_id');const {error:saveError}=await supabase.from('fleet_vehicle_categories').insert({municipio_id:municipio,nome:name,created_by:usuario,required_cnh_category:newCategoryCnh||null});if(saveError){setError(saveError.code==='23505'?'Essa categoria já existe.':'Não foi possível incluir a categoria.');return}setNewCategory('');setNewCategoryCnh('');await loadOptions();setNotice('Categoria adicionada.') }

  async function updateCategoryRequirement(categoryId:string,required:string) { if(!supabase||!canManage)return;const {error:saveError}=await supabase.from('fleet_vehicle_categories').update({required_cnh_category:required||null,updated_at:new Date().toISOString()}).eq('id',categoryId);if(saveError){setError('Não foi possível atualizar a categoria mínima da CNH.');return}await loadOptions();setNotice('Categoria mínima de CNH atualizada. A validação passa a valer para novas operações.') }

  return <section className="fleet-section fleet-page-section fleet-vehicles-view">
    <div className="fleet-page-heading"><div><span className="fleet-kicker">CADASTRO DA FROTA</span><h2>Veículos</h2><p>Cadastro, situação, lotação, autorizações, documentos e histórico da frota.</p></div><div className="fv-heading-actions">{canManage&&<><button className="fleet-secondary-button" onClick={()=>setShowCategories(true)}><Filter size={14}/> Categorias</button><button className="fleet-primary-button" onClick={openNew}><Plus size={15}/> Novo veículo</button></>}</div></div>
    {notice&&<div className="fv-message success" role="status"><BadgeCheck size={15}/>{notice}<button onClick={()=>setNotice('')} aria-label="Fechar"><X size={14}/></button></div>}{error&&<div className="fv-message error" role="alert">{error}<button onClick={()=>setError('')} aria-label="Fechar"><X size={14}/></button></div>}
    <div className="fv-filter-panel"><div className="fv-filter-heading"><strong><Filter size={14}/> Filtros</strong><span>{loading?'Carregando…':`${total.toLocaleString('pt-BR')} veículo(s)`}</span><button type="button" onClick={clearFilters} disabled={!activeFilterCount}><RotateCcw size={13}/> Limpar</button></div><div className="fv-filter-grid">
      <label className="fv-search">Pesquisar veículo ou secretaria<div><Search size={14}/><input type="search" value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder="Placa, marca, modelo, chassi, RENAVAM ou secretaria" /></div></label>
      <label>Secretaria<select value={unitFilter} onChange={e=>{setUnitFilter(e.target.value);setPage(0)}}><option value="">Todas</option>{units.map(o=><option key={o.id} value={o.id}>{o.nome}{o.sigla?` (${o.sigla})`:''}</option>)}</select></label>
      <label>Combustível<select value={fuelFilter} onChange={e=>{setFuelFilter(e.target.value);setPage(0)}}><option value="">Todos</option>{fuels.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>
      <label>Categoria<select value={categoryFilter} onChange={e=>{setCategoryFilter(e.target.value);setPage(0)}}><option value="">Todas</option>{categories.map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>
      <label>Situação<select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(0)}}><option value="">Todas</option>{statuses.map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select></label>
      <label>Ordenar por<select value={sort} onChange={e=>{setSort(e.target.value);setPage(0)}}><option value="placa">Placa</option><option value="marca">Marca</option><option value="modelo">Modelo</option><option value="created_at">Data de cadastro</option><option value="operational_status">Situação</option></select></label>
      <button className="fv-sort-toggle" onClick={()=>setAscending(!ascending)}>{ascending?'Crescente':'Decrescente'}</button>
    </div></div>
    <div className="fleet-table-panel"><table className="fleet-table fv-table"><thead><tr><th>Veículo</th><th>Placa</th><th>Categoria</th><th>Secretaria</th><th>Combustível</th><th>Tanque</th><th>Hodômetro</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{loading?<tr><td colSpan={9} className="fv-state">Carregando veículos…</td></tr>:vehicles.length?vehicles.map(v=><tr key={v.id}><td><strong>{[v.marca,v.modelo].filter(Boolean).join(' ')||'Veículo sem identificação'}</strong><small>{v.ano_modelo||v.ano_fabricacao||'Ano não informado'} · ID {v.id.slice(0,8)}</small></td><td className="fleet-plate">{v.placa}</td><td>{optionName(v.category_id,categories)}</td><td>{optionName(v.responsible_unit_id,units)}</td><td>{optionName(v.fuel_type_id,fuels)}</td><td>{Number(v.tank_capacity_l).toLocaleString('pt-BR')} L</td><td>{v.current_odometer_km==null?'—':`${Number(v.current_odometer_km).toLocaleString('pt-BR')} km`}</td><td><span className={`fv-status ${v.operational_status==='ATIVO'&&!blockedIds.has(v.id)?'ok':['INATIVO','BAIXADO','ALIENADO'].includes(v.operational_status)?'bad':'warn'}`}>{blockedIds.has(v.id)?'Bloqueado':statusLabel[v.operational_status]||v.operational_status}</span></td><td><div className="fv-actions"><button className="fleet-row-action" aria-label={`Ficha de ${v.placa}`} onClick={()=>setSelected(v)}><History size={15}/></button>{canManage&&<button className="fleet-row-action" aria-label={`Editar veículo ${v.placa}`} onClick={()=>openEdit(v)}><Pencil size={15}/></button>}</div></td></tr>):<tr><td colSpan={9} className="fv-state">{total?'Nenhum veículo corresponde aos filtros.':'Nenhum veículo cadastrado.'}</td></tr>}</tbody></table></div>
    <div className="fv-pagination"><span>Página {page+1} de {pageCount} · {vehicles.length} exibido(s)</span><div><button className="fleet-secondary-button" onClick={()=>setPage(Math.max(0,page-1))} disabled={page===0||loading}><ChevronLeft size={15}/> Anterior</button><button className="fleet-secondary-button" onClick={()=>setPage(Math.min(pageCount-1,page+1))} disabled={page+1>=pageCount||loading}>Próxima <ChevronRight size={15}/></button></div></div>
    {showForm&&<div className="fleet-modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&!saving&&setShowForm(false)}><form className="fleet-modal fv-modal" onSubmit={saveVehicle}><div className="fleet-modal-heading"><div><span className="fleet-kicker">CADASTRO OFICIAL</span><h2>{editing?'Editar veículo':'Novo veículo'}</h2></div><button type="button" className="fleet-close" onClick={()=>setShowForm(false)} aria-label="Fechar"><X size={18}/></button></div><p className="fleet-modal-note"><ShieldCheck size={15}/> Alterações registradas no histórico; veículos inativos e baixados permanecem consultáveis.</p>
      <div className="fleet-form-section-title"><Truck size={15}/> Identificação</div><div className="fleet-form-grid"><label>Placa *<input ref={inputRef} required maxLength={12} value={form.placa} onChange={e=>update('placa',e.target.value)} placeholder="ABC1D23"/><small>Será salva sem espaços/hífens. Aceita padrão antigo ou Mercosul.</small></label><label>Categoria *<select required value={form.category_id} onChange={e=>update('category_id',e.target.value)}><option value="">Selecione</option>{categories.filter(o=>o.ativo!==false||o.id===editing?.category_id).map(o=><option key={o.id} value={o.id}>{o.nome}{o.ativo===false?' (inativa)':''}</option>)}</select></label><label>Marca<input value={form.marca} onChange={e=>update('marca',e.target.value)}/></label><label>Modelo<input value={form.modelo} onChange={e=>update('modelo',e.target.value)}/></label><label>Ano de fabricação<input type="number" min="1900" max="2200" value={form.ano_fabricacao} onChange={e=>update('ano_fabricacao',e.target.value)}/></label><label>Ano do modelo<input type="number" min="1900" max="2200" value={form.ano_modelo} onChange={e=>update('ano_modelo',e.target.value)}/></label><label>Chassi<input maxLength={30} value={form.chassi} onChange={e=>update('chassi',e.target.value)}/></label><label>RENAVAM<input maxLength={20} value={form.renavam} onChange={e=>update('renavam',e.target.value)} inputMode="numeric"/></label></div>
      <div className="fleet-form-section-title"><Truck size={15}/> Operação e patrimônio</div><div className="fleet-form-grid"><label>Combustível compatível *<select required value={form.fuel_type_id} onChange={e=>update('fuel_type_id',e.target.value)}><option value="">Selecione</option>{fuels.filter(o=>o.ativo!==false||o.id===editing?.fuel_type_id).map(o=><option key={o.id} value={o.id}>{o.nome}{o.ativo===false?' (inativo)':''}</option>)}</select></label><label>Secretaria responsável *<select required value={form.responsible_unit_id} onChange={e=>update('responsible_unit_id',e.target.value)}><option value="">Selecione</option>{units.filter(o=>o.ativo!==false||o.id===editing?.responsible_unit_id).map(o=><option key={o.id} value={o.id}>{o.nome}</option>)}</select></label><label>Capacidade do tanque (L) *<input required type="number" min="1" step="0.01" value={form.tank_capacity_l} onChange={e=>update('tank_capacity_l',e.target.value)}/></label><label>Hodômetro atual (km)<input type="number" min="0" step="0.01" value={form.current_odometer_km} onChange={e=>update('current_odometer_km',e.target.value)}/></label><label>Situação operacional<select value={form.operational_status} onChange={e=>update('operational_status',e.target.value)}>{statuses.map(s=><option key={s} value={s}>{statusLabel[s]}</option>)}</select></label><label>Tipo de propriedade<select value={form.ownership_type} onChange={e=>update('ownership_type',e.target.value)}><option value="">Não informado</option>{['PRÓPRIO','LOCADO','CEDIDO','CONVENIADO','OUTRO'].map(s=><option key={s} value={s}>{s}</option>)}</select></label><label>Data de aquisição<input type="date" value={form.acquisition_date} onChange={e=>update('acquisition_date',e.target.value)}/></label><label>Valor de aquisição (R$)<input type="number" min="0" step="0.01" value={form.acquisition_value} onChange={e=>update('acquisition_value',e.target.value)}/></label><label className="fleet-form-wide">Observações<textarea value={form.notes} onChange={e=>update('notes',e.target.value)} rows={3}/></label>{editing&&<label className="fleet-form-wide">Motivo da alteração<textarea value={form.change_reason} onChange={e=>update('change_reason',e.target.value)} rows={2} placeholder="Obrigatório ao alterar situação ou secretaria"/></label>}</div>
      {formError&&<p className="fv-inline-error" role="alert">{formError}</p>}<div className="fleet-modal-actions"><button type="button" className="fleet-secondary-button" onClick={()=>setShowForm(false)} disabled={saving}>Cancelar</button><button type="submit" className="fleet-primary-button" disabled={saving}>{saving?'Salvando…':editing?'Salvar alterações':'Cadastrar veículo'}</button></div></form></div>}
    {showCategories&&<div className="fleet-modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&setShowCategories(false)}><section className="fleet-modal fv-category-modal"><div className="fleet-modal-heading"><div><span className="fleet-kicker">CONFIGURAÇÃO DA FROTA</span><h2>Categorias de veículo</h2></div><button className="fleet-close" onClick={()=>setShowCategories(false)} aria-label="Fechar"><X size={18}/></button></div><form className="fv-category-form" onSubmit={saveCategory}><label>Nova categoria<input value={newCategory} onChange={e=>setNewCategory(e.target.value)} maxLength={80} placeholder="Ex.: Automóvel, Caminhão, Ambulância" required/></label><label>CNH mínima exigida<select value={newCategoryCnh} onChange={e=>setNewCategoryCnh(e.target.value)}><option value="">Não configurada</option>{['A','B','C','D','E'].map(value=><option key={value} value={value}>{value}</option>)}</select></label><button className="fleet-primary-button" type="submit"><Plus size={14}/> Adicionar</button></form><div className="fv-category-list">{categories.map(c=><div key={c.id}><span>{c.nome}<small>{c.ativo===false?'Inativa':'Ativa'}</small></span><label>CNH mínima<select aria-label={`CNH mínima para ${c.nome}`} value={c.required_cnh_category||''} onChange={e=>void updateCategoryRequirement(c.id,e.target.value)}><option value="">Não configurada</option>{['A','B','C','D','E'].map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>)}</div></section></div>}
    {selected&&<FleetVehicleDetails vehicle={selected} units={units} fuels={fuels} categories={categories} canManage={canManage} blocked={blockedIds.has(selected.id)} onClose={()=>setSelected(null)} onChanged={async()=>{await loadVehicles();await loadOptions()}}/>}
  </section>
}
