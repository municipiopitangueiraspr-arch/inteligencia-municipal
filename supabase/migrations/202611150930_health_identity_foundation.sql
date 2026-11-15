BEGIN;

-- Fundação transversal de identidade, território institucional e vínculo profissional.
-- Complementa municipal_org_units e municipal_user_assignments; não substitui a governança existente.

CREATE TABLE IF NOT EXISTS public.municipalities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  ibge_code text UNIQUE,
  name text NOT NULL,
  state_code text NOT NULL DEFAULT 'PR' CHECK (state_code ~ '^[A-Z]{2}$'),
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.health_establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  org_unit_id text REFERENCES public.municipal_org_units(id) ON DELETE RESTRICT,
  cnes text,
  name text NOT NULL,
  establishment_type text NOT NULL DEFAULT 'UBS',
  address jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, cnes),
  CHECK (cnes IS NULL OR cnes ~ '^[0-9]{7}$')
);

CREATE TABLE IF NOT EXISTS public.health_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  establishment_id uuid NOT NULL REFERENCES public.health_establishments(id) ON DELETE RESTRICT,
  org_unit_id text REFERENCES public.municipal_org_units(id) ON DELETE RESTRICT,
  ine text,
  name text NOT NULL,
  team_type text NOT NULL DEFAULT 'ESF',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, ine),
  CHECK (ine IS NULL OR ine ~ '^[0-9]{10}$')
);

CREATE TABLE IF NOT EXISTS public.health_microareas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  team_id uuid NOT NULL REFERENCES public.health_teams(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  population_reference integer CHECK (population_reference IS NULL OR population_reference >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, code)
);

CREATE TABLE IF NOT EXISTS public.health_professionals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id integer NOT NULL UNIQUE REFERENCES public.usuarios(id) ON DELETE RESTRICT,
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  full_name text NOT NULL,
  cns text,
  cpf text,
  cbo text,
  professional_category text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, cns),
  CHECK (cns IS NULL OR cns ~ '^[0-9]{15}$'),
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$')
);

