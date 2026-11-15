BEGIN;

-- A tela limitada de Saúde só pode conceder papéis que já têm um fluxo suportado no módulo.
-- Papéis de gestão e papéis profissionais futuros continuam sob controle do Admin global.
CREATE TABLE IF NOT EXISTS public.municipal_module_access_grantable_roles (
  module_id text NOT NULL REFERENCES public.municipal_modules(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  role_id text NOT NULL REFERENCES public.municipal_roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (module_id, role_id)
);
ALTER TABLE public.municipal_module_access_grantable_roles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.municipal_module_access_grantable_roles FROM PUBLIC, anon, authenticated;

INSERT INTO public.municipal_module_access_grantable_roles(module_id, role_id)
VALUES ('census', 'ACS'), ('census', 'HEALTH_SUPERVISOR')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.municipal_module_access_role_grantable(p_module_id text, p_role_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.municipal_module_access_grantable_roles grantable
    JOIN public.municipal_roles role_row ON role_row.id = grantable.role_id
    WHERE grantable.module_id = p_module_id
      AND grantable.role_id = p_role_id
      AND role_row.is_active IS TRUE
      AND public.municipal_role_module_compatible(p_role_id, p_module_id)
  );
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_access_role_grantable(text, text) FROM PUBLIC, anon, authenticated;

ALTER FUNCTION public.municipal_module_access_list(text) RENAME TO municipal_module_access_list_internal;
REVOKE ALL ON FUNCTION public.municipal_module_access_list_internal(text) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.municipal_module_access_list(p_module_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_payload jsonb;
  v_roles jsonb := '[]'::jsonb;
BEGIN
  v_payload := public.municipal_module_access_list_internal(p_module_id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', role_row.id, 'label', role_row.label, 'description', role_row.description) ORDER BY role_row.label), '[]'::jsonb)
  INTO v_roles
  FROM public.municipal_module_access_grantable_roles grantable
  JOIN public.municipal_roles role_row ON role_row.id = grantable.role_id
  WHERE grantable.module_id = p_module_id
    AND role_row.is_active IS TRUE
    AND public.municipal_role_module_compatible(role_row.id, p_module_id);
  RETURN jsonb_set(v_payload, '{roles}', v_roles, true);
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_access_list(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_module_access_list(text) TO authenticated;

ALTER FUNCTION public.municipal_module_access_save(text, integer, text, text, boolean, date) RENAME TO municipal_module_access_save_internal;
REVOKE ALL ON FUNCTION public.municipal_module_access_save_internal(text, integer, text, text, boolean, date) FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.municipal_module_access_save(
  p_module_id text,
  p_user_id integer,
  p_role_id text,
  p_org_unit_id text,
  p_active boolean,
  p_valid_until date DEFAULT NULL::date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF COALESCE(p_active, false) IS TRUE
     AND NOT public.municipal_module_access_role_grantable(p_module_id, p_role_id) THEN
    RAISE EXCEPTION 'Este papel ainda não tem um fluxo de acesso liberado para gestão neste módulo.';
  END IF;
  RETURN public.municipal_module_access_save_internal(
    p_module_id, p_user_id, p_role_id, p_org_unit_id, p_active, p_valid_until
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_access_save(text, integer, text, text, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_module_access_save(text, integer, text, text, boolean, date) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
