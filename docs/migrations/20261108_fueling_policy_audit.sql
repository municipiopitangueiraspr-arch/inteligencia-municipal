-- Mantém o responsável e o horário da última alteração da política no servidor.
-- O RLS continua sendo o controle de autorização; o trigger impede que o cliente
-- informe updated_by ou updated_at em nome de outra pessoa.
CREATE OR REPLACE FUNCTION public.fleet_set_fueling_policy_audit_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := public.fleet_current_usuario_id();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_set_fueling_policy_audit_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS fleet_fueling_policies_set_audit_fields ON public.fleet_fueling_policies;
CREATE TRIGGER fleet_fueling_policies_set_audit_fields
BEFORE UPDATE ON public.fleet_fueling_policies
FOR EACH ROW
EXECUTE FUNCTION public.fleet_set_fueling_policy_audit_fields();
