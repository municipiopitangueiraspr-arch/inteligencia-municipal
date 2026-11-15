BEGIN;

CREATE OR REPLACE FUNCTION public.municipal_governance_is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.usuarios u
    JOIN public.municipal_user_assignments a ON a.user_id = u.id
    JOIN public.municipal_roles r ON r.id = a.role_id
    JOIN public.municipal_org_units o ON o.id = a.org_unit_id
    WHERE u.uuid = auth.uid()
      AND u.ativo IS TRUE
      AND a.active IS TRUE
      AND r.is_active IS TRUE
      AND o.is_active IS TRUE
      AND r.id = 'GOVERNANCE_ADMIN'
      AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date)
  );
$$;

CREATE OR REPLACE FUNCTION public.municipal_user_has_role(p_role_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.municipal_user_assignments a
    JOIN public.usuarios u ON u.id = a.user_id
    JOIN public.municipal_roles r ON r.id = a.role_id
    JOIN public.municipal_org_units o ON o.id = a.org_unit_id
    WHERE u.uuid = auth.uid()
      AND u.ativo IS TRUE
      AND a.role_id = p_role_id
      AND a.active IS TRUE
      AND r.is_active IS TRUE
      AND o.is_active IS TRUE
      AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date)
  );
$$;

CREATE OR REPLACE FUNCTION public.municipal_user_has_module(p_module_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.municipal_governance_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.municipal_assignment_modules am
      JOIN public.municipal_user_assignments a ON a.id = am.assignment_id
      JOIN public.usuarios u ON u.id = a.user_id
      JOIN public.municipal_roles r ON r.id = a.role_id
      JOIN public.municipal_org_units o ON o.id = a.org_unit_id
      JOIN public.municipal_modules m ON m.id = am.module_id
      WHERE u.uuid = auth.uid()
        AND u.ativo IS TRUE
        AND am.module_id = p_module_id
        AND a.active IS TRUE
        AND r.is_active IS TRUE
        AND o.is_active IS TRUE
        AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date)
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.municipal_governance_get_my_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user public.usuarios%ROWTYPE;
  v_admin boolean := false;
  v_assignment_count integer := 0;
  v_assignments jsonb := '[]'::jsonb;
  v_module_ids jsonb := '[]'::jsonb;
  v_permission_ids jsonb := '[]'::jsonb;
  v_acs jsonb := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status', 'pending-assignment', 'user', NULL, 'is_administrator', false, 'assignments', '[]'::jsonb, 'module_ids', '[]'::jsonb, 'permission_ids', '[]'::jsonb, 'acs', NULL);
  END IF;

  SELECT u.* INTO v_user FROM public.usuarios u WHERE u.uuid = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pending-assignment', 'user', NULL, 'is_administrator', false, 'assignments', '[]'::jsonb, 'module_ids', '[]'::jsonb, 'permission_ids', '[]'::jsonb, 'acs', NULL);
  END IF;

  IF v_user.ativo IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'status', 'inactive',
      'user', jsonb_build_object('id', v_user.id, 'auth_user_id', v_user.uuid, 'name', COALESCE(v_user.nome, ''), 'email', v_user.email, 'avatar_url', v_user.foto_url, 'first_access_pending', COALESCE(v_user.primeiro_acesso, false)),
      'is_administrator', false, 'assignments', '[]'::jsonb, 'module_ids', '[]'::jsonb, 'permission_ids', '[]'::jsonb, 'acs', NULL
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.municipal_user_assignments a
    JOIN public.municipal_roles r ON r.id = a.role_id
    JOIN public.municipal_org_units o ON o.id = a.org_unit_id
    WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.id = 'GOVERNANCE_ADMIN' AND r.is_active IS TRUE AND o.is_active IS TRUE
      AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date)
  ) INTO v_admin;

  SELECT count(*) INTO v_assignment_count
  FROM public.municipal_user_assignments a
  JOIN public.municipal_roles r ON r.id = a.role_id
  JOIN public.municipal_org_units o ON o.id = a.org_unit_id
  WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.is_active IS TRUE AND o.is_active IS TRUE
    AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'org_unit_id', a.org_unit_id,
    'org_unit_name', o.name,
    'role_id', a.role_id,
    'role_label', r.label,
    'module_ids', COALESCE((SELECT jsonb_agg(am.module_id ORDER BY am.module_id) FROM public.municipal_assignment_modules am JOIN public.municipal_modules m ON m.id = am.module_id WHERE am.assignment_id = a.id), '[]'::jsonb),
    'scopes', COALESCE((SELECT jsonb_agg(jsonb_build_object('type', s.scope_type, 'key', s.scope_key) ORDER BY s.scope_type, s.scope_key) FROM public.municipal_assignment_scopes s WHERE s.assignment_id = a.id), '[]'::jsonb)
  ) ORDER BY o.sort_order, o.name), '[]'::jsonb)
  INTO v_assignments
  FROM public.municipal_user_assignments a
  JOIN public.municipal_roles r ON r.id = a.role_id
  JOIN public.municipal_org_units o ON o.id = a.org_unit_id
  WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.is_active IS TRUE AND o.is_active IS TRUE
    AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date);

  IF v_admin THEN
    SELECT COALESCE(jsonb_agg(m.id ORDER BY m.sort_order, m.id), '[]'::jsonb) INTO v_module_ids FROM public.municipal_modules m;
    SELECT COALESCE(jsonb_agg(p.id ORDER BY p.id), '[]'::jsonb) INTO v_permission_ids FROM public.municipal_permissions p;
  ELSE
    SELECT COALESCE(jsonb_agg(DISTINCT am.module_id ORDER BY am.module_id), '[]'::jsonb) INTO v_module_ids
    FROM public.municipal_assignment_modules am
    JOIN public.municipal_user_assignments a ON a.id = am.assignment_id
    JOIN public.municipal_roles r ON r.id = a.role_id
    JOIN public.municipal_org_units o ON o.id = a.org_unit_id
    JOIN public.municipal_modules m ON m.id = am.module_id
    WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.is_active IS TRUE AND o.is_active IS TRUE
      AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date);
    SELECT COALESCE(jsonb_agg(DISTINCT rp.permission_id ORDER BY rp.permission_id), '[]'::jsonb) INTO v_permission_ids
    FROM public.municipal_role_permissions rp
    JOIN public.municipal_user_assignments a ON a.role_id = rp.role_id
    JOIN public.municipal_roles r ON r.id = a.role_id
    JOIN public.municipal_org_units o ON o.id = a.org_unit_id
    WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.is_active IS TRUE AND o.is_active IS TRUE
      AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date);
  END IF;

  SELECT jsonb_build_object('id', acs.id, 'full_name', acs.full_name, 'active', acs.active)
  INTO v_acs
  FROM public.census_acs acs
  WHERE acs.user_id = auth.uid() AND acs.active IS TRUE
  ORDER BY acs.updated_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_assignment_count = 0 THEN 'pending-assignment' ELSE 'ready' END,
    'user', jsonb_build_object('id', v_user.id, 'auth_user_id', v_user.uuid, 'name', COALESCE(v_user.nome, ''), 'email', v_user.email, 'avatar_url', v_user.foto_url, 'first_access_pending', COALESCE(v_user.primeiro_acesso, false)),
    'is_administrator', v_admin,
    'assignments', v_assignments,
    'module_ids', v_module_ids,
    'permission_ids', v_permission_ids,
    'acs', v_acs
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.municipal_governance_complete_first_access()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  UPDATE public.usuarios
  SET primeiro_acesso = false, convite_aceito_em = COALESCE(convite_aceito_em, now()), senha_alterada_em = now(), updated_at = now()
  WHERE uuid = auth.uid() AND ativo IS TRUE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário municipal ativo não encontrado' USING ERRCODE = '42501'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.municipal_governance_get_my_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_get_my_context() TO authenticated;
REVOKE ALL ON FUNCTION public.municipal_governance_complete_first_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_complete_first_access() TO authenticated;

COMMIT;
