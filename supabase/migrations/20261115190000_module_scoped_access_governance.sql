BEGIN;

-- Papéis operacionais de Saúde não devem ser concedidos em módulos sem relação com sua finalidade.
CREATE TABLE IF NOT EXISTS public.municipal_role_module_restrictions (
  role_id text NOT NULL REFERENCES public.municipal_roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  module_id text NOT NULL REFERENCES public.municipal_modules(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, module_id)
);
ALTER TABLE public.municipal_role_module_restrictions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.municipal_role_module_restrictions FROM PUBLIC, anon, authenticated;

INSERT INTO public.municipal_role_module_restrictions(role_id, module_id) VALUES
  ('ACS', 'census'),
  ('ACE', 'census'),
  ('HEALTH_MANAGER', 'census'),
  ('HEALTH_SUPERVISOR', 'census'),
  ('HEALTH_PROFESSIONAL', 'census'),
  ('NURSE', 'census'),
  ('PHYSICIAN', 'census')
ON CONFLICT DO NOTHING;

DO $block$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.municipal_user_assignments a
    JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
    JOIN public.municipal_role_module_restrictions restriction ON restriction.role_id = a.role_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.municipal_role_module_restrictions allowed
      WHERE allowed.role_id = a.role_id AND allowed.module_id = am.module_id
    )
  ) THEN
    RAISE EXCEPTION 'Há atribuições atuais incompatíveis com a matriz papel×módulo; revise-as antes da migração.';
  END IF;
END;
$block$;

CREATE OR REPLACE FUNCTION public.municipal_role_module_compatible(p_role_id text, p_module_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.municipal_roles r
    WHERE r.id = p_role_id AND r.is_active IS TRUE
  )
  AND EXISTS (
    SELECT 1 FROM public.municipal_modules m WHERE m.id = p_module_id
  )
  AND (
    NOT EXISTS (
      SELECT 1 FROM public.municipal_role_module_restrictions restriction
      WHERE restriction.role_id = p_role_id
    )
    OR EXISTS (
      SELECT 1 FROM public.municipal_role_module_restrictions restriction
      WHERE restriction.role_id = p_role_id AND restriction.module_id = p_module_id
    )
  );
$function$;
REVOKE ALL ON FUNCTION public.municipal_role_module_compatible(text, text) FROM PUBLIC, anon, authenticated;

INSERT INTO public.municipal_permissions(id, label, module_id, description)
VALUES ('governance.module_access.manage', 'Gerenciar usuários e acessos do módulo', 'census', 'Conceder e revogar acesso somente ao módulo autorizado e às unidades do escopo.')
ON CONFLICT (id) DO UPDATE SET label = EXCLUDED.label, module_id = EXCLUDED.module_id, description = EXCLUDED.description;
INSERT INTO public.municipal_role_permissions(role_id, permission_id)
VALUES ('HEALTH_MANAGER', 'governance.module_access.manage'), ('UNIT_MANAGER', 'governance.module_access.manage')
ON CONFLICT DO NOTHING;

