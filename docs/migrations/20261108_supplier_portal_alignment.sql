BEGIN;

-- The supplier portal must never read the municipal-wide unit directory or the
-- parent closure row directly. The authenticated supplier gets only scoped RPCs.
CREATE OR REPLACE FUNCTION public.fleet_is_supplier_user()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.fleet_station_members sm
    WHERE sm.usuario_id = public.fleet_current_usuario_id()
      AND sm.municipio_id = public.fleet_current_municipio_id()
      AND sm.ativo
  );
$function$;
REVOKE ALL ON FUNCTION public.fleet_is_supplier_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_is_supplier_user() TO authenticated;

DROP POLICY IF EXISTS fleet_units_supplier_private_read ON public.unidades_organizacionais;
CREATE POLICY fleet_units_supplier_private_read
  ON public.unidades_organizacionais
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    public.fleet_is_manager() OR NOT public.fleet_is_supplier_user()
  );

DROP POLICY IF EXISTS fleet_monthly_closures_read_v2 ON public.fleet_monthly_closures;
CREATE POLICY fleet_monthly_closures_read_v2
  ON public.fleet_monthly_closures
  AS RESTRICTIVE
  FOR SELECT TO authenticated
  USING (
    municipio_id = public.fleet_current_municipio_id()
    AND public.fleet_can_read_monthly_closures()
  );

