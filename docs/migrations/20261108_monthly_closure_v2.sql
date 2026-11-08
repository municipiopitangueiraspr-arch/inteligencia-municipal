-- Fluxo v2 do Fechamento Mensal de Frotas.
-- A linha fleet_monthly_closures representa o agrupador municipal da competência;
-- fleet_monthly_closure_station_checks representa um fechamento individual por posto.
-- Totais são recalculados no servidor; anexos permanecem no bucket privado fleet-documents.
BEGIN;

ALTER TABLE public.fleet_monthly_closure_station_checks
  ADD COLUMN IF NOT EXISTS closure_status public.fleet_closure_status NOT NULL DEFAULT 'ABERTO',
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_by integer REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS no_activity_reported boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_activity_confirmed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_notes text;

CREATE TABLE IF NOT EXISTS public.fleet_monthly_closure_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  closure_id uuid NOT NULL REFERENCES public.fleet_monthly_closures(id) ON DELETE RESTRICT,
  station_check_id uuid NOT NULL REFERENCES public.fleet_monthly_closure_station_checks(id) ON DELETE RESTRICT,
  station_id uuid NOT NULL REFERENCES public.fleet_fuel_stations(id) ON DELETE RESTRICT,
  fueling_id uuid NOT NULL UNIQUE REFERENCES public.fleet_fuelings(id) ON DELETE RESTRICT,
  included_at timestamptz NOT NULL DEFAULT now(),
  included_by integer REFERENCES public.usuarios(id),
  inclusion_type text NOT NULL DEFAULT 'AUTOMATICA'
    CHECK (inclusion_type IN ('AUTOMATICA','MANUAL','COMPLEMENTAR','MIGRACAO_V2')),
  is_included boolean NOT NULL DEFAULT true,
  notes text,
  UNIQUE (closure_id, fueling_id)
);
CREATE INDEX IF NOT EXISTS fleet_monthly_closure_transactions_station_idx
  ON public.fleet_monthly_closure_transactions (closure_id, station_id, included_at);

CREATE TABLE IF NOT EXISTS public.fleet_monthly_closure_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  closure_id uuid NOT NULL REFERENCES public.fleet_monthly_closures(id) ON DELETE RESTRICT,
  station_check_id uuid NOT NULL REFERENCES public.fleet_monthly_closure_station_checks(id) ON DELETE RESTRICT,
  station_id uuid NOT NULL REFERENCES public.fleet_fuel_stations(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN ('NOTA_FISCAL','DEMONSTRATIVO','OUTRO')),
  document_number text,
  document_series text,
  access_key text,
  issue_date date,
  issuer_document text,
  document_amount numeric(14,2) NOT NULL CHECK (document_amount >= 0),
  file_name text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','image/jpeg','image/png','image/webp')),
  file_size_bytes bigint NOT NULL CHECK (file_size_bytes BETWEEN 1 AND 10485760),
  document_status public.fleet_document_status NOT NULL DEFAULT 'ENVIADO',
  uploaded_by integer NOT NULL REFERENCES public.usuarios(id),
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by integer REFERENCES public.usuarios(id),
  reviewed_at timestamptz,
  rejection_reason text,
  replaced_document_id uuid REFERENCES public.fleet_monthly_closure_documents(id),
  is_current boolean NOT NULL DEFAULT true,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipio_id, storage_path)
);
CREATE INDEX IF NOT EXISTS fleet_monthly_closure_documents_lookup_idx
  ON public.fleet_monthly_closure_documents (closure_id, station_id, document_type, uploaded_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS fleet_monthly_closure_documents_access_key_uq
  ON public.fleet_monthly_closure_documents (municipio_id, upper(btrim(access_key)))
  WHERE NULLIF(btrim(access_key), '') IS NOT NULL AND is_current;
CREATE UNIQUE INDEX IF NOT EXISTS fleet_monthly_closure_documents_number_uq
  ON public.fleet_monthly_closure_documents
    (municipio_id, station_id, document_type, lower(btrim(document_number)), lower(coalesce(btrim(document_series),'')), issue_date)
  WHERE document_type = 'NOTA_FISCAL' AND is_current AND NULLIF(btrim(document_number),'') IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fleet_monthly_closure_discrepancies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  closure_id uuid NOT NULL REFERENCES public.fleet_monthly_closures(id) ON DELETE RESTRICT,
  station_check_id uuid NOT NULL REFERENCES public.fleet_monthly_closure_station_checks(id) ON DELETE RESTRICT,
  station_id uuid NOT NULL REFERENCES public.fleet_fuel_stations(id) ON DELETE RESTRICT,
  fueling_id uuid REFERENCES public.fleet_fuelings(id) ON DELETE RESTRICT,
  discrepancy_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('INFORMATIVO','ATENCAO','BLOQUEIO')),
  description text NOT NULL,
  amount_involved numeric(14,2),
  status text NOT NULL DEFAULT 'ABERTA'
    CHECK (status IN ('ABERTA','AGUARDANDO_RESPOSTA','RESPONDIDA','RESOLVIDA','MANTIDA')),
  is_system_generated boolean NOT NULL DEFAULT false,
  identified_by integer REFERENCES public.usuarios(id),
  identified_at timestamptz NOT NULL DEFAULT now(),
  response_deadline timestamptz,
  resolved_by integer REFERENCES public.usuarios(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_monthly_closure_discrepancies_lookup_idx
  ON public.fleet_monthly_closure_discrepancies (closure_id, station_id, status, identified_at DESC);

CREATE TABLE IF NOT EXISTS public.fleet_monthly_closure_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  closure_id uuid NOT NULL REFERENCES public.fleet_monthly_closures(id) ON DELETE RESTRICT,
  station_check_id uuid NOT NULL REFERENCES public.fleet_monthly_closure_station_checks(id) ON DELETE RESTRICT,
  station_id uuid NOT NULL REFERENCES public.fleet_fuel_stations(id) ON DELETE RESTRICT,
  discrepancy_id uuid REFERENCES public.fleet_monthly_closure_discrepancies(id) ON DELETE RESTRICT,
  sender_user_id integer NOT NULL REFERENCES public.usuarios(id),
  sender_scope text NOT NULL CHECK (sender_scope IN ('MUNICIPAL','POSTO')),
  message_type text NOT NULL CHECK (message_type IN ('SOLICITACAO_ESCLARECIMENTO','RESPOSTA','COMPLEMENTO_DOCUMENTAL','OBSERVACAO','DECISAO')),
  message text NOT NULL CHECK (length(btrim(message)) BETWEEN 3 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_monthly_closure_messages_lookup_idx
  ON public.fleet_monthly_closure_messages (closure_id, station_id, created_at);

CREATE TABLE IF NOT EXISTS public.fleet_monthly_closure_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  closure_id uuid NOT NULL REFERENCES public.fleet_monthly_closures(id) ON DELETE RESTRICT,
  station_check_id uuid NOT NULL REFERENCES public.fleet_monthly_closure_station_checks(id) ON DELETE RESTRICT,
  station_id uuid NOT NULL REFERENCES public.fleet_fuel_stations(id) ON DELETE RESTRICT,
  review_type text NOT NULL CHECK (review_type IN ('CONFERENCIA_POSTO','CONFERENCIA_ABASTECIMENTOS','REABERTURA','FECHAMENTO_MENSAL')),
  review_result text NOT NULL,
  reviewer_id integer NOT NULL REFERENCES public.usuarios(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  approval_reference text
);
CREATE INDEX IF NOT EXISTS fleet_monthly_closure_reviews_lookup_idx
  ON public.fleet_monthly_closure_reviews (closure_id, station_id, reviewed_at DESC);

CREATE TABLE IF NOT EXISTS public.fleet_monthly_closure_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  closure_id uuid NOT NULL REFERENCES public.fleet_monthly_closures(id) ON DELETE RESTRICT,
  station_check_id uuid REFERENCES public.fleet_monthly_closure_station_checks(id) ON DELETE RESTRICT,
  station_id uuid REFERENCES public.fleet_fuel_stations(id) ON DELETE RESTRICT,
  entity_table text NOT NULL,
  entity_id uuid NOT NULL,
  action_type text NOT NULL,
  previous_status text,
  new_status text,
  reason text,
  performed_by integer REFERENCES public.usuarios(id),
  performed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS fleet_monthly_closure_history_lookup_idx
  ON public.fleet_monthly_closure_history (closure_id, station_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS public.fleet_monthly_closure_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipio_id uuid NOT NULL REFERENCES public.municipios(id),
  closure_id uuid NOT NULL REFERENCES public.fleet_monthly_closures(id) ON DELETE RESTRICT,
  station_check_id uuid REFERENCES public.fleet_monthly_closure_station_checks(id) ON DELETE RESTRICT,
  station_id uuid REFERENCES public.fleet_fuel_stations(id) ON DELETE RESTRICT,
  version_number integer NOT NULL CHECK (version_number > 0),
  snapshot_data jsonb NOT NULL,
  total_transactions integer NOT NULL DEFAULT 0,
  total_liters numeric(14,3) NOT NULL DEFAULT 0,
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  invoice_amount numeric(14,2),
  difference_amount numeric(14,2),
  created_by integer REFERENCES public.usuarios(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  UNIQUE (station_check_id, version_number)
);
CREATE INDEX IF NOT EXISTS fleet_monthly_closure_versions_lookup_idx
  ON public.fleet_monthly_closure_versions (closure_id, station_id, version_number DESC);

CREATE OR REPLACE FUNCTION public.fleet_is_closure_manager()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.fleet_current_municipio_id() IS NOT NULL
     AND public.fleet_current_usuario_id() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.fleet_roles r
       WHERE r.municipio_id = public.fleet_current_municipio_id()
         AND r.usuario_id = public.fleet_current_usuario_id()
         AND r.ativo = true
         AND r.role IN ('ADMINISTRADOR'::public.fleet_user_role, 'GESTOR_FROTAS'::public.fleet_user_role)
     );
$function$;

CREATE OR REPLACE FUNCTION public.fleet_can_read_monthly_closures()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT public.fleet_is_closure_manager()
     OR EXISTS (
       SELECT 1 FROM public.fleet_roles r
       WHERE r.municipio_id = public.fleet_current_municipio_id()
         AND r.usuario_id = public.fleet_current_usuario_id()
         AND r.ativo = true
         AND r.role = 'PREFEITO'::public.fleet_user_role
  );
$function$;

CREATE OR REPLACE FUNCTION public.fleet_monthly_closure_municipal_summary(
  p_reference_year smallint,p_reference_month smallint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_closure public.fleet_monthly_closures%ROWTYPE;
  v_summary jsonb;
BEGIN
  IF NOT public.fleet_can_read_monthly_closures() OR v_municipio IS NULL THEN
    RAISE EXCEPTION 'Este perfil não possui consulta gerencial ao fechamento municipal.' USING ERRCODE='42501';
  END IF;
  IF p_reference_year NOT BETWEEN 2000 AND 2200 OR p_reference_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Competência inválida.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures c
  WHERE c.municipio_id=v_municipio AND c.reference_year=p_reference_year AND c.reference_month=p_reference_month;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('closure',NULL,'summary',jsonb_build_object(
      'station_count',0,'stations_requested',0,'stations_reviewed',0,'stations_pending',0,
      'fueling_count',0,'liters',0,'registered_amount',0,'invoice_amount',NULL,
      'difference_amount',NULL,'documents_pending',0,'unresolved_discrepancies',0));
  END IF;
  SELECT jsonb_build_object(
    'station_count',count(sc.id),
    'stations_requested',count(sc.id) FILTER (WHERE sc.requested_at IS NOT NULL),
    'stations_reviewed',count(sc.id) FILTER (WHERE sc.closure_status IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status)),
    'stations_pending',count(sc.id) FILTER (WHERE sc.closure_status NOT IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status)),
    'fueling_count',COALESCE(sum(sc.registered_fueling_count),0),
    'liters',COALESCE(sum(sc.registered_liters),0),
    'registered_amount',COALESCE(sum(sc.registered_amount),0),
    'invoice_amount',CASE WHEN count(sc.invoiced_amount)>0 THEN sum(sc.invoiced_amount) ELSE NULL END,
    'difference_amount',CASE WHEN count(sc.divergence_amount)>0 THEN sum(sc.divergence_amount) ELSE NULL END,
    'documents_pending',COALESCE(sum(sc.documents_pending_count),0),
    'unresolved_discrepancies',(SELECT count(*) FROM public.fleet_monthly_closure_discrepancies d
      WHERE d.closure_id=v_closure.id AND d.status<>'RESOLVIDA')
  ) INTO v_summary
  FROM public.fleet_monthly_closure_station_checks sc WHERE sc.closure_id=v_closure.id;
  RETURN jsonb_build_object('closure',jsonb_build_object(
    'reference_year',v_closure.reference_year,'reference_month',v_closure.reference_month,
    'status',v_closure.status,'started_at',v_closure.started_at,'checked_at',v_closure.checked_at,
    'closed_at',v_closure.closed_at,'reopened_at',v_closure.reopened_at),
    'summary',v_summary);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_is_station_member(p_station_id uuid, p_municipio_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT p_station_id IS NOT NULL
     AND p_municipio_id IS NOT NULL
     AND p_municipio_id = public.fleet_current_municipio_id()
     AND EXISTS (
       SELECT 1 FROM public.fleet_station_members sm
       WHERE sm.station_id = p_station_id
         AND sm.municipio_id = p_municipio_id
         AND sm.usuario_id = public.fleet_current_usuario_id()
         AND sm.ativo = true
     );
$function$;

CREATE OR REPLACE FUNCTION public.fleet_log_monthly_closure_history()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_old jsonb := CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) ELSE NULL END;
  v_new jsonb := CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) ELSE NULL END;
  v_closure_id uuid;
  v_check_id uuid;
  v_station_id uuid;
  v_entity_id uuid;
  v_municipio_id uuid;
  v_old_status text;
  v_new_status text;
  v_reason text;
