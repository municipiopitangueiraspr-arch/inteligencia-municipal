-- Postos credenciados e primeiro acesso — alinhamento ao documento funcional v2.0.
-- Preserva registros e histórico; não cria identidades nem documentos fictícios.

-- 1. Campos estruturados do cadastro e autorização municipal para representantes.
ALTER TABLE public.fleet_fuel_stations
  ADD COLUMN IF NOT EXISTS inscricao_estadual text,
  ADD COLUMN IF NOT EXISTS telefone text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS cep text,
  ADD COLUMN IF NOT EXISTS logradouro text,
  ADD COLUMN IF NOT EXISTS numero text,
  ADD COLUMN IF NOT EXISTS complemento text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS contract_number text,
  ADD COLUMN IF NOT EXISTS secondary_users_authorized boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_by integer REFERENCES public.usuarios(id);

COMMENT ON COLUMN public.fleet_fuel_stations.secondary_users_authorized IS
  'Autorização municipal expressa para o representante legal administrar usuários secundários do próprio posto.';
COMMENT ON COLUMN public.fleet_fuel_stations.contract_number IS
  'Número do contrato ou instrumento de credenciamento vinculado ao estabelecimento.';

-- 2. Normalização/validação de CNPJ (inclui CNPJ alfanumérico) e unicidade canônica.
CREATE OR REPLACE FUNCTION public.fleet_normalize_cnpj(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = pg_catalog
AS $$
  SELECT upper(regexp_replace(p_value, '[^A-Za-z0-9]', '', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.fleet_is_valid_cnpj(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v text;
  v_sum integer;
  v_remainder integer;
  v_digit integer;
  v_weights integer[];
  i integer;
BEGIN
  IF p_value IS NULL THEN RETURN false; END IF;
  v := public.fleet_normalize_cnpj(p_value);
  IF length(v) <> 14 OR v !~ '^[A-Z0-9]{12}[0-9]{2}$' OR v = repeat(substr(v, 1, 1), 14) THEN
    RETURN false;
  END IF;

  v_weights := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
  v_sum := 0;
  FOR i IN 1..12 LOOP
    v_sum := v_sum + (ascii(substr(v, i, 1)) - 48) * v_weights[i];
  END LOOP;
  v_remainder := v_sum % 11;
  v_digit := CASE WHEN v_remainder < 2 THEN 0 ELSE 11 - v_remainder END;
  IF v_digit <> substr(v, 13, 1)::integer THEN RETURN false; END IF;

  v_weights := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
  v_sum := 0;
  FOR i IN 1..13 LOOP
    v_sum := v_sum + (ascii(substr(v, i, 1)) - 48) * v_weights[i];
  END LOOP;
  v_remainder := v_sum % 11;
  v_digit := CASE WHEN v_remainder < 2 THEN 0 ELSE 11 - v_remainder END;
  RETURN v_digit = substr(v, 14, 1)::integer;
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_validate_station_cnpj()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.cnpj_snapshot IS DISTINCT FROM OLD.cnpj_snapshot THEN
    NEW.cnpj_snapshot := btrim(NEW.cnpj_snapshot);
    IF NOT public.fleet_is_valid_cnpj(NEW.cnpj_snapshot) THEN
      RAISE EXCEPTION 'Informe um CNPJ válido.' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fleet_station_validate_cnpj ON public.fleet_fuel_stations;
CREATE TRIGGER fleet_station_validate_cnpj
BEFORE INSERT OR UPDATE OF cnpj_snapshot ON public.fleet_fuel_stations
FOR EACH ROW EXECUTE FUNCTION public.fleet_validate_station_cnpj();

CREATE UNIQUE INDEX IF NOT EXISTS fleet_fuel_stations_cnpj_normalized_uidx
  ON public.fleet_fuel_stations (municipio_id, public.fleet_normalize_cnpj(cnpj_snapshot))
  WHERE btrim(cnpj_snapshot) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS fleet_station_access_pending_cnpj_uidx
  ON public.fleet_station_access_requests (municipio_id, public.fleet_normalize_cnpj(cnpj))
  WHERE status = 'PENDENTE';
CREATE UNIQUE INDEX IF NOT EXISTS fleet_station_access_pending_auth_uidx
  ON public.fleet_station_access_requests (auth_user_id)
  WHERE status = 'PENDENTE' AND auth_user_id IS NOT NULL;

-- 3. Normalização conservadora de vínculos fictícios: preserva linhas como histórico,
--    mantendo no máximo um vínculo ativo por usuário e um contato primário por posto.
-- O trigger legado valida apenas atribuição de papel por sessão; removê-lo durante o
-- backfill administrativo e recriar a guarda completa logo abaixo evita falso bloqueio.
DROP TRIGGER IF EXISTS fleet_station_member_role_guard ON public.fleet_station_members;
UPDATE public.fleet_station_members
SET is_primary_contact = false, updated_at = now()
WHERE role::text <> 'REPRESENTANTE_LEGAL' AND is_primary_contact;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY usuario_id
           ORDER BY is_primary_contact DESC,
                    (role::text = 'REPRESENTANTE_LEGAL') DESC,
                    created_at ASC,
                    id ASC
         ) AS rn
  FROM public.fleet_station_members
  WHERE ativo
)
UPDATE public.fleet_station_members m
SET ativo = false, is_primary_contact = false, updated_at = now()
FROM ranked r
WHERE r.id = m.id AND r.rn > 1;

WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY station_id
           ORDER BY is_primary_contact DESC, created_at ASC, id ASC
         ) AS rn
  FROM public.fleet_station_members
  WHERE ativo AND role::text = 'REPRESENTANTE_LEGAL'
)
UPDATE public.fleet_station_members m
SET is_primary_contact = (r.rn = 1), updated_at = now()
FROM ranked r
WHERE r.id = m.id AND m.is_primary_contact IS DISTINCT FROM (r.rn = 1);

