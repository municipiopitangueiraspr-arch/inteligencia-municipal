-- Complemento ao fluxo de veículos: cessões temporárias e abastecimento em outra secretaria.
BEGIN;

ALTER TABLE public.fleet_vehicle_authorizations
  ADD COLUMN IF NOT EXISTS supporting_document_path text,
  ADD COLUMN IF NOT EXISTS supporting_document_name text,
  ADD COLUMN IF NOT EXISTS supporting_document_mime_type text,
  ADD COLUMN IF NOT EXISTS supporting_document_size_bytes bigint;

CREATE UNIQUE INDEX IF NOT EXISTS fleet_vehicle_authorizations_municipio_id_id_uidx
  ON public.fleet_vehicle_authorizations (municipio_id, id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_vehicle_authorizations'::regclass AND conname='fleet_vehicle_authorizations_approval_requires_document') THEN
    ALTER TABLE public.fleet_vehicle_authorizations ADD CONSTRAINT fleet_vehicle_authorizations_approval_requires_document
      CHECK (status <> 'APROVADA'::public.fleet_authorization_status OR
        (supporting_document_path IS NOT NULL AND supporting_document_name IS NOT NULL AND btrim(supporting_document_name) <> '' AND
         supporting_document_mime_type IS NOT NULL AND supporting_document_size_bytes IS NOT NULL AND
         supporting_document_mime_type IN ('application/pdf','image/jpeg','image/png','image/webp') AND
         supporting_document_size_bytes BETWEEN 1 AND 10485760)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_vehicle_authorizations'::regclass AND conname='fleet_vehicle_authorizations_document_fields_consistent') THEN
    ALTER TABLE public.fleet_vehicle_authorizations ADD CONSTRAINT fleet_vehicle_authorizations_document_fields_consistent
      CHECK ((supporting_document_path IS NULL AND supporting_document_name IS NULL AND supporting_document_mime_type IS NULL AND supporting_document_size_bytes IS NULL) OR
        (supporting_document_path IS NOT NULL AND supporting_document_name IS NOT NULL AND btrim(supporting_document_name) <> '' AND
         supporting_document_mime_type IS NOT NULL AND supporting_document_size_bytes IS NOT NULL AND
         supporting_document_mime_type IN ('application/pdf','image/jpeg','image/png','image/webp') AND
         supporting_document_size_bytes BETWEEN 1 AND 10485760)) NOT VALID;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.fleet_vehicle_authorization_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  vehicle_id uuid NOT NULL,
  authorization_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_data jsonb,
  new_data jsonb,
  reason text,
  changed_by integer REFERENCES public.usuarios(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_vehicle_authorization_history_lookup_idx
  ON public.fleet_vehicle_authorization_history (municipio_id,vehicle_id,changed_at DESC);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_vehicle_authorization_history'::regclass AND conname='fleet_vehicle_authorization_history_vehicle_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_authorization_history ADD CONSTRAINT fleet_vehicle_authorization_history_vehicle_same_municipio_fk
      FOREIGN KEY (municipio_id,vehicle_id) REFERENCES public.fleet_vehicles(municipio_id,id) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_vehicle_authorization_history'::regclass AND conname='fleet_vehicle_authorization_history_auth_same_municipio_fk') THEN
    ALTER TABLE public.fleet_vehicle_authorization_history ADD CONSTRAINT fleet_vehicle_authorization_history_auth_same_municipio_fk
      FOREIGN KEY (municipio_id,authorization_id) REFERENCES public.fleet_vehicle_authorizations(municipio_id,id) NOT VALID;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_validate_vehicle_authorization_document()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,pg_temp
AS $$
BEGIN
  IF NEW.supporting_document_path IS NOT NULL AND
    (NEW.supporting_document_path !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/]+$'
     OR split_part(NEW.supporting_document_path,'/',1)::uuid IS DISTINCT FROM NEW.municipio_id
     OR split_part(NEW.supporting_document_path,'/',2)::uuid IS DISTINCT FROM NEW.vehicle_id) THEN
    RAISE EXCEPTION 'Documento da autorização deve seguir <municipio_uuid>/<vehicle_uuid>/<arquivo>';
  END IF;
  IF NEW.status='APROVADA' AND (NEW.authorized_by IS NULL OR NEW.supporting_document_path IS NULL) THEN
    RAISE EXCEPTION 'Uma autorização aprovada exige autorizador e documento comprobatório';
  END IF;
  IF TG_OP='INSERT' THEN
    IF NEW.requested_by IS DISTINCT FROM public.fleet_current_usuario_id() THEN RAISE EXCEPTION 'O solicitante deve corresponder ao usuário autenticado'; END IF;
    IF NEW.status='APROVADA' AND NEW.authorized_by IS DISTINCT FROM public.fleet_current_usuario_id() THEN RAISE EXCEPTION 'O autorizador deve corresponder ao usuário autenticado que aprova'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.fleet_vehicles v
        WHERE v.id=NEW.vehicle_id AND v.municipio_id=NEW.municipio_id
          AND v.responsible_unit_id=NEW.responsible_unit_id) THEN
      RAISE EXCEPTION 'A unidade responsável da autorização deve corresponder à lotação atual do veículo';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.unidades_organizacionais u WHERE u.id=NEW.beneficiary_unit_id AND u.municipio_id=NEW.municipio_id AND u.ativo) OR NEW.beneficiary_unit_id=NEW.responsible_unit_id THEN
      RAISE EXCEPTION 'A secretaria beneficiária deve ser ativa, pertencer ao município e ser diferente da responsável';
    END IF;
  ELSE
    IF OLD.status IN ('APROVADA'::public.fleet_authorization_status,'CANCELADA'::public.fleet_authorization_status) AND (NEW.municipio_id IS DISTINCT FROM OLD.municipio_id OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR NEW.responsible_unit_id IS DISTINCT FROM OLD.responsible_unit_id OR NEW.beneficiary_unit_id IS DISTINCT FROM OLD.beneficiary_unit_id OR NEW.requested_by IS DISTINCT FROM OLD.requested_by OR NEW.authorized_by IS DISTINCT FROM OLD.authorized_by OR NEW.purpose IS DISTINCT FROM OLD.purpose OR NEW.valid_from IS DISTINCT FROM OLD.valid_from OR NEW.valid_until IS DISTINCT FROM OLD.valid_until OR (OLD.supporting_document_path IS NOT NULL AND (NEW.supporting_document_path IS DISTINCT FROM OLD.supporting_document_path OR NEW.supporting_document_name IS DISTINCT FROM OLD.supporting_document_name OR NEW.supporting_document_mime_type IS DISTINCT FROM OLD.supporting_document_mime_type OR NEW.supporting_document_size_bytes IS DISTINCT FROM OLD.supporting_document_size_bytes))) THEN
      RAISE EXCEPTION 'Autorização aprovada é imutável; cancele-a e registre uma nova autorização para corrigir os dados';
    END IF;
    IF NEW.status='APROVADA' AND OLD.status IS DISTINCT FROM 'APROVADA'::public.fleet_authorization_status AND NEW.authorized_by IS DISTINCT FROM public.fleet_current_usuario_id() THEN
      RAISE EXCEPTION 'O autorizador deve corresponder ao usuário autenticado que aprova';
    END IF;
    IF NEW.municipio_id IS DISTINCT FROM OLD.municipio_id OR NEW.vehicle_id IS DISTINCT FROM OLD.vehicle_id OR NEW.responsible_unit_id IS DISTINCT FROM OLD.responsible_unit_id THEN
      IF NOT EXISTS (SELECT 1 FROM public.fleet_vehicles v WHERE v.id=NEW.vehicle_id AND v.municipio_id=NEW.municipio_id AND v.responsible_unit_id=NEW.responsible_unit_id) THEN
        RAISE EXCEPTION 'A unidade responsável da autorização deve corresponder à lotação atual do veículo';
      END IF;
    END IF;
    IF NEW.beneficiary_unit_id IS DISTINCT FROM OLD.beneficiary_unit_id OR (NEW.status='APROVADA' AND OLD.status IS DISTINCT FROM 'APROVADA'::public.fleet_authorization_status) THEN
      IF NOT EXISTS (SELECT 1 FROM public.unidades_organizacionais u WHERE u.id=NEW.beneficiary_unit_id AND u.municipio_id=NEW.municipio_id AND u.ativo) OR NEW.beneficiary_unit_id=NEW.responsible_unit_id THEN
        RAISE EXCEPTION 'A secretaria beneficiária deve ser ativa, pertencer ao município e ser diferente da responsável';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_vehicle_authorization_document_validate ON public.fleet_vehicle_authorizations;