-- O Admin pode atribuir papéis de domínio; a tabela de restrições e as RPCs validam o módulo no servidor.
CREATE OR REPLACE FUNCTION public.municipal_governance_list_roles()
RETURNS TABLE(id text, label text, description text, is_active boolean)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT r.id, r.label, r.description, r.is_active
  FROM public.municipal_roles r
  WHERE r.is_active IS TRUE
  ORDER BY CASE r.id
    WHEN 'GOVERNANCE_ADMIN' THEN 1
    WHEN 'EXECUTIVE_VIEW' THEN 2
    WHEN 'UNIT_MANAGER' THEN 3
    WHEN 'HEALTH_MANAGER' THEN 4
    WHEN 'HEALTH_SUPERVISOR' THEN 5
    WHEN 'ACS' THEN 6
    WHEN 'ACE' THEN 7
    WHEN 'HEALTH_PROFESSIONAL' THEN 8
    WHEN 'NURSE' THEN 9
    WHEN 'PHYSICIAN' THEN 10
    WHEN 'OPERATOR' THEN 11
    WHEN 'READ_ONLY' THEN 12
    ELSE 99
  END, r.label
  LIMIT 100;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_governance_list_roles() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_list_roles() TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_validate_assignment(p_role_id text, p_module_ids text[])
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipal_roles r WHERE r.id = p_role_id AND r.is_active IS TRUE) THEN
    RAISE EXCEPTION 'Papel não existe ou está inativo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_module_ids, ARRAY[]::text[])) selected(module_id)
    WHERE NOT public.municipal_role_module_compatible(p_role_id, selected.module_id)
  ) OR (
    EXISTS (SELECT 1 FROM public.municipal_role_module_restrictions restriction WHERE restriction.role_id = p_role_id)
    AND cardinality(COALESCE(p_module_ids, ARRAY[]::text[])) = 0
  ) THEN
    RAISE EXCEPTION 'O papel selecionado não é compatível com um ou mais módulos';
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_governance_validate_assignment(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_validate_assignment(text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_save_assignment(
  p_assignment_id uuid,
  p_user_id integer,
  p_org_unit_id text,
  p_role_id text,
  p_module_ids text[],
  p_active boolean,
  p_valid_until date DEFAULT NULL::date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_assignment_id uuid;
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.usuarios
  WHERE id = p_user_id AND uuid IS NOT NULL AND COALESCE(perfil, '') NOT LIKE 'POSTO%'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuário municipal não encontrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipal_org_units WHERE id = p_org_unit_id AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'A unidade organizacional não existe ou está inativa';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipal_roles WHERE id = p_role_id AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'Papel não existe ou está inativo';
  END IF;
  IF p_valid_until IS NOT NULL AND p_valid_until < current_date THEN
    RAISE EXCEPTION 'A validade não pode estar no passado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_module_ids, ARRAY[]::text[])) selected(module_id)
    WHERE NOT public.municipal_role_module_compatible(p_role_id, selected.module_id)
  ) OR (
    EXISTS (SELECT 1 FROM public.municipal_role_module_restrictions restriction WHERE restriction.role_id = p_role_id)
    AND cardinality(COALESCE(p_module_ids, ARRAY[]::text[])) = 0
  ) THEN
    RAISE EXCEPTION 'O papel selecionado não é compatível com um ou mais módulos';
  END IF;
  IF p_assignment_id IS NULL THEN
    INSERT INTO public.municipal_user_assignments(user_id, org_unit_id, role_id, active, valid_until, created_by)
    VALUES (p_user_id, p_org_unit_id, p_role_id, COALESCE(p_active, true), p_valid_until, v_actor)
    RETURNING id INTO v_assignment_id;
  ELSE
    SELECT id INTO v_assignment_id FROM public.municipal_user_assignments WHERE id = p_assignment_id FOR UPDATE;
    IF v_assignment_id IS NULL THEN RAISE EXCEPTION 'A atribuição não foi encontrada'; END IF;
    UPDATE public.municipal_user_assignments
    SET user_id = p_user_id, org_unit_id = p_org_unit_id, role_id = p_role_id,
        active = COALESCE(p_active, true), valid_until = p_valid_until, updated_at = now()
    WHERE id = v_assignment_id;
  END IF;
  DELETE FROM public.municipal_assignment_modules WHERE assignment_id = v_assignment_id;
  INSERT INTO public.municipal_assignment_modules(assignment_id, module_id)
  SELECT v_assignment_id, selected.module_id
  FROM unnest(COALESCE(p_module_ids, ARRAY[]::text[])) selected(module_id)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.municipal_access_audit(actor_user_id, target_user_id, assignment_id, action, details)
  VALUES (v_actor, p_user_id, v_assignment_id, 'ASSIGNMENT_SAVE', jsonb_build_object(
    'org_unit_id', p_org_unit_id, 'role_id', p_role_id,
    'module_ids', COALESCE(p_module_ids, ARRAY[]::text[]), 'active', p_active, 'valid_until', p_valid_until
  ));
  RETURN v_assignment_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_governance_save_assignment(uuid, integer, text, text, text[], boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_save_assignment(uuid, integer, text, text, text[], boolean, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_register_invited_assignment(
  p_auth_user_id uuid,
  p_org_unit_id text,
  p_role_id text,
  p_module_ids text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_user_id integer;
  v_assignment_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Somente service_role' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_user_id FROM public.usuarios WHERE uuid = p_auth_user_id FOR UPDATE;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuário convidado não foi registrado'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipal_org_units WHERE id = p_org_unit_id AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'Unidade organizacional inválida';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.municipal_roles WHERE id = p_role_id AND is_active IS TRUE) THEN
    RAISE EXCEPTION 'Papel inválido';
  END IF;
  IF EXISTS (
    SELECT 1 FROM unnest(COALESCE(p_module_ids, ARRAY[]::text[])) selected(module_id)
    WHERE NOT public.municipal_role_module_compatible(p_role_id, selected.module_id)
  ) OR (
    EXISTS (SELECT 1 FROM public.municipal_role_module_restrictions restriction WHERE restriction.role_id = p_role_id)
    AND cardinality(COALESCE(p_module_ids, ARRAY[]::text[])) = 0
  ) THEN
    RAISE EXCEPTION 'O papel selecionado não é compatível com um ou mais módulos';
  END IF;
  INSERT INTO public.municipal_user_assignments(user_id, org_unit_id, role_id, active, created_by)
  VALUES (v_user_id, p_org_unit_id, p_role_id, true, NULL)
  RETURNING id INTO v_assignment_id;
  INSERT INTO public.municipal_assignment_modules(assignment_id, module_id)
  SELECT v_assignment_id, selected.module_id
  FROM unnest(COALESCE(p_module_ids, ARRAY[]::text[])) selected(module_id)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.municipal_access_audit(actor_user_id, target_user_id, assignment_id, action, details)
  VALUES (NULL, v_user_id, v_assignment_id, 'INVITED_ASSIGNMENT_CREATE', jsonb_build_object(
    'org_unit_id', p_org_unit_id, 'role_id', p_role_id, 'module_ids', COALESCE(p_module_ids, ARRAY[]::text[])
  ));
  RETURN v_assignment_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_governance_register_invited_assignment(uuid, text, text, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.municipal_governance_register_invited_assignment(uuid, text, text, text[]) TO service_role;

CREATE OR REPLACE FUNCTION public.municipal_module_access_can_manage(p_module_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.municipal_modules m WHERE m.id = p_module_id)
    AND (
      public.municipal_governance_is_admin()
      OR EXISTS (
        SELECT 1
        FROM public.usuarios u
        JOIN public.municipal_user_assignments a ON a.user_id = u.id
        JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
        JOIN public.municipal_roles r ON r.id = a.role_id
        JOIN public.municipal_org_units ou ON ou.id = a.org_unit_id
        WHERE u.uuid = auth.uid() AND u.ativo IS TRUE
          AND a.active IS TRUE AND r.is_active IS TRUE AND ou.is_active IS TRUE
          AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date)
          AND am.module_id = p_module_id
          AND EXISTS (
            SELECT 1 FROM public.municipal_role_permissions rp
            WHERE rp.role_id = r.id AND rp.permission_id = 'governance.module_access.manage'
          )
          AND (
            (p_module_id = 'census' AND r.id = 'HEALTH_MANAGER')
            OR r.id = 'UNIT_MANAGER'
          )
      )
    );
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_access_can_manage(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.municipal_module_access_scope_units(p_module_id text)
RETURNS TABLE(id text, code text, name text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.municipal_module_access_can_manage(p_module_id) THEN
    RAISE EXCEPTION 'Acesso de gestão para este módulo não autorizado' USING ERRCODE = '42501';
  END IF;
  IF public.municipal_governance_is_admin() THEN
    RETURN QUERY
    SELECT ou.id, ou.code, ou.name
    FROM public.municipal_org_units ou
    WHERE ou.is_active IS TRUE
    ORDER BY ou.sort_order, ou.name
    LIMIT 500;
    RETURN;
  END IF;
  RETURN QUERY
  WITH RECURSIVE roots AS (
    SELECT DISTINCT a.org_unit_id AS id
    FROM public.usuarios u
    JOIN public.municipal_user_assignments a ON a.user_id = u.id
    JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
    JOIN public.municipal_roles r ON r.id = a.role_id
    JOIN public.municipal_org_units root ON root.id = a.org_unit_id
    WHERE u.uuid = auth.uid() AND u.ativo IS TRUE
      AND a.active IS TRUE AND r.is_active IS TRUE AND root.is_active IS TRUE
      AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date)
      AND am.module_id = p_module_id
      AND ((p_module_id = 'census' AND r.id = 'HEALTH_MANAGER') OR r.id = 'UNIT_MANAGER')
  ), scoped AS (
    SELECT ou.id, ou.parent_id, ou.code, ou.name
    FROM public.municipal_org_units ou
    JOIN roots ON roots.id = ou.id
    WHERE ou.is_active IS TRUE
    UNION
    SELECT child.id, child.parent_id, child.code, child.name
    FROM public.municipal_org_units child
    JOIN scoped parent ON child.parent_id = parent.id
    WHERE child.is_active IS TRUE
  )
  SELECT scoped.id, scoped.code, scoped.name
  FROM scoped
  ORDER BY scoped.code, scoped.name
  LIMIT 500;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_access_scope_units(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.municipal_module_access_list(p_module_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_module_label text;
  v_roles jsonb := '[]'::jsonb;
  v_units jsonb := '[]'::jsonb;
  v_users jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.municipal_module_access_can_manage(p_module_id) THEN
    RAISE EXCEPTION 'Acesso de gestão para este módulo não autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT m.label INTO v_module_label FROM public.municipal_modules m WHERE m.id = p_module_id;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', r.id, 'label', r.label, 'description', r.description) ORDER BY r.label), '[]'::jsonb)
  INTO v_roles
  FROM public.municipal_roles r
  WHERE r.is_active IS TRUE
    AND r.id NOT IN ('GOVERNANCE_ADMIN', 'SYSTEM_ADMIN', 'EXECUTIVE_VIEW', 'UNIT_MANAGER', 'HEALTH_MANAGER')
    AND public.municipal_role_module_compatible(r.id, p_module_id);
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', unit.id, 'code', unit.code, 'name', unit.name) ORDER BY unit.code, unit.name), '[]'::jsonb)
  INTO v_units
  FROM public.municipal_module_access_scope_units(p_module_id) unit;
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id', user_row.id,
    'name', COALESCE(user_row.nome, ''),
    'email', user_row.email,
    'account_active', user_row.ativo IS TRUE,
    'is_self', user_row.uuid = auth.uid(),
    'has_access', EXISTS (
      SELECT 1
      FROM public.municipal_user_assignments a
      JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
      WHERE a.user_id = user_row.id AND am.module_id = p_module_id
        AND a.active IS TRUE
        AND (a.valid_until IS NULL OR a.valid_until >= current_date)
        AND a.valid_from <= current_date
    ),
    'outside_scope', EXISTS (
      SELECT 1
      FROM public.municipal_user_assignments a
      JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
      WHERE a.user_id = user_row.id AND am.module_id = p_module_id
        AND a.active IS TRUE AND (a.valid_until IS NULL OR a.valid_until >= current_date)
        AND a.org_unit_id NOT IN (SELECT unit.id FROM public.municipal_module_access_scope_units(p_module_id) unit)
    ),
    'protected', EXISTS (
      SELECT 1
      FROM public.municipal_user_assignments a
      JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
      WHERE a.user_id = user_row.id AND am.module_id = p_module_id
        AND a.active IS TRUE AND (a.valid_until IS NULL OR a.valid_until >= current_date)
        AND a.role_id IN ('GOVERNANCE_ADMIN', 'SYSTEM_ADMIN', 'UNIT_MANAGER', 'HEALTH_MANAGER')
    ),
    'manageable', user_row.uuid <> auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.municipal_user_assignments a
        JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
        WHERE a.user_id = user_row.id AND am.module_id = p_module_id
          AND a.active IS TRUE AND (a.valid_until IS NULL OR a.valid_until >= current_date)
          AND a.org_unit_id NOT IN (SELECT unit.id FROM public.municipal_module_access_scope_units(p_module_id) unit)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.municipal_user_assignments a
        JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
        WHERE a.user_id = user_row.id AND am.module_id = p_module_id
          AND a.active IS TRUE AND (a.valid_until IS NULL OR a.valid_until >= current_date)
          AND a.role_id IN ('GOVERNANCE_ADMIN', 'SYSTEM_ADMIN', 'UNIT_MANAGER', 'HEALTH_MANAGER')
      ),
    'in_scope', public.municipal_governance_is_admin() OR EXISTS (
      SELECT 1 FROM public.municipal_user_assignments membership
      JOIN public.municipal_roles membership_role ON membership_role.id = membership.role_id
      WHERE membership.user_id = user_row.id AND membership.active IS TRUE
        AND membership_role.is_active IS TRUE
        AND current_date BETWEEN membership.valid_from AND COALESCE(membership.valid_until, current_date)
        AND membership.org_unit_id IN (SELECT unit.id FROM public.municipal_module_access_scope_units(p_module_id) unit)
    ),
    'assignments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', assignment_row.id,
        'role_id', assignment_row.role_id,
        'role_label', assignment_row.role_label,
        'org_unit_id', assignment_row.org_unit_id,
        'org_unit_name', assignment_row.org_unit_name,
        'active', assignment_row.active,
        'valid_from', assignment_row.valid_from,
        'valid_until', assignment_row.valid_until,
        'module_ids', assignment_row.module_ids
      ) ORDER BY assignment_row.valid_from DESC, assignment_row.created_at DESC)
      FROM (
        SELECT a.id, a.role_id, r.label AS role_label, a.org_unit_id, ou.name AS org_unit_name,
          a.active, a.valid_from, a.valid_until, a.created_at,
          COALESCE((SELECT jsonb_agg(am2.module_id ORDER BY am2.module_id)
            FROM public.municipal_assignment_modules am2 WHERE am2.assignment_id = a.id), '[]'::jsonb) AS module_ids
        FROM public.municipal_user_assignments a
        JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
        JOIN public.municipal_roles r ON r.id = a.role_id
        JOIN public.municipal_org_units ou ON ou.id = a.org_unit_id
        WHERE a.user_id = user_row.id AND am.module_id = p_module_id
          AND a.active IS TRUE AND r.is_active IS TRUE AND ou.is_active IS TRUE
          AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date)
          AND a.org_unit_id IN (SELECT unit.id FROM public.municipal_module_access_scope_units(p_module_id) unit)
        ORDER BY a.valid_from DESC, a.created_at DESC
        LIMIT 20
      ) assignment_row
    ), '[]'::jsonb)
  ) ORDER BY user_row.nome NULLS LAST, user_row.email), '[]'::jsonb)
  INTO v_users
  FROM (
    SELECT u.id, u.uuid, u.nome, u.email, u.ativo
    FROM public.usuarios u
    WHERE u.uuid IS NOT NULL AND u.ativo IS TRUE AND COALESCE(u.perfil, '') NOT LIKE 'POSTO%'
      AND (
        public.municipal_governance_is_admin()
        OR EXISTS (
          SELECT 1 FROM public.municipal_user_assignments membership
          JOIN public.municipal_roles membership_role ON membership_role.id = membership.role_id
          WHERE membership.user_id = u.id AND membership.active IS TRUE
            AND membership_role.is_active IS TRUE
            AND current_date BETWEEN membership.valid_from AND COALESCE(membership.valid_until, current_date)
            AND membership.org_unit_id IN (SELECT unit.id FROM public.municipal_module_access_scope_units(p_module_id) unit)
        )
      )
    ORDER BY u.nome NULLS LAST, u.email
    LIMIT 500
  ) user_row;
  RETURN jsonb_build_object('module_id', p_module_id, 'module_label', v_module_label, 'roles', v_roles, 'org_units', v_units, 'users', v_users);
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_access_list(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_module_access_list(text) TO authenticated;

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
DECLARE
  v_user_uuid uuid;
  v_assignment_id uuid;
  v_previous_ids uuid[] := ARRAY[]::uuid[];
  v_existing record;
BEGIN
  IF NOT public.municipal_module_access_can_manage(p_module_id) THEN
    RAISE EXCEPTION 'Acesso de gestão para este módulo não autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT u.uuid INTO v_user_uuid
  FROM public.usuarios u
  WHERE u.id = p_user_id AND u.uuid IS NOT NULL AND u.ativo IS TRUE
    AND COALESCE(u.perfil, '') NOT LIKE 'POSTO%'
  FOR UPDATE;
  IF v_user_uuid IS NULL THEN RAISE EXCEPTION 'Conta municipal ativa não encontrada'; END IF;
  IF v_user_uuid = auth.uid() THEN RAISE EXCEPTION 'Não é permitido alterar o próprio acesso por esta tela'; END IF;
  IF NOT public.municipal_governance_is_admin() AND NOT EXISTS (
    SELECT 1 FROM public.municipal_user_assignments membership
    JOIN public.municipal_roles membership_role ON membership_role.id = membership.role_id
    WHERE membership.user_id = p_user_id AND membership.active IS TRUE
      AND membership_role.is_active IS TRUE
      AND current_date BETWEEN membership.valid_from AND COALESCE(membership.valid_until, current_date)
      AND membership.org_unit_id IN (SELECT unit.id FROM public.municipal_module_access_scope_units(p_module_id) unit)
  ) THEN
    RAISE EXCEPTION 'A conta ainda não está vinculada a uma unidade do seu escopo; solicite ao Admin do Sistema o vínculo organizacional inicial' USING ERRCODE = '42501';
  END IF;
  IF NOT public.municipal_governance_is_admin()
     AND EXISTS (
       SELECT 1 FROM public.municipal_user_assignments a
       JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
       WHERE a.user_id = p_user_id AND am.module_id = p_module_id
         AND a.active IS TRUE AND (a.valid_until IS NULL OR a.valid_until >= current_date)
         AND a.org_unit_id NOT IN (SELECT unit.id FROM public.municipal_module_access_scope_units(p_module_id) unit)
     ) THEN
    RAISE EXCEPTION 'Esta conta já possui acesso ao módulo fora do seu escopo; solicite a alteração ao Admin do Sistema' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.municipal_user_assignments a
    JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
    WHERE a.user_id = p_user_id AND am.module_id = p_module_id
      AND a.active IS TRUE AND (a.valid_until IS NULL OR a.valid_until >= current_date)
      AND a.role_id IN ('GOVERNANCE_ADMIN', 'SYSTEM_ADMIN', 'UNIT_MANAGER', 'HEALTH_MANAGER')
  ) THEN
    RAISE EXCEPTION 'Acesso de administrador ou gestor protegido; altere-o na Governança global' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(p_active, false) IS TRUE THEN
    IF p_role_id IN ('GOVERNANCE_ADMIN', 'SYSTEM_ADMIN', 'EXECUTIVE_VIEW', 'UNIT_MANAGER', 'HEALTH_MANAGER')
       OR NOT public.municipal_role_module_compatible(p_role_id, p_module_id)
       OR NOT EXISTS (SELECT 1 FROM public.municipal_roles r WHERE r.id = p_role_id AND r.is_active IS TRUE) THEN
      RAISE EXCEPTION 'Papel não disponível para concessão limitada neste módulo';
    END IF;
    IF p_org_unit_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.municipal_module_access_scope_units(p_module_id) unit WHERE unit.id = p_org_unit_id
    ) THEN
      RAISE EXCEPTION 'A unidade está fora do escopo organizacional autorizado' USING ERRCODE = '42501';
    END IF;
    IF p_valid_until IS NOT NULL AND p_valid_until < current_date THEN
      RAISE EXCEPTION 'A validade não pode estar no passado';
    END IF;
  END IF;

  PERFORM 1
  FROM public.municipal_user_assignments a
  JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
  WHERE a.user_id = p_user_id AND am.module_id = p_module_id
    AND a.active IS TRUE AND (a.valid_until IS NULL OR a.valid_until >= current_date)
    AND (public.municipal_governance_is_admin() OR a.org_unit_id IN (
      SELECT unit.id FROM public.municipal_module_access_scope_units(p_module_id) unit
    ))
  FOR UPDATE OF a;

  FOR v_existing IN
    SELECT a.id,
      (SELECT count(*)::integer FROM public.municipal_assignment_modules all_modules WHERE all_modules.assignment_id = a.id) AS module_count
    FROM public.municipal_user_assignments a
    JOIN public.municipal_assignment_modules am ON am.assignment_id = a.id
    WHERE a.user_id = p_user_id AND am.module_id = p_module_id
      AND a.active IS TRUE AND (a.valid_until IS NULL OR a.valid_until >= current_date)
      AND (public.municipal_governance_is_admin() OR a.org_unit_id IN (
        SELECT unit.id FROM public.municipal_module_access_scope_units(p_module_id) unit
      ))
  LOOP
    v_previous_ids := array_append(v_previous_ids, v_existing.id);
    IF v_existing.module_count > 1 THEN
      DELETE FROM public.municipal_assignment_modules
      WHERE assignment_id = v_existing.id AND module_id = p_module_id;
    ELSE
      UPDATE public.municipal_user_assignments
      SET active = false, updated_at = now()
      WHERE id = v_existing.id;
    END IF;
  END LOOP;

  IF COALESCE(p_active, false) IS TRUE THEN
    INSERT INTO public.municipal_user_assignments(user_id, org_unit_id, role_id, active, valid_from, valid_until, created_by)
    VALUES (p_user_id, p_org_unit_id, p_role_id, true, current_date, p_valid_until, auth.uid())
    RETURNING id INTO v_assignment_id;
    INSERT INTO public.municipal_assignment_modules(assignment_id, module_id)
    VALUES (v_assignment_id, p_module_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF COALESCE(p_active, false) IS TRUE OR cardinality(v_previous_ids) > 0 THEN
    INSERT INTO public.municipal_access_audit(actor_user_id, target_user_id, assignment_id, action, details)
    VALUES (auth.uid(), p_user_id, v_assignment_id,
      CASE WHEN COALESCE(p_active, false) IS TRUE THEN 'MODULE_ACCESS_SAVE' ELSE 'MODULE_ACCESS_REVOKE' END,
      jsonb_build_object('module_id', p_module_id, 'role_id', CASE WHEN COALESCE(p_active, false) IS TRUE THEN p_role_id ELSE NULL END,
        'org_unit_id', CASE WHEN COALESCE(p_active, false) IS TRUE THEN p_org_unit_id ELSE NULL END,
        'active', COALESCE(p_active, false), 'valid_until', CASE WHEN COALESCE(p_active, false) IS TRUE THEN p_valid_until ELSE NULL END,
        'replaced_assignment_ids', to_jsonb(v_previous_ids))
    );
  END IF;
  RETURN v_assignment_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_access_save(text, integer, text, text, boolean, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_module_access_save(text, integer, text, text, boolean, date) TO authenticated;

CREATE INDEX IF NOT EXISTS municipal_assignment_modules_module_assignment_idx
  ON public.municipal_assignment_modules(module_id, assignment_id);
CREATE INDEX IF NOT EXISTS municipal_user_assignments_user_active_idx
  ON public.municipal_user_assignments(user_id, active, valid_from, valid_until);

NOTIFY pgrst, 'reload schema';
COMMIT;
