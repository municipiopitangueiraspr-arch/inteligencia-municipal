BEGIN;

CREATE OR REPLACE FUNCTION public.municipal_governance_save_municipality(
  p_id uuid,
  p_code text,
  p_ibge_code text,
  p_name text,
  p_state_code text,
  p_timezone text,
  p_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,public,app_private,auth
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501';
  END IF;
  IF nullif(btrim(p_code), '') IS NULL OR nullif(btrim(p_name), '') IS NULL OR p_state_code !~ '^[A-Z]{2}$' THEN
    RAISE EXCEPTION 'Informe o identificador, o nome e uma UF válida';
  END IF;
  IF nullif(btrim(coalesce(p_ibge_code, '')), '') IS NOT NULL AND btrim(p_ibge_code) !~ '^[0-9]{7}$' THEN
    RAISE EXCEPTION 'O código IBGE deve ter sete números';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.municipalities(code, ibge_code, name, state_code, timezone, active)
    VALUES (lower(btrim(p_code)), nullif(btrim(p_ibge_code), ''), btrim(p_name), p_state_code, coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo'), coalesce(p_active, true))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.municipalities
       SET code=lower(btrim(p_code)), ibge_code=nullif(btrim(p_ibge_code), ''), name=btrim(p_name), state_code=p_state_code,
           timezone=coalesce(nullif(btrim(p_timezone), ''), 'America/Sao_Paulo'), active=coalesce(p_active, true), updated_at=now()
     WHERE id=p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Município não encontrado'; END IF;
  END IF;

  INSERT INTO public.municipal_access_audit(actor_user_id, action, details)
  VALUES (auth.uid(), 'MUNICIPALITY_SAVE', jsonb_build_object('name', btrim(p_name), 'code', lower(btrim(p_code)), 'ibge_code', nullif(btrim(p_ibge_code), ''), 'active', coalesce(p_active, true)));
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.municipal_governance_save_municipality(uuid,text,text,text,text,text,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_save_municipality(uuid,text,text,text,text,text,boolean) TO authenticated;

COMMIT;
