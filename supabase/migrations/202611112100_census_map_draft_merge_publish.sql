-- Draft, merge and atomic publication for ACS territory maps.
-- Existing operational lots and their IDs are retained when exact matches are published.

ALTER TABLE public.census_map_imports
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT false;

ALTER TABLE public.census_map_imports
  DROP CONSTRAINT IF EXISTS census_map_imports_status_check;
ALTER TABLE public.census_map_imports
  ADD CONSTRAINT census_map_imports_status_check
  CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED', 'ERROR'));

ALTER TABLE public.census_map_lots
  ADD COLUMN IF NOT EXISTS matched_lot_id uuid REFERENCES public.census_map_lots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS merge_status text NOT NULL DEFAULT 'NEW';
ALTER TABLE public.census_map_lots
  DROP CONSTRAINT IF EXISTS census_map_lots_merge_status_check;
ALTER TABLE public.census_map_lots
  ADD CONSTRAINT census_map_lots_merge_status_check
  CHECK (merge_status IN ('NEW', 'MATCHED', 'PUBLISHED'));
CREATE UNIQUE INDEX IF NOT EXISTS census_map_lots_one_merge_match_idx
  ON public.census_map_lots (import_id, matched_lot_id)
  WHERE matched_lot_id IS NOT NULL;

-- Preserve the exact prior operational geometry and zone assignment before matched rows move
-- to the next map version. Historical activities keep their stable lot IDs.
CREATE TABLE IF NOT EXISTS public.census_map_lot_snapshots (
  map_import_id uuid NOT NULL REFERENCES public.census_map_imports(id) ON DELETE RESTRICT,
  lot_id uuid NOT NULL,
  source_handle text NOT NULL,
  label text,
  layer_name text NOT NULL,
  geometry jsonb NOT NULL,
  area numeric,
  is_valid boolean NOT NULL,
  problem_reasons text[] NOT NULL DEFAULT '{}'::text[],
  zone_number smallint,
  zone_id uuid,
  captured_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (map_import_id, lot_id)
);
ALTER TABLE public.census_map_lot_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.census_map_lot_snapshots FROM anon, authenticated;

-- Bootstrap the current pointer to the latest already-published, prepared map.
WITH newest AS (
  SELECT id
  FROM public.census_map_imports
  WHERE status = 'PUBLISHED' AND division_saved_at IS NOT NULL
  ORDER BY published_at DESC NULLS LAST, division_saved_at DESC, updated_at DESC
  LIMIT 1
)
UPDATE public.census_map_imports AS map_import
SET is_current = (map_import.id = (SELECT id FROM newest));
CREATE UNIQUE INDEX IF NOT EXISTS census_map_imports_single_current_idx
  ON public.census_map_imports ((is_current))
  WHERE is_current IS TRUE;
CREATE INDEX IF NOT EXISTS census_map_imports_draft_updated_idx
  ON public.census_map_imports (status, updated_at DESC)
  WHERE status = 'DRAFT';

