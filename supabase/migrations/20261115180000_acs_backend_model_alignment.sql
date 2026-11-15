BEGIN;

-- 1) A identidade, o território e as autorizações operacionais são os do modelo Saúde.
-- O catálogo antigo census_acs fica vazio e somente para compatibilidade de leitura.

-- Preserva a referência legada das visitas no snapshot, mas não mantém dependência
-- referencial do cadastro antigo. created_by permanece intacto como autoria da operação.
ALTER TABLE public.census_visits DISABLE TRIGGER USER;
UPDATE public.census_visits v
SET acs_id = NULL,
    professional_id = COALESCE(v.professional_id, old_acs.professional_id),
    territory_snapshot = COALESCE(v.territory_snapshot, '{}'::jsonb)
      || jsonb_build_object(
        'legacy_acs_archive',
        jsonb_build_object(
          'legacy_acs_id', old_acs.id,
          'display_name', old_acs.full_name,
          'historical_user_id', old_acs.user_id,
          'archived_at', now()
        )
      )
FROM public.census_acs old_acs
WHERE v.acs_id = old_acs.id;
ALTER TABLE public.census_visits ENABLE TRIGGER USER;

-- Atribuições diretas mantêm o vínculo novo de profissional quando disponível;
-- atribuições que só tinham ACS legado são encerradas, sem apagar o histórico.
UPDATE public.census_lot_acs_assignments a
SET professional_id = COALESCE(a.professional_id, old_acs.professional_id),
    acs_id = NULL,
    active = CASE
      WHEN COALESCE(a.professional_id, old_acs.professional_id) IS NULL THEN false
      ELSE a.active
    END,
    updated_at = now()
FROM public.census_acs old_acs
WHERE a.acs_id = old_acs.id;

-- Os vínculos de zona antigos não são mais fonte de autorização.
DELETE FROM public.census_acs_zone_assignments;
DELETE FROM public.census_acs;

REVOKE INSERT, UPDATE, DELETE ON public.census_acs FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.census_acs_zone_assignments FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.census_save_acs_zone_assignment(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 2) Autorização territorial centralizada no profissional ACS + microárea vigente.
DROP POLICY IF EXISTS census_map_lots_select_accessible ON public.census_map_lots;
CREATE POLICY census_map_lots_select_accessible
  ON public.census_map_lots FOR SELECT TO authenticated
  USING (
    app_private.current_user_is_admin()
    OR public.census_user_can_access_lot(id)
    OR (
      public.municipal_user_has_module('census')
      AND (
        public.municipal_user_has_role('SYSTEM_ADMIN')
        OR public.municipal_user_has_role('EXECUTIVE_VIEW')
        OR public.municipal_user_has_role('UNIT_MANAGER')
      )
    )
  );

DROP POLICY IF EXISTS census_zones_select_accessible ON public.census_zones;
CREATE POLICY census_zones_select_accessible
  ON public.census_zones FOR SELECT TO authenticated
  USING (
    app_private.current_user_is_admin()
    OR (
      public.municipal_user_has_module('census')
      AND (
        public.municipal_user_has_role('SYSTEM_ADMIN')
        OR public.municipal_user_has_role('EXECUTIVE_VIEW')
        OR public.municipal_user_has_role('UNIT_MANAGER')
      )
    )
    OR (
      public.municipal_user_has_module('census')
      AND microarea_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.health_professional_assignments a
        WHERE a.professional_id = public.census_current_professional_id()
          AND a.microarea_id = census_zones.microarea_id
          AND a.role_id = 'ACS'
          AND a.active IS TRUE
          AND current_date >= a.valid_from
          AND (a.valid_until IS NULL OR current_date <= a.valid_until)
      )
    )
  );

DROP POLICY IF EXISTS census_households_select_assigned ON public.census_households;
CREATE POLICY census_households_select_assigned
  ON public.census_households FOR SELECT TO authenticated
  USING (public.census_user_can_access_household(id));
DROP POLICY IF EXISTS census_households_insert_assigned ON public.census_households;
CREATE POLICY census_households_insert_assigned
  ON public.census_households FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.census_user_can_access_lot(lot_id)
  );
