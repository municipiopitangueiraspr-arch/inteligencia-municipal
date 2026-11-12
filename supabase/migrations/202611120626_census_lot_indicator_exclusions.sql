-- Classifica lotes sem domicílio ocupado ou públicos como fora dos indicadores ACS.
-- O mapa e os registros de domicílios, visitas e respostas permanecem preservados.

CREATE TABLE IF NOT EXISTS public.census_lot_indicator_exclusions (
  lot_id uuid PRIMARY KEY REFERENCES public.census_map_lots(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('VACANT', 'PUBLIC')),
  excluded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  excluded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.census_lot_indicator_exclusions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.census_lot_indicator_exclusions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.census_lot_indicator_exclusions TO authenticated;
DROP POLICY IF EXISTS census_lot_indicator_exclusions_accessible_read ON public.census_lot_indicator_exclusions;
CREATE POLICY census_lot_indicator_exclusions_accessible_read
  ON public.census_lot_indicator_exclusions FOR SELECT TO authenticated
  USING (public.census_user_can_access_lot(lot_id));

CREATE TABLE IF NOT EXISTS public.census_lot_indicator_exclusion_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('EXCLUDED', 'REASON_CHANGED', 'REINSTATED')),
  reason text CHECK (reason IS NULL OR reason IN ('VACANT', 'PUBLIC')),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS census_lot_indicator_exclusion_history_lot_time_idx
  ON public.census_lot_indicator_exclusion_history (lot_id, changed_at DESC);
ALTER TABLE public.census_lot_indicator_exclusion_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.census_lot_indicator_exclusion_history FROM PUBLIC, anon, authenticated;
COMMENT ON TABLE public.census_lot_indicator_exclusion_history IS
  'Auditoria append-only das alterações de elegibilidade dos lotes nos indicadores ACS.';

