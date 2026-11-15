BEGIN;

-- Complementos locais para preservar qualidade sem afirmar códigos oficiais do e-SUS.
ALTER TABLE public.census_households
  ADD COLUMN IF NOT EXISTS address_validation_status text NOT NULL DEFAULT 'UNCONFIRMED',
  ADD COLUMN IF NOT EXISTS address_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS address_source text NOT NULL DEFAULT 'FIELD_COLLECTION';

ALTER TABLE public.census_citizens
  ADD COLUMN IF NOT EXISTS cns_validation_status text NOT NULL DEFAULT 'NOT_INFORMED',
  ADD COLUMN IF NOT EXISTS cpf_validation_status text NOT NULL DEFAULT 'NOT_INFORMED',
  ADD COLUMN IF NOT EXISTS identifiers_validated_at timestamptz;

ALTER TABLE public.census_visits
  ADD COLUMN IF NOT EXISTS territory_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.census_households
  DROP CONSTRAINT IF EXISTS census_households_address_validation_status_check;
ALTER TABLE public.census_households
  ADD CONSTRAINT census_households_address_validation_status_check
  CHECK (address_validation_status IN ('UNCONFIRMED','PARTIAL','STRUCTURED','REVIEW_REQUIRED'));

ALTER TABLE public.census_citizens
  DROP CONSTRAINT IF EXISTS census_citizens_identifier_status_check;
ALTER TABLE public.census_citizens
  ADD CONSTRAINT census_citizens_identifier_status_check
  CHECK (cns_validation_status IN ('NOT_INFORMED','FORMAT_VALID','INVALID')
    AND cpf_validation_status IN ('NOT_INFORMED','CHECK_DIGIT_VALID','INVALID'));

CREATE TABLE IF NOT EXISTS public.census_family_relationship_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source text NOT NULL DEFAULT 'municipal_foundation_v1',
  active boolean NOT NULL DEFAULT true,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  UNIQUE (code, version),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

INSERT INTO public.census_family_relationship_catalog (code, label, version, source)
VALUES
  ('MEMBER', 'Membro da família', 1, 'municipal_foundation_v1'),
  ('RESPONSIBLE', 'Responsável familiar', 1, 'municipal_foundation_v1'),
  ('SPOUSE', 'Cônjuge ou companheiro(a)', 1, 'municipal_foundation_v1'),
  ('CHILD', 'Filho(a)', 1, 'municipal_foundation_v1'),
  ('PARENT', 'Pai ou mãe', 1, 'municipal_foundation_v1'),
  ('OTHER', 'Outro vínculo', 1, 'municipal_foundation_v1')
ON CONFLICT (code, version) DO UPDATE
SET label = EXCLUDED.label, source = EXCLUDED.source, active = true;

ALTER TABLE public.census_family_relationship_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS census_family_relationship_catalog_read ON public.census_family_relationship_catalog;
CREATE POLICY census_family_relationship_catalog_read
  ON public.census_family_relationship_catalog FOR SELECT TO authenticated
  USING (active IS TRUE);
REVOKE ALL ON public.census_family_relationship_catalog FROM PUBLIC, anon;
GRANT SELECT ON public.census_family_relationship_catalog TO authenticated;
GRANT ALL ON public.census_family_relationship_catalog TO service_role;

CREATE OR REPLACE FUNCTION public.census_is_valid_cpf(p_value text)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  v_sum integer := 0;
  v_digit integer;
  i integer;
