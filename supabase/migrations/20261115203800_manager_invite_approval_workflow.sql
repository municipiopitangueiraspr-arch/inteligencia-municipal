BEGIN;

CREATE TABLE IF NOT EXISTS public.municipal_user_invite_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invitee_name text NOT NULL CHECK (length(btrim(invitee_name)) BETWEEN 2 AND 160),
  invitee_email text NOT NULL CHECK (invitee_email = lower(btrim(invitee_email)) AND length(invitee_email) <= 254),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_user_id integer REFERENCES public.usuarios(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'SENDING' CHECK (status IN ('SENDING', 'PENDING_ADMIN_APPROVAL', 'APPROVED', 'REJECTED', 'FAILED')),
  failure_reason text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  invitation_sent_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  assignment_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
);

CREATE TABLE IF NOT EXISTS public.municipal_user_invite_request_access (
  request_id uuid NOT NULL REFERENCES public.municipal_user_invite_requests(id) ON DELETE CASCADE,
  module_id text NOT NULL REFERENCES public.municipal_modules(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  role_id text NOT NULL REFERENCES public.municipal_roles(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  org_unit_id text NOT NULL REFERENCES public.municipal_org_units(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  valid_until date,
  PRIMARY KEY (request_id, module_id, org_unit_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS municipal_user_invite_requests_open_email_uidx
  ON public.municipal_user_invite_requests (lower(invitee_email))
  WHERE status IN ('SENDING', 'PENDING_ADMIN_APPROVAL');
CREATE INDEX IF NOT EXISTS municipal_user_invite_requests_status_date_idx
  ON public.municipal_user_invite_requests (status, requested_at DESC);
CREATE INDEX IF NOT EXISTS municipal_user_invite_requests_requester_idx
  ON public.municipal_user_invite_requests (requested_by, requested_at DESC);
CREATE INDEX IF NOT EXISTS municipal_user_invite_requests_user_idx
  ON public.municipal_user_invite_requests (invited_user_id);
CREATE INDEX IF NOT EXISTS municipal_user_invite_request_access_scope_idx
  ON public.municipal_user_invite_request_access (module_id, org_unit_id, request_id);

CREATE OR REPLACE FUNCTION public.municipal_invite_request_lock_pending_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  IF NEW.uuid IS NOT NULL AND NEW.email IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.municipal_user_invite_requests request_row
    WHERE (request_row.invited_auth_user_id = NEW.uuid OR lower(request_row.invitee_email) = lower(NEW.email))
      AND request_row.status IN ('SENDING', 'PENDING_ADMIN_APPROVAL')
  ) THEN
    NEW.ativo := false;
    NEW.desativado_em := COALESCE(NEW.desativado_em, now());
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_invite_request_lock_pending_user() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS municipal_invite_request_lock_pending_user ON public.usuarios;
CREATE TRIGGER municipal_invite_request_lock_pending_user
BEFORE INSERT OR UPDATE OF uuid, email, ativo ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.municipal_invite_request_lock_pending_user();

ALTER TABLE public.municipal_user_invite_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_user_invite_request_access ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.municipal_user_invite_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.municipal_user_invite_request_access FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.municipal_module_invite_request_prepare(
  p_name text,
  p_email text,
  p_role_id text,
  p_org_unit_id text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_email text := lower(btrim(COALESCE(p_email, '')));
  v_name text := btrim(COALESCE(p_name, ''));
  v_request_id uuid;
  v_user_id integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.municipal_module_access_can_manage('census') THEN
    RAISE EXCEPTION 'Gestão de acesso ao módulo Saúde não autorizada' USING ERRCODE = '42501';
  END IF;
  IF public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'O Admin do Sistema deve usar o fluxo global de convites' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) NOT BETWEEN 2 AND 160 THEN
    RAISE EXCEPTION 'Informe o nome completo do usuário';
  END IF;
  IF v_email IS NULL OR length(v_email) > 254 OR v_email !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' THEN
    RAISE EXCEPTION 'Informe um e-mail válido';
  END IF;
  IF p_role_id IS NULL OR NOT public.municipal_module_access_role_grantable('census', p_role_id) THEN
    RAISE EXCEPTION 'Este papel ainda não está liberado para convite no módulo Saúde';
  END IF;
  IF p_org_unit_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.municipal_module_access_scope_units('census') scoped
    JOIN public.municipal_org_units unit_row ON unit_row.id = scoped.id
    WHERE scoped.id = p_org_unit_id AND unit_row.is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'A unidade solicitada está fora do escopo autorizado ou inativa' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuarios u WHERE lower(u.email) = v_email) THEN
    RAISE EXCEPTION 'Este e-mail já possui uma conta municipal; localize e gerencie a identidade existente em vez de convidá-la novamente' USING ERRCODE = '23505';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.municipal_user_invite_requests request_row
    WHERE lower(request_row.invitee_email) = v_email
      AND request_row.status IN ('SENDING', 'PENDING_ADMIN_APPROVAL')
  ) THEN
    RAISE EXCEPTION 'Já existe um convite aberto para este e-mail' USING ERRCODE = '23505';
  END IF;
  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.uuid = auth.uid() AND u.ativo IS TRUE;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'A conta solicitante não está ativa' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.municipal_user_invite_requests(invitee_name, invitee_email, requested_by, status)
  VALUES (v_name, v_email, auth.uid(), 'SENDING')
  RETURNING id INTO v_request_id;
  INSERT INTO public.municipal_user_invite_request_access(request_id, module_id, role_id, org_unit_id)
  VALUES (v_request_id, 'census', p_role_id, p_org_unit_id);
  INSERT INTO public.municipal_access_audit(actor_user_id, target_user_id, action, details)
  VALUES (auth.uid(), NULL, 'INVITE_REQUEST_CREATED', jsonb_build_object(
    'request_id', v_request_id,
    'module_id', 'census',
    'role_id', p_role_id,
    'org_unit_id', p_org_unit_id
  ));
  RETURN v_request_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_invite_request_prepare(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_module_invite_request_prepare(text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_module_invite_request_finalize(
  p_request_id uuid,
  p_auth_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_request public.municipal_user_invite_requests%ROWTYPE;
  v_user_id integer;
  v_auth_email text;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Somente service_role' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_request FROM public.municipal_user_invite_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'SENDING' THEN
    RAISE EXCEPTION 'O pedido de convite não está em estado de envio';
  END IF;
  SELECT lower(u.email) INTO v_auth_email FROM auth.users u WHERE u.id = p_auth_user_id;
  IF v_auth_email IS NULL OR v_auth_email <> v_request.invitee_email THEN
    RAISE EXCEPTION 'A identidade Auth não corresponde ao e-mail solicitado';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE lower(u.email) = v_request.invitee_email AND u.uuid IS DISTINCT FROM p_auth_user_id
  ) THEN
    RAISE EXCEPTION 'E-mail já vinculado a outra conta municipal';
  END IF;

  SELECT u.id INTO v_user_id FROM public.usuarios u WHERE u.uuid = p_auth_user_id FOR UPDATE;
  IF v_user_id IS NULL THEN
    INSERT INTO public.usuarios(uuid, nome, email, perfil_municipal, ativo, desativado_em, primeiro_acesso, perfil_completo, convite_enviado_em)
    VALUES (p_auth_user_id, v_request.invitee_name, v_request.invitee_email, 'ADMINISTRATIVO', false, now(), true, false, now())
    RETURNING id INTO v_user_id;
  ELSE
    UPDATE public.usuarios
    SET nome = v_request.invitee_name,
        email = v_request.invitee_email,
        perfil_municipal = 'ADMINISTRATIVO',
        ativo = false,
        desativado_em = now(),
        primeiro_acesso = true,
        perfil_completo = false,
        convite_enviado_em = now(),
        updated_at = now()
    WHERE id = v_user_id;
  END IF;

  UPDATE public.municipal_user_invite_requests
  SET invited_auth_user_id = p_auth_user_id,
      invited_user_id = v_user_id,
      status = 'PENDING_ADMIN_APPROVAL',
      invitation_sent_at = now(),
      failure_reason = NULL
  WHERE id = p_request_id;
  INSERT INTO public.municipal_access_audit(actor_user_id, target_user_id, action, details)
  VALUES (v_request.requested_by, v_user_id, 'INVITE_REQUEST_SENT', jsonb_build_object(
    'request_id', p_request_id,
    'module_ids', ARRAY['census']::text[]
  ));
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_invite_request_finalize(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.municipal_module_invite_request_finalize(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.municipal_module_invite_request_fail(
  p_request_id uuid,
  p_auth_user_id uuid DEFAULT NULL,
  p_failure_reason text DEFAULT 'Falha ao enviar ou concluir o convite'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_user_id integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Somente service_role' USING ERRCODE = '42501';
  END IF;
  IF p_auth_user_id IS NOT NULL THEN
    UPDATE public.usuarios
    SET ativo = false, desativado_em = now(), updated_at = now()
    WHERE uuid = p_auth_user_id
    RETURNING id INTO v_user_id;
  END IF;
  UPDATE public.municipal_user_invite_requests
  SET status = 'FAILED',
      invited_auth_user_id = COALESCE(p_auth_user_id, invited_auth_user_id),
      invited_user_id = COALESCE(v_user_id, invited_user_id),
      failure_reason = left(COALESCE(NULLIF(btrim(p_failure_reason), ''), 'Falha ao concluir o convite'), 240)
  WHERE id = p_request_id AND status = 'SENDING';
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_invite_request_fail(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.municipal_module_invite_request_fail(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.municipal_module_invite_requests_list()
RETURNS TABLE(
  id uuid,
  invitee_name text,
  invitee_email text,
  module_id text,
  module_label text,
  role_id text,
  role_label text,
  org_unit_id text,
  org_unit_name text,
  status text,
  requested_at timestamptz,
  invitation_sent_at timestamptz,
  failure_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF auth.uid() IS NULL OR public.municipal_governance_is_admin()
     OR NOT public.municipal_module_access_can_manage('census') THEN
    RAISE EXCEPTION 'Gestão de acesso ao módulo Saúde não autorizada' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT request_row.id, request_row.invitee_name, request_row.invitee_email,
         access_row.module_id, module_row.label, access_row.role_id, role_row.label,
         access_row.org_unit_id, unit_row.name, request_row.status,
         request_row.requested_at, request_row.invitation_sent_at, request_row.failure_reason
  FROM public.municipal_user_invite_requests request_row
  JOIN public.municipal_user_invite_request_access access_row ON access_row.request_id = request_row.id
  JOIN public.municipal_modules module_row ON module_row.id = access_row.module_id
  JOIN public.municipal_roles role_row ON role_row.id = access_row.role_id
  JOIN public.municipal_org_units unit_row ON unit_row.id = access_row.org_unit_id
  WHERE access_row.module_id = 'census'
    AND access_row.org_unit_id IN (SELECT scoped.id FROM public.municipal_module_access_scope_units('census') scoped)
  ORDER BY request_row.requested_at DESC
  LIMIT 100;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_module_invite_requests_list() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_module_invite_requests_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_list_pending_invite_requests()
RETURNS TABLE(
  id uuid,
  invitee_name text,
  invitee_email text,
  requested_by_name text,
  requested_by_email text,
  module_id text,
  module_label text,
  role_id text,
  role_label text,
  org_unit_id text,
  org_unit_name text,
  requested_at timestamptz,
  invitation_sent_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT request_row.id, request_row.invitee_name, request_row.invitee_email,
         COALESCE(requester.nome, ''), requester.email,
         access_row.module_id, module_row.label, access_row.role_id, role_row.label,
         access_row.org_unit_id, unit_row.name, request_row.requested_at,
         request_row.invitation_sent_at
  FROM public.municipal_user_invite_requests request_row
  JOIN public.municipal_user_invite_request_access access_row ON access_row.request_id = request_row.id
  JOIN public.municipal_modules module_row ON module_row.id = access_row.module_id
  JOIN public.municipal_roles role_row ON role_row.id = access_row.role_id
  JOIN public.municipal_org_units unit_row ON unit_row.id = access_row.org_unit_id
  LEFT JOIN public.usuarios requester ON requester.uuid = request_row.requested_by
  WHERE request_row.status = 'PENDING_ADMIN_APPROVAL'
  ORDER BY request_row.requested_at ASC
  LIMIT 200;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_governance_list_pending_invite_requests() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_list_pending_invite_requests() TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_review_invite_request(
  p_request_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_request public.municipal_user_invite_requests%ROWTYPE;
  v_access record;
  v_assignment_id uuid;
  v_assignment_ids uuid[] := '{}'::uuid[];
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE = '42501';
  END IF;
  IF p_decision IS NULL OR p_decision NOT IN ('APPROVE', 'REJECT') THEN
    RAISE EXCEPTION 'Decisão inválida; use APPROVE ou REJECT';
  END IF;
  SELECT * INTO v_request
  FROM public.municipal_user_invite_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND OR v_request.status <> 'PENDING_ADMIN_APPROVAL' THEN
    RAISE EXCEPTION 'O convite não está mais aguardando aprovação';
  END IF;
  IF v_request.invited_user_id IS NULL OR v_request.invited_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'A conta convidada ainda não foi vinculada ao pedido';
  END IF;
  PERFORM 1 FROM public.usuarios
  WHERE id = v_request.invited_user_id AND uuid = v_request.invited_auth_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A conta municipal convidada não foi encontrada';
  END IF;

  IF p_decision = 'APPROVE' THEN
    IF EXISTS (
      SELECT 1 FROM public.municipal_user_assignments assignment_row
      WHERE assignment_row.user_id = v_request.invited_user_id AND assignment_row.active IS TRUE
    ) THEN
      RAISE EXCEPTION 'A conta já recebeu uma atribuição ativa; revise-a na Governança global antes de aprovar';
    END IF;
    FOR v_access IN
      SELECT access_row.module_id, access_row.role_id, access_row.org_unit_id, access_row.valid_until
      FROM public.municipal_user_invite_request_access access_row
      WHERE access_row.request_id = p_request_id
      ORDER BY access_row.module_id, access_row.org_unit_id
      FOR UPDATE
    LOOP
      IF NOT public.municipal_module_access_role_grantable(v_access.module_id, v_access.role_id)
         OR NOT public.municipal_role_module_compatible(v_access.role_id, v_access.module_id) THEN
        RAISE EXCEPTION 'O papel ou o módulo solicitado não está mais liberado';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.municipal_org_units unit_row
        WHERE unit_row.id = v_access.org_unit_id AND unit_row.is_active IS TRUE
      ) THEN
        RAISE EXCEPTION 'A unidade solicitada está inativa ou não existe mais';
      END IF;
      IF v_access.valid_until IS NOT NULL AND v_access.valid_until < current_date THEN
        RAISE EXCEPTION 'A validade do acesso solicitado já expirou';
      END IF;
      INSERT INTO public.municipal_user_assignments(user_id, org_unit_id, role_id, active, valid_until, created_by)
      VALUES (v_request.invited_user_id, v_access.org_unit_id, v_access.role_id, true, v_access.valid_until, auth.uid())
      RETURNING id INTO v_assignment_id;
      INSERT INTO public.municipal_assignment_modules(assignment_id, module_id)
      VALUES (v_assignment_id, v_access.module_id);
      v_assignment_ids := array_append(v_assignment_ids, v_assignment_id);
    END LOOP;
    IF cardinality(v_assignment_ids) = 0 THEN
      RAISE EXCEPTION 'O convite não possui acesso solicitado para conceder';
    END IF;
    UPDATE public.municipal_user_invite_requests
    SET status = 'APPROVED', reviewed_by = auth.uid(), reviewed_at = now(),
        assignment_ids = v_assignment_ids, review_note = NULL
    WHERE id = p_request_id;
    UPDATE public.usuarios
    SET ativo = true, reativado_em = now(), updated_at = now()
    WHERE id = v_request.invited_user_id;
    INSERT INTO public.municipal_access_audit(actor_user_id, target_user_id, assignment_id, action, details)
    VALUES (auth.uid(), v_request.invited_user_id, v_assignment_ids[1], 'INVITE_REQUEST_APPROVED', jsonb_build_object(
      'request_id', p_request_id,
      'assignment_ids', v_assignment_ids
    ));
    RETURN jsonb_build_object('success', true, 'status', 'APPROVED', 'assignment_ids', v_assignment_ids);
  END IF;

  UPDATE public.usuarios
  SET ativo = false, desativado_em = now(), updated_at = now()
  WHERE id = v_request.invited_user_id;
  UPDATE public.municipal_user_invite_requests
  SET status = 'REJECTED', reviewed_by = auth.uid(), reviewed_at = now(),
      review_note = 'Rejeitado pelo Admin do Sistema'
  WHERE id = p_request_id;
  INSERT INTO public.municipal_access_audit(actor_user_id, target_user_id, action, details)
  VALUES (auth.uid(), v_request.invited_user_id, 'INVITE_REQUEST_REJECTED', jsonb_build_object('request_id', p_request_id));
  RETURN jsonb_build_object('success', true, 'status', 'REJECTED');
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_governance_review_invite_request(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_review_invite_request(uuid, text) TO authenticated;

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
  SELECT u.id, u.uuid, u.nome::text, u.email::text, u.ativo,
         COALESCE(u.primeiro_acesso, false), u.convite_enviado_em, u.convite_aceito_em,
         COALESCE(u.perfil_municipal, u.perfil)::text,
         COALESCE((
           SELECT jsonb_agg(jsonb_build_object(
             'id', a.id, 'org_unit_id', a.org_unit_id, 'org_unit_name', ou.name,
             'org_unit_code', ou.code, 'role_id', a.role_id, 'role_label', r.label,
             'active', a.active, 'valid_from', a.valid_from, 'valid_until', a.valid_until,
             'module_ids', COALESCE((
               SELECT jsonb_agg(am.module_id ORDER BY am.module_id)
               FROM public.municipal_assignment_modules am WHERE am.assignment_id = a.id
             ), '[]'::jsonb)
           ) ORDER BY a.active DESC, ou.sort_order, ou.name)
           FROM public.municipal_user_assignments a
           JOIN public.municipal_org_units ou ON ou.id = a.org_unit_id
           JOIN public.municipal_roles r ON r.id = a.role_id
           WHERE a.user_id = u.id
         ), '[]'::jsonb)
  FROM public.usuarios u
  WHERE u.uuid IS NOT NULL
    AND COALESCE(u.perfil, '') NOT LIKE 'POSTO%'
    AND NOT EXISTS (
      SELECT 1 FROM public.municipal_user_invite_requests request_row
      WHERE lower(request_row.invitee_email) = lower(u.email)
        AND request_row.status IN ('SENDING', 'PENDING_ADMIN_APPROVAL')
    )
  ORDER BY u.ativo DESC, u.nome NULLS LAST, u.email
  LIMIT 500;
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_governance_list_users_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_list_users_v2() TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_get_my_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'auth'
AS $function$
DECLARE
  v_user public.usuarios%ROWTYPE;
  v_admin boolean := false;
  v_count integer := 0;
  v_assignments jsonb := '[]'::jsonb;
  v_modules jsonb := '[]'::jsonb;
  v_permissions jsonb := '[]'::jsonb;
  v_acs jsonb := NULL;
  v_invite_status text;
  v_initial_status text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('status', 'pending-assignment', 'user', NULL, 'is_administrator', false, 'assignments', '[]'::jsonb, 'module_ids', '[]'::jsonb, 'permission_ids', '[]'::jsonb, 'acs', NULL);
  END IF;
  SELECT u.* INTO v_user FROM public.usuarios u WHERE u.uuid = auth.uid() LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'pending-assignment', 'user', NULL, 'is_administrator', false, 'assignments', '[]'::jsonb, 'module_ids', '[]'::jsonb, 'permission_ids', '[]'::jsonb, 'acs', NULL);
  END IF;
  SELECT request_row.status INTO v_invite_status
  FROM public.municipal_user_invite_requests request_row
  WHERE request_row.invited_user_id = v_user.id OR lower(request_row.invitee_email) = lower(v_user.email)
  ORDER BY request_row.requested_at DESC
  LIMIT 1;
  IF v_invite_status IN ('SENDING', 'PENDING_ADMIN_APPROVAL') THEN
    v_initial_status := 'pending-approval';
  ELSIF v_user.ativo IS NOT TRUE THEN
    v_initial_status := CASE WHEN v_invite_status = 'REJECTED' THEN 'invite-rejected' ELSE 'inactive' END;
  END IF;
  IF v_initial_status IS NOT NULL THEN
    RETURN jsonb_build_object('status', v_initial_status,
      'user', jsonb_build_object('id', v_user.id, 'auth_user_id', v_user.uuid,
        'name', COALESCE(v_user.nome, ''), 'email', v_user.email,
        'avatar_url', v_user.foto_url, 'first_access_pending', COALESCE(v_user.primeiro_acesso, false)),
      'is_administrator', false, 'assignments', '[]'::jsonb,
      'module_ids', '[]'::jsonb, 'permission_ids', '[]'::jsonb, 'acs', NULL);
  END IF;
  SELECT EXISTS(
    SELECT 1 FROM public.municipal_user_assignments a
    JOIN public.municipal_roles r ON r.id = a.role_id
    JOIN public.municipal_org_units o ON o.id = a.org_unit_id
    WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.id = 'GOVERNANCE_ADMIN'
      AND r.is_active IS TRUE AND o.is_active IS TRUE
      AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date)
  ) INTO v_admin;
  SELECT count(*) INTO v_count
  FROM public.municipal_user_assignments a
  JOIN public.municipal_roles r ON r.id = a.role_id
  JOIN public.municipal_org_units o ON o.id = a.org_unit_id
  WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.is_active IS TRUE AND o.is_active IS TRUE
    AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date);
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id, 'org_unit_id', o.id, 'org_unit_name', o.name,
    'role_id', r.id, 'role_label', r.label,
    'module_ids', COALESCE((
      SELECT jsonb_agg(am.module_id ORDER BY am.module_id)
      FROM public.municipal_assignment_modules am
      JOIN public.municipal_modules m ON m.id = am.module_id
      WHERE am.assignment_id = a.id
    ), '[]'::jsonb),
    'scopes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('type', s.scope_type, 'key', s.scope_key) ORDER BY s.scope_type, s.scope_key)
      FROM public.municipal_assignment_scopes s WHERE s.assignment_id = a.id
    ), '[]'::jsonb)
  ) ORDER BY o.sort_order, o.name), '[]'::jsonb)
  INTO v_assignments
  FROM public.municipal_user_assignments a
  JOIN public.municipal_roles r ON r.id = a.role_id
  JOIN public.municipal_org_units o ON o.id = a.org_unit_id
  WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.is_active IS TRUE AND o.is_active IS TRUE
    AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date);
  IF v_admin THEN
    SELECT COALESCE(jsonb_agg(m.id ORDER BY m.sort_order, m.id), '[]'::jsonb) INTO v_modules FROM public.municipal_modules m;
    SELECT COALESCE(jsonb_agg(p.id ORDER BY p.id), '[]'::jsonb) INTO v_permissions FROM public.municipal_permissions p;
  ELSE
    SELECT COALESCE(jsonb_agg(DISTINCT am.module_id ORDER BY am.module_id), '[]'::jsonb)
    INTO v_modules
    FROM public.municipal_assignment_modules am
    JOIN public.municipal_user_assignments a ON a.id = am.assignment_id
    JOIN public.municipal_roles r ON r.id = a.role_id
    JOIN public.municipal_org_units o ON o.id = a.org_unit_id
    JOIN public.municipal_modules m ON m.id = am.module_id
    WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.is_active IS TRUE AND o.is_active IS TRUE
      AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date);
    SELECT COALESCE(jsonb_agg(DISTINCT rp.permission_id ORDER BY rp.permission_id), '[]'::jsonb)
    INTO v_permissions
    FROM public.municipal_role_permissions rp
    JOIN public.municipal_user_assignments a ON a.role_id = rp.role_id
    JOIN public.municipal_roles r ON r.id = a.role_id
    JOIN public.municipal_org_units o ON o.id = a.org_unit_id
    WHERE a.user_id = v_user.id AND a.active IS TRUE AND r.is_active IS TRUE AND o.is_active IS TRUE
      AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until, current_date);
  END IF;
  SELECT jsonb_build_object('id', acs.id, 'full_name', acs.full_name, 'active', acs.active)
  INTO v_acs
  FROM public.health_professionals acs
  JOIN public.usuarios u ON u.id = acs.user_id
  JOIN public.health_professional_assignments assignment ON assignment.professional_id = acs.id
  WHERE u.uuid = auth.uid() AND u.ativo IS TRUE AND acs.professional_category = 'ACS'
    AND acs.active IS TRUE AND assignment.role_id = 'ACS' AND assignment.active IS TRUE
    AND current_date >= assignment.valid_from
    AND (assignment.valid_until IS NULL OR current_date <= assignment.valid_until)
  ORDER BY assignment.valid_from DESC, assignment.created_at DESC
  LIMIT 1;
  RETURN jsonb_build_object('status', CASE WHEN v_count = 0 THEN 'pending-assignment' ELSE 'ready' END,
    'user', jsonb_build_object('id', v_user.id, 'auth_user_id', v_user.uuid,
      'name', COALESCE(v_user.nome, ''), 'email', v_user.email,
      'avatar_url', v_user.foto_url, 'first_access_pending', COALESCE(v_user.primeiro_acesso, false)),
    'is_administrator', v_admin, 'assignments', v_assignments,
    'module_ids', v_modules, 'permission_ids', v_permissions, 'acs', v_acs);
END;
$function$;
REVOKE ALL ON FUNCTION public.municipal_governance_get_my_context() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_get_my_context() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