CREATE OR REPLACE FUNCTION public.census_set_lot_indicator_exclusion(p_lot_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, auth
AS $$
DECLARE
  current_reason text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.census_user_can_access_lot(p_lot_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao lote.' USING errcode = '42501';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('VACANT', 'PUBLIC') THEN
    RAISE EXCEPTION 'Selecione um motivo válido para excluir o lote dos indicadores.' USING errcode = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_lot_id::text, 0));
  SELECT exclusion.reason INTO current_reason
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
    RAISE EXCEPTION 'O lote não pertence ao mapa operacional atual.' USING errcode = '22023';
  END IF;

  IF current_reason IS DISTINCT FROM p_reason THEN
    INSERT INTO public.census_lot_indicator_exclusions (lot_id, reason, excluded_by, excluded_at)
    VALUES (p_lot_id, p_reason, auth.uid(), now())
    ON CONFLICT (lot_id) DO UPDATE
      SET reason = EXCLUDED.reason, excluded_by = EXCLUDED.excluded_by, excluded_at = EXCLUDED.excluded_at;

    INSERT INTO public.census_lot_indicator_exclusion_history (lot_id, action, reason, changed_by)
    VALUES (p_lot_id, CASE WHEN current_reason IS NULL THEN 'EXCLUDED' ELSE 'REASON_CHANGED' END, p_reason, auth.uid());
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.census_restore_lot_to_indicators(p_lot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, auth
AS $$
DECLARE
  current_reason text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.census_can_manage_lot_acs() THEN
    RAISE EXCEPTION 'Somente um administrador municipal pode reintegrar o lote aos indicadores.' USING errcode = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_lot_id::text, 0));
  SELECT exclusion.reason INTO current_reason
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
    RAISE EXCEPTION 'O lote não pertence ao mapa operacional atual.' USING errcode = '22023';
  END IF;

  IF current_reason IS NOT NULL THEN
    DELETE FROM public.census_lot_indicator_exclusions WHERE lot_id = p_lot_id;
    INSERT INTO public.census_lot_indicator_exclusion_history (lot_id, action, reason, changed_by)
    VALUES (p_lot_id, 'REINSTATED', current_reason, auth.uid());
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.census_set_lot_indicator_exclusion(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.census_restore_lot_to_indicators(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.census_set_lot_indicator_exclusion(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.census_restore_lot_to_indicators(uuid) TO authenticated;

CREATE OR REPLACE VIEW public.census_territory_map_lots
WITH (security_invoker = true)
AS
SELECT
  lot.id,
  lot.import_id,
  lot.source_handle,
  lot.label,
  lot.layer_name,
  lot.geometry,
  lot.area,
  lot.is_valid,
  lot.zone_number,
  lot.zone_id,
  exclusion.reason AS indicator_exclusion_reason,
  exclusion.excluded_at AS indicator_excluded_at
FROM public.census_map_lots lot
JOIN public.census_map_imports map_import ON map_import.id = lot.import_id
LEFT JOIN public.census_lot_indicator_exclusions exclusion ON exclusion.lot_id = lot.id
WHERE map_import.is_current IS TRUE
  AND map_import.status = 'PUBLISHED'
  AND map_import.division_saved_at IS NOT NULL
  AND lot.is_valid IS TRUE
  AND public.census_user_can_access_lot(lot.id);
REVOKE ALL ON TABLE public.census_territory_map_lots FROM anon, authenticated;
GRANT SELECT ON TABLE public.census_territory_map_lots TO authenticated;

CREATE OR REPLACE VIEW public.census_families_visits_dashboard_rows
WITH (security_invoker = true)
AS
WITH current_import AS (
  SELECT id
  FROM public.census_territory_map_imports
  ORDER BY division_saved_at DESC NULLS LAST, updated_at DESC NULLS LAST
  LIMIT 1
),
map_lots AS (
  SELECT lot.id, lot.source_handle, lot.label, lot.zone_id,
    lot.indicator_exclusion_reason, lot.indicator_excluded_at
  FROM public.census_territory_map_lots lot
  JOIN current_import current_map ON current_map.id = lot.import_id
  WHERE lot.is_valid IS TRUE
),
active_households AS (
  SELECT household.id, household.lot_id, household.label, household.created_at
  FROM public.census_households household
  JOIN map_lots lot ON lot.id = household.lot_id
  WHERE household.active IS TRUE
),
household_counts AS (
  SELECT lot_id, COUNT(*)::integer AS active_households_in_lot
  FROM active_households GROUP BY lot_id
),
visit_counts AS (
  SELECT visit.household_id,
    COUNT(visit.id)::integer AS visit_count,
    (COUNT(visit.id) FILTER (WHERE visit.status = 'COMPLETED'))::integer AS completed_visit_count,
    (COUNT(visit.id) FILTER (WHERE visit.status = 'IN_PROGRESS'))::integer AS in_progress_visit_count,
    (COUNT(visit.id) FILTER (WHERE visit.status = 'NO_CONTACT'))::integer AS no_contact_visit_count,
    (COUNT(visit.id) FILTER (WHERE visit.status = 'CANCELLED'))::integer AS cancelled_visit_count
  FROM public.census_visits visit
  JOIN active_households household ON household.id = visit.household_id
  GROUP BY visit.household_id
),
latest_household_visits AS (
  SELECT DISTINCT ON (visit.household_id) visit.household_id, visit.status, visit.visit_date, visit.acs_id
  FROM public.census_visits visit
  JOIN active_households household ON household.id = visit.household_id
  ORDER BY visit.household_id, visit.visit_date DESC, visit.created_at DESC, visit.id DESC
),
latest_lot_visits AS (
  SELECT DISTINCT ON (household.lot_id) household.lot_id, visit.status, visit.visit_date
  FROM public.census_visits visit
  JOIN active_households household ON household.id = visit.household_id
  ORDER BY household.lot_id, visit.visit_date DESC, visit.created_at DESC, visit.id DESC
),
response_counts AS (
  SELECT visit.household_id,
    COUNT(response.id)::integer AS questionnaire_response_count,
    (COUNT(response.id) FILTER (WHERE response.status = 'SUBMITTED'))::integer AS submitted_questionnaire_count,
    (COUNT(response.id) FILTER (WHERE response.status = 'DRAFT'))::integer AS draft_questionnaire_count
  FROM public.census_questionnaire_responses response
  JOIN public.census_visits visit ON visit.id = response.visit_id
  JOIN active_households household ON household.id = visit.household_id
  GROUP BY visit.household_id
),
latest_questionnaires AS (
  SELECT DISTINCT ON (visit.household_id) visit.household_id, response.status, response.created_at
  FROM public.census_questionnaire_responses response
  JOIN public.census_visits visit ON visit.id = response.visit_id
  JOIN active_households household ON household.id = visit.household_id
  ORDER BY visit.household_id, response.created_at DESC, response.id DESC
)
SELECT
  lot.id AS lot_id,
  lot.source_handle,
  lot.label AS lot_label,
  lot.zone_id,
  zone.name AS zone_name,
  zone.color AS zone_color,
  household.id AS household_id,
  household.label AS household_label,
  household.id IS NULL AS is_presumed,
  COALESCE(household_counts.active_households_in_lot, 0) AS active_households_in_lot,
  household.created_at AS household_created_at,
  latest_visit.status AS latest_visit_status,
  latest_visit.visit_date AS latest_visit_date,
  latest_visit.acs_id AS latest_visit_acs_id,
  acs.full_name AS latest_visit_acs_name,
  COALESCE(visit_counts.visit_count, 0) AS visit_count,
  COALESCE(visit_counts.completed_visit_count, 0) AS completed_visit_count,
  COALESCE(visit_counts.in_progress_visit_count, 0) AS in_progress_visit_count,
  COALESCE(visit_counts.no_contact_visit_count, 0) AS no_contact_visit_count,
  COALESCE(visit_counts.cancelled_visit_count, 0) AS cancelled_visit_count,
  COALESCE(response_counts.questionnaire_response_count, 0) AS questionnaire_response_count,
  COALESCE(response_counts.submitted_questionnaire_count, 0) AS submitted_questionnaire_count,
  COALESCE(response_counts.draft_questionnaire_count, 0) AS draft_questionnaire_count,
  latest_questionnaire.status AS latest_questionnaire_status,
  latest_questionnaire.created_at AS latest_questionnaire_created_at,
  latest_lot_visit.status AS lot_latest_visit_status,
  latest_lot_visit.visit_date AS lot_latest_visit_date,
  lot.indicator_exclusion_reason,
  lot.indicator_excluded_at
FROM map_lots lot
LEFT JOIN public.census_zones zone ON zone.id = lot.zone_id
LEFT JOIN active_households household ON household.lot_id = lot.id
LEFT JOIN household_counts ON household_counts.lot_id = lot.id
LEFT JOIN visit_counts ON visit_counts.household_id = household.id
LEFT JOIN latest_household_visits latest_visit ON latest_visit.household_id = household.id
LEFT JOIN public.census_acs acs ON acs.id = latest_visit.acs_id
LEFT JOIN response_counts ON response_counts.household_id = household.id
LEFT JOIN latest_questionnaires latest_questionnaire ON latest_questionnaire.household_id = household.id
LEFT JOIN latest_lot_visits latest_lot_visit ON latest_lot_visit.lot_id = lot.id;
REVOKE ALL ON TABLE public.census_families_visits_dashboard_rows FROM anon, authenticated, public;
GRANT SELECT ON TABLE public.census_families_visits_dashboard_rows TO authenticated;

COMMENT ON VIEW public.census_families_visits_dashboard_rows IS
  'Leitura do painel Famílias e visitas: uma linha por domicílio ativo ou lote sem domicílio ativo; inclui metadados de exclusão dos indicadores sem remover os registros originais.';
