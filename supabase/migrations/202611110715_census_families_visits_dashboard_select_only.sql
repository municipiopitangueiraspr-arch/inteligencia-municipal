-- Supabase can apply broad default privileges when a view is created.
-- This endpoint is a read-only dashboard projection.
REVOKE ALL ON TABLE public.census_families_visits_dashboard_rows FROM anon, authenticated, public;
GRANT SELECT ON TABLE public.census_families_visits_dashboard_rows TO authenticated;
