-- Migração complementar do fluxo de abastecimentos, baseada nos §§4.1–4.23
-- do documento de apoio. Mantém o enum/coluna status legados para compatibilidade
-- com dashboard e fechamento enquanto acrescenta dimensões explícitas e auditáveis.
BEGIN;

-- Combustíveis que cada estabelecimento foi autorizado a fornecer.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_stations_municipio_id_id_uidx
  ON public.fleet_fuel_stations (municipio_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_fuelings_municipio_id_id_uidx
  ON public.fleet_fuelings (municipio_id,id);
CREATE TABLE IF NOT EXISTS public.fleet_station_fuel_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  station_id uuid NOT NULL,
  fuel_type_id uuid NOT NULL,
  active boolean NOT NULL DEFAULT true,
  valid_from date,
  valid_until date,
  configured_by integer REFERENCES public.usuarios(id),
  configured_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  CONSTRAINT fleet_station_fuel_types_dates CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until >= valid_from),
  CONSTRAINT fleet_station_fuel_types_station_fuel_key UNIQUE (station_id,fuel_type_id),
  CONSTRAINT fleet_station_fuel_types_station_tenant_fk FOREIGN KEY (municipio_id,station_id)
    REFERENCES public.fleet_fuel_stations(municipio_id,id),
  CONSTRAINT fleet_station_fuel_types_fuel_tenant_fk FOREIGN KEY (municipio_id,fuel_type_id)
    REFERENCES public.fleet_fuel_types(municipio_id,id)
);
CREATE INDEX IF NOT EXISTS fleet_station_fuel_types_lookup_idx
  ON public.fleet_station_fuel_types (municipio_id,station_id,active,fuel_type_id);