DROP POLICY IF EXISTS census_households_update_assigned ON public.census_households;
CREATE POLICY census_households_update_assigned
  ON public.census_households FOR UPDATE TO authenticated
  USING (public.census_user_can_access_household(id))
  WITH CHECK (public.census_user_can_access_lot(lot_id));

DROP POLICY IF EXISTS census_visits_select_assigned ON public.census_visits;
CREATE POLICY census_visits_select_assigned
  ON public.census_visits FOR SELECT TO authenticated
  USING (public.census_user_can_access_household(household_id));
DROP POLICY IF EXISTS census_visits_insert_assigned ON public.census_visits;
CREATE POLICY census_visits_insert_assigned
  ON public.census_visits FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND public.census_user_can_access_household(household_id)
  );
DROP POLICY IF EXISTS census_visits_update_assigned ON public.census_visits;
CREATE POLICY census_visits_update_assigned
  ON public.census_visits FOR UPDATE TO authenticated
  USING (public.census_user_can_access_household(household_id))
  WITH CHECK (public.census_user_can_access_household(household_id));

DROP POLICY IF EXISTS census_responses_select_assigned ON public.census_questionnaire_responses;
CREATE POLICY census_responses_select_assigned
  ON public.census_questionnaire_responses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.census_visits v
      WHERE v.id = census_questionnaire_responses.visit_id
        AND public.census_user_can_access_household(v.household_id)
    )
  );
DROP POLICY IF EXISTS census_responses_insert_assigned ON public.census_questionnaire_responses;
CREATE POLICY census_responses_insert_assigned
  ON public.census_questionnaire_responses FOR INSERT TO authenticated
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.census_visits v
      WHERE v.id = census_questionnaire_responses.visit_id
        AND public.census_user_can_access_household(v.household_id)
    )
  );
DROP POLICY IF EXISTS census_responses_update_assigned ON public.census_questionnaire_responses;
CREATE POLICY census_responses_update_assigned
  ON public.census_questionnaire_responses FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.census_visits v
      WHERE v.id = census_questionnaire_responses.visit_id
        AND public.census_user_can_access_household(v.household_id)
    )
  )
  WITH CHECK (
    created_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.census_visits v
      WHERE v.id = census_questionnaire_responses.visit_id
        AND public.census_user_can_access_household(v.household_id)
    )
  );

DROP POLICY IF EXISTS census_citizens_scope ON public.census_citizens;
CREATE POLICY census_citizens_scope
  ON public.census_citizens FOR ALL TO authenticated
  USING (
    app_private.current_user_is_admin()
    OR (
      family_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.census_families f
        WHERE f.id = census_citizens.family_id
          AND public.census_user_can_access_household(f.household_id)
      )
    )
  )
  WITH CHECK (
    app_private.current_user_is_admin()
    OR (
      family_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.census_families f
        WHERE f.id = census_citizens.family_id
          AND f.active IS TRUE
          AND public.census_user_can_access_household(f.household_id)
      )
    )
  );

