BEGIN;

-- Atribuição específica de lote: a identidade oficial é professional_id.
-- Mantém a coluna ACS antiga nula apenas como compatibilidade histórica.
CREATE OR REPLACE FUNCTION public.census_assign_professional_to_lot(
  p_lot_id uuid,
  p_professional_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(app_private.current_user_is_admin(), false) THEN
    RAISE EXCEPTION 'Somente um administrador municipal pode vincular profissionais a lotes.' USING errcode = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.health_professionals p
    JOIN public.health_professional_assignments a ON a.professional_id = p.id
    WHERE p.id = p_professional_id
      AND p.active IS TRUE
      AND p.professional_category = 'ACS'
      AND a.role_id = 'ACS'
      AND a.active IS TRUE
      AND current_date >= a.valid_from
      AND (a.valid_until IS NULL OR current_date <= a.valid_until)
  ) THEN
    RAISE EXCEPTION 'Selecione um ACS com vínculo profissional vigente.' USING errcode = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.census_map_lots lot
    JOIN public.census_map_imports map_import ON map_import.id = lot.import_id
    WHERE lot.id = p_lot_id
      AND lot.is_valid IS TRUE
      AND map_import.division_saved_at IS NOT NULL
      AND map_import.status IN ('DRAFT', 'PUBLISHED')
  ) THEN
    RAISE EXCEPTION 'O lote precisa pertencer a uma divisão válida e salva.' USING errcode = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_lot_id::text, 0));
  UPDATE public.census_lot_acs_assignments
  SET active = false, updated_at = now()
  WHERE lot_id = p_lot_id AND active IS TRUE;

  INSERT INTO public.census_lot_acs_assignments (lot_id, acs_id, professional_id, active, assigned_by)
  VALUES (p_lot_id, NULL, p_professional_id, true, auth.uid());
END;
$$;

-- A view mantém os aliases antigos para compatibilidade de leitura, mas seus dados
-- passam a vir do profissional oficial. Novas colunas sem o alias ACS permitem
-- que o frontend migre sem quebrar consumidores já existentes.
DO $$
DECLARE
  v_definition text;
BEGIN
  v_definition := pg_get_viewdef('public.census_families_visits_dashboard_rows'::regclass, true);
  IF position('visit.acs_id' IN v_definition) = 0
     OR position('census_acs acs' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'A definição atual da view de famílias/visitas não corresponde ao contrato esperado; revisão manual necessária.';
  END IF;

  v_definition := replace(v_definition, 'visit.acs_id', 'visit.professional_id');
  v_definition := replace(v_definition, 'census_acs acs', 'health_professionals acs');
  v_definition := regexp_replace(
    v_definition,
    'lot\.indicator_excluded_at(\s+FROM map_lots lot)',
    'lot.indicator_excluded_at, latest_visit.professional_id AS latest_visit_professional_id, acs.full_name AS latest_visit_professional_name\1'
  );
  IF position('latest_visit_professional_id' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Não foi possível acrescentar os campos oficiais de autoria à view de famílias/visitas.';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.census_families_visits_dashboard_rows WITH (security_invoker = true) AS ' || v_definition;
END;
$$;

-- O contexto de governança já expõe a ficha ACS; resolve-a agora pela identidade e
-- pelo vínculo profissional vigente, sem depender do catálogo operacional antigo.
DO $$
DECLARE
  v_definition text;
  v_old text := 'FROM public.census_acs acs WHERE acs.user_id=auth.uid() AND acs.active IS TRUE ORDER BY acs.updated_at DESC LIMIT 1;';
  v_new text := 'FROM public.health_professionals acs JOIN public.health_professional_assignments assignment ON assignment.professional_id=acs.id WHERE acs.user_id=auth.uid() AND acs.professional_category=''ACS'' AND acs.active IS TRUE AND assignment.role_id=''ACS'' AND assignment.active IS TRUE AND current_date>=assignment.valid_from AND (assignment.valid_until IS NULL OR current_date<=assignment.valid_until) ORDER BY assignment.valid_from DESC,assignment.created_at DESC LIMIT 1;';
BEGIN
  v_definition := pg_get_functiondef('public.municipal_governance_get_my_context()'::regprocedure);
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'O contexto de governança mudou; revisão manual necessária antes de alterar sua fonte ACS.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END;
$$;

COMMIT;
