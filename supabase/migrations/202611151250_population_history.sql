BEGIN;

CREATE TABLE IF NOT EXISTS public.census_population_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('HOUSEHOLD','FAMILY','CITIZEN','FAMILY_MEMBER')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  changed_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS census_population_history_created_idx ON public.census_population_history (created_at DESC);
CREATE INDEX IF NOT EXISTS census_population_history_entity_idx ON public.census_population_history (entity_type, entity_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.census_record_population_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_id uuid; v_action text; v_type text; v_details jsonb;
BEGIN
  v_type := CASE TG_TABLE_NAME WHEN 'census_households' THEN 'HOUSEHOLD' WHEN 'census_families' THEN 'FAMILY' WHEN 'census_citizens' THEN 'CITIZEN' ELSE 'FAMILY_MEMBER' END;
  v_action := TG_OP;
  v_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_details := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  INSERT INTO public.census_population_history(entity_type, entity_id, action, details, changed_by)
  VALUES (v_type, v_id, v_action, v_details, auth.uid());
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS census_households_population_history ON public.census_households;
CREATE TRIGGER census_households_population_history AFTER INSERT OR UPDATE OR DELETE ON public.census_households FOR EACH ROW EXECUTE FUNCTION public.census_record_population_history();
DROP TRIGGER IF EXISTS census_families_population_history ON public.census_families;
CREATE TRIGGER census_families_population_history AFTER INSERT OR UPDATE OR DELETE ON public.census_families FOR EACH ROW EXECUTE FUNCTION public.census_record_population_history();
DROP TRIGGER IF EXISTS census_citizens_population_history ON public.census_citizens;
CREATE TRIGGER census_citizens_population_history AFTER INSERT OR UPDATE OR DELETE ON public.census_citizens FOR EACH ROW EXECUTE FUNCTION public.census_record_population_history();
DROP TRIGGER IF EXISTS census_family_members_population_history ON public.census_family_members;
CREATE TRIGGER census_family_members_population_history AFTER INSERT OR UPDATE OR DELETE ON public.census_family_members FOR EACH ROW EXECUTE FUNCTION public.census_record_population_history();

ALTER TABLE public.census_population_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS census_population_history_select ON public.census_population_history;
CREATE POLICY census_population_history_select ON public.census_population_history FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.census_households h WHERE h.id = (details->>'id')::uuid)
  OR EXISTS (SELECT 1 FROM public.census_families f WHERE f.id = (details->>'id')::uuid)
  OR EXISTS (SELECT 1 FROM public.census_citizens c WHERE c.id = (details->>'id')::uuid)
  OR EXISTS (SELECT 1 FROM public.census_family_members m WHERE m.id = (details->>'id')::uuid)
);
GRANT SELECT ON public.census_population_history TO authenticated;

COMMIT;