-- A visita operacional passa a gravar profissional, nunca ACS do catálogo legado.
CREATE OR REPLACE FUNCTION public.census_visits_assign_acs_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, app_private
AS $$
DECLARE
  v_professional_id uuid;
  v_assignment public.health_professional_assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário autenticar para registrar uma visita.' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.household_id IS DISTINCT FROM OLD.household_id
       OR NEW.acs_id IS DISTINCT FROM OLD.acs_id
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
       OR NEW.microarea_id IS DISTINCT FROM OLD.microarea_id THEN
      RAISE EXCEPTION 'O domicílio e a autoria profissional da visita são imutáveis.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  NEW.created_by := auth.uid();
  NEW.acs_id := NULL;
  IF app_private.current_user_is_admin() THEN
    IF NEW.professional_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.health_professionals p
      WHERE p.id = NEW.professional_id AND p.active IS TRUE
        AND p.professional_category = 'ACS'
    ) THEN
      RAISE EXCEPTION 'O profissional informado não é um ACS ativo.' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  v_professional_id := public.census_current_professional_id();
  IF v_professional_id IS NULL
     OR NOT public.census_user_can_access_household(NEW.household_id) THEN
    RAISE EXCEPTION 'O domicílio está fora do escopo territorial do ACS.' USING ERRCODE = '42501';
  END IF;

  SELECT a.* INTO v_assignment
  FROM public.health_professional_assignments a
  WHERE a.professional_id = v_professional_id
    AND a.role_id = 'ACS'
    AND a.active IS TRUE
    AND current_date >= a.valid_from
    AND (a.valid_until IS NULL OR current_date <= a.valid_until)
  ORDER BY a.valid_from DESC, a.created_at DESC
  LIMIT 1;
  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'O ACS não possui vínculo territorial vigente.' USING ERRCODE = '42501';
  END IF;
  IF NEW.professional_id IS NOT NULL AND NEW.professional_id <> v_professional_id THEN
    RAISE EXCEPTION 'O profissional responsável é definido pela conta autenticada.' USING ERRCODE = '42501';
  END IF;

  NEW.professional_id := v_professional_id;
  NEW.municipality_id := v_assignment.municipality_id;
  NEW.establishment_id := v_assignment.establishment_id;
  NEW.team_id := v_assignment.team_id;
  NEW.microarea_id := v_assignment.microarea_id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.census_visits_assign_acs_actor() FROM PUBLIC, anon, authenticated;

-- 3) Exclusões de lotes residenciais: comércio/área municipal ficam fora dos indicadores.
ALTER TABLE public.census_lot_indicator_exclusions
  DROP CONSTRAINT IF EXISTS census_lot_indicator_exclusions_reason_check;
ALTER TABLE public.census_lot_indicator_exclusions
  ADD CONSTRAINT census_lot_indicator_exclusions_reason_check
  CHECK (reason IN ('VACANT', 'PUBLIC', 'COMMERCE', 'MUNICIPAL_AREA'));

CREATE OR REPLACE FUNCTION public.census_set_lot_indicator_exclusion(
  p_lot_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, auth
AS $$
DECLARE
  v_current_reason text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.census_user_can_access_lot(p_lot_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao lote.' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('VACANT', 'PUBLIC', 'COMMERCE', 'MUNICIPAL_AREA') THEN
    RAISE EXCEPTION 'Selecione Comércio ou Área da Prefeitura para excluir o lote dos indicadores.' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_lot_id::text, 0));
  SELECT exclusion.reason INTO v_current_reason
  FROM public.census_map_lots lot
  JOIN public.census_map_imports map_import
    ON map_import.id = lot.import_id
   AND map_import.is_current IS TRUE
   AND map_import.status = 'PUBLISHED'
   AND map_import.division_saved_at IS NOT NULL
  LEFT JOIN public.census_lot_indicator_exclusions exclusion ON exclusion.lot_id = lot.id
  WHERE lot.id = p_lot_id AND lot.is_valid IS TRUE
  FOR UPDATE OF lot;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O lote não pertence ao mapa operacional atual.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.census_households h
    WHERE h.lot_id = p_lot_id AND h.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Este lote possui domicílio residencial. Não pode ser excluído dos indicadores como comércio ou área pública.' USING ERRCODE = '23514';
  END IF;

  IF v_current_reason IS DISTINCT FROM p_reason THEN
    INSERT INTO public.census_lot_indicator_exclusions (lot_id, reason, excluded_by, excluded_at)
    VALUES (p_lot_id, p_reason, auth.uid(), now())
    ON CONFLICT (lot_id) DO UPDATE
      SET reason = EXCLUDED.reason, excluded_by = EXCLUDED.excluded_by, excluded_at = EXCLUDED.excluded_at;
    INSERT INTO public.census_lot_indicator_exclusion_history (lot_id, action, reason, changed_by)
    VALUES (p_lot_id, CASE WHEN v_current_reason IS NULL THEN 'EXCLUDED' ELSE 'REASON_CHANGED' END, p_reason, auth.uid());
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.census_set_lot_indicator_exclusion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.census_set_lot_indicator_exclusion(uuid, text) TO authenticated;