CREATE TABLE IF NOT EXISTS public.health_professional_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  professional_id uuid NOT NULL REFERENCES public.health_professionals(id) ON DELETE RESTRICT,
  municipality_id uuid NOT NULL REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  establishment_id uuid REFERENCES public.health_establishments(id) ON DELETE RESTRICT,
  team_id uuid REFERENCES public.health_teams(id) ON DELETE RESTRICT,
  microarea_id uuid REFERENCES public.health_microareas(id) ON DELETE RESTRICT,
  role_id text NOT NULL REFERENCES public.municipal_roles(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

CREATE UNIQUE INDEX IF NOT EXISTS health_professional_assignments_active_idx
  ON public.health_professional_assignments(professional_id, COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(microarea_id, '00000000-0000-0000-0000-000000000000'::uuid), role_id)
  WHERE active IS TRUE;
CREATE INDEX IF NOT EXISTS health_establishments_municipality_idx ON public.health_establishments(municipality_id, active);
CREATE INDEX IF NOT EXISTS health_teams_municipality_idx ON public.health_teams(municipality_id, active);
CREATE INDEX IF NOT EXISTS health_microareas_team_idx ON public.health_microareas(team_id, active);
CREATE INDEX IF NOT EXISTS health_professionals_municipality_idx ON public.health_professionals(municipality_id, active);
CREATE INDEX IF NOT EXISTS health_assignments_scope_idx ON public.health_professional_assignments(municipality_id, team_id, microarea_id, active);

CREATE TABLE IF NOT EXISTS public.municipal_audit_events (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  municipality_id uuid REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  actor_user_id uuid,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','READ','EXPORT','SYNC','LOGIN','ACCESS_DENIED')),
  before_data jsonb,
  after_data jsonb,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS municipal_audit_events_created_idx ON public.municipal_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS municipal_audit_events_entity_idx ON public.municipal_audit_events(entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS municipal_audit_events_municipality_idx ON public.municipal_audit_events(municipality_id, created_at DESC);

INSERT INTO public.municipalities(code,name,state_code,timezone)
VALUES ('pitangueiras-pr','Pitangueiras','PR','America/Sao_Paulo')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,state_code=EXCLUDED.state_code,timezone=EXCLUDED.timezone,updated_at=now();

INSERT INTO public.municipal_roles(id,label,description,is_system) VALUES
 ('HEALTH_MANAGER','Gestor de Saúde','Administra a estrutura e os vínculos autorizados da rede de saúde.',true),
 ('HEALTH_SUPERVISOR','Supervisor de Saúde','Supervisiona equipes, microáreas e pendências sob sua responsabilidade.',true),
 ('PHYSICIAN','Médico','Registra atendimentos individuais e linhas de cuidado autorizadas.',true),
 ('NURSE','Enfermeiro','Registra cuidados e acompanhamentos autorizados da equipe.',true),
 ('HEALTH_PROFESSIONAL','Profissional de Saúde','Atua nos módulos assistenciais conforme categoria e escopo.',true)
ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,is_active=true;

INSERT INTO public.municipal_permissions(id,label,description,module_id) VALUES
 ('foundation.identity.read','Consultar identidade e estrutura de saúde','Consultar município, unidades, equipes, microáreas e vínculos autorizados.',NULL),
 ('foundation.identity.manage','Administrar identidade e estrutura de saúde','Cadastrar e versionar estrutura, profissionais e vínculos.',NULL),
 ('foundation.audit.read','Consultar auditoria transversal','Consultar a trilha de auditoria conforme escopo autorizado.',NULL)
ON CONFLICT(id) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,module_id=EXCLUDED.module_id;

INSERT INTO public.municipal_role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES ('GOVERNANCE_ADMIN'),('HEALTH_MANAGER')) AS r(id)
CROSS JOIN (VALUES ('foundation.identity.read'),('foundation.identity.manage'),('foundation.audit.read')) AS p(id)
ON CONFLICT DO NOTHING;
INSERT INTO public.municipal_role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES ('HEALTH_SUPERVISOR')) AS r(id)
CROSS JOIN (VALUES ('foundation.identity.read')) AS p(id)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.municipal_foundation_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
  SELECT public.municipal_governance_is_admin()
     OR public.municipal_user_has_role('HEALTH_MANAGER')
$$;

CREATE OR REPLACE FUNCTION public.municipal_foundation_can_access_municipality(p_municipality_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
  SELECT auth.uid() IS NOT NULL AND (
    public.municipal_foundation_is_admin()
    OR EXISTS (
      SELECT 1
      FROM public.municipal_user_assignments a
      JOIN public.usuarios u ON u.id=a.user_id
      WHERE u.uuid=auth.uid() AND u.ativo IS TRUE AND a.active IS TRUE
        AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until,current_date)
        AND EXISTS (
          SELECT 1 FROM public.municipal_assignment_scopes s
          WHERE s.assignment_id=a.id AND s.scope_type='municipality' AND s.scope_key=p_municipality_id::text
        )
    )
    OR EXISTS (
      SELECT 1 FROM public.municipal_user_assignments a
      JOIN public.usuarios u ON u.id=a.user_id
      WHERE u.uuid=auth.uid() AND u.ativo IS TRUE AND a.active IS TRUE
        AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until,current_date)
        AND a.org_unit_id='municipality'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.municipal_foundation_audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE
  v_municipality_id uuid;
  v_row jsonb;
BEGIN
  v_row := CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  IF v_row ? 'municipality_id' THEN v_municipality_id := NULLIF(v_row->>'municipality_id','')::uuid; END IF;
  INSERT INTO public.municipal_audit_events(municipality_id,actor_user_id,entity_type,entity_id,action,before_data,after_data)
  VALUES(v_municipality_id,auth.uid(),TG_TABLE_NAME,COALESCE(v_row->>'id',''),TG_OP,CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END);
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS municipalities_audit ON public.municipalities;
CREATE TRIGGER municipalities_audit AFTER INSERT OR UPDATE OR DELETE ON public.municipalities FOR EACH ROW EXECUTE FUNCTION public.municipal_foundation_audit_row();
DROP TRIGGER IF EXISTS health_establishments_audit ON public.health_establishments;
CREATE TRIGGER health_establishments_audit AFTER INSERT OR UPDATE OR DELETE ON public.health_establishments FOR EACH ROW EXECUTE FUNCTION public.municipal_foundation_audit_row();
DROP TRIGGER IF EXISTS health_teams_audit ON public.health_teams;
CREATE TRIGGER health_teams_audit AFTER INSERT OR UPDATE OR DELETE ON public.health_teams FOR EACH ROW EXECUTE FUNCTION public.municipal_foundation_audit_row();
DROP TRIGGER IF EXISTS health_microareas_audit ON public.health_microareas;
CREATE TRIGGER health_microareas_audit AFTER INSERT OR UPDATE OR DELETE ON public.health_microareas FOR EACH ROW EXECUTE FUNCTION public.municipal_foundation_audit_row();
DROP TRIGGER IF EXISTS health_professionals_audit ON public.health_professionals;
CREATE TRIGGER health_professionals_audit AFTER INSERT OR UPDATE OR DELETE ON public.health_professionals FOR EACH ROW EXECUTE FUNCTION public.municipal_foundation_audit_row();
DROP TRIGGER IF EXISTS health_professional_assignments_audit ON public.health_professional_assignments;
CREATE TRIGGER health_professional_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON public.health_professional_assignments FOR EACH ROW EXECUTE FUNCTION public.municipal_foundation_audit_row();

CREATE OR REPLACE FUNCTION public.municipal_foundation_get_my_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE
  v_user_id integer;
  v_municipality jsonb;
  v_professional jsonb;
  v_assignments jsonb;
BEGIN
  SELECT id INTO v_user_id FROM public.usuarios WHERE uuid=auth.uid() AND ativo IS TRUE;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('status','pending-assignment','municipality',NULL,'professional',NULL,'assignments','[]'::jsonb);
  END IF;
  SELECT to_jsonb(m) INTO v_municipality
  FROM public.municipalities m
  WHERE m.active IS TRUE AND public.municipal_foundation_can_access_municipality(m.id)
  ORDER BY m.name LIMIT 1;
  SELECT jsonb_build_object('id',p.id,'user_id',p.user_id,'municipality_id',p.municipality_id,'full_name',p.full_name,'cns',p.cns,'cbo',p.cbo,'professional_category',p.professional_category,'active',p.active)
  INTO v_professional
  FROM public.health_professionals p WHERE p.user_id=v_user_id AND p.active IS TRUE LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'role_id',a.role_id,'municipality_id',a.municipality_id,'establishment_id',a.establishment_id,'team_id',a.team_id,'microarea_id',a.microarea_id,'valid_from',a.valid_from,'valid_until',a.valid_until) ORDER BY a.valid_from DESC),'[]'::jsonb)
  INTO v_assignments
  FROM public.health_professional_assignments a
  JOIN public.health_professionals p ON p.id=a.professional_id
  WHERE p.user_id=v_user_id AND a.active IS TRUE AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until,current_date)
    AND public.municipal_foundation_can_access_municipality(a.municipality_id);
  RETURN jsonb_build_object('status',CASE WHEN v_municipality IS NULL THEN 'pending-assignment' ELSE 'ready' END,'municipality',v_municipality,'professional',v_professional,'assignments',v_assignments);