BEGIN
  IF TG_TABLE_NAME = 'fleet_monthly_closures' THEN
    v_closure_id := COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid);
    v_entity_id := v_closure_id;
    v_municipio_id := COALESCE((v_new->>'municipio_id')::uuid, (v_old->>'municipio_id')::uuid);
  ELSE
    v_closure_id := COALESCE((v_new->>'closure_id')::uuid, (v_old->>'closure_id')::uuid);
    v_entity_id := COALESCE((v_new->>'id')::uuid, (v_old->>'id')::uuid);
    v_municipio_id := COALESCE((v_new->>'municipio_id')::uuid, (v_old->>'municipio_id')::uuid);
    v_check_id := COALESCE((v_new->>'station_check_id')::uuid, (v_old->>'station_check_id')::uuid);
    IF TG_TABLE_NAME = 'fleet_monthly_closure_station_checks' THEN
      v_check_id := v_entity_id;
    END IF;
    v_station_id := COALESCE((v_new->>'station_id')::uuid, (v_old->>'station_id')::uuid);
  END IF;
  v_old_status := COALESCE(v_old->>'closure_status', v_old->>'status');
  v_new_status := COALESCE(v_new->>'closure_status', v_new->>'status');
  v_reason := COALESCE(v_new->>'reopening_reason', v_new->>'resolution_notes', v_new->>'review_notes', v_new->>'notes', v_old->>'resolution_notes', v_old->>'review_notes', v_old->>'notes');

  INSERT INTO public.fleet_monthly_closure_history (
    municipio_id, closure_id, station_check_id, station_id, entity_table, entity_id,
    action_type, previous_status, new_status, reason, performed_by, metadata
  ) VALUES (
    v_municipio_id, v_closure_id, v_check_id, v_station_id, TG_TABLE_NAME, v_entity_id,
    TG_OP, v_old_status, v_new_status, v_reason, public.fleet_current_usuario_id(),
    jsonb_build_object('old', v_old, 'new', v_new)
  );
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_snapshot_monthly_closure_station(p_station_check_id uuid, p_reason text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
  v_closure public.fleet_monthly_closures%ROWTYPE;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_version integer;
  v_snapshot jsonb;
  v_version_id uuid;
BEGIN
  SELECT * INTO v_check
  FROM public.fleet_monthly_closure_station_checks
  WHERE id = p_station_check_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures WHERE id = v_check.closure_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_period_start := make_timestamptz(v_closure.reference_year::integer, v_closure.reference_month::integer, 1, 0, 0, 0, 'America/Sao_Paulo');
  v_period_end := v_period_start + interval '1 month';
  SELECT COALESCE(MAX(version_number),0) + 1 INTO v_version
  FROM public.fleet_monthly_closure_versions WHERE station_check_id = v_check.id;

  v_snapshot := jsonb_build_object(
    'closure', jsonb_build_object('id',v_closure.id,'reference_year',v_closure.reference_year,'reference_month',v_closure.reference_month,'status',v_closure.status),
    'station_check', to_jsonb(v_check),
    'fuelings', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',f.id,'status',f.status,'performed_at',f.performed_at,'submitted_at',f.submitted_at,'liters',f.liters,'unit_price',f.unit_price,'total_amount',f.total_amount,'odometer_km',f.odometer_km,'station_receipt_number',f.station_receipt_number))
      FROM public.fleet_monthly_closure_transactions t
      JOIN public.fleet_fuelings f ON f.id=t.fueling_id
      WHERE t.closure_id=v_closure.id AND t.station_id=v_check.station_id AND t.is_included
        AND f.performed_at >= v_period_start AND f.performed_at < v_period_end
    ), '[]'::jsonb),
    'documents', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',d.id,'document_type',d.document_type,'document_number',d.document_number,'document_series',d.document_series,'access_key',d.access_key,'issue_date',d.issue_date,'issuer_document',d.issuer_document,'document_amount',d.document_amount,'file_name',d.file_name,'storage_path',d.storage_path,'document_status',d.document_status,'is_current',d.is_current,'uploaded_at',d.uploaded_at,'reviewed_at',d.reviewed_at))
      FROM public.fleet_monthly_closure_documents d
      WHERE d.station_check_id=v_check.id
    ), '[]'::jsonb),
    'discrepancies', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id',d.id,'type',d.discrepancy_type,'severity',d.severity,'description',d.description,'amount_involved',d.amount_involved,'status',d.status,'identified_at',d.identified_at,'resolution_notes',d.resolution_notes))
      FROM public.fleet_monthly_closure_discrepancies d
      WHERE d.station_check_id=v_check.id
    ), '[]'::jsonb)
  );

  INSERT INTO public.fleet_monthly_closure_versions (
    municipio_id, closure_id, station_check_id, station_id, version_number,
    snapshot_data, total_transactions, total_liters, total_amount, invoice_amount,
    difference_amount, created_by, reason
  ) VALUES (
    v_check.municipio_id, v_check.closure_id, v_check.id, v_check.station_id, v_version,
    v_snapshot, v_check.registered_fueling_count, v_check.registered_liters,
    v_check.registered_amount, v_check.invoiced_amount, v_check.divergence_amount,
    public.fleet_current_usuario_id(), p_reason
  ) RETURNING id INTO v_version_id;
  RETURN v_version_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_snapshot_monthly_closure_station_trigger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NEW.closure_status IS DISTINCT FROM OLD.closure_status
     AND NEW.closure_status IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status,'REABERTO'::public.fleet_closure_status) THEN
    PERFORM public.fleet_snapshot_monthly_closure_station(NEW.id, COALESCE(NEW.review_notes, NEW.notes));
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fleet_monthly_closures_history ON public.fleet_monthly_closures;
CREATE TRIGGER fleet_monthly_closures_history AFTER INSERT OR UPDATE ON public.fleet_monthly_closures
  FOR EACH ROW EXECUTE FUNCTION public.fleet_log_monthly_closure_history();
DROP TRIGGER IF EXISTS fleet_monthly_closure_station_checks_history ON public.fleet_monthly_closure_station_checks;
CREATE TRIGGER fleet_monthly_closure_station_checks_history AFTER INSERT OR UPDATE ON public.fleet_monthly_closure_station_checks
  FOR EACH ROW EXECUTE FUNCTION public.fleet_log_monthly_closure_history();
DROP TRIGGER IF EXISTS fleet_monthly_closure_transactions_history ON public.fleet_monthly_closure_transactions;
CREATE TRIGGER fleet_monthly_closure_transactions_history AFTER INSERT OR UPDATE ON public.fleet_monthly_closure_transactions
  FOR EACH ROW EXECUTE FUNCTION public.fleet_log_monthly_closure_history();
DROP TRIGGER IF EXISTS fleet_monthly_closure_documents_history ON public.fleet_monthly_closure_documents;
CREATE TRIGGER fleet_monthly_closure_documents_history AFTER INSERT OR UPDATE ON public.fleet_monthly_closure_documents
  FOR EACH ROW EXECUTE FUNCTION public.fleet_log_monthly_closure_history();
DROP TRIGGER IF EXISTS fleet_monthly_closure_discrepancies_history ON public.fleet_monthly_closure_discrepancies;
CREATE TRIGGER fleet_monthly_closure_discrepancies_history AFTER INSERT OR UPDATE ON public.fleet_monthly_closure_discrepancies
  FOR EACH ROW EXECUTE FUNCTION public.fleet_log_monthly_closure_history();
DROP TRIGGER IF EXISTS fleet_monthly_closure_messages_history ON public.fleet_monthly_closure_messages;
CREATE TRIGGER fleet_monthly_closure_messages_history AFTER INSERT ON public.fleet_monthly_closure_messages
  FOR EACH ROW EXECUTE FUNCTION public.fleet_log_monthly_closure_history();
DROP TRIGGER IF EXISTS fleet_monthly_closure_reviews_history ON public.fleet_monthly_closure_reviews;
CREATE TRIGGER fleet_monthly_closure_reviews_history AFTER INSERT ON public.fleet_monthly_closure_reviews
  FOR EACH ROW EXECUTE FUNCTION public.fleet_log_monthly_closure_history();
DROP TRIGGER IF EXISTS fleet_monthly_closure_station_snapshot ON public.fleet_monthly_closure_station_checks;
CREATE TRIGGER fleet_monthly_closure_station_snapshot AFTER UPDATE OF closure_status ON public.fleet_monthly_closure_station_checks
  FOR EACH ROW EXECUTE FUNCTION public.fleet_snapshot_monthly_closure_station_trigger();

CREATE OR REPLACE FUNCTION public.fleet_recompute_monthly_closure_parent(p_closure_id uuid)
RETURNS public.fleet_closure_status
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_next public.fleet_closure_status;
  v_total integer;
  v_fully_closed integer;
  v_reviewed integer;
  v_in_review integer;
  v_reopened integer;
  v_divergent integer;
  v_actor integer := public.fleet_current_usuario_id();
BEGIN
  SELECT count(*),
         count(*) FILTER (WHERE closure_status='FECHADO'),
         count(*) FILTER (WHERE closure_status IN ('CONFERIDO','FECHADO')),
         count(*) FILTER (WHERE closure_status='EM_CONFERENCIA'),
         count(*) FILTER (WHERE closure_status='REABERTO'),
         count(*) FILTER (WHERE closure_status='COM_DIVERGENCIA')
    INTO v_total, v_fully_closed, v_reviewed, v_in_review, v_reopened, v_divergent
  FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id=p_closure_id;

  IF EXISTS (
    SELECT 1 FROM public.fleet_monthly_closure_discrepancies d
    WHERE d.closure_id=p_closure_id AND d.status <> 'RESOLVIDA'
  ) OR v_divergent > 0 THEN
    v_next := 'COM_DIVERGENCIA'::public.fleet_closure_status;
  ELSIF v_total > 0 AND v_fully_closed = v_total THEN
    v_next := 'FECHADO'::public.fleet_closure_status;
  ELSIF v_reopened > 0 THEN
    v_next := 'REABERTO'::public.fleet_closure_status;
  ELSIF v_total > 0 AND v_reviewed = v_total THEN
    v_next := 'CONFERIDO'::public.fleet_closure_status;
  ELSIF v_in_review > 0 THEN
    v_next := 'EM_CONFERENCIA'::public.fleet_closure_status;
  ELSE
    v_next := 'ABERTO'::public.fleet_closure_status;
  END IF;

  UPDATE public.fleet_monthly_closures c
  SET status=v_next,
      checked_by=CASE WHEN v_next='CONFERIDO'::public.fleet_closure_status AND c.status IS DISTINCT FROM v_next THEN v_actor ELSE c.checked_by END,
      checked_at=CASE WHEN v_next='CONFERIDO'::public.fleet_closure_status AND c.status IS DISTINCT FROM v_next THEN clock_timestamp() ELSE c.checked_at END,
      updated_at=clock_timestamp()
  WHERE c.id=p_closure_id AND (c.status IS DISTINCT FROM v_next OR (v_next='CONFERIDO'::public.fleet_closure_status AND c.checked_at IS NULL));
  RETURN v_next;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_internal_refresh_monthly_closure(p_closure_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_closure public.fleet_monthly_closures%ROWTYPE;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_actor integer := public.fleet_current_usuario_id();
  v_counts jsonb;
  v_check record;
  v_previous_internal text := current_setting('app.fleet_monthly_closure_internal',true);
BEGIN
  SELECT * INTO v_closure FROM public.fleet_monthly_closures WHERE id=p_closure_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Competência mensal não encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_closure.municipio_id IS DISTINCT FROM public.fleet_current_municipio_id() THEN
    RAISE EXCEPTION 'Competência fora do município autenticado.' USING ERRCODE='42501';
  END IF;
  IF v_closure.status IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status) THEN
    RETURN jsonb_build_object('closure_id',v_closure.id,'status',v_closure.status,'refresh_skipped',true);
  END IF;

  v_period_start := make_timestamptz(v_closure.reference_year::integer,v_closure.reference_month::integer,1,0,0,0,'America/Sao_Paulo');
  v_period_end := v_period_start + interval '1 month';

  WITH station_scope AS (
    SELECT s.id AS station_id, s.municipio_id
    FROM public.fleet_fuel_stations s
    WHERE s.municipio_id=v_closure.municipio_id AND s.status='ATIVO'::public.fleet_station_status
    UNION
    SELECT DISTINCT f.station_id, f.municipio_id
    FROM public.fleet_fuelings f
    WHERE f.municipio_id=v_closure.municipio_id AND f.performed_at>=v_period_start AND f.performed_at<v_period_end
    UNION
    SELECT sc.station_id, sc.municipio_id
    FROM public.fleet_monthly_closure_station_checks sc WHERE sc.closure_id=v_closure.id
  ), rollups AS (
    SELECT ss.station_id, ss.municipio_id,
      count(f.id) FILTER (WHERE f.status <> 'CANCELADO'::public.fleet_fueling_status)::integer AS fueling_count,
      COALESCE(sum(f.liters) FILTER (WHERE f.status <> 'CANCELADO'::public.fleet_fueling_status),0)::numeric(14,3) AS liters_total,
      COALESCE(sum(f.total_amount) FILTER (WHERE f.status <> 'CANCELADO'::public.fleet_fueling_status),0)::numeric(14,2) AS amount_total,
      count(f.id) FILTER (WHERE f.status <> 'CANCELADO'::public.fleet_fueling_status AND NOT EXISTS (
        SELECT 1 FROM public.fleet_fueling_documents fd
        WHERE fd.municipio_id=f.municipio_id AND fd.fueling_id=f.id AND fd.is_current=true
          AND fd.document_status='ACEITO'::public.fleet_document_status
          AND NULLIF(btrim(fd.storage_path),'') IS NOT NULL
      ))::integer AS fueling_documents_pending
    FROM station_scope ss
    LEFT JOIN public.fleet_fuelings f ON f.station_id=ss.station_id AND f.municipio_id=ss.municipio_id
      AND f.performed_at>=v_period_start AND f.performed_at<v_period_end
    GROUP BY ss.station_id,ss.municipio_id
  ), invoices AS (
    SELECT d.station_id,
      count(*) FILTER (WHERE d.is_current AND d.document_type='NOTA_FISCAL' AND d.document_status NOT IN ('REJEITADO'::public.fleet_document_status,'SUBSTITUIDO'::public.fleet_document_status))::integer AS invoice_count,
      count(*) FILTER (WHERE d.is_current AND d.document_status IN ('PENDENTE'::public.fleet_document_status,'ENVIADO'::public.fleet_document_status,'EM_ANALISE'::public.fleet_document_status))::integer AS documents_pending,
      COALESCE(sum(d.document_amount) FILTER (WHERE d.is_current AND d.document_type='NOTA_FISCAL' AND d.document_status NOT IN ('REJEITADO'::public.fleet_document_status,'SUBSTITUIDO'::public.fleet_document_status)),0)::numeric(14,2) AS invoice_total
    FROM public.fleet_monthly_closure_documents d
    WHERE d.closure_id=v_closure.id
    GROUP BY d.station_id
  )
  INSERT INTO public.fleet_monthly_closure_station_checks (
    municipio_id,closure_id,station_id,registered_fueling_count,registered_liters,registered_amount,
    invoiced_amount,divergence_amount,documents_pending_count,status,closure_status
  )
  SELECT r.municipio_id,v_closure.id,r.station_id,r.fueling_count,r.liters_total,r.amount_total,
    CASE WHEN COALESCE(i.invoice_count,0)>0 THEN i.invoice_total ELSE NULL END,
    CASE WHEN COALESCE(i.invoice_count,0)>0 THEN (i.invoice_total-r.amount_total)::numeric(14,2) ELSE NULL END,
    r.fueling_documents_pending + COALESCE(i.documents_pending,0),
    CASE WHEN COALESCE(i.invoice_count,0)>
