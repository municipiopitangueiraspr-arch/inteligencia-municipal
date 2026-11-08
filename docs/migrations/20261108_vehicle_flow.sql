-- Migração aditiva do fluxo de veículos. PostgreSQL 17 / Supabase.
-- NÃO aplicar sem revisar as precondições no fim deste arquivo e testar em homologação.
-- O usuário confirmou que os 51 veículos e motoristas atuais são dados fictícios
-- de teste; placas/RENAVAM/categorias e CNH sintéticos são adaptados abaixo.
--
-- Precondições verificadas para esta versão:
-- * existem public.fleet_vehicles, fleet_vehicle_status, fleet_vehicle_history,
--   fleet_vehicle_authorized_drivers, fleet_drivers, fleet_fuel_types,
--   fleet_fuelings, public.unidades_organizacionais e os helpers fleet_* citados;
-- * fleet_vehicle_history.event_type aceita CADASTRO, ALTERACAO, TRANSFERENCIA,
--   SITUACAO, CAPACIDADE_TANQUE e INATIVACAO;
-- * role authenticated, auth.uid(), storage.buckets e storage.objects estão disponíveis;
-- * contagens confirmadas de colisão operacional após normalização eram zero.
-- Esta migração verifica novamente colisões antes de criar índices únicos.
--
-- O rótulo ALIENADO deve estar disponível no enum por meio da migração
-- 20261108_vehicle_status_alienado, aplicada e confirmada antes desta.

BEGIN;

