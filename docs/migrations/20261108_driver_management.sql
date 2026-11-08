-- Gestão de motoristas: dados, validação, trilhas append-only e RPCs tenant-scoped.
-- Dados legados foram confirmados fictícios; identificadores malformados são adaptados.
-- Migração deliberadamente transacional; NÃO aplicar automaticamente em produção.
BEGIN;

-- 1. Campos configuráveis, chaves tenant e validação de identificadores.
ALTER TABLE public.fleet_drivers
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS cnh_category text;
ALTER TABLE public.fleet_vehicle_categories
  ADD COLUMN IF NOT EXISTS required_cnh_category text;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_municipio_id_id_uidx
  ON public.fleet_drivers(municipio_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS unidades_organizacionais_municipio_id_id_uidx
  ON public.unidades_organizacionais(municipio_id,id);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_drivers'::regclass AND conname='fleet_drivers_unit_same_municipio_fk') THEN
    ALTER TABLE public.fleet_drivers ADD CONSTRAINT fleet_drivers_unit_same_municipio_fk
      FOREIGN KEY (municipio_id,unidade_id) REFERENCES public.unidades_organizacionais(municipio_id,id) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_normalize_cpf(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog
AS $$ SELECT NULLIF(regexp_replace(COALESCE(p_value,''),'[^0-9]','','g'),'') $$;

CREATE OR REPLACE FUNCTION public.fleet_cpf_is_valid(p_value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog
AS $$
DECLARE n text:=regexp_replace(COALESCE(p_value,''),'[^0-9]','','g'); s integer; d integer; i integer;
BEGIN
  IF n !~ '^[0-9]{11}$' OR n ~ '^(.)\1{10}$' THEN RETURN false; END IF;
  s:=0; FOR i IN 1..9 LOOP s:=s+substr(n,i,1)::integer*(11-i); END LOOP;
  d:=mod(s*10,11); IF d=10 THEN d:=0; END IF;
  IF d<>substr(n,10,1)::integer THEN RETURN false; END IF;
  s:=0; FOR i IN 1..10 LOOP s:=s+substr(n,i,1)::integer*(12-i); END LOOP;
  d:=mod(s*10,11); IF d=10 THEN d:=0; END IF;
  RETURN d=substr(n,11,1)::integer;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_cnh_category_compatible(driver_category text,required_category text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path=pg_catalog
AS $$
 SELECT CASE WHEN required_category IS NULL OR btrim(required_category)='' THEN true
   WHEN upper(btrim(required_category))='ACC' THEN upper(COALESCE(btrim(driver_category),'')) IN ('ACC','A','AB','AC','AD','AE')
   WHEN upper(btrim(required_category))='A' THEN upper(COALESCE(btrim(driver_category),'')) IN ('A','AB','AC','AD','AE')
   WHEN upper(btrim(required_category))='B' THEN upper(COALESCE(btrim(driver_category),'')) IN ('B','C','D','E','AB','AC','AD','AE')
   WHEN upper(btrim(required_category))='C' THEN upper(COALESCE(btrim(driver_category),'')) IN ('C','D','E','AC','AD','AE')
   WHEN upper(btrim(required_category))='D' THEN upper(COALESCE(btrim(driver_category),'')) IN ('D','E','AD','AE')
   WHEN upper(btrim(required_category))='E' THEN upper(COALESCE(btrim(driver_category),'')) IN ('E','AE')
   WHEN upper(btrim(required_category))='AB' THEN upper(COALESCE(btrim(driver_category),'')) IN ('AB','AC','AD','AE')
   WHEN upper(btrim(required_category))='AC' THEN upper(COALESCE(btrim(driver_category),'')) IN ('AC','AD','AE')
   WHEN upper(btrim(required_category))='AD' THEN upper(COALESCE(btrim(driver_category),'')) IN ('AD','AE')
   WHEN upper(btrim(required_category))='AE' THEN upper(COALESCE(btrim(driver_category),''))='AE'
   ELSE false END
$$;

-- Canonicaliza apenas gravações novas/alteradas; CPF ausente é permitido.
CREATE OR REPLACE FUNCTION public.fleet_driver_validate_identifiers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE cpf_norm text; cnh_norm text;
BEGIN
  IF TG_OP='INSERT' OR NEW.cpf IS DISTINCT FROM OLD.cpf THEN
    cpf_norm:=public.fleet_normalize_cpf(NEW.cpf);
    IF cpf_norm IS NOT NULL AND (length(cpf_norm)<>11 OR NOT public.fleet_cpf_is_valid(cpf_norm)) THEN
      RAISE EXCEPTION 'CPF inválido';
    END IF;
    NEW.cpf:=cpf_norm;
  END IF;
  IF TG_OP='INSERT' OR NEW.cnh_number IS DISTINCT FROM OLD.cnh_number THEN
    cnh_norm:=NULLIF(regexp_replace(COALESCE(NEW.cnh_number,''),'[^0-9]','','g'),'');
    IF cnh_norm IS NOT NULL AND cnh_norm !~ '^[0-9]{11}$' THEN RAISE EXCEPTION 'CNH deve conter exatamente 11 dígitos'; END IF;
    NEW.cnh_number:=cnh_norm;
  END IF;
  IF TG_OP='INSERT' OR NEW.cnh_category IS DISTINCT FROM OLD.cnh_category THEN
    NEW.cnh_category:=NULLIF(upper(btrim(NEW.cnh_category)),'');
    IF NEW.cnh_category IS NOT NULL AND NEW.cnh_category NOT IN ('A','B','C','D','E','AB','AC','AD','AE','ACC') THEN
      RAISE EXCEPTION 'Categoria CNH inválida';
    END IF;
  END IF;
  IF TG_OP='INSERT' OR NEW.telefone IS DISTINCT FROM OLD.telefone THEN
    NEW.telefone:=NULLIF(btrim(NEW.telefone),'');
  END IF;
  IF TG_OP='INSERT' OR NEW.nome IS DISTINCT FROM OLD.nome THEN NEW.nome:=btrim(NEW.nome); END IF;
  IF TG_OP='INSERT' OR NEW.matricula IS DISTINCT FROM OLD.matricula THEN NEW.matricula:=NULLIF(btrim(NEW.matricula),''); END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_driver_validate_identifiers ON public.fleet_drivers;
CREATE TRIGGER fleet_driver_validate_identifiers BEFORE INSERT OR UPDATE OF nome,matricula,cpf,telefone,cnh_number,cnh_category
ON public.fleet_drivers FOR EACH ROW EXECUTE FUNCTION public.fleet_driver_validate_identifiers();

-- Ajusta dados declaradamente fictícios sem tocar em validade de CNH.
UPDATE public.fleet_drivers d SET cpf=CASE WHEN public.fleet_cpf_is_valid(public.fleet_normalize_cpf(d.cpf)) THEN public.fleet_normalize_cpf(d.cpf) ELSE NULL END;
WITH numbered AS (
  SELECT id, '9'||substr(translate(md5(id::text),'abcdef','012345'),1,10) AS synthetic_cnh
  FROM public.fleet_drivers WHERE cnh_number IS NULL OR regexp_replace(cnh_number,'[^0-9]','','g') !~ '^[0-9]{11}$'
)
UPDATE public.fleet_drivers d SET cnh_number=n.synthetic_cnh FROM numbered n WHERE n.id=d.id;
UPDATE public.fleet_drivers SET cnh_category=upper(btrim(cnh_category))
WHERE cnh_category IS NOT NULL AND upper(btrim(cnh_category)) IN ('A','B','C','D','E','AB','AC','AD','AE','ACC');
-- Remover a UNIQUE legada (município,matrícula), que proibia reutilização inativa.
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname,array_agg(a.attname::text ORDER BY a.attname::text) cols
    FROM pg_constraint pc CROSS JOIN LATERAL unnest(pc.conkey) k(attnum)
    JOIN pg_attribute a ON a.attrelid=pc.conrelid AND a.attnum=k.attnum
    WHERE pc.conrelid='public.fleet_drivers'::regclass AND pc.contype='u' GROUP BY pc.conname
  LOOP
    IF c.cols=ARRAY['matricula','municipio_id']::text[] THEN EXECUTE format('ALTER TABLE public.fleet_drivers DROP CONSTRAINT %I',c.conname); END IF;
  END LOOP;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.fleet_drivers WHERE ativo AND cpf IS NOT NULL GROUP BY municipio_id,public.fleet_normalize_cpf(cpf) HAVING count(*)>1) THEN RAISE EXCEPTION 'CPFs ativos duplicados após normalização; audite antes da migração'; END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_drivers WHERE ativo AND matricula IS NOT NULL GROUP BY municipio_id,upper(btrim(matricula)) HAVING count(*)>1) THEN RAISE EXCEPTION 'Matrículas ativas duplicadas após normalização; audite antes da migração'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_active_cpf_uidx ON public.fleet_drivers(municipio_id,public.fleet_normalize_cpf(cpf)) WHERE ativo AND cpf IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_active_registration_uidx ON public.fleet_drivers(municipio_id,upper(btrim(matricula))) WHERE ativo AND matricula IS NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_vehicle_categories'::regclass AND conname='fleet_vehicle_categories_required_cnh_check') THEN
    ALTER TABLE public.fleet_vehicle_categories ADD CONSTRAINT fleet_vehicle_categories_required_cnh_check
    CHECK (required_cnh_category IS NULL OR upper(btrim(required_cnh_category)) IN ('A','B','C','D','E','AB','AC','AD','AE','ACC')) NOT VALID;
  END IF;
END $$;

-- 2. Auditoria de motorista e autorização: sem cópia de valores sensíveis.
CREATE TABLE IF NOT EXISTS public.fleet_driver_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), municipio_id uuid NOT NULL REFERENCES public.municipios(id), driver_id uuid NOT NULL,
 event_type text NOT NULL, changed_fields text[] NOT NULL DEFAULT '{}', actor_id integer REFERENCES public.usuarios(id),
 performed_at timestamptz NOT NULL DEFAULT clock_timestamp(), reason text
);
CREATE INDEX IF NOT EXISTS fleet_driver_history_lookup_idx ON public.fleet_driver_history(municipio_id,driver_id,performed_at DESC);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_driver_history'::regclass AND conname='fleet_driver_history_driver_tenant_fk') THEN
  ALTER TABLE public.fleet_driver_history ADD CONSTRAINT fleet_driver_history_driver_tenant_fk FOREIGN KEY(municipio_id,driver_id) REFERENCES public.fleet_drivers(municipio_id,id) NOT VALID;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fleet_driver_write_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE fields text[]:='{}'; why text:=NULLIF(current_setting('fleet.driver_update_reason',true),''); actor integer:=public.fleet_current_usuario_id();