0 THEN 'COM_DIVERGENCIA'
      WHEN r.fueling_count=0 AND COALESCE(existing.no_activity_confirmed,false) THEN 'CONFERIDO'
      WHEN r.fueling_count>0 AND r.fueling_documents_pending=0 AND COALESCE(i.invoice_count,0)>0
           AND COALESCE(i.documents_pending,0)=0 AND COALESCE(i.invoice_total-r.amount_total,0)=0 THEN 'CONFERIDO'
      ELSE 'PENDENTE' END,
    'ABERTO'::public.fleet_closure_status
  FROM rollups r
  LEFT JOIN invoices i ON i.station_id=r.station_id
  LEFT JOIN public.fleet_monthly_closure_station_checks existing
    ON existing.closure_id=v_closure.id AND existing.station_id=r.station_id
  ON CONFLICT (closure_id,station_id) DO UPDATE SET
    registered_fueling_count=EXCLUDED.registered_fueling_count,
    registered_liters=EXCLUDED.registered_liters,
    registered_amount=EXCLUDED.registered_amount,
    invoiced_amount=EXCLUDED.invoiced_amount,
    divergence_amount=EXCLUDED.divergence_amount,
    documents_pending_count=EXCLUDED.documents_pending_count,
    status=EXCLUDED.status;

  UPDATE public.fleet_monthly_closure_transactions t
  SET is_included=false,inclusion_type='MANUAL',
      notes=COALESCE(NULLIF(t.notes,''),'Composição ajustada após reabertura; vínculo anterior preservado no histórico.')
  FROM public.fleet_fuelings f
  WHERE t.closure_id=v_closure.id AND t.fueling_id=f.id
    AND v_closure.status='REABERTO'::public.fleet_closure_status
    AND (f.station_id<>t.station_id OR f.performed_at<v_period_start OR f.performed_at>=v_period_end OR f.status='CANCELADO'::public.fleet_fueling_status);

  INSERT INTO public.fleet_monthly_closure_transactions (
    municipio_id,closure_id,station_check_id,station_id,fueling_id,included_by,inclusion_type,is_included,notes
  )
  SELECT v_closure.municipio_id,v_closure.id,sc.id,f.station_id,f.id,v_actor,'AUTOMATICA',
         f.status <> 'CANCELADO'::public.fleet_fueling_status,
         CASE WHEN f.status='CANCELADO'::public.fleet_fueling_status THEN 'Cancelado; preservado fora do total líquido.' ELSE NULL END
  FROM public.fleet_fuelings f
  JOIN public.fleet_monthly_closure_station_checks sc
    ON sc.closure_id=v_closure.id AND sc.station_id=f.station_id AND sc.municipio_id=f.municipio_id
  WHERE f.municipio_id=v_closure.municipio_id AND f.performed_at>=v_period_start AND f.performed_at<v_period_end
  ON CONFLICT (fueling_id) DO UPDATE SET
    municipio_id=EXCLUDED.municipio_id,closure_id=EXCLUDED.closure_id,
    station_check_id=EXCLUDED.station_check_id,station_id=EXCLUDED.station_id,
    included_at=CASE WHEN public.fleet_monthly_closure_transactions.closure_id=EXCLUDED.closure_id
      THEN public.fleet_monthly_closure_transactions.included_at ELSE clock_timestamp() END,
    included_by=CASE WHEN public.fleet_monthly_closure_transactions.closure_id=EXCLUDED.closure_id
      THEN public.fleet_monthly_closure_transactions.included_by ELSE EXCLUDED.included_by END,
    inclusion_type=CASE WHEN public.fleet_monthly_closure_transactions.closure_id=EXCLUDED.closure_id
      THEN public.fleet_monthly_closure_transactions.inclusion_type ELSE 'COMPLEMENTAR' END,
    is_included=EXCLUDED.is_included,notes=EXCLUDED.notes
  WHERE public.fleet_monthly_closure_transactions.closure_id=EXCLUDED.closure_id
     OR EXISTS (
       SELECT 1 FROM public.fleet_monthly_closures previous_closure
       JOIN public.fleet_monthly_closure_station_checks previous_check
         ON previous_check.id=public.fleet_monthly_closure_transactions.station_check_id
       WHERE previous_closure.id=public.fleet_monthly_closure_transactions.closure_id
         AND (previous_closure.status='REABERTO'::public.fleet_closure_status
           OR (previous_closure.status='ABERTO'::public.fleet_closure_status
             AND previous_check.closure_status='ABERTO'::public.fleet_closure_status
             AND previous_check.requested_at IS NULL))
     );

  IF EXISTS (
    SELECT 1 FROM public.fleet_fuelings f
    WHERE f.municipio_id=v_closure.municipio_id AND f.performed_at>=v_period_start AND f.performed_at<v_period_end
      AND NOT EXISTS (SELECT 1 FROM public.fleet_monthly_closure_transactions t WHERE t.closure_id=v_closure.id AND t.fueling_id=f.id)
  ) THEN
    RAISE EXCEPTION 'Um abastecimento já pertence a outro fechamento não reaberto; a composição não pode ser duplicada.' USING ERRCODE='23514';
  END IF;

  FOR v_check IN
    SELECT sc.id,sc.station_id,sc.divergence_amount,sc.registered_amount,sc.invoiced_amount
    FROM public.fleet_monthly_closure_station_checks sc
    WHERE sc.closure_id=v_closure.id AND sc.divergence_amount IS NOT NULL AND sc.divergence_amount <> 0
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.fleet_monthly_closure_discrepancies d
      WHERE d.station_check_id=v_check.id AND d.discrepancy_type='DIVERGENCIA_VALOR_FISCAL'
        AND d.status IN ('ABERTA','AGUARDANDO_RESPOSTA','RESPONDIDA','MANTIDA')
    ) THEN
      INSERT INTO public.fleet_monthly_closure_discrepancies (
        municipio_id,closure_id,station_check_id,station_id,discrepancy_type,severity,
        description,amount_involved,is_system_generated,identified_by
      ) VALUES (
        v_closure.municipio_id,v_closure.id,v_check.id,v_check.station_id,'DIVERGENCIA_VALOR_FISCAL','BLOQUEIO',
        format('Diferença entre o valor fiscal (%s) e o valor registrado (%s).',v_check.invoiced_amount,v_check.registered_amount),
        abs(v_check.divergence_amount),true,v_actor
      );
    END IF;
    UPDATE public.fleet_monthly_closure_station_checks
    SET status='COM_DIVERGENCIA',closure_status='COM_DIVERGENCIA'
    WHERE id=v_check.id AND closure_status NOT IN ('FECHADO'::public.fleet_closure_status,'CONFERIDO'::public.fleet_closure_status);
  END LOOP;

  PERFORM set_config('app.fleet_monthly_closure_internal','on',true);
  PERFORM public.fleet_recompute_monthly_closure_parent(v_closure.id);
  PERFORM set_config('app.fleet_monthly_closure_internal',COALESCE(NULLIF(v_previous_internal,''),'off'),true);
  SELECT jsonb_build_object(
    'closure_id',v_closure.id,
    'station_count',count(*),
    'fueling_count',COALESCE(sum(sc.registered_fueling_count),0),
    'liters',COALESCE(sum(sc.registered_liters),0),
    'registered_amount',COALESCE(sum(sc.registered_amount),0),
    'invoiced_amount',COALESCE(sum(sc.invoiced_amount),0),
    'documents_pending',COALESCE(sum(sc.documents_pending_count),0)
  ) INTO v_counts
  FROM public.fleet_monthly_closure_station_checks sc WHERE sc.closure_id=v_closure.id;
  RETURN v_counts;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_prepare_monthly_closure(
  p_reference_year smallint,p_reference_month smallint,p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_actor integer := public.fleet_current_usuario_id();
  v_closure public.fleet_monthly_closures%ROWTYPE;
BEGIN
  IF NOT public.fleet_is_closure_manager() OR v_municipio IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador autenticado pode preparar a competência.' USING ERRCODE='42501';
  END IF;
  IF p_reference_year NOT BETWEEN 2000 AND 2200 OR p_reference_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Competência inválida.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_municipio::text||':'||p_reference_year::text||':'||p_reference_month::text,0));
  INSERT INTO public.fleet_monthly_closures (municipio_id,reference_year,reference_month,status,started_by,started_at,notes)
  VALUES (v_municipio,p_reference_year,p_reference_month,'ABERTO'::public.fleet_closure_status,v_actor,clock_timestamp(),NULLIF(btrim(p_notes),''))
  ON CONFLICT (municipio_id,reference_year,reference_month) DO NOTHING;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures
  WHERE municipio_id=v_municipio AND reference_year=p_reference_year AND reference_month=p_reference_month
  FOR UPDATE;
  IF v_closure.status NOT IN ('FECHADO'::public.fleet_closure_status,'CONFERIDO'::public.fleet_closure_status) THEN
    PERFORM public.fleet_internal_refresh_monthly_closure(v_closure.id);
  END IF;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures WHERE id=v_closure.id;
  RETURN to_jsonb(v_closure);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_monthly_closure(
  p_station_id uuid,p_reference_year smallint,p_reference_month smallint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_actor integer := public.fleet_current_usuario_id();
  v_closure public.fleet_monthly_closures%ROWTYPE;
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
BEGIN
  IF v_municipio IS NULL OR v_actor IS NULL OR NOT public.fleet_is_station_member(p_station_id,v_municipio) THEN
    RAISE EXCEPTION 'O usuário não pertence a este estabelecimento.' USING ERRCODE='42501';
  END IF;
  IF p_reference_year NOT BETWEEN 2000 AND 2200 OR p_reference_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Competência inválida.' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_municipio::text||':'||p_reference_year::text||':'||p_reference_month::text,0));
  INSERT INTO public.fleet_monthly_closures (municipio_id,reference_year,reference_month,status,started_by,started_at)
  VALUES (v_municipio,p_reference_year,p_reference_month,'ABERTO'::public.fleet_closure_status,v_actor,clock_timestamp())
  ON CONFLICT (municipio_id,reference_year,reference_month) DO NOTHING;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures
  WHERE municipio_id=v_municipio AND reference_year=p_reference_year AND reference_month=p_reference_month
  FOR UPDATE;
  IF NOT EXISTS (SELECT 1 FROM public.fleet_monthly_closure_station_checks sc WHERE sc.closure_id=v_closure.id AND sc.station_id=p_station_id)
     AND v_closure.status IN ('ABERTO'::public.fleet_closure_status,'EM_CONFERENCIA'::public.fleet_closure_status) THEN
    INSERT INTO public.fleet_monthly_closure_station_checks (municipio_id,closure_id,station_id,closure_status,status)
    VALUES (v_municipio,v_closure.id,p_station_id,'ABERTO'::public.fleet_closure_status,'PENDENTE');
  END IF;
  IF v_closure.status NOT IN ('FECHADO'::public.fleet_closure_status,'CONFERIDO'::public.fleet_closure_status) THEN
    PERFORM public.fleet_internal_refresh_monthly_closure(v_closure.id);
  END IF;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id=v_closure.id AND station_id=p_station_id;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures WHERE id=v_closure.id;
  RETURN jsonb_build_object('closure',to_jsonb(v_closure),'station_check',to_jsonb(v_check));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_request_monthly_closure(
  p_closure_id uuid,p_station_id uuid,p_no_activity boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
  v_municipio uuid := public.fleet_current_municipio_id();
  v_actor integer := public.fleet_current_usuario_id();
BEGIN
  IF NOT public.fleet_is_closure_manager() AND NOT public.fleet_is_station_member(p_station_id,v_municipio) THEN
    RAISE EXCEPTION 'Sem permissão para solicitar este fechamento.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id=p_closure_id AND station_id=p_station_id AND municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento do posto não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_check.closure_status NOT IN ('ABERTO'::public.fleet_closure_status,'REABERTO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'O período do posto não aceita nova solicitação neste estado.' USING ERRCODE='23514';
  END IF;
  IF p_no_activity AND v_check.registered_fueling_count>0 THEN
    RAISE EXCEPTION 'Há abastecimentos registrados; não é possível declarar ausência de movimentação.' USING ERRCODE='23514';
  END IF;
  IF NOT p_no_activity AND v_check.registered_fueling_count=0 THEN
    RAISE EXCEPTION 'Confirme que não houve movimentação nesta competência.' USING ERRCODE='23514';
  END IF;
  IF v_check.registered_fueling_count>0 AND NOT EXISTS (
    SELECT 1 FROM public.fleet_monthly_closure_documents d
    WHERE d.station_check_id=v_check.id AND d.document_type='NOTA_FISCAL' AND d.is_current
      AND d.document_status NOT IN ('REJEITADO'::public.fleet_document_status,'SUBSTITUIDO'::public.fleet_document_status)
  ) THEN
    RAISE EXCEPTION 'Anexe ao menos uma nota fiscal mensal antes de solicitar a conferência.' USING ERRCODE='23514';
  END IF;
  PERFORM public.fleet_snapshot_monthly_closure_station(v_check.id,'Composição e documentos apresentados pelo posto.');
  UPDATE public.fleet_monthly_closure_station_checks
  SET requested_at=clock_timestamp(),requested_by=v_actor,no_activity_reported=p_no_activity
  WHERE id=v_check.id;
  RETURN to_jsonb((SELECT sc FROM public.fleet_monthly_closure_station_checks sc WHERE sc.id=v_check.id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_start_monthly_closure_station_review(
  p_closure_id uuid,p_station_id uuid,p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
BEGIN
  IF NOT public.fleet_is_closure_manager() THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode iniciar a conferência oficial.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id=p_closure_id AND station_id=p_station_id AND municipio_id=public.fleet_current_municipio_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento do posto não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_check.closure_status NOT IN ('ABERTO'::public.fleet_closure_status,'REABERTO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'O fechamento não está em um estado que permita iniciar a conferência.' USING ERRCODE='23514';
  END IF;
  IF v_check.requested_at IS NULL AND v_check.registered_fueling_count>0 AND NULLIF(btrim(p_reason),'') IS NULL THEN
    RAISE EXCEPTION 'Informe a justificativa para iniciar a conferência administrativa sem solicitação do posto.' USING ERRCODE='23514';
  END IF;
  UPDATE public.fleet_monthly_closure_station_checks
  SET closure_status='EM_CONFERENCIA'::public.fleet_closure_status,
      review_notes=COALESCE(NULLIF(btrim(p_reason),''),review_notes)
  WHERE id=v_check.id;
  PERFORM public.fleet_recompute_monthly_closure_parent(p_closure_id);
  RETURN to_jsonb((SELECT sc FROM public.fleet_monthly_closure_station_checks sc WHERE sc.id=v_check.id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_register_monthly_closure_document(
  p_closure_id uuid,p_station_id uuid,p_document_type text,p_document_number text,p_document_series text,
  p_access_key text,p_issue_date date,p_issuer_document text,p_document_amount numeric,
  p_file_name text,p_storage_path text,p_mime_type text,p_file_size_bytes bigint,
  p_notes text DEFAULT NULL,p_replaced_document_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_actor integer := public.fleet_current_usuario_id();
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
  v_document_id uuid;
  v_station_cnpj text;
  v_issuer text;
BEGIN
  IF v_municipio IS NULL OR v_actor IS NULL OR
     (NOT public.fleet_is_closure_manager() AND NOT public.fleet_is_station_member(p_station_id,v_municipio)) THEN
    RAISE EXCEPTION 'Sem permissão para anexar documento a este posto.' USING ERRCODE='42501';
  END IF;
  IF p_document_type NOT IN ('NOTA_FISCAL','DEMONSTRATIVO','OUTRO') OR p_document_amount IS NULL OR p_document_amount<0 THEN
    RAISE EXCEPTION 'Tipo ou valor do documento inválido.' USING ERRCODE='22023';
  END IF;
  IF p_document_type='NOTA_FISCAL' AND (NULLIF(btrim(p_document_number),'') IS NULL OR p_issue_date IS NULL) THEN
    RAISE EXCEPTION 'Informe o número e a data de emissão da nota fiscal.' USING ERRCODE='23514';
  END IF;
  IF p_access_key IS NOT NULL AND NULLIF(regexp_replace(p_access_key,'[^0-9]','','g'),'') IS NOT NULL
     AND length(regexp_replace(p_access_key,'[^0-9]','','g'))<>44 THEN
    RAISE EXCEPTION 'A chave de acesso informada deve conter 44 dígitos.' USING ERRCODE='22023';
  END IF;
  IF p_file_size_bytes NOT BETWEEN 1 AND 10485760 OR p_mime_type NOT IN ('application/pdf','image/jpeg','image/png','image/webp')
     OR NULLIF(btrim(p_file_name),'') IS NULL THEN
    RAISE EXCEPTION 'Arquivo inválido. Use PDF, JPG, PNG ou WEBP de até 10 MB.' USING ERRCODE='22023';
  END IF;
  IF split_part(p_storage_path,'/',1)<>v_municipio::text OR split_part(p_storage_path,'/',2)<>'monthly-closures'
     OR split_part(p_storage_path,'/',3)<>p_closure_id::text OR split_part(p_storage_path,'/',4)<>p_station_id::text
     OR p_storage_path LIKE '%..%' OR p_storage_path LIKE '/%' THEN
    RAISE EXCEPTION 'Caminho do arquivo fora do escopo permitido.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id=p_closure_id AND station_id=p_station_id AND municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento do posto não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_check.closure_status NOT IN ('ABERTO'::public.fleet_closure_status,'EM_CONFERENCIA'::public.fleet_closure_status,'COM_DIVERGENCIA'::public.fleet_closure_status,'REABERTO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'O fechamento está conferido ou fechado; reabra o período antes de complementar documentos.' USING ERRCODE='23514';
  END IF;
  IF p_replaced_document_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.fleet_monthly_closure_documents d
      WHERE d.id=p_replaced_document_id AND d.closure_id=p_closure_id AND d.station_id=p_station_id AND d.municipio_id=v_municipio AND d.is_current
    ) THEN RAISE EXCEPTION 'O documento a substituir não pertence a este fechamento.' USING ERRCODE='42501'; END IF;
    UPDATE public.fleet_monthly_closure_documents
    SET is_current=false,document_status='SUBSTITUIDO'::public.fleet_document_status,updated_at=clock_timestamp()
    WHERE id=p_replaced_document_id;
  END IF;
  INSERT INTO public.fleet_monthly_closure_documents (
    municipio_id,closure_id,station_check_id,station_id,document_type,document_number,document_series,
    access_key,issue_date,issuer_document,document_amount,file_name,storage_path,mime_type,file_size_bytes,
    document_status,uploaded_by,replaced_document_id,notes
  ) VALUES (
    v_municipio,p_closure_id,v_check.id,p_station_id,p_document_type,NULLIF(btrim(p_document_number),''),
    NULLIF(btrim(p_document_series),''),NULLIF(regexp_replace(COALESCE(p_access_key,''),'[^0-9]','','g'),''),
    p_issue_date,NULLIF(regexp_replace(COALESCE(p_issuer_document,''),'[^0-9]','','g'),''),p_document_amount,
    btrim(p_file_name),p_storage_path,p_mime_type,p_file_size_bytes,'ENVIADO'::public.fleet_document_status,v_actor,
    p_replaced_document_id,NULLIF(btrim(p_notes),'' )
  ) RETURNING id INTO v_document_id;

  IF p_document_type='NOTA_FISCAL' AND NULLIF(regexp_replace(COALESCE(p_issuer_document,''),'[^0-9]','','g'),'') IS NOT NULL THEN
    SELECT regexp_replace(COALESCE(s.cnpj_snapshot,''),'[^0-9]','','g') INTO v_station_cnpj
    FROM public.fleet_fuel_stations s WHERE s.id=p_station_id AND s.municipio_id=v_municipio;
    v_issuer := regexp_replace(COALESCE(p_issuer_document,''),'[^0-9]','','g');
    IF v_station_cnpj IS NOT NULL AND v_station_cnpj<>'' AND v_issuer<>v_station_cnpj THEN
      INSERT INTO public.fleet_monthly_closure_discrepancies (
        municipio_id,closure_id,station_check_id,station_id,discrepancy_type,severity,description,
        is_system_generated,identified_by
      ) VALUES (
        v_municipio,p_closure_id,v_check.id,p_station_id,'EMITENTE_DIVERGENTE','BLOQUEIO',
        'O CNPJ do emitente informado na nota fiscal difere do cadastro do estabelecimento.',true,v_actor
      );
      UPDATE public.fleet_monthly_closure_station_checks
      SET status='COM_DIVERGENCIA',closure_status='COM_DIVERGENCIA'
      WHERE id=v_check.id;
    END IF;
  END IF;
  PERFORM public.fleet_internal_refresh_monthly_closure(p_closure_id);
  RETURN v_document_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_review_monthly_closure_document(
  p_document_id uuid,p_document_status public.fleet_document_status,p_rejection_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_document public.fleet_monthly_closure_documents%ROWTYPE;
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
  v_closure public.fleet_monthly_closures%ROWTYPE;
BEGIN
  IF NOT public.fleet_is_closure_manager() THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode validar documentos fiscais.' USING ERRCODE='42501';
  END IF;
  IF p_document_status NOT IN ('ACEITO'::public.fleet_document_status,'REJEITADO'::public.fleet_document_status) THEN
    RAISE EXCEPTION 'A decisão documental deve ser ACEITO ou REJEITADO.' USING ERRCODE='22023';
  END IF;
  IF p_document_status='REJEITADO'::public.fleet_document_status AND NULLIF(btrim(p_rejection_reason),'') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da rejeição para permitir a substituição do documento.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_document FROM public.fleet_monthly_closure_documents
  WHERE id=p_document_id AND municipio_id=public.fleet_current_municipio_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento fiscal não encontrado.' USING ERRCODE='P0002'; END IF;
  IF NOT v_document.is_current OR v_document.document_status IN ('SUBSTITUIDO'::public.fleet_document_status,'REJEITADO'::public.fleet_document_status) THEN
    RAISE EXCEPTION 'Documento rejeitado ou substituído não pode ser aceito; solicite uma nova versão ao posto.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks sc
  WHERE sc.id=v_document.station_check_id AND sc.closure_id=v_document.closure_id
    AND sc.station_id=v_document.station_id AND sc.municipio_id=v_document.municipio_id FOR UPDATE;
  IF NOT FOUND OR v_check.closure_status NOT IN ('ABERTO'::public.fleet_closure_status,'EM_CONFERENCIA'::public.fleet_closure_status,'COM_DIVERGENCIA'::public.fleet_closure_status,'REABERTO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'O posto está conferido/fechado; reabra o fechamento antes de alterar documentos.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures c
  WHERE c.id=v_document.closure_id AND c.municipio_id=v_document.municipio_id FOR UPDATE;
  IF NOT FOUND OR v_closure.status IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'A competência está concluída; reabra-a com justificativa antes de alterar documentos.' USING ERRCODE='23514';
  END IF;
  UPDATE public.fleet_monthly_closure_documents
  SET document_status=p_document_status,reviewed_by=public.fleet_current_usuario_id(),reviewed_at=clock_timestamp(),
      rejection_reason=CASE WHEN p_document_status='REJEITADO'::public.fleet_document_status THEN btrim(p_rejection_reason) ELSE NULL END,
      updated_at=clock_timestamp()
  WHERE id=v_document.id;
  PERFORM public.fleet_internal_refresh_monthly_closure(v_document.closure_id);
  RETURN to_jsonb((SELECT d FROM public.fleet_monthly_closure_documents d WHERE d.id=v_document.id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_review_monthly_closure_fueling(
  p_fueling_id uuid,p_document_id uuid,p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_actor integer := public.fleet_current_usuario_id();
  v_transaction public.fleet_monthly_closure_transactions%ROWTYPE;
  v_fueling public.fleet_fuelings%ROWTYPE;
  v_document public.fleet_fueling_documents%ROWTYPE;
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
  v_closure public.fleet_monthly_closures%ROWTYPE;
BEGIN
  IF NOT public.fleet_is_closure_manager() THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode conferir abastecimentos.' USING ERRCODE='42501';
  END IF;
  IF p_fueling_id IS NULL OR p_document_id IS NULL OR length(btrim(COALESCE(p_notes,'')))>2000 THEN
    RAISE EXCEPTION 'Abastecimento, comprovante vigente e observação válida são obrigatórios.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_transaction FROM public.fleet_monthly_closure_transactions t
  WHERE t.fueling_id=p_fueling_id AND t.municipio_id=v_municipio AND t.is_included;
  IF NOT FOUND THEN RAISE EXCEPTION 'Abastecimento fora da composição ativa do fechamento mensal.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures c
  WHERE c.id=v_transaction.closure_id AND c.municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND OR v_closure.status IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'A competência está concluída; reabra-a com justificativa antes de alterar comprovantes.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks sc
  WHERE sc.id=v_transaction.station_check_id AND sc.closure_id=v_transaction.closure_id
    AND sc.station_id=v_transaction.station_id AND sc.municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND OR v_check.closure_status NOT IN ('EM_CONFERENCIA'::public.fleet_closure_status,'COM_DIVERGENCIA'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'Inicie a conferência do posto antes de validar abastecimentos.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_transaction FROM public.fleet_monthly_closure_transactions t
  WHERE t.fueling_id=p_fueling_id AND t.municipio_id=v_municipio AND t.is_included
    AND t.closure_id=v_closure.id AND t.station_check_id=v_check.id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A composição do abastecimento mudou; atualize a tela e tente novamente.' USING ERRCODE='40001'; END IF;
  SELECT * INTO v_fueling FROM public.fleet_fuelings f
  WHERE f.id=p_fueling_id AND f.municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND OR v_fueling.station_id<>v_transaction.station_id THEN
    RAISE EXCEPTION 'Abastecimento não pertence ao posto/município da composição.' USING ERRCODE='42501';
  END IF;
  IF v_fueling.status IN ('CANCELADO'::public.fleet_fueling_status,'COM_INCONSISTENCIA'::public.fleet_fueling_status,'RASCUNHO'::public.fleet_fueling_status) THEN
    RAISE EXCEPTION 'Resolva a situação operacional do abastecimento antes de conferi-lo.' USING ERRCODE='23514';
  END IF;
  IF v_fueling.performed_at < make_timestamptz(v_closure.reference_year::integer,v_closure.reference_month::integer,1,0,0,0,'America/Sao_Paulo')
     OR v_fueling.performed_at >= make_timestamptz(v_closure.reference_year::integer,v_closure.reference_month::integer,1,0,0,0,'America/Sao_Paulo') + interval '1 month' THEN
    RAISE EXCEPTION 'A data efetiva do abastecimento não pertence à competência.' USING ERRCODE='23514';
  END IF;
  SELECT * INTO v_document FROM public.fleet_fueling_documents d
  WHERE d.id=p_document_id AND d.fueling_id=v_fueling.id AND d.municipio_id=v_municipio AND d.is_current FOR UPDATE;
  IF NOT FOUND OR NULLIF(btrim(v_document.storage_path),'') IS NULL THEN
    RAISE EXCEPTION 'Comprovante vigente não encontrado ou sem arquivo privado.' USING ERRCODE='P0002';
  END IF;
  IF v_document.document_status IN ('REJEITADO'::public.fleet_document_status,'SUBSTITUIDO'::public.fleet_document_status) THEN
    RAISE EXCEPTION 'Comprovante rejeitado/substituído não pode ser aceito; solicite nova versão ao posto.' USING ERRCODE='23514';
  END IF;
  IF v_document.document_status<>'ACEITO'::public.fleet_document_status THEN
    UPDATE public.fleet_fueling_documents
    SET document_status='ACEITO'::public.fleet_document_status,reviewed_by=v_actor,
        reviewed_at=clock_timestamp(),rejection_reason=NULL
    WHERE id=v_document.id;
  END IF;
  IF v_fueling.status<>'CONFERIDO'::public.fleet_fueling_status THEN
    UPDATE public.fleet_fuelings
    SET status='CONFERIDO'::public.fleet_fueling_status,registered_officially_by=v_actor,
        registered_officially_at=COALESCE(registered_officially_at,clock_timestamp()),updated_at=clock_timestamp()
    WHERE id=v_fueling.id;
  END IF;
  INSERT INTO public.fleet_monthly_closure_reviews (
    municipio_id,closure_id,station_check_id,station_id,review_type,review_result,reviewer_id,notes,approval_reference
  ) VALUES (
    v_municipio,v_closure.id,v_check.id,v_check.station_id,'CONFERENCIA_ABASTECIMENTOS','COMPROVANTE_ACEITO',
    v_actor,NULLIF(btrim(p_notes),''),v_document.id::text
  );
  PERFORM public.fleet_internal_refresh_monthly_closure(v_closure.id);
  RETURN jsonb_build_object('closure_id',v_closure.id,'station_check_id',v_check.id,
    'fueling_id',v_fueling.id,'document_id',v_document.id,'fueling_status','CONFERIDO',
    'document_status','ACEITO','reviewed_by',v_actor);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_record_monthly_closure_discrepancy(
  p_closure_id uuid,p_station_id uuid,p_fueling_id uuid,p_discrepancy_type text,p_severity text,
  p_description text,p_amount_involved numeric DEFAULT NULL,p_response_deadline timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
  v_id uuid;
BEGIN
  IF NOT public.fleet_is_closure_manager() THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode registrar divergência oficial.' USING ERRCODE='42501';
  END IF;
  IF p_severity NOT IN ('INFORMATIVO','ATENCAO','BLOQUEIO') OR length(btrim(COALESCE(p_description,'')))<5 THEN
    RAISE EXCEPTION 'Informe a gravidade e uma descrição objetiva da divergência.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id=p_closure_id AND station_id=p_station_id AND municipio_id=public.fleet_current_municipio_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento do posto não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_check.closure_status IN ('FECHADO'::public.fleet_closure_status,'CONFERIDO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'Reabra a competência antes de registrar uma divergência.' USING ERRCODE='23514';
  END IF;
  IF p_fueling_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fleet_monthly_closure_transactions t
    WHERE t.closure_id=p_closure_id AND t.station_check_id=v_check.id AND t.station_id=p_station_id
      AND t.fueling_id=p_fueling_id AND t.is_included
  ) THEN RAISE EXCEPTION 'O abastecimento não pertence à composição deste fechamento.' USING ERRCODE='23514'; END IF;
  INSERT INTO public.fleet_monthly_closure_discrepancies (
    municipio_id,closure_id,station_check_id,station_id,fueling_id,discrepancy_type,severity,
    description,amount_involved,identified_by,response_deadline
  ) VALUES (
    v_check.municipio_id,p_closure_id,v_check.id,p_station_id,p_fueling_id,btrim(p_discrepancy_type),p_severity,
    btrim(p_description),p_amount_involved,public.fleet_current_usuario_id(),p_response_deadline
  ) RETURNING id INTO v_id;
  UPDATE public.fleet_monthly_closure_station_checks
  SET status='COM_DIVERGENCIA',closure_status='COM_DIVERGENCIA'
  WHERE id=v_check.id;
  PERFORM public.fleet_recompute_monthly_closure_parent(p_closure_id);
  RETURN v_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_send_monthly_closure_message(
  p_closure_id uuid,p_station_id uuid,p_discrepancy_id uuid,p_message_type text,p_message text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_actor integer := public.fleet_current_usuario_id();
  v_scope text;
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
  v_message_id uuid;
BEGIN
  IF public.fleet_is_closure_manager() THEN
    v_scope := 'MUNICIPAL';
    IF p_message_type NOT IN ('SOLICITACAO_ESCLARECIMENTO','OBSERVACAO','DECISAO') THEN
      RAISE EXCEPTION 'Tipo de mensagem não permitido para o perfil municipal.' USING ERRCODE='42501';
    END IF;
  ELSIF public.fleet_is_station_member(p_station_id,v_municipio) THEN
    v_scope := 'POSTO';
    IF p_message_type NOT IN ('RESPOSTA','COMPLEMENTO_DOCUMENTAL','OBSERVACAO') THEN
      RAISE EXCEPTION 'Tipo de mensagem não permitido para o perfil do posto.' USING ERRCODE='42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'Sem permissão para enviar mensagem neste fechamento.' USING ERRCODE='42501';
  END IF;
  IF length(btrim(COALESCE(p_message,''))) NOT BETWEEN 3 AND 5000 THEN
    RAISE EXCEPTION 'A mensagem deve ter entre 3 e 5.000 caracteres.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id=p_closure_id AND station_id=p_station_id AND municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento do posto não encontrado.' USING ERRCODE='P0002'; END IF;
  IF p_discrepancy_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fleet_monthly_closure_discrepancies d
    WHERE d.id=p_discrepancy_id AND d.closure_id=p_closure_id AND d.station_id=p_station_id AND d.station_check_id=v_check.id
  ) THEN RAISE EXCEPTION 'A divergência não pertence a este fechamento.' USING ERRCODE='42501'; END IF;
  IF v_check.closure_status IN ('FECHADO'::public.fleet_closure_status,'CONFERIDO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'Reabra a competência para registrar nova tratativa.' USING ERRCODE='23514';
  END IF;
  INSERT INTO public.fleet_monthly_closure_messages (
    municipio_id,closure_id,station_check_id,station_id,discrepancy_id,sender_user_id,sender_scope,message_type,message
  ) VALUES (
    v_municipio,p_closure_id,v_check.id,p_station_id,p_discrepancy_id,v_actor,v_scope,p_message_type,btrim(p_message)
  ) RETURNING id INTO v_message_id;
  IF p_discrepancy_id IS NOT NULL AND p_message_type='SOLICITACAO_ESCLARECIMENTO' THEN
    UPDATE public.fleet_monthly_closure_discrepancies
    SET status='AGUARDANDO_RESPOSTA',updated_at=clock_timestamp()
    WHERE id=p_discrepancy_id AND status IN ('ABERTA','RESPONDIDA');
  ELSIF p_discrepancy_id IS NOT NULL AND p_message_type='RESPOSTA' THEN
    UPDATE public.fleet_monthly_closure_discrepancies
    SET status='RESPONDIDA',updated_at=clock_timestamp()
    WHERE id=p_discrepancy_id AND status='AGUARDANDO_RESPOSTA';
  END IF;
  RETURN v_message_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_resolve_monthly_closure_discrepancy(
  p_discrepancy_id uuid,p_resolution_status text,p_resolution_notes text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_discrepancy public.fleet_monthly_closure_discrepancies%ROWTYPE;
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
  v_unresolved integer;
BEGIN
  IF NOT public.fleet_is_closure_manager() THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode decidir uma divergência.' USING ERRCODE='42501';
  END IF;
  IF p_resolution_status NOT IN ('RESOLVIDA','MANTIDA') OR length(btrim(COALESCE(p_resolution_notes,'')))<5 THEN
    RAISE EXCEPTION 'Registre a decisão e sua justificativa.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_discrepancy FROM public.fleet_monthly_closure_discrepancies
  WHERE id=p_discrepancy_id AND municipio_id=public.fleet_current_municipio_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Divergência não encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_discrepancy.status='RESOLVIDA' THEN RAISE EXCEPTION 'Esta divergência já foi resolvida.' USING ERRCODE='23514'; END IF;
  UPDATE public.fleet_monthly_closure_discrepancies
  SET status=p_resolution_status,resolved_by=public.fleet_current_usuario_id(),resolved_at=clock_timestamp(),
      resolution_notes=btrim(p_resolution_notes),updated_at=clock_timestamp()
  WHERE id=v_discrepancy.id;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks WHERE id=v_discrepancy.station_check_id FOR UPDATE;
  SELECT count(*) INTO v_unresolved FROM public.fleet_monthly_closure_discrepancies d
  WHERE d.station_check_id=v_check.id AND d.status<>'RESOLVIDA';
  IF v_unresolved=0 AND COALESCE(v_check.divergence_amount,0)=0 THEN
    UPDATE public.fleet_monthly_closure_station_checks
    SET status='PENDENTE',closure_status='EM_CONFERENCIA'
    WHERE id=v_check.id AND closure_status='COM_DIVERGENCIA'::public.fleet_closure_status;
  END IF;
  PERFORM public.fleet_recompute_monthly_closure_parent(v_discrepancy.closure_id);
  RETURN to_jsonb((SELECT d FROM public.fleet_monthly_closure_discrepancies d WHERE d.id=v_discrepancy.id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_confirm_monthly_closure_station(
  p_closure_id uuid,p_station_id uuid,p_notes text DEFAULT NULL,p_confirm_no_activity boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
  v_activity_count integer;
  v_pending_fuelings integer;
  v_accepted_invoices integer;
  v_pending_monthly_documents integer;
  v_invoice_total numeric(14,2);
  v_open_discrepancies integer;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_closure public.fleet_monthly_closures%ROWTYPE;
BEGIN
  IF NOT public.fleet_is_closure_manager() THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode concluir a conferência oficial.' USING ERRCODE='42501';
  END IF;
  PERFORM public.fleet_internal_refresh_monthly_closure(p_closure_id);
  SELECT * INTO v_closure FROM public.fleet_monthly_closures
  WHERE id=p_closure_id AND municipio_id=public.fleet_current_municipio_id();
  IF NOT FOUND THEN RAISE EXCEPTION 'Competência mensal não encontrada.' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_check FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id=p_closure_id AND station_id=p_station_id AND municipio_id=v_closure.municipio_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Fechamento do posto não encontrado.' USING ERRCODE='P0002'; END IF;
  IF v_check.closure_status<>'EM_CONFERENCIA'::public.fleet_closure_status THEN
    RAISE EXCEPTION 'O fechamento do posto deve estar em conferência antes da decisão.' USING ERRCODE='23514';
  END IF;
  v_period_start := make_timestamptz(v_closure.reference_year::integer,v_closure.reference_month::integer,1,0,0,0,'America/Sao_Paulo');
  v_period_end := v_period_start + interval '1 month';
  SELECT count(*)::integer INTO v_activity_count
  FROM public.fleet_monthly_closure_transactions t
  JOIN public.fleet_fuelings f ON f.id=t.fueling_id
  WHERE t.closure_id=p_closure_id AND t.station_check_id=v_check.id AND t.is_included
    AND f.status<>'CANCELADO'::public.fleet_fueling_status
    AND f.performed_at>=v_period_start AND f.performed_at<v_period_end;
  SELECT count(*)::integer INTO v_pending_fuelings
  FROM public.fleet_monthly_closure_transactions t
  JOIN public.fleet_fuelings f ON f.id=t.fueling_id
  WHERE t.closure_id=p_closure_id AND t.station_check_id=v_check.id AND t.is_included
    AND f.status<>'CANCELADO'::public.fleet_fueling_status
    AND f.performed_at>=v_period_start AND f.performed_at<v_period_end
    AND (f.status NOT IN ('CONFERIDO'::public.fleet_fueling_status,'INCLUIDO_NO_FECHAMENTO'::public.fleet_fueling_status)
      OR NOT EXISTS (
        SELECT 1 FROM public.fleet_fueling_documents fd
        WHERE fd.fueling_id=f.id AND fd.municipio_id=f.municipio_id AND fd.is_current
          AND fd.document_status='ACEITO'::public.fleet_document_status AND NULLIF(btrim(fd.storage_path),'') IS NOT NULL
      ));
  SELECT count(*) FILTER (WHERE d.is_current AND d.document_type='NOTA_FISCAL' AND d.document_status='ACEITO'::public.fleet_document_status)::integer,
         count(*) FILTER (WHERE d.is_current AND d.document_status IN ('PENDENTE'::public.fleet_document_status,'ENVIADO'::public.fleet_document_status,'EM_ANALISE'::public.fleet_document_status))::integer,
         COALESCE(sum(d.document_amount) FILTER (WHERE d.is_current AND d.document_type='NOTA_FISCAL' AND d.document_status='ACEITO'::public.fleet_document_status),0)::numeric(14,2)
    INTO v_accepted_invoices,v_pending_monthly_documents,v_invoice_total
  FROM public.fleet_monthly_closure_documents d WHERE d.station_check_id=v_check.id;
  SELECT count(*)::integer INTO v_open_discrepancies
  FROM public.fleet_monthly_closure_discrepancies d WHERE d.station_check_id=v_check.id AND d.status<>'RESOLVIDA';

  IF v_activity_count=0 THEN
    IF NOT p_confirm_no_activity THEN RAISE EXCEPTION 'Confirme explicitamente que o posto não teve movimentação.' USING ERRCODE='23514'; END IF;
  ELSE
    IF v_pending_fuelings>0 THEN RAISE EXCEPTION 'Há abastecimentos sem conferência ou comprovante individual aceito.' USING ERRCODE='23514'; END IF;
    IF v_accepted_invoices=0 THEN RAISE EXCEPTION 'Não há nota fiscal mensal aceita para este fechamento.' USING ERRCODE='23514'; END IF;
    IF v_pending_monthly_documents>0 THEN RAISE EXCEPTION 'Há documento fiscal pendente de análise.' USING ERRCODE='23514'; END IF;
    IF v_invoice_total<>v_check.registered_amount THEN RAISE EXCEPTION 'O valor fiscal aceito diverge do total dos abastecimentos; registre e resolva a divergência antes de conferir.' USING ERRCODE='23514'; END IF;
  END IF;
  IF v_pending_monthly_documents>0 OR v_open_discrepancies>0 THEN
    RAISE EXCEPTION 'Existem documentos pendentes ou divergências sem decisão.' USING ERRCODE='23514';
  END IF;
  UPDATE public.fleet_monthly_closure_station_checks
  SET closure_status='CONFERIDO'::public.fleet_closure_status,status='CONFERIDO',checked_by=public.fleet_current_usuario_id(),
      checked_at=clock_timestamp(),no_activity_confirmed=(v_activity_count=0 AND p_confirm_no_activity),
      review_notes=COALESCE(NULLIF(btrim(p_notes),''),review_notes)
  WHERE id=v_check.id;
  INSERT INTO public.fleet_monthly_closure_reviews (
    municipio_id,closure_id,station_check_id,station_id,review_type,review_result,reviewer_id,notes
  ) VALUES (
    v_check.municipio_id,p_closure_id,v_check.id,p_station_id,'CONFERENCIA_POSTO',
    CASE WHEN v_activity_count=0 THEN 'SEM_MOVIMENTACAO_CONFIRMADA' ELSE 'CONFERIDO' END,
    public.fleet_current_usuario_id(),NULLIF(btrim(p_notes),'')
  );
  PERFORM public.fleet_recompute_monthly_closure_parent(p_closure_id);
  RETURN to_jsonb((SELECT sc FROM public.fleet_monthly_closure_station_checks sc WHERE sc.id=v_check.id));
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_guard_monthly_closure_ready()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_check_count integer;
  v_unconfirmed integer;
BEGIN
  IF NEW.status<>'FECHADO'::public.fleet_closure_status THEN RETURN NEW; END IF;
  IF TG_OP='INSERT' THEN
    RAISE EXCEPTION 'Um fechamento não pode ser criado diretamente como FECHADO.' USING ERRCODE='23514';
  END IF;
  IF OLD.status<>'CONFERIDO'::public.fleet_closure_status THEN
    RAISE EXCEPTION 'O mês só pode ser fechado após a conferência municipal completa.' USING ERRCODE='23514';
  END IF;
  IF NOT public.fleet_is_closure_manager() THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode fechar o mês.' USING ERRCODE='42501';
  END IF;
  SELECT count(*),count(*) FILTER (WHERE sc.closure_status<>'CONFERIDO'::public.fleet_closure_status)
    INTO v_check_count,v_unconfirmed
  FROM public.fleet_monthly_closure_station_checks sc WHERE sc.closure_id=NEW.id;
  IF v_check_count=0 OR v_unconfirmed>0 THEN
    RAISE EXCEPTION 'Todos os postos da competência devem estar conferidos antes do fechamento.' USING ERRCODE='23514';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_monthly_closure_discrepancies d
    WHERE d.closure_id=NEW.id AND d.status<>'RESOLVIDA'
  ) THEN RAISE EXCEPTION 'Há divergências sem decisão; o fechamento permanece bloqueado.' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_monthly_closure_station_checks sc
    WHERE sc.closure_id=NEW.id AND sc.registered_fueling_count>0
      AND (sc.status<>'CONFERIDO' OR sc.documents_pending_count>0 OR sc.invoiced_amount IS NULL OR sc.divergence_amount<>0)
  ) THEN RAISE EXCEPTION 'Há posto com documentos pendentes ou diferença fiscal.' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_monthly_closure_station_checks sc
    WHERE sc.closure_id=NEW.id AND sc.registered_fueling_count=0 AND NOT sc.no_activity_confirmed
  ) THEN RAISE EXCEPTION 'Confirme formalmente a ausência de movimentação em cada posto sem abastecimentos.' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_monthly_closure_transactions t
    JOIN public.fleet_fuelings f ON f.id=t.fueling_id
    WHERE t.closure_id=NEW.id AND t.is_included AND f.status<>'CANCELADO'::public.fleet_fueling_status
      AND (f.status NOT IN ('CONFERIDO'::public.fleet_fueling_status,'INCLUIDO_NO_FECHAMENTO'::public.fleet_fueling_status)
        OR NOT EXISTS (
          SELECT 1 FROM public.fleet_fueling_documents fd
          WHERE fd.fueling_id=f.id AND fd.municipio_id=f.municipio_id AND fd.is_current
            AND fd.document_status='ACEITO'::public.fleet_document_status AND NULLIF(btrim(fd.storage_path),'') IS NOT NULL
        ))
  ) THEN RAISE EXCEPTION 'Há abastecimento sem conferência oficial ou comprovante individual aceito.' USING ERRCODE='23514'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.fleet_monthly_closure_station_checks sc
    WHERE sc.closure_id=NEW.id AND sc.registered_fueling_count>0
      AND (SELECT COALESCE(sum(d.document_amount),0) FROM public.fleet_monthly_closure_documents d
           WHERE d.station_check_id=sc.id AND d.is_current AND d.document_type='NOTA_FISCAL'
             AND d.document_status='ACEITO'::public.fleet_document_status)<>sc.registered_amount
  ) THEN RAISE EXCEPTION 'O total das notas fiscais aceitas não coincide com os abastecimentos registrados.' USING ERRCODE='23514'; END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_guard_monthly_closure_transition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_internal boolean := COALESCE(current_setting('app.fleet_monthly_closure_internal',true),'')='on';
  v_unconfirmed integer;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'ABERTO'::public.fleet_closure_status THEN
      RAISE EXCEPTION 'Uma nova competência deve iniciar em ABERTO.' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NOT public.fleet_is_closure_manager() AND NOT v_internal THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode alterar a situação do fechamento.' USING ERRCODE='42501';
  END IF;
  IF NEW.status='FECHADO'::public.fleet_closure_status THEN
    RETURN NEW;
  END IF;
  IF OLD.status='FECHADO'::public.fleet_closure_status THEN
    IF NEW.status<>'REABERTO'::public.fleet_closure_status OR NOT v_internal THEN
      RAISE EXCEPTION 'Um período fechado só pode ser alterado pela RPC de reabertura justificada.' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status='REABERTO'::public.fleet_closure_status AND (OLD.status NOT IN ('FECHADO'::public.fleet_closure_status,'CONFERIDO'::public.fleet_closure_status) OR NOT v_internal) THEN
    RAISE EXCEPTION 'A reabertura só é permitida pela RPC autorizada e com justificativa.' USING ERRCODE='23514';
  END IF;
  IF NEW.status='CONFERIDO'::public.fleet_closure_status THEN
    SELECT count(*) FILTER (WHERE sc.closure_status NOT IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status))
      INTO v_unconfirmed FROM public.fleet_monthly_closure_station_checks sc WHERE sc.closure_id=NEW.id;
    IF v_unconfirmed>0 THEN RAISE EXCEPTION 'Há posto ainda não conferido.' USING ERRCODE='23514'; END IF;
  END IF;
  IF OLD.status='CONFERIDO'::public.fleet_closure_status AND NEW.status NOT IN ('FECHADO'::public.fleet_closure_status,'REABERTO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'O estado CONFERIDO só permite fechamento ou reabertura justificada.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fleet_monthly_closure_guard_before_close ON public.fleet_monthly_closures;
DROP TRIGGER IF EXISTS fleet_monthly_closure_ready_guard ON public.fleet_monthly_closures;
DROP TRIGGER IF EXISTS fleet_monthly_closure_status_guard ON public.fleet_monthly_closures;
CREATE TRIGGER fleet_monthly_closure_01_status_guard
  BEFORE INSERT OR UPDATE OF status ON public.fleet_monthly_closures
  FOR EACH ROW EXECUTE FUNCTION public.fleet_guard_monthly_closure_transition();
CREATE TRIGGER fleet_monthly_closure_02_ready_guard
  BEFORE INSERT OR UPDATE OF status ON public.fleet_monthly_closures
  FOR EACH ROW WHEN (NEW.status='FECHADO'::public.fleet_closure_status)
  EXECUTE FUNCTION public.fleet_guard_monthly_closure_ready();

CREATE OR REPLACE FUNCTION public.fleet_guard_monthly_closure_fueling()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_status public.fleet_closure_status;
  v_requested_at timestamptz;
  v_month_status public.fleet_closure_status;
  v_manager_review boolean := false;
  v_year integer;
  v_month integer;
BEGIN
  IF COALESCE(current_setting('app.fleet_monthly_closure_internal',true),'')='on' THEN
    RETURN NEW;
  END IF;
  IF TG_OP='DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.fleet_monthly_closure_transactions t WHERE t.fueling_id=OLD.id) THEN
      RAISE EXCEPTION 'Abastecimento vinculado a fechamento não pode ser excluído fisicamente.' USING ERRCODE='23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP='UPDATE' THEN
    v_year := extract(year FROM OLD.performed_at AT TIME ZONE 'America/Sao_Paulo')::integer;
    v_month := extract(month FROM OLD.performed_at AT TIME ZONE 'America/Sao_Paulo')::integer;
    SELECT sc.closure_status,sc.requested_at,c.status INTO v_status,v_requested_at,v_month_status
    FROM public.fleet_monthly_closures c
    JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id AND sc.station_id=OLD.station_id
    WHERE c.municipio_id=OLD.municipio_id AND c.reference_year=v_year AND c.reference_month=v_month LIMIT 1;
    IF FOUND AND (v_requested_at IS NOT NULL OR v_status IN ('EM_CONFERENCIA'::public.fleet_closure_status,'COM_DIVERGENCIA'::public.fleet_closure_status,'CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status)
       OR v_month_status IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status)) THEN
      IF public.fleet_is_closure_manager() AND NEW.status='CONFERIDO'::public.fleet_fueling_status
         AND NEW.station_id=OLD.station_id AND NEW.performed_at=OLD.performed_at
         AND NEW.liters=OLD.liters AND NEW.unit_price=OLD.unit_price AND NEW.total_amount=OLD.total_amount
         AND v_status IN ('EM_CONFERENCIA'::public.fleet_closure_status,'COM_DIVERGENCIA'::public.fleet_closure_status) THEN
        v_manager_review := true;
      ELSE
        RAISE EXCEPTION 'O abastecimento pertence a um fechamento solicitado/conferido; reabra o período antes de alterar sua composição.' USING ERRCODE='23514';
      END IF;
    END IF;
  END IF;
  v_year := extract(year FROM NEW.performed_at AT TIME ZONE 'America/Sao_Paulo')::integer;
  v_month := extract(month FROM NEW.performed_at AT TIME ZONE 'America/Sao_Paulo')::integer;
  SELECT sc.closure_status,sc.requested_at,c.status INTO v_status,v_requested_at,v_month_status
  FROM public.fleet_monthly_closures c
  JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id AND sc.station_id=NEW.station_id
  WHERE c.municipio_id=NEW.municipio_id AND c.reference_year=v_year AND c.reference_month=v_month LIMIT 1;
  IF FOUND AND NOT v_manager_review AND (v_requested_at IS NOT NULL OR v_status IN ('EM_CONFERENCIA'::public.fleet_closure_status,'COM_DIVERGENCIA'::public.fleet_closure_status,'CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status)
     OR v_month_status IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status)) THEN
    RAISE EXCEPTION 'O período deste posto já foi solicitado/conferido; reabra o fechamento antes de incluir ou alterar abastecimentos.' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fleet_monthly_closure_fueling_guard ON public.fleet_fuelings;
CREATE TRIGGER fleet_monthly_closure_fueling_guard
  BEFORE INSERT OR UPDATE OF station_id,performed_at,liters,unit_price,status OR DELETE ON public.fleet_fuelings
  FOR EACH ROW EXECUTE FUNCTION public.fleet_guard_monthly_closure_fueling();

CREATE OR REPLACE FUNCTION public.fleet_refresh_monthly_closure(p_closure_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT public.fleet_is_closure_manager() THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode atualizar os totais da competência.' USING ERRCODE='42501';
  END IF;
  RETURN public.fleet_internal_refresh_monthly_closure(p_closure_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_close_month(p_closure_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_closure public.fleet_monthly_closures%ROWTYPE;
  v_station_count integer;
  v_not_ready integer;
  v_fueling_count integer;
  v_municipio uuid := public.fleet_current_municipio_id();
  v_actor integer := public.fleet_current_usuario_id();
BEGIN
  IF NOT public.fleet_is_closure_manager() OR v_municipio IS NULL OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode fechar o mês.' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures
  WHERE id=p_closure_id AND municipio_id=v_municipio FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Competência mensal não encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_closure.status<>'CONFERIDO'::public.fleet_closure_status THEN
    RAISE EXCEPTION 'Conclua a conferência de todos os postos antes de fechar o mês.' USING ERRCODE='23514';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_municipio::text||':'||v_closure.reference_year::text||':'||v_closure.reference_month::text,0));
  SELECT count(*),count(*) FILTER (WHERE closure_status<>'CONFERIDO'::public.fleet_closure_status)
    INTO v_station_count,v_not_ready
  FROM public.fleet_monthly_closure_station_checks WHERE closure_id=p_closure_id;
  IF v_station_count=0 OR v_not_ready>0 THEN RAISE EXCEPTION 'Todos os postos devem estar conferidos.' USING ERRCODE='23514'; END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_monthly_closure_discrepancies WHERE closure_id=p_closure_id AND status<>'RESOLVIDA') THEN
    RAISE EXCEPTION 'Resolva todas as divergências antes do fechamento.' USING ERRCODE='23514';
  END IF;
  PERFORM set_config('app.fleet_monthly_closure_internal','on',true);
  UPDATE public.fleet_fuelings f
  SET status='INCLUIDO_NO_FECHAMENTO'::public.fleet_fueling_status
  FROM public.fleet_monthly_closure_transactions t
  WHERE t.closure_id=p_closure_id AND t.fueling_id=f.id AND t.is_included
    AND f.municipio_id=v_municipio AND f.status='CONFERIDO'::public.fleet_fueling_status;
  GET DIAGNOSTICS v_fueling_count = ROW_COUNT;
  UPDATE public.fleet_monthly_closures
  SET status='FECHADO'::public.fleet_closure_status,closed_by=v_actor,closed_at=clock_timestamp(),updated_at=clock_timestamp()
  WHERE id=p_closure_id;
  UPDATE public.fleet_monthly_closure_station_checks
  SET closure_status='FECHADO'::public.fleet_closure_status,review_notes=COALESCE(review_notes,'')
  WHERE closure_id=p_closure_id AND closure_status='CONFERIDO'::public.fleet_closure_status;
  INSERT INTO public.fleet_monthly_closure_reviews (
    municipio_id,closure_id,station_check_id,station_id,review_type,review_result,reviewer_id,notes
  )
  SELECT municipio_id,closure_id,id,station_id,'FECHAMENTO_MENSAL','FECHADO',v_actor,'Encerramento administrativo da competência.'
  FROM public.fleet_monthly_closure_station_checks WHERE closure_id=p_closure_id;
  PERFORM public.fleet_recompute_monthly_closure_parent(p_closure_id);
  PERFORM set_config('app.fleet_monthly_closure_internal','off',true);
  RETURN jsonb_build_object('closure_id',p_closure_id,'status','FECHADO','fuelings_included',v_fueling_count,'stations_closed',v_station_count,'closed_at',clock_timestamp());
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_reopen_monthly_closure(p_closure_id uuid,p_reason text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_closure public.fleet_monthly_closures%ROWTYPE;
  v_actor integer := public.fleet_current_usuario_id();
  v_station_count integer;
BEGIN
  IF NOT public.fleet_is_closure_manager() OR v_actor IS NULL THEN
    RAISE EXCEPTION 'Somente Gestor de Frotas ou Administrador pode reabrir a competência.' USING ERRCODE='42501';
  END IF;
  IF length(btrim(COALESCE(p_reason,'')))<10 THEN
    RAISE EXCEPTION 'Informe uma justificativa detalhada (mínimo de 10 caracteres).' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures
  WHERE id=p_closure_id AND municipio_id=public.fleet_current_municipio_id() FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Competência mensal não encontrada.' USING ERRCODE='P0002'; END IF;
  IF v_closure.status NOT IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status) THEN
    RAISE EXCEPTION 'Somente um fechamento conferido ou fechado pode ser reaberto.' USING ERRCODE='23514';
  END IF;
  SELECT count(*) INTO v_station_count FROM public.fleet_monthly_closure_station_checks WHERE closure_id=p_closure_id;
  IF v_station_count=0 THEN RAISE EXCEPTION 'A competência não possui fechamentos por posto para reabrir.' USING ERRCODE='23514'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(v_closure.municipio_id::text||':'||v_closure.reference_year::text||':'||v_closure.reference_month::text,0));
  PERFORM set_config('app.fleet_monthly_closure_internal','on',true);
  UPDATE public.fleet_monthly_closures
  SET status='REABERTO'::public.fleet_closure_status,reopened_at=clock_timestamp(),reopening_reason=btrim(p_reason),updated_at=clock_timestamp()
  WHERE id=p_closure_id;
  UPDATE public.fleet_monthly_closure_station_checks
  SET closure_status='REABERTO'::public.fleet_closure_status,review_notes=btrim(p_reason)
  WHERE closure_id=p_closure_id AND closure_status IN ('CONFERIDO'::public.fleet_closure_status,'FECHADO'::public.fleet_closure_status);
  UPDATE public.fleet_fuelings f
  SET status='CONFERIDO'::public.fleet_fueling_status
  FROM public.fleet_monthly_closure_transactions t
  WHERE t.closure_id=p_closure_id AND t.fueling_id=f.id AND t.is_included
    AND f.status='INCLUIDO_NO_FECHAMENTO'::public.fleet_fueling_status;
  INSERT INTO public.fleet_monthly_closure_reviews (
    municipio_id,closure_id,station_check_id,station_id,review_type,review_result,reviewer_id,notes
  )
  SELECT municipio_id,closure_id,id,station_id,'REABERTURA','REABERTO',v_actor,btrim(p_reason)
  FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id=p_closure_id AND closure_status='REABERTO'::public.fleet_closure_status;
  PERFORM public.fleet_recompute_monthly_closure_parent(p_closure_id);
  PERFORM set_config('app.fleet_monthly_closure_internal','off',true);
  RETURN to_jsonb((SELECT c FROM public.fleet_monthly_closures c WHERE c.id=p_closure_id));
END;
$function$;

ALTER TABLE public.fleet_monthly_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_monthly_closure_station_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_monthly_closure_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_monthly_closure_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_monthly_closure_discrepancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_monthly_closure_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_monthly_closure_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_monthly_closure_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_monthly_closure_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_closures_manager ON public.fleet_monthly_closures;
DROP POLICY IF EXISTS fleet_monthly_closures_read_v2 ON public.fleet_monthly_closures;
CREATE POLICY fleet_monthly_closures_read_v2 ON public.fleet_monthly_closures
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_can_read_monthly_closures() OR EXISTS (
      SELECT 1 FROM public.fleet_monthly_closure_station_checks sc
      WHERE sc.closure_id=fleet_monthly_closures.id
        AND public.fleet_is_station_member(sc.station_id,sc.municipio_id)
    )
  ));

DROP POLICY IF EXISTS fleet_closure_checks_manager ON public.fleet_monthly_closure_station_checks;
DROP POLICY IF EXISTS fleet_monthly_closure_station_checks_read_v2 ON public.fleet_monthly_closure_station_checks;
CREATE POLICY fleet_monthly_closure_station_checks_read_v2 ON public.fleet_monthly_closure_station_checks
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_can_read_monthly_closures() OR public.fleet_is_station_member(station_id,municipio_id)
  ));

DROP POLICY IF EXISTS fleet_monthly_closure_transactions_read_v2 ON public.fleet_monthly_closure_transactions;
CREATE POLICY fleet_monthly_closure_transactions_read_v2 ON public.fleet_monthly_closure_transactions
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_can_read_monthly_closures() OR public.fleet_is_station_member(station_id,municipio_id)
  ));
DROP POLICY IF EXISTS fleet_monthly_closure_documents_read_v2 ON public.fleet_monthly_closure_documents;
CREATE POLICY fleet_monthly_closure_documents_read_v2 ON public.fleet_monthly_closure_documents
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR public.fleet_is_station_member(station_id,municipio_id)
  ));
DROP POLICY IF EXISTS fleet_monthly_closure_discrepancies_read_v2 ON public.fleet_monthly_closure_discrepancies;
CREATE POLICY fleet_monthly_closure_discrepancies_read_v2 ON public.fleet_monthly_closure_discrepancies
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR public.fleet_is_station_member(station_id,municipio_id)
  ));
DROP POLICY IF EXISTS fleet_monthly_closure_messages_read_v2 ON public.fleet_monthly_closure_messages;
CREATE POLICY fleet_monthly_closure_messages_read_v2 ON public.fleet_monthly_closure_messages
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR public.fleet_is_station_member(station_id,municipio_id)
  ));
DROP POLICY IF EXISTS fleet_monthly_closure_reviews_read_v2 ON public.fleet_monthly_closure_reviews;
CREATE POLICY fleet_monthly_closure_reviews_read_v2 ON public.fleet_monthly_closure_reviews
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR public.fleet_is_station_member(station_id,municipio_id)
  ));
