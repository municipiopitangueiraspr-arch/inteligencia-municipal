CREATE OR REPLACE FUNCTION public.municipal_governance_save_module(
  p_id text,
  p_label text,
  p_description text,
  p_icon_name text,
  p_status_label text,
  p_sort_order integer,
  p_is_ready boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501';
  END IF;

  IF nullif(btrim(p_id), '') IS NULL OR nullif(btrim(p_label), '') IS NULL THEN
    RAISE EXCEPTION 'Identificador e nome do módulo são obrigatórios';
  END IF;

  IF p_sort_order IS NULL OR p_sort_order < 1 THEN
    RAISE EXCEPTION 'A ordem do módulo deve ser um inteiro maior que zero';
  END IF;

  INSERT INTO public.municipal_modules(
    id, label, description, icon_name, status_label, sort_order, is_ready, updated_at
  )
  VALUES (
    lower(btrim(p_id)),
    btrim(p_label),
    coalesce(btrim(p_description), ''),
    coalesce(nullif(btrim(p_icon_name), ''), 'Building2'),
    coalesce(nullif(btrim(p_status_label), ''), CASE WHEN coalesce(p_is_ready, false) THEN 'Disponível' ELSE 'Em preparação' END),
    p_sort_order,
    coalesce(p_is_ready, false),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    label = EXCLUDED.label,
    description = EXCLUDED.description,
    icon_name = EXCLUDED.icon_name,
    status_label = EXCLUDED.status_label,
    sort_order = EXCLUDED.sort_order,
    is_ready = EXCLUDED.is_ready,
    updated_at = now();

  INSERT INTO public.municipal_access_audit(actor_user_id, action, details)
  VALUES (
    auth.uid(),
    'MODULE_CATALOG_SAVE',
    jsonb_build_object(
      'module_id', lower(btrim(p_id)),
      'label', btrim(p_label),
      'is_ready', coalesce(p_is_ready, false),
      'status_label', coalesce(nullif(btrim(p_status_label), ''), CASE WHEN coalesce(p_is_ready, false) THEN 'Disponível' ELSE 'Em preparação' END)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.municipal_governance_save_module(text,text,text,text,text,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.municipal_governance_save_module(text,text,text,text,text,integer,boolean) TO authenticated;
