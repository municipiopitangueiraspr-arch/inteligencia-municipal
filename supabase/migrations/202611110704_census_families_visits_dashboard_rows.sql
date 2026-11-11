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
  SELECT
    lot.id,
    lot.source_handle,
    lot.label,
    lot.zone_id
  FROM public.census_territory_map_lots lot
  JOIN current_import current_map ON current_map.id = lot.import_id
  WHERE lot.is_valid IS TRUE
),
active_households AS (
  SELECT
    household.id,
    household.lot_id,
    household.label,
    household.created_at
  FROM public.census_households household
  JOIN map_lots lot ON lot.id = household.lot_id
  WHERE household.active IS TRUE
),
household_counts AS (
  SELECT lot_id, COUNT(*)::integer AS active_households_in_lot
  FROM active_households
  GROUP BY lot_id
),
visit_counts AS (
  SELECT
    visit.household_id,
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
  SELECT DISTINCT ON (visit.household_id)
    visit.household_id,
    visit.status,
    visit.visit_date,
    visit.acs_id
  FROM public.census_visits visit
  JOIN active_households household ON household.id = visit.household_id
  ORDER BY visit.household_id, visit.visit_date DESC, visit.created_at DESC, visit.id DESC
),
latest_lot_visits AS (
  SELECT DISTINCT ON (household.lot_id)
    household.lot_id,
    visit.status,
    visit.visit_date
  FROM public.census_visits visit
  JOIN active_households household ON household.id = visit.household_id
  ORDER BY household.lot_id, visit.visit_date DESC, visit.created_at DESC, visit.id DESC
),
response_counts AS (
  SELECT
    visit.household_id,
    COUNT(response.id)::integer AS questionnaire_response_count,
    (COUNT(response.id) FILTER (WHERE response.status = 'SUBMITTED'))::integer AS submitted_questionnaire_count,
    (COUNT(response.id) FILTER (WHERE response.status = 'DRAFT'))::integer AS draft_questionnaire_count
  FROM public.census_questionnaire_responses response
  JOIN public.census_visits visit ON visit.id = response.visit_id
  JOIN active_households household ON household.id = visit.household_id
  GROUP BY visit.household_id
),
latest_questionnaires AS (
  SELECT DISTINCT ON (visit.household_id)
    visit.household_id,
    response.status,
    response.created_at
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
  latest_lot_visit.visit_date AS lot_latest_visit_date
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

COMMENT ON VIEW public.census_families_visits_dashboard_rows IS
  'Leitura do painel Famílias e visitas: uma linha por domicílio ativo ou lote sem domicílio ativo, no mapa salvo mais recente acessível; agrega somente contagens e estados, sem respostas de questionários.';

REVOKE ALL ON TABLE public.census_families_visits_dashboard_rows FROM anon, authenticated, public;
GRANT SELECT ON TABLE public.census_families_visits_dashboard_rows TO authenticated;