BEGIN
 IF TG_OP='INSERT' THEN
  fields:=ARRAY['nome','matricula','cpf','telefone','cnh_number','cnh_category','cnh_valid_until','unidade_id','ativo'];
  INSERT INTO public.fleet_driver_history(municipio_id,driver_id,event_type,changed_fields,actor_id,reason)
  VALUES(NEW.municipio_id,NEW.id,'CADASTRO',fields,actor,why);
  RETURN NEW;
 END IF;
 IF NEW.nome IS DISTINCT FROM OLD.nome THEN fields:=array_append(fields,'nome'); END IF;
 IF NEW.matricula IS DISTINCT FROM OLD.matricula THEN fields:=array_append(fields,'matricula'); END IF;
 IF NEW.cpf IS DISTINCT FROM OLD.cpf THEN fields:=array_append(fields,'cpf'); END IF;
 IF NEW.telefone IS DISTINCT FROM OLD.telefone THEN fields:=array_append(fields,'telefone'); END IF;
 IF NEW.cnh_number IS DISTINCT FROM OLD.cnh_number THEN fields:=array_append(fields,'cnh_number'); END IF;
 IF NEW.cnh_category IS DISTINCT FROM OLD.cnh_category THEN fields:=array_append(fields,'cnh_category'); END IF;
 IF NEW.cnh_valid_until IS DISTINCT FROM OLD.cnh_valid_until THEN fields:=array_append(fields,'cnh_valid_until'); END IF;
 IF NEW.unidade_id IS DISTINCT FROM OLD.unidade_id THEN fields:=array_append(fields,'unidade_id'); END IF;
 IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN fields:=array_append(fields,'ativo'); END IF;
 IF cardinality(fields)>0 THEN
  INSERT INTO public.fleet_driver_history(municipio_id,driver_id,event_type,changed_fields,actor_id,reason)
  VALUES(NEW.municipio_id,NEW.id,CASE WHEN NEW.ativo IS DISTINCT FROM OLD.ativo AND NOT NEW.ativo THEN 'INATIVACAO' ELSE 'ALTERACAO' END,fields,actor,why);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_driver_history_after_write ON public.fleet_drivers;
CREATE TRIGGER fleet_driver_history_after_write AFTER INSERT OR UPDATE ON public.fleet_drivers FOR EACH ROW EXECUTE FUNCTION public.fleet_driver_write_history();
SELECT set_config('fleet.driver_update_reason','Normalização fictícia inicial para ativação do módulo de motoristas',true);
INSERT INTO public.fleet_driver_history(municipio_id,driver_id,event_type,changed_fields,actor_id,reason)
SELECT d.municipio_id,d.id,'MIGRACAO',ARRAY['cpf','cnh_number'],NULL,'Backfill de habilitação e normalização de identificadores fictícios'
FROM public.fleet_drivers d WHERE NOT EXISTS (SELECT 1 FROM public.fleet_driver_history h WHERE h.driver_id=d.id AND h.event_type='MIGRACAO');

ALTER TABLE public.fleet_vehicle_driver_authorizations
 ADD COLUMN IF NOT EXISTS ended_at timestamptz,
 ADD COLUMN IF NOT EXISTS ended_by integer REFERENCES public.usuarios(id),
 ADD COLUMN IF NOT EXISTS ended_reason text;