-- Credenciamentos vencidos deixam de aparecer como ativos; a vigência histórica é preservada.
UPDATE public.fleet_fuel_stations s
SET status = 'CREDENCIAMENTO_ENCERRADO'::public.fleet_station_status, updated_at = now()
WHERE s.status::text = 'ATIVO'
  AND s.credenciamento_ends_at IS NOT NULL
  AND s.credenciamento_ends_at < (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;

-- Sem vigência inicial válida ou representante legal principal, o posto permanece em análise.
UPDATE public.fleet_fuel_stations s
SET status = 'PENDENTE'::public.fleet_station_status, updated_at = now()
WHERE s.status::text = 'ATIVO'
  AND (
    s.credenciamento_started_at IS NULL
    OR s.credenciamento_started_at > (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date
    OR NOT EXISTS (
      SELECT 1 FROM public.fleet_station_members m
      WHERE m.station_id = s.id AND m.municipio_id = s.municipio_id
        AND m.ativo AND m.is_primary_contact AND m.role::text = 'REPRESENTANTE_LEGAL'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS fleet_station_members_one_active_station_per_user_uidx
  ON public.fleet_station_members (usuario_id)
  WHERE ativo;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_station_members_one_primary_contact_per_station_uidx
  ON public.fleet_station_members (station_id)
  WHERE ativo AND is_primary_contact;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fleet_station_members'::regclass
      AND conname = 'fleet_station_members_primary_role_check'
  ) THEN
    ALTER TABLE public.fleet_station_members
      ADD CONSTRAINT fleet_station_members_primary_role_check
      CHECK (role::text = 'REPRESENTANTE_LEGAL' OR NOT is_primary_contact);
  END IF;
END $$;

-- 4. Guarda de ativação e auditoria permanente de alterações cadastrais e de acesso.
CREATE TABLE IF NOT EXISTS public.fleet_station_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  station_id uuid,
  entity_type text NOT NULL CHECK (entity_type IN ('POSTO','USUARIO_POSTO','SOLICITACAO_ACESSO','DOCUMENTO_POSTO')),
  entity_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  actor_usuario_id integer REFERENCES public.usuarios(id),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  old_data jsonb,
  new_data jsonb
);
CREATE INDEX IF NOT EXISTS fleet_station_audit_log_station_idx
  ON public.fleet_station_audit_log (municipio_id, station_id, occurred_at DESC);
ALTER TABLE public.fleet_station_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fleet_station_audit_log_manager_read ON public.fleet_station_audit_log;
CREATE POLICY fleet_station_audit_log_manager_read
  ON public.fleet_station_audit_log FOR SELECT TO authenticated
  USING (municipio_id = public.fleet_current_municipio_id() AND public.fleet_is_manager());
REVOKE ALL ON public.fleet_station_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_station_audit_log TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_guard_station_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_activating boolean := false;
  v_today date := (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF TG_OP = 'UPDATE' AND (
       NEW.id IS DISTINCT FROM OLD.id
       OR NEW.municipio_id IS DISTINCT FROM OLD.municipio_id
       OR NEW.fornecedor_id IS DISTINCT FROM OLD.fornecedor_id
     ) THEN
    RAISE EXCEPTION 'Identificador, município e fornecedor vinculado não podem ser alterados nesta tela.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := public.fleet_current_usuario_id();
    v_activating := NEW.status::text = 'ATIVO';
  ELSE
    v_activating := NEW.status::text = 'ATIVO' AND (
      OLD.status::text IS DISTINCT FROM NEW.status::text
      OR OLD.credenciamento_started_at IS DISTINCT FROM NEW.credenciamento_started_at
      OR OLD.credenciamento_ends_at IS DISTINCT FROM NEW.credenciamento_ends_at
    );
  END IF;
  NEW.updated_at := clock_timestamp();
  NEW.updated_by := public.fleet_current_usuario_id();
  IF NEW.logradouro IS NOT NULL OR NEW.numero IS NOT NULL OR NEW.complemento IS NOT NULL
     OR NEW.bairro IS NOT NULL OR NEW.cep IS NOT NULL THEN
    NEW.endereco := NULLIF(concat_ws(', ',
      NULLIF(btrim(NEW.logradouro),''),
      CASE WHEN NULLIF(btrim(NEW.numero),'') IS NULL THEN NULL ELSE 'nº '||btrim(NEW.numero) END,
      NULLIF(btrim(NEW.complemento),''),
      NULLIF(btrim(NEW.bairro),''),
      CASE WHEN NULLIF(btrim(NEW.cep),'') IS NULL THEN NULL ELSE 'CEP '||btrim(NEW.cep) END
    ),'');
  END IF;
  IF v_activating THEN
    IF NEW.credenciamento_started_at IS NULL OR NEW.credenciamento_started_at > v_today
       OR (NEW.credenciamento_ends_at IS NOT NULL AND NEW.credenciamento_ends_at < v_today) THEN
      RAISE EXCEPTION 'Para ativar o posto, informe uma vigência válida que inclua a data de hoje.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.fleet_station_members m
      WHERE m.station_id = NEW.id AND m.municipio_id = NEW.municipio_id
        AND m.ativo AND m.is_primary_contact AND m.role::text = 'REPRESENTANTE_LEGAL'
    ) THEN
      RAISE EXCEPTION 'Vincule um representante legal ativo como contato principal antes de ativar o posto.' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fleet_station_guard_write ON public.fleet_fuel_stations;
CREATE TRIGGER fleet_station_guard_write
BEFORE INSERT OR UPDATE ON public.fleet_fuel_stations
FOR EACH ROW EXECUTE FUNCTION public.fleet_guard_station_write();

CREATE OR REPLACE FUNCTION public.fleet_audit_station_entities()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_municipio uuid;
  v_station uuid;
  v_entity_id uuid;
  v_entity_type text;
  v_action text := TG_OP;
  v_actor integer;
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  IF TG_TABLE_NAME = 'fleet_fuel_stations' THEN
    v_entity_type := 'POSTO';
    v_station := COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid);
    v_entity_id := v_station;
    v_municipio := COALESCE((v_new->>'municipio_id')::uuid, (v_old->>'municipio_id')::uuid);
  ELSIF TG_TABLE_NAME = 'fleet_station_members' THEN
    v_entity_type := 'USUARIO_POSTO';
    v_station := COALESCE((v_new->>'station_id')::uuid, (v_old->>'station_id')::uuid);
    v_entity_id := COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid);
    v_municipio := COALESCE((v_new->>'municipio_id')::uuid, (v_old->>'municipio_id')::uuid);
  ELSIF TG_TABLE_NAME = 'fleet_station_access_requests' THEN
    v_entity_type := 'SOLICITACAO_ACESSO';
    v_station := COALESCE((v_new->>'station_id')::uuid, (v_old->>'station_id')::uuid);
    v_entity_id := COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid);
    v_municipio := COALESCE((v_new->>'municipio_id')::uuid, (v_old->>'municipio_id')::uuid);
  ELSE
    v_entity_type := 'DOCUMENTO_POSTO';
    v_station := COALESCE((v_new->>'station_id')::uuid, (v_old->>'station_id')::uuid);
    v_entity_id := COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid);
    v_municipio := COALESCE((v_new->>'municipio_id')::uuid, (v_old->>'municipio_id')::uuid);
  END IF;
  v_actor := public.fleet_current_usuario_id();
  IF v_actor IS NULL AND TG_TABLE_NAME='fleet_station_members' THEN
    v_actor := COALESCE((v_new->>'granted_by')::integer, (v_old->>'granted_by')::integer);
  END IF;
  INSERT INTO public.fleet_station_audit_log
    (municipio_id, station_id, entity_type, entity_id, action, actor_usuario_id, old_data, new_data)
  VALUES
    (v_municipio, v_station, v_entity_type, v_entity_id, v_action, v_actor, v_old, v_new);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fleet_station_audit_after_change ON public.fleet_fuel_stations;