-- 4) Família é uma relação versionada: somente um vínculo ativo por cidadão.
CREATE UNIQUE INDEX IF NOT EXISTS census_family_members_one_active_family_per_citizen_idx
  ON public.census_family_members (citizen_id)
  WHERE valid_until IS NULL;
CREATE INDEX IF NOT EXISTS census_family_members_active_family_idx
  ON public.census_family_members (family_id, citizen_id)
  WHERE valid_until IS NULL;

CREATE OR REPLACE FUNCTION public.census_family_members_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'O vínculo familiar não pode ser apagado; encerre-o para preservar o histórico.' USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.valid_until IS NOT NULL THEN
      RAISE EXCEPTION 'Um vínculo familiar histórico é imutável.' USING ERRCODE = '23514';
    END IF;
    IF current_setting('app.census_family_transfer', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Use a operação de transferência para alterar a composição familiar.' USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.relationship_code IS DISTINCT FROM OLD.relationship_code
     OR NEW.is_responsible IS DISTINCT FROM OLD.is_responsible THEN
    IF NEW.is_responsible IS TRUE THEN
      NEW.relationship_code := 'RESPONSIBLE';
    ELSIF NEW.relationship_code = 'RESPONSIBLE' THEN
      NEW.relationship_code := 'MEMBER';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.census_families f
    WHERE f.id = NEW.family_id AND f.active IS TRUE
      AND public.census_user_can_access_household(f.household_id)
  ) THEN
    RAISE EXCEPTION 'A família de destino não está ativa ou fora do território autorizado.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.census_citizens c
    WHERE c.id = NEW.citizen_id AND c.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'O cidadão precisa estar ativo para integrar uma família.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.census_family_relationship_catalog r
    WHERE r.code = NEW.relationship_code AND r.active IS TRUE
      AND current_date >= r.valid_from
      AND (r.valid_until IS NULL OR current_date <= r.valid_until)
  ) THEN
    RAISE EXCEPTION 'O parentesco não está disponível no catálogo vigente.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS census_family_members_guard ON public.census_family_members;
CREATE TRIGGER census_family_members_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.census_family_members
  FOR EACH ROW EXECUTE FUNCTION public.census_family_members_guard();
REVOKE ALL ON FUNCTION public.census_family_members_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.census_family_members_sync_citizen()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_family_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.census_citizens
    SET family_id = NEW.family_id, updated_at = now()
    WHERE id = NEW.citizen_id AND family_id IS DISTINCT FROM NEW.family_id;
    RETURN NEW;
  END IF;

  IF OLD.valid_until IS NULL AND NEW.valid_until IS NOT NULL THEN
    SELECT fm.family_id INTO v_family_id
    FROM public.census_family_members fm
    WHERE fm.citizen_id = NEW.citizen_id AND fm.valid_until IS NULL
    ORDER BY fm.valid_from DESC, fm.created_at DESC
    LIMIT 1;
    UPDATE public.census_citizens
    SET family_id = v_family_id, updated_at = now()
    WHERE id = NEW.citizen_id AND family_id IS DISTINCT FROM v_family_id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS census_family_members_sync_citizen ON public.census_family_members;
CREATE TRIGGER census_family_members_sync_citizen
  AFTER INSERT OR UPDATE OF valid_until ON public.census_family_members
  FOR EACH ROW EXECUTE FUNCTION public.census_family_members_sync_citizen();
REVOKE ALL ON FUNCTION public.census_family_members_sync_citizen() FROM PUBLIC, anon, authenticated;