CREATE OR REPLACE FUNCTION public.census_user_can_access_lot(p_lot_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, auth
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      coalesce(app_private.current_user_is_admin(), false)
      OR EXISTS (
        SELECT 1
        FROM public.census_map_lots lot
        JOIN public.census_map_imports map_import
          ON map_import.id = lot.import_id
         AND map_import.is_current IS TRUE
         AND map_import.status = 'PUBLISHED'
         AND map_import.division_saved_at IS NOT NULL
        JOIN public.census_zones zone
          ON zone.id = lot.zone_id AND zone.active IS TRUE
        JOIN public.census_acs_zone_assignments assignment
          ON assignment.zone_id = lot.zone_id AND assignment.active IS TRUE
        JOIN public.census_acs acs
          ON acs.id = assignment.acs_id AND acs.active IS TRUE
        WHERE lot.id = p_lot_id
          AND lot.is_valid IS TRUE
          AND nullif(lower(btrim(acs.email)), '') = nullif(lower(btrim(auth.jwt() ->> 'email')), '')
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.census_user_can_access_import(p_import_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, auth
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      coalesce(app_private.current_user_is_admin(), false)
      OR EXISTS (
        SELECT 1
        FROM public.census_map_lots lot
        JOIN public.census_map_imports map_import
          ON map_import.id = lot.import_id
         AND map_import.is_current IS TRUE
         AND map_import.status = 'PUBLISHED'
         AND map_import.division_saved_at IS NOT NULL
        WHERE lot.import_id = p_import_id
          AND lot.is_valid IS TRUE
          AND public.census_user_can_access_lot(lot.id)
      )
    );
$$;
REVOKE ALL ON FUNCTION public.census_user_can_access_lot(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.census_user_can_access_import(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.census_user_can_access_lot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.census_user_can_access_import(uuid) TO authenticated;

-- The views consumed by ACS, family visits, and medical visits now expose only the current version.
CREATE OR REPLACE VIEW public.census_territory_map_imports
WITH (security_invoker = true)
AS
SELECT
  map_import.id,
  map_import.file_name,
  map_import.status,
  map_import.bbox,
  map_import.updated_at,
  map_import.division_saved_at,
  map_import.published_at,
  map_import.is_current
FROM public.census_map_imports map_import
WHERE map_import.is_current IS TRUE
  AND map_import.status = 'PUBLISHED'
  AND map_import.division_saved_at IS NOT NULL
  AND public.census_user_can_access_import(map_import.id);
REVOKE ALL ON TABLE public.census_territory_map_imports FROM anon, authenticated;
GRANT SELECT ON TABLE public.census_territory_map_imports TO authenticated;

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
  lot.zone_id
FROM public.census_map_lots lot
JOIN public.census_map_imports map_import ON map_import.id = lot.import_id
WHERE map_import.is_current IS TRUE
  AND map_import.status = 'PUBLISHED'
  AND map_import.division_saved_at IS NOT NULL
  AND lot.is_valid IS TRUE
  AND public.census_user_can_access_lot(lot.id);
REVOKE ALL ON TABLE public.census_territory_map_lots FROM anon, authenticated;
GRANT SELECT ON TABLE public.census_territory_map_lots TO authenticated;

CREATE OR REPLACE FUNCTION public.census_visits_assign_acs_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, auth
AS $$
DECLARE
  matched_acs_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'É necessário autenticar para registrar uma visita.' USING errcode = '42501';
  END IF;
  IF tg_op = 'UPDATE' THEN
    IF new.household_id IS DISTINCT FROM old.household_id
       OR new.acs_id IS DISTINCT FROM old.acs_id
       OR new.created_by IS DISTINCT FROM old.created_by THEN
      RAISE EXCEPTION 'O domicílio e o agente responsável pela visita são imutáveis.' USING errcode = '23514';
    END IF;
    RETURN new;
  END IF;
  new.created_by := auth.uid();
  IF coalesce(app_private.current_user_is_admin(), false) THEN
    IF new.acs_id IS NOT NULL AND NOT EXISTS (
      SELECT 1
      FROM public.census_households household
      JOIN public.census_map_lots lot ON lot.id = household.lot_id
      JOIN public.census_map_imports map_import
        ON map_import.id = lot.import_id
       AND map_import.is_current IS TRUE
       AND map_import.status = 'PUBLISHED'
       AND map_import.division_saved_at IS NOT NULL
      JOIN public.census_zones zone ON zone.id = lot.zone_id AND zone.active IS TRUE
      JOIN public.census_acs_zone_assignments assignment
        ON assignment.zone_id = zone.id AND assignment.acs_id = new.acs_id AND assignment.active IS TRUE
      JOIN public.census_acs acs ON acs.id = assignment.acs_id AND acs.active IS TRUE
      WHERE household.id = new.household_id AND lot.is_valid IS TRUE
    ) THEN
      RAISE EXCEPTION 'O ACS informado não está ativo e vinculado à zona deste domicílio.' USING errcode = '23514';
    END IF;
    RETURN new;
  END IF;
  SELECT acs.id INTO matched_acs_id
  FROM public.census_households household
  JOIN public.census_map_lots lot ON lot.id = household.lot_id
  JOIN public.census_map_imports map_import
    ON map_import.id = lot.import_id
   AND map_import.is_current IS TRUE
   AND map_import.status = 'PUBLISHED'
   AND map_import.division_saved_at IS NOT NULL
  JOIN public.census_zones zone ON zone.id = lot.zone_id AND zone.active IS TRUE
  JOIN public.census_acs_zone_assignments assignment
    ON assignment.zone_id = zone.id AND assignment.active IS TRUE
  JOIN public.census_acs acs ON acs.id = assignment.acs_id AND acs.active IS TRUE
  WHERE household.id = new.household_id
    AND lot.is_valid IS TRUE
    AND nullif(lower(btrim(acs.email)), '') = nullif(lower(btrim(auth.jwt() ->> 'email')), '')
  ORDER BY acs.id
  LIMIT 1;
  IF matched_acs_id IS NULL THEN
    RAISE EXCEPTION 'Sua conta não está vinculada como ACS ativo à zona deste domicílio.' USING errcode = '42501';
  END IF;
  IF new.acs_id IS NOT NULL AND new.acs_id <> matched_acs_id THEN
    RAISE EXCEPTION 'O ACS da visita é definido pelo usuário autenticado.' USING errcode = '42501';
  END IF;
  new.acs_id := matched_acs_id;
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.census_map_publish_draft(p_draft_import_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, auth
AS $$
DECLARE
  current_import_id uuid;
  draft_record public.census_map_imports%ROWTYPE;
  matched_count integer := 0;
  new_count integer := 0;
  prior_count integer := 0;
  published_count integer := 0;
  published_at_value timestamptz := now();
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(app_private.current_user_is_admin(), false) THEN
    RAISE EXCEPTION 'Somente um administrador pode publicar uma versão do mapa.' USING errcode = '42501';
  END IF;
  SELECT * INTO draft_record
  FROM public.census_map_imports
  WHERE id = p_draft_import_id
  FOR UPDATE;
  IF NOT FOUND OR draft_record.status <> 'DRAFT' OR draft_record.is_current IS TRUE THEN
    RAISE EXCEPTION 'O mapa selecionado não é um rascunho publicável.' USING errcode = '23514';
  END IF;
  IF draft_record.division_saved_at IS NULL THEN
    RAISE EXCEPTION 'Salve a divisão do rascunho antes de publicar.' USING errcode = '23514';
  END IF;
  SELECT id INTO current_import_id
  FROM public.census_map_imports
  WHERE is_current IS TRUE AND status = 'PUBLISHED'
  FOR UPDATE;
  IF current_import_id = p_draft_import_id THEN
    RAISE EXCEPTION 'Esta versão já está em uso.' USING errcode = '23514';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.census_map_lots draft_lot
    LEFT JOIN public.census_map_lots current_lot
      ON current_lot.id = draft_lot.matched_lot_id
     AND current_lot.import_id = current_import_id
    WHERE draft_lot.import_id = p_draft_import_id
      AND draft_lot.matched_lot_id IS NOT NULL
      AND current_lot.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Uma correspondência do rascunho não pertence mais à versão operacional atual. Reimporte ou revise o mapa.' USING errcode = '23514';
  END IF;

  IF current_import_id IS NOT NULL THEN
    INSERT INTO public.census_map_lot_snapshots (
      map_import_id, lot_id, source_handle, label, layer_name, geometry, area,
      is_valid, problem_reasons, zone_number, zone_id
    )
    SELECT lot.import_id, lot.id, lot.source_handle, lot.label, lot.layer_name,
      lot.geometry, lot.area, lot.is_valid, lot.problem_reasons, lot.zone_number, lot.zone_id
    FROM public.census_map_lots lot
    WHERE lot.import_id = current_import_id
    ON CONFLICT (map_import_id, lot_id) DO NOTHING;

    CREATE TEMP TABLE census_map_merge_transfer ON COMMIT DROP AS
    SELECT
      draft_lot.id AS draft_lot_id,
      current_lot.id AS current_lot_id,
      draft_lot.source_handle,
      draft_lot.label,
      draft_lot.layer_name,
      draft_lot.geometry,
      draft_lot.area,
      draft_lot.is_valid,
      draft_lot.problem_reasons,
      draft_lot.zone_number,
      draft_lot.zone_id
    FROM public.census_map_lots draft_lot
    JOIN public.census_map_lots current_lot
      ON current_lot.id = draft_lot.matched_lot_id
     AND current_lot.import_id = current_import_id
    WHERE draft_lot.import_id = p_draft_import_id;
    SELECT count(*)::integer INTO matched_count FROM pg_temp.census_map_merge_transfer;
    SELECT count(*)::integer INTO prior_count
    FROM public.census_map_lots WHERE import_id = current_import_id;
    new_count := (SELECT count(*)::integer FROM public.census_map_lots WHERE import_id = p_draft_import_id) - matched_count;

    DELETE FROM public.census_map_lots draft_lot
    USING pg_temp.census_map_merge_transfer transfer
    WHERE draft_lot.id = transfer.draft_lot_id;

    UPDATE public.census_map_lots current_lot
    SET import_id = p_draft_import_id,
        source_handle = transfer.source_handle,
        label = transfer.label,
        layer_name = transfer.layer_name,
        geometry = transfer.geometry,
        area = transfer.area,
        is_valid = transfer.is_valid,
        problem_reasons = transfer.problem_reasons,
        zone_number = transfer.zone_number,
        zone_id = transfer.zone_id,
        matched_lot_id = NULL,
        merge_status = 'PUBLISHED'
    FROM pg_temp.census_map_merge_transfer transfer
    WHERE current_lot.id = transfer.current_lot_id;

    UPDATE public.census_map_imports
    SET is_current = FALSE, status = 'ARCHIVED'
    WHERE id = current_import_id;
  ELSE
    SELECT count(*)::integer INTO new_count
    FROM public.census_map_lots WHERE import_id = p_draft_import_id;
  END IF;

  UPDATE public.census_map_lots
  SET merge_status = 'PUBLISHED', matched_lot_id = NULL
  WHERE import_id = p_draft_import_id;
  UPDATE public.census_map_imports
  SET is_current = TRUE,
      status = 'PUBLISHED',
      published_at = published_at_value,
      division_saved_at = coalesce(division_saved_at, published_at_value)
  WHERE id = p_draft_import_id;
  SELECT count(*)::integer INTO published_count
  FROM public.census_map_lots WHERE import_id = p_draft_import_id;
  RETURN jsonb_build_object(
    'import_id', p_draft_import_id,
    'matched_existing_lots', matched_count,
    'new_or_changed_lots', new_count,
    'previous_lots', prior_count,
    'published_lots', published_count,
    'published_at', published_at_value
  );
END;
$$;
REVOKE ALL ON FUNCTION public.census_map_publish_draft(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.census_map_publish_draft(uuid) TO authenticated;