CREATE TABLE IF NOT EXISTS public.fleet_vehicle_driver_authorization_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), municipio_id uuid NOT NULL REFERENCES public.municipios(id),
 authorization_id uuid NOT NULL, vehicle_id uuid NOT NULL, driver_id uuid NOT NULL,
 event_type text NOT NULL, actor_id integer REFERENCES public.usuarios(id), performed_at timestamptz NOT NULL DEFAULT clock_timestamp(), reason text
);
CREATE INDEX IF NOT EXISTS fleet_vehicle_driver_auth_history_idx ON public.fleet_vehicle_driver_authorization_history(municipio_id,authorization_id,performed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicle_driver_authorizations_municipio_id_id_uidx
 ON public.fleet_vehicle_driver_authorizations(municipio_id,id);
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_vehicle_driver_authorization_history'::regclass AND conname='fleet_vehicle_driver_auth_history_auth_fk') THEN
 ALTER TABLE public.fleet_vehicle_driver_authorization_history ADD CONSTRAINT fleet_vehicle_driver_auth_history_auth_fk FOREIGN KEY(municipio_id,authorization_id) REFERENCES public.fleet_vehicle_driver_authorizations(municipio_id,id) NOT VALID;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.fleet_driver_authorization_guard_and_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE actor integer:=public.fleet_current_usuario_id();
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Autorizações são históricas e não podem ser apagadas'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.municipio_id::text||':'||NEW.vehicle_id::text||':'||NEW.driver_id::text,0));
 IF NEW.status='ATIVA' AND NEW.ended_at IS NULL AND EXISTS (
   SELECT 1 FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=NEW.municipio_id AND a.vehicle_id=NEW.vehicle_id AND a.driver_id=NEW.driver_id
    AND a.id IS DISTINCT FROM NEW.id AND a.status='ATIVA' AND a.ended_at IS NULL
    AND a.valid_from<=COALESCE(NEW.valid_until,'infinity'::date) AND (a.valid_until IS NULL OR a.valid_until>=NEW.valid_from)
 ) THEN RAISE EXCEPTION 'Períodos de autorização ativos não podem se sobrepor'; END IF;
 IF TG_OP='UPDATE' AND NEW.status IS DISTINCT FROM OLD.status AND NEW.status IN ('REVOGADA','ENCERRADA') THEN
   NEW.ended_at:=COALESCE(NEW.ended_at,clock_timestamp()); NEW.ended_by:=COALESCE(NEW.ended_by,actor);
   NEW.ended_reason:=COALESCE(NULLIF(btrim(NEW.ended_reason),''),NULLIF(btrim(NEW.reason),''));
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_driver_authorization_audit ON public.fleet_vehicle_driver_authorizations;
CREATE TRIGGER fleet_driver_authorization_audit BEFORE INSERT OR UPDATE OR DELETE ON public.fleet_vehicle_driver_authorizations
FOR EACH ROW EXECUTE FUNCTION public.fleet_driver_authorization_guard_and_audit();
CREATE OR REPLACE FUNCTION public.fleet_driver_authorization_write_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE ev text; actor integer:=public.fleet_current_usuario_id(); why text;
BEGIN
 IF TG_OP='INSERT' THEN ev:='CONCESSAO'; why:=NEW.reason;
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
  ev:=CASE WHEN NEW.status='REVOGADA' THEN 'REVOGACAO' WHEN NEW.status='ENCERRADA' THEN 'ENCERRAMENTO' ELSE 'CONCESSAO' END;
  why:=COALESCE(NEW.ended_reason,NEW.reason);
 ELSIF (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN ev:='ALTERACAO'; why:=COALESCE(NEW.ended_reason,NEW.reason);
 ELSE RETURN NEW; END IF;
 INSERT INTO public.fleet_vehicle_driver_authorization_history(municipio_id,authorization_id,vehicle_id,driver_id,event_type,actor_id,reason)
 VALUES(NEW.municipio_id,NEW.id,NEW.vehicle_id,NEW.driver_id,ev,COALESCE(NEW.ended_by,actor),why);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_driver_authorization_history_after_write ON public.fleet_vehicle_driver_authorizations;
CREATE TRIGGER fleet_driver_authorization_history_after_write AFTER INSERT OR UPDATE ON public.fleet_vehicle_driver_authorizations
 FOR EACH ROW EXECUTE FUNCTION public.fleet_driver_authorization_write_history();

-- Corrige exatamente o backfill anterior: início/fim permanecem iguais ao legado.
-- ATIVA futura fica agendada pelo valid_from; expiradas tornam-se ENCERRADA.
INSERT INTO public.fleet_vehicle_driver_authorizations(municipio_id,vehicle_id,driver_id,valid_from,valid_until,status,reason,created_by,created_at)
SELECT old.municipio_id,old.vehicle_id,old.driver_id,COALESCE(old.valid_from,old.created_at::date),old.valid_until,
 CASE WHEN NOT old.ativo THEN 'REVOGADA' WHEN old.valid_until IS NOT NULL AND old.valid_until<CURRENT_DATE THEN 'ENCERRADA' ELSE 'ATIVA' END,
 'Migração corrigida da autorização fictícia legada',old.created_by,old.created_at
FROM public.fleet_vehicle_authorized_drivers old
WHERE NOT EXISTS (SELECT 1 FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=old.municipio_id AND a.vehicle_id=old.vehicle_id AND a.driver_id=old.driver_id AND a.created_at=old.created_at);
UPDATE public.fleet_vehicle_driver_authorizations a SET
 valid_from=COALESCE(old.valid_from,old.created_at::date),valid_until=old.valid_until,
 status=CASE WHEN NOT old.ativo THEN 'REVOGADA' WHEN old.valid_until IS NOT NULL AND old.valid_until<CURRENT_DATE THEN 'ENCERRADA' ELSE 'ATIVA' END,
 ended_at=CASE WHEN NOT old.ativo OR (old.valid_until IS NOT NULL AND old.valid_until<CURRENT_DATE) THEN COALESCE(a.ended_at,old.created_at) ELSE NULL END,
 ended_by=CASE WHEN NOT old.ativo OR (old.valid_until IS NOT NULL AND old.valid_until<CURRENT_DATE) THEN COALESCE(a.ended_by,old.created_by) ELSE NULL END,
 ended_reason=CASE WHEN NOT old.ativo OR (old.valid_until IS NOT NULL AND old.valid_until<CURRENT_DATE) THEN COALESCE(a.ended_reason,'Estado importado do legado') ELSE NULL END,
 reason='Migração corrigida da autorização fictícia legada'
FROM public.fleet_vehicle_authorized_drivers old
WHERE a.municipio_id=old.municipio_id AND a.vehicle_id=old.vehicle_id AND a.driver_id=old.driver_id AND a.created_at=old.created_at
 AND NOT EXISTS (SELECT 1 FROM public.fleet_vehicle_driver_authorization_history h WHERE h.authorization_id=a.id AND h.event_type='MIGRACAO');
UPDATE public.fleet_vehicle_driver_authorizations a SET
 ended_at=COALESCE(a.ended_at,old.created_at),ended_by=COALESCE(a.ended_by,old.created_by),
 ended_reason=COALESCE(a.ended_reason,'Estado importado do legado')
FROM public.fleet_vehicle_authorized_drivers old
WHERE a.municipio_id=old.municipio_id AND a.vehicle_id=old.vehicle_id AND a.driver_id=old.driver_id AND a.created_at=old.created_at
 AND (NOT old.ativo OR (old.valid_until IS NOT NULL AND old.valid_until<CURRENT_DATE))
 AND NOT EXISTS (SELECT 1 FROM public.fleet_vehicle_driver_authorization_history h WHERE h.authorization_id=a.id AND h.event_type='MIGRACAO');
UPDATE public.fleet_vehicle_authorized_drivers SET ativo=false WHERE ativo;
INSERT INTO public.fleet_vehicle_driver_authorization_history(municipio_id,authorization_id,vehicle_id,driver_id,event_type,actor_id,performed_at,reason)
SELECT a.municipio_id,a.id,a.vehicle_id,a.driver_id,'MIGRACAO',a.created_by,a.created_at,'Backfill da autorização canônica existente'
FROM public.fleet_vehicle_driver_authorizations a
WHERE NOT EXISTS (SELECT 1 FROM public.fleet_vehicle_driver_authorization_history h WHERE h.authorization_id=a.id AND h.event_type='MIGRACAO');

-- 3. Histórico append-only e privilégios/RLS de PII.
CREATE OR REPLACE FUNCTION public.fleet_append_only_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'Histórico é append-only'; END $$;
DROP TRIGGER IF EXISTS fleet_driver_history_no_mutation ON public.fleet_driver_history;
CREATE TRIGGER fleet_driver_history_no_mutation BEFORE UPDATE OR DELETE ON public.fleet_driver_history FOR EACH ROW EXECUTE FUNCTION public.fleet_append_only_guard();
DROP TRIGGER IF EXISTS fleet_driver_auth_history_no_mutation ON public.fleet_vehicle_driver_authorization_history;
CREATE TRIGGER fleet_driver_auth_history_no_mutation BEFORE UPDATE OR DELETE ON public.fleet_vehicle_driver_authorization_history FOR EACH ROW EXECUTE FUNCTION public.fleet_append_only_guard();
ALTER TABLE public.fleet_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_driver_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicle_driver_authorizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicle_driver_authorization_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fleet_drivers_manager_read ON public.fleet_drivers;
DROP POLICY IF EXISTS fleet_drivers_manager ON public.fleet_drivers;
CREATE POLICY fleet_drivers_manager_read ON public.fleet_drivers FOR SELECT TO authenticated
 USING(municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
DROP POLICY IF EXISTS fleet_driver_history_manager_read ON public.fleet_driver_history;
CREATE POLICY fleet_driver_history_manager_read ON public.fleet_driver_history FOR SELECT TO authenticated
 USING(municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
DROP POLICY IF EXISTS fleet_vehicle_driver_auth_manager_read ON public.fleet_vehicle_driver_authorizations;
DROP POLICY IF EXISTS fleet_vehicle_driver_auth_manager_write ON public.fleet_vehicle_driver_authorizations;
DROP POLICY IF EXISTS fleet_vehicle_driver_authorizations_read ON public.fleet_vehicle_driver_authorizations;
DROP POLICY IF EXISTS fleet_vehicle_driver_authorizations_manage ON public.fleet_vehicle_driver_authorizations;
CREATE POLICY fleet_vehicle_driver_auth_manager_read ON public.fleet_vehicle_driver_authorizations FOR SELECT TO authenticated
 USING(municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
DROP POLICY IF EXISTS fleet_vehicle_driver_auth_history_manager_read ON public.fleet_vehicle_driver_authorization_history;
CREATE POLICY fleet_vehicle_driver_auth_history_manager_read ON public.fleet_vehicle_driver_authorization_history FOR SELECT TO authenticated
 USING(municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
REVOKE ALL ON public.fleet_drivers,public.fleet_vehicle_driver_authorizations,public.fleet_driver_history,public.fleet_vehicle_driver_authorization_history FROM PUBLIC,anon,authenticated;
REVOKE SELECT (cpf,telefone,cnh_number) ON public.fleet_drivers FROM PUBLIC,anon,authenticated;
GRANT SELECT (id,municipio_id,usuario_id,nome,matricula,cnh_category,cnh_valid_until,unidade_id,ativo,created_by,created_at,updated_at) ON public.fleet_drivers TO authenticated;
GRANT SELECT ON public.fleet_vehicle_driver_authorizations,public.fleet_driver_history,public.fleet_vehicle_driver_authorization_history TO authenticated;

-- 4. RPCs gerente-only. CPF/CNH completos só fleet_get_driver.
CREATE OR REPLACE FUNCTION public.fleet_search_drivers(p_search text,p_status text,p_cnh_status text,p_page integer,p_page_size integer)
RETURNS TABLE(total_count bigint,id uuid,nome text,matricula text,cpf_masked text,cnh_masked text,cnh_category text,cnh_valid_until date,unidade_id uuid,unidade_nome text,ativo boolean,authorization_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE m uuid:=public.fleet_current_municipio_id(); pg integer:=GREATEST(COALESCE(p_page,0),0); sz integer:=LEAST(GREATEST(COALESCE(p_page_size,25),1),100);
BEGIN
 IF auth.role()<>'authenticated' OR m IS NULL OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Acesso restrito a gestores de frota' USING ERRCODE='42501'; END IF;
 RETURN QUERY WITH filtered AS (
  SELECT d.*,u.nome AS unit_name,(SELECT count(*) FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=d.municipio_id AND a.driver_id=d.id AND a.status='ATIVA' AND a.ended_at IS NULL AND a.valid_from<=CURRENT_DATE AND (a.valid_until IS NULL OR a.valid_until>=CURRENT_DATE)) AS ac
  FROM public.fleet_drivers d LEFT JOIN public.unidades_organizacionais u ON u.id=d.unidade_id AND u.municipio_id=d.municipio_id
  WHERE d.municipio_id=m AND (NULLIF(btrim(p_search),'') IS NULL OR concat_ws(' ',d.nome,d.matricula,d.cpf,d.cnh_number,d.telefone) ILIKE '%'||btrim(p_search)||'%')
   AND (p_status IS NULL OR upper(p_status) IN ('TODOS','ALL') OR (upper(p_status) IN ('ATIVO','ACTIVE') AND d.ativo) OR (upper(p_status) IN ('INATIVO','INACTIVE') AND NOT d.ativo))
   AND (p_cnh_status IS NULL OR upper(p_cnh_status) IN ('TODOS','ALL') OR (upper(p_cnh_status) IN ('VENCIDA','EXPIRED') AND d.cnh_valid_until<CURRENT_DATE) OR (upper(p_cnh_status) IN ('VENCE_60_DIAS','VENCE_EM_60_DIAS','EXPIRING') AND d.cnh_valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE+60) OR (upper(p_cnh_status) IN ('SEM_VALIDADE','NO_EXPIRY') AND d.cnh_valid_until IS NULL) OR (upper(p_cnh_status) IN ('VALIDA','VALID') AND d.cnh_valid_until>=CURRENT_DATE))
 ), counted AS (SELECT count(*)::bigint n FROM filtered), page AS (SELECT * FROM filtered ORDER BY filtered.nome,filtered.id LIMIT sz OFFSET pg*sz)
 SELECT counted.n,f.id,f.nome,f.matricula,CASE WHEN f.cpf IS NULL THEN NULL ELSE '***.***.***-'||right(f.cpf,2) END,
   CASE WHEN f.cnh_number IS NULL THEN NULL ELSE '********'||right(f.cnh_number,3) END,f.cnh_category,f.cnh_valid_until,f.unidade_id,f.unit_name,f.ativo,f.ac
 FROM page f CROSS JOIN counted ORDER BY f.nome,f.id;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_driver_summary()
RETURNS TABLE(total_count bigint,active_count bigint,inactive_count bigint,cnh_expired_count bigint,cnh_expires_60_days_count bigint,cnh_without_validity_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
BEGIN
 IF auth.role()<>'authenticated' OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Acesso restrito a gestores de frota' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT count(*)::bigint,count(*) FILTER(WHERE ativo)::bigint,count(*) FILTER(WHERE NOT ativo)::bigint,
 count(*) FILTER(WHERE cnh_valid_until<CURRENT_DATE)::bigint,count(*) FILTER(WHERE cnh_valid_until BETWEEN CURRENT_DATE AND CURRENT_DATE+60)::bigint,
 count(*) FILTER(WHERE cnh_valid_until IS NULL)::bigint FROM public.fleet_drivers WHERE municipio_id=public.fleet_current_municipio_id();
END $$;

CREATE OR REPLACE FUNCTION public.fleet_get_driver(p_driver_id uuid)
RETURNS TABLE(id uuid,nome text,matricula text,cpf text,telefone text,cnh_number text,cnh_category text,cnh_valid_until date,unidade_id uuid,ativo boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
BEGIN
 IF auth.role()<>'authenticated' OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Acesso restrito a gestores de frota' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT d.id,d.nome,d.matricula,d.cpf,d.telefone,d.cnh_number,d.cnh_category,d.cnh_valid_until,d.unidade_id,d.ativo
 FROM public.fleet_drivers d WHERE d.id=p_driver_id AND d.municipio_id=public.fleet_current_municipio_id();
END $$;

CREATE OR REPLACE FUNCTION public.fleet_save_driver(p_driver_id uuid,p_nome text,p_matricula text,p_cpf text,p_telefone text,p_cnh_number text,p_cnh_category text,p_cnh_valid_until date,p_unidade_id uuid,p_ativo boolean,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE m uuid:=public.fleet_current_municipio_id(); u integer:=public.fleet_current_usuario_id(); did uuid;
BEGIN
 IF auth.role()<>'authenticated' OR m IS NULL OR u IS NULL OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Acesso restrito a gestores de frota' USING ERRCODE='42501'; END IF;
 IF length(btrim(COALESCE(p_reason,'')))<3 OR NULLIF(btrim(p_nome),'') IS NULL THEN RAISE EXCEPTION 'Nome e motivo de auditoria são obrigatórios'; END IF;
 IF COALESCE(p_ativo,true) AND NULLIF(regexp_replace(COALESCE(p_cnh_number,''),'[^0-9]','','g'),'') IS NULL THEN RAISE EXCEPTION 'Motoristas ativos devem possuir número de CNH cadastrado'; END IF;
 IF p_unidade_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.unidades_organizacionais WHERE id=p_unidade_id AND municipio_id=m) THEN RAISE EXCEPTION 'Unidade não pertence ao município ativo'; END IF;
 PERFORM set_config('fleet.driver_update_reason',btrim(p_reason),true);
 IF p_driver_id IS NULL THEN
  INSERT INTO public.fleet_drivers(municipio_id,nome,matricula,cpf,telefone,cnh_number,cnh_category,cnh_valid_until,unidade_id,ativo,created_by)
  VALUES(m,btrim(p_nome),p_matricula,p_cpf,p_telefone,p_cnh_number,p_cnh_category,p_cnh_valid_until,p_unidade_id,COALESCE(p_ativo,true),u) RETURNING id INTO did;
 ELSE
  UPDATE public.fleet_drivers SET nome=btrim(p_nome),matricula=p_matricula,cpf=p_cpf,telefone=p_telefone,cnh_number=p_cnh_number,cnh_category=p_cnh_category,cnh_valid_until=p_cnh_valid_until,unidade_id=p_unidade_id,ativo=COALESCE(p_ativo,ativo),updated_at=clock_timestamp()
  WHERE id=p_driver_id AND municipio_id=m RETURNING id INTO did;
  IF did IS NULL THEN RAISE EXCEPTION 'Motorista não encontrado no município ativo'; END IF;
 END IF;
 RETURN did;
END $$;

DROP FUNCTION IF EXISTS public.fleet_manager_vehicle_driver_options(uuid,timestamptz);
CREATE FUNCTION public.fleet_manager_vehicle_driver_options(p_vehicle_id uuid,p_performed_at timestamptz,p_require_authorization boolean DEFAULT true)
RETURNS TABLE(id uuid,nome text,matricula text,cnh_category text,cnh_valid_until date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE m uuid:=public.fleet_current_municipio_id(); dt date; req text;
BEGIN
 IF auth.role()<>'authenticated' OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Acesso restrito a gestores de frota' USING ERRCODE='42501'; END IF;
 IF p_vehicle_id IS NULL OR p_performed_at IS NULL THEN RAISE EXCEPTION 'Veículo e instante efetivo são obrigatórios'; END IF;
 dt:=(p_performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
 SELECT c.required_cnh_category INTO req FROM public.fleet_vehicles v LEFT JOIN public.fleet_vehicle_categories c ON c.id=v.category_id AND c.municipio_id=v.municipio_id WHERE v.id=p_vehicle_id AND v.municipio_id=m;
 IF NOT FOUND THEN RAISE EXCEPTION 'Veículo não encontrado no município ativo'; END IF;
 RETURN QUERY SELECT d.id,d.nome,d.matricula,d.cnh_category,d.cnh_valid_until FROM public.fleet_drivers d
 WHERE d.municipio_id=m AND d.ativo
  AND d.cnh_number IS NOT NULL AND d.cnh_valid_until IS NOT NULL AND d.cnh_valid_until>=dt
  AND public.fleet_cnh_category_compatible(d.cnh_category,req)
  AND (NOT COALESCE(p_require_authorization,true) OR EXISTS (
    SELECT 1 FROM public.fleet_vehicle_driver_authorizations a
    WHERE a.municipio_id=m AND a.vehicle_id=p_vehicle_id AND a.driver_id=d.id
      AND a.status='ATIVA' AND a.ended_at IS NULL AND a.valid_from<=dt
      AND (a.valid_until IS NULL OR a.valid_until>=dt)
  ))
 ORDER BY d.nome,d.id;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_create_vehicle_driver_authorization(p_vehicle_id uuid,p_driver_id uuid,p_valid_from date,p_valid_until date,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE m uuid:=public.fleet_current_municipio_id(); did uuid; req text; d public.fleet_drivers%ROWTYPE;
BEGIN
 IF auth.role()<>'authenticated' OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Acesso restrito a gestores de frota' USING ERRCODE='42501'; END IF;
 IF p_valid_from IS NULL OR (p_valid_until IS NOT NULL AND p_valid_until<p_valid_from) OR length(btrim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'Período e motivo de autorização inválidos'; END IF;
 SELECT c.required_cnh_category INTO req FROM public.fleet_vehicles v LEFT JOIN public.fleet_vehicle_categories c ON c.id=v.category_id AND c.municipio_id=v.municipio_id WHERE v.id=p_vehicle_id AND v.municipio_id=m;
 IF NOT FOUND THEN RAISE EXCEPTION 'Veículo não encontrado no município ativo'; END IF;
 SELECT * INTO d FROM public.fleet_drivers WHERE id=p_driver_id AND municipio_id=m AND ativo;
 IF NOT FOUND OR d.cnh_number IS NULL OR d.cnh_valid_until IS NULL OR d.cnh_valid_until<p_valid_from OR NOT public.fleet_cnh_category_compatible(d.cnh_category,req) THEN RAISE EXCEPTION 'Motorista ativo, CNH válida e categoria compatível são obrigatórios'; END IF;
 INSERT INTO public.fleet_vehicle_driver_authorizations(municipio_id,vehicle_id,driver_id,valid_from,valid_until,status,reason,created_by)
 VALUES(m,p_vehicle_id,p_driver_id,p_valid_from,p_valid_until,'ATIVA',btrim(p_reason),public.fleet_current_usuario_id()) RETURNING id INTO did;
 RETURN did;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_end_vehicle_driver_authorization(p_authorization_id uuid,p_end_date date,p_reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE a public.fleet_vehicle_driver_authorizations%ROWTYPE;
BEGIN
 IF auth.role()<>'authenticated' OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Acesso restrito a gestores de frota' USING ERRCODE='42501'; END IF;
 IF p_end_date IS NULL OR p_end_date>(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date OR length(btrim(COALESCE(p_reason,'')))<3 THEN RAISE EXCEPTION 'A data final não pode ser futura e o motivo é obrigatório'; END IF;
 SELECT * INTO a FROM public.fleet_vehicle_driver_authorizations WHERE id=p_authorization_id AND municipio_id=public.fleet_current_municipio_id() FOR UPDATE;
 IF NOT FOUND OR a.status<>'ATIVA' OR a.ended_at IS NOT NULL THEN RAISE EXCEPTION 'Autorização ativa não encontrada'; END IF;
 IF p_end_date<a.valid_from THEN RAISE EXCEPTION 'Data final anterior ao início da autorização'; END IF;
 UPDATE public.fleet_vehicle_driver_authorizations SET status='ENCERRADA',valid_until=CASE WHEN valid_until IS NULL THEN p_end_date ELSE LEAST(valid_until,p_end_date) END,
  ended_at=clock_timestamp(),ended_by=public.fleet_current_usuario_id(),ended_reason=btrim(p_reason),reason=btrim(p_reason)
 WHERE id=a.id RETURNING id INTO a.id;
 RETURN a.id;
END $$;

-- 5. Opções de motoristas no portal de posto: somente autorizações canônicas.
DROP FUNCTION IF EXISTS public.fleet_supplier_driver_options(uuid,uuid,timestamptz);
CREATE FUNCTION public.fleet_supplier_driver_options(p_station_id uuid,p_vehicle_id uuid,p_performed_at timestamptz)
RETURNS TABLE(id uuid,nome text,matricula text,cnh_valid_until date,cnh_category text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE dt date; v public.fleet_vehicles%ROWTYPE; req text;
BEGIN
 IF auth.role()<>'authenticated' OR p_station_id IS NULL OR p_vehicle_id IS NULL OR p_performed_at IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id
  WHERE sm.station_id=p_station_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo AND s.municipio_id=public.fleet_current_municipio_id() AND s.status::text='ATIVO') THEN RAISE EXCEPTION 'Usuário, posto ou parâmetros inválidos' USING ERRCODE='42501'; END IF;
 dt:=(p_performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
 SELECT * INTO v FROM public.fleet_vehicles WHERE id=p_vehicle_id AND municipio_id=public.fleet_current_municipio_id();
 IF NOT FOUND OR v.operational_status::text NOT IN ('ATIVO','CEDIDO') THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.fleet_vehicle_restrictions r WHERE r.municipio_id=v.municipio_id AND r.vehicle_id=v.id AND r.active AND r.released_at IS NULL AND r.starts_at<=p_performed_at AND (r.ends_at IS NULL OR r.ends_at>=p_performed_at)) THEN RETURN; END IF;
 SELECT c.required_cnh_category INTO req FROM public.fleet_vehicle_categories c WHERE c.id=v.category_id AND c.municipio_id=v.municipio_id;
 RETURN QUERY SELECT DISTINCT d.id,d.nome,d.matricula,d.cnh_valid_until,d.cnh_category FROM public.fleet_vehicle_driver_authorizations a JOIN public.fleet_drivers d ON d.id=a.driver_id AND d.municipio_id=a.municipio_id
 WHERE a.municipio_id=v.municipio_id AND a.vehicle_id=v.id AND a.status='ATIVA' AND a.ended_at IS NULL AND a.valid_from<=dt AND (a.valid_until IS NULL OR a.valid_until>=dt)
 AND d.ativo AND d.cnh_number IS NOT NULL AND d.cnh_valid_until>=dt AND public.fleet_cnh_category_compatible(d.cnh_category,req) ORDER BY d.nome;
END $$;

-- 6. Snapshot imutável da identificação do condutor na operação.
ALTER TABLE public.fleet_fuelings ADD COLUMN IF NOT EXISTS driver_name_snapshot text, ADD COLUMN IF NOT EXISTS driver_registration_snapshot text;
UPDATE public.fleet_fuelings f SET driver_name_snapshot=COALESCE(f.driver_name_snapshot,d.nome),driver_registration_snapshot=COALESCE(f.driver_registration_snapshot,d.matricula)
FROM public.fleet_drivers d WHERE d.id=f.driver_id AND d.municipio_id=f.municipio_id
 AND (f.driver_name_snapshot IS NULL OR f.driver_registration_snapshot IS NULL);
CREATE OR REPLACE FUNCTION public.fleet_capture_fueling_driver_snapshot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
BEGIN
 IF TG_OP='INSERT' OR NEW.driver_id IS DISTINCT FROM OLD.driver_id THEN
  IF NEW.driver_id IS NULL THEN NEW.driver_name_snapshot:=NULL; NEW.driver_registration_snapshot:=NULL;
  ELSE SELECT d.nome,d.matricula INTO NEW.driver_name_snapshot,NEW.driver_registration_snapshot FROM public.fleet_drivers d WHERE d.id=NEW.driver_id AND d.municipio_id=NEW.municipio_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Motorista fora do município do abastecimento'; END IF;
  END IF;
 ELSE NEW.driver_name_snapshot:=OLD.driver_name_snapshot; NEW.driver_registration_snapshot:=OLD.driver_registration_snapshot;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_fueling_driver_snapshot ON public.fleet_fuelings;
CREATE TRIGGER fleet_fueling_driver_snapshot BEFORE INSERT OR UPDATE ON public.fleet_fuelings FOR EACH ROW EXECUTE FUNCTION public.fleet_capture_fueling_driver_snapshot();

-- Validação do fluxo atual: removido UNION legado e acrescentado requisito de categoria.
CREATE OR REPLACE FUNCTION public.fleet_validate_fueling()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE v_vehicle public.fleet_vehicles%ROWTYPE; v_driver public.fleet_drivers%ROWTYPE; v_station public.fleet_fuel_stations%ROWTYPE;
 v_auth_ok boolean:=false; v_event_date date; v_recorded timestamptz:=clock_timestamp(); v_expected_unit uuid;
 v_policy public.fleet_fueling_policies%ROWTYPE; v_lag interval; v_required_category text;
BEGIN
 IF TG_OP='INSERT' THEN
  NEW.recorded_at:=v_recorded; NEW.submitted_at:=v_recorded;
  IF NEW.protocol_number IS NULL OR btrim(NEW.protocol_number)='' THEN NEW.protocol_number:='AB-'||to_char(v_recorded AT TIME ZONE 'America/Sao_Paulo','YYYYMMDD')||'-'||upper(substr(replace(COALESCE(NEW.id,gen_random_uuid())::text,'-',''),1,8)); END IF;
 ELSIF NEW.recorded_at IS DISTINCT FROM OLD.recorded_at OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.protocol_number IS DISTINCT FROM OLD.protocol_number OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.municipio_id IS DISTINCT FROM OLD.municipio_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
  IF NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Campos imutáveis do abastecimento não podem ser alterados'; END IF;
 END IF;
 IF NEW.liters<=0 OR NEW.unit_price<=0 OR NEW.odometer_km<0 THEN RAISE EXCEPTION 'Quantidade, preço e hodômetro devem ser válidos'; END IF;
 SELECT * INTO v_policy FROM public.fleet_fueling_policies WHERE municipio_id=NEW.municipio_id;
 IF NOT FOUND THEN v_policy.normal_entry_window_minutes:=30;v_policy.max_posterior_days:=30;v_policy.future_tolerance_minutes:=5;v_policy.require_late_reason:=true; END IF;
 IF NEW.performed_at>clock_timestamp()+make_interval(mins=>COALESCE(v_policy.future_tolerance_minutes,5)) THEN RAISE EXCEPTION 'A data/hora efetiva não pode estar no futuro'; END IF;
 v_lag:=clock_timestamp()-NEW.performed_at;
 IF TG_OP='INSERT' THEN
  IF v_lag>make_interval(days=>COALESCE(v_policy.max_posterior_days,30)) AND NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Prazo máximo para lançamento posterior excedido'; END IF;
  IF v_lag>make_interval(mins=>COALESCE(v_policy.normal_entry_window_minutes,30)) THEN NEW.entry_type:='POSTERIOR'; IF COALESCE(v_policy.require_late_reason,true) AND NULLIF(btrim(NEW.late_entry_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe justificativa para lançamento posterior'; END IF;
  ELSE NEW.entry_type:=COALESCE(NEW.entry_type,'NORMAL'); END IF;
 END IF;
 IF NEW.entry_type='POSTERIOR' AND NULLIF(btrim(NEW.late_entry_reason),'') IS NULL THEN RAISE EXCEPTION 'Lançamento posterior exige justificativa'; END IF;
 v_event_date:=(NEW.performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
 SELECT * INTO v_station FROM public.fleet_fuel_stations s WHERE s.id=NEW.station_id AND s.municipio_id=NEW.municipio_id FOR SHARE;
 IF NOT FOUND OR v_station.status<>'ATIVO' THEN RAISE EXCEPTION 'Estabelecimento inexistente, inativo ou fora do município'; END IF;
 IF v_station.credenciamento_ends_at IS NOT NULL AND v_station.credenciamento_ends_at<v_event_date THEN RAISE EXCEPTION 'Credenciamento expirado na data da operação'; END IF;
 IF TG_OP='INSERT' AND NOT public.fleet_is_manager() AND (NEW.record_origin<>'POSTO' OR NEW.created_by IS DISTINCT FROM public.fleet_current_usuario_id() OR NOT EXISTS(SELECT 1 FROM public.fleet_station_members sm WHERE sm.station_id=NEW.station_id AND sm.municipio_id=NEW.municipio_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo)) THEN RAISE EXCEPTION 'Usuário não possui vínculo ativo com o posto' USING ERRCODE='42501'; END IF;
 SELECT * INTO v_vehicle FROM public.fleet_vehicles v WHERE v.id=NEW.vehicle_id AND v.municipio_id=NEW.municipio_id FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Veículo inexistente ou fora do município'; END IF;
 IF v_vehicle.operational_status::text IN ('INATIVO','EM_MANUTENCAO','BAIXADO','ALIENADO') THEN RAISE EXCEPTION 'Veículo indisponível para abastecimento'; END IF;
 SELECT dh.to_unit_id INTO v_expected_unit FROM public.fleet_vehicle_department_history dh WHERE dh.municipio_id=NEW.municipio_id AND dh.vehicle_id=NEW.vehicle_id AND dh.started_at<=NEW.performed_at AND (dh.ended_at IS NULL OR dh.ended_at>NEW.performed_at) ORDER BY dh.started_at DESC LIMIT 1;
 v_expected_unit:=COALESCE(v_expected_unit,v_vehicle.responsible_unit_id);
 IF NEW.responsible_unit_id IS DISTINCT FROM v_expected_unit THEN RAISE EXCEPTION 'Unidade responsável não corresponde à lotação na data da operação'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.unidades_organizacionais u WHERE u.id=NEW.responsible_unit_id AND u.municipio_id=NEW.municipio_id) THEN RAISE EXCEPTION 'Unidade responsável fora do município'; END IF;
 IF NEW.beneficiary_unit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.unidades_organizacionais u WHERE u.id=NEW.beneficiary_unit_id AND u.municipio_id=NEW.municipio_id) THEN RAISE EXCEPTION 'Unidade beneficiária fora do município'; END IF;
 IF v_vehicle.fuel_type_id IS NULL OR v_vehicle.fuel_type_id IS DISTINCT FROM NEW.fuel_type_id OR NOT EXISTS(SELECT 1 FROM public.fleet_fuel_types ft WHERE ft.id=NEW.fuel_type_id AND ft.municipio_id=NEW.municipio_id AND ft.ativo) THEN RAISE EXCEPTION 'Combustível incompatível ou inativo'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fleet_station_fuel_types sf WHERE sf.municipio_id=NEW.municipio_id AND sf.station_id=NEW.station_id AND sf.fuel_type_id=NEW.fuel_type_id AND sf.active AND (sf.valid_from IS NULL OR sf.valid_from<=v_event_date) AND (sf.valid_until IS NULL OR sf.valid_until>=v_event_date)) THEN RAISE EXCEPTION 'Combustível não autorizado para o estabelecimento'; END IF;
 IF EXISTS(SELECT 1 FROM public.fleet_vehicle_restrictions r WHERE r.municipio_id=NEW.municipio_id AND r.vehicle_id=NEW.vehicle_id AND r.active AND r.released_at IS NULL AND r.starts_at<=NEW.performed_at AND (r.ends_at IS NULL OR r.ends_at>=NEW.performed_at)) THEN RAISE EXCEPTION 'Veículo possui bloqueio temporário'; END IF;
 IF NEW.driver_id IS NULL THEN RAISE EXCEPTION 'Motorista autorizado é obrigatório'; END IF;
 SELECT * INTO v_driver FROM public.fleet_drivers d WHERE d.id=NEW.driver_id AND d.municipio_id=NEW.municipio_id;
 IF NOT FOUND OR NOT v_driver.ativo THEN RAISE EXCEPTION 'Motorista inexistente ou inativo'; END IF;
 IF v_driver.cnh_number IS NULL THEN RAISE EXCEPTION 'CNH não cadastrada para o motorista'; END IF;
 IF v_driver.cnh_valid_until IS NULL OR v_driver.cnh_valid_until<v_event_date THEN RAISE EXCEPTION 'CNH inválida na data do abastecimento'; END IF;
 SELECT c.required_cnh_category INTO v_required_category FROM public.fleet_vehicles v LEFT JOIN public.fleet_vehicle_categories c ON c.id=v.category_id AND c.municipio_id=v.municipio_id WHERE v.id=NEW.vehicle_id AND v.municipio_id=NEW.municipio_id;
 IF NOT public.fleet_cnh_category_compatible(v_driver.cnh_category,v_required_category) THEN RAISE EXCEPTION 'Categoria CNH incompatível com o veículo'; END IF;
 SELECT EXISTS(SELECT 1 FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=NEW.municipio_id AND a.vehicle_id=NEW.vehicle_id AND a.driver_id=NEW.driver_id AND a.status='ATIVA' AND a.ended_at IS NULL AND a.valid_from<=v_event_date AND (a.valid_until IS NULL OR a.valid_until>=v_event_date)) INTO v_auth_ok;
 IF NOT v_auth_ok THEN RAISE EXCEPTION 'Motorista sem autorização válida na data da operação'; END IF;
 IF v_vehicle.tank_capacity_l IS NULL THEN RAISE EXCEPTION 'Veículo sem capacidade de tanque válida'; END IF;
 IF NEW.liters>v_vehicle.tank_capacity_l AND TG_OP='INSERT' THEN NEW.operational_status:='SINALIZADO';NEW.status:='COM_INCONSISTENCIA';NEW.inconsistency_code:='LITROS_ACIMA_DA_CAPACIDADE';NEW.inconsistency_notes:=concat_ws(' ',NEW.inconsistency_notes,format('Alerta: %s L excedem a capacidade de %s L.',NEW.liters,v_vehicle.tank_capacity_l)); END IF;
 IF NEW.authorization_id IS NOT NULL THEN
  SELECT EXISTS(SELECT 1 FROM public.fleet_vehicle_authorizations a JOIN public.unidades_organizacionais u ON u.id=a.beneficiary_unit_id AND u.municipio_id=a.municipio_id AND u.ativo WHERE a.id=NEW.authorization_id AND a.municipio_id=NEW.municipio_id AND a.vehicle_id=NEW.vehicle_id AND a.responsible_unit_id=NEW.responsible_unit_id AND a.beneficiary_unit_id=NEW.beneficiary_unit_id AND a.status='APROVADA' AND a.authorized_by IS NOT NULL AND a.supporting_document_path IS NOT NULL AND NEW.performed_at BETWEEN a.valid_from AND a.valid_until) INTO v_auth_ok;
  IF NOT v_auth_ok THEN RAISE EXCEPTION 'Autorização de cessão inválida ou fora da vigência'; END IF;
 END IF;
 IF (v_vehicle.operational_status::text='CEDIDO' OR (NEW.beneficiary_unit_id IS NOT NULL AND NEW.beneficiary_unit_id IS DISTINCT FROM NEW.responsible_unit_id)) AND NEW.authorization_id IS NULL THEN RAISE EXCEPTION 'Veículo cedido exige autorização aprovada e vigente'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_fueling_validate_before_write ON public.fleet_fuelings;
CREATE TRIGGER fleet_fueling_validate_before_write BEFORE INSERT OR UPDATE OF municipio_id,vehicle_id,station_id,driver_id,fuel_type_id,responsible_unit_id,beneficiary_unit_id,liters,unit_price,odometer_km,performed_at,authorization_id,entry_type,late_entry_reason ON public.fleet_fuelings FOR EACH ROW EXECUTE FUNCTION public.fleet_validate_fueling();

-- Revisão: mesmas verificações temporais e de categoria antes de CONFERIDO.
CREATE OR REPLACE FUNCTION public.fleet_review_fueling(p_fueling_id uuid,p_review_status text,p_notes text DEFAULT NULL,p_pending_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp AS $$
DECLARE m uuid:=public.fleet_current_municipio_id(); u integer:=public.fleet_current_usuario_id(); f public.fleet_fuelings%ROWTYPE; req text; alerts integer;
BEGIN
 IF auth.role()<>'authenticated' OR m IS NULL OR u IS NULL OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Somente gestores podem conferir abastecimentos' USING ERRCODE='42501'; END IF;
 IF p_review_status NOT IN ('EM_ANALISE','CONFERIDO','COM_PENDENCIA','CONTESTADO','REGULARIZADO') THEN RAISE EXCEPTION 'Situação de conferência inválida'; END IF;
 IF p_review_status IN ('COM_PENDENCIA','CONTESTADO') AND length(btrim(COALESCE(p_pending_reason,p_notes,'')))<8 THEN RAISE EXCEPTION 'Informe justificativa suficiente'; END IF;
 SELECT * INTO f FROM public.fleet_fuelings WHERE id=p_fueling_id AND municipio_id=m FOR UPDATE;
 IF NOT FOUND OR f.status='CANCELADO' THEN RAISE EXCEPTION 'Abastecimento não encontrado ou cancelado'; END IF;
 IF p_review_status='CONFERIDO' THEN
  SELECT c.required_cnh_category INTO req FROM public.fleet_vehicles v LEFT JOIN public.fleet_vehicle_categories c ON c.id=v.category_id AND c.municipio_id=v.municipio_id WHERE v.id=f.vehicle_id AND v.municipio_id=m;
  IF f.driver_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.fleet_drivers d WHERE d.id=f.driver_id AND d.municipio_id=m AND d.ativo AND d.cnh_number IS NOT NULL AND d.cnh_valid_until>=(f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date AND public.fleet_cnh_category_compatible(d.cnh_category,req)
   AND EXISTS(SELECT 1 FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=m AND a.vehicle_id=f.vehicle_id AND a.driver_id=f.driver_id AND a.status='ATIVA' AND a.ended_at IS NULL AND a.valid_from<=(f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date AND (a.valid_until IS NULL OR a.valid_until>=(f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date))) THEN RAISE EXCEPTION 'Motorista sem vínculo ativo, CNH válida/categoria compatível ou autorização na data efetiva'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.fleet_fueling_documents d WHERE d.municipio_id=m AND d.fueling_id=f.id AND d.is_current AND d.document_status='ACEITO' AND NULLIF(btrim(d.storage_path),'') IS NOT NULL) THEN RAISE EXCEPTION 'Exige comprovante atual aceito'; END IF;
  SELECT count(*) INTO alerts FROM public.fleet_inconsistencies i WHERE i.fueling_id=f.id AND i.status IN ('ABERTA','EM_ANALISE') AND i.severity='BLOQUEIO';
  IF alerts>0 THEN RAISE EXCEPTION 'Resolva alertas bloqueantes antes de conferir'; END IF;
  IF EXISTS(SELECT 1 FROM public.fleet_inconsistencies i WHERE i.fueling_id=f.id AND i.status IN ('ABERTA','EM_ANALISE') AND i.severity='ATENCAO') AND length(btrim(COALESCE(p_notes,'')))<8 THEN RAISE EXCEPTION 'Justifique a conferência com alertas em aberto'; END IF;
 END IF;
 UPDATE public.fleet_fuelings SET review_status=p_review_status,operational_status=CASE WHEN p_review_status IN ('COM_PENDENCIA','CONTESTADO') THEN 'AGUARDANDO_COMPLEMENTACAO' WHEN inconsistency_code IS NOT NULL AND p_review_status<>'CONFERIDO' THEN 'SINALIZADO' ELSE 'REGISTRADO' END,
  review_pending_reason=CASE WHEN p_review_status IN ('COM_PENDENCIA','CONTESTADO') THEN COALESCE(NULLIF(btrim(p_pending_reason),''),NULLIF(btrim(p_notes),'')) ELSE NULL END,
  status=CASE WHEN p_review_status='CONFERIDO' THEN 'CONFERIDO' WHEN p_review_status='EM_ANALISE' THEN 'EM_ANALISE' WHEN p_review_status='CONTESTADO' THEN 'SOLICITADA_CORRECAO' WHEN p_review_status='REGULARIZADO' THEN 'CORRIGIDO' WHEN p_review_status='COM_PENDENCIA' THEN 'PENDENTE_DE_COMPROVANTE' ELSE status END,
  registered_officially_by=CASE WHEN p_review_status='CONFERIDO' THEN u ELSE registered_officially_by END,
  registered_officially_at=CASE WHEN p_review_status='CONFERIDO' THEN clock_timestamp() ELSE registered_officially_at END,updated_at=clock_timestamp() WHERE id=f.id;
 INSERT INTO public.fleet_fueling_reviews(municipio_id,fueling_id,review_status,reviewer_id,notes,pending_reason) VALUES(m,f.id,p_review_status,u,NULLIF(btrim(p_notes),''),NULLIF(btrim(p_pending_reason),''));
 RETURN jsonb_build_object('fueling_id',f.id,'review_status',p_review_status);
END $$;

-- Pesquisa preserva assinatura/schema existentes; usa snapshot e não lê nome atual para exibição.
CREATE OR REPLACE FUNCTION public.fleet_search_fuelings(
 p_search text DEFAULT NULL,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,
 p_station_id uuid DEFAULT NULL,p_responsible_unit_id uuid DEFAULT NULL,p_beneficiary_unit_id uuid DEFAULT NULL,
 p_vehicle_id uuid DEFAULT NULL,p_driver_id uuid DEFAULT NULL,p_fuel_type_id uuid DEFAULT NULL,
 p_status text DEFAULT NULL,p_operational_status text DEFAULT NULL,p_review_status text DEFAULT NULL,
 p_document_status text DEFAULT NULL,p_missing_document boolean DEFAULT false,p_has_alert boolean DEFAULT NULL,
 p_late boolean DEFAULT NULL,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS TABLE(total_count bigint,id uuid,protocol_number text,vehicle_id uuid,vehicle_plate text,vehicle_model text,driver_id uuid,driver_name text,driver_registration text,station_id uuid,station_name text,fuel_type_id uuid,fuel_type_name text,responsible_unit_id uuid,responsible_unit_name text,beneficiary_unit_id uuid,beneficiary_unit_name text,authorization_id uuid,performed_at timestamptz,submitted_at timestamptz,recorded_at timestamptz,entry_type text,record_origin text,late_entry_reason text,liters numeric,unit_price numeric,total_amount numeric,odometer_km numeric,station_receipt_number text,notes text,status text,operational_status text,review_status text,review_pending_reason text,created_by integer,registered_officially_by integer,registered_officially_at timestamptz,cancellation_reason text,documents jsonb,alerts jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog,public AS $$
WITH filtered AS (
 SELECT f.* FROM public.fleet_fuelings f JOIN public.fleet_vehicles v ON v.id=f.vehicle_id AND v.municipio_id=f.municipio_id
 JOIN public.fleet_fuel_stations s ON s.id=f.station_id AND s.municipio_id=f.municipio_id JOIN public.fleet_fuel_types ft ON ft.id=f.fuel_type_id AND ft.municipio_id=f.municipio_id
 LEFT JOIN public.fleet_drivers d ON d.id=f.driver_id AND d.municipio_id=f.municipio_id
 WHERE (NULLIF(btrim(p_search),'') IS NULL OR concat_ws(' ',f.protocol_number,f.station_receipt_number,v.placa,v.modelo,f.driver_name_snapshot,f.driver_registration_snapshot,s.nome_fantasia_snapshot,s.razao_social_snapshot,ft.nome) ILIKE '%'||btrim(p_search)||'%')
 AND (p_from IS NULL OR f.performed_at>=p_from) AND (p_to IS NULL OR f.performed_at<p_to) AND (p_station_id IS NULL OR f.station_id=p_station_id)
 AND (p_responsible_unit_id IS NULL OR f.responsible_unit_id=p_responsible_unit_id) AND (p_beneficiary_unit_id IS NULL OR f.beneficiary_unit_id=p_beneficiary_unit_id)
 AND (p_vehicle_id IS NULL OR f.vehicle_id=p_vehicle_id) AND (p_driver_id IS NULL OR f.driver_id=p_driver_id) AND (p_fuel_type_id IS NULL OR f.fuel_type_id=p_fuel_type_id)
 AND (p_status IS NULL OR f.status::text=p_status) AND (p_operational_status IS NULL OR f.operational_status=p_operational_status) AND (p_review_status IS NULL OR f.review_status=p_review_status)
 AND (p_document_status IS NULL OR EXISTS(SELECT 1 FROM public.fleet_fueling_documents x WHERE x.fueling_id=f.id AND x.is_current AND x.document_status::text=p_document_status))
 AND (NOT COALESCE(p_missing_document,false) OR NOT EXISTS(SELECT 1 FROM public.fleet_fueling_documents x WHERE x.fueling_id=f.id AND x.is_current))
 AND (p_has_alert IS NULL OR EXISTS(SELECT 1 FROM public.fleet_inconsistencies i WHERE i.fueling_id=f.id AND i.status IN ('ABERTA','EM_ANALISE'))=p_has_alert)
 AND (p_late IS NULL OR (f.entry_type='POSTERIOR')=p_late)
), page AS (SELECT * FROM filtered ORDER BY performed_at DESC,id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),200) OFFSET GREATEST(COALESCE(p_offset,0),0)), counts AS (SELECT count(*) total_count FROM filtered)
SELECT counts.total_count,f.id,f.protocol_number,f.vehicle_id,v.placa,v.modelo,f.driver_id,f.driver_name_snapshot,f.driver_registration_snapshot,f.station_id,COALESCE(s.nome_fantasia_snapshot,s.razao_social_snapshot),f.fuel_type_id,ft.nome,
 f.responsible_unit_id,ru.nome,f.beneficiary_unit_id,bu.nome,f.authorization_id,f.performed_at,f.submitted_at,f.recorded_at,f.entry_type,f.record_origin,f.late_entry_reason,f.liters,f.unit_price,f.total_amount,f.odometer_km,f.station_receipt_number,f.notes,f.status::text,f.operational_status,f.review_status,f.review_pending_reason,f.created_by,f.registered_officially_by,f.registered_officially_at,f.cancellation_reason,
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'file_name',x.file_name,'storage_path',x.storage_path,'mime_type',x.mime_type,'file_size_bytes',x.file_size_bytes,'document_type',x.document_type,'notes',x.notes,'document_status',x.document_status,'uploaded_at',x.uploaded_at,'due_at',x.due_at,'is_current',x.is_current,'rejection_reason',x.rejection_reason,'reviewed_by',x.reviewed_by,'reviewed_at',x.reviewed_at) ORDER BY x.uploaded_at DESC) FROM public.fleet_fueling_documents x WHERE x.fueling_id=f.id AND x.is_current),'[]'::jsonb),
 COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'code',i.code,'severity',i.severity,'title',i.title,'description',i.description,'status',i.status,'created_at',i.created_at,'resolution_notes',i.resolution_notes) ORDER BY i.created_at DESC) FROM public.fleet_inconsistencies i WHERE i.fueling_id=f.id AND i.status IN ('ABERTA','EM_ANALISE')),'[]'::jsonb)
FROM page f CROSS JOIN counts JOIN public.fleet_vehicles v ON v.id=f.vehicle_id AND v.municipio_id=f.municipio_id
LEFT JOIN public.fleet_drivers d ON d.id=f.driver_id AND d.municipio_id=f.municipio_id JOIN public.fleet_fuel_stations s ON s.id=f.station_id AND s.municipio_id=f.municipio_id
JOIN public.fleet_fuel_types ft ON ft.id=f.fuel_type_id AND ft.municipio_id=f.municipio_id LEFT JOIN public.unidades_organizacionais ru ON ru.id=f.responsible_unit_id AND ru.municipio_id=f.municipio_id
LEFT JOIN public.unidades_organizacionais bu ON bu.id=f.beneficiary_unit_id AND bu.municipio_id=f.municipio_id ORDER BY f.performed_at DESC,f.id DESC;
$$;

-- RPCs sensíveis: nada para anon/PUBLIC; apenas authenticated. Trigger functions não invocáveis diretamente.
REVOKE ALL ON FUNCTION public.fleet_normalize_cpf(text),public.fleet_cpf_is_valid(text),public.fleet_cnh_category_compatible(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_driver_validate_identifiers(),public.fleet_driver_write_history(),public.fleet_driver_authorization_guard_and_audit(),public.fleet_driver_authorization_write_history(),public.fleet_append_only_guard(),public.fleet_capture_fueling_driver_snapshot(),public.fleet_validate_fueling() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_search_drivers(text,text,text,integer,integer),public.fleet_driver_summary(),public.fleet_get_driver(uuid),public.fleet_save_driver(uuid,text,text,text,text,text,text,date,uuid,boolean,text),public.fleet_manager_vehicle_driver_options(uuid,timestamptz,boolean),public.fleet_create_vehicle_driver_authorization(uuid,uuid,date,date,text),public.fleet_end_vehicle_driver_authorization(uuid,date,text),public.fleet_supplier_driver_options(uuid,uuid,timestamptz),public.fleet_review_fueling(uuid,text,text,text),public.fleet_search_fuelings(text,timestamptz,timestamptz,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,boolean,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_search_drivers(text,text,text,integer,integer),public.fleet_driver_summary(),public.fleet_get_driver(uuid),public.fleet_save_driver(uuid,text,text,text,text,text,text,date,uuid,boolean,text),public.fleet_manager_vehicle_driver_options(uuid,timestamptz,boolean),public.fleet_create_vehicle_driver_authorization(uuid,uuid,date,date,text),public.fleet_end_vehicle_driver_authorization(uuid,date,text),public.fleet_supplier_driver_options(uuid,uuid,timestamptz),public.fleet_review_fueling(uuid,text,text,text),public.fleet_search_fuelings(text,timestamptz,timestamptz,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,boolean,integer,integer) TO authenticated;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER ON public.fleet_drivers,public.fleet_vehicle_driver_authorizations,public.fleet_driver_history,public.fleet_vehicle_driver_authorization_history FROM PUBLIC,anon,authenticated;
GRANT SELECT (id,municipio_id,usuario_id,nome,matricula,cnh_category,cnh_valid_until,unidade_id,ativo,created_by,created_at,updated_at) ON public.fleet_drivers TO authenticated;
GRANT SELECT ON public.fleet_vehicle_driver_authorizations,public.fleet_driver_history,public.fleet_vehicle_driver_authorization_history TO authenticated;

COMMIT;
