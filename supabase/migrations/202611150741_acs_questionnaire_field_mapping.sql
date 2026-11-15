BEGIN;

CREATE TABLE IF NOT EXISTS public.census_questionnaire_field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES public.census_questionnaires(id) ON DELETE RESTRICT,
  questionnaire_version integer NOT NULL CHECK (questionnaire_version > 0),
  question_id text NOT NULL,
  source_label text NOT NULL,
  domain text NOT NULL,
  official_field text,
  official_code text,
  official_version text,
  mapping_status text NOT NULL DEFAULT 'REQUIRES_CONFIRMATION'
    CHECK (mapping_status IN ('PENDING','LOCAL_ONLY','MAPPED','REQUIRES_CONFIRMATION')),
  transform_rule text NOT NULL DEFAULT '',
  export_destination text NOT NULL DEFAULT '',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (questionnaire_id, questionnaire_version, question_id)
);

CREATE INDEX IF NOT EXISTS census_questionnaire_field_mappings_lookup_idx
  ON public.census_questionnaire_field_mappings(questionnaire_id, questionnaire_version, mapping_status);

ALTER TABLE public.census_questionnaire_field_mappings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS census_questionnaire_field_mappings_read ON public.census_questionnaire_field_mappings;
CREATE POLICY census_questionnaire_field_mappings_read
  ON public.census_questionnaire_field_mappings FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.census_questionnaires q
    WHERE q.id = questionnaire_id AND q.status IN ('ACTIVE', 'DRAFT')
  ));
DROP POLICY IF EXISTS census_questionnaire_field_mappings_manage ON public.census_questionnaire_field_mappings;
CREATE POLICY census_questionnaire_field_mappings_manage
  ON public.census_questionnaire_field_mappings FOR ALL TO authenticated
  USING (public.municipal_foundation_is_admin())
  WITH CHECK (public.municipal_foundation_is_admin());

REVOKE ALL ON public.census_questionnaire_field_mappings FROM PUBLIC, anon;
GRANT SELECT ON public.census_questionnaire_field_mappings TO authenticated;
GRANT ALL ON public.census_questionnaire_field_mappings TO service_role;

CREATE OR REPLACE FUNCTION public.census_questionnaire_field_mappings_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS census_questionnaire_field_mappings_touch_updated_at ON public.census_questionnaire_field_mappings;
CREATE TRIGGER census_questionnaire_field_mappings_touch_updated_at
BEFORE UPDATE ON public.census_questionnaire_field_mappings
FOR EACH ROW EXECUTE FUNCTION public.census_questionnaire_field_mappings_touch_updated_at();

REVOKE ALL ON FUNCTION public.census_questionnaire_field_mappings_touch_updated_at() FROM PUBLIC, anon, authenticated;

COMMIT;