CREATE TRIGGER fleet_vehicle_authorization_document_validate
BEFORE INSERT OR UPDATE OF municipio_id,vehicle_id,responsible_unit_id,beneficiary_unit_id,requested_by,authorized_by,purpose,valid_from,valid_until,status,approval_notes,supporting_document_path,supporting_document_name,supporting_document_mime_type,supporting_document_size_bytes
ON public.fleet_vehicle_authorizations FOR EACH ROW
EXECUTE FUNCTION public.fleet_validate_vehicle_authorization_document();

CREATE OR REPLACE FUNCTION public.fleet_vehicle_authorization_write_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,pg_temp
AS $$
DECLARE event_name text;
BEGIN
  IF TG_OP='INSERT' THEN
    event_name := 'CRIADA';
    INSERT INTO public.fleet_vehicle_authorization_history(municipio_id,vehicle_id,authorization_id,event_type,previous_data,new_data,reason,changed_by)
    VALUES (NEW.municipio_id,NEW.vehicle_id,NEW.id,event_name,NULL,to_jsonb(NEW),NEW.approval_notes,public.fleet_current_usuario_id());
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW)-'updated_at') IS DISTINCT FROM (to_jsonb(OLD)-'updated_at') THEN
    event_name := CASE WHEN NEW.status::text IS DISTINCT FROM OLD.status::text THEN 'SITUACAO' ELSE 'ALTERACAO' END;
    INSERT INTO public.fleet_vehicle_authorization_history(municipio_id,vehicle_id,authorization_id,event_type,previous_data,new_data,reason,changed_by)
    VALUES (NEW.municipio_id,NEW.vehicle_id,NEW.id,event_name,to_jsonb(OLD),to_jsonb(NEW),NEW.approval_notes,public.fleet_current_usuario_id());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_vehicle_authorization_history_after_write ON public.fleet_vehicle_authorizations;