DROP POLICY IF EXISTS fleet_monthly_closure_history_read_v2 ON public.fleet_monthly_closure_history;
CREATE POLICY fleet_monthly_closure_history_read_v2 ON public.fleet_monthly_closure_history
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR (station_id IS NOT NULL AND public.fleet_is_station_member(station_id,municipio_id))
  ));
DROP POLICY IF EXISTS fleet_monthly_closure_versions_read_v2 ON public.fleet_monthly_closure_versions;
CREATE POLICY fleet_monthly_closure_versions_read_v2 ON public.fleet_monthly_closure_versions
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR (station_id IS NOT NULL AND public.fleet_is_station_member(station_id,municipio_id))
  ));

REVOKE ALL ON TABLE public.fleet_monthly_closures,public.fleet_monthly_closure_station_checks,
  public.fleet_monthly_closure_transactions,public.fleet_monthly_closure_documents,
  public.fleet_monthly_closure_discrepancies,public.fleet_monthly_closure_messages,
  public.fleet_monthly_closure_reviews,public.fleet_monthly_closure_history,
  public.fleet_monthly_closure_versions FROM anon,authenticated;
GRANT SELECT ON TABLE public.fleet_monthly_closures,public.fleet_monthly_closure_station_checks,
  public.fleet_monthly_closure_transactions,public.fleet_monthly_closure_documents,
  public.fleet_monthly_closure_discrepancies,public.fleet_monthly_closure_messages,
  public.fleet_monthly_closure_reviews,public.fleet_monthly_closure_history,
  public.fleet_monthly_closure_versions TO authenticated;

