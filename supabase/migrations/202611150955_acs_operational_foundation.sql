BEGIN;

-- Domicílio completo, mantendo census_households como entidade compatível com o fluxo legado.
ALTER TABLE public.census_households
  ADD COLUMN IF NOT EXISTS address_line text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS address_complement text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS postal_code text,
  ADD COLUMN IF NOT EXISTS locality text,
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'municipal_collection',
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.census_families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id uuid NOT NULL REFERENCES public.census_households(id) ON DELETE RESTRICT,
  family_reference text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'municipal_collection',
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS census_families_active_reference_idx ON public.census_families(household_id,family_reference) WHERE active IS TRUE;
CREATE INDEX IF NOT EXISTS census_families_household_idx ON public.census_families(household_id,active);

CREATE TABLE IF NOT EXISTS public.census_citizens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid REFERENCES public.census_families(id) ON DELETE RESTRICT,
  full_name text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 160),
  preferred_name text,
  birth_date date,
  sex text CHECK (sex IS NULL OR sex IN ('F','M','O','NI')),
  cns text,
  cpf text,
  identification_status text NOT NULL DEFAULT 'PROVISIONAL' CHECK (identification_status IN ('PROVISIONAL','DECLARED','VALIDATED')),
  data_source text NOT NULL DEFAULT 'CITIZEN_REPORTED' CHECK (data_source IN ('CITIZEN_REPORTED','OBSERVED','INTEGRATED')),
  active boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cns IS NULL OR cns ~ '^[0-9]{15}$'),
  CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS census_citizens_active_cns_idx ON public.census_citizens(cns) WHERE active IS TRUE AND cns IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS census_citizens_active_cpf_idx ON public.census_citizens(cpf) WHERE active IS TRUE AND cpf IS NOT NULL;
CREATE INDEX IF NOT EXISTS census_citizens_family_idx ON public.census_citizens(family_id,active);