CREATE TRIGGER fleet_vehicle_authorization_history_after_write
AFTER INSERT OR UPDATE ON public.fleet_vehicle_authorizations FOR EACH ROW
EXECUTE FUNCTION public.fleet_vehicle_authorization_write_history();

ALTER TABLE public.fleet_vehicle_authorization_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fleet_vehicle_authorization_history_manager_read ON public.fleet_vehicle_authorization_history;
CREATE POLICY fleet_vehicle_authorization_history_manager_read ON public.fleet_vehicle_authorization_history FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
REVOKE ALL ON public.fleet_vehicle_authorization_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.fleet_vehicle_authorization_history TO authenticated;
REVOKE DELETE,TRUNCATE ON public.fleet_vehicle_authorizations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.fleet_vehicle_authorizations TO authenticated;

CREATE OR REPLACE FUNCTION public.fleet_validate_fueling()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog,public,pg_temp
AS $$
DECLARE
  vehicle public.fleet_vehicles%ROWTYPE;
  driver public.fleet_drivers%ROWTYPE;
  auth_ok boolean := false;
  event_date date := (NEW.performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT v.* INTO vehicle FROM public.fleet_vehicles v
  WHERE v.id=NEW.vehicle_id AND v.municipio_id=NEW.municipio_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Veículo inexistente ou fora do município do abastecimento'; END IF;
  IF vehicle.operational_status::text IN ('INATIVO','EM_MANUTENCAO','BAIXADO','ALIENADO') THEN RAISE EXCEPTION 'Veículo indisponível para abastecimento'; END IF;
  IF NEW.responsible_unit_id IS DISTINCT FROM vehicle.responsible_unit_id THEN RAISE EXCEPTION 'A unidade responsável deve corresponder à lotação administrativa do veículo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.unidades_organizacionais u WHERE u.id=NEW.responsible_unit_id AND u.municipio_id=NEW.municipio_id) THEN RAISE EXCEPTION 'Unidade responsável fora do município do abastecimento'; END IF;
  IF NEW.beneficiary_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.unidades_organizacionais u WHERE u.id=NEW.beneficiary_unit_id AND u.municipio_id=NEW.municipio_id) THEN RAISE EXCEPTION 'Unidade beneficiária fora do município do abastecimento'; END IF;
  IF vehicle.fuel_type_id IS NULL OR vehicle.fuel_type_id IS DISTINCT FROM NEW.fuel_type_id OR NOT EXISTS (SELECT 1 FROM public.fleet_fuel_types f WHERE f.id=NEW.fuel_type_id AND f.municipio_id=NEW.municipio_id AND f.ativo) THEN RAISE EXCEPTION 'Combustível incompatível ou inativo para o veículo'; END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_vehicle_restrictions r WHERE r.municipio_id=NEW.municipio_id AND r.vehicle_id=NEW.vehicle_id AND r.active AND r.released_at IS NULL AND r.starts_at<=NEW.performed_at AND (r.ends_at IS NULL OR r.ends_at>=NEW.performed_at)) THEN RAISE EXCEPTION 'Veículo possui bloqueio temporário ativo na data do abastecimento'; END IF;
  IF NEW.driver_id IS NULL THEN RAISE EXCEPTION 'Motorista autorizado é obrigatório para abastecimento'; END IF;
  SELECT d.* INTO driver FROM public.fleet_drivers d WHERE d.id=NEW.driver_id AND d.municipio_id=NEW.municipio_id;
  IF NOT FOUND OR NOT driver.ativo THEN RAISE EXCEPTION 'Motorista inexistente ou inativo'; END IF;
  IF driver.cnh_valid_until IS NULL OR driver.cnh_valid_until<event_date THEN RAISE EXCEPTION 'CNH do motorista inválida na data do abastecimento'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=NEW.municipio_id AND a.vehicle_id=NEW.vehicle_id AND a.driver_id=NEW.driver_id AND a.status='ATIVA' AND a.valid_from<=event_date AND (a.valid_until IS NULL OR a.valid_until>=event_date)
    UNION ALL
    SELECT 1 FROM public.fleet_vehicle_authorized_drivers old WHERE old.municipio_id=NEW.municipio_id AND old.vehicle_id=NEW.vehicle_id AND old.driver_id=NEW.driver_id AND old.ativo AND (old.valid_from IS NULL OR old.valid_from<=event_date) AND (old.valid_until IS NULL OR old.valid_until>=event_date)
  ) INTO auth_ok;
  IF NOT auth_ok THEN RAISE EXCEPTION 'Motorista sem autorização válida para o veículo na data do abastecimento'; END IF;
  IF vehicle.tank_capacity_l IS NULL THEN RAISE EXCEPTION 'Veículo sem capacidade de tanque válida'; END IF;
  IF NEW.liters>vehicle.tank_capacity_l THEN
    NEW.status:='COM_INCONSISTENCIA'; NEW.inconsistency_code:='LITROS_ACIMA_DA_CAPACIDADE';
    NEW.inconsistency_notes:=COALESCE(NEW.inconsistency_notes,'')||format(' Litros informados: %s; capacidade: %s.',NEW.liters,vehicle.tank_capacity_l);
  END IF;
  IF NEW.authorization_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.fleet_vehicle_authorizations a JOIN public.unidades_organizacionais u ON u.id=a.beneficiary_unit_id AND u.municipio_id=a.municipio_id AND u.ativo WHERE a.id=NEW.authorization_id AND a.municipio_id=NEW.municipio_id AND a.vehicle_id=NEW.vehicle_id AND a.responsible_unit_id=NEW.responsible_unit_id AND a.beneficiary_unit_id=NEW.beneficiary_unit_id AND a.status='APROVADA' AND a.authorized_by IS NOT NULL AND a.supporting_document_path IS NOT NULL AND NEW.performed_at BETWEEN a.valid_from AND a.valid_until) INTO auth_ok;
    IF NOT auth_ok THEN RAISE EXCEPTION 'Autorização de cessão inválida, incompatível com a unidade beneficiária ou fora da vigência'; END IF;
  END IF;
  IF (vehicle.operational_status::text='CEDIDO' OR (NEW.beneficiary_unit_id IS NOT NULL AND NEW.beneficiary_unit_id IS DISTINCT FROM NEW.responsible_unit_id)) AND NEW.authorization_id IS NULL THEN
    RAISE EXCEPTION 'Veículo cedido ou utilizado por outra secretaria exige autorização aprovada e vigente';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS fleet_fueling_validate_before_write ON public.fleet_fuelings;