ALTER TABLE public.fleet_station_fuel_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fleet_station_fuel_types_manager ON public.fleet_station_fuel_types;
DROP POLICY IF EXISTS fleet_station_fuel_types_station_read ON public.fleet_station_fuel_types;
CREATE POLICY fleet_station_fuel_types_manager ON public.fleet_station_fuel_types
  FOR ALL TO authenticated USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager())
  WITH CHECK (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_station_fuel_types_station_read ON public.fleet_station_fuel_types
  FOR SELECT TO authenticated USING (municipio_id=public.fleet_current_municipio_id() AND EXISTS (
    SELECT 1 FROM public.fleet_station_members sm WHERE sm.station_id=fleet_station_fuel_types.station_id
      AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo));

-- Backfill restrito às combinações já utilizadas pelos dados demonstrativos.
INSERT INTO public.fleet_station_fuel_types(municipio_id,station_id,fuel_type_id,active,configured_at,notes)
SELECT DISTINCT f.municipio_id,f.station_id,f.fuel_type_id,true,clock_timestamp(),
       'Backfill de combinação existente em registros fictícios legados; validar credenciamento real antes de produção.'
FROM public.fleet_fuelings f
JOIN public.fleet_fuel_stations s ON s.id=f.station_id AND s.municipio_id=f.municipio_id
JOIN public.fleet_fuel_types ft ON ft.id=f.fuel_type_id AND ft.municipio_id=f.municipio_id
ON CONFLICT (station_id,fuel_type_id) DO NOTHING;

-- Metadados explícitos da operação: submitted_at continua sendo o nome legado
-- da data de gravação; recorded_at é seu equivalente documentado.
ALTER TABLE public.fleet_fuelings
  ADD COLUMN IF NOT EXISTS protocol_number text,
  ADD COLUMN IF NOT EXISTS recorded_at timestamptz,
  ADD COLUMN IF NOT EXISTS entry_type text,
  ADD COLUMN IF NOT EXISTS record_origin text,
  ADD COLUMN IF NOT EXISTS late_entry_reason text,
  ADD COLUMN IF NOT EXISTS idempotency_key uuid,
  ADD COLUMN IF NOT EXISTS operational_status text,
  ADD COLUMN IF NOT EXISTS review_status text,
  ADD COLUMN IF NOT EXISTS review_pending_reason text;
ALTER TABLE public.fleet_fuelings
  ALTER COLUMN recorded_at SET DEFAULT clock_timestamp(),
  ALTER COLUMN entry_type SET DEFAULT 'NORMAL',
  ALTER COLUMN record_origin SET DEFAULT 'POSTO',
  ALTER COLUMN operational_status SET DEFAULT 'REGISTRADO',
  ALTER COLUMN review_status SET DEFAULT 'PENDENTE_DE_CONFERENCIA';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_fuelings'::regclass AND conname='fleet_fuelings_entry_type_check') THEN
    ALTER TABLE public.fleet_fuelings ADD CONSTRAINT fleet_fuelings_entry_type_check CHECK (entry_type IN ('NORMAL','POSTERIOR','LEGADO')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_fuelings'::regclass AND conname='fleet_fuelings_record_origin_check') THEN
    ALTER TABLE public.fleet_fuelings ADD CONSTRAINT fleet_fuelings_record_origin_check CHECK (record_origin IN ('POSTO','MUNICIPIO','MIGRACAO')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_fuelings'::regclass AND conname='fleet_fuelings_operational_status_check') THEN
    ALTER TABLE public.fleet_fuelings ADD CONSTRAINT fleet_fuelings_operational_status_check CHECK (operational_status IN ('RASCUNHO','REGISTRADO','AGUARDANDO_COMPLEMENTACAO','SINALIZADO','CANCELADO')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_fuelings'::regclass AND conname='fleet_fuelings_review_status_check') THEN
    ALTER TABLE public.fleet_fuelings ADD CONSTRAINT fleet_fuelings_review_status_check CHECK (review_status IN ('PENDENTE_DE_CONFERENCIA','EM_ANALISE','CONFERIDO','COM_PENDENCIA','CONTESTADO','REGULARIZADO','ENCERRADO_NO_FECHAMENTO')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_fuelings'::regclass AND conname='fleet_fuelings_protocol_number_key') THEN
    ALTER TABLE public.fleet_fuelings ADD CONSTRAINT fleet_fuelings_protocol_number_key UNIQUE (protocol_number);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.fleet_fuelings'::regclass AND conname='fleet_fuelings_municipio_id_idempotency_key_key') THEN
    ALTER TABLE public.fleet_fuelings ADD CONSTRAINT fleet_fuelings_municipio_id_idempotency_key_key UNIQUE (municipio_id,idempotency_key);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS fleet_fuelings_protocol_idx ON public.fleet_fuelings(municipio_id,protocol_number);
CREATE INDEX IF NOT EXISTS fleet_fuelings_review_idx ON public.fleet_fuelings(municipio_id,review_status,performed_at DESC);
CREATE INDEX IF NOT EXISTS fleet_fuelings_entry_type_idx ON public.fleet_fuelings(municipio_id,entry_type,recorded_at DESC);

-- Política municipal configurável, com valores conservadores por padrão.
CREATE TABLE IF NOT EXISTS public.fleet_fueling_policies (
  municipio_id uuid PRIMARY KEY REFERENCES public.municipios(id),
  normal_entry_window_minutes integer NOT NULL DEFAULT 30 CHECK (normal_entry_window_minutes BETWEEN 0 AND 1440),
  max_posterior_days integer NOT NULL DEFAULT 30 CHECK (max_posterior_days BETWEEN 1 AND 365),
  future_tolerance_minutes integer NOT NULL DEFAULT 5 CHECK (future_tolerance_minutes BETWEEN 0 AND 60),
  require_late_reason boolean NOT NULL DEFAULT true,
  short_interval_minutes integer NOT NULL DEFAULT 60 CHECK (short_interval_minutes BETWEEN 1 AND 1440),
  odometer_tolerance_km numeric(12,2) NOT NULL DEFAULT 0 CHECK (odometer_tolerance_km >= 0),
  price_deviation_percent numeric(8,2) NOT NULL DEFAULT 20 CHECK (price_deviation_percent BETWEEN 0 AND 500),
  usual_start_hour smallint NOT NULL DEFAULT 6 CHECK (usual_start_hour BETWEEN 0 AND 23),
  usual_end_hour smallint NOT NULL DEFAULT 22 CHECK (usual_end_hour BETWEEN 0 AND 23),
  price_reference_per_liter numeric(12,4),
  updated_by integer REFERENCES public.usuarios(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.fleet_fueling_policies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fleet_fueling_policies_manager ON public.fleet_fueling_policies;
CREATE POLICY fleet_fueling_policies_manager ON public.fleet_fueling_policies
  FOR ALL TO authenticated USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager())
  WITH CHECK (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
INSERT INTO public.fleet_fueling_policies(municipio_id)
SELECT DISTINCT municipio_id FROM public.fleet_fuelings ON CONFLICT (municipio_id) DO NOTHING;

-- Trilha append-only, avaliações e solicitações formais de ajuste.
CREATE TABLE IF NOT EXISTS public.fleet_fueling_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  fueling_id uuid NOT NULL REFERENCES public.fleet_fuelings(id), event_type text NOT NULL,
  field_name text, old_value jsonb, new_value jsonb, reason text,
  performed_by integer REFERENCES public.usuarios(id), actor_type text NOT NULL DEFAULT 'USUARIO',
  approved_by integer REFERENCES public.usuarios(id), performed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS fleet_fueling_audit_fueling_idx ON public.fleet_fueling_audit(municipio_id,fueling_id,performed_at DESC);
CREATE TABLE IF NOT EXISTS public.fleet_fueling_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  fueling_id uuid NOT NULL REFERENCES public.fleet_fuelings(id), review_status text NOT NULL,
  reviewer_id integer REFERENCES public.usuarios(id), reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  notes text, pending_reason text, document_id uuid REFERENCES public.fleet_fueling_documents(id)
);
CREATE INDEX IF NOT EXISTS fleet_fueling_reviews_fueling_idx ON public.fleet_fueling_reviews(municipio_id,fueling_id,reviewed_at DESC);
CREATE TABLE IF NOT EXISTS public.fleet_fueling_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  fueling_id uuid NOT NULL REFERENCES public.fleet_fuelings(id), requested_by integer NOT NULL REFERENCES public.usuarios(id),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(), reason text NOT NULL,
  proposed_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_status text NOT NULL DEFAULT 'PENDENTE' CHECK (approval_status IN ('PENDENTE','APROVADA','REJEITADA')),
  reviewed_by integer REFERENCES public.usuarios(id), reviewed_at timestamptz, decision_notes text,
  CHECK (btrim(reason) <> ''), CHECK (jsonb_typeof(proposed_changes)='object')
);
CREATE INDEX IF NOT EXISTS fleet_fueling_adjustments_pending_idx ON public.fleet_fueling_adjustments(municipio_id,approval_status,requested_at DESC);
ALTER TABLE public.fleet_fueling_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_fueling_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_fueling_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_fueling_status_history ALTER COLUMN changed_by DROP NOT NULL;
DROP POLICY IF EXISTS fleet_status_history_manager ON public.fleet_fueling_status_history;
DROP POLICY IF EXISTS fleet_fueling_audit_manager_read ON public.fleet_fueling_audit;
DROP POLICY IF EXISTS fleet_fueling_audit_station_read ON public.fleet_fueling_audit;
DROP POLICY IF EXISTS fleet_fueling_reviews_manager_read ON public.fleet_fueling_reviews;
DROP POLICY IF EXISTS fleet_fueling_reviews_station_read ON public.fleet_fueling_reviews;
DROP POLICY IF EXISTS fleet_fueling_adjustments_manager_read ON public.fleet_fueling_adjustments;
DROP POLICY IF EXISTS fleet_fueling_adjustments_station_read ON public.fleet_fueling_adjustments;
CREATE POLICY fleet_status_history_manager_read ON public.fleet_fueling_status_history FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_status_history_station_read ON public.fleet_fueling_status_history FOR SELECT TO authenticated USING (
  municipio_id=public.fleet_current_municipio_id() AND EXISTS (SELECT 1 FROM public.fleet_fuelings f JOIN public.fleet_station_members sm ON sm.station_id=f.station_id WHERE f.id=fueling_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo));
CREATE POLICY fleet_fueling_audit_manager_read ON public.fleet_fueling_audit FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_fueling_audit_station_read ON public.fleet_fueling_audit FOR SELECT TO authenticated USING (
  municipio_id=public.fleet_current_municipio_id() AND EXISTS (SELECT 1 FROM public.fleet_fuelings f JOIN public.fleet_station_members sm ON sm.station_id=f.station_id WHERE f.id=fueling_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo));
CREATE POLICY fleet_fueling_reviews_manager_read ON public.fleet_fueling_reviews FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_fueling_reviews_station_read ON public.fleet_fueling_reviews FOR SELECT TO authenticated USING (
  municipio_id=public.fleet_current_municipio_id() AND EXISTS (SELECT 1 FROM public.fleet_fuelings f JOIN public.fleet_station_members sm ON sm.station_id=f.station_id WHERE f.id=fueling_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo));
CREATE POLICY fleet_fueling_adjustments_manager_read ON public.fleet_fueling_adjustments FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_fueling_adjustments_station_read ON public.fleet_fueling_adjustments FOR SELECT TO authenticated USING (
  municipio_id=public.fleet_current_municipio_id() AND EXISTS (SELECT 1 FROM public.fleet_fuelings f JOIN public.fleet_station_members sm ON sm.station_id=f.station_id WHERE f.id=fueling_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo));

-- Documento fiscal: tipo e observação; prazo sempre calculado do horário efetivo.
ALTER TABLE public.fleet_fueling_documents
  ADD COLUMN IF NOT EXISTS document_type text NOT NULL DEFAULT 'COMPROVANTE_DE_ABASTECIMENTO',
  ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.fleet_fueling_documents
  ADD CONSTRAINT fleet_fueling_documents_max_size CHECK (file_size_bytes<=10485760) NOT VALID;
ALTER TABLE public.fleet_fueling_documents
  ADD CONSTRAINT fleet_fueling_documents_mime_allowed CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')) NOT VALID;
CREATE INDEX IF NOT EXISTS fleet_fueling_documents_type_idx ON public.fleet_fueling_documents(municipio_id,fueling_id,document_type,uploaded_at DESC);

-- Backfill do legado demonstrativo, sem criar documentos fiscais fictícios.
WITH prior AS (
  SELECT f.id,f.municipio_id,f.status AS old_status,f.submitted_at,f.created_at,
         EXISTS (SELECT 1 FROM public.fleet_fueling_documents d WHERE d.fueling_id=f.id AND d.is_current AND d.document_status='ACEITO') AS has_accepted_document
  FROM public.fleet_fuelings f
)
UPDATE public.fleet_fuelings f SET
  protocol_number=COALESCE(f.protocol_number,'AB-'||to_char(COALESCE(f.submitted_at,f.created_at) AT TIME ZONE 'America/Sao_Paulo','YYYYMMDD')||'-'||upper(substr(replace(f.id::text,'-',''),1,8))),
  recorded_at=COALESCE(f.recorded_at,f.submitted_at,f.created_at),
  entry_type='LEGADO',record_origin='MIGRACAO',
  operational_status=CASE WHEN f.status='CANCELADO' THEN 'CANCELADO' WHEN f.status IN ('PENDENTE_DE_COMPROVANTE','SOLICITADA_CORRECAO') THEN 'AGUARDANDO_COMPLEMENTACAO' WHEN f.status='COM_INCONSISTENCIA' THEN 'SINALIZADO' ELSE 'REGISTRADO' END,
  review_status=CASE WHEN f.status='CANCELADO' THEN 'COM_PENDENCIA' WHEN f.status='CONFERIDO' AND prior.has_accepted_document THEN 'CONFERIDO' WHEN f.status='INCLUIDO_NO_FECHAMENTO' AND prior.has_accepted_document THEN 'ENCERRADO_NO_FECHAMENTO' WHEN f.status='EM_ANALISE' THEN 'EM_ANALISE' WHEN f.status='SOLICITADA_CORRECAO' THEN 'CONTESTADO' WHEN f.status='CORRIGIDO' THEN 'REGULARIZADO' WHEN f.status='COM_INCONSISTENCIA' THEN 'COM_PENDENCIA' WHEN f.status='PENDENTE_DE_COMPROVANTE' THEN 'COM_PENDENCIA' WHEN f.status='CONFERIDO' AND NOT prior.has_accepted_document THEN 'COM_PENDENCIA' ELSE 'PENDENTE_DE_CONFERENCIA' END,
  review_pending_reason=CASE WHEN f.status='CONFERIDO' AND NOT prior.has_accepted_document THEN 'Migração de registro fictício legado: marcado como pendente porque não há comprovante atual aceito.' WHEN f.driver_id IS NULL THEN 'Registro legado sem motorista associado; requer regularização municipal.' ELSE f.review_pending_reason END,
  status=CASE WHEN f.status='CONFERIDO' AND NOT prior.has_accepted_document THEN 'PENDENTE_DE_COMPROVANTE'::public.fleet_fueling_status WHEN f.driver_id IS NULL AND f.status NOT IN ('CANCELADO','INCLUIDO_NO_FECHAMENTO') THEN 'COM_INCONSISTENCIA'::public.fleet_fueling_status ELSE f.status END,
  inconsistency_code=CASE WHEN f.driver_id IS NULL THEN COALESCE(f.inconsistency_code,'MOTORISTA_AUSENTE') ELSE f.inconsistency_code END,
  inconsistency_notes=CASE WHEN f.driver_id IS NULL THEN concat_ws(' ',f.inconsistency_notes,'Registro legado sem motorista; não atribuído automaticamente.') ELSE f.inconsistency_notes END
FROM prior WHERE prior.id=f.id;
UPDATE public.fleet_fueling_documents d SET due_at=f.performed_at+interval '24 hours'
FROM public.fleet_fuelings f WHERE d.fueling_id=f.id AND d.due_at IS DISTINCT FROM f.performed_at+interval '24 hours';

-- Migração explícita e auditável dos registros legados cujo estado CONFERIDO
-- não tinha comprovante aceito. changed_by nulo identifica automação de migração.
INSERT INTO public.fleet_fueling_audit(municipio_id,fueling_id,event_type,field_name,old_value,new_value,reason,actor_type,performed_at)
SELECT f.municipio_id,f.id,'MIGRACAO_LEGADO','status',to_jsonb('CONFERIDO'::text),to_jsonb('PENDENTE_DE_COMPROVANTE'::text),
       'Registro demonstrativo sem comprovante atual aceito; conferência reaberta para não atestar evidência inexistente.','SISTEMA',clock_timestamp()
FROM public.fleet_fuelings f WHERE f.status='PENDENTE_DE_COMPROVANTE' AND f.entry_type='LEGADO'
  AND f.review_pending_reason ILIKE 'Migração de registro fictício legado:%';
INSERT INTO public.fleet_fueling_status_history(municipio_id,fueling_id,previous_status,new_status,reason,notes,changed_by,changed_at)
SELECT f.municipio_id,f.id,'CONFERIDO'::public.fleet_fueling_status,f.status,
       'Migração demonstrativa: comprovante ausente; conferência reaberta.',f.review_pending_reason,NULL,clock_timestamp()
FROM public.fleet_fuelings f WHERE f.status='PENDENTE_DE_COMPROVANTE' AND f.entry_type='LEGADO'
  AND f.review_pending_reason ILIKE 'Migração de registro fictício legado:%';
INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description)
SELECT f.municipio_id,f.id,f.vehicle_id,'MOTORISTA_AUSENTE','BLOQUEIO','Motorista não identificado no registro legado','Registro fictício legado sem motorista associado. Não atribuído automaticamente; corrigir por solicitação formal antes da conferência.'
FROM public.fleet_fuelings f WHERE f.driver_id IS NULL AND f.status<>'CANCELADO'
ON CONFLICT DO NOTHING;
INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description)
SELECT f.municipio_id,f.id,f.vehicle_id,'MOTORISTA_NAO_AUTORIZADO','BLOQUEIO','Motorista legado sem CNH/autorização válida','O motorista associado não atende simultaneamente aos requisitos de ativo, CNH vigente e autorização para o veículo na data efetiva.'
FROM public.fleet_fuelings f WHERE f.driver_id IS NOT NULL AND f.status<>'CANCELADO' AND NOT EXISTS(
  SELECT 1 FROM public.fleet_drivers d WHERE d.id=f.driver_id AND d.municipio_id=f.municipio_id AND d.ativo AND d.cnh_valid_until >= (f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date
  AND (EXISTS(SELECT 1 FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=f.municipio_id AND a.vehicle_id=f.vehicle_id AND a.driver_id=f.driver_id AND a.status='ATIVA' AND a.valid_from<=(f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date AND (a.valid_until IS NULL OR a.valid_until>=(f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date))
    OR EXISTS(SELECT 1 FROM public.fleet_vehicle_authorized_drivers old WHERE old.municipio_id=f.municipio_id AND old.vehicle_id=f.vehicle_id AND old.driver_id=f.driver_id AND old.ativo AND (old.valid_from IS NULL OR old.valid_from<=(f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date) AND (old.valid_until IS NULL OR old.valid_until>=(f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date)))
)
ON CONFLICT DO NOTHING;

-- RPC de opções de combustível: a autorização por estabelecimento e a compatibilidade
-- com o veículo são aplicadas no backend, nunca somente na interface.
CREATE OR REPLACE FUNCTION public.fleet_supplier_fuel_options(p_station_id uuid,p_vehicle_id uuid DEFAULT NULL,p_performed_at timestamptz DEFAULT clock_timestamp())
RETURNS TABLE(id uuid,nome text,sigla text,unidade_medida text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id(); v_event_date date;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL OR p_performed_at IS NULL THEN RAISE EXCEPTION 'Sessão autenticada e data efetiva são necessárias' USING ERRCODE='42501'; END IF;
  v_event_date:=(p_performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
  IF NOT public.fleet_is_manager() AND NOT EXISTS (SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id WHERE sm.usuario_id=v_usuario AND sm.station_id=p_station_id AND sm.municipio_id=v_municipio AND sm.ativo AND s.status='ATIVO') THEN
    RAISE EXCEPTION 'Usuário sem vínculo ativo com este estabelecimento' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT ft.id,ft.nome,ft.sigla,ft.unidade_medida
    FROM public.fleet_station_fuel_types sf JOIN public.fleet_fuel_stations s ON s.id=sf.station_id AND s.municipio_id=sf.municipio_id
    JOIN public.fleet_fuel_types ft ON ft.id=sf.fuel_type_id AND ft.municipio_id=sf.municipio_id
    WHERE sf.municipio_id=v_municipio AND sf.station_id=p_station_id AND sf.active AND ft.ativo AND s.status='ATIVO'
      AND (sf.valid_from IS NULL OR sf.valid_from<=v_event_date) AND (sf.valid_until IS NULL OR sf.valid_until>=v_event_date)
      AND (p_vehicle_id IS NULL OR EXISTS (SELECT 1 FROM public.fleet_vehicles v WHERE v.id=p_vehicle_id AND v.municipio_id=v_municipio AND v.fuel_type_id=ft.id))
    ORDER BY ft.nome;
END $$;

-- RPCs do posto também reconhecem cessões e consultam a lotação histórica,
-- sem confiar em identificadores de município enviados pelo navegador.
DROP FUNCTION IF EXISTS public.fleet_supplier_vehicle_options(uuid);
CREATE FUNCTION public.fleet_supplier_vehicle_options(p_station_id uuid)
RETURNS TABLE(id uuid,placa text,marca text,modelo text,fuel_type_id uuid,responsible_unit_id uuid,tank_capacity_l numeric,current_odometer_km numeric,operational_status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','auth','pg_temp' AS $$
BEGIN
  IF p_station_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id WHERE sm.station_id=p_station_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo AND s.municipio_id=public.fleet_current_municipio_id() AND s.status='ATIVO') THEN
    RAISE EXCEPTION 'Usuário não pertence a um posto ativo deste município' USING ERRCODE='42501';
  END IF;
  RETURN QUERY SELECT v.id,v.placa,v.marca,v.modelo,v.fuel_type_id,v.responsible_unit_id,v.tank_capacity_l,v.current_odometer_km,v.operational_status::text
    FROM public.fleet_vehicles v WHERE v.municipio_id=public.fleet_current_municipio_id() AND v.operational_status::text IN ('ATIVO','CEDIDO') ORDER BY v.placa;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_vehicle_unit_at(p_station_id uuid,p_vehicle_id uuid,p_performed_at timestamptz)
RETURNS TABLE(responsible_unit_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','auth','pg_temp' AS $$
DECLARE v public.fleet_vehicles%ROWTYPE;
BEGIN
  IF p_station_id IS NULL OR p_vehicle_id IS NULL OR p_performed_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id WHERE sm.station_id=p_station_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo AND s.municipio_id=public.fleet_current_municipio_id() AND s.status='ATIVO') THEN
    RAISE EXCEPTION 'Usuário, posto ou parâmetros inválidos' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v FROM public.fleet_vehicles WHERE id=p_vehicle_id AND municipio_id=public.fleet_current_municipio_id() AND operational_status::text IN ('ATIVO','CEDIDO');
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY SELECT COALESCE((SELECT h.to_unit_id FROM public.fleet_vehicle_department_history h WHERE h.municipio_id=v.municipio_id AND h.vehicle_id=v.id AND h.started_at<=p_performed_at AND (h.ended_at IS NULL OR h.ended_at>p_performed_at) ORDER BY h.started_at DESC LIMIT 1),v.responsible_unit_id);
END $$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_driver_options(p_station_id uuid,p_vehicle_id uuid,p_performed_at timestamptz)
RETURNS TABLE(id uuid,nome text,matricula text,cnh_valid_until date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','auth','pg_temp' AS $$
DECLARE event_date date; target_vehicle public.fleet_vehicles%ROWTYPE;
BEGIN
  IF p_station_id IS NULL OR p_vehicle_id IS NULL OR p_performed_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id WHERE sm.station_id=p_station_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo AND s.municipio_id=public.fleet_current_municipio_id() AND s.status='ATIVO') THEN RAISE EXCEPTION 'Usuário, posto ou parâmetros inválidos' USING ERRCODE='42501'; END IF;
  event_date:=(p_performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT v.* INTO target_vehicle FROM public.fleet_vehicles v WHERE v.id=p_vehicle_id AND v.municipio_id=public.fleet_current_municipio_id();
  IF NOT FOUND OR target_vehicle.operational_status::text NOT IN ('ATIVO','CEDIDO') THEN RETURN; END IF;
  IF EXISTS(SELECT 1 FROM public.fleet_vehicle_restrictions r WHERE r.municipio_id=target_vehicle.municipio_id AND r.vehicle_id=target_vehicle.id AND r.active AND r.released_at IS NULL AND r.starts_at<=p_performed_at AND (r.ends_at IS NULL OR r.ends_at>=p_performed_at)) THEN RETURN; END IF;
  RETURN QUERY WITH authorized(driver_id) AS (
    SELECT a.driver_id FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=target_vehicle.municipio_id AND a.vehicle_id=target_vehicle.id AND a.status='ATIVA' AND a.valid_from<=event_date AND (a.valid_until IS NULL OR a.valid_until>=event_date)
    UNION SELECT old.driver_id FROM public.fleet_vehicle_authorized_drivers old WHERE old.municipio_id=target_vehicle.municipio_id AND old.vehicle_id=target_vehicle.id AND old.ativo AND (old.valid_from IS NULL OR old.valid_from<=event_date) AND (old.valid_until IS NULL OR old.valid_until>=event_date)
  ) SELECT d.id,d.nome,d.matricula,d.cnh_valid_until FROM authorized a JOIN public.fleet_drivers d ON d.id=a.driver_id WHERE d.municipio_id=target_vehicle.municipio_id AND d.ativo AND d.cnh_valid_until>=event_date ORDER BY d.nome;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_authorization_options(p_station_id uuid,p_vehicle_id uuid,p_performed_at timestamptz)
RETURNS TABLE(id uuid,beneficiary_unit_id uuid,beneficiary_unit_name text,purpose text,valid_from timestamptz,valid_until timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','auth','pg_temp' AS $$
DECLARE target_vehicle public.fleet_vehicles%ROWTYPE; effective_unit uuid;
BEGIN
  IF p_station_id IS NULL OR p_vehicle_id IS NULL OR p_performed_at IS NULL OR NOT EXISTS(SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id WHERE sm.station_id=p_station_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo AND s.municipio_id=public.fleet_current_municipio_id() AND s.status='ATIVO') THEN RAISE EXCEPTION 'Usuário, posto ou parâmetros inválidos' USING ERRCODE='42501'; END IF;
  SELECT v.* INTO target_vehicle FROM public.fleet_vehicles v WHERE v.id=p_vehicle_id AND v.municipio_id=public.fleet_current_municipio_id() AND v.operational_status::text IN ('ATIVO','CEDIDO');
  IF NOT FOUND OR EXISTS(SELECT 1 FROM public.fleet_vehicle_restrictions r WHERE r.municipio_id=target_vehicle.municipio_id AND r.vehicle_id=target_vehicle.id AND r.active AND r.released_at IS NULL AND r.starts_at<=p_performed_at AND (r.ends_at IS NULL OR r.ends_at>=p_performed_at)) THEN RETURN; END IF;
  SELECT COALESCE((SELECT h.to_unit_id FROM public.fleet_vehicle_department_history h WHERE h.municipio_id=target_vehicle.municipio_id AND h.vehicle_id=target_vehicle.id AND h.started_at<=p_performed_at AND (h.ended_at IS NULL OR h.ended_at>p_performed_at) ORDER BY h.started_at DESC LIMIT 1),target_vehicle.responsible_unit_id) INTO effective_unit;
  RETURN QUERY SELECT a.id,a.beneficiary_unit_id,u.nome,a.purpose,a.valid_from,a.valid_until FROM public.fleet_vehicle_authorizations a JOIN public.unidades_organizacionais u ON u.id=a.beneficiary_unit_id AND u.municipio_id=a.municipio_id AND u.ativo WHERE a.municipio_id=target_vehicle.municipio_id AND a.vehicle_id=target_vehicle.id AND a.responsible_unit_id=effective_unit AND a.status='APROVADA' AND a.authorized_by IS NOT NULL AND a.supporting_document_path IS NOT NULL AND p_performed_at BETWEEN a.valid_from AND a.valid_until ORDER BY a.valid_until,a.created_at;
END $$;

REVOKE ALL ON FUNCTION public.fleet_supplier_vehicle_options(uuid),public.fleet_supplier_vehicle_unit_at(uuid,uuid,timestamptz),public.fleet_supplier_driver_options(uuid,uuid,timestamptz),public.fleet_supplier_authorization_options(uuid,uuid,timestamptz),public.fleet_supplier_fuel_options(uuid,uuid,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_vehicle_options(uuid),public.fleet_supplier_vehicle_unit_at(uuid,uuid,timestamptz),public.fleet_supplier_driver_options(uuid,uuid,timestamptz),public.fleet_supplier_authorization_options(uuid,uuid,timestamptz),public.fleet_supplier_fuel_options(uuid,uuid,timestamptz) TO authenticated;

-- Trigger de integridade: usuário, posto, produto autorizado, veículo/motorista,
-- unidade histórica, vigência e janela temporal. Alertas não essenciais não bloqueiam.
CREATE OR REPLACE FUNCTION public.fleet_validate_fueling()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE
  v_vehicle public.fleet_vehicles%ROWTYPE; v_driver public.fleet_drivers%ROWTYPE;
  v_station public.fleet_fuel_stations%ROWTYPE; v_auth_ok boolean:=false;
  v_event_date date; v_recorded timestamptz:=clock_timestamp(); v_expected_unit uuid;
  v_policy public.fleet_fueling_policies%ROWTYPE; v_lag interval;
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.recorded_at:=v_recorded; NEW.submitted_at:=v_recorded;
    IF NEW.protocol_number IS NULL OR btrim(NEW.protocol_number)='' THEN
      NEW.protocol_number:='AB-'||to_char(v_recorded AT TIME ZONE 'America/Sao_Paulo','YYYYMMDD')||'-'||upper(substr(replace(COALESCE(NEW.id,gen_random_uuid())::text,'-',''),1,8));
    END IF;
  ELSIF NEW.recorded_at IS DISTINCT FROM OLD.recorded_at OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at OR NEW.protocol_number IS DISTINCT FROM OLD.protocol_number OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.municipio_id IS DISTINCT FROM OLD.municipio_id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    IF NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Campos imutáveis do abastecimento não podem ser alterados'; END IF;
  END IF;
  IF NEW.liters<=0 OR NEW.unit_price<=0 OR NEW.odometer_km<0 THEN RAISE EXCEPTION 'Quantidade, preço e hodômetro devem ser válidos'; END IF;
  SELECT * INTO v_policy FROM public.fleet_fueling_policies WHERE municipio_id=NEW.municipio_id;
  IF NOT FOUND THEN v_policy.normal_entry_window_minutes:=30; v_policy.max_posterior_days:=30; v_policy.future_tolerance_minutes:=5; v_policy.require_late_reason:=true; END IF;
  IF NEW.performed_at>clock_timestamp()+make_interval(mins=>COALESCE(v_policy.future_tolerance_minutes,5)) THEN RAISE EXCEPTION 'A data/hora efetiva do abastecimento não pode estar no futuro'; END IF;
  v_lag:=clock_timestamp()-NEW.performed_at;
  IF TG_OP='INSERT' THEN
    IF v_lag>make_interval(days=>COALESCE(v_policy.max_posterior_days,30)) AND NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Prazo máximo para lançamento posterior excedido; solicite autorização municipal'; END IF;
    IF v_lag>make_interval(mins=>COALESCE(v_policy.normal_entry_window_minutes,30)) THEN
      NEW.entry_type:='POSTERIOR';
      IF COALESCE(v_policy.require_late_reason,true) AND NULLIF(btrim(NEW.late_entry_reason),'') IS NULL THEN RAISE EXCEPTION 'Informe justificativa para lançamento posterior'; END IF;
    ELSE NEW.entry_type:=COALESCE(NEW.entry_type,'NORMAL'); END IF;
  END IF;
  IF NEW.entry_type='POSTERIOR' AND NULLIF(btrim(NEW.late_entry_reason),'') IS NULL THEN RAISE EXCEPTION 'Lançamento posterior exige justificativa'; END IF;
  v_event_date:=(NEW.performed_at AT TIME ZONE 'America/Sao_Paulo')::date;
  SELECT * INTO v_station FROM public.fleet_fuel_stations s WHERE s.id=NEW.station_id AND s.municipio_id=NEW.municipio_id FOR SHARE;
  IF NOT FOUND OR v_station.status<>'ATIVO' THEN RAISE EXCEPTION 'Estabelecimento inexistente, inativo ou fora do município'; END IF;
  IF v_station.credenciamento_ends_at IS NOT NULL AND v_station.credenciamento_ends_at<v_event_date THEN RAISE EXCEPTION 'Credenciamento do estabelecimento expirado na data da operação'; END IF;
  IF TG_OP='INSERT' AND NOT public.fleet_is_manager() AND (NEW.record_origin<>'POSTO' OR NEW.created_by IS DISTINCT FROM public.fleet_current_usuario_id() OR NOT EXISTS (SELECT 1 FROM public.fleet_station_members sm WHERE sm.station_id=NEW.station_id AND sm.municipio_id=NEW.municipio_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo)) THEN RAISE EXCEPTION 'Usuário não possui vínculo ativo com o posto informado ou origem municipal não autorizada' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_vehicle FROM public.fleet_vehicles v WHERE v.id=NEW.vehicle_id AND v.municipio_id=NEW.municipio_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Veículo inexistente ou fora do município do abastecimento'; END IF;
  IF v_vehicle.operational_status::text IN ('INATIVO','EM_MANUTENCAO','BAIXADO','ALIENADO') THEN RAISE EXCEPTION 'Veículo indisponível para abastecimento'; END IF;
  SELECT dh.to_unit_id INTO v_expected_unit FROM public.fleet_vehicle_department_history dh WHERE dh.municipio_id=NEW.municipio_id AND dh.vehicle_id=NEW.vehicle_id AND dh.started_at<=NEW.performed_at AND (dh.ended_at IS NULL OR dh.ended_at>NEW.performed_at) ORDER BY dh.started_at DESC LIMIT 1;
  v_expected_unit:=COALESCE(v_expected_unit,v_vehicle.responsible_unit_id);
  IF NEW.responsible_unit_id IS DISTINCT FROM v_expected_unit THEN RAISE EXCEPTION 'Unidade responsável não corresponde à lotação do veículo na data da operação'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.unidades_organizacionais u WHERE u.id=NEW.responsible_unit_id AND u.municipio_id=NEW.municipio_id) THEN RAISE EXCEPTION 'Unidade responsável fora do município'; END IF;
  IF NEW.beneficiary_unit_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.unidades_organizacionais u WHERE u.id=NEW.beneficiary_unit_id AND u.municipio_id=NEW.municipio_id) THEN RAISE EXCEPTION 'Unidade beneficiária fora do município'; END IF;
  IF v_vehicle.fuel_type_id IS NULL OR v_vehicle.fuel_type_id IS DISTINCT FROM NEW.fuel_type_id OR NOT EXISTS (SELECT 1 FROM public.fleet_fuel_types ft WHERE ft.id=NEW.fuel_type_id AND ft.municipio_id=NEW.municipio_id AND ft.ativo) THEN RAISE EXCEPTION 'Combustível incompatível ou inativo para o veículo'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fleet_station_fuel_types sf WHERE sf.municipio_id=NEW.municipio_id AND sf.station_id=NEW.station_id AND sf.fuel_type_id=NEW.fuel_type_id AND sf.active AND (sf.valid_from IS NULL OR sf.valid_from<=v_event_date) AND (sf.valid_until IS NULL OR sf.valid_until>=v_event_date)) THEN RAISE EXCEPTION 'Combustível não autorizado para este estabelecimento na data da operação'; END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_vehicle_restrictions r WHERE r.municipio_id=NEW.municipio_id AND r.vehicle_id=NEW.vehicle_id AND r.active AND r.released_at IS NULL AND r.starts_at<=NEW.performed_at AND (r.ends_at IS NULL OR r.ends_at>=NEW.performed_at)) THEN RAISE EXCEPTION 'Veículo possui bloqueio temporário ativo na data do abastecimento'; END IF;
  IF NEW.driver_id IS NULL THEN RAISE EXCEPTION 'Motorista autorizado é obrigatório para abastecimento'; END IF;
  SELECT * INTO v_driver FROM public.fleet_drivers d WHERE d.id=NEW.driver_id AND d.municipio_id=NEW.municipio_id;
  IF NOT FOUND OR NOT v_driver.ativo THEN RAISE EXCEPTION 'Motorista inexistente ou inativo'; END IF;
  IF v_driver.cnh_valid_until IS NULL OR v_driver.cnh_valid_until<v_event_date THEN RAISE EXCEPTION 'CNH do motorista inválida na data do abastecimento'; END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=NEW.municipio_id AND a.vehicle_id=NEW.vehicle_id AND a.driver_id=NEW.driver_id AND a.status='ATIVA' AND a.valid_from<=v_event_date AND (a.valid_until IS NULL OR a.valid_until>=v_event_date)
    UNION ALL SELECT 1 FROM public.fleet_vehicle_authorized_drivers old WHERE old.municipio_id=NEW.municipio_id AND old.vehicle_id=NEW.vehicle_id AND old.driver_id=NEW.driver_id AND old.ativo AND (old.valid_from IS NULL OR old.valid_from<=v_event_date) AND (old.valid_until IS NULL OR old.valid_until>=v_event_date)
  ) INTO v_auth_ok;
  IF NOT v_auth_ok THEN RAISE EXCEPTION 'Motorista sem autorização válida para o veículo na data da operação'; END IF;
  IF v_vehicle.tank_capacity_l IS NULL THEN RAISE EXCEPTION 'Veículo sem capacidade de tanque válida'; END IF;
  IF NEW.authorization_id IS NOT NULL THEN
    SELECT EXISTS (SELECT 1 FROM public.fleet_vehicle_authorizations a JOIN public.unidades_organizacionais u ON u.id=a.beneficiary_unit_id AND u.municipio_id=a.municipio_id AND u.ativo WHERE a.id=NEW.authorization_id AND a.municipio_id=NEW.municipio_id AND a.vehicle_id=NEW.vehicle_id AND a.responsible_unit_id=NEW.responsible_unit_id AND a.beneficiary_unit_id=NEW.beneficiary_unit_id AND a.status='APROVADA' AND a.authorized_by IS NOT NULL AND a.supporting_document_path IS NOT NULL AND NEW.performed_at BETWEEN a.valid_from AND a.valid_until) INTO v_auth_ok;
    IF NOT v_auth_ok THEN RAISE EXCEPTION 'Autorização de cessão inválida, sem documento ou fora da vigência'; END IF;
  END IF;
  IF (v_vehicle.operational_status::text='CEDIDO' OR (NEW.beneficiary_unit_id IS NOT NULL AND NEW.beneficiary_unit_id IS DISTINCT FROM NEW.responsible_unit_id)) AND NEW.authorization_id IS NULL THEN RAISE EXCEPTION 'Veículo cedido ou utilizado por outra secretaria exige autorização aprovada e vigente'; END IF;
  IF TG_OP='INSERT' AND NEW.liters>v_vehicle.tank_capacity_l THEN
    NEW.operational_status:='SINALIZADO'; NEW.status:='COM_INCONSISTENCIA'; NEW.inconsistency_code:='LITROS_ACIMA_DA_CAPACIDADE';
    NEW.inconsistency_notes:=concat_ws(' ',NEW.inconsistency_notes,format('Alerta: %s L informados; tanque cadastrado em %s L. Volume permite registro para análise municipal.',NEW.liters,v_vehicle.tank_capacity_l));
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_fueling_validate_before_write ON public.fleet_fuelings;
CREATE TRIGGER fleet_fueling_validate_before_write BEFORE INSERT OR UPDATE OF municipio_id,vehicle_id,station_id,driver_id,fuel_type_id,responsible_unit_id,beneficiary_unit_id,liters,unit_price,odometer_km,performed_at,authorization_id,entry_type,late_entry_reason ON public.fleet_fuelings FOR EACH ROW EXECUTE FUNCTION public.fleet_validate_fueling();

-- Compatibilidade entre os novos estados separados e a coluna legada usada pelas telas antigas.
CREATE OR REPLACE FUNCTION public.fleet_sync_fueling_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.operational_status:=COALESCE(NEW.operational_status,'REGISTRADO');
    NEW.review_status:=COALESCE(NEW.review_status,'PENDENTE_DE_CONFERENCIA');
    IF NEW.status='COM_INCONSISTENCIA' THEN NEW.operational_status:='SINALIZADO'; NEW.review_status:='COM_PENDENCIA';
    ELSIF NEW.status='ENVIADO_PELO_POSTO' AND NEW.record_origin='POSTO' THEN NEW.status:='PENDENTE_DE_COMPROVANTE'; NEW.operational_status:='AGUARDANDO_COMPLEMENTACAO';
    ELSIF NEW.status='PENDENTE_DE_COMPROVANTE' THEN NEW.operational_status:='AGUARDANDO_COMPLEMENTACAO'; NEW.review_status:='COM_PENDENCIA'; END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status AND NEW.operational_status IS NOT DISTINCT FROM OLD.operational_status AND NEW.review_status IS NOT DISTINCT FROM OLD.review_status THEN
    IF NEW.status='CANCELADO' THEN NEW.operational_status:='CANCELADO';
    ELSIF NEW.status='COM_INCONSISTENCIA' THEN NEW.operational_status:='SINALIZADO'; NEW.review_status:='COM_PENDENCIA';
    ELSIF NEW.status='PENDENTE_DE_COMPROVANTE' THEN NEW.operational_status:='AGUARDANDO_COMPLEMENTACAO'; NEW.review_status:='COM_PENDENCIA';
    ELSIF NEW.status='SOLICITADA_CORRECAO' THEN NEW.operational_status:='AGUARDANDO_COMPLEMENTACAO'; NEW.review_status:='CONTESTADO';
    ELSIF NEW.status='CORRIGIDO' THEN NEW.operational_status:='REGISTRADO'; NEW.review_status:='REGULARIZADO';
    ELSIF NEW.status='CONFERIDO' THEN NEW.operational_status:='REGISTRADO'; NEW.review_status:='CONFERIDO';
    ELSIF NEW.status='INCLUIDO_NO_FECHAMENTO' THEN NEW.operational_status:='REGISTRADO'; NEW.review_status:='ENCERRADO_NO_FECHAMENTO';
    ELSIF NEW.status='EM_ANALISE' THEN NEW.operational_status:='REGISTRADO'; NEW.review_status:='EM_ANALISE';
    ELSIF NEW.status='RASCUNHO' THEN NEW.operational_status:='RASCUNHO'; NEW.review_status:='PENDENTE_DE_CONFERENCIA';
    ELSE NEW.operational_status:='REGISTRADO'; NEW.review_status:='PENDENTE_DE_CONFERENCIA';
    END IF;
  ELSIF NEW.operational_status IS DISTINCT FROM OLD.operational_status OR NEW.review_status IS DISTINCT FROM OLD.review_status THEN
    IF NEW.operational_status='CANCELADO' THEN NEW.status:='CANCELADO';
    ELSIF NEW.review_status='ENCERRADO_NO_FECHAMENTO' THEN NEW.status:='INCLUIDO_NO_FECHAMENTO';
    ELSIF NEW.review_status='CONFERIDO' THEN NEW.status:='CONFERIDO';
    ELSIF NEW.review_status='EM_ANALISE' THEN NEW.status:='EM_ANALISE';
    ELSIF NEW.review_status='CONTESTADO' THEN NEW.status:='SOLICITADA_CORRECAO';
    ELSIF NEW.review_status='REGULARIZADO' THEN NEW.status:='CORRIGIDO';
    ELSIF NEW.operational_status='SINALIZADO' THEN NEW.status:='COM_INCONSISTENCIA';
    ELSIF NEW.operational_status='AGUARDANDO_COMPLEMENTACAO' OR NEW.review_status='COM_PENDENCIA' THEN NEW.status:='PENDENTE_DE_COMPROVANTE';
    ELSE NEW.status:='PENDENTE_DE_CONFERENCIA';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_sync_fueling_status_before_write ON public.fleet_fuelings;
CREATE TRIGGER fleet_sync_fueling_status_before_write BEFORE INSERT OR UPDATE ON public.fleet_fuelings FOR EACH ROW EXECUTE FUNCTION public.fleet_sync_fueling_status();

-- Toda criação e alteração gera trilha append-only; mudanças de situação também
-- alimentam a tabela histórica já consumida por ferramentas existentes.
CREATE OR REPLACE FUNCTION public.fleet_audit_fueling_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_actor integer:=public.fleet_current_usuario_id(); v_event text; v_old jsonb; v_new jsonb;
BEGIN
  IF TG_OP='INSERT' THEN v_event:='CRIADO'; v_old:=NULL; v_new:=to_jsonb(NEW);
  ELSE v_event:='ALTERADO'; v_old:=to_jsonb(OLD); v_new:=to_jsonb(NEW); END IF;
  IF TG_OP='INSERT' OR v_old IS DISTINCT FROM v_new THEN
    INSERT INTO public.fleet_fueling_audit(municipio_id,fueling_id,event_type,old_value,new_value,reason,performed_by,actor_type,performed_at)
    VALUES(NEW.municipio_id,NEW.id,v_event,v_old,v_new,NEW.review_pending_reason,v_actor,CASE WHEN v_actor IS NULL THEN 'SISTEMA' ELSE 'USUARIO' END,clock_timestamp());
  END IF;
  IF TG_OP='UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.fleet_fueling_status_history(municipio_id,fueling_id,previous_status,new_status,reason,notes,changed_by,changed_at)
    VALUES(NEW.municipio_id,NEW.id,OLD.status,NEW.status,COALESCE(NEW.review_pending_reason,NEW.cancellation_reason),NEW.notes,v_actor,clock_timestamp());
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_fueling_audit_after_change ON public.fleet_fuelings;
CREATE TRIGGER fleet_fueling_audit_after_change AFTER INSERT OR UPDATE ON public.fleet_fuelings FOR EACH ROW EXECUTE FUNCTION public.fleet_audit_fueling_change();

-- Alertas de análise não bloqueantes: hodômetro, frequência, duplicidade, horário,
-- lançamento posterior, preço de referência e comprovante pendente.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_inconsistencies_open_fueling_code_uidx
  ON public.fleet_inconsistencies(fueling_id,code) WHERE fueling_id IS NOT NULL AND status IN ('ABERTA','EM_ANALISE');
INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description)
SELECT f.municipio_id,f.id,f.vehicle_id,'COMPROVANTE_PENDENTE','ATENCAO','Comprovante pendente ou ainda não aceito','Registro legado sem comprovante atual aceito; anexar ou revisar comprovante antes da conferência oficial.'
FROM public.fleet_fuelings f WHERE f.status<>'CANCELADO' AND NOT EXISTS(SELECT 1 FROM public.fleet_fueling_documents d WHERE d.fueling_id=f.id AND d.is_current AND d.document_status='ACEITO')
ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION public.fleet_assess_fueling_alerts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_vehicle public.fleet_vehicles%ROWTYPE; v_policy public.fleet_fueling_policies%ROWTYPE; v_previous numeric; v_reference numeric;
  v_hour integer; v_local timestamp; v_duplicate boolean; v_short boolean; v_title text; v_desc text;
BEGIN
  IF NEW.status='CANCELADO' OR NEW.operational_status='CANCELADO' THEN RETURN NEW; END IF;
  SELECT * INTO v_vehicle FROM public.fleet_vehicles WHERE id=NEW.vehicle_id AND municipio_id=NEW.municipio_id;
  SELECT * INTO v_policy FROM public.fleet_fueling_policies WHERE municipio_id=NEW.municipio_id;
  IF v_vehicle.id IS NOT NULL AND NEW.liters>v_vehicle.tank_capacity_l THEN
    INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description)
    VALUES(NEW.municipio_id,NEW.id,NEW.vehicle_id,'LITROS_ACIMA_DA_CAPACIDADE','ATENCAO','Volume acima da capacidade cadastrada',format('Volume %s L excede o tanque cadastrado (%s L). A operação foi registrada para conferência; avaliar abastecimento parcial e dados do veículo.',NEW.liters,v_vehicle.tank_capacity_l)) ON CONFLICT DO NOTHING;
  END IF;
  SELECT f.odometer_km INTO v_previous FROM public.fleet_fuelings f WHERE f.municipio_id=NEW.municipio_id AND f.vehicle_id=NEW.vehicle_id AND f.id<>NEW.id AND f.status NOT IN ('CANCELADO','RASCUNHO') AND f.performed_at<NEW.performed_at ORDER BY f.performed_at DESC LIMIT 1;
  IF v_previous IS NOT NULL AND NEW.odometer_km+COALESCE(v_policy.odometer_tolerance_km,0)<v_previous THEN
    INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description)
    VALUES(NEW.municipio_id,NEW.id,NEW.vehicle_id,'ODOMETRO_INFERIOR','ATENCAO','Hodômetro inferior ao registro anterior',format('Hodômetro informado %s km; registro anterior %s km; tolerância municipal %s km. Não sobrescreva histórico; revisar painel ou correção.',NEW.odometer_km,v_previous,COALESCE(v_policy.odometer_tolerance_km,0))) ON CONFLICT DO NOTHING;
  END IF;
  v_short:=EXISTS(SELECT 1 FROM public.fleet_fuelings f WHERE f.municipio_id=NEW.municipio_id AND f.vehicle_id=NEW.vehicle_id AND f.id<>NEW.id AND f.status<>'CANCELADO' AND abs(extract(epoch FROM (NEW.performed_at-f.performed_at)))<=COALESCE(v_policy.short_interval_minutes,60)*60);
  IF v_short THEN INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description) VALUES(NEW.municipio_id,NEW.id,NEW.vehicle_id,'INTERVALO_CURTO','ATENCAO','Abastecimentos em intervalo curto','Há outro abastecimento do veículo em intervalo inferior ao parâmetro municipal. Verificar abastecimento parcial/viagem.') ON CONFLICT DO NOTHING; END IF;
  v_local:=NEW.performed_at AT TIME ZONE 'America/Sao_Paulo'; v_hour:=extract(hour FROM v_local);
  IF (COALESCE(v_policy.usual_start_hour,6)<=COALESCE(v_policy.usual_end_hour,22) AND (v_hour<COALESCE(v_policy.usual_start_hour,6) OR v_hour>=COALESCE(v_policy.usual_end_hour,22)))
     OR (COALESCE(v_policy.usual_start_hour,6)>COALESCE(v_policy.usual_end_hour,22) AND v_hour>=COALESCE(v_policy.usual_end_hour,22) AND v_hour<COALESCE(v_policy.usual_start_hour,6)) THEN
    INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description) VALUES(NEW.municipio_id,NEW.id,NEW.vehicle_id,'FORA_HORARIO_HABITUAL','INFORMATIVO','Abastecimento fora do horário habitual','A operação ocorreu fora da faixa horária configurada; viagem, plantão ou emergência podem justificar.') ON CONFLICT DO NOTHING;
  END IF;
  IF NEW.entry_type='POSTERIOR' THEN INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description) VALUES(NEW.municipio_id,NEW.id,NEW.vehicle_id,'REGISTRO_POSTERIOR','INFORMATIVO','Lançamento posterior','Registro lançado após a janela operacional. Justificativa: '||COALESCE(NEW.late_entry_reason,'não informada')) ON CONFLICT DO NOTHING; END IF;
  v_reference:=v_policy.price_reference_per_liter;
  IF v_reference IS NULL THEN
    SELECT avg(f.unit_price) INTO v_reference FROM public.fleet_fuelings f WHERE f.municipio_id=NEW.municipio_id AND f.fuel_type_id=NEW.fuel_type_id AND f.id<>NEW.id AND f.status NOT IN ('CANCELADO','RASCUNHO') AND f.performed_at>=NEW.performed_at-interval '30 days';
  END IF;
  IF v_reference IS NOT NULL AND NEW.unit_price>v_reference*(1+COALESCE(v_policy.price_deviation_percent,20)/100) THEN
    INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description) VALUES(NEW.municipio_id,NEW.id,NEW.vehicle_id,'PRECO_ACIMA_REFERENCIA','ATENCAO','Preço acima da referência municipal',format('Preço praticado %s; referência %s, limite com tolerância de %s%%: %s. Conferir contrato, período e produto.',NEW.unit_price,v_reference,COALESCE(v_policy.price_deviation_percent,20),v_reference*(1+COALESCE(v_policy.price_deviation_percent,20)/100))) ON CONFLICT DO NOTHING;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.fleet_fueling_documents d WHERE d.fueling_id=NEW.id AND d.is_current AND d.document_status='ACEITO') THEN
    INSERT INTO public.fleet_inconsistencies(municipio_id,fueling_id,vehicle_id,code,severity,title,description) VALUES(NEW.municipio_id,NEW.id,NEW.vehicle_id,'COMPROVANTE_PENDENTE','ATENCAO','Comprovante pendente','Anexar documento aceito pela Administração; prazo calculado a partir do horário efetivo do abastecimento.') ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS fleet_fueling_assess_alerts_after_write ON public.fleet_fuelings;
