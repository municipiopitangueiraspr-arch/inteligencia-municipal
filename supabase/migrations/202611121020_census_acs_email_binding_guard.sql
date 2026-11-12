-- Mantém o e-mail do catálogo alinhado com a conta Auth também em alterações diretas.
DROP TRIGGER IF EXISTS census_acs_require_registered_user_trigger ON public.census_acs;
CREATE TRIGGER census_acs_require_registered_user_trigger
  BEFORE INSERT OR UPDATE OF user_id, email ON public.census_acs
  FOR EACH ROW EXECUTE FUNCTION public.census_acs_require_registered_user();
