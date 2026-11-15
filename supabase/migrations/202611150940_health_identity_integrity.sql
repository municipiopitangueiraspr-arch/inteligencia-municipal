BEGIN;

-- Mantém census_acs como cadastro operacional legado, mas permite vinculá-lo ao
-- profissional institucional sem criar uma segunda identidade para a mesma pessoa.
ALTER TABLE public.census_acs
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.health_professionals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS census_acs_professional_id_idx ON public.census_acs(professional_id) WHERE professional_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.health_foundation_validate_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_municipality_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'health_teams' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.health_establishments e
      WHERE e.id = NEW.establishment_id AND e.municipality_id = NEW.municipality_id
    ) THEN
      RAISE EXCEPTION 'A equipe deve pertencer ao mesmo município do estabelecimento' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'health_microareas' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.health_teams t
      WHERE t.id = NEW.team_id AND t.municipality_id = NEW.municipality_id
    ) THEN
      RAISE EXCEPTION 'A microárea deve pertencer ao mesmo município da equipe' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'health_professional_assignments' THEN
    SELECT p.municipality_id INTO v_municipality_id FROM public.health_professionals p WHERE p.id=NEW.professional_id;
    IF v_municipality_id IS DISTINCT FROM NEW.municipality_id THEN
      RAISE EXCEPTION 'O vínculo profissional deve pertencer ao município do profissional' USING ERRCODE='23514';
    END IF;
    IF NEW.establishment_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.health_establishments e WHERE e.id=NEW.establishment_id AND e.municipality_id=NEW.municipality_id) THEN
      RAISE EXCEPTION 'O estabelecimento do vínculo não pertence ao município informado' USING ERRCODE='23514';
    END IF;
    IF NEW.team_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.health_teams t WHERE t.id=NEW.team_id AND t.municipality_id=NEW.municipality_id AND (NEW.establishment_id IS NULL OR t.establishment_id=NEW.establishment_id)) THEN
      RAISE EXCEPTION 'A equipe do vínculo não pertence ao estabelecimento informado' USING ERRCODE='23514';
    END IF;
    IF NEW.microarea_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.health_microareas m WHERE m.id=NEW.microarea_id AND m.municipality_id=NEW.municipality_id AND (NEW.team_id IS NULL OR m.team_id=NEW.team_id)) THEN
      RAISE EXCEPTION 'A microárea do vínculo não pertence à equipe informada' USING ERRCODE='23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'census_acs' AND NEW.professional_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.health_professionals p
      JOIN public.usuarios u ON u.id=p.user_id
      WHERE p.id=NEW.professional_id AND p.active IS TRUE AND u.uuid=NEW.user_id AND u.ativo IS TRUE
    ) THEN
      RAISE EXCEPTION 'O cadastro ACS deve apontar para o mesmo usuário do profissional institucional' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS health_teams_validate_scope ON public.health_teams;
CREATE TRIGGER health_teams_validate_scope BEFORE INSERT OR UPDATE ON public.health_teams FOR EACH ROW EXECUTE FUNCTION public.health_foundation_validate_scope();
DROP TRIGGER IF EXISTS health_microareas_validate_scope ON public.health_microareas;
CREATE TRIGGER health_microareas_validate_scope BEFORE INSERT OR UPDATE ON public.health_microareas FOR EACH ROW EXECUTE FUNCTION public.health_foundation_validate_scope();
DROP TRIGGER IF EXISTS health_professional_assignments_validate_scope ON public.health_professional_assignments;
CREATE TRIGGER health_professional_assignments_validate_scope BEFORE INSERT OR UPDATE ON public.health_professional_assignments FOR EACH ROW EXECUTE FUNCTION public.health_foundation_validate_scope();
DROP TRIGGER IF EXISTS census_acs_validate_professional ON public.census_acs;
CREATE TRIGGER census_acs_validate_professional BEFORE INSERT OR UPDATE OF user_id,professional_id ON public.census_acs FOR EACH ROW EXECUTE FUNCTION public.health_foundation_validate_scope();

REVOKE ALL ON FUNCTION public.health_foundation_validate_scope() FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.census_acs TO service_role;

COMMIT;
