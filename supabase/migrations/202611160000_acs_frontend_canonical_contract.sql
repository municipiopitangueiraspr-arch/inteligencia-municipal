BEGIN;

-- As tabelas físicas de compatibilidade permanecem, mas a identidade da pessoa
-- e o envelope da visita passam a ser os objetos canônicos do ecossistema.
CREATE OR REPLACE FUNCTION public.census_foundation_my_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,app_private AS $$
DECLARE v_user integer; v_prof jsonb; v_assign jsonb; v_tasks jsonb;
BEGIN
  SELECT id INTO v_user FROM public.usuarios WHERE uuid=auth.uid() AND ativo IS TRUE;
  SELECT jsonb_build_object('id',p.id,'user_id',p.user_id,'municipality_id',p.municipality_id,'full_name',p.full_name,'professional_category',p.professional_category,'active',p.active)
    INTO v_prof FROM public.health_professionals p WHERE p.user_id=v_user AND p.active IS TRUE LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'role_id',a.role_id,'municipality_id',a.municipality_id,'establishment_id',a.establishment_id,'team_id',a.team_id,'microarea_id',a.microarea_id,'valid_from',a.valid_from,'valid_until',a.valid_until) ORDER BY a.valid_from DESC),'[]'::jsonb)
    INTO v_assign FROM public.health_professional_assignments a JOIN public.health_professionals p ON p.id=a.professional_id
   WHERE p.user_id=v_user AND p.active IS TRUE AND a.active IS TRUE AND a.role_id='ACS'
     AND current_date BETWEEN a.valid_from AND coalesce(a.valid_until,current_date);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'due_date',t.due_date,'priority',t.priority,'status',t.status,'task_type',t.task_type,'instructions',t.instructions,
    'household_id',t.household_id,'family_id',t.family_id,'pessoa_id',t.pessoa_id,
    'family_reference',f.family_reference,'citizen_name',p.nome_completo,'reason_code',r.code,'reason_label',r.label,
    'address_line',h.address_line,'address_number',h.address_number,'address_complement',h.address_complement,
    'neighborhood',h.neighborhood,'locality',h.locality,'postal_code',h.postal_code,
    'latitude',h.latitude,'longitude',h.longitude) ORDER BY t.status,t.due_date,t.priority DESC),'[]'::jsonb)
    INTO v_tasks
    FROM public.census_agenda_tasks t
    LEFT JOIN public.census_households h ON h.id=t.household_id
    LEFT JOIN public.census_families f ON f.id=t.family_id
    LEFT JOIN public.pessoas p ON p.id=t.pessoa_id
    LEFT JOIN public.census_visit_reason_catalog r ON r.id=t.reason_id
   WHERE (t.professional_id=(v_prof->>'id')::uuid OR (t.professional_id IS NULL AND t.household_id IS NOT NULL AND public.census_user_can_access_household(t.household_id)))
     AND t.status IN('PLANNED','IN_PROGRESS');
  RETURN jsonb_build_object('status',CASE WHEN v_prof IS NULL THEN 'pending-assignment' ELSE 'ready' END,'professional',v_prof,'assignments',v_assign,'tasks',v_tasks);
END; $$;

