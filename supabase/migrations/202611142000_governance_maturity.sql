BEGIN;

CREATE OR REPLACE FUNCTION public.municipal_governance_list_audit(p_search text DEFAULT NULL)
RETURNS TABLE(id bigint, action text, created_at timestamptz, actor_name text, actor_email text, target_name text, target_email text, assignment_id uuid, details jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501'; END IF;
  RETURN QUERY
  SELECT a.id,a.action,a.created_at,actor.nome::text,actor.email::text,target.nome::text,target.email::text,a.assignment_id,a.details
  FROM public.municipal_access_audit a
  LEFT JOIN public.usuarios actor ON actor.uuid=a.actor_user_id
  LEFT JOIN public.usuarios target ON target.id=a.target_user_id
  WHERE p_search IS NULL OR p_search='' OR a.action ILIKE '%'||p_search||'%' OR COALESCE(actor.nome,'') ILIKE '%'||p_search||'%' OR COALESCE(target.nome,'') ILIKE '%'||p_search||'%' OR COALESCE(target.email,'') ILIKE '%'||p_search||'%'
  ORDER BY a.created_at DESC,a.id DESC
  LIMIT 300;
END;
$$;
REVOKE ALL ON FUNCTION public.municipal_governance_list_audit(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_list_audit(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_delete_assignment(p_assignment_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_actor uuid:=auth.uid(); v_user_id integer;
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501'; END IF;
  SELECT user_id INTO v_user_id FROM public.municipal_user_assignments WHERE id=p_assignment_id FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Atribuição não encontrada'; END IF;
  IF (SELECT COUNT(*) FROM public.municipal_user_assignments WHERE user_id=v_user_id AND active IS TRUE) <= 1 THEN RAISE EXCEPTION 'Mantenha pelo menos uma atribuição ativa para o usuário'; END IF;
  DELETE FROM public.municipal_user_assignments WHERE id=p_assignment_id;
  INSERT INTO public.municipal_access_audit(actor_user_id,target_user_id,action,details) VALUES(v_actor,v_user_id,'ASSIGNMENT_DELETE',jsonb_build_object('assignment_id',p_assignment_id));
END;
$$;
REVOKE ALL ON FUNCTION public.municipal_governance_delete_assignment(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_delete_assignment(uuid) TO authenticated;

COMMIT;