CREATE TRIGGER fleet_fueling_validate_before_write
BEFORE INSERT OR UPDATE OF municipio_id,vehicle_id,driver_id,fuel_type_id,responsible_unit_id,beneficiary_unit_id,liters,performed_at,authorization_id
ON public.fleet_fuelings FOR EACH ROW EXECUTE FUNCTION public.fleet_validate_fueling();

DROP FUNCTION IF EXISTS public.fleet_supplier_vehicle_options(uuid);
CREATE FUNCTION public.fleet_supplier_vehicle_options(p_station_id uuid)
RETURNS TABLE (id uuid,placa text,marca text,modelo text,fuel_type_id uuid,responsible_unit_id uuid,tank_capacity_l numeric,current_odometer_km numeric,operational_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp
AS $$
BEGIN
  IF p_station_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id WHERE sm.station_id=p_station_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo AND s.municipio_id=public.fleet_current_municipio_id() AND s.status::text='ATIVO') THEN
    RAISE EXCEPTION 'Usuário não pertence a um posto ativo deste município' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT v.id,v.placa,v.marca,v.modelo,v.fuel_type_id,v.responsible_unit_id,v.tank_capacity_l,v.current_odometer_km,v.operational_status::text
  FROM public.fleet_vehicles v WHERE v.municipio_id=public.fleet_current_municipio_id() AND v.operational_status::text IN ('ATIVO','CEDIDO')
    AND NOT EXISTS (SELECT 1 FROM public.fleet_vehicle_restrictions r WHERE r.municipio_id=v.municipio_id AND r.vehicle_id=v.id AND r.active AND r.released_at IS NULL AND r.starts_at<=now() AND (r.ends_at IS NULL OR r.ends_at>now()))
  ORDER BY v.placa;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_driver_options(p_station_id uuid,p_vehicle_id uuid,p_performed_at timestamptz)