CREATE TRIGGER fleet_station_audit_after_change AFTER INSERT OR UPDATE OR DELETE ON public.fleet_fuel_stations
FOR EACH ROW EXECUTE FUNCTION public.fleet_audit_station_entities();
DROP TRIGGER IF EXISTS fleet_station_member_audit_after_change ON public.fleet_station_members;
CREATE TRIGGER fleet_station_member_audit_after_change AFTER INSERT OR UPDATE OR DELETE ON public.fleet_station_members
FOR EACH ROW EXECUTE FUNCTION public.fleet_audit_station_entities();
DROP TRIGGER IF EXISTS fleet_station_access_audit_after_change ON public.fleet_station_access_requests;
CREATE TRIGGER fleet_station_access_audit_after_change AFTER INSERT OR UPDATE OR DELETE ON public.fleet_station_access_requests
FOR EACH ROW EXECUTE FUNCTION public.fleet_audit_station_entities();

-- Os sete registros existentes foram confirmados pelo responsável como fictícios.
-- Substitui somente CNPJs inválidos por identificadores sintéticos válidos para homologar
-- validação, unicidade e primeiro acesso; cada atualização fica registrada na auditoria.
DO $$
DECLARE
  r record;
  v_base text;
  v_sum integer;
  v_remainder integer;
  v_d1 integer;
  v_d2 integer;
  v_new_cnpj text;
  v_weights integer[];
  i integer;
BEGIN
  FOR r IN
    SELECT s.id,s.razao_social_snapshot,row_number() OVER (ORDER BY s.created_at,s.id) AS sequence_no
    FROM public.fleet_fuel_stations s
    WHERE NOT public.fleet_is_valid_cnpj(s.cnpj_snapshot)
    ORDER BY s.created_at,s.id
  LOOP
    v_base := 'TEST'||lpad(r.sequence_no::text,4,'0')||'0001';
    v_weights := ARRAY[5,4,3,2,9,8,7,6,5,4,3,2];
    v_sum := 0;
    FOR i IN 1..12 LOOP v_sum := v_sum + (ascii(substr(v_base,i,1))-48)*v_weights[i]; END LOOP;
    v_remainder := v_sum % 11;
    v_d1 := CASE WHEN v_remainder<2 THEN 0 ELSE 11-v_remainder END;
    v_weights := ARRAY[6,5,4,3,2,9,8,7,6,5,4,3,2];
    v_sum := 0;
    FOR i IN 1..12 LOOP v_sum := v_sum + (ascii(substr(v_base,i,1))-48)*v_weights[i]; END LOOP;
    v_sum := v_sum + v_d1*v_weights[13];
    v_remainder := v_sum % 11;
    v_d2 := CASE WHEN v_remainder<2 THEN 0 ELSE 11-v_remainder END;
    v_new_cnpj := v_base||v_d1::text||v_d2::text;
    UPDATE public.fleet_fuel_stations
    SET cnpj_snapshot=v_new_cnpj,
        notes=concat_ws(E'\n',NULLIF(btrim(notes),''),'DADO FICTÍCIO DE HOMOLOGAÇÃO: CNPJ sintético gerado para testar validação do primeiro acesso.')
    WHERE id=r.id;
    UPDATE public.fleet_station_access_requests
    SET cnpj=v_new_cnpj,razao_social=r.razao_social_snapshot,updated_at=clock_timestamp()
    WHERE station_id=r.id AND status='APROVADO'
      AND (public.fleet_normalize_cnpj(cnpj)<>v_new_cnpj OR razao_social IS DISTINCT FROM r.razao_social_snapshot);
  END LOOP;
END $$;