DROP POLICY IF EXISTS fleet_storage_manager_insert ON storage.objects;
CREATE POLICY fleet_storage_manager_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='fleet-documents' AND public.fleet_is_closure_manager()
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text);
DROP POLICY IF EXISTS fleet_storage_manager_select ON storage.objects;
CREATE POLICY fleet_storage_manager_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='fleet-documents' AND public.fleet_is_closure_manager()
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text);

DROP POLICY IF EXISTS fleet_storage_monthly_closure_station_delete_orphan ON storage.objects;
CREATE POLICY fleet_storage_monthly_closure_station_delete_orphan ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id='fleet-documents'
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
    AND split_part(name,'/',2)='monthly-closures'
    AND EXISTS (
      SELECT 1 FROM public.fleet_monthly_closures c
      JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id
      JOIN public.fleet_station_members sm ON sm.station_id=sc.station_id AND sm.municipio_id=sc.municipio_id
      WHERE c.id::text=split_part(objects.name,'/',3)
        AND sc.station_id::text=split_part(objects.name,'/',4)
        AND c.municipio_id=public.fleet_current_municipio_id()
        AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo=true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.fleet_monthly_closure_documents d
      WHERE d.municipio_id=public.fleet_current_municipio_id() AND d.storage_path=objects.name
    )
  );