-- Mantém a coluna family_id usada pelo front atual sincronizada, sem permitir
-- transferência silenciosa que apague o vínculo anterior.
CREATE OR REPLACE FUNCTION public.census_citizen_family_membership_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_active_family_id uuid;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.family_id IS NOT DISTINCT FROM OLD.family_id THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.family_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.census_family_members fm
    WHERE fm.citizen_id = NEW.id AND fm.valid_until IS NULL
  ) THEN
    RAISE EXCEPTION 'Use a operação de transferência para mudar ou retirar a pessoa da família.' USING ERRCODE = '23514';
  END IF;

  IF NEW.family_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.census_families f
    WHERE f.id = NEW.family_id AND f.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Selecione uma família ativa.' USING ERRCODE = '23514';
  END IF;

  SELECT fm.family_id INTO v_active_family_id
  FROM public.census_family_members fm
  WHERE fm.citizen_id = NEW.id AND fm.valid_until IS NULL
  LIMIT 1;
  IF v_active_family_id IS NOT NULL AND v_active_family_id <> NEW.family_id THEN
    RAISE EXCEPTION 'A pessoa já pertence a outra família ativa; use a operação de transferência.' USING ERRCODE = '23514';
  END IF;
  IF v_active_family_id IS NULL THEN
    INSERT INTO public.census_family_members (family_id, citizen_id, relationship_code, is_responsible, valid_from, created_by)
    VALUES (NEW.family_id, NEW.id, 'MEMBER', false, current_date, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS census_citizen_family_membership_sync ON public.census_citizens;
CREATE TRIGGER census_citizen_family_membership_sync
  AFTER INSERT OR UPDATE OF family_id ON public.census_citizens
  FOR EACH ROW EXECUTE FUNCTION public.census_citizen_family_membership_sync();
REVOKE ALL ON FUNCTION public.census_citizen_family_membership_sync() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.census_transfer_family_member(
  p_citizen_id uuid,
  p_target_family_id uuid,
  p_relationship_code text DEFAULT 'MEMBER',
  p_is_responsible boolean DEFAULT false,
  p_effective_date date DEFAULT current_date,
  p_replacement_responsible_citizen_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  v_membership public.census_family_members%ROWTYPE;
  v_target public.census_families%ROWTYPE;
  v_source_household uuid;
  v_target_responsible uuid;
  v_other_responsible boolean;
  v_new_membership_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário autenticar para transferir um membro.' USING ERRCODE = '42501';
  END IF;
  SELECT fm.* INTO v_membership
  FROM public.census_family_members fm
  WHERE fm.citizen_id = p_citizen_id AND fm.valid_until IS NULL
  FOR UPDATE;
  IF v_membership.id IS NULL THEN
    RAISE EXCEPTION 'A pessoa não possui vínculo familiar ativo.' USING ERRCODE = '22023';
  END IF;
  IF p_effective_date IS NULL OR p_effective_date > current_date OR p_effective_date < v_membership.valid_from THEN
    RAISE EXCEPTION 'A data efetiva precisa estar entre o início do vínculo atual e hoje.' USING ERRCODE = '23514';
  END IF;

  SELECT household_id INTO v_source_household
  FROM public.census_families WHERE id = v_membership.family_id;
  SELECT f.* INTO v_target FROM public.census_families f
  WHERE f.id = p_target_family_id AND f.active IS TRUE;
  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'A família de destino não está ativa.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.census_user_can_access_household(v_source_household)
     OR NOT public.census_user_can_access_household(v_target.household_id) THEN
    RAISE EXCEPTION 'A origem ou o destino está fora do seu território autorizado.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.census_family_relationship_catalog r
    WHERE r.code = CASE WHEN p_is_responsible THEN 'RESPONSIBLE' ELSE p_relationship_code END
      AND r.active IS TRUE AND current_date >= r.valid_from
      AND (r.valid_until IS NULL OR current_date <= r.valid_until)
  ) THEN
    RAISE EXCEPTION 'Selecione um parentesco disponível no catálogo vigente.' USING ERRCODE = '23514';
  END IF;

  IF v_membership.family_id = p_target_family_id THEN
    IF p_is_responsible IS TRUE AND EXISTS (
      SELECT 1 FROM public.census_family_members fm
      WHERE fm.family_id = p_target_family_id AND fm.valid_until IS NULL
        AND fm.is_responsible IS TRUE AND fm.citizen_id <> p_citizen_id
    ) THEN
      RAISE EXCEPTION 'A família já possui outro responsável ativo.' USING ERRCODE = '23514';
    END IF;
    PERFORM set_config('app.census_family_transfer', 'on', true);
    UPDATE public.census_family_members
    SET relationship_code = CASE WHEN p_is_responsible THEN 'RESPONSIBLE' ELSE p_relationship_code END,
        is_responsible = p_is_responsible
    WHERE id = v_membership.id;
    RETURN v_membership.id;
  END IF;

  SELECT fm.citizen_id INTO v_target_responsible
  FROM public.census_family_members fm
  WHERE fm.family_id = p_target_family_id AND fm.valid_until IS NULL
    AND fm.is_responsible IS TRUE
  LIMIT 1;
  IF p_is_responsible IS TRUE AND v_target_responsible IS NOT NULL THEN
    RAISE EXCEPTION 'A família de destino já possui um responsável ativo.' USING ERRCODE = '23514';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.census_family_members fm
    WHERE fm.family_id = v_membership.family_id
      AND fm.valid_until IS NULL AND fm.is_responsible IS TRUE
      AND fm.citizen_id <> p_citizen_id
  ) INTO v_other_responsible;
  IF v_membership.is_responsible IS TRUE AND NOT v_other_responsible THEN
    IF p_replacement_responsible_citizen_id IS NULL THEN
      RAISE EXCEPTION 'Escolha outro integrante como responsável pela família de origem antes da transferência.' USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.census_family_members fm
      WHERE fm.family_id = v_membership.family_id
        AND fm.citizen_id = p_replacement_responsible_citizen_id
        AND fm.valid_until IS NULL
    ) THEN
      RAISE EXCEPTION 'O responsável substituto precisa ser membro ativo da família de origem.' USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('app.census_family_transfer', 'on', true);
  IF v_membership.is_responsible IS TRUE AND NOT v_other_responsible THEN
    UPDATE public.census_family_members
    SET is_responsible = true, relationship_code = 'RESPONSIBLE'
    WHERE family_id = v_membership.family_id
      AND citizen_id = p_replacement_responsible_citizen_id
      AND valid_until IS NULL;
  END IF;
  UPDATE public.census_family_members
  SET valid_until = p_effective_date - CASE WHEN p_effective_date > v_membership.valid_from THEN 1 ELSE 0 END
  WHERE id = v_membership.id;

  INSERT INTO public.census_family_members
    (family_id, citizen_id, relationship_code, is_responsible, valid_from, valid_until, created_by)
  VALUES
    (p_target_family_id, p_citizen_id,
     CASE WHEN p_is_responsible THEN 'RESPONSIBLE' ELSE p_relationship_code END,
     p_is_responsible, p_effective_date, NULL, auth.uid())
  RETURNING id INTO v_new_membership_id;
  RETURN v_new_membership_id;