BEGIN
  IF v !~ '^[0-9]{11}$' OR v ~ '^(.)\\1{10}$' THEN RETURN false; END IF;
  FOR i IN 1..9 LOOP v_sum := v_sum + substring(v, i, 1)::integer * (11 - i); END LOOP;
  v_digit := (v_sum * 10) % 11;
  IF v_digit = 10 THEN v_digit := 0; END IF;
  IF v_digit <> substring(v, 10, 1)::integer THEN RETURN false; END IF;
  v_sum := 0;
  FOR i IN 1..10 LOOP v_sum := v_sum + substring(v, i, 1)::integer * (12 - i); END LOOP;
  v_digit := (v_sum * 10) % 11;
  IF v_digit = 10 THEN v_digit := 0; END IF;
  RETURN v_digit = substring(v, 11, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.census_prepare_household_address()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_postal text;
BEGIN
  new.address_line := nullif(btrim(new.address_line), '');
  new.address_number := nullif(btrim(new.address_number), '');
  new.address_complement := nullif(btrim(new.address_complement), '');
  new.neighborhood := nullif(btrim(new.neighborhood), '');
  new.locality := nullif(btrim(new.locality), '');
  v_postal := nullif(regexp_replace(coalesce(new.postal_code, ''), '[^0-9]', '', 'g'), '');
  IF v_postal IS NOT NULL AND v_postal !~ '^[0-9]{8}$' THEN
    RAISE EXCEPTION 'Informe um CEP com 8 dígitos.' USING ERRCODE = '23514';
  END IF;
  new.postal_code := v_postal;
  IF new.latitude IS NOT NULL AND (new.latitude < -90 OR new.latitude > 90) THEN
    RAISE EXCEPTION 'A latitude deve estar entre -90 e 90.' USING ERRCODE = '23514';
  END IF;
  IF new.longitude IS NOT NULL AND (new.longitude < -180 OR new.longitude > 180) THEN
    RAISE EXCEPTION 'A longitude deve estar entre -180 e 180.' USING ERRCODE = '23514';
  END IF;
  IF new.address_line IS NOT NULL AND new.locality IS NOT NULL THEN
    new.address_validation_status := 'STRUCTURED';
    new.address_validated_at := now();
  ELSIF new.address_line IS NOT NULL OR new.locality IS NOT NULL OR new.postal_code IS NOT NULL THEN
    new.address_validation_status := 'PARTIAL';
    new.address_validated_at := null;
  ELSE
    new.address_validation_status := 'UNCONFIRMED';
    new.address_validated_at := null;
  END IF;
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS census_households_prepare_address ON public.census_households;
CREATE TRIGGER census_households_prepare_address
BEFORE INSERT OR UPDATE ON public.census_households
FOR EACH ROW EXECUTE FUNCTION public.census_prepare_household_address();

CREATE OR REPLACE FUNCTION public.census_prepare_citizen_identifiers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cns text := nullif(regexp_replace(coalesce(new.cns, ''), '[^0-9]', '', 'g'), '');
  v_cpf text := nullif(regexp_replace(coalesce(new.cpf, ''), '[^0-9]', '', 'g'), '');
BEGIN
  new.full_name := btrim(new.full_name);
  new.preferred_name := nullif(btrim(new.preferred_name), '');
  new.cns := v_cns;
  new.cpf := v_cpf;
  IF v_cns IS NULL THEN
    new.cns_validation_status := 'NOT_INFORMED';
  ELSIF v_cns !~ '^[0-9]{15}$' THEN
    RAISE EXCEPTION 'O CNS deve conter 15 dígitos.' USING ERRCODE = '23514';
  ELSE
    new.cns_validation_status := 'FORMAT_VALID';
  END IF;
  IF v_cpf IS NULL THEN
    new.cpf_validation_status := 'NOT_INFORMED';
  ELSIF v_cpf !~ '^[0-9]{11}$' OR NOT public.census_is_valid_cpf(v_cpf) THEN
    RAISE EXCEPTION 'Informe um CPF válido ou deixe o campo em branco.' USING ERRCODE = '23514';
  ELSE
    new.cpf_validation_status := 'CHECK_DIGIT_VALID';
  END IF;
  IF TG_OP = 'INSERT' OR new.cns IS DISTINCT FROM old.cns OR new.cpf IS DISTINCT FROM old.cpf THEN
    new.identifiers_validated_at := now();
  END IF;
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS census_citizens_prepare_identifiers ON public.census_citizens;
CREATE TRIGGER census_citizens_prepare_identifiers
BEFORE INSERT OR UPDATE ON public.census_citizens
FOR EACH ROW EXECUTE FUNCTION public.census_prepare_citizen_identifiers();

CREATE OR REPLACE FUNCTION public.census_validate_family_relationship()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.census_family_relationship_catalog c
    WHERE c.code = new.relationship_code AND c.active IS TRUE
      AND current_date BETWEEN c.valid_from AND coalesce(c.valid_until, current_date)
  ) THEN
    RAISE EXCEPTION 'Vínculo familiar não está disponível no catálogo vigente.' USING ERRCODE = '23514';
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS census_family_members_validate_relationship ON public.census_family_members;
CREATE TRIGGER census_family_members_validate_relationship
BEFORE INSERT OR UPDATE ON public.census_family_members
FOR EACH ROW EXECUTE FUNCTION public.census_validate_family_relationship();