DROP POLICY IF EXISTS fleet_storage_monthly_closure_station_insert ON storage.objects;
CREATE POLICY fleet_storage_monthly_closure_station_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='fleet-documents'
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
    AND split_part(name,'/',2)='monthly-closures'
    AND EXISTS (
      SELECT 1
      FROM public.fleet_monthly_closures c
      JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id
      JOIN public.fleet_station_members sm ON sm.station_id=sc.station_id AND sm.municipio_id=sc.municipio_id
      WHERE c.id::text=split_part(objects.name,'/',3)
        AND sc.station_id::text=split_part(objects.name,'/',4)
        AND c.municipio_id=public.fleet_current_municipio_id()
        AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo=true
    )
  );
DROP POLICY IF EXISTS fleet_storage_monthly_closure_station_select ON storage.objects;
CREATE POLICY fleet_storage_monthly_closure_station_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id='fleet-documents'
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
    AND split_part(name,'/',2)='monthly-closures'
    AND (
      public.fleet_is_closure_manager() OR EXISTS (
        SELECT 1
        FROM public.fleet_monthly_closures c
        JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id
        JOIN public.fleet_station_members sm ON sm.station_id=sc.station_id AND sm.municipio_id=sc.municipio_id
        WHERE c.id::text=split_part(objects.name,'/',3)
          AND sc.station_id::text=split_part(objects.name,'/',4)
          AND c.municipio_id=public.fleet_current_municipio_id()
          AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo=true
      )
    )
  );

