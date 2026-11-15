BEGIN;

ALTER TABLE public.census_zones
  ADD COLUMN IF NOT EXISTS microarea_id uuid REFERENCES public.health_microareas(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS census_zones_microarea_id_idx
  ON public.census_zones(microarea_id);

COMMENT ON COLUMN public.census_zones.microarea_id IS
  'Microárea oficial da Saúde associada à zona visual colorida do mapa.';

COMMIT;