-- Chaves compostas referenciáveis para garantir isolamento de tenant nas FKs.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicles_municipio_id_id_uidx
  ON public.fleet_vehicles (municipio_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_fuel_types_municipio_id_id_uidx
  ON public.fleet_fuel_types (municipio_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS unidades_organizacionais_municipio_id_id_uidx
  ON public.unidades_organizacionais (municipio_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_drivers_municipio_id_id_uidx
  ON public.fleet_drivers (municipio_id, id);

-- Categoria: nome único por município, ignorando caixa/espaços periféricos.
CREATE TABLE IF NOT EXISTS public.fleet_vehicle_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_by integer REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_vehicle_categories_nome_nonblank CHECK (btrim(nome) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicle_categories_municipio_nome_uidx
  ON public.fleet_vehicle_categories (municipio_id, lower(btrim(nome)));
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicle_categories_municipio_id_id_uidx
  ON public.fleet_vehicle_categories (municipio_id, id);

-- Categorias iniciais para liberar o cadastro já na primeira implantação.
INSERT INTO public.fleet_vehicle_categories (municipio_id, nome)
SELECT DISTINCT v.municipio_id, category.nome
FROM public.fleet_vehicles v
CROSS JOIN (VALUES
  ('Automóvel'), ('Caminhonete'), ('Van'), ('Ônibus'), ('Caminhão'),
  ('Motocicleta'), ('Ambulância'), ('Máquina pesada'), ('Outros')
) AS category(nome)
ON CONFLICT DO NOTHING;

ALTER TABLE public.fleet_vehicles
  ADD COLUMN IF NOT EXISTS category_id uuid,
  ADD COLUMN IF NOT EXISTS acquisition_date date,
  ADD COLUMN IF NOT EXISTS acquisition_value numeric(14,2),
  ADD COLUMN IF NOT EXISTS ownership_type text;

-- Constraints novos são NOT VALID para não bloquear esta mudança por dados
-- legados; passam a ser aplicados a novas gravações. Não validar retroativamente
-- sem auditar/corrigir os dados já existentes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicles'::regclass AND conname = 'fleet_vehicles_acquisition_value_nonnegative') THEN
    ALTER TABLE public.fleet_vehicles ADD CONSTRAINT fleet_vehicles_acquisition_value_nonnegative CHECK (acquisition_value IS NULL OR acquisition_value >= 0) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicles'::regclass AND conname = 'fleet_vehicles_ownership_type_nonblank') THEN
    ALTER TABLE public.fleet_vehicles ADD CONSTRAINT fleet_vehicles_ownership_type_nonblank CHECK (ownership_type IS NULL OR btrim(ownership_type) <> '') NOT VALID;
  END IF;
END $$;

-- FKs compostas same-tenant. NOT VALID evita assumir que o legado já está limpo;
-- constraints novas validam toda escrita. Execute VALIDATE CONSTRAINT após preflight.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicles'::regclass AND conname = 'fleet_vehicles_category_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicles ADD CONSTRAINT fleet_vehicles_category_same_municipio_fk
      FOREIGN KEY (municipio_id, category_id) REFERENCES public.fleet_vehicle_categories (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicles'::regclass AND conname = 'fleet_vehicles_fuel_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicles ADD CONSTRAINT fleet_vehicles_fuel_same_municipio_fk
      FOREIGN KEY (municipio_id, fuel_type_id) REFERENCES public.fleet_fuel_types (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicles'::regclass AND conname = 'fleet_vehicles_unit_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicles ADD CONSTRAINT fleet_vehicles_unit_same_municipio_fk
      FOREIGN KEY (municipio_id, responsible_unit_id) REFERENCES public.unidades_organizacionais (municipio_id, id) NOT VALID;
  END IF;
END $$;

-- Novas tabelas do ciclo de vida.
CREATE TABLE IF NOT EXISTS public.fleet_vehicle_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  vehicle_id uuid NOT NULL,
  reason text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_by integer REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz,
  released_by integer REFERENCES public.usuarios(id),
  release_reason text,
  CONSTRAINT fleet_vehicle_restrictions_reason_nonblank CHECK (btrim(reason) <> ''),
  CONSTRAINT fleet_vehicle_restrictions_dates CHECK (ends_at IS NULL OR ends_at > starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicle_restrictions_one_active_uidx
  ON public.fleet_vehicle_restrictions (municipio_id, vehicle_id)
  WHERE active AND released_at IS NULL;
CREATE INDEX IF NOT EXISTS fleet_vehicle_restrictions_vehicle_dates_idx
  ON public.fleet_vehicle_restrictions (municipio_id, vehicle_id, starts_at, ends_at);

CREATE TABLE IF NOT EXISTS public.fleet_vehicle_department_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  vehicle_id uuid NOT NULL,
  from_unit_id uuid,
  to_unit_id uuid,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  reason text,
  changed_by integer REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_vehicle_department_history_dates CHECK (ended_at IS NULL OR ended_at > started_at)
);
CREATE INDEX IF NOT EXISTS fleet_vehicle_department_history_vehicle_idx
  ON public.fleet_vehicle_department_history (municipio_id, vehicle_id, started_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicle_department_history_one_open_uidx
  ON public.fleet_vehicle_department_history (municipio_id, vehicle_id)
  WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS public.fleet_vehicle_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  vehicle_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0),
  document_type text NOT NULL,
  description text,
  uploaded_by integer NOT NULL REFERENCES public.usuarios(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_vehicle_documents_name_nonblank CHECK (btrim(file_name) <> ''),
  CONSTRAINT fleet_vehicle_documents_type_nonblank CHECK (btrim(document_type) <> '')
);
CREATE INDEX IF NOT EXISTS fleet_vehicle_documents_vehicle_idx
  ON public.fleet_vehicle_documents (municipio_id, vehicle_id, uploaded_at DESC);

CREATE TABLE IF NOT EXISTS public.fleet_vehicle_driver_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  vehicle_id uuid NOT NULL,
  driver_id uuid NOT NULL,
  valid_from date NOT NULL,
  valid_until date,
  status text NOT NULL DEFAULT 'ATIVA',
  reason text,
  created_by integer REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_vehicle_driver_authorizations_status_check CHECK (status IN ('ATIVA','ENCERRADA','REVOGADA')),
  CONSTRAINT fleet_vehicle_driver_authorizations_dates CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
-- Sem unicidade vehicle/driver: períodos históricos repetidos são permitidos.
CREATE INDEX IF NOT EXISTS fleet_vehicle_driver_auth_lookup_idx
  ON public.fleet_vehicle_driver_authorizations (municipio_id, vehicle_id, driver_id, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS fleet_vehicle_driver_auth_active_idx
  ON public.fleet_vehicle_driver_authorizations (vehicle_id, driver_id, valid_until)
  WHERE status = 'ATIVA';

-- Composite FKs garantem veículo, motorista e unidades do mesmo município.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_restrictions'::regclass AND conname = 'fleet_vehicle_restrictions_vehicle_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_restrictions ADD CONSTRAINT fleet_vehicle_restrictions_vehicle_same_municipio_fk
      FOREIGN KEY (municipio_id, vehicle_id) REFERENCES public.fleet_vehicles (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_documents'::regclass AND conname = 'fleet_vehicle_documents_vehicle_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_documents ADD CONSTRAINT fleet_vehicle_documents_vehicle_same_municipio_fk
      FOREIGN KEY (municipio_id, vehicle_id) REFERENCES public.fleet_vehicles (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_department_history'::regclass AND conname = 'fleet_vehicle_department_vehicle_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_department_history ADD CONSTRAINT fleet_vehicle_department_vehicle_same_municipio_fk
      FOREIGN KEY (municipio_id, vehicle_id) REFERENCES public.fleet_vehicles (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_department_history'::regclass AND conname = 'fleet_vehicle_department_from_unit_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_department_history ADD CONSTRAINT fleet_vehicle_department_from_unit_same_municipio_fk
      FOREIGN KEY (municipio_id, from_unit_id) REFERENCES public.unidades_organizacionais (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_department_history'::regclass AND conname = 'fleet_vehicle_department_to_unit_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_department_history ADD CONSTRAINT fleet_vehicle_department_to_unit_same_municipio_fk
      FOREIGN KEY (municipio_id, to_unit_id) REFERENCES public.unidades_organizacionais (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_driver_authorizations'::regclass AND conname = 'fleet_vehicle_driver_auth_vehicle_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_driver_authorizations ADD CONSTRAINT fleet_vehicle_driver_auth_vehicle_same_municipio_fk
      FOREIGN KEY (municipio_id, vehicle_id) REFERENCES public.fleet_vehicles (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_driver_authorizations'::regclass AND conname = 'fleet_vehicle_driver_auth_driver_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_driver_authorizations ADD CONSTRAINT fleet_vehicle_driver_auth_driver_same_municipio_fk
      FOREIGN KEY (municipio_id, driver_id) REFERENCES public.fleet_drivers (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_authorized_drivers'::regclass AND conname = 'fleet_vehicle_authorized_drivers_vehicle_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_authorized_drivers ADD CONSTRAINT fleet_vehicle_authorized_drivers_vehicle_same_municipio_fk
      FOREIGN KEY (municipio_id, vehicle_id) REFERENCES public.fleet_vehicles (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_authorized_drivers'::regclass AND conname = 'fleet_vehicle_authorized_drivers_driver_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_authorized_drivers ADD CONSTRAINT fleet_vehicle_authorized_drivers_driver_same_municipio_fk
      FOREIGN KEY (municipio_id, driver_id) REFERENCES public.fleet_drivers (municipio_id, id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.fleet_vehicle_history'::regclass AND conname = 'fleet_vehicle_history_vehicle_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_history ADD CONSTRAINT fleet_vehicle_history_vehicle_same_municipio_fk
      FOREIGN KEY (municipio_id, vehicle_id) REFERENCES public.fleet_vehicles (municipio_id, id) NOT VALID;
  END IF;
END $$;

-- Backfill idempotente: conserva a tabela legada intacta e cria uma cópia de
-- autorização com proveniência lógica por veículo/motorista/período.
INSERT INTO public.fleet_vehicle_driver_authorizations
  (municipio_id, vehicle_id, driver_id, valid_from, valid_until, status, reason, created_by, created_at)
SELECT old.municipio_id, old.vehicle_id, old.driver_id,
       CASE WHEN old.ativo AND (old.valid_from IS NULL OR old.valid_from > CURRENT_DATE)
            THEN CURRENT_DATE ELSE COALESCE(old.valid_from, old.created_at::date) END,
       CASE WHEN old.ativo AND old.valid_until < CURRENT_DATE THEN NULL ELSE old.valid_until END,
       CASE WHEN old.ativo THEN 'ATIVA' ELSE 'REVOGADA' END,
       'Migração de autorização fictícia para fluxo de teste', old.created_by, old.created_at
FROM public.fleet_vehicle_authorized_drivers AS old
WHERE NOT EXISTS (
  SELECT 1 FROM public.fleet_vehicle_driver_authorizations AS current_auth
  WHERE current_auth.municipio_id = old.municipio_id
    AND current_auth.vehicle_id = old.vehicle_id
    AND current_auth.driver_id = old.driver_id
    AND current_auth.valid_from = CASE WHEN old.ativo AND (old.valid_from IS NULL OR old.valid_from > CURRENT_DATE)
                                       THEN CURRENT_DATE ELSE COALESCE(old.valid_from, old.created_at::date) END
    AND current_auth.valid_until IS NOT DISTINCT FROM CASE WHEN old.ativo AND old.valid_until < CURRENT_DATE
                                                            THEN NULL ELSE old.valid_until END
    AND current_auth.created_at = old.created_at
);

-- O usuário confirmou que os cadastros são fictícios. Renova somente CNHs de
-- motoristas ativos sem validade ou expiradas para permitir testes operacionais.
UPDATE public.fleet_drivers
SET cnh_valid_until = CURRENT_DATE + 730
WHERE ativo AND (cnh_valid_until IS NULL OR cnh_valid_until < CURRENT_DATE);

-- Canonicalização nova/alterada, sem formatar nem validar retroativamente os
-- 51 registros legados inválidos reportados. Placa aceita padrão clássico ou Mercosul.
CREATE OR REPLACE FUNCTION public.fleet_normalize_plate(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT regexp_replace(upper(COALESCE(p_value, '')), '[^A-Z0-9]', '', 'g') $$;

CREATE OR REPLACE FUNCTION public.fleet_normalize_renavam(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT regexp_replace(COALESCE(p_value, ''), '[^0-9]', '', 'g') $$;

CREATE OR REPLACE FUNCTION public.fleet_normalize_chassis(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog
AS $$ SELECT regexp_replace(upper(COALESCE(p_value, '')), '[^A-Z0-9]', '', 'g') $$;

CREATE OR REPLACE FUNCTION public.fleet_validate_vehicle_identifiers()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  raw_renavam text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.placa IS DISTINCT FROM OLD.placa THEN
    NEW.placa := public.fleet_normalize_plate(NEW.placa);
    IF NEW.placa !~ '^[A-Z]{3}([0-9]{4}|[0-9][A-Z][0-9]{2})$' THEN
      RAISE EXCEPTION 'Placa inválida: informe padrão brasileiro clássico ou Mercosul';
    END IF;
  END IF;

  IF (TG_OP = 'INSERT' OR NEW.renavam IS DISTINCT FROM OLD.renavam) AND NEW.renavam IS NOT NULL THEN
    raw_renavam := btrim(NEW.renavam);
    IF raw_renavam !~ '^[0-9[:space:]./-]+$' THEN
      RAISE EXCEPTION 'RENAVAM inválido: informe exatamente 11 dígitos';
    END IF;
    NEW.renavam := regexp_replace(raw_renavam, '[[:space:]./-]', '', 'g');
    IF NEW.renavam !~ '^[0-9]{11}$' THEN
      RAISE EXCEPTION 'RENAVAM inválido: informe exatamente 11 dígitos';
    END IF;
  END IF;

  IF TG_OP = 'INSERT' OR NEW.chassi IS DISTINCT FROM OLD.chassi THEN
    IF NEW.chassi IS NOT NULL THEN
      NEW.chassi := public.fleet_normalize_chassis(NEW.chassi);
      IF NEW.chassi = '' THEN NEW.chassi := NULL; END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_vehicle_identifiers_validate ON public.fleet_vehicles;
CREATE TRIGGER fleet_vehicle_identifiers_validate
BEFORE INSERT OR UPDATE OF placa, renavam, chassi ON public.fleet_vehicles
FOR EACH ROW EXECUTE FUNCTION public.fleet_validate_vehicle_identifiers();

-- Retira apenas UNIQUEs antigos exatos (município, placa/chassi), que impediriam
-- reutilização histórica. Índices parciais abaixo mantêm unicidade operacional.
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname, array_agg(a.attname::text ORDER BY a.attname::text) AS cols
    FROM pg_constraint pc
    CROSS JOIN LATERAL unnest(pc.conkey) AS key(attnum)
    JOIN pg_attribute a ON a.attrelid = pc.conrelid AND a.attnum = key.attnum
    WHERE pc.conrelid = 'public.fleet_vehicles'::regclass AND pc.contype = 'u'
    GROUP BY pc.conname
  LOOP
    IF c.cols = ARRAY['municipio_id','placa']::text[] OR c.cols = ARRAY['chassi','municipio_id']::text[] THEN
      EXECUTE format('ALTER TABLE public.fleet_vehicles DROP CONSTRAINT %I', c.conname);
    END IF;
  END LOOP;
END $$;

-- Preflight explícito: interrompe a migração em vez de ocultar colisões.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fleet_vehicles
    WHERE operational_status::text NOT IN ('INATIVO','BAIXADO','ALIENADO')
    GROUP BY municipio_id, public.fleet_normalize_plate(placa) HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Colisão de placa normalizada entre veículos operacionais; audite antes da migração'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_vehicles
    WHERE chassi IS NOT NULL AND operational_status::text NOT IN ('INATIVO','BAIXADO','ALIENADO')
    GROUP BY municipio_id, public.fleet_normalize_chassis(chassi) HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Colisão de chassi normalizado entre veículos operacionais; audite antes da migração'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_vehicles
    WHERE renavam IS NOT NULL AND operational_status::text NOT IN ('INATIVO','BAIXADO','ALIENADO')
    GROUP BY municipio_id, public.fleet_normalize_renavam(renavam) HAVING count(*) > 1
  ) THEN RAISE EXCEPTION 'Colisão de RENAVAM normalizado entre veículos operacionais; audite antes da migração'; END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicles_operational_plate_uidx
  ON public.fleet_vehicles (municipio_id, public.fleet_normalize_plate(placa))
  WHERE operational_status <> 'INATIVO'::public.fleet_vehicle_status
    AND operational_status <> 'BAIXADO'::public.fleet_vehicle_status
    AND operational_status <> 'ALIENADO'::public.fleet_vehicle_status;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicles_operational_chassi_uidx
  ON public.fleet_vehicles (municipio_id, public.fleet_normalize_chassis(chassi))
  WHERE chassi IS NOT NULL
    AND operational_status <> 'INATIVO'::public.fleet_vehicle_status
    AND operational_status <> 'BAIXADO'::public.fleet_vehicle_status
    AND operational_status <> 'ALIENADO'::public.fleet_vehicle_status;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicles_operational_renavam_uidx
  ON public.fleet_vehicles (municipio_id, public.fleet_normalize_renavam(renavam))
  WHERE renavam IS NOT NULL
    AND operational_status <> 'INATIVO'::public.fleet_vehicle_status
    AND operational_status <> 'BAIXADO'::public.fleet_vehicle_status
    AND operational_status <> 'ALIENADO'::public.fleet_vehicle_status;

-- Semeia o departamento atual sem reconstruir um histórico inexistente.
INSERT INTO public.fleet_vehicle_department_history
  (municipio_id, vehicle_id, from_unit_id, to_unit_id, started_at, ended_at, reason, changed_by, created_at)
SELECT v.municipio_id, v.id, NULL, v.responsible_unit_id, v.created_at, NULL,
       'Unidade atual inicial (migração)', v.created_by, now()
FROM public.fleet_vehicles v
WHERE v.responsible_unit_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.fleet_vehicle_department_history d
    WHERE d.municipio_id = v.municipio_id AND d.vehicle_id = v.id AND d.ended_at IS NULL
  );

CREATE OR REPLACE FUNCTION public.fleet_vehicle_write_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  event_name text := 'CADASTRO';
  audit_reason text;
  department_started timestamptz;
  effective_at timestamptz;
BEGIN
  audit_reason := NULLIF(current_setting('fleet.vehicle_update_reason', true), '');
  IF TG_OP = 'INSERT' THEN
    IF NEW.responsible_unit_id IS NOT NULL THEN
      INSERT INTO public.fleet_vehicle_department_history
        (municipio_id, vehicle_id, from_unit_id, to_unit_id, started_at, reason, changed_by)
      VALUES (NEW.municipio_id, NEW.id, NULL, NEW.responsible_unit_id, NEW.created_at,
              audit_reason, public.fleet_current_usuario_id());
    END IF;
    INSERT INTO public.fleet_vehicle_history
      (municipio_id, vehicle_id, event_type, previous_data, new_data, reason, changed_by)
    VALUES (NEW.municipio_id, NEW.id, 'CADASTRO', NULL, to_jsonb(NEW), audit_reason,
            public.fleet_current_usuario_id());
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'updated_at') IS NOT DISTINCT FROM (to_jsonb(OLD) - 'updated_at') THEN
    RETURN NEW;
  END IF;

  IF NEW.responsible_unit_id IS DISTINCT FROM OLD.responsible_unit_id THEN
    event_name := 'TRANSFERENCIA';
    SELECT d.started_at INTO department_started
    FROM public.fleet_vehicle_department_history d
    WHERE d.municipio_id = OLD.municipio_id AND d.vehicle_id = OLD.id AND d.ended_at IS NULL
    ORDER BY d.started_at DESC LIMIT 1 FOR UPDATE;
    IF FOUND THEN
      effective_at := GREATEST(clock_timestamp(), department_started + interval '1 microsecond');
      UPDATE public.fleet_vehicle_department_history
      SET ended_at = effective_at
      WHERE municipio_id = OLD.municipio_id AND vehicle_id = OLD.id AND ended_at IS NULL;
    ELSE
      effective_at := GREATEST(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
    END IF;
    INSERT INTO public.fleet_vehicle_department_history
      (municipio_id, vehicle_id, from_unit_id, to_unit_id, started_at, reason, changed_by)
    VALUES (NEW.municipio_id, NEW.id, OLD.responsible_unit_id, NEW.responsible_unit_id,
            effective_at, audit_reason, public.fleet_current_usuario_id());
  ELSIF NEW.operational_status::text IS DISTINCT FROM OLD.operational_status::text THEN
    event_name := 'SITUACAO';
  ELSIF NEW.tank_capacity_l IS DISTINCT FROM OLD.tank_capacity_l THEN
    event_name := 'CAPACIDADE_TANQUE';
  ELSE
    event_name := 'ALTERACAO';
  END IF;

  INSERT INTO public.fleet_vehicle_history
    (municipio_id, vehicle_id, event_type, previous_data, new_data, reason, changed_by)
  VALUES (NEW.municipio_id, NEW.id, event_name, to_jsonb(OLD), to_jsonb(NEW), audit_reason,
          public.fleet_current_usuario_id());
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_vehicle_history_after_write ON public.fleet_vehicles;
CREATE TRIGGER fleet_vehicle_history_after_write
AFTER INSERT OR UPDATE ON public.fleet_vehicles
FOR EACH ROW EXECUTE FUNCTION public.fleet_vehicle_write_history();

-- IDs sintéticos únicos e válidos para os veículos fictícios existentes; o trigger
-- grava a mudança na auditoria e mantém o restante do cadastro intacto.
SELECT set_config('fleet.vehicle_update_reason', 'Normalização de identificadores de veículos fictícios para testes', true);
WITH ranked AS (
  SELECT v.id, v.municipio_id,
         row_number() OVER (PARTITION BY v.municipio_id ORDER BY v.id) AS ordinal,
         concat_ws(' ', v.marca, v.modelo) AS description
  FROM public.fleet_vehicles v
), classified AS (
  SELECT r.*,
         CASE
           WHEN description ~* '(AMBUL|SAMU)' THEN 'Ambulância'
           WHEN description ~* '(ÔNIBUS|ONIBUS|MICRO.?ÔNIBUS|MICRO.?ONIBUS)' THEN 'Ônibus'
           WHEN description ~* '(CAMINHÃO|CAMINHAO|TRUCK|CARGO)' THEN 'Caminhão'
           WHEN description ~* '(MOTOCICLETA|\mMOTO\M|BROS|CG[0-9 ])' THEN 'Motocicleta'
           WHEN description ~* '(\mVAN\M|SPRINTER|MASTER)' THEN 'Van'
           WHEN description ~* '(TRATOR|RETRO|MOTONIVELADORA|PÁ CARREGADEIRA|PA CARREGADEIRA)' THEN 'Máquina pesada'
           WHEN description ~* '(HILUX|S10|RANGER|FRONTIER|AMAROK|SAVEIRO|OROCH|CAMINHONETE|PICK.?UP)' THEN 'Caminhonete'
           WHEN btrim(description) = '' THEN 'Outros'
           ELSE 'Automóvel'
         END AS category_name
  FROM ranked r
)
UPDATE public.fleet_vehicles v
SET placa = 'TST' || lpad(c.ordinal::text, 4, '0'),
    renavam = lpad((90000000000 + c.ordinal)::text, 11, '0'),
    category_id = category.id,
    updated_at = now()
FROM classified c
JOIN public.fleet_vehicle_categories category
  ON category.municipio_id = c.municipio_id AND category.nome = c.category_name
WHERE v.id = c.id
  AND (v.placa IS DISTINCT FROM 'TST' || lpad(c.ordinal::text, 4, '0')
       OR v.renavam IS DISTINCT FROM lpad((90000000000 + c.ordinal)::text, 11, '0')
       OR v.category_id IS DISTINCT FROM category.id);

-- RPC para edição do frontend. payload é um objeto JSON com somente as colunas
-- listadas no allowlist; chaves omitidas preservam valores e JSON null limpa campo
-- anulável. Retorna o veículo atualizado como objeto JSON. reason vai à auditoria.
CREATE OR REPLACE FUNCTION public.fleet_update_vehicle(
  p_vehicle_id uuid,
  p_payload jsonb,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  updated_vehicle public.fleet_vehicles%ROWTYPE;
BEGIN
  IF NOT public.fleet_is_manager() THEN
    RAISE EXCEPTION 'Apenas gestores de frota podem alterar veículos' USING ERRCODE = '42501';
  END IF;
  IF p_vehicle_id IS NULL OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION 'p_vehicle_id e p_payload (objeto JSON) são obrigatórios';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) AS item(key)
    WHERE key <> ALL (ARRAY[
      'placa','marca','modelo','ano_fabricacao','ano_modelo','chassi','renavam',
      'fuel_type_id','tank_capacity_l','responsible_unit_id','operational_status',
      'current_odometer_km','photo_path','notes','category_id','acquisition_date',
      'acquisition_value','ownership_type'
    ]::text[])
  ) THEN RAISE EXCEPTION 'p_payload contém coluna não permitida'; END IF;

  PERFORM set_config('fleet.vehicle_update_reason', COALESCE(NULLIF(btrim(p_reason), ''), ''), true);
  UPDATE public.fleet_vehicles v SET
    placa = CASE WHEN p_payload ? 'placa' THEN p_payload->>'placa' ELSE v.placa END,
    marca = CASE WHEN p_payload ? 'marca' THEN p_payload->>'marca' ELSE v.marca END,
    modelo = CASE WHEN p_payload ? 'modelo' THEN p_payload->>'modelo' ELSE v.modelo END,
    ano_fabricacao = CASE WHEN p_payload ? 'ano_fabricacao' THEN NULLIF(p_payload->>'ano_fabricacao','')::smallint ELSE v.ano_fabricacao END,
    ano_modelo = CASE WHEN p_payload ? 'ano_modelo' THEN NULLIF(p_payload->>'ano_modelo','')::smallint ELSE v.ano_modelo END,
    chassi = CASE WHEN p_payload ? 'chassi' THEN p_payload->>'chassi' ELSE v.chassi END,
    renavam = CASE WHEN p_payload ? 'renavam' THEN p_payload->>'renavam' ELSE v.renavam END,
    fuel_type_id = CASE WHEN p_payload ? 'fuel_type_id' THEN NULLIF(p_payload->>'fuel_type_id','')::uuid ELSE v.fuel_type_id END,
    tank_capacity_l = CASE WHEN p_payload ? 'tank_capacity_l' THEN NULLIF(p_payload->>'tank_capacity_l','')::numeric ELSE v.tank_capacity_l END,
    responsible_unit_id = CASE WHEN p_payload ? 'responsible_unit_id' THEN NULLIF(p_payload->>'responsible_unit_id','')::uuid ELSE v.responsible_unit_id END,
    operational_status = CASE WHEN p_payload ? 'operational_status' THEN (p_payload->>'operational_status')::public.fleet_vehicle_status ELSE v.operational_status END,
    current_odometer_km = CASE WHEN p_payload ? 'current_odometer_km' THEN NULLIF(p_payload->>'current_odometer_km','')::numeric ELSE v.current_odometer_km END,
    photo_path = CASE WHEN p_payload ? 'photo_path' THEN p_payload->>'photo_path' ELSE v.photo_path END,
    notes = CASE WHEN p_payload ? 'notes' THEN p_payload->>'notes' ELSE v.notes END,
    category_id = CASE WHEN p_payload ? 'category_id' THEN NULLIF(p_payload->>'category_id','')::uuid ELSE v.category_id END,
    acquisition_date = CASE WHEN p_payload ? 'acquisition_date' THEN NULLIF(p_payload->>'acquisition_date','')::date ELSE v.acquisition_date END,
    acquisition_value = CASE WHEN p_payload ? 'acquisition_value' THEN NULLIF(p_payload->>'acquisition_value','')::numeric ELSE v.acquisition_value END,
    ownership_type = CASE WHEN p_payload ? 'ownership_type' THEN p_payload->>'ownership_type' ELSE v.ownership_type END,
    updated_at = now()
  WHERE v.id = p_vehicle_id AND v.municipio_id = public.fleet_current_municipio_id()
  RETURNING v.* INTO updated_vehicle;
  IF NOT FOUND THEN RAISE EXCEPTION 'Veículo inexistente ou fora do município ativo'; END IF;
  RETURN to_jsonb(updated_vehicle);
END $$;

-- Validação central de abastecimento substitui o trigger existente, preservando
-- a inconsistência (não bloqueio) quando litros excedem a capacidade do tanque.
CREATE OR REPLACE FUNCTION public.fleet_validate_fueling()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  vehicle public.fleet_vehicles%ROWTYPE;
  driver public.fleet_drivers%ROWTYPE;
  auth_ok boolean := false;
  event_date date := (NEW.performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT v.* INTO vehicle
  FROM public.fleet_vehicles v
  WHERE v.id = NEW.vehicle_id AND v.municipio_id = NEW.municipio_id
  FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Veículo inexistente ou fora do município do abastecimento'; END IF;
  IF vehicle.operational_status::text IN ('INATIVO','EM_MANUTENCAO','BAIXADO','ALIENADO') THEN
    RAISE EXCEPTION 'Veículo indisponível para abastecimento';
  END IF;
  IF vehicle.fuel_type_id IS NULL OR vehicle.fuel_type_id IS DISTINCT FROM NEW.fuel_type_id THEN
    RAISE EXCEPTION 'Combustível incompatível com o veículo';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_vehicle_restrictions r
    WHERE r.municipio_id = NEW.municipio_id AND r.vehicle_id = NEW.vehicle_id
      AND r.active AND r.released_at IS NULL
      AND r.starts_at <= NEW.performed_at
      AND (r.ends_at IS NULL OR r.ends_at >= NEW.performed_at)
  ) THEN RAISE EXCEPTION 'Veículo possui bloqueio temporário ativo na data do abastecimento'; END IF;

  IF NEW.driver_id IS NULL THEN RAISE EXCEPTION 'Motorista autorizado é obrigatório para abastecimento'; END IF;
  SELECT d.* INTO driver FROM public.fleet_drivers d
  WHERE d.id = NEW.driver_id AND d.municipio_id = NEW.municipio_id;
  IF NOT FOUND OR NOT driver.ativo THEN RAISE EXCEPTION 'Motorista inexistente ou inativo'; END IF;
  IF driver.cnh_valid_until IS NULL OR driver.cnh_valid_until < event_date THEN
    RAISE EXCEPTION 'CNH do motorista inválida na data do abastecimento';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.fleet_vehicle_driver_authorizations a
    WHERE a.municipio_id = NEW.municipio_id AND a.vehicle_id = NEW.vehicle_id
      AND a.driver_id = NEW.driver_id AND a.status = 'ATIVA'
      AND a.valid_from <= event_date AND (a.valid_until IS NULL OR a.valid_until >= event_date)
    UNION ALL
    SELECT 1 FROM public.fleet_vehicle_authorized_drivers old
    WHERE old.municipio_id = NEW.municipio_id AND old.vehicle_id = NEW.vehicle_id
      AND old.driver_id = NEW.driver_id AND old.ativo
      AND (old.valid_from IS NULL OR old.valid_from <= event_date)
      AND (old.valid_until IS NULL OR old.valid_until >= event_date)
  ) INTO auth_ok;
  IF NOT auth_ok THEN RAISE EXCEPTION 'Motorista sem autorização válida para o veículo na data do abastecimento'; END IF;

  IF vehicle.tank_capacity_l IS NULL THEN RAISE EXCEPTION 'Veículo sem capacidade de tanque válida'; END IF;
  IF NEW.liters > vehicle.tank_capacity_l THEN
    NEW.status := 'COM_INCONSISTENCIA';
    NEW.inconsistency_code := 'LITROS_ACIMA_DA_CAPACIDADE';
    NEW.inconsistency_notes := COALESCE(NEW.inconsistency_notes,'') ||
      format(' Litros informados: %s; capacidade: %s.', NEW.liters, vehicle.tank_capacity_l);
  END IF;
  IF NEW.authorization_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.fleet_vehicle_authorizations a
      WHERE a.id = NEW.authorization_id AND a.municipio_id = NEW.municipio_id
        AND a.vehicle_id = NEW.vehicle_id AND a.status = 'APROVADA'
        AND NEW.performed_at BETWEEN a.valid_from AND a.valid_until
        AND a.beneficiary_unit_id = NEW.beneficiary_unit_id
    ) INTO auth_ok;
    IF NOT auth_ok THEN RAISE EXCEPTION 'Autorização de uso/abastecimento inválida ou expirada'; END IF;
  END IF;
  IF vehicle.operational_status::text = 'CEDIDO' AND NEW.authorization_id IS NULL THEN
    RAISE EXCEPTION 'Veículo cedido exige autorização aprovada para o abastecimento';
  END IF;
  RETURN NEW;
END $$;

-- O trigger-base não observava updates isolados de motorista/combustível;
-- recriá-lo para não permitir que essas alterações contornem a validação.
DROP TRIGGER IF EXISTS fleet_fueling_validate_before_write ON public.fleet_fuelings;
CREATE TRIGGER fleet_fueling_validate_before_write
BEFORE INSERT OR UPDATE OF municipio_id, vehicle_id, driver_id, fuel_type_id,
  liters, performed_at, authorization_id, beneficiary_unit_id
ON public.fleet_fuelings FOR EACH ROW
EXECUTE FUNCTION public.fleet_validate_fueling();

-- RPCs do posto retornam somente dados operacionais mínimos e validam o usuário
-- logado, a associação à estação, situação do veículo, bloqueios, CNH e autorização.
CREATE OR REPLACE FUNCTION public.fleet_supplier_vehicle_options(p_station_id uuid)
RETURNS TABLE (
  id uuid, placa text, marca text, modelo text, fuel_type_id uuid,
  responsible_unit_id uuid, tank_capacity_l numeric, current_odometer_km numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
BEGIN
  IF p_station_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.fleet_station_members sm
    JOIN public.fleet_fuel_stations s ON s.id = sm.station_id AND s.municipio_id = sm.municipio_id
    WHERE sm.station_id = p_station_id
      AND sm.usuario_id = public.fleet_current_usuario_id() AND sm.ativo
      AND s.municipio_id = public.fleet_current_municipio_id()
      AND s.status::text = 'ATIVO'
  ) THEN
    RAISE EXCEPTION 'Usuário não pertence a um posto ativo deste município' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.id, v.placa, v.marca, v.modelo, v.fuel_type_id,
         v.responsible_unit_id, v.tank_capacity_l, v.current_odometer_km
  FROM public.fleet_vehicles v
  WHERE v.municipio_id = public.fleet_current_municipio_id()
    AND v.operational_status::text = 'ATIVO'
    AND NOT EXISTS (
      SELECT 1 FROM public.fleet_vehicle_restrictions r
      WHERE r.municipio_id = v.municipio_id AND r.vehicle_id = v.id
        AND r.active AND r.released_at IS NULL
        AND r.starts_at <= now() AND (r.ends_at IS NULL OR r.ends_at > now())
    )
  ORDER BY v.placa;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_driver_options(
  p_station_id uuid, p_vehicle_id uuid, p_performed_at timestamptz
)
RETURNS TABLE (id uuid, nome text, matricula text, cnh_valid_until date)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  event_date date;
  target_vehicle public.fleet_vehicles%ROWTYPE;
BEGIN
  IF p_station_id IS NULL OR p_vehicle_id IS NULL OR p_performed_at IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.fleet_station_members sm
    JOIN public.fleet_fuel_stations s ON s.id = sm.station_id AND s.municipio_id = sm.municipio_id
    WHERE sm.station_id = p_station_id
      AND sm.usuario_id = public.fleet_current_usuario_id() AND sm.ativo
      AND s.municipio_id = public.fleet_current_municipio_id()
      AND s.status::text = 'ATIVO'
  ) THEN
    RAISE EXCEPTION 'Usuário, posto ou parâmetros inválidos' USING ERRCODE = '42501';
  END IF;
  event_date := (p_performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT v.* INTO target_vehicle FROM public.fleet_vehicles v
  WHERE v.id = p_vehicle_id AND v.municipio_id = public.fleet_current_municipio_id();
  IF NOT FOUND OR target_vehicle.operational_status::text <> 'ATIVO' THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_vehicle_restrictions r
    WHERE r.municipio_id = target_vehicle.municipio_id AND r.vehicle_id = target_vehicle.id
      AND r.active AND r.released_at IS NULL AND r.starts_at <= p_performed_at
      AND (r.ends_at IS NULL OR r.ends_at >= p_performed_at)
  ) THEN RETURN; END IF;
  RETURN QUERY
  WITH authorized(driver_id) AS (
    SELECT a.driver_id FROM public.fleet_vehicle_driver_authorizations a
    WHERE a.municipio_id = target_vehicle.municipio_id AND a.vehicle_id = target_vehicle.id
      AND a.status = 'ATIVA' AND a.valid_from <= event_date
      AND (a.valid_until IS NULL OR a.valid_until >= event_date)
    UNION
    SELECT old.driver_id FROM public.fleet_vehicle_authorized_drivers old
    WHERE old.municipio_id = target_vehicle.municipio_id AND old.vehicle_id = target_vehicle.id
      AND old.ativo AND (old.valid_from IS NULL OR old.valid_from <= event_date)
      AND (old.valid_until IS NULL OR old.valid_until >= event_date)
  )
  SELECT d.id, d.nome, d.matricula, d.cnh_valid_until
  FROM authorized a JOIN public.fleet_drivers d ON d.id = a.driver_id
  WHERE d.municipio_id = target_vehicle.municipio_id AND d.ativo
    AND d.cnh_valid_until >= event_date
  ORDER BY d.nome;
END $$;

-- Valida o path na linha de metadados: <municipio_uuid>/<vehicle_uuid>/<arquivo>.
CREATE OR REPLACE FUNCTION public.fleet_vehicle_document_path_valid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
BEGIN
  IF NEW.storage_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
     OR split_part(NEW.storage_path, '/', 1)::uuid IS DISTINCT FROM NEW.municipio_id
     OR split_part(NEW.storage_path, '/', 2)::uuid IS DISTINCT FROM NEW.vehicle_id THEN
    RAISE EXCEPTION 'storage_path deve seguir <municipio_uuid>/<vehicle_uuid>/<arquivo>';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_vehicle_documents_path_validate ON public.fleet_vehicle_documents;
CREATE TRIGGER fleet_vehicle_documents_path_validate
BEFORE INSERT OR UPDATE OF municipio_id, vehicle_id, storage_path ON public.fleet_vehicle_documents
FOR EACH ROW EXECUTE FUNCTION public.fleet_vehicle_document_path_valid();

-- Helper para policy de Storage. A conversão UUID só ocorre após regex restritiva.
CREATE OR REPLACE FUNCTION public.fleet_can_manage_vehicle_document_path(p_path text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE tenant_id uuid; vehicle_id uuid;
BEGIN
  IF NOT public.fleet_is_manager() OR p_path IS NULL OR
     p_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$' THEN
    RETURN false;
  END IF;
  tenant_id := split_part(p_path, '/', 1)::uuid;
  vehicle_id := split_part(p_path, '/', 2)::uuid;
  RETURN tenant_id = public.fleet_current_municipio_id() AND EXISTS (
    SELECT 1 FROM public.fleet_vehicles v
    WHERE v.municipio_id = tenant_id AND v.id = vehicle_id
  );
END $$;

-- RLS: categorias = leitura gestor/prefeito, escrita gestor; restrições = gestor;
-- histórico departamental = somente SELECT gestor (escrita exclusiva do trigger);
-- docs = gestor; autorizações de motorista = leitura gestor/prefeito, escrita gestor.
ALTER TABLE public.fleet_vehicle_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicle_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicle_department_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_vehicle_driver_authorizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_vehicle_categories_read ON public.fleet_vehicle_categories;
CREATE POLICY fleet_vehicle_categories_read ON public.fleet_vehicle_categories FOR SELECT TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_mayor_or_manager());
DROP POLICY IF EXISTS fleet_vehicle_categories_manage ON public.fleet_vehicle_categories;
CREATE POLICY fleet_vehicle_categories_manage ON public.fleet_vehicle_categories FOR ALL TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager())
  WITH CHECK (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager());

DROP POLICY IF EXISTS fleet_vehicle_restrictions_read ON public.fleet_vehicle_restrictions;
CREATE POLICY fleet_vehicle_restrictions_read ON public.fleet_vehicle_restrictions FOR SELECT TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager());
DROP POLICY IF EXISTS fleet_vehicle_restrictions_manage ON public.fleet_vehicle_restrictions;
CREATE POLICY fleet_vehicle_restrictions_manage ON public.fleet_vehicle_restrictions FOR ALL TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager())
  WITH CHECK (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager());

DROP POLICY IF EXISTS fleet_vehicle_department_history_manager_read ON public.fleet_vehicle_department_history;
CREATE POLICY fleet_vehicle_department_history_manager_read ON public.fleet_vehicle_department_history FOR SELECT TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager());

DROP POLICY IF EXISTS fleet_vehicle_documents_read ON public.fleet_vehicle_documents;
CREATE POLICY fleet_vehicle_documents_read ON public.fleet_vehicle_documents FOR SELECT TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager());
DROP POLICY IF EXISTS fleet_vehicle_documents_manage ON public.fleet_vehicle_documents;
CREATE POLICY fleet_vehicle_documents_manage ON public.fleet_vehicle_documents FOR ALL TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager())
  WITH CHECK (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager());

DROP POLICY IF EXISTS fleet_vehicle_driver_authorizations_read ON public.fleet_vehicle_driver_authorizations;
CREATE POLICY fleet_vehicle_driver_authorizations_read ON public.fleet_vehicle_driver_authorizations FOR SELECT TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_mayor_or_manager());
DROP POLICY IF EXISTS fleet_vehicle_driver_authorizations_manage ON public.fleet_vehicle_driver_authorizations;
CREATE POLICY fleet_vehicle_driver_authorizations_manage ON public.fleet_vehicle_driver_authorizations FOR ALL TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager())
  WITH CHECK (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager());

-- Histórico de veículo: remove o ALL anterior, concede somente SELECT gestor.
ALTER TABLE public.fleet_vehicle_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fleet_vehicle_history_manager ON public.fleet_vehicle_history;
DROP POLICY IF EXISTS fleet_vehicle_history_manager_read ON public.fleet_vehicle_history;
CREATE POLICY fleet_vehicle_history_manager_read ON public.fleet_vehicle_history FOR SELECT
  TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager());
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.fleet_vehicle_history FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_vehicle_history TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fleet_vehicle_categories,
  public.fleet_vehicle_restrictions, public.fleet_vehicle_documents,
  public.fleet_vehicle_driver_authorizations TO authenticated;
GRANT SELECT ON public.fleet_vehicle_department_history TO authenticated;

-- Postos deixam de consultar a tabela inteira de veículos. O portal usa as RPCs
-- acima, que retornam somente as colunas mínimas e respeitam associação/bloqueio.
DROP POLICY IF EXISTS fleet_vehicles_station_read ON public.fleet_vehicles;

-- Storage privado, bucket independente do bucket de comprovantes do posto.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('fleet-vehicle-documents', 'fleet-vehicle-documents', false, 10485760,
        ARRAY['application/pdf','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO UPDATE SET
  public = false, file_size_limit = 10485760,
  allowed_mime_types = ARRAY['application/pdf','image/jpeg','image/png','image/webp'];
DROP POLICY IF EXISTS fleet_vehicle_docs_storage_select ON storage.objects;
DROP POLICY IF EXISTS fleet_vehicle_docs_storage_insert ON storage.objects;
DROP POLICY IF EXISTS fleet_vehicle_docs_storage_update ON storage.objects;
DROP POLICY IF EXISTS fleet_vehicle_docs_storage_delete ON storage.objects;
CREATE POLICY fleet_vehicle_docs_storage_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fleet-vehicle-documents' AND public.fleet_can_manage_vehicle_document_path(name));
CREATE POLICY fleet_vehicle_docs_storage_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fleet-vehicle-documents' AND public.fleet_can_manage_vehicle_document_path(name));
CREATE POLICY fleet_vehicle_docs_storage_update ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fleet-vehicle-documents' AND public.fleet_can_manage_vehicle_document_path(name))
  WITH CHECK (bucket_id = 'fleet-vehicle-documents' AND public.fleet_can_manage_vehicle_document_path(name));
CREATE POLICY fleet_vehicle_docs_storage_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fleet-vehicle-documents' AND public.fleet_can_manage_vehicle_document_path(name));

-- Remover EXECUTE público por padrão em funções SECURITY DEFINER; conceder RPC
-- e helper de policy somente a authenticated. As funções de trigger são internas.
REVOKE ALL ON FUNCTION public.fleet_validate_vehicle_identifiers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_vehicle_write_history() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_validate_fueling() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_vehicle_document_path_valid() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_can_manage_vehicle_document_path(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_supplier_vehicle_options(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fleet_supplier_driver_options(uuid, uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_can_manage_vehicle_document_path(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_vehicle_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_driver_options(uuid, uuid, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_update_vehicle(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_update_vehicle(uuid, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_normalize_plate(text), public.fleet_normalize_renavam(text), public.fleet_normalize_chassis(text) FROM PUBLIC, anon, authenticated;

COMMIT;

-- Pós-migração/revisão operacional:
-- 1. VALIDAR as FKs NOT VALID depois de corrigir eventual dado cross-tenant:
--    ALTER TABLE public.fleet_vehicles VALIDATE CONSTRAINT fleet_vehicles_category_same_municipio_fk;
--    ALTER TABLE public.fleet_vehicles VALIDATE CONSTRAINT fleet_vehicles_fuel_same_municipio_fk;
--    ALTER TABLE public.fleet_vehicles VALIDATE CONSTRAINT fleet_vehicles_unit_same_municipio_fk;
--    Validar as demais FKs *_same_municipio_fk com ALTER TABLE ... VALIDATE CONSTRAINT.
-- 2. O usuário confirmou que o dataset existente é fictício. Os 51 veículos
--    recebem placas TST0001… únicas, RENAVAMs sintéticos de 11 dígitos e categoria
--    estimada; a alteração é registrada no histórico. CNHs fictícias expiradas
--    dos motoristas ativos são renovadas por 730 dias. O trigger valida novas
--    gravações; não há CHECK retroativo para os campos históricos.
-- 3. Status fora de uso para unicidade operacional: INATIVO, BAIXADO, ALIENADO.
--    CEDIDO permanece operacional; EM_MANUTENCAO não tem identificadores liberados.
-- 4. `fleet_update_vehicle` recebe `{vehicle_id, payload, reason}` na chamada RPC
--    (parâmetros PostgREST `p_vehicle_id`, `p_payload`, `p_reason`). payload é
--    objeto JSON allowlist acima; campos omitidos não mudam, JSON null limpa
--    colunas anuláveis. Retorno: objeto JSON do veículo atualizado. Motivo é
--    gravado em `fleet_vehicle_history.reason`; UPDATE dispara triggers de
--    histórico e de períodos departamentais.
-- 5. Storage: bucket privado `fleet-vehicle-documents`; path obrigatório
--    `<municipio_uuid>/<vehicle_uuid>/<nome-arquivo>`. INSERT/SELECT/UPDATE/DELETE
--    em objetos e CRUD de metadados são permitidos apenas a gestor de frota do
--    município ativo, com veículo no mesmo tenant. Nenhuma policy para posto.
-- 6. A validação interpreta performed_at na zona America/Sao_Paulo para verificar
--    CNH e vigência das autorizações por data civil local.
-- 7. O trigger de abastecimento mantém a regra anterior authorization_id e
--    excesso de litros vira COM_INCONSISTENCIA (não rejeição). Ele exige driver
--    ativo, CNH vigente e autorização de período para todo abastecimento; confirme
--    cobertura dos fluxos de posto/legados antes de ativar em produção.
-- 8. fleet_supplier_vehicle_options(p_station_id) e
--    fleet_supplier_driver_options(p_station_id,p_vehicle_id,p_performed_at) são
--    acessíveis apenas a authenticated, validam membro ativo do posto e não
--    expõem placa/RENAVAM/chassi para veículos indisponíveis/bloqueados.
-- 9. A migração substitui fleet_validate_fueling e remove a leitura direta da
--    tabela de veículos por postos; o portal atualizado usa as RPCs restritas.