END;
$$;
REVOKE ALL ON FUNCTION public.census_transfer_family_member(uuid, uuid, text, boolean, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.census_transfer_family_member(uuid, uuid, text, boolean, date, uuid) TO authenticated;

-- 5) Resumo seguro por lote para o mapa do ACS e acompanhamento gerencial.
CREATE OR REPLACE FUNCTION public.census_lot_registration_overview(
  p_zone_id uuid DEFAULT NULL,
  p_from date DEFAULT NULL,
  p_to date DEFAULT NULL
)
RETURNS TABLE (
  lot_id uuid,
  zone_id uuid,
  zone_name text,
  microarea_id uuid,
  microarea_code text,
  lot_label text,
  street_name text,
  neighborhood_name text,
  block_reference text,
  registration_status text,
  exclusion_reason text,
  household_count bigint,
  household_without_family_count bigint,
  family_count bigint,
  last_visit_date date,
  visit_attempt_count bigint,
  completed_visit_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, app_private
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário autenticar para consultar o território.' USING ERRCODE = '42501';
  END IF;
  IF p_from IS NOT NULL AND p_to IS NOT NULL AND p_from > p_to THEN
    RAISE EXCEPTION 'O início do período não pode ser posterior ao fim.' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH current_map AS (
    SELECT mi.id
    FROM public.census_map_imports mi
    WHERE mi.is_current IS TRUE
      AND mi.status = 'PUBLISHED'
      AND mi.division_saved_at IS NOT NULL
    ORDER BY mi.updated_at DESC
    LIMIT 1
  ), lots AS (
    SELECT l.id, l.zone_id, l.label, l.cadastral_label, l.street_name,
           l.neighborhood_name, l.block_reference,
           z.name AS zone_name, z.microarea_id, m.code AS microarea_code
    FROM public.census_map_lots l
    JOIN current_map cm ON cm.id = l.import_id
    LEFT JOIN public.census_zones z ON z.id = l.zone_id
    LEFT JOIN public.health_microareas m ON m.id = z.microarea_id
    WHERE l.is_valid IS TRUE
      AND (p_zone_id IS NULL OR l.zone_id = p_zone_id)
  ), household_summary AS (
    SELECT l.id AS lot_id,
           count(DISTINCT h.id) FILTER (WHERE h.id IS NOT NULL AND h.active IS TRUE)::bigint AS household_count,
           count(DISTINCT h.id) FILTER (
             WHERE h.id IS NOT NULL AND h.active IS TRUE
               AND NOT EXISTS (
                 SELECT 1 FROM public.census_families f
                 WHERE f.household_id = h.id AND f.active IS TRUE
               )
           )::bigint AS household_without_family_count,
           count(DISTINCT f.id) FILTER (WHERE f.active IS TRUE)::bigint AS family_count
    FROM lots l
    LEFT JOIN public.census_households h ON h.lot_id = l.id AND h.active IS TRUE
    LEFT JOIN public.census_families f ON f.household_id = h.id AND f.active IS TRUE
    GROUP BY l.id
  )
  SELECT l.id, l.zone_id, l.zone_name, l.microarea_id, l.microarea_code,
         COALESCE(l.cadastral_label, l.label), l.street_name, l.neighborhood_name,
         l.block_reference,
         CASE
           WHEN hs.household_count = 0 AND e.reason IN ('COMMERCE','MUNICIPAL_AREA','PUBLIC') THEN 'EXCLUDED_NONRESIDENTIAL'
           WHEN hs.household_count = 0 AND e.reason = 'VACANT' THEN 'EXCLUDED_VACANT'
           WHEN hs.household_count = 0 THEN 'NO_HOUSEHOLD'
           WHEN hs.household_without_family_count > 0 THEN 'HOUSEHOLD_WITHOUT_FAMILY'
           ELSE 'FAMILIES_LINKED'
         END,
         e.reason, hs.household_count, hs.household_without_family_count, hs.family_count,
         visits.last_visit_date, visits.visit_attempt_count, visits.completed_visit_count
  FROM lots l
  JOIN household_summary hs ON hs.lot_id = l.id
  LEFT JOIN public.census_lot_indicator_exclusions e ON e.lot_id = l.id
  LEFT JOIN LATERAL (
    SELECT max(v.visit_date) AS last_visit_date,
           count(v.id)::bigint AS visit_attempt_count,
           count(v.id) FILTER (WHERE v.status = 'COMPLETED' OR outcome.code = 'REALIZADA')::bigint AS completed_visit_count
    FROM public.census_households h
    JOIN public.census_visits v ON v.household_id = h.id
    LEFT JOIN public.census_visit_outcome_catalog outcome
      ON outcome.id = v.outcome_id AND outcome.version = v.outcome_version
    WHERE h.lot_id = l.id AND h.active IS TRUE
      AND (p_from IS NULL OR v.visit_date >= p_from)
      AND (p_to IS NULL OR v.visit_date <= p_to)
  ) visits ON true
  WHERE app_private.current_user_is_admin()
     OR public.census_user_can_access_lot(l.id)
     OR (
       public.municipal_user_has_module('census')
       AND (
         public.municipal_user_has_role('SYSTEM_ADMIN')
         OR public.municipal_user_has_role('EXECUTIVE_VIEW')
         OR public.municipal_user_has_role('UNIT_MANAGER')
       )
     )
  ORDER BY l.zone_name NULLS LAST, l.microarea_code NULLS LAST, l.id;
END;
$$;
REVOKE ALL ON FUNCTION public.census_lot_registration_overview(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.census_lot_registration_overview(uuid, date, date) TO authenticated;

COMMIT;
