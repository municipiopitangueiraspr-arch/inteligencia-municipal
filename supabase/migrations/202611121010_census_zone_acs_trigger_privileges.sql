-- Funções de trigger são executadas pelo banco e não precisam de EXECUTE pelo cliente.
REVOKE ALL ON FUNCTION public.census_acs_require_registered_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.census_prevent_zone_delete() FROM PUBLIC, anon, authenticated;