DROP FUNCTION IF EXISTS public.census_register_fvd(uuid,uuid,uuid,uuid,date,text[],text,text,text,text,date);
CREATE OR REPLACE FUNCTION public.census_register_fvd(
 p_household_id uuid,p_family_id uuid,p_pessoa_id uuid,p_task_id uuid,p_visit_date date,p_reason_codes text[],p_outcome_code text,p_notes text,p_guidance text,p_referral text,p_return_date date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,app_private AS $$
DECLARE v_user integer; v_prof public.health_professionals%ROWTYPE; v_task public.census_agenda_tasks%ROWTYPE; v_out public.census_visit_outcome_catalog%ROWTYPE;
  v_id uuid; v_status text; v_municipality uuid; v_establishment uuid; v_team uuid; v_microarea uuid; v_snapshot jsonb;
BEGIN
  SELECT id INTO v_user FROM public.usuarios WHERE uuid=auth.uid() AND ativo IS TRUE;
  SELECT p.* INTO v_prof FROM public.health_professionals p WHERE p.user_id=v_user AND p.active IS TRUE LIMIT 1;
  IF v_prof.id IS NULL THEN RAISE EXCEPTION 'Usuário sem vínculo de profissional de saúde ativo.' USING ERRCODE='42501'; END IF;
  IF NOT public.census_user_can_access_household(p_household_id) THEN RAISE EXCEPTION 'O domicílio está fora do escopo territorial do profissional.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pessoas p WHERE p.id=p_pessoa_id AND p.situacao_cadastral='ativa') THEN RAISE EXCEPTION 'Pessoa canônica não encontrada ou inativa.' USING ERRCODE='23514'; END IF;
  SELECT a.municipality_id,a.establishment_id,a.team_id,a.microarea_id INTO v_municipality,v_establishment,v_team,v_microarea
    FROM public.health_professional_assignments a WHERE a.professional_id=v_prof.id AND a.active IS TRUE AND a.role_id='ACS'
      AND current_date>=a.valid_from AND (a.valid_until IS NULL OR current_date<=a.valid_until) ORDER BY a.valid_from DESC,a.created_at DESC LIMIT 1;
  IF p_task_id IS NOT NULL THEN
    SELECT * INTO v_task FROM public.census_agenda_tasks WHERE id=p_task_id FOR UPDATE;
    IF v_task.id IS NULL THEN RAISE EXCEPTION 'Tarefa de agenda não encontrada.'; END IF;
    IF v_task.professional_id IS NOT NULL AND v_task.professional_id<>v_prof.id THEN RAISE EXCEPTION 'A tarefa pertence a outro profissional.' USING ERRCODE='42501'; END IF;
    v_municipality:=coalesce(v_municipality,v_task.municipality_id); v_establishment:=coalesce(v_establishment,v_task.establishment_id); v_team:=coalesce(v_team,v_task.team_id); v_microarea:=coalesce(v_microarea,v_task.microarea_id);
  END IF;
  SELECT * INTO v_out FROM public.census_visit_outcome_catalog WHERE code=p_outcome_code AND active IS TRUE AND current_date BETWEEN valid_from AND coalesce(valid_until,current_date) ORDER BY version DESC LIMIT 1;
  IF v_out.id IS NULL THEN RAISE EXCEPTION 'Desfecho de visita inválido.'; END IF;
  IF p_outcome_code<>'REALIZADA' AND nullif(btrim(coalesce(p_notes,'')),'') IS NULL THEN RAISE EXCEPTION 'Informe uma justificativa para este desfecho.'; END IF;
  IF p_return_date IS NOT NULL AND p_return_date<p_visit_date THEN RAISE EXCEPTION 'A data de retorno não pode ser anterior à visita.'; END IF;
  v_status:=CASE WHEN p_outcome_code IN('AUSENTE','RECUSA','DOMICILIO_FECHADO','ENDERECO_NAO_LOCALIZADO') THEN 'NO_CONTACT' ELSE 'COMPLETED' END;
  v_snapshot:=jsonb_build_object('version',1,'status',CASE WHEN v_establishment IS NULL OR v_team IS NULL OR v_microarea IS NULL THEN 'PARTIAL' ELSE 'COMPLETE' END,'municipality_id',v_municipality,'establishment_id',v_establishment,'team_id',v_team,'microarea_id',v_microarea,'captured_at',now());
  INSERT INTO public.census_visits(household_id,visit_date,status,notes,created_by,visit_type,agenda_task_id,municipality_id,establishment_id,team_id,microarea_id,professional_id,family_id,outcome_id,outcome_version,guidance,referral,return_date,source,processing_status,territory_snapshot,pessoa_id,tipo_evento,versao_modelo,status_integracao,origem,data_hora_inicio,data_hora_fim,motivo_codigo,desfecho_codigo,visita_realizada,observacao_restrita,orientacoes,encaminhamentos)
  VALUES(p_household_id,p_visit_date,v_status,coalesce(p_notes,''),auth.uid(),'FVD',p_task_id,v_municipality,v_establishment,v_team,v_microarea,v_prof.id,p_family_id,v_out.id,v_out.version,coalesce(p_guidance,''),coalesce(p_referral,''),p_return_date,'municipal_collection','LOCALLY_VALIDATED',v_snapshot,p_pessoa_id,'visita_acs','2026.1','concluido_localmente','web',p_visit_date::timestamptz,CASE WHEN v_status IN ('COMPLETED','NO_CONTACT','CANCELLED') THEN now() ELSE NULL END,NULLIF(p_reason_codes[1],''),p_outcome_code,(p_outcome_code='REALIZADA'),NULLIF(p_notes,''),CASE WHEN NULLIF(p_guidance,'') IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('texto',p_guidance)) END,CASE WHEN NULLIF(p_referral,'') IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('texto',p_referral)) END)
  RETURNING id INTO v_id;
  INSERT INTO public.census_visit_reason_links(visit_id,reason_id,reason_version)
    SELECT v_id,r.id,r.version FROM public.census_visit_reason_catalog r WHERE r.code=ANY(coalesce(p_reason_codes,'{}'::text[])) AND r.active IS TRUE AND current_date BETWEEN r.valid_from AND coalesce(r.valid_until,current_date);
  IF p_task_id IS NOT NULL THEN UPDATE public.census_agenda_tasks SET status='COMPLETED',completed_visit_id=v_id,updated_at=now() WHERE id=p_task_id; END IF;
  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.census_foundation_my_context(),public.census_register_fvd(uuid,uuid,uuid,uuid,date,text[],text,text,text,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.census_foundation_my_context(),public.census_register_fvd(uuid,uuid,uuid,uuid,date,text[],text,text,text,text,date) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