DROP TRIGGER IF EXISTS fleet_monthly_closure_01_status_guard ON public.fleet_monthly_closures;
DROP TRIGGER IF EXISTS fleet_monthly_closure_02_ready_guard ON public.fleet_monthly_closures;
DROP TRIGGER IF EXISTS fleet_monthly_closure_status_guard ON public.fleet_monthly_closures;
CREATE TRIGGER fleet_monthly_closure_01_status_guard
  BEFORE INSERT OR UPDATE OF status ON public.fleet_monthly_closures
  FOR EACH ROW EXECUTE FUNCTION public.fleet_guard_monthly_closure_transition();
CREATE TRIGGER fleet_monthly_closure_02_ready_guard
  BEFORE INSERT OR UPDATE OF status ON public.fleet_monthly_closures
  FOR EACH ROW WHEN (NEW.status='FECHADO'::public.fleet_closure_status)
  EXECUTE FUNCTION public.fleet_guard_monthly_closure_ready();

-- Migração dos registros existentes: criar a composição por posto e vincular cada abastecimento
-- da competência ao seu único fechamento, sem remover nem inventar valores/documentos fiscais.
WITH station_scope AS (
  SELECT c.id AS closure_id,c.municipio_id,s.id AS station_id
  FROM public.fleet_monthly_closures c
  JOIN public.fleet_fuel_stations s ON s.municipio_id=c.municipio_id AND s.status='ATIVO'::public.fleet_station_status
  UNION
  SELECT c.id,c.municipio_id,f.station_id
  FROM public.fleet_monthly_closures c
  JOIN public.fleet_fuelings f ON f.municipio_id=c.municipio_id
    AND f.performed_at>=make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')
    AND f.performed_at<make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')+interval '1 month'
  UNION
  SELECT c.id,c.municipio_id,sc.station_id
  FROM public.fleet_monthly_closures c
  JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id
), rollups AS (
  SELECT ss.closure_id,ss.municipio_id,ss.station_id,
    count(f.id) FILTER (WHERE f.status<>'CANCELADO'::public.fleet_fueling_status)::integer AS fueling_count,
    COALESCE(sum(f.liters) FILTER (WHERE f.status<>'CANCELADO'::public.fleet_fueling_status),0)::numeric(14,3) AS liters_total,
    COALESCE(sum(f.total_amount) FILTER (WHERE f.status<>'CANCELADO'::public.fleet_fueling_status),0)::numeric(14,2) AS amount_total,
    count(f.id) FILTER (WHERE f.status<>'CANCELADO'::public.fleet_fueling_status AND NOT EXISTS (
      SELECT 1 FROM public.fleet_fueling_documents fd
      WHERE fd.municipio_id=f.municipio_id AND fd.fueling_id=f.id AND fd.is_current
        AND fd.document_status='ACEITO'::public.fleet_document_status AND NULLIF(btrim(fd.storage_path),'') IS NOT NULL
    ))::integer AS documents_pending
  FROM station_scope ss
  JOIN public.fleet_monthly_closures c ON c.id=ss.closure_id
  LEFT JOIN public.fleet_fuelings f ON f.municipio_id=ss.municipio_id AND f.station_id=ss.station_id
    AND f.performed_at>=make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')
    AND f.performed_at<make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')+interval '1 month'
  GROUP BY ss.closure_id,ss.municipio_id,ss.station_id
)
INSERT INTO public.fleet_monthly_closure_station_checks (
  municipio_id,closure_id,station_id,registered_fueling_count,registered_liters,registered_amount,
  invoiced_amount,divergence_amount,documents_pending_count,status,closure_status
)
SELECT r.municipio_id,r.closure_id,r.station_id,r.fueling_count,r.liters_total,r.amount_total,
  NULL,NULL,r.documents_pending,
  CASE WHEN r.fueling_count=0 AND c.status='CONFERIDO'::public.fleet_closure_status THEN 'CONFERIDO' ELSE 'PENDENTE' END,
  c.status