END;
$$;

ALTER TABLE public.municipalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_microareas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_professionals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_professional_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_audit_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS municipalities_read ON public.municipalities;
CREATE POLICY municipalities_read ON public.municipalities FOR SELECT TO authenticated USING(active IS TRUE AND public.municipal_foundation_can_access_municipality(id));
DROP POLICY IF EXISTS municipalities_manage ON public.municipalities;
CREATE POLICY municipalities_manage ON public.municipalities FOR ALL TO authenticated USING(public.municipal_foundation_is_admin()) WITH CHECK(public.municipal_foundation_is_admin());
DROP POLICY IF EXISTS health_establishments_read ON public.health_establishments;
CREATE POLICY health_establishments_read ON public.health_establishments FOR SELECT TO authenticated USING(public.municipal_foundation_can_access_municipality(municipality_id));
DROP POLICY IF EXISTS health_establishments_manage ON public.health_establishments;
CREATE POLICY health_establishments_manage ON public.health_establishments FOR ALL TO authenticated USING(public.municipal_foundation_is_admin()) WITH CHECK(public.municipal_foundation_is_admin());
DROP POLICY IF EXISTS health_teams_read ON public.health_teams;
CREATE POLICY health_teams_read ON public.health_teams FOR SELECT TO authenticated USING(public.municipal_foundation_can_access_municipality(municipality_id));
DROP POLICY IF EXISTS health_teams_manage ON public.health_teams;
CREATE POLICY health_teams_manage ON public.health_teams FOR ALL TO authenticated USING(public.municipal_foundation_is_admin()) WITH CHECK(public.municipal_foundation_is_admin());
DROP POLICY IF EXISTS health_microareas_read ON public.health_microareas;
CREATE POLICY health_microareas_read ON public.health_microareas FOR SELECT TO authenticated USING(public.municipal_foundation_can_access_municipality(municipality_id));
DROP POLICY IF EXISTS health_microareas_manage ON public.health_microareas;
CREATE POLICY health_microareas_manage ON public.health_microareas FOR ALL TO authenticated USING(public.municipal_foundation_is_admin()) WITH CHECK(public.municipal_foundation_is_admin());
DROP POLICY IF EXISTS health_professionals_read ON public.health_professionals;
CREATE POLICY health_professionals_read ON public.health_professionals FOR SELECT TO authenticated USING(public.municipal_foundation_can_access_municipality(municipality_id) OR user_id=(SELECT id FROM public.usuarios WHERE uuid=auth.uid()));
DROP POLICY IF EXISTS health_professionals_manage ON public.health_professionals;
CREATE POLICY health_professionals_manage ON public.health_professionals FOR ALL TO authenticated USING(public.municipal_foundation_is_admin()) WITH CHECK(public.municipal_foundation_is_admin());
DROP POLICY IF EXISTS health_assignments_read ON public.health_professional_assignments;
CREATE POLICY health_assignments_read ON public.health_professional_assignments FOR SELECT TO authenticated USING(public.municipal_foundation_can_access_municipality(municipality_id) OR professional_id IN (SELECT id FROM public.health_professionals WHERE user_id=(SELECT id FROM public.usuarios WHERE uuid=auth.uid())));
DROP POLICY IF EXISTS health_assignments_manage ON public.health_professional_assignments;
CREATE POLICY health_assignments_manage ON public.health_professional_assignments FOR ALL TO authenticated USING(public.municipal_foundation_is_admin()) WITH CHECK(public.municipal_foundation_is_admin());
DROP POLICY IF EXISTS municipal_audit_events_read ON public.municipal_audit_events;
CREATE POLICY municipal_audit_events_read ON public.municipal_audit_events FOR SELECT TO authenticated USING(public.municipal_user_has_role('GOVERNANCE_ADMIN') OR public.municipal_user_has_role('HEALTH_MANAGER'));

REVOKE ALL ON public.municipalities,public.health_establishments,public.health_teams,public.health_microareas,public.health_professionals,public.health_professional_assignments,public.municipal_audit_events FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.municipalities,public.health_establishments,public.health_teams,public.health_microareas,public.health_professionals,public.health_professional_assignments TO authenticated;
GRANT SELECT ON public.municipal_audit_events TO authenticated;
GRANT ALL ON public.municipalities,public.health_establishments,public.health_teams,public.health_microareas,public.health_professionals,public.health_professional_assignments,public.municipal_audit_events TO service_role;
REVOKE ALL ON FUNCTION public.municipal_foundation_is_admin(),public.municipal_foundation_can_access_municipality(uuid),public.municipal_foundation_audit_row(),public.municipal_foundation_get_my_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.municipal_foundation_is_admin(),public.municipal_foundation_can_access_municipality(uuid),public.municipal_foundation_get_my_context() TO authenticated;

COMMIT;