CREATE TRIGGER fleet_fueling_assess_alerts_after_write AFTER INSERT OR UPDATE OF performed_at,vehicle_id,liters,unit_price,odometer_km,status,entry_type ON public.fleet_fuelings FOR EACH ROW EXECUTE FUNCTION public.fleet_assess_fueling_alerts();

-- Metadados do comprovante são gravados em RPC; o prazo, ator e município vêm do banco.
CREATE OR REPLACE FUNCTION public.fleet_register_fueling_document(
  p_fueling_id uuid,p_file_name text,p_storage_path text,p_mime_type text,p_file_size_bytes bigint,
  p_document_type text DEFAULT 'COMPROVANTE_DE_ABASTECIMENTO',p_notes text DEFAULT NULL,p_replaced_document_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id(); v_f public.fleet_fuelings%ROWTYPE; v_id uuid;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL THEN RAISE EXCEPTION 'Sessão autenticada necessária' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_f FROM public.fleet_fuelings WHERE id=p_fueling_id AND municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Abastecimento não encontrado'; END IF;
  IF NOT public.fleet_is_manager() AND NOT EXISTS(SELECT 1 FROM public.fleet_station_members sm WHERE sm.station_id=v_f.station_id AND sm.municipio_id=v_municipio AND sm.usuario_id=v_usuario AND sm.ativo) THEN RAISE EXCEPTION 'Acesso ao abastecimento não autorizado' USING ERRCODE='42501'; END IF;
  IF NULLIF(btrim(p_file_name),'') IS NULL OR p_file_size_bytes<=0 OR p_file_size_bytes>10485760 OR p_mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp') THEN RAISE EXCEPTION 'Arquivo inválido: permitido PDF, JPG, PNG ou WEBP até 10 MB'; END IF;
  IF split_part(p_storage_path,'/',1)<>v_municipio::text OR split_part(p_storage_path,'/',2)<>'fuelings' OR split_part(p_storage_path,'/',3)<>v_f.id::text THEN RAISE EXCEPTION 'Caminho de armazenamento não corresponde ao abastecimento'; END IF;
  IF p_replaced_document_id IS NOT NULL THEN
    UPDATE public.fleet_fueling_documents d SET is_current=false,document_status='SUBSTITUIDO'
    WHERE d.id=p_replaced_document_id AND d.fueling_id=v_f.id AND d.municipio_id=v_municipio AND d.is_current AND (public.fleet_is_manager() OR d.document_status='REJEITADO');
    IF NOT FOUND THEN RAISE EXCEPTION 'Somente comprovante rejeitado pode ser substituído pelo posto'; END IF;
  END IF;
  INSERT INTO public.fleet_fueling_documents(municipio_id,fueling_id,file_name,storage_path,mime_type,file_size_bytes,document_type,notes,document_status,uploaded_by,uploaded_at,due_at,is_current,replaced_document_id)
  VALUES(v_municipio,v_f.id,p_file_name,p_storage_path,p_mime_type,p_file_size_bytes,COALESCE(NULLIF(btrim(p_document_type),''),'COMPROVANTE_DE_ABASTECIMENTO'),NULLIF(btrim(p_notes),''),'ENVIADO',v_usuario,clock_timestamp(),v_f.performed_at+interval '24 hours',true,p_replaced_document_id) RETURNING id INTO v_id;
  UPDATE public.fleet_fuelings SET operational_status=CASE WHEN driver_id IS NULL THEN 'SINALIZADO' ELSE 'REGISTRADO' END,
    review_status=CASE WHEN review_status='CONTESTADO' OR (review_status='COM_PENDENCIA' AND review_pending_reason ILIKE '%comprovante%') THEN 'PENDENTE_DE_CONFERENCIA' ELSE review_status END,
    review_pending_reason=CASE WHEN review_pending_reason ILIKE '%comprovante%' THEN NULL ELSE review_pending_reason END,
    status=CASE WHEN driver_id IS NULL THEN 'COM_INCONSISTENCIA'::public.fleet_fueling_status ELSE 'PENDENTE_DE_CONFERENCIA'::public.fleet_fueling_status END,updated_at=clock_timestamp()
    WHERE id=v_f.id AND status IN ('PENDENTE_DE_COMPROVANTE','SOLICITADA_CORRECAO','ENVIADO_PELO_POSTO');
  UPDATE public.fleet_inconsistencies SET status='RESOLVIDA',resolved_by=v_usuario,resolved_at=clock_timestamp(),resolution_notes='Documento anexado; aguardando conferência municipal.'
    WHERE fueling_id=v_f.id AND code='COMPROVANTE_PENDENTE' AND status IN ('ABERTA','EM_ANALISE');
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_review_fueling_document(p_document_id uuid,p_decision text,p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id(); v_d public.fleet_fueling_documents%ROWTYPE;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Somente Gestor de Frotas/Admin pode revisar comprovantes' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('ACEITO','REJEITADO') OR (p_decision='REJEITADO' AND length(btrim(COALESCE(p_reason,'')))<8) THEN RAISE EXCEPTION 'Decisão inválida ou justificativa de rejeição insuficiente'; END IF;
  SELECT * INTO v_d FROM public.fleet_fueling_documents WHERE id=p_document_id AND municipio_id=v_municipio AND is_current FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comprovante atual não encontrado'; END IF;
  UPDATE public.fleet_fueling_documents SET document_status=p_decision,reviewed_by=v_usuario,reviewed_at=clock_timestamp(),rejection_reason=CASE WHEN p_decision='REJEITADO' THEN btrim(p_reason) ELSE NULL END WHERE id=v_d.id;
  INSERT INTO public.fleet_fueling_audit(municipio_id,fueling_id,event_type,field_name,old_value,new_value,reason,performed_by,actor_type)
  VALUES(v_municipio,v_d.fueling_id,'COMPROVANTE_REVISADO','document_status',to_jsonb(v_d.document_status),to_jsonb(p_decision),NULLIF(btrim(p_reason),''),v_usuario,'USUARIO');
  IF p_decision='REJEITADO' THEN
    UPDATE public.fleet_fuelings SET operational_status='AGUARDANDO_COMPLEMENTACAO',review_status='CONTESTADO',review_pending_reason=btrim(p_reason),status='SOLICITADA_CORRECAO',correction_requested_at=clock_timestamp(),correction_requested_by=v_usuario,updated_at=clock_timestamp() WHERE id=v_d.fueling_id;
  ELSE
    UPDATE public.fleet_inconsistencies SET status='RESOLVIDA',resolved_by=v_usuario,resolved_at=clock_timestamp(),resolution_notes='Comprovante aceito pela gestão municipal.'
    WHERE fueling_id=v_d.fueling_id AND code='COMPROVANTE_PENDENTE' AND status IN ('ABERTA','EM_ANALISE');
  END IF;
  RETURN jsonb_build_object('fueling_id',v_d.fueling_id,'document_id',v_d.id,'document_status',p_decision);
END $$;

CREATE OR REPLACE FUNCTION public.fleet_review_fueling(p_fueling_id uuid,p_review_status text,p_notes text DEFAULT NULL,p_pending_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id(); v_f public.fleet_fuelings%ROWTYPE; v_open_alerts integer;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Somente Gestor de Frotas/Admin pode conferir abastecimentos' USING ERRCODE='42501'; END IF;
  IF p_review_status NOT IN ('EM_ANALISE','CONFERIDO','COM_PENDENCIA','CONTESTADO','REGULARIZADO') THEN RAISE EXCEPTION 'Situação de conferência inválida'; END IF;
  IF p_review_status IN ('COM_PENDENCIA','CONTESTADO') AND length(btrim(COALESCE(p_pending_reason,p_notes,'')))<8 THEN RAISE EXCEPTION 'Informe justificativa para pendência ou contestação'; END IF;
  SELECT * INTO v_f FROM public.fleet_fuelings WHERE id=p_fueling_id AND municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND OR v_f.status='CANCELADO' THEN RAISE EXCEPTION 'Abastecimento não encontrado ou cancelado'; END IF;
  IF p_review_status='CONFERIDO' THEN
    IF v_f.driver_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM public.fleet_drivers d WHERE d.id=v_f.driver_id AND d.municipio_id=v_municipio AND d.ativo AND d.cnh_valid_until >= (v_f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date
      AND (EXISTS(SELECT 1 FROM public.fleet_vehicle_driver_authorizations a WHERE a.municipio_id=v_municipio AND a.vehicle_id=v_f.vehicle_id AND a.driver_id=v_f.driver_id AND a.status='ATIVA' AND a.valid_from<=(v_f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date AND (a.valid_until IS NULL OR a.valid_until>=(v_f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date))
        OR EXISTS(SELECT 1 FROM public.fleet_vehicle_authorized_drivers old WHERE old.municipio_id=v_municipio AND old.vehicle_id=v_f.vehicle_id AND old.driver_id=v_f.driver_id AND old.ativo AND (old.valid_from IS NULL OR old.valid_from<=(v_f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date) AND (old.valid_until IS NULL OR old.valid_until>=(v_f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date)))
    ) THEN RAISE EXCEPTION 'Motorista sem vínculo ativo, CNH vigente ou autorização para a data da operação'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.fleet_fueling_documents d WHERE d.municipio_id=v_municipio AND d.fueling_id=v_f.id AND d.is_current AND d.document_status='ACEITO' AND NULLIF(btrim(d.storage_path),'') IS NOT NULL) THEN RAISE EXCEPTION 'Para conferir, é necessário ao menos um comprovante atual aceito'; END IF;
    SELECT count(*) INTO v_open_alerts FROM public.fleet_inconsistencies i WHERE i.fueling_id=v_f.id AND i.status IN ('ABERTA','EM_ANALISE') AND i.severity='BLOQUEIO';
    IF v_open_alerts>0 THEN RAISE EXCEPTION 'Resolva alertas bloqueantes antes de conferir'; END IF;
    IF EXISTS(SELECT 1 FROM public.fleet_inconsistencies i WHERE i.fueling_id=v_f.id AND i.status IN ('ABERTA','EM_ANALISE') AND i.severity='ATENCAO') AND length(btrim(COALESCE(p_notes,'')))<8 THEN RAISE EXCEPTION 'Registre justificativa municipal para conferir com alertas em aberto'; END IF;
  END IF;
  UPDATE public.fleet_fuelings SET review_status=p_review_status,operational_status=CASE WHEN p_review_status IN ('COM_PENDENCIA','CONTESTADO') THEN 'AGUARDANDO_COMPLEMENTACAO' WHEN inconsistency_code IS NOT NULL AND p_review_status<>'CONFERIDO' THEN 'SINALIZADO' ELSE 'REGISTRADO' END,
    review_pending_reason=CASE WHEN p_review_status IN ('COM_PENDENCIA','CONTESTADO') THEN COALESCE(NULLIF(btrim(p_pending_reason),''),NULLIF(btrim(p_notes),'')) ELSE NULL END,
    status=CASE WHEN p_review_status='CONFERIDO' THEN 'CONFERIDO' WHEN p_review_status='EM_ANALISE' THEN 'EM_ANALISE' WHEN p_review_status='CONTESTADO' THEN 'SOLICITADA_CORRECAO' WHEN p_review_status='REGULARIZADO' THEN 'CORRIGIDO' WHEN p_review_status='COM_PENDENCIA' THEN 'PENDENTE_DE_COMPROVANTE' ELSE status END,
    registered_officially_by=CASE WHEN p_review_status='CONFERIDO' THEN v_usuario ELSE registered_officially_by END,
    registered_officially_at=CASE WHEN p_review_status='CONFERIDO' THEN clock_timestamp() ELSE registered_officially_at END,
    updated_at=clock_timestamp() WHERE id=v_f.id;
  INSERT INTO public.fleet_fueling_reviews(municipio_id,fueling_id,review_status,reviewer_id,notes,pending_reason)
  VALUES(v_municipio,v_f.id,p_review_status,v_usuario,NULLIF(btrim(p_notes),''),NULLIF(btrim(p_pending_reason),''));
  RETURN jsonb_build_object('fueling_id',v_f.id,'review_status',p_review_status);
END $$;

CREATE OR REPLACE FUNCTION public.fleet_cancel_fueling(p_fueling_id uuid,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id(); v_f public.fleet_fuelings%ROWTYPE;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Somente Gestor de Frotas/Admin pode cancelar abastecimentos' USING ERRCODE='42501'; END IF;
  IF length(btrim(COALESCE(p_reason,'')))<8 THEN RAISE EXCEPTION 'Cancelamento exige justificativa de pelo menos 8 caracteres'; END IF;
  SELECT * INTO v_f FROM public.fleet_fuelings WHERE id=p_fueling_id AND municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND OR v_f.status IN ('CANCELADO','INCLUIDO_NO_FECHAMENTO') THEN RAISE EXCEPTION 'Abastecimento inexistente, cancelado ou já incluído em fechamento'; END IF;
  UPDATE public.fleet_fuelings SET operational_status='CANCELADO',status='CANCELADO',canceled_at=clock_timestamp(),canceled_by=v_usuario,cancellation_reason=btrim(p_reason),review_pending_reason=btrim(p_reason),updated_at=clock_timestamp() WHERE id=v_f.id;
  RETURN jsonb_build_object('fueling_id',v_f.id,'status','CANCELADO');
END $$;

CREATE OR REPLACE FUNCTION public.fleet_request_fueling_adjustment(p_fueling_id uuid,p_reason text,p_proposed_changes jsonb DEFAULT '{}'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id(); v_station uuid; v_id uuid;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL THEN RAISE EXCEPTION 'Sessão autenticada necessária' USING ERRCODE='42501'; END IF;
  IF length(btrim(COALESCE(p_reason,'')))<8 OR jsonb_typeof(COALESCE(p_proposed_changes,'{}'::jsonb))<>'object' THEN RAISE EXCEPTION 'Informe motivo e alterações propostas em formato válido'; END IF;
  SELECT station_id INTO v_station FROM public.fleet_fuelings WHERE id=p_fueling_id AND municipio_id=v_municipio AND status<>'CANCELADO';
  IF NOT FOUND THEN RAISE EXCEPTION 'Abastecimento não encontrado'; END IF;
  IF NOT public.fleet_is_manager() AND NOT EXISTS(SELECT 1 FROM public.fleet_station_members WHERE station_id=v_station AND municipio_id=v_municipio AND usuario_id=v_usuario AND ativo) THEN RAISE EXCEPTION 'Usuário não autorizado para este abastecimento' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(COALESCE(p_proposed_changes,'{}'::jsonb)) AS keys(key) WHERE keys.key NOT IN ('vehicle_id','driver_id','fuel_type_id','beneficiary_unit_id','authorization_id','performed_at','liters','unit_price','odometer_km','station_receipt_number','notes')) THEN RAISE EXCEPTION 'A solicitação contém campos não permitidos'; END IF;
  INSERT INTO public.fleet_fueling_adjustments(municipio_id,fueling_id,requested_by,reason,proposed_changes) VALUES(v_municipio,p_fueling_id,v_usuario,btrim(p_reason),COALESCE(p_proposed_changes,'{}'::jsonb)) RETURNING id INTO v_id;
  INSERT INTO public.fleet_fueling_audit(municipio_id,fueling_id,event_type,reason,performed_by,actor_type,new_value) VALUES(v_municipio,p_fueling_id,'AJUSTE_SOLICITADO',btrim(p_reason),v_usuario,'USUARIO',COALESCE(p_proposed_changes,'{}'::jsonb));
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.fleet_decide_fueling_adjustment(p_adjustment_id uuid,p_decision text,p_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id(); v_a public.fleet_fueling_adjustments%ROWTYPE; j jsonb;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Somente Gestor de Frotas/Admin pode decidir ajustes' USING ERRCODE='42501'; END IF;
  IF p_decision NOT IN ('APROVADA','REJEITADA') OR length(btrim(COALESCE(p_notes,'')))<8 THEN RAISE EXCEPTION 'Decisão inválida ou justificativa insuficiente'; END IF;
  SELECT * INTO v_a FROM public.fleet_fueling_adjustments WHERE id=p_adjustment_id AND municipio_id=v_municipio AND approval_status='PENDENTE' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitação inexistente ou já decidida'; END IF;
  j:=v_a.proposed_changes;
  IF p_decision='APROVADA' AND j<>'{}'::jsonb THEN
    UPDATE public.fleet_fuelings SET
      vehicle_id=CASE WHEN j ? 'vehicle_id' THEN (j->>'vehicle_id')::uuid ELSE vehicle_id END,
      driver_id=CASE WHEN j ? 'driver_id' THEN NULLIF(j->>'driver_id','')::uuid ELSE driver_id END,
      fuel_type_id=CASE WHEN j ? 'fuel_type_id' THEN (j->>'fuel_type_id')::uuid ELSE fuel_type_id END,
      beneficiary_unit_id=CASE WHEN j ? 'beneficiary_unit_id' THEN NULLIF(j->>'beneficiary_unit_id','')::uuid ELSE beneficiary_unit_id END,
      authorization_id=CASE WHEN j ? 'authorization_id' THEN NULLIF(j->>'authorization_id','')::uuid ELSE authorization_id END,
      performed_at=CASE WHEN j ? 'performed_at' THEN (j->>'performed_at')::timestamptz ELSE performed_at END,
      liters=CASE WHEN j ? 'liters' THEN (j->>'liters')::numeric ELSE liters END,
      unit_price=CASE WHEN j ? 'unit_price' THEN (j->>'unit_price')::numeric ELSE unit_price END,
      odometer_km=CASE WHEN j ? 'odometer_km' THEN (j->>'odometer_km')::numeric ELSE odometer_km END,
      station_receipt_number=CASE WHEN j ? 'station_receipt_number' THEN NULLIF(j->>'station_receipt_number','') ELSE station_receipt_number END,
      notes=CASE WHEN j ? 'notes' THEN NULLIF(j->>'notes','') ELSE notes END,
      status='PENDENTE_DE_CONFERENCIA',operational_status='REGISTRADO',review_status='PENDENTE_DE_CONFERENCIA',review_pending_reason=NULL,corrected_at=clock_timestamp(),corrected_by=v_usuario,updated_at=clock_timestamp()
    WHERE id=v_a.fueling_id AND municipio_id=v_municipio;
  END IF;
  UPDATE public.fleet_fueling_adjustments SET approval_status=p_decision,reviewed_by=v_usuario,reviewed_at=clock_timestamp(),decision_notes=btrim(p_notes) WHERE id=v_a.id;
  INSERT INTO public.fleet_fueling_audit(municipio_id,fueling_id,event_type,reason,performed_by,actor_type,approved_by,new_value)
  VALUES(v_municipio,v_a.fueling_id,'AJUSTE_'||p_decision,btrim(p_notes),v_usuario,'USUARIO',v_usuario,j);
  RETURN jsonb_build_object('adjustment_id',v_a.id,'approval_status',p_decision);
END $$;

-- Consulta paginada e filtrável no backend; RLS da tabela-base continua valendo
-- para Gestor/Fiscal/Posto e as relações nunca ampliam o escopo do usuário.
CREATE OR REPLACE FUNCTION public.fleet_search_fuelings(
  p_search text DEFAULT NULL,p_from timestamptz DEFAULT NULL,p_to timestamptz DEFAULT NULL,
  p_station_id uuid DEFAULT NULL,p_responsible_unit_id uuid DEFAULT NULL,p_beneficiary_unit_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,p_driver_id uuid DEFAULT NULL,p_fuel_type_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,p_operational_status text DEFAULT NULL,p_review_status text DEFAULT NULL,
  p_document_status text DEFAULT NULL,p_missing_document boolean DEFAULT false,p_has_alert boolean DEFAULT NULL,
  p_late boolean DEFAULT NULL,p_limit integer DEFAULT 100,p_offset integer DEFAULT 0)
RETURNS TABLE(total_count bigint,id uuid,protocol_number text,vehicle_id uuid,vehicle_plate text,vehicle_model text,driver_id uuid,driver_name text,driver_registration text,station_id uuid,station_name text,fuel_type_id uuid,fuel_type_name text,responsible_unit_id uuid,responsible_unit_name text,beneficiary_unit_id uuid,beneficiary_unit_name text,authorization_id uuid,performed_at timestamptz,submitted_at timestamptz,recorded_at timestamptz,entry_type text,record_origin text,late_entry_reason text,liters numeric,unit_price numeric,total_amount numeric,odometer_km numeric,station_receipt_number text,notes text,status text,operational_status text,review_status text,review_pending_reason text,created_by integer,registered_officially_by integer,registered_officially_at timestamptz,cancellation_reason text,documents jsonb,alerts jsonb)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='pg_catalog','public' AS $$
WITH filtered AS (
 SELECT f.* FROM public.fleet_fuelings f
 JOIN public.fleet_vehicles v ON v.id=f.vehicle_id AND v.municipio_id=f.municipio_id
 JOIN public.fleet_fuel_stations s ON s.id=f.station_id AND s.municipio_id=f.municipio_id
 JOIN public.fleet_fuel_types ft ON ft.id=f.fuel_type_id AND ft.municipio_id=f.municipio_id
 LEFT JOIN public.fleet_drivers d ON d.id=f.driver_id AND d.municipio_id=f.municipio_id
 WHERE (NULLIF(btrim(p_search),'') IS NULL OR concat_ws(' ',f.protocol_number,f.station_receipt_number,v.placa,v.modelo,d.nome,d.matricula,s.nome_fantasia_snapshot,s.razao_social_snapshot,ft.nome)::text ILIKE '%'||btrim(p_search)||'%')
   AND (p_from IS NULL OR f.performed_at>=p_from) AND (p_to IS NULL OR f.performed_at<p_to)
   AND (p_station_id IS NULL OR f.station_id=p_station_id) AND (p_responsible_unit_id IS NULL OR f.responsible_unit_id=p_responsible_unit_id)
   AND (p_beneficiary_unit_id IS NULL OR f.beneficiary_unit_id=p_beneficiary_unit_id) AND (p_vehicle_id IS NULL OR f.vehicle_id=p_vehicle_id)
   AND (p_driver_id IS NULL OR f.driver_id=p_driver_id) AND (p_fuel_type_id IS NULL OR f.fuel_type_id=p_fuel_type_id)
   AND (p_status IS NULL OR f.status::text=p_status) AND (p_operational_status IS NULL OR f.operational_status=p_operational_status)
   AND (p_review_status IS NULL OR f.review_status=p_review_status)
   AND (p_document_status IS NULL OR EXISTS(SELECT 1 FROM public.fleet_fueling_documents x WHERE x.fueling_id=f.id AND x.is_current AND x.document_status::text=p_document_status))
   AND (NOT COALESCE(p_missing_document,false) OR NOT EXISTS(SELECT 1 FROM public.fleet_fueling_documents x WHERE x.fueling_id=f.id AND x.is_current))
   AND (p_has_alert IS NULL OR (EXISTS(SELECT 1 FROM public.fleet_inconsistencies i WHERE i.fueling_id=f.id AND i.status IN ('ABERTA','EM_ANALISE')))=p_has_alert)
   AND (p_late IS NULL OR (f.entry_type='POSTERIOR')=p_late)
), page AS (SELECT * FROM filtered ORDER BY performed_at DESC,id DESC LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),200) OFFSET GREATEST(COALESCE(p_offset,0),0)), counts AS (SELECT count(*) AS total_count FROM filtered)
SELECT counts.total_count,f.id,f.protocol_number,f.vehicle_id,v.placa,v.modelo,f.driver_id,d.nome,d.matricula,f.station_id,COALESCE(s.nome_fantasia_snapshot,s.razao_social_snapshot),f.fuel_type_id,ft.nome,
       f.responsible_unit_id,ru.nome,f.beneficiary_unit_id,bu.nome,f.authorization_id,f.performed_at,f.submitted_at,f.recorded_at,f.entry_type,f.record_origin,f.late_entry_reason,f.liters,f.unit_price,f.total_amount,f.odometer_km,f.station_receipt_number,f.notes,f.status::text,f.operational_status,f.review_status,f.review_pending_reason,f.created_by,f.registered_officially_by,f.registered_officially_at,f.cancellation_reason,
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',x.id,'file_name',x.file_name,'storage_path',x.storage_path,'mime_type',x.mime_type,'file_size_bytes',x.file_size_bytes,'document_type',x.document_type,'notes',x.notes,'document_status',x.document_status,'uploaded_at',x.uploaded_at,'due_at',x.due_at,'is_current',x.is_current,'rejection_reason',x.rejection_reason,'reviewed_by',x.reviewed_by,'reviewed_at',x.reviewed_at) ORDER BY x.uploaded_at DESC) FROM public.fleet_fueling_documents x WHERE x.fueling_id=f.id AND x.is_current),'[]'::jsonb),
       COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'code',i.code,'severity',i.severity,'title',i.title,'description',i.description,'status',i.status,'created_at',i.created_at,'resolution_notes',i.resolution_notes) ORDER BY i.created_at DESC) FROM public.fleet_inconsistencies i WHERE i.fueling_id=f.id AND i.status IN ('ABERTA','EM_ANALISE')),'[]'::jsonb)
FROM page f CROSS JOIN counts JOIN public.fleet_vehicles v ON v.id=f.vehicle_id LEFT JOIN public.fleet_drivers d ON d.id=f.driver_id
JOIN public.fleet_fuel_stations s ON s.id=f.station_id JOIN public.fleet_fuel_types ft ON ft.id=f.fuel_type_id
LEFT JOIN public.unidades_organizacionais ru ON ru.id=f.responsible_unit_id LEFT JOIN public.unidades_organizacionais bu ON bu.id=f.beneficiary_unit_id
ORDER BY f.performed_at DESC,f.id DESC;
$$;

-- Hardening RLS/grants: removida permissão anônima e exclusão física de operações,
-- comprovantes, histórico e alertas. RPCs críticas são authenticated-only.
DROP POLICY IF EXISTS fleet_fuelings_manager_write ON public.fleet_fuelings;
DROP POLICY IF EXISTS fleet_fuelings_manager_read ON public.fleet_fuelings;
DROP POLICY IF EXISTS fleet_fuelings_station_submit ON public.fleet_fuelings;
DROP POLICY IF EXISTS fleet_fuelings_station_read ON public.fleet_fuelings;
DROP POLICY IF EXISTS fleet_fueling_documents_manager ON public.fleet_fueling_documents;
DROP POLICY IF EXISTS fleet_fueling_documents_station_insert ON public.fleet_fueling_documents;
DROP POLICY IF EXISTS fleet_fueling_documents_station_read ON public.fleet_fueling_documents;
DROP POLICY IF EXISTS fleet_inconsistencies_manager ON public.fleet_inconsistencies;
CREATE POLICY fleet_fuelings_manager_read ON public.fleet_fuelings FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_mayor_or_manager());
CREATE POLICY fleet_fuelings_manager_write ON public.fleet_fuelings FOR ALL TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager())
  WITH CHECK (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_fuelings_station_read ON public.fleet_fuelings FOR SELECT TO authenticated USING (
  municipio_id=public.fleet_current_municipio_id() AND EXISTS(SELECT 1 FROM public.fleet_station_members sm WHERE sm.station_id=fleet_fuelings.station_id AND sm.municipio_id=fleet_fuelings.municipio_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo));
CREATE POLICY fleet_fueling_documents_manager_read ON public.fleet_fueling_documents FOR SELECT TO authenticated USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_fueling_documents_manager_update ON public.fleet_fueling_documents FOR UPDATE TO authenticated USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager()) WITH CHECK (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_fueling_documents_station_read ON public.fleet_fueling_documents FOR SELECT TO authenticated USING (municipio_id=public.fleet_current_municipio_id() AND EXISTS(SELECT 1 FROM public.fleet_fuelings f JOIN public.fleet_station_members sm ON sm.station_id=f.station_id WHERE f.id=fueling_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo));
CREATE POLICY fleet_inconsistencies_manager_read ON public.fleet_inconsistencies FOR SELECT TO authenticated USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_inconsistencies_manager_update ON public.fleet_inconsistencies FOR UPDATE TO authenticated USING (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager()) WITH CHECK (municipio_id=public.fleet_current_municipio_id() AND public.fleet_is_manager());
CREATE POLICY fleet_inconsistencies_station_read ON public.fleet_inconsistencies FOR SELECT TO authenticated USING (municipio_id=public.fleet_current_municipio_id() AND EXISTS(SELECT 1 FROM public.fleet_fuelings f JOIN public.fleet_station_members sm ON sm.station_id=f.station_id WHERE f.id=fueling_id AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo));

REVOKE ALL ON TABLE public.fleet_fuelings,public.fleet_fueling_documents,public.fleet_fueling_status_history,public.fleet_inconsistencies,public.fleet_fueling_audit,public.fleet_fueling_reviews,public.fleet_fueling_adjustments,public.fleet_station_fuel_types,public.fleet_fueling_policies FROM PUBLIC,anon;
GRANT SELECT,INSERT,UPDATE ON TABLE public.fleet_fuelings,public.fleet_fueling_documents,public.fleet_inconsistencies,public.fleet_station_fuel_types,public.fleet_fueling_policies TO authenticated;
GRANT SELECT ON TABLE public.fleet_fueling_status_history,public.fleet_fueling_audit,public.fleet_fueling_reviews,public.fleet_fueling_adjustments TO authenticated;

-- Criar abastecimento no servidor com idempotência e contexto obtido da sessão.
CREATE OR REPLACE FUNCTION public.fleet_submit_fueling(
  p_idempotency_key uuid,p_station_id uuid,p_vehicle_id uuid,p_fuel_type_id uuid,p_driver_id uuid,
  p_responsible_unit_id uuid,p_beneficiary_unit_id uuid,p_authorization_id uuid,p_performed_at timestamptz,
  p_liters numeric,p_unit_price numeric,p_odometer_km numeric,p_station_receipt_number text DEFAULT NULL,
  p_notes text DEFAULT NULL,p_late_entry_reason text DEFAULT NULL,p_source text DEFAULT 'POSTO')
RETURNS TABLE(fueling_id uuid,protocol_number text,status text,operational_status text,review_status text,submitted_at timestamptz,total_amount numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id(); v_old public.fleet_fuelings%ROWTYPE; v_id uuid;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL THEN RAISE EXCEPTION 'Sessão autenticada necessária' USING ERRCODE='42501'; END IF;
  IF p_idempotency_key IS NULL OR p_source NOT IN ('POSTO','MUNICIPIO') THEN RAISE EXCEPTION 'Chave idempotente e origem válidas são obrigatórias'; END IF;
  IF p_source='MUNICIPIO' AND NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Somente a gestão municipal pode registrar abastecimento interno' USING ERRCODE='42501'; END IF;
  IF p_source='POSTO' AND NOT EXISTS(SELECT 1 FROM public.fleet_station_members sm JOIN public.fleet_fuel_stations s ON s.id=sm.station_id AND s.municipio_id=sm.municipio_id WHERE sm.station_id=p_station_id AND sm.municipio_id=v_municipio AND sm.usuario_id=v_usuario AND sm.ativo AND s.status='ATIVO') THEN RAISE EXCEPTION 'Usuário não está vinculado a posto ativo' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_old FROM public.fleet_fuelings f WHERE f.municipio_id=v_municipio AND f.idempotency_key=p_idempotency_key;
  IF FOUND THEN
    IF v_old.station_id IS DISTINCT FROM p_station_id OR v_old.vehicle_id IS DISTINCT FROM p_vehicle_id OR v_old.fuel_type_id IS DISTINCT FROM p_fuel_type_id OR v_old.driver_id IS DISTINCT FROM p_driver_id OR v_old.responsible_unit_id IS DISTINCT FROM p_responsible_unit_id OR v_old.beneficiary_unit_id IS DISTINCT FROM p_beneficiary_unit_id OR v_old.authorization_id IS DISTINCT FROM p_authorization_id OR v_old.performed_at IS DISTINCT FROM p_performed_at OR v_old.liters IS DISTINCT FROM p_liters OR v_old.unit_price IS DISTINCT FROM p_unit_price OR v_old.odometer_km IS DISTINCT FROM p_odometer_km OR v_old.station_receipt_number IS DISTINCT FROM NULLIF(btrim(p_station_receipt_number),'') OR v_old.notes IS DISTINCT FROM NULLIF(btrim(p_notes),'') OR v_old.late_entry_reason IS DISTINCT FROM NULLIF(btrim(p_late_entry_reason),'') OR v_old.record_origin IS DISTINCT FROM p_source THEN RAISE EXCEPTION 'A chave de idempotência já foi usada com dados diferentes'; END IF;
    RETURN QUERY SELECT v_old.id,v_old.protocol_number,v_old.status::text,v_old.operational_status,v_old.review_status,v_old.submitted_at,v_old.total_amount; RETURN;
  END IF;
  INSERT INTO public.fleet_fuelings(municipio_id,station_id,vehicle_id,fuel_type_id,driver_id,responsible_unit_id,beneficiary_unit_id,authorization_id,status,performed_at,created_by,liters,unit_price,odometer_km,station_receipt_number,notes,late_entry_reason,idempotency_key,record_origin,operational_status,review_status)
  VALUES(v_municipio,p_station_id,p_vehicle_id,p_fuel_type_id,p_driver_id,p_responsible_unit_id,p_beneficiary_unit_id,p_authorization_id,
    CASE WHEN p_source='POSTO' THEN 'ENVIADO_PELO_POSTO'::public.fleet_fueling_status ELSE 'PENDENTE_DE_COMPROVANTE'::public.fleet_fueling_status END,
    p_performed_at,v_usuario,p_liters,p_unit_price,p_odometer_km,NULLIF(btrim(p_station_receipt_number),''),NULLIF(btrim(p_notes),''),NULLIF(btrim(p_late_entry_reason),''),p_idempotency_key,p_source,
    'REGISTRADO','PENDENTE_DE_CONFERENCIA') RETURNING id INTO v_id;
  RETURN QUERY SELECT f.id,f.protocol_number,f.status::text,f.operational_status,f.review_status,f.submitted_at,f.total_amount FROM public.fleet_fuelings f WHERE f.id=v_id;
END $$;

-- Resolver alerta exige ator, data e motivo, sem apagar a ocorrência original.
CREATE OR REPLACE FUNCTION public.fleet_resolve_fueling_alert(p_alert_id uuid,p_resolution_notes text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id(); v_alert public.fleet_inconsistencies%ROWTYPE;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL OR NOT public.fleet_is_manager() THEN RAISE EXCEPTION 'Somente Gestor de Frotas/Admin pode resolver alertas' USING ERRCODE='42501'; END IF;
  IF length(btrim(COALESCE(p_resolution_notes,'')))<8 THEN RAISE EXCEPTION 'Registre a análise e a providência adotada'; END IF;
  SELECT * INTO v_alert FROM public.fleet_inconsistencies WHERE id=p_alert_id AND municipio_id=v_municipio AND status IN ('ABERTA','EM_ANALISE') FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Alerta inexistente ou já resolvido'; END IF;
  UPDATE public.fleet_inconsistencies SET status='RESOLVIDA',resolved_by=v_usuario,resolved_at=clock_timestamp(),resolution_notes=btrim(p_resolution_notes) WHERE id=v_alert.id;
  INSERT INTO public.fleet_fueling_audit(municipio_id,fueling_id,event_type,field_name,old_value,new_value,reason,performed_by,actor_type)
  VALUES(v_municipio,v_alert.fueling_id,'ALERTA_RESOLVIDO','alerta_id',to_jsonb(v_alert.id),to_jsonb(v_alert.id),btrim(p_resolution_notes),v_usuario,'USUARIO');
  RETURN jsonb_build_object('alert_id',v_alert.id,'status','RESOLVIDA');
END $$;

-- Sumarização server-side para painel do posto: indicadores não dependem do limite da lista.
CREATE OR REPLACE FUNCTION public.fleet_supplier_fueling_summary(p_station_id uuid)
RETURNS TABLE(today_count bigint,today_liters numeric,today_amount numeric,pending_documents bigint,pending_review bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='pg_catalog','public','pg_temp' AS $$
DECLARE v_municipio uuid:=public.fleet_current_municipio_id(); v_usuario integer:=public.fleet_current_usuario_id();
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL THEN RAISE EXCEPTION 'Sessão autenticada necessária' USING ERRCODE='42501'; END IF;
  IF NOT public.fleet_is_manager() AND NOT EXISTS(SELECT 1 FROM public.fleet_station_members sm WHERE sm.station_id=p_station_id AND sm.municipio_id=v_municipio AND sm.usuario_id=v_usuario AND sm.ativo) THEN RAISE EXCEPTION 'Posto fora do escopo do usuário' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT count(*) FILTER(WHERE (f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date=(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date),
    COALESCE(sum(f.liters) FILTER(WHERE (f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date=(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date),0),
    COALESCE(sum(f.total_amount) FILTER(WHERE (f.performed_at AT TIME ZONE 'America/Sao_Paulo')::date=(clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date),0),
    count(*) FILTER(WHERE f.status NOT IN ('CANCELADO','INCLUIDO_NO_FECHAMENTO') AND NOT EXISTS(SELECT 1 FROM public.fleet_fueling_documents d WHERE d.fueling_id=f.id AND d.is_current)),
    count(*) FILTER(WHERE f.status NOT IN ('CANCELADO','INCLUIDO_NO_FECHAMENTO') AND f.review_status<>'CONFERIDO')
  FROM public.fleet_fuelings f WHERE f.municipio_id=v_municipio AND f.station_id=p_station_id;
END $$;

-- Grants de execução: sem acesso anônimo; rotinas críticas exigem Supabase Auth.
REVOKE ALL ON FUNCTION public.fleet_supplier_fuel_options(uuid,uuid,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_submit_fueling(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,numeric,numeric,text,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_register_fueling_document(uuid,text,text,text,bigint,text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_review_fueling_document(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_review_fueling(uuid,text,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_cancel_fueling(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_request_fueling_adjustment(uuid,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_decide_fueling_adjustment(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_resolve_fueling_alert(uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_supplier_fueling_summary(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_search_fuelings(text,timestamptz,timestamptz,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,boolean,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_fuel_options(uuid,uuid,timestamptz),public.fleet_submit_fueling(uuid,uuid,uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,numeric,numeric,numeric,text,text,text,text),public.fleet_register_fueling_document(uuid,text,text,text,bigint,text,text,uuid),public.fleet_review_fueling_document(uuid,text,text),public.fleet_review_fueling(uuid,text,text,text),public.fleet_cancel_fueling(uuid,text),public.fleet_request_fueling_adjustment(uuid,text,jsonb),public.fleet_decide_fueling_adjustment(uuid,text,text),public.fleet_resolve_fueling_alert(uuid,text),public.fleet_supplier_fueling_summary(uuid),public.fleet_search_fuelings(text,timestamptz,timestamptz,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,boolean,boolean,boolean,integer,integer) TO authenticated;

-- Armazenamento privado: permite leitura/envio, nunca edição ou exclusão silenciosa.
DROP POLICY IF EXISTS fleet_storage_manager_delete ON storage.objects;
DROP POLICY IF EXISTS fleet_storage_manager_update ON storage.objects;

COMMIT;
