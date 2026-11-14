-- Correção dos filtros de usuários municipais: evita ESCAPE inválido em PostgreSQL.
BEGIN;

CREATE OR REPLACE FUNCTION public.municipal_governance_list_users_v2()
RETURNS TABLE(
  user_id integer,
  uuid uuid,
  name text,
  email text,
  ativo boolean,
  primeiro_acesso boolean,
  convite_enviado_em timestamp without time zone,
  convite_aceito_em timestamp without time zone,
  perfil_legacy text,
  assignments jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT
    u.id,
    u.uuid,
    u.nome::text,
    u.email::text,
    u.ativo,
    COALESCE(u.primeiro_acesso, false),
    u.convite_enviado_em,
    u.convite_aceito_em,
    COALESCE(u.perfil_municipal, u.perfil)::text,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', a.id,
        'org_unit_id', a.org_unit_id,
        'org_unit_name', ou.name,
        'org_unit_code', ou.code,
        'role_id', a.role_id,
        'role_label', r.label,
        'active', a.active,
        'valid_from', a.valid_from,
        'valid_until', a.valid_until,
        'module_ids', COALESCE((SELECT jsonb_agg(am.module_id ORDER BY am.module_id) FROM public.municipal_assignment_modules am WHERE am.assignment_id=a.id), '[]'::jsonb)
      ) ORDER BY a.active DESC, ou.sort_order, ou.name), '[]'::jsonb)
      FROM public.municipal_user_assignments a
      JOIN public.municipal_org_units ou ON ou.id=a.org_unit_id
      JOIN public.municipal_roles r ON r.id=a.role_id
      WHERE a.user_id=u.id
    ), '[]'::jsonb)
  FROM public.usuarios u
  WHERE u.uuid IS NOT NULL
    AND COALESCE(u.perfil,'') NOT LIKE 'POSTO%'
  ORDER BY u.ativo DESC, u.nome NULLS LAST, u.email
  LIMIT 500;