-- Do not expose the former broad vehicle-options RPC to authenticated clients.
REVOKE ALL ON FUNCTION public.fleet_supplier_vehicle_options(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.fleet_supplier_vehicle_options_v2(p_station_id uuid)
RETURNS TABLE(
  id uuid,
  placa text,
  marca text,
  modelo text,
  fuel_type_id uuid,
  tank_capacity_l numeric,
  requires_authorization boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_usuario integer := public.fleet_current_usuario_id();
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL OR p_station_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.fleet_station_members sm
       JOIN public.fleet_fuel_stations s
         ON s.id = sm.station_id AND s.municipio_id = sm.municipio_id
       WHERE sm.station_id = p_station_id
         AND sm.municipio_id = v_municipio
         AND sm.usuario_id = v_usuario
         AND sm.ativo
         AND s.status = 'ATIVO'
     ) THEN
    RAISE EXCEPTION 'Posto fora do escopo do usuário.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT v.id, v.placa, v.marca, v.modelo, v.fuel_type_id,
         v.tank_capacity_l,
         (v.operational_status::text = 'CEDIDO')
  FROM public.fleet_vehicles v
  WHERE v.municipio_id = v_municipio
    AND v.operational_status::text IN ('ATIVO', 'CEDIDO')
  ORDER BY v.placa;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_fueling_page(
  p_station_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE(
  id uuid,
  vehicle_id uuid,
  fuel_type_id uuid,
  driver_id uuid,
  driver_name text,
  performed_at timestamptz,
  submitted_at timestamptz,
  recorded_at timestamptz,
  liters numeric,
  unit_price numeric,
  total_amount numeric,
  odometer_km numeric,
  status text,
  operational_status text,
  review_status text,
  entry_type text,
  station_receipt_number text,
  late_entry_reason text,
  notes text,
  protocol_number text,
  vehicle_plate text,
  vehicle_brand text,
  vehicle_model text,
  fuel_name text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_usuario integer := public.fleet_current_usuario_id();
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL OR p_station_id IS NULL
     OR NOT public.fleet_is_station_member(p_station_id, v_municipio) THEN
    RAISE EXCEPTION 'Posto fora do escopo do usuário.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT f.id, f.vehicle_id, f.fuel_type_id, f.driver_id,
         COALESCE(f.driver_name_snapshot, d.nome),
         f.performed_at, f.submitted_at, f.recorded_at, f.liters, f.unit_price,
         f.total_amount, f.odometer_km, f.status::text, f.operational_status,
         f.review_status, f.entry_type, f.station_receipt_number,
         CASE WHEN f.record_origin = 'POSTO' THEN f.late_entry_reason END,
         CASE WHEN f.record_origin = 'POSTO' THEN f.notes END,
         f.protocol_number,
         v.placa, v.marca, v.modelo, ft.nome
  FROM public.fleet_fuelings f
  LEFT JOIN public.fleet_vehicles v
    ON v.id = f.vehicle_id AND v.municipio_id = f.municipio_id
  LEFT JOIN public.fleet_drivers d
    ON d.id = f.driver_id AND d.municipio_id = f.municipio_id
  LEFT JOIN public.fleet_fuel_types ft
    ON ft.id = f.fuel_type_id AND ft.municipio_id = f.municipio_id
  WHERE f.municipio_id = v_municipio
    AND f.station_id = p_station_id
  ORDER BY f.performed_at DESC, f.id ASC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_supplier_dashboard_summary(p_station_id uuid)
RETURNS TABLE(
  today_count bigint,
  today_liters numeric,
  today_amount numeric,
  month_count bigint,
  month_liters numeric,
  month_amount numeric,
  pending_review_count bigint,
  pending_completion_count bigint,
  pending_document_count bigint,
  pending_closure_count bigint,
  municipal_request_count bigint,
  open_divergence_count bigint,
  normal_entry_window_minutes integer,
  require_late_reason boolean,
  receipt_upload_window_hours integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_usuario integer := public.fleet_current_usuario_id();
  v_local_date date := (current_timestamp AT TIME ZONE 'America/Sao_Paulo')::date;
  v_today_start timestamptz;
  v_tomorrow_start timestamptz;
  v_month_start timestamptz;
  v_next_month_start timestamptz;
BEGIN
  IF v_municipio IS NULL OR v_usuario IS NULL OR p_station_id IS NULL
     OR NOT public.fleet_is_station_member(p_station_id, v_municipio) THEN
    RAISE EXCEPTION 'Posto fora do escopo do usuário.' USING ERRCODE = '42501';
  END IF;

  v_today_start := v_local_date::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_tomorrow_start := (v_local_date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
  v_month_start := date_trunc('month', v_local_date::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  v_next_month_start := (date_trunc('month', v_local_date::timestamp) + interval '1 month') AT TIME ZONE 'America/Sao_Paulo';

  RETURN QUERY
  SELECT
    count(f.id) FILTER (WHERE f.performed_at >= v_today_start AND f.performed_at < v_tomorrow_start AND f.status::text <> 'CANCELADO'),
    COALESCE(sum(f.liters) FILTER (WHERE f.performed_at >= v_today_start AND f.performed_at < v_tomorrow_start AND f.status::text <> 'CANCELADO'), 0),
    COALESCE(sum(f.total_amount) FILTER (WHERE f.performed_at >= v_today_start AND f.performed_at < v_tomorrow_start AND f.status::text <> 'CANCELADO'), 0),
    count(f.id) FILTER (WHERE f.performed_at >= v_month_start AND f.performed_at < v_next_month_start AND f.status::text <> 'CANCELADO'),
    COALESCE(sum(f.liters) FILTER (WHERE f.performed_at >= v_month_start AND f.performed_at < v_next_month_start AND f.status::text <> 'CANCELADO'), 0),
    COALESCE(sum(f.total_amount) FILTER (WHERE f.performed_at >= v_month_start AND f.performed_at < v_next_month_start AND f.status::text <> 'CANCELADO'), 0),
    count(f.id) FILTER (WHERE f.status::text IN ('PENDENTE_DE_CONFERENCIA', 'EM_ANALISE')),
    count(f.id) FILTER (
      WHERE f.status::text NOT IN ('CANCELADO', 'INCLUIDO_NO_FECHAMENTO')
        AND (d.id IS NULL OR d.document_status::text = 'REJEITADO')
    ),
    count(f.id) FILTER (
      WHERE f.status::text NOT IN ('CANCELADO', 'INCLUIDO_NO_FECHAMENTO')
        AND (d.id IS NULL OR d.document_status::text IN ('PENDENTE', 'ENVIADO', 'EM_ANALISE', 'REJEITADO'))
    ),
    (SELECT count(*)
       FROM public.fleet_monthly_closure_station_checks sc
      WHERE sc.municipio_id = v_municipio
        AND sc.station_id = p_station_id
        AND sc.closure_status::text NOT IN ('CONFERIDO', 'FECHADO')),
    (SELECT count(*)
       FROM public.fleet_monthly_closure_messages m
       JOIN public.fleet_monthly_closure_discrepancies x
         ON x.id = m.discrepancy_id
        AND x.station_id = m.station_id
        AND x.municipio_id = m.municipio_id
      WHERE m.municipio_id = v_municipio
        AND m.station_id = p_station_id
        AND m.sender_scope = 'MUNICIPAL'
        AND m.message_type = 'SOLICITACAO_ESCLARECIMENTO'
        AND x.status = 'AGUARDANDO_RESPOSTA'),
    (SELECT count(*)
       FROM public.fleet_monthly_closure_discrepancies x
      WHERE x.municipio_id = v_municipio
        AND x.station_id = p_station_id
        AND x.status NOT IN ('RESOLVIDA', 'CANCELADA')),
    COALESCE((SELECT p.normal_entry_window_minutes FROM public.fleet_fueling_policies p WHERE p.municipio_id = v_municipio), 30),
    COALESCE((SELECT p.require_late_reason FROM public.fleet_fueling_policies p WHERE p.municipio_id = v_municipio), true),
    24
  FROM public.fleet_fuelings f
  LEFT JOIN LATERAL (
    SELECT fd.id, fd.document_status
    FROM public.fleet_fueling_documents fd
    WHERE fd.municipio_id = f.municipio_id
      AND fd.fueling_id = f.id
      AND fd.is_current
    ORDER BY fd.uploaded_at DESC
    LIMIT 1
  ) d ON true
  WHERE f.municipio_id = v_municipio
    AND f.station_id = p_station_id;
END;
$function$;

-- Parent closure rows contain municipal-wide aggregates. Suppliers may access
-- their own scoped view only through the whitelisted RPC below.
CREATE OR REPLACE FUNCTION public.fleet_supplier_monthly_closure(
  p_station_id uuid,
  p_reference_year smallint,
  p_reference_month smallint
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_municipio uuid := public.fleet_current_municipio_id();
  v_actor integer := public.fleet_current_usuario_id();
  v_closure public.fleet_monthly_closures%ROWTYPE;
  v_check public.fleet_monthly_closure_station_checks%ROWTYPE;
BEGIN
  IF v_municipio IS NULL OR v_actor IS NULL OR NOT public.fleet_is_station_member(p_station_id, v_municipio) THEN
    RAISE EXCEPTION 'O usuário não pertence a este estabelecimento.' USING ERRCODE = '42501';
  END IF;
  IF p_reference_year NOT BETWEEN 2000 AND 2200 OR p_reference_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Competência inválida.' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_municipio::text || ':' || p_reference_year::text || ':' || p_reference_month::text, 0));
  INSERT INTO public.fleet_monthly_closures (municipio_id, reference_year, reference_month, status, started_by, started_at)
  VALUES (v_municipio, p_reference_year, p_reference_month, 'ABERTO'::public.fleet_closure_status, v_actor, clock_timestamp())
  ON CONFLICT (municipio_id, reference_year, reference_month) DO NOTHING;

  SELECT * INTO v_closure
  FROM public.fleet_monthly_closures
  WHERE municipio_id = v_municipio
    AND reference_year = p_reference_year
    AND reference_month = p_reference_month
  FOR UPDATE;

  IF NOT EXISTS (
       SELECT 1 FROM public.fleet_monthly_closure_station_checks sc
       WHERE sc.closure_id = v_closure.id AND sc.station_id = p_station_id
     )
     AND v_closure.status IN ('ABERTO'::public.fleet_closure_status, 'EM_CONFERENCIA'::public.fleet_closure_status) THEN
    INSERT INTO public.fleet_monthly_closure_station_checks (municipio_id, closure_id, station_id, closure_status, status)
    VALUES (v_municipio, v_closure.id, p_station_id, 'ABERTO'::public.fleet_closure_status, 'PENDENTE');
  END IF;

  IF v_closure.status NOT IN ('FECHADO'::public.fleet_closure_status, 'CONFERIDO'::public.fleet_closure_status) THEN
    PERFORM public.fleet_internal_refresh_monthly_closure(v_closure.id);
  END IF;

  SELECT * INTO v_check
  FROM public.fleet_monthly_closure_station_checks
  WHERE closure_id = v_closure.id AND station_id = p_station_id;
  SELECT * INTO v_closure FROM public.fleet_monthly_closures WHERE id = v_closure.id;

  RETURN jsonb_build_object(
    'closure', jsonb_build_object(
      'id', v_closure.id,
      'reference_year', v_closure.reference_year,
      'reference_month', v_closure.reference_month,
      'status', v_closure.status,
      'started_at', v_closure.started_at,
      'checked_at', v_closure.checked_at,
      'closed_at', v_closure.closed_at,
      'reopened_at', v_closure.reopened_at,
      'reopening_reason', v_closure.reopening_reason
    ),
    'station_check', CASE WHEN v_check.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object(
      'id', v_check.id,
      'closure_id', v_check.closure_id,
      'station_id', v_check.station_id,
      'registered_fueling_count', v_check.registered_fueling_count,
      'registered_liters', v_check.registered_liters,
      'registered_amount', v_check.registered_amount,
      'invoiced_amount', v_check.invoiced_amount,
      'divergence_amount', v_check.divergence_amount,
      'documents_pending_count', v_check.documents_pending_count,
      'status', v_check.status,
      'closure_status', v_check.closure_status,
      'checked_at', v_check.checked_at,
      'requested_at', v_check.requested_at,
      'no_activity_reported', v_check.no_activity_reported,
      'no_activity_confirmed', v_check.no_activity_confirmed,
      'review_notes', v_check.review_notes
    ) END
  );
END;
$function$;

-- An over-capacity fueling is routed for municipal review only when the supplier
-- submits a formal justification. The existing validation trigger keeps it in
-- COM_INCONSISTENCIA and the audit trigger records the full submitted row.
CREATE OR REPLACE FUNCTION public.fleet_require_tank_exception_reason()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_capacity numeric;
  v_reason text;
BEGIN
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;

  SELECT v.tank_capacity_l INTO v_capacity
  FROM public.fleet_vehicles v
  WHERE v.id = NEW.vehicle_id AND v.municipio_id = NEW.municipio_id;

  IF v_capacity IS NULL OR NEW.liters <= v_capacity THEN RETURN NEW; END IF;

  v_reason := NULLIF(btrim(substring(
    COALESCE(NEW.notes, '')
    FROM '(?is)\[JUSTIFICATIVA DE EXCECAO DE TANQUE\]:\s*(.*)$'
  )), '');
  IF v_reason IS NULL OR length(v_reason) < 10 THEN
    RAISE EXCEPTION 'Volume acima da capacidade do tanque exige justificativa formal de pelo menos 10 caracteres.' USING ERRCODE = '23514';
  END IF;

  NEW.inconsistency_notes := concat_ws(E'\n', NEW.inconsistency_notes, 'Justificativa enviada pelo estabelecimento: ' || v_reason);
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_require_tank_exception_reason() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS fleet_fueling_tank_exception_guard ON public.fleet_fuelings;
CREATE TRIGGER fleet_fueling_tank_exception_guard
  BEFORE INSERT ON public.fleet_fuelings
  FOR EACH ROW EXECUTE FUNCTION public.fleet_require_tank_exception_reason();

CREATE OR REPLACE FUNCTION public.fleet_submit_fueling_supplier_v2(
  p_idempotency_key uuid,
  p_station_id uuid,
  p_vehicle_id uuid,
  p_fuel_type_id uuid,
  p_driver_id uuid,
  p_responsible_unit_id uuid,
  p_beneficiary_unit_id uuid,
  p_authorization_id uuid,
  p_performed_at timestamptz,
  p_liters numeric,
  p_unit_price numeric,
  p_odometer_km numeric,
  p_station_receipt_number text,
  p_notes text,
  p_late_entry_reason text,
  p_tank_exception_reason text
)
RETURNS TABLE(
  fueling_id uuid,
  protocol_number text,
  status text,
  operational_status text,
  review_status text,
  submitted_at timestamptz,
  total_amount numeric
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'pg_catalog', 'public', 'auth', 'pg_temp'
AS $function$
DECLARE
  v_notes text := NULLIF(btrim(p_notes), '');
BEGIN
  IF p_tank_exception_reason IS NOT NULL AND length(btrim(p_tank_exception_reason)) NOT BETWEEN 10 AND 1000 THEN
    RAISE EXCEPTION 'A justificativa de excedente do tanque deve ter entre 10 e 1.000 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF p_tank_exception_reason IS NOT NULL THEN
    v_notes := concat_ws(E'\n', v_notes, '[JUSTIFICATIVA DE EXCECAO DE TANQUE]: ' || btrim(p_tank_exception_reason));
  END IF;

  RETURN QUERY
  SELECT *
  FROM public.fleet_submit_fueling(
    p_idempotency_key, p_station_id, p_vehicle_id, p_fuel_type_id, p_driver_id,
    p_responsible_unit_id, p_beneficiary_unit_id, p_authorization_id, p_performed_at,
    p_liters, p_unit_price, p_odometer_km, p_station_receipt_number, v_notes,
    p_late_entry_reason, 'POSTO'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_supplier_vehicle_options_v2(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_supplier_fueling_page(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_supplier_dashboard_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_supplier_monthly_closure(uuid, smallint, smallint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.fleet_submit_fueling_supplier_v2(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, text, text, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.fleet_supplier_vehicle_options_v2(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_fueling_page(uuid, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_dashboard_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_monthly_closure(uuid, smallint, smallint) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_submit_fueling_supplier_v2(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid, timestamptz, numeric, numeric, numeric, text, text, text, text) TO authenticated;

COMMIT;