-- 5. Somente usuários autenticados submetem sua própria solicitação. A identidade,
--    o município, o estado inicial e os campos de revisão são sempre definidos no servidor.
DROP POLICY IF EXISTS fleet_station_access_requests_public_insert ON public.fleet_station_access_requests;
REVOKE ALL ON public.fleet_station_access_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.fleet_station_access_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_submit_station_access_request(
  p_cnpj text,
  p_razao_social text,
  p_representante_nome text,
  p_representante_documento text DEFAULT NULL,
  p_representante_email text DEFAULT NULL,
  p_representante_telefone text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_auth_email text;
  v_email_confirmed timestamptz;
  v_municipio uuid;
  v_id uuid;
  v_cnpj text := public.fleet_normalize_cnpj(p_cnpj);
  v_email text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Entre com uma conta confirmada para enviar o primeiro acesso.' USING ERRCODE = '42501'; END IF;
  SELECT lower(email), email_confirmed_at INTO v_auth_email, v_email_confirmed
  FROM auth.users WHERE id = v_uid;
  IF v_auth_email IS NULL OR v_email_confirmed IS NULL THEN
    RAISE EXCEPTION 'Confirme o e-mail da conta antes de solicitar o primeiro acesso.' USING ERRCODE = '42501';
  END IF;
  v_email := lower(btrim(COALESCE(p_representante_email, '')));
  IF v_email <> v_auth_email THEN RAISE EXCEPTION 'O e-mail da solicitação deve corresponder à conta autenticada.' USING ERRCODE = '42501'; END IF;
  IF NOT public.fleet_is_valid_cnpj(p_cnpj) THEN RAISE EXCEPTION 'Informe um CNPJ válido.' USING ERRCODE = '22023'; END IF;
  IF length(btrim(COALESCE(p_razao_social,''))) < 2 OR length(btrim(COALESCE(p_razao_social,''))) > 200 THEN
    RAISE EXCEPTION 'Informe uma razão social entre 2 e 200 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF length(btrim(COALESCE(p_representante_nome,''))) < 2 OR length(btrim(COALESCE(p_representante_nome,''))) > 160 THEN
    RAISE EXCEPTION 'Informe o nome completo do representante legal.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_station_access_requests r WHERE r.auth_user_id=v_uid AND r.status='PENDENTE') THEN
    SELECT r.id INTO v_id FROM public.fleet_station_access_requests r WHERE r.auth_user_id=v_uid AND r.status='PENDENTE' ORDER BY r.requested_at DESC LIMIT 1;
    RETURN v_id;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_station_access_requests r
    WHERE r.municipio_id=public.fleet_public_municipio_id()
      AND public.fleet_normalize_cnpj(r.cnpj)=v_cnpj AND r.status='PENDENTE'
  ) THEN RAISE EXCEPTION 'Já existe uma solicitação pendente para este CNPJ.' USING ERRCODE = '23505'; END IF;
  v_municipio := public.fleet_public_municipio_id();
  IF v_municipio IS NULL THEN RAISE EXCEPTION 'Município de atendimento não configurado.' USING ERRCODE = '55000'; END IF;
  INSERT INTO public.fleet_station_access_requests (
    municipio_id, auth_user_id, cnpj, razao_social, representante_nome,
    representante_documento, representante_email, representante_telefone,
    status, station_id, requested_at, reviewed_at, reviewed_by, review_notes, created_at, updated_at
  ) VALUES (
    v_municipio, v_uid, v_cnpj, btrim(p_razao_social), btrim(p_representante_nome),
    NULLIF(btrim(COALESCE(p_representante_documento,'')),''), v_auth_email,
    NULLIF(btrim(COALESCE(p_representante_telefone,'')),''),
    'PENDENTE', NULL, clock_timestamp(), NULL, NULL, NULL, clock_timestamp(), clock_timestamp()
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_first_access_status()
RETURNS TABLE (
  request_id uuid,
  status text,
  station_id uuid,
  razao_social text,
  cnpj text,
  requested_at timestamptz,
  review_notes text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT r.id, r.status, r.station_id, r.razao_social, r.cnpj, r.requested_at, r.review_notes
  FROM public.fleet_station_access_requests r
  WHERE auth.uid() IS NOT NULL AND r.auth_user_id = auth.uid()
  ORDER BY r.requested_at DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fleet_review_station_access_request(
  p_request_id uuid,
  p_decision text,
  p_station_id uuid DEFAULT NULL,
  p_role public.fleet_station_member_role DEFAULT 'REPRESENTANTE_LEGAL',
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  req public.fleet_station_access_requests%ROWTYPE;
  v_station public.fleet_fuel_stations%ROWTYPE;
  v_auth_email text;
  v_confirmed timestamptz;
  v_member_user_id integer;
  v_member_active boolean;
  v_member_profile text;
  v_today date := (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_current_user integer := public.fleet_current_usuario_id();
BEGIN
  IF NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Apenas Gestor de Frotas ou Administrador pode revisar solicitações.' USING ERRCODE = '42501'; END IF;
  IF upper(btrim(COALESCE(p_decision,''))) NOT IN ('APROVAR','NEGAR') THEN RAISE EXCEPTION 'Decisão inválida.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO req FROM public.fleet_station_access_requests
  WHERE id=p_request_id AND municipio_id=public.fleet_current_municipio_id()
  FOR UPDATE;
  IF req.id IS NULL THEN RAISE EXCEPTION 'Solicitação não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF req.status <> 'PENDENTE' THEN RAISE EXCEPTION 'Somente solicitações pendentes podem ser analisadas.' USING ERRCODE = '55000'; END IF;
  IF upper(p_decision) = 'NEGAR' THEN
    UPDATE public.fleet_station_access_requests
    SET status='NEGADO', station_id=NULL, reviewed_at=clock_timestamp(), reviewed_by=v_current_user,
        review_notes=NULLIF(left(btrim(COALESCE(p_notes,'')),2000),''), updated_at=clock_timestamp()
    WHERE id=req.id;
    RETURN true;
  END IF;

  IF p_role::text <> 'REPRESENTANTE_LEGAL' THEN RAISE EXCEPTION 'O primeiro acesso concede somente o papel de representante legal.' USING ERRCODE = '42501'; END IF;
  IF p_station_id IS NULL OR req.auth_user_id IS NULL THEN RAISE EXCEPTION 'É necessário vincular a solicitação autenticada a um posto.' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_station FROM public.fleet_fuel_stations s
  WHERE s.id=p_station_id AND s.municipio_id=req.municipio_id
  FOR UPDATE;
  IF v_station.id IS NULL THEN RAISE EXCEPTION 'Posto inválido para este município.' USING ERRCODE = '42501'; END IF;
  IF v_station.status::text NOT IN ('PENDENTE','ATIVO') THEN RAISE EXCEPTION 'Posto suspenso, inativo ou com credenciamento encerrado não pode receber novos acessos.' USING ERRCODE = '55000'; END IF;
  IF NOT public.fleet_is_valid_cnpj(req.cnpj) OR NOT public.fleet_is_valid_cnpj(v_station.cnpj_snapshot)
     OR public.fleet_normalize_cnpj(req.cnpj) <> public.fleet_normalize_cnpj(v_station.cnpj_snapshot) THEN
    RAISE EXCEPTION 'O CNPJ válido da solicitação deve corresponder exatamente ao CNPJ do posto.' USING ERRCODE = '23514';
  END IF;
  IF v_station.credenciamento_started_at IS NULL OR v_station.credenciamento_started_at > v_today
     OR (v_station.credenciamento_ends_at IS NOT NULL AND v_station.credenciamento_ends_at < v_today) THEN
    RAISE EXCEPTION 'A vigência do credenciamento deve estar válida antes da liberação do representante.' USING ERRCODE = '55000';
  END IF;
  SELECT lower(email), email_confirmed_at INTO v_auth_email,v_confirmed FROM auth.users WHERE id=req.auth_user_id;
  IF v_auth_email IS NULL OR v_confirmed IS NULL OR v_auth_email <> lower(req.representante_email) THEN
    RAISE EXCEPTION 'O solicitante deve confirmar e utilizar a conta do e-mail informado.' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_station_members m
    WHERE m.station_id=v_station.id AND m.ativo AND m.is_primary_contact
      AND m.role::text='REPRESENTANTE_LEGAL'
      AND m.usuario_id <> COALESCE((SELECT u.id FROM public.usuarios u WHERE u.uuid=req.auth_user_id LIMIT 1),-1)
  ) THEN RAISE EXCEPTION 'Este posto já possui representante legal principal ativo; regularize a transferência administrativamente.' USING ERRCODE = '23505'; END IF;

  SELECT u.id,u.ativo,u.perfil INTO v_member_user_id,v_member_active,v_member_profile
  FROM public.usuarios u WHERE u.uuid=req.auth_user_id FOR UPDATE;
  -- A linha de perfil pode ser criada pelo trigger de Auth; se ainda não existir, criá-la
  -- somente para a identidade autenticada e verificada desta solicitação.
  IF v_member_user_id IS NULL THEN
    IF EXISTS (SELECT 1 FROM public.usuarios u WHERE lower(u.email)=lower(req.representante_email) AND u.uuid IS DISTINCT FROM req.auth_user_id) THEN
      RAISE EXCEPTION 'O e-mail informado já pertence a outra identidade do diretório; reconcilie o cadastro antes da aprovação.' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.usuarios (uuid,nome,email,cargo,perfil,ativo,primeiro_acesso,telefone,perfil_completo)
    VALUES (req.auth_user_id,req.representante_nome,req.representante_email,'Representante legal de posto','POSTO_REPRESENTANTE',true,true,req.representante_telefone,false)
    RETURNING id INTO v_member_user_id;
  ELSE
    IF v_member_active IS DISTINCT FROM true OR COALESCE(v_member_profile,'') NOT LIKE 'POSTO_%' THEN
      RAISE EXCEPTION 'A conta existente não é uma identidade ativa de posto.' USING ERRCODE = '42501';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_station_members m WHERE m.usuario_id=v_member_user_id AND m.ativo AND m.station_id<>v_station.id) THEN
    RAISE EXCEPTION 'Este usuário já possui vínculo ativo com outro posto.' USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.fleet_station_members (municipio_id,station_id,usuario_id,role,ativo,is_primary_contact,granted_by)
  VALUES (req.municipio_id,v_station.id,v_member_user_id,'REPRESENTANTE_LEGAL',true,true,v_current_user)
  ON CONFLICT (station_id,usuario_id) DO UPDATE
    SET role='REPRESENTANTE_LEGAL',ativo=true,is_primary_contact=true,granted_by=EXCLUDED.granted_by,updated_at=clock_timestamp();
  UPDATE public.fleet_station_access_requests
  SET status='APROVADO',station_id=v_station.id,reviewed_at=clock_timestamp(),reviewed_by=v_current_user,
      review_notes=NULLIF(left(btrim(COALESCE(p_notes,'')),2000),''),updated_at=clock_timestamp()
  WHERE id=req.id;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.fleet_queue_access_decision_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_type text;
  v_subject text;
BEGIN
  IF OLD.status='PENDENTE' AND NEW.status IN ('APROVADO','NEGADO') THEN
    v_type := CASE WHEN NEW.status='APROVADO' THEN 'ACESSO_LIBERADO' ELSE 'PRIMEIRO_ACESSO_NEGADO' END;
    v_subject := CASE WHEN NEW.status='APROVADO'
      THEN 'Prefeitura de Pitangueiras — Acesso do posto liberado'
      ELSE 'Prefeitura de Pitangueiras — Resultado do Pedido de Primeiro Acesso' END;
    INSERT INTO public.fleet_station_email_notifications
      (municipio_id,request_id,recipient_email,subject,notification_type,status)
    VALUES (NEW.municipio_id,NEW.id,NEW.representante_email,v_subject,v_type,'PENDENTE');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fleet_access_request_queue_decision_email ON public.fleet_station_access_requests;
CREATE TRIGGER fleet_access_request_queue_decision_email
AFTER UPDATE OF status ON public.fleet_station_access_requests
FOR EACH ROW EXECUTE FUNCTION public.fleet_queue_access_decision_email();

-- 6. Portal: identidade e vigência atual determinam se o usuário pode obter contexto de posto.
CREATE OR REPLACE FUNCTION public.fleet_supplier_access_context()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
  SELECT jsonb_build_object(
    'station_id',s.id,
    'role',sm.role,
    'access_available',(
      s.status::text='ATIVO'
      AND s.credenciamento_started_at IS NOT NULL
      AND s.credenciamento_started_at<=(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date
      AND (s.credenciamento_ends_at IS NULL OR s.credenciamento_ends_at>=(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date)
    ),
    'access_reason',CASE
      WHEN s.status::text='PENDENTE' THEN 'O vínculo foi aprovado, mas o Município ainda precisa ativar o estabelecimento.'
      WHEN s.status::text='SUSPENSO' THEN 'O estabelecimento está suspenso. O acesso operacional permanece bloqueado.'
      WHEN s.status::text='INATIVO' THEN 'O estabelecimento está inativo. Entre em contato com a Prefeitura.'
      WHEN s.status::text='CREDENCIAMENTO_ENCERRADO' THEN 'O credenciamento foi encerrado. Entre em contato com a Prefeitura.'
      WHEN s.credenciamento_started_at IS NULL OR s.credenciamento_started_at>(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'A vigência do credenciamento ainda não começou.'
      WHEN s.credenciamento_ends_at IS NOT NULL AND s.credenciamento_ends_at<(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date THEN 'A vigência do credenciamento terminou. Entre em contato com a Prefeitura.'
      ELSE NULL
    END,
    'station',jsonb_build_object(
      'id',s.id,'razao_social_snapshot',s.razao_social_snapshot,
      'nome_fantasia_snapshot',s.nome_fantasia_snapshot,'cnpj_snapshot',s.cnpj_snapshot,
      'endereco',s.endereco,'cidade',s.cidade,'uf',s.uf,
      'representante_nome',s.representante_nome,'representante_documento',s.representante_documento,
      'representante_email',s.representante_email,'representante_telefone',s.representante_telefone,
      'inscricao_estadual',s.inscricao_estadual,'telefone',s.telefone,'email',s.email,
      'cep',s.cep,'logradouro',s.logradouro,'numero',s.numero,'complemento',s.complemento,'bairro',s.bairro,
      'contract_number',s.contract_number,'secondary_users_authorized',s.secondary_users_authorized,
      'status',s.status,'credenciamento_started_at',s.credenciamento_started_at,
      'credenciamento_ends_at',s.credenciamento_ends_at,'notes',s.notes
    )
  )
  FROM public.fleet_station_members sm
  JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id
  JOIN public.usuarios u ON u.id=sm.usuario_id
  WHERE auth.uid() IS NOT NULL AND u.uuid=auth.uid() AND u.ativo AND sm.ativo
    AND sm.municipio_id=public.fleet_current_municipio_id()
  ORDER BY sm.is_primary_contact DESC,sm.created_at ASC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_complete_first_access()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
AS $$
DECLARE
  v_uid uuid:=auth.uid();
  v_user_id integer:=public.fleet_current_usuario_id();
BEGIN
  IF v_uid IS NULL OR v_user_id IS NULL THEN RAISE EXCEPTION 'Sessão autenticada obrigatória.' USING ERRCODE='42501'; END IF;
  UPDATE public.usuarios u
  SET primeiro_acesso=false,perfil_completo=true
  WHERE u.id=v_user_id AND u.uuid=v_uid AND u.ativo AND u.perfil LIKE 'POSTO_%'
    AND EXISTS (SELECT 1 FROM public.fleet_station_members sm WHERE sm.usuario_id=u.id AND sm.ativo);
  IF NOT FOUND THEN RAISE EXCEPTION 'A conta não possui um vínculo ativo de estabelecimento credenciado.' USING ERRCODE='42501'; END IF;
  RETURN true;
END;
$$;

-- 7. Revisão individual transacional de associação de membros.
CREATE OR REPLACE FUNCTION public.fleet_guard_station_member_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_manager boolean := public.fleet_is_manager();
  v_service boolean := COALESCE(auth.jwt()->>'role','')='service_role';
  v_authorized boolean;
  v_station_status text;
  v_start date;
  v_end date;
  v_today date := (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT s.secondary_users_authorized,s.status::text,s.credenciamento_started_at,s.credenciamento_ends_at
    INTO v_authorized,v_station_status,v_start,v_end
  FROM public.fleet_fuel_stations s
  WHERE s.id=NEW.station_id AND s.municipio_id=NEW.municipio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Posto ou município inválido para o vínculo.' USING ERRCODE = '42501'; END IF;
  IF NEW.role::text='REPRESENTANTE_LEGAL' AND NOT NEW.is_primary_contact THEN
    RAISE EXCEPTION 'O representante legal deve ser identificado como contato principal.' USING ERRCODE = '23514';
  END IF;
  IF NEW.role::text<>'REPRESENTANTE_LEGAL' AND NEW.is_primary_contact THEN
    RAISE EXCEPTION 'Somente o representante legal pode ser contato principal.' USING ERRCODE = '23514';
  END IF;

  IF v_manager OR v_service THEN
    IF TG_OP='INSERT' AND NEW.granted_by IS NULL THEN NEW.granted_by:=public.fleet_current_usuario_id(); END IF;
    RETURN NEW;
  END IF;

  IF NOT public.fleet_is_station_representative(NEW.station_id) THEN
    RAISE EXCEPTION 'Somente o representante legal principal do próprio posto pode administrar usuários secundários.' USING ERRCODE = '42501';
  END IF;
  IF NOT v_authorized THEN RAISE EXCEPTION 'A administração de usuários secundários ainda não foi autorizada pelo Município.' USING ERRCODE = '42501'; END IF;
  IF v_station_status<>'ATIVO' OR v_start IS NULL OR v_start>v_today OR (v_end IS NOT NULL AND v_end<v_today) THEN
    RAISE EXCEPTION 'O posto não possui credenciamento ativo e vigente.' USING ERRCODE = '42501';
  END IF;
  IF NEW.role::text NOT IN ('OPERADOR','FRENTISTA','CAIXA_CONFERENTE') OR NEW.is_primary_contact THEN
    RAISE EXCEPTION 'O representante pode administrar somente usuários secundários do próprio posto.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP='INSERT' THEN
    NEW.ativo:=true;
    NEW.granted_by:=public.fleet_current_usuario_id();
  ELSE
    IF NEW.station_id IS DISTINCT FROM OLD.station_id OR NEW.municipio_id IS DISTINCT FROM OLD.municipio_id
       OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id OR OLD.role::text='REPRESENTANTE_LEGAL'
       OR OLD.is_primary_contact THEN
      RAISE EXCEPTION 'O representante não pode transferir, substituir ou editar vínculos de representante legal.' USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fleet_station_member_role_guard ON public.fleet_station_members;
CREATE TRIGGER fleet_station_member_role_guard
BEFORE INSERT OR UPDATE ON public.fleet_station_members
FOR EACH ROW EXECUTE FUNCTION public.fleet_guard_station_member_role();

CREATE OR REPLACE FUNCTION public.fleet_assert_active_station_has_primary_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
AS $$
DECLARE
  v_station_ids uuid[];
  v_station_id uuid;
  v_status text;
BEGIN
  IF TG_OP='INSERT' THEN
    v_station_ids:=ARRAY[NEW.station_id];
  ELSIF TG_OP='DELETE' THEN
    v_station_ids:=ARRAY[OLD.station_id];
  ELSE
    v_station_ids:=ARRAY[OLD.station_id,NEW.station_id];
  END IF;
  FOREACH v_station_id IN ARRAY v_station_ids LOOP
    SELECT s.status::text INTO v_status FROM public.fleet_fuel_stations s WHERE s.id=v_station_id;
    IF v_status='ATIVO' AND NOT EXISTS (
      SELECT 1 FROM public.fleet_station_members m
      WHERE m.station_id=v_station_id AND m.ativo AND m.is_primary_contact
        AND m.role::text='REPRESENTANTE_LEGAL'
    ) THEN
      RAISE EXCEPTION 'Um posto ativo deve manter exatamente um representante legal principal; coloque o posto em análise antes de remover o contato.' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS fleet_station_primary_contact_required ON public.fleet_station_members;
CREATE CONSTRAINT TRIGGER fleet_station_primary_contact_required
AFTER INSERT OR UPDATE OR DELETE ON public.fleet_station_members
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fleet_assert_active_station_has_primary_contact();

-- 8. Novos abastecimentos só podem ser incluídos para estabelecimento ativo e na vigência.
CREATE OR REPLACE FUNCTION public.fleet_guard_station_accreditation_fueling()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  v_station public.fleet_fuel_stations%ROWTYPE;
  v_event_date date;
  v_must_validate boolean := false;
BEGIN
  IF TG_OP='INSERT' THEN
    v_must_validate:=true;
  ELSIF NOT public.fleet_is_manager() AND (
      NEW.station_id IS DISTINCT FROM OLD.station_id OR NEW.performed_at IS DISTINCT FROM OLD.performed_at
    ) THEN
    v_must_validate:=true;
  END IF;
  IF NOT v_must_validate THEN RETURN NEW; END IF;
  SELECT * INTO v_station FROM public.fleet_fuel_stations s
  WHERE s.id=NEW.station_id AND s.municipio_id=NEW.municipio_id;
  IF v_station.id IS NULL THEN RAISE EXCEPTION 'Posto não autorizado para este município.' USING ERRCODE = '42501'; END IF;
  v_event_date := (NEW.performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
  IF v_station.status::text<>'ATIVO' THEN RAISE EXCEPTION 'Somente estabelecimento credenciado ativo pode registrar abastecimentos.' USING ERRCODE = '42501'; END IF;
  IF v_station.credenciamento_started_at IS NULL OR v_event_date<v_station.credenciamento_started_at
     OR (v_station.credenciamento_ends_at IS NOT NULL AND v_event_date>v_station.credenciamento_ends_at) THEN
    RAISE EXCEPTION 'A data do abastecimento deve estar dentro da vigência do credenciamento.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS fleet_fueling_station_accreditation_guard ON public.fleet_fuelings;
CREATE TRIGGER fleet_fueling_station_accreditation_guard
BEFORE INSERT OR UPDATE OF station_id,performed_at ON public.fleet_fuelings
FOR EACH ROW EXECUTE FUNCTION public.fleet_guard_station_accreditation_fueling();

-- 9. Documentos privados do contrato/credenciamento, com versionamento e auditoria.
CREATE TABLE IF NOT EXISTS public.fleet_station_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  station_id uuid NOT NULL,
  document_type text NOT NULL DEFAULT 'CONTRATO_CREDENCIAMENTO'
    CHECK (document_type IN ('CONTRATO_CREDENCIAMENTO','ADITIVO','OUTRO')),
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 20971520),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  is_current boolean NOT NULL DEFAULT true,
  notes text,
  uploaded_by integer REFERENCES public.usuarios(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fleet_station_documents_municipio_station_fkey
    FOREIGN KEY (municipio_id,station_id) REFERENCES public.fleet_fuel_stations(municipio_id,id)
);
CREATE INDEX IF NOT EXISTS fleet_station_documents_station_current_idx
  ON public.fleet_station_documents (municipio_id,station_id,document_type,uploaded_at DESC);
ALTER TABLE public.fleet_station_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fleet_station_documents_manager_read ON public.fleet_station_documents;
CREATE POLICY fleet_station_documents_manager_read
  ON public.fleet_station_documents FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
REVOKE ALL ON public.fleet_station_documents FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fleet_station_documents TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_register_station_document(
  p_station_id uuid,
  p_file_name text,
  p_storage_path text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_notes text DEFAULT NULL,
  p_document_type text DEFAULT 'CONTRATO_CREDENCIAMENTO'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
AS $$
DECLARE
  v_municipio uuid:=public.fleet_current_municipio_id();
  v_user integer:=public.fleet_current_usuario_id();
  v_id uuid;
  v_version integer;
  v_type text:=upper(btrim(COALESCE(p_document_type,'CONTRATO_CREDENCIAMENTO')));
BEGIN
  IF NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode anexar documentos de credenciamento.' USING ERRCODE = '42501'; END IF;
  IF p_station_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.fleet_fuel_stations s WHERE s.id=p_station_id AND s.municipio_id=v_municipio) THEN
    RAISE EXCEPTION 'Posto fora do escopo municipal.' USING ERRCODE = '42501';
  END IF;
  IF v_type NOT IN ('CONTRATO_CREDENCIAMENTO','ADITIVO','OUTRO') THEN RAISE EXCEPTION 'Tipo de documento inválido.' USING ERRCODE = '22023'; END IF;
  IF p_file_name IS NULL OR length(btrim(p_file_name))<1 OR length(p_file_name)>255 THEN RAISE EXCEPTION 'Nome de arquivo inválido.' USING ERRCODE = '22023'; END IF;
  IF p_mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp') OR p_file_size_bytes IS NULL OR p_file_size_bytes<=0 OR p_file_size_bytes>20971520 THEN
    RAISE EXCEPTION 'Arquivo inválido: use PDF, JPG, PNG ou WEBP até 20 MB.' USING ERRCODE = '22023';
  END IF;
  IF p_storage_path !~ ('^'||v_municipio::text||'/stations/'||p_station_id::text||'/[0-9a-fA-F-]{36}-[A-Za-z0-9._-]+$') THEN
    RAISE EXCEPTION 'Caminho de armazenamento fora do escopo do posto.' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(max(d.version),0)+1 INTO v_version
  FROM public.fleet_station_documents d
  WHERE d.municipio_id=v_municipio AND d.station_id=p_station_id AND d.document_type=v_type;
  UPDATE public.fleet_station_documents
  SET is_current=false,updated_at=clock_timestamp()
  WHERE municipio_id=v_municipio AND station_id=p_station_id AND document_type=v_type AND is_current;
  INSERT INTO public.fleet_station_documents
    (municipio_id,station_id,document_type,file_name,storage_path,mime_type,file_size_bytes,version,is_current,notes,uploaded_by)
  VALUES
    (v_municipio,p_station_id,v_type,btrim(p_file_name),p_storage_path,p_mime_type,p_file_size_bytes,v_version,true,NULLIF(left(btrim(COALESCE(p_notes,'')),2000),''),v_user)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
DROP TRIGGER IF EXISTS fleet_station_document_audit_after_change ON public.fleet_station_documents;
CREATE TRIGGER fleet_station_document_audit_after_change AFTER INSERT OR UPDATE OR DELETE ON public.fleet_station_documents
FOR EACH ROW EXECUTE FUNCTION public.fleet_audit_station_entities();

-- Upload de órfãos somente para gestores do município; arquivos já registrados não podem ser removidos.
DROP POLICY IF EXISTS fleet_storage_station_document_delete_orphan ON storage.objects;
CREATE POLICY fleet_storage_station_document_delete_orphan
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id='fleet-documents'
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
    AND split_part(name,'/',2)='stations'
    AND public.fleet_is_closure_manager()
    AND NOT EXISTS (SELECT 1 FROM public.fleet_station_documents d WHERE d.storage_path=storage.objects.name)
  );

-- 10. Endurecimento de privilégios e transições.
DROP POLICY IF EXISTS fleet_station_members_representative ON public.fleet_station_members;
CREATE POLICY fleet_station_members_representative
  ON public.fleet_station_members FOR ALL TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_station_representative(station_id))
  WITH CHECK (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_station_representative(station_id));
REVOKE ALL ON public.fleet_fuel_stations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.fleet_fuel_stations TO authenticated;
REVOKE DELETE,TRUNCATE ON public.fleet_fuel_stations FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.fleet_station_members FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.fleet_station_members TO authenticated;
REVOKE DELETE,TRUNCATE ON public.fleet_station_members FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.fleet_station_email_notifications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fleet_station_email_notifications TO authenticated;

-- Sem DML direto na fila; a interface usa funções server-side com identidade autenticada.
REVOKE ALL ON FUNCTION public.fleet_submit_station_access_request(text,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_submit_station_access_request(text,text,text,text,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_supplier_first_access_status() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_first_access_status() TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_review_station_access_request(uuid,text,uuid,public.fleet_station_member_role,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_review_station_access_request(uuid,text,uuid,public.fleet_station_member_role,text) TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_supplier_access_context() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_access_context() TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_supplier_complete_first_access() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_complete_first_access() TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_register_station_document(uuid,text,text,text,bigint,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_register_station_document(uuid,text,text,text,bigint,text,text) TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_normalize_cnpj(text),public.fleet_is_valid_cnpj(text),public.fleet_validate_station_cnpj(),public.fleet_guard_station_write(),public.fleet_audit_station_entities(),public.fleet_queue_access_decision_email(),public.fleet_guard_station_member_role(),public.fleet_assert_active_station_has_primary_contact(),public.fleet_guard_station_accreditation_fueling() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_is_manager() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_is_manager() TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_is_station_representative(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_is_station_representative(uuid) TO authenticated;

-- Removida a permissão anônima ao RPC de revisão e ao contexto privado do posto.
COMMENT ON FUNCTION public.fleet_submit_station_access_request(text,text,text,text,text,text) IS
  'Cria pedido de primeiro acesso somente para o próprio usuário autenticado com e-mail confirmado; revisão/status/município são definidos no servidor.';
COMMENT ON FUNCTION public.fleet_review_station_access_request(uuid,text,uuid,public.fleet_station_member_role,text) IS
  'Decisão municipal única para solicitação pendente, validando identidade autenticada, CNPJ, município, papel e vigência.';