END;
$$;
REVOKE ALL ON FUNCTION public.municipal_governance_list_users_v2() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_list_users_v2() TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_save_assignment(
  p_assignment_id uuid,
  p_user_id integer,
  p_org_unit_id text,
  p_role_id text,
  p_module_ids text[],
  p_active boolean,
  p_valid_until date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE
  v_assignment_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_user_id AND uuid IS NOT NULL AND COALESCE(perfil,'') NOT LIKE 'POSTO%') THEN
    RAISE EXCEPTION 'Usuário municipal não encontrado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipal_org_units WHERE id=p_org_unit_id AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'A unidade organizacional não existe ou está inativa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipal_roles WHERE id=p_role_id AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'Papel não existe ou está inativo';
  END IF;
  IF p_valid_until IS NOT NULL AND p_valid_until < current_date THEN
    RAISE EXCEPTION 'A validade não pode estar no passado';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_module_ids,'{}'::text[])) selected(module_id) WHERE NOT EXISTS (SELECT 1 FROM public.municipal_modules m WHERE m.id=selected.module_id)) THEN
    RAISE EXCEPTION 'Um dos módulos selecionados não existe';
  END IF;
  IF p_assignment_id IS NULL THEN
    INSERT INTO public.municipal_user_assignments(user_id,org_unit_id,role_id,active,valid_until,created_by)
    VALUES(p_user_id,p_org_unit_id,p_role_id,COALESCE(p_active,true),p_valid_until,v_actor)
    RETURNING id INTO v_assignment_id;
  ELSE
    SELECT id INTO v_assignment_id FROM public.municipal_user_assignments WHERE id=p_assignment_id FOR UPDATE;
    IF v_assignment_id IS NULL THEN RAISE EXCEPTION 'A atribuição não foi encontrada'; END IF;
    UPDATE public.municipal_user_assignments
    SET user_id=p_user_id,org_unit_id=p_org_unit_id,role_id=p_role_id,active=COALESCE(p_active,true),valid_until=p_valid_until,updated_at=now()
    WHERE id=v_assignment_id;
  END IF;
  DELETE FROM public.municipal_assignment_modules WHERE assignment_id=v_assignment_id;
  INSERT INTO public.municipal_assignment_modules(assignment_id,module_id)
  SELECT v_assignment_id,selected.module_id FROM unnest(COALESCE(p_module_ids,'{}'::text[])) selected(module_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.municipal_access_audit(actor_user_id,target_user_id,assignment_id,action,details)
  VALUES(v_actor,p_user_id,v_assignment_id,'ASSIGNMENT_SAVE',jsonb_build_object('org_unit_id',p_org_unit_id,'role_id',p_role_id,'module_ids',COALESCE(p_module_ids,'{}'::text[]),'active',p_active,'valid_until',p_valid_until));
  RETURN v_assignment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.municipal_governance_save_assignment(uuid,integer,text,text,text[],boolean,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_save_assignment(uuid,integer,text,text,text[],boolean,date) TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_set_user_active(p_user_id integer,p_active boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_actor uuid := auth.uid(); v_target_uuid uuid;
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501'; END IF;
  SELECT uuid INTO v_target_uuid FROM public.usuarios WHERE id=p_user_id AND uuid IS NOT NULL AND COALESCE(perfil,'') NOT LIKE 'POSTO%' FOR UPDATE;
  IF v_target_uuid IS NULL THEN RAISE EXCEPTION 'Usuário municipal não encontrado'; END IF;
  IF v_target_uuid=v_actor AND p_active IS FALSE THEN RAISE EXCEPTION 'Você não pode desativar a própria conta'; END IF;
  IF p_active IS FALSE AND EXISTS (SELECT 1 FROM public.usuarios WHERE id=p_user_id AND (perfil='ADMIN' OR perfil_municipal='ADMIN') AND ativo IS TRUE) AND (SELECT COUNT(*) FROM public.usuarios WHERE ativo IS TRUE AND (perfil='ADMIN' OR perfil_municipal='ADMIN')) <= 1 THEN
    RAISE EXCEPTION 'Não é possível desativar o último administrador ativo';
  END IF;
  UPDATE public.usuarios SET ativo=p_active,desativado_em=CASE WHEN p_active IS FALSE THEN now() ELSE desativado_em END,reativado_em=CASE WHEN p_active IS TRUE THEN now() ELSE reativado_em END,updated_at=now() WHERE id=p_user_id;
  UPDATE public.municipal_user_assignments SET active=p_active,updated_at=now() WHERE user_id=p_user_id;
  INSERT INTO public.municipal_access_audit(actor_user_id,target_user_id,action,details) VALUES(v_actor,p_user_id,CASE WHEN p_active THEN 'USER_REACTIVATE' ELSE 'USER_DEACTIVATE' END,jsonb_build_object('active',p_active));
END;
$$;
REVOKE ALL ON FUNCTION public.municipal_governance_set_user_active(integer,boolean) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_set_user_active(integer,boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_register_invited_assignment(
  p_auth_user_id uuid,
  p_org_unit_id text,
  p_role_id text,
  p_module_ids text[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_user_id integer; v_assignment_id uuid;
BEGIN
  IF COALESCE(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Somente service_role' USING ERRCODE='42501'; END IF;
  SELECT id INTO v_user_id FROM public.usuarios WHERE uuid=p_auth_user_id FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário convidado não foi registrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipal_org_units WHERE id=p_org_unit_id AND is_active IS TRUE) THEN RAISE EXCEPTION 'Unidade organizacional inválida'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipal_roles WHERE id=p_role_id AND is_active IS TRUE) THEN RAISE EXCEPTION 'Papel inválido'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(COALESCE(p_module_ids,'{}'::text[])) selected(module_id) WHERE NOT EXISTS (SELECT 1 FROM public.municipal_modules m WHERE m.id=selected.module_id)) THEN RAISE EXCEPTION 'Módulo inválido'; END IF;
  INSERT INTO public.municipal_user_assignments(user_id,org_unit_id,role_id,active,created_by)
  VALUES(v_user_id,p_org_unit_id,p_role_id,true,NULL) RETURNING id INTO v_assignment_id;
  INSERT INTO public.municipal_assignment_modules(assignment_id,module_id)
  SELECT v_assignment_id,selected.module_id FROM unnest(COALESCE(p_module_ids,'{}'::text[])) selected(module_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.municipal_access_audit(actor_user_id,target_user_id,assignment_id,action,details)
  VALUES(NULL,v_user_id,v_assignment_id,'INVITED_ASSIGNMENT_CREATE',jsonb_build_object('org_unit_id',p_org_unit_id,'role_id',p_role_id,'module_ids',COALESCE(p_module_ids,'{}'::text[])));
  RETURN v_assignment_id;
END;
$$;
REVOKE ALL ON FUNCTION public.municipal_governance_register_invited_assignment(uuid,text,text,text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.municipal_governance_register_invited_assignment(uuid,text,text,text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.municipal_governance_list_roles()
RETURNS TABLE(id text,label text,description text,is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT r.id,r.label,r.description,r.is_active FROM public.municipal_roles r WHERE r.is_active IS TRUE ORDER BY r.label LIMIT 100;
END;
$$;
REVOKE ALL ON FUNCTION public.municipal_governance_list_roles() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_list_roles() TO authenticated;

COMMIT;