FROM rollups r JOIN public.fleet_monthly_closures c ON c.id=r.closure_id
ON CONFLICT (closure_id,station_id) DO UPDATE SET
  registered_fueling_count=EXCLUDED.registered_fueling_count,
  registered_liters=EXCLUDED.registered_liters,
  registered_amount=EXCLUDED.registered_amount,
  documents_pending_count=EXCLUDED.documents_pending_count;

INSERT INTO public.fleet_monthly_closure_transactions (
  municipio_id,closure_id,station_check_id,station_id,fueling_id,included_at,inclusion_type,is_included,notes
)
SELECT c.municipio_id,c.id,sc.id,f.station_id,f.id,clock_timestamp(),'MIGRACAO_V2',
       f.status<>'CANCELADO'::public.fleet_fueling_status,
       CASE WHEN f.status='CANCELADO'::public.fleet_fueling_status THEN 'Registro cancelado, preservado fora do total líquido.' ELSE 'Composição fictícia adaptada ao fluxo v2.0.' END
FROM public.fleet_monthly_closures c
JOIN public.fleet_fuelings f ON f.municipio_id=c.municipio_id
  AND f.performed_at>=make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')
  AND f.performed_at<make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')+interval '1 month'
JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id AND sc.station_id=f.station_id
ON CONFLICT (fueling_id) DO NOTHING;

UPDATE public.fleet_monthly_closures
SET notes='Período fictício adaptado ao fluxo de fechamento mensal v2.0.',updated_at=clock_timestamp()
WHERE notes ILIKE 'TESTE_FROTAS_V2%';
INSERT INTO public.fleet_monthly_closure_history (
  municipio_id,closure_id,entity_table,entity_id,action_type,previous_status,new_status,reason,metadata
)
SELECT c.municipio_id,c.id,'fleet_monthly_closures',c.id,'ADAPTACAO_FLUXO_V2',c.status::text,c.status::text,
       'Registros fictícios convertidos para composição por posto, conciliação e auditoria v2.0.',
       jsonb_build_object('migration','20261108_monthly_closure_v2','adapted_station_checks',
         (SELECT count(*) FROM public.fleet_monthly_closure_station_checks sc WHERE sc.closure_id=c.id),
         'linked_fuelings',(SELECT count(*) FROM public.fleet_monthly_closure_transactions t WHERE t.closure_id=c.id))
FROM public.fleet_monthly_closures c
WHERE NOT EXISTS (
  SELECT 1 FROM public.fleet_monthly_closure_history h
  WHERE h.closure_id=c.id AND h.entity_table='fleet_monthly_closures' AND h.action_type='ADAPTACAO_FLUXO_V2'
);

COMMENT ON TABLE public.fleet_monthly_closure_station_checks IS
  'Fechamento individual por posto dentro do agrupador municipal da competência; totais derivados no backend.';
COMMENT ON TABLE public.fleet_monthly_closure_transactions IS
  'Composição rastreável de abastecimentos por fechamento, com unicidade global para impedir dupla inclusão.';
COMMENT ON TABLE public.fleet_monthly_closure_documents IS
  'Notas fiscais e demais documentos fiscais do fechamento; os arquivos ficam no bucket privado fleet-documents.';
COMMENT ON TABLE public.fleet_monthly_closure_history IS
  'Trilha append-only de alterações, decisões, documentos e comunicações do fechamento mensal.';
COMMENT ON TABLE public.fleet_monthly_closure_versions IS
  'Snapshots imutáveis da composição por posto em conferência, reabertura e fechamento.';

REVOKE ALL ON FUNCTION public.fleet_is_closure_manager() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_can_read_monthly_closures() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_is_station_member(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_is_closure_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_can_read_monthly_closures() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_is_station_member(uuid,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fleet_internal_refresh_monthly_closure(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_recompute_monthly_closure_parent(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_snapshot_monthly_closure_station(uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_snapshot_monthly_closure_station_trigger() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_log_monthly_closure_history() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_guard_monthly_closure_ready() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_guard_monthly_closure_transition() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.fleet_guard_monthly_closure_fueling() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fleet_prepare_monthly_closure(smallint,smallint,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_supplier_monthly_closure(uuid,smallint,smallint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_monthly_closure_municipal_summary(smallint,smallint) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_request_monthly_closure(uuid,uuid,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_start_monthly_closure_station_review(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_register_monthly_closure_document(uuid,uuid,text,text,text,text,date,text,numeric,text,text,text,bigint,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_review_monthly_closure_document(uuid,public.fleet_document_status,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_review_monthly_closure_fueling(uuid,uuid,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_record_monthly_closure_discrepancy(uuid,uuid,uuid,text,text,text,numeric,timestamptz) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_send_monthly_closure_message(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_resolve_monthly_closure_discrepancy(uuid,text,text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_confirm_monthly_closure_station(uuid,uuid,text,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_refresh_monthly_closure(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_close_month(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_reopen_monthly_closure(uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_prepare_monthly_closure(smallint,smallint,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_monthly_closure(uuid,smallint,smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_monthly_closure_municipal_summary(smallint,smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_request_monthly_closure(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_start_monthly_closure_station_review(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_register_monthly_closure_document(uuid,uuid,text,text,text,text,date,text,numeric,text,text,text,bigint,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_review_monthly_closure_document(uuid,public.fleet_document_status,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_review_monthly_closure_fueling(uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_record_monthly_closure_discrepancy(uuid,uuid,uuid,text,text,text,numeric,timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_send_monthly_closure_message(uuid,uuid,uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_resolve_monthly_closure_discrepancy(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_confirm_monthly_closure_station(uuid,uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_refresh_monthly_closure(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_close_month(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_reopen_monthly_closure(uuid,text) TO authenticated;

COMMIT;