RETURNS TABLE (id uuid,nome text,matricula text,cnh_valid_until date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp
AS $$
DECLARE event_date date; target_vehicle public.fleet_vehicles%ROWTYPE;
BEGIN
  IF p_station_id IS NULL OR p_vehicle_id IS NULL OR p_performed_at IS NULL OR NOT EXISTS (SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id WHERE sm.station_id=p_station_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo AND s.municipio_id=public.fleet_current_municipio_id() AND s.status::text='ATIVO') THEN RAISE EXCEPTION 'Usuário, posto ou parâmetros inválidos' USING ERRCODE='42501'; END IF;
  event_date:=(p_performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT v.* INTO target_vehicle FROM public.fleet_vehicles v WHERE v.id=p_vehicle_id AND v.municipio_id=public.fleet_current_municipio_id();
  IF NOT FOUND OR target_vehicle.operational_status::text NOT IN ('ATIVO','CEDIDO') THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_vehicle_restrictions r WHERE r.municipio_id=target_vehicle.municipio_id AND r.vehicle_id=target_vehicle.id AND r.active AND r.released_at IS NULL AND r.starts_at<=p_performed_at AND (r.ends_at IS NULL OR r.ends_at>=p_performed_at)) THEN RETURN; END IF;
  RETURN QUERY WITH authorized(driver_id) AS (
    SELECT a.driver_id FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=target_vehicle.municipio_id AND a.vehicle_id=target_vehicle.id AND a.status='ATIVA' AND a.valid_from<=event_date AND (a.valid_until IS NULL OR a.valid_until>=event_date)
    UNION SELECT old.driver_id FROM public.fleet_vehicle_authorized_drivers old WHERE old.municipio_id=target_vehicle.municipio_id AND old.vehicle_id=target_vehicle.id AND old.ativo AND (old.valid_from IS NULL OR old.valid_from<=event_date) AND (old.valid_until IS NULL OR old.valid_until>=event_date)
  ) SELECT d.id,d.nome,d.matricula,d.cnh_valid_until FROM authorized a JOIN public.fleet_drivers d ON d.id=a.driver_id WHERE d.municipio_id=target_vehicle.municipio_id AND d.ativo AND d.cnh_valid_until>=event_date ORDER BY d.nome;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_authorization_options(p_station_id uuid,p_vehicle_id uuid,p_performed_at timestamptz)
RETURNS TABLE (id uuid,beneficiary_unit_id uuid,beneficiary_unit_name text,purpose text,valid_from timestamptz,valid_until timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,auth,pg_temp
AS $$
DECLARE target_vehicle public.fleet_vehicles%ROWTYPE;
BEGIN
  IF p_station_id IS NULL OR p_vehicle_id IS NULL OR p_performed_at IS NULL OR NOT EXISTS (SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id WHERE sm.station_id=p_station_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo AND s.municipio_id=public.fleet_current_municipio_id() AND s.status::text='ATIVO') THEN RAISE EXCEPTION 'Usuário, posto ou parâmetros inválidos' USING ERRCODE='42501'; END IF;
  SELECT v.* INTO target_vehicle FROM public.fleet_vehicles v WHERE v.id=p_vehicle_id AND v.municipio_id=public.fleet_current_municipio_id();
  IF NOT FOUND OR target_vehicle.operational_status::text NOT IN ('ATIVO','CEDIDO') THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_vehicle_restrictions r WHERE r.municipio_id=target_vehicle.municipio_id AND r.vehicle_id=target_vehicle.id AND r.active AND r.released_at IS NULL AND r.starts_at<=p_performed_at AND (r.ends_at IS NULL OR r.ends_at>=p_performed_at)) THEN RETURN; END IF;
  RETURN QUERY SELECT a.id,a.beneficiary_unit_id,u.nome,a.purpose,a.valid_from,a.valid_until
  FROM public.fleet_vehicle_authorizations a JOIN public.unidades_organizacionais u ON u.id=a.beneficiary_unit_id AND u.municipio_id=a.municipio_id AND u.ativo
  WHERE a.municipio_id=target_vehicle.municipio_id AND a.vehicle_id=target_vehicle.id AND a.responsible_unit_id=target_vehicle.responsible_unit_id
    AND a.status='APROVADA' AND a.authorized_by IS NOT NULL AND a.supporting_document_path IS NOT NULL AND p_performed_at BETWEEN a.valid_from AND a.valid_until ORDER BY a.valid_until,a.created_at;
END $$;

REVOKE ALL ON FUNCTION public.fleet_validate_vehicle_authorization_document() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_vehicle_authorization_write_history() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_supplier_vehicle_options(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_supplier_driver_options(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_supplier_authorization_options(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_vehicle_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_driver_options(uuid,uuid,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_authorization_options(uuid,uuid,timestamptz) TO authenticated;

COMMIT;