CREATE OR REPLACE FUNCTION public.census_register_fvd(
  p_task_id uuid,
  p_household_id uuid,
  p_family_id uuid,
  p_citizen_id uuid,
  p_visit_date date,
  p_reason_codes text[],
  p_outcome_code text,
  p_notes text,
  p_guidance text,
  p_referral text,
  p_return_date date
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id integer;
  v_professional public.health_professionals%ROWTYPE;
  v_task public.census_agenda_tasks%ROWTYPE;
  v_outcome public.census_visit_outcome_catalog%ROWTYPE;
  v_visit_id uuid;
  v_status text;
  v_municipality_id uuid;
  v_establishment_id uuid;
  v_team_id uuid;
  v_microarea_id uuid;
  v_territory_snapshot jsonb;
BEGIN
  SELECT id INTO v_user_id FROM public.usuarios WHERE uuid = auth.uid() AND ativo IS TRUE;
  SELECT p.* INTO v_professional FROM public.health_professionals p WHERE p.user_id = v_user_id AND p.active IS TRUE LIMIT 1;
  IF v_professional.id IS NULL THEN RAISE EXCEPTION 'Usuário sem vínculo de profissional de saúde ativo.' USING ERRCODE = '42501'; END IF;
  IF NOT public.census_user_can_access_household(p_household_id) THEN RAISE EXCEPTION 'O domicílio está fora do escopo territorial do profissional.' USING ERRCODE = '42501'; END IF;

  v_municipality_id := v_professional.municipality_id;
  SELECT a.municipality_id, a.establishment_id, a.team_id, a.microarea_id
    INTO v_municipality_id, v_establishment_id, v_team_id, v_microarea_id
  FROM public.health_professional_assignments a
  WHERE a.professional_id = v_professional.id AND a.active IS TRUE
    AND current_date BETWEEN a.valid_from AND coalesce(a.valid_until, current_date)
  ORDER BY a.valid_from DESC, a.created_at DESC
  LIMIT 1;

  IF p_task_id IS NOT NULL THEN
    SELECT * INTO v_task FROM public.census_agenda_tasks WHERE id = p_task_id FOR UPDATE;
    IF v_task.id IS NULL THEN RAISE EXCEPTION 'Tarefa de agenda não encontrada.'; END IF;
    IF v_task.professional_id IS NOT NULL AND v_task.professional_id <> v_professional.id THEN RAISE EXCEPTION 'A tarefa pertence a outro profissional.' USING ERRCODE = '42501'; END IF;
    v_municipality_id := coalesce(v_municipality_id, v_task.municipality_id);
    v_establishment_id := coalesce(v_establishment_id, v_task.establishment_id);
    v_team_id := coalesce(v_team_id, v_task.team_id);
    v_microarea_id := coalesce(v_microarea_id, v_task.microarea_id);
  END IF;

  SELECT * INTO v_outcome FROM public.census_visit_outcome_catalog
  WHERE code = p_outcome_code AND active IS TRUE
    AND current_date BETWEEN valid_from AND coalesce(valid_until, current_date)
  ORDER BY version DESC LIMIT 1;
  IF v_outcome.id IS NULL THEN RAISE EXCEPTION 'Desfecho de visita inválido.' USING ERRCODE = '23514'; END IF;
  IF p_outcome_code <> 'REALIZADA' AND nullif(btrim(coalesce(p_notes, '')), '') IS NULL THEN RAISE EXCEPTION 'Informe uma justificativa para este desfecho.' USING ERRCODE = '23514'; END IF;
  IF p_return_date IS NOT NULL AND p_return_date < p_visit_date THEN RAISE EXCEPTION 'A data de retorno não pode ser anterior à visita.' USING ERRCODE = '23514'; END IF;

  v_status := CASE WHEN p_outcome_code IN ('AUSENTE','RECUSA','DOMICILIO_FECHADO','ENDERECO_NAO_LOCALIZADO') THEN 'NO_CONTACT' ELSE 'COMPLETED' END;
  SELECT jsonb_build_object(
    'version', 1,
    'status', CASE WHEN v_establishment_id IS NULL OR v_team_id IS NULL OR v_microarea_id IS NULL THEN 'PARTIAL' ELSE 'COMPLETE' END,
    'municipality_id', v_municipality_id,
    'establishment_id', v_establishment_id,
    'team_id', v_team_id,
    'microarea_id', v_microarea_id,
    'captured_at', now()
  ) INTO v_territory_snapshot;

  INSERT INTO public.census_visits(
    household_id, acs_id, visit_date, status, notes, created_by, visit_type, agenda_task_id,
    municipality_id, establishment_id, team_id, microarea_id, professional_id, family_id, citizen_id,
    outcome_id, outcome_version, guidance, referral, return_date, source, processing_status, territory_snapshot
  )
  SELECT p_household_id, acs.id, p_visit_date, v_status, coalesce(p_notes, ''), auth.uid(), 'FVD', p_task_id,
    v_municipality_id, v_establishment_id, v_team_id, v_microarea_id, v_professional.id, p_family_id, p_citizen_id,
    v_outcome.id, v_outcome.version, coalesce(p_guidance, ''), coalesce(p_referral, ''), p_return_date,
    'municipal_collection', 'LOCALLY_VALIDATED', v_territory_snapshot
  FROM public.census_acs acs
  WHERE acs.professional_id = v_professional.id AND acs.active IS TRUE
  ORDER BY acs.id LIMIT 1
  RETURNING id INTO v_visit_id;
  IF v_visit_id IS NULL THEN RAISE EXCEPTION 'O profissional ainda não possui cadastro ACS operacional ativo.' USING ERRCODE = '23514'; END IF;

  INSERT INTO public.census_visit_reason_links(visit_id, reason_id, reason_version)
  SELECT v_visit_id, r.id, r.version FROM public.census_visit_reason_catalog r
  WHERE r.code = ANY(coalesce(p_reason_codes, '{}'::text[])) AND r.active IS TRUE
    AND current_date BETWEEN r.valid_from AND coalesce(r.valid_until, current_date);
  IF p_task_id IS NOT NULL THEN
    UPDATE public.census_agenda_tasks SET status = 'COMPLETED', completed_visit_id = v_visit_id, updated_at = now() WHERE id = p_task_id;
  END IF;
  RETURN v_visit_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.census_foundation_my_context()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_user_id integer;
  v_professional jsonb;
  v_assignments jsonb;
  v_tasks jsonb;
BEGIN
  SELECT id INTO v_user_id FROM public.usuarios WHERE uuid = auth.uid() AND ativo IS TRUE;
  SELECT jsonb_build_object('id', p.id, 'user_id', p.user_id, 'municipality_id', p.municipality_id, 'full_name', p.full_name, 'professional_category', p.professional_category, 'cns', p.cns, 'cbo', p.cbo, 'active', p.active)
    INTO v_professional FROM public.health_professionals p WHERE p.user_id = v_user_id AND p.active IS TRUE LIMIT 1;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'role_id', a.role_id, 'municipality_id', a.municipality_id, 'establishment_id', a.establishment_id, 'team_id', a.team_id, 'microarea_id', a.microarea_id, 'valid_from', a.valid_from, 'valid_until', a.valid_until) ORDER BY a.valid_from DESC), '[]'::jsonb)
    INTO v_assignments FROM public.health_professional_assignments a JOIN public.health_professionals p ON p.id = a.professional_id
    WHERE p.user_id = v_user_id AND p.active IS TRUE AND a.active IS TRUE AND current_date BETWEEN a.valid_from AND coalesce(a.valid_until, current_date);
  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', t.id, 'due_date', t.due_date, 'priority', t.priority, 'status', t.status, 'task_type', t.task_type, 'instructions', t.instructions,
      'household_id', t.household_id, 'family_id', t.family_id, 'citizen_id', t.citizen_id, 'family_reference', f.family_reference,
      'citizen_name', c.full_name, 'reason_code', r.code, 'reason_label', r.label,
      'address_line', h.address_line, 'address_number', h.address_number, 'address_complement', h.address_complement,
      'neighborhood', h.neighborhood, 'locality', h.locality, 'postal_code', h.postal_code
    ) ORDER BY t.status, t.due_date, t.priority DESC), '[]'::jsonb)
    INTO v_tasks FROM public.census_agenda_tasks t
    LEFT JOIN public.census_households h ON h.id = t.household_id
    LEFT JOIN public.census_families f ON f.id = t.family_id
    LEFT JOIN public.census_citizens c ON c.id = t.citizen_id
    LEFT JOIN public.census_visit_reason_catalog r ON r.id = t.reason_id
    WHERE (t.professional_id = (v_professional ->> 'id')::uuid OR (t.professional_id IS NULL AND t.household_id IS NOT NULL AND public.census_user_can_access_household(t.household_id)));
  RETURN jsonb_build_object('status', CASE WHEN v_professional IS NULL THEN 'pending-assignment' ELSE 'ready' END, 'professional', v_professional, 'assignments', v_assignments, 'tasks', v_tasks);
END;
$$;

REVOKE ALL ON FUNCTION public.census_is_valid_cpf(text), public.census_prepare_household_address(), public.census_prepare_citizen_identifiers(), public.census_validate_family_relationship() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.census_register_fvd(uuid,uuid,uuid,uuid,date,text[],text,text,text,text,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.census_foundation_my_context() TO authenticated;

COMMIT;