CREATE TABLE IF NOT EXISTS public.census_family_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES public.census_families(id) ON DELETE RESTRICT,
  citizen_id uuid NOT NULL REFERENCES public.census_citizens(id) ON DELETE RESTRICT,
  relationship_code text NOT NULL DEFAULT 'MEMBER',
  is_responsible boolean NOT NULL DEFAULT false,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_until IS NULL OR valid_until >= valid_from),
  UNIQUE (family_id,citizen_id,valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS census_family_members_one_responsible_idx ON public.census_family_members(family_id) WHERE is_responsible IS TRUE AND valid_until IS NULL;

-- Catálogos controlados e versionados. A aplicação grava os códigos, nunca apenas texto livre.
CREATE TABLE IF NOT EXISTS public.census_visit_reason_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source text NOT NULL DEFAULT 'municipal_foundation_v1',
  active boolean NOT NULL DEFAULT true,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  UNIQUE(code,version),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE TABLE IF NOT EXISTS public.census_visit_outcome_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source text NOT NULL DEFAULT 'municipal_foundation_v1',
  active boolean NOT NULL DEFAULT true,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  UNIQUE(code,version),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE TABLE IF NOT EXISTS public.census_visit_reason_links (
  visit_id uuid NOT NULL REFERENCES public.census_visits(id) ON DELETE RESTRICT,
  reason_id uuid NOT NULL REFERENCES public.census_visit_reason_catalog(id) ON DELETE RESTRICT,
  reason_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(visit_id,reason_id)
);
CREATE INDEX IF NOT EXISTS census_visit_reason_links_reason_idx ON public.census_visit_reason_links(reason_id,reason_version);

INSERT INTO public.census_visit_reason_catalog(code,label,version,source) VALUES
 ('CADASTRO_ATUALIZACAO','Cadastro ou atualização cadastral',1,'documento_acs_ace_medicos_v6'),
 ('VISITA_PERIODICA','Visita periódica',1,'documento_acs_ace_medicos_v6'),
 ('GESTANTE_PUERPERA_LACTANTE','Gestação, puerpério ou lactação',1,'documento_acs_ace_medicos_v6'),
 ('CRIANCA_ADOLESCENTE','Criança ou adolescente',1,'documento_acs_ace_medicos_v6'),
 ('PESSOA_IDOSA','Pessoa idosa',1,'documento_acs_ace_medicos_v6'),
 ('HIPERTENSAO','Hipertensão',1,'documento_acs_ace_medicos_v6'),
 ('DIABETES','Diabetes',1,'documento_acs_ace_medicos_v6'),
 ('SOFRIMENTO_PSICOSSOCIAL','Sofrimento psíquico',1,'documento_acs_ace_medicos_v6'),
 ('USO_SUBSTANCIAS','Uso de álcool, tabaco ou outras drogas',1,'documento_acs_ace_medicos_v6'),
 ('BUSCA_ATIVA','Busca ativa',1,'documento_acs_ace_medicos_v6'),
 ('RISCO_FAMILIAR','Risco familiar',1,'documento_acs_ace_medicos_v6'),
 ('VULNERABILIDADE_SOCIAL','Vulnerabilidade social',1,'documento_acs_ace_medicos_v6'),
 ('VACINACAO','Vacinação',1,'documento_acs_ace_medicos_v6'),
 ('ORIENTACAO','Orientação',1,'documento_acs_ace_medicos_v6'),
 ('ATIVIDADE_COLETIVA','Atividade coletiva',1,'documento_acs_ace_medicos_v6'),
 ('QUEIXA_SINAL_SINTOMA','Queixa, sinal ou sintoma relatado',1,'documento_acs_ace_medicos_v6'),
 ('SITUACAO_AMBIENTAL_VETORIAL','Situação ambiental ou vetorial',1,'documento_acs_ace_medicos_v6')
ON CONFLICT(code,version) DO UPDATE SET label=EXCLUDED.label,source=EXCLUDED.source,active=true;
INSERT INTO public.census_visit_outcome_catalog(code,label,version,source) VALUES
 ('REALIZADA','Visita realizada',1,'documento_acs_ace_medicos_v6'),
 ('AUSENTE','Pessoa ou responsável ausente',1,'documento_acs_ace_medicos_v6'),
 ('RECUSA','Visita recusada',1,'documento_acs_ace_medicos_v6'),
 ('DOMICILIO_FECHADO','Domicílio fechado',1,'documento_acs_ace_medicos_v6'),
 ('ENDERECO_NAO_LOCALIZADO','Endereço não localizado',1,'documento_acs_ace_medicos_v6'),
 ('MUDOU_SE','Família ou pessoa mudou-se',1,'documento_acs_ace_medicos_v6'),
 ('IMOVEL_VAZIO','Imóvel vazio ou sem ocupação',1,'documento_acs_ace_medicos_v6'),
 ('RETORNO_AGENDADO','Retorno agendado',1,'documento_acs_ace_medicos_v6'),
 ('ENCAMINHAMENTO','Encaminhamento realizado',1,'documento_acs_ace_medicos_v6')
ON CONFLICT(code,version) DO UPDATE SET label=EXCLUDED.label,source=EXCLUDED.source,active=true;

-- Agenda planejada e tarefas de campo.
CREATE TABLE IF NOT EXISTS public.census_agenda_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id uuid REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  establishment_id uuid REFERENCES public.health_establishments(id) ON DELETE RESTRICT,
  team_id uuid REFERENCES public.health_teams(id) ON DELETE RESTRICT,
  microarea_id uuid REFERENCES public.health_microareas(id) ON DELETE RESTRICT,
  professional_id uuid REFERENCES public.health_professionals(id) ON DELETE RESTRICT,
  household_id uuid REFERENCES public.census_households(id) ON DELETE RESTRICT,
  family_id uuid REFERENCES public.census_families(id) ON DELETE RESTRICT,
  citizen_id uuid REFERENCES public.census_citizens(id) ON DELETE RESTRICT,
  task_type text NOT NULL DEFAULT 'FVD',
  reason_id uuid REFERENCES public.census_visit_reason_catalog(id) ON DELETE RESTRICT,
  due_date date NOT NULL,
  priority integer NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','IN_PROGRESS','COMPLETED','CANCELLED','EXPIRED')),
  source text NOT NULL DEFAULT 'MUNICIPAL_PLANNING',
  instructions text NOT NULL DEFAULT '',
  completed_visit_id uuid REFERENCES public.census_visits(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS census_agenda_tasks_professional_idx ON public.census_agenda_tasks(professional_id,status,due_date,priority);
CREATE INDEX IF NOT EXISTS census_agenda_tasks_household_idx ON public.census_agenda_tasks(household_id,status,due_date);

-- FVD estruturada, adicionada à visita já existente para preservar o histórico legado.
ALTER TABLE public.census_visits
  ADD COLUMN IF NOT EXISTS visit_type text NOT NULL DEFAULT 'FVD',
  ADD COLUMN IF NOT EXISTS agenda_task_id uuid REFERENCES public.census_agenda_tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS municipality_id uuid REFERENCES public.municipalities(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS establishment_id uuid REFERENCES public.health_establishments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.health_teams(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS microarea_id uuid REFERENCES public.health_microareas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.health_professionals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS family_id uuid REFERENCES public.census_families(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS citizen_id uuid REFERENCES public.census_citizens(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS outcome_id uuid REFERENCES public.census_visit_outcome_catalog(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS outcome_version integer,
  ADD COLUMN IF NOT EXISTS guidance text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS referral text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS return_date date,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'municipal_collection',
  ADD COLUMN IF NOT EXISTS processing_status text NOT NULL DEFAULT 'LOCAL_DRAFT';
ALTER TABLE public.census_visits DROP CONSTRAINT IF EXISTS census_visits_processing_status_check;
ALTER TABLE public.census_visits ADD CONSTRAINT census_visits_processing_status_check CHECK (processing_status IN ('LOCAL_DRAFT','LOCALLY_VALIDATED','READY_FOR_EXPORT','EXPORTED','ACCEPTED','PROCESSED','RETURNED'));
CREATE INDEX IF NOT EXISTS census_visits_professional_date_idx ON public.census_visits(professional_id,visit_date DESC);
CREATE INDEX IF NOT EXISTS census_visits_agenda_task_idx ON public.census_visits(agenda_task_id);

-- Vincula automaticamente os ACS existentes ao novo diretório institucional quando houver usuário municipal.
INSERT INTO public.health_professionals(user_id,municipality_id,full_name,professional_category,active,metadata)
SELECT u.id,m.id,acs.full_name,'ACS',acs.active,jsonb_build_object('legacy_acs_id',acs.id)
FROM public.census_acs acs
JOIN public.usuarios u ON u.uuid=acs.user_id
CROSS JOIN LATERAL (SELECT id FROM public.municipalities WHERE code='pitangueiras-pr' LIMIT 1) m
WHERE acs.user_id IS NOT NULL
ON CONFLICT(user_id) DO UPDATE SET full_name=EXCLUDED.full_name,active=EXCLUDED.active,updated_at=now();
UPDATE public.census_acs acs
SET professional_id=p.id
FROM public.health_professionals p
JOIN public.usuarios u ON u.id=p.user_id
WHERE acs.user_id=u.uuid AND acs.professional_id IS NULL;

CREATE OR REPLACE FUNCTION public.census_foundation_my_context()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_user_id integer; v_professional jsonb; v_assignments jsonb; v_tasks jsonb;
BEGIN
 SELECT id INTO v_user_id FROM public.usuarios WHERE uuid=auth.uid() AND ativo IS TRUE;
 SELECT jsonb_build_object('id',p.id,'user_id',p.user_id,'municipality_id',p.municipality_id,'full_name',p.full_name,'professional_category',p.professional_category,'active',p.active) INTO v_professional FROM public.health_professionals p WHERE p.user_id=v_user_id AND p.active IS TRUE LIMIT 1;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',a.id,'role_id',a.role_id,'municipality_id',a.municipality_id,'establishment_id',a.establishment_id,'team_id',a.team_id,'microarea_id',a.microarea_id,'valid_from',a.valid_from,'valid_until',a.valid_until) ORDER BY a.valid_from DESC),'[]'::jsonb) INTO v_assignments FROM public.health_professional_assignments a JOIN public.health_professionals p ON p.id=a.professional_id WHERE p.user_id=v_user_id AND p.active IS TRUE AND a.active IS TRUE AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until,current_date);
 SELECT COALESCE(jsonb_agg(jsonb_build_object('id',t.id,'due_date',t.due_date,'priority',t.priority,'status',t.status,'task_type',t.task_type,'instructions',t.instructions,'household_id',t.household_id,'family_id',t.family_id,'citizen_id',t.citizen_id,'family_reference',f.family_reference,'citizen_name',c.full_name,'reason_code',r.code,'reason_label',r.label) ORDER BY t.status,t.due_date,t.priority DESC),'[]'::jsonb) INTO v_tasks FROM public.census_agenda_tasks t LEFT JOIN public.census_families f ON f.id=t.family_id LEFT JOIN public.census_citizens c ON c.id=t.citizen_id LEFT JOIN public.census_visit_reason_catalog r ON r.id=t.reason_id WHERE (t.professional_id=(v_professional->>'id')::uuid OR (t.professional_id IS NULL AND t.household_id IS NOT NULL AND public.census_user_can_access_household(t.household_id))) AND t.status IN ('PLANNED','IN_PROGRESS');
 RETURN jsonb_build_object('status',CASE WHEN v_professional IS NULL THEN 'pending-assignment' ELSE 'ready' END,'professional',v_professional,'assignments',v_assignments,'tasks',v_tasks);
END; $$;

CREATE OR REPLACE FUNCTION public.census_register_fvd(
 p_task_id uuid,p_household_id uuid,p_family_id uuid,p_citizen_id uuid,p_visit_date date,p_reason_codes text[],p_outcome_code text,p_notes text,p_guidance text,p_referral text,p_return_date date
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_user_id integer; v_professional public.health_professionals%ROWTYPE; v_task public.census_agenda_tasks%ROWTYPE; v_outcome public.census_visit_outcome_catalog%ROWTYPE; v_visit_id uuid; v_status text;
BEGIN
 SELECT id INTO v_user_id FROM public.usuarios WHERE uuid=auth.uid() AND ativo IS TRUE;
 SELECT p.* INTO v_professional FROM public.health_professionals p WHERE p.user_id=v_user_id AND p.active IS TRUE LIMIT 1;
 IF v_professional.id IS NULL THEN RAISE EXCEPTION 'Usuário sem vínculo de profissional de saúde ativo.' USING ERRCODE='42501'; END IF;
 IF NOT public.census_user_can_access_household(p_household_id) THEN RAISE EXCEPTION 'O domicílio está fora do escopo territorial do profissional.' USING ERRCODE='42501'; END IF;
 IF p_task_id IS NOT NULL THEN SELECT * INTO v_task FROM public.census_agenda_tasks WHERE id=p_task_id FOR UPDATE; IF v_task.id IS NULL THEN RAISE EXCEPTION 'Tarefa de agenda não encontrada.'; END IF; IF v_task.professional_id IS NOT NULL AND v_task.professional_id<>v_professional.id THEN RAISE EXCEPTION 'A tarefa pertence a outro profissional.' USING ERRCODE='42501'; END IF; END IF;
 SELECT * INTO v_outcome FROM public.census_visit_outcome_catalog WHERE code=p_outcome_code AND active IS TRUE AND current_date BETWEEN valid_from AND COALESCE(valid_until,current_date) ORDER BY version DESC LIMIT 1;
 IF v_outcome.id IS NULL THEN RAISE EXCEPTION 'Desfecho de visita inválido.' USING ERRCODE='23514'; END IF;
 IF p_outcome_code<>'REALIZADA' AND NULLIF(btrim(COALESCE(p_notes,'')),'') IS NULL THEN RAISE EXCEPTION 'Informe uma justificativa para este desfecho.' USING ERRCODE='23514'; END IF;
 IF p_return_date IS NOT NULL AND p_return_date<p_visit_date THEN RAISE EXCEPTION 'A data de retorno não pode ser anterior à visita.' USING ERRCODE='23514'; END IF;
 v_status:=CASE WHEN p_outcome_code IN ('AUSENTE','RECUSA','DOMICILIO_FECHADO','ENDERECO_NAO_LOCALIZADO') THEN 'NO_CONTACT' ELSE 'COMPLETED' END;
 INSERT INTO public.census_visits(household_id,acs_id,visit_date,status,notes,created_by,visit_type,agenda_task_id,municipality_id,professional_id,family_id,citizen_id,outcome_id,outcome_version,guidance,referral,return_date,processing_status)
 SELECT p_household_id,acs.id,p_visit_date,v_status,COALESCE(p_notes,''),auth.uid(),'FVD',p_task_id,v_professional.municipality_id, v_professional.id,p_family_id,p_citizen_id,v_outcome.id,v_outcome.version,COALESCE(p_guidance,''),COALESCE(p_referral,''),p_return_date,'LOCALLY_VALIDATED'
 FROM public.census_acs acs WHERE acs.professional_id=v_professional.id AND acs.active IS TRUE ORDER BY acs.id LIMIT 1 RETURNING id INTO v_visit_id;
 IF v_visit_id IS NULL THEN RAISE EXCEPTION 'O profissional ainda não possui cadastro ACS operacional ativo.' USING ERRCODE='23514'; END IF;
 INSERT INTO public.census_visit_reason_links(visit_id,reason_id,reason_version)
 SELECT v_visit_id,r.id,r.version FROM public.census_visit_reason_catalog r WHERE r.code=ANY(COALESCE(p_reason_codes,'{}'::text[])) AND r.active IS TRUE AND current_date BETWEEN r.valid_from AND COALESCE(r.valid_until,current_date);
 IF p_task_id IS NOT NULL THEN UPDATE public.census_agenda_tasks SET status='COMPLETED',completed_visit_id=v_visit_id,updated_at=now() WHERE id=p_task_id; END IF;
 RETURN v_visit_id;
END; $$;

ALTER TABLE public.census_families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.census_citizens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.census_family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.census_visit_reason_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.census_visit_outcome_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.census_visit_reason_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.census_agenda_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS census_families_scope ON public.census_families;
CREATE POLICY census_families_scope ON public.census_families FOR ALL TO authenticated USING(public.census_user_can_access_household(household_id)) WITH CHECK(public.census_user_can_access_household(household_id));
DROP POLICY IF EXISTS census_citizens_scope ON public.census_citizens;
CREATE POLICY census_citizens_scope ON public.census_citizens FOR ALL TO authenticated USING(family_id IS NULL OR EXISTS (SELECT 1 FROM public.census_families f WHERE f.id=family_id AND public.census_user_can_access_household(f.household_id))) WITH CHECK(family_id IS NULL OR EXISTS (SELECT 1 FROM public.census_families f WHERE f.id=family_id AND public.census_user_can_access_household(f.household_id)));
DROP POLICY IF EXISTS census_family_members_scope ON public.census_family_members;
CREATE POLICY census_family_members_scope ON public.census_family_members FOR ALL TO authenticated USING(EXISTS (SELECT 1 FROM public.census_families f WHERE f.id=family_id AND public.census_user_can_access_household(f.household_id))) WITH CHECK(EXISTS (SELECT 1 FROM public.census_families f WHERE f.id=family_id AND public.census_user_can_access_household(f.household_id)));
DROP POLICY IF EXISTS census_reason_catalog_read ON public.census_visit_reason_catalog;
CREATE POLICY census_reason_catalog_read ON public.census_visit_reason_catalog FOR SELECT TO authenticated USING(active IS TRUE);
DROP POLICY IF EXISTS census_outcome_catalog_read ON public.census_visit_outcome_catalog;
CREATE POLICY census_outcome_catalog_read ON public.census_visit_outcome_catalog FOR SELECT TO authenticated USING(active IS TRUE);
DROP POLICY IF EXISTS census_reason_links_scope ON public.census_visit_reason_links;
CREATE POLICY census_reason_links_scope ON public.census_visit_reason_links FOR SELECT TO authenticated USING(EXISTS (SELECT 1 FROM public.census_visits v WHERE v.id=visit_id AND public.census_user_can_access_household(v.household_id)));
DROP POLICY IF EXISTS census_agenda_tasks_scope ON public.census_agenda_tasks;
CREATE POLICY census_agenda_tasks_scope ON public.census_agenda_tasks FOR SELECT TO authenticated USING(public.municipal_governance_is_admin() OR professional_id IN (SELECT p.id FROM public.health_professionals p JOIN public.usuarios u ON u.id=p.user_id WHERE u.uuid=auth.uid() AND p.active IS TRUE) OR (professional_id IS NULL AND household_id IS NOT NULL AND public.census_user_can_access_household(household_id)));

REVOKE ALL ON public.census_families,public.census_citizens,public.census_family_members,public.census_visit_reason_catalog,public.census_visit_outcome_catalog,public.census_visit_reason_links,public.census_agenda_tasks FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON public.census_families,public.census_citizens,public.census_family_members TO authenticated;
GRANT SELECT ON public.census_visit_reason_catalog,public.census_visit_outcome_catalog,public.census_visit_reason_links,public.census_agenda_tasks TO authenticated;
GRANT ALL ON public.census_families,public.census_citizens,public.census_family_members,public.census_visit_reason_catalog,public.census_visit_outcome_catalog,public.census_visit_reason_links,public.census_agenda_tasks TO service_role;
REVOKE ALL ON FUNCTION public.census_foundation_my_context(),public.census_register_fvd(uuid,uuid,uuid,uuid,date,text[],text,text,text,text,date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.census_foundation_my_context(),public.census_register_fvd(uuid,uuid,uuid,uuid,date,text[],text,text,text,text,date) TO authenticated;

COMMIT;
