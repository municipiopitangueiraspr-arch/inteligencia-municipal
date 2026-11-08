-- Inteligência Municipal · Gestão de Frotas
-- Dashboard: agregações completas no PostgreSQL, filtros por mês de referência,
-- drill-down paginado e autorização estrita no backend.

CREATE INDEX IF NOT EXISTS fleet_fuelings_dashboard_unit_date_idx
  ON public.fleet_fuelings (municipio_id, responsible_unit_id, performed_at);
CREATE INDEX IF NOT EXISTS fleet_fuelings_dashboard_beneficiary_date_idx
  ON public.fleet_fuelings (municipio_id, beneficiary_unit_id, performed_at)
  WHERE beneficiary_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_fuelings_dashboard_driver_date_idx
  ON public.fleet_fuelings (municipio_id, driver_id, performed_at)
  WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_fuelings_dashboard_fuel_date_idx
  ON public.fleet_fuelings (municipio_id, fuel_type_id, performed_at);
CREATE INDEX IF NOT EXISTS fleet_fueling_documents_dashboard_current_idx
  ON public.fleet_fueling_documents (municipio_id, fueling_id, uploaded_at DESC)
  WHERE is_current = true;
CREATE INDEX IF NOT EXISTS fleet_inconsistencies_dashboard_open_idx
  ON public.fleet_inconsistencies (municipio_id, created_at DESC)
  WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.fleet_dashboard_overview(
  p_start_month date,
  p_end_month_exclusive date,
  p_responsible_unit_id uuid DEFAULT NULL,
  p_beneficiary_unit_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_station_id uuid DEFAULT NULL,
  p_fuel_type_id uuid DEFAULT NULL,
  p_fueling_status text DEFAULT NULL,
  p_document_status text DEFAULT NULL,
  p_recent_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_municipio_id uuid;
  v_timezone constant text := 'America/Sao_Paulo';
  v_start timestamptz;
  v_end timestamptz;
  v_period_months integer;
  v_previous_start timestamptz;
  v_year_start timestamptz;
  v_scan_start timestamptz;
  v_recent_limit integer;
BEGIN
  IF auth.uid() IS NULL OR public.fleet_current_usuario_id() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária para consultar o painel.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.fleet_is_mayor_or_manager() THEN
    RAISE EXCEPTION 'Perfil sem permissão para consultar o painel gerencial de Frotas.' USING ERRCODE = '42501';
  END IF;
  v_municipio_id := public.fleet_current_municipio_id();
  IF v_municipio_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o município do usuário.' USING ERRCODE = '42501';
  END IF;
  IF p_start_month IS NULL OR p_end_month_exclusive IS NULL
     OR p_start_month >= p_end_month_exclusive
     OR date_trunc('month', p_start_month::timestamp)::date <> p_start_month
     OR date_trunc('month', p_end_month_exclusive::timestamp)::date <> p_end_month_exclusive THEN
    RAISE EXCEPTION 'Informe meses de referência válidos, com início anterior ao fim.' USING ERRCODE = '22023';
  END IF;
  IF p_fueling_status IS NOT NULL AND p_fueling_status NOT IN (
    'RASCUNHO','ENVIADO_PELO_POSTO','PENDENTE_DE_COMPROVANTE','PENDENTE_DE_CONFERENCIA',
    'EM_ANALISE','COM_INCONSISTENCIA','SOLICITADA_CORRECAO','CORRIGIDO','CONFERIDO',
    'INCLUIDO_NO_FECHAMENTO','CANCELADO'
  ) THEN
    RAISE EXCEPTION 'Situação de abastecimento inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_document_status IS NOT NULL AND p_document_status NOT IN (
    'SEM_COMPROVANTE','PENDENTE','ENVIADO','EM_ANALISE','ACEITO','REJEITADO','SUBSTITUIDO'
  ) THEN
    RAISE EXCEPTION 'Situação de comprovante inválida.' USING ERRCODE = '22023';
  END IF;

  v_start := p_start_month::timestamp AT TIME ZONE v_timezone;
  v_end := p_end_month_exclusive::timestamp AT TIME ZONE v_timezone;
  v_period_months := (EXTRACT(YEAR FROM p_end_month_exclusive)::integer - EXTRACT(YEAR FROM p_start_month)::integer) * 12
                   + (EXTRACT(MONTH FROM p_end_month_exclusive)::integer - EXTRACT(MONTH FROM p_start_month)::integer);
  v_previous_start := (p_start_month - make_interval(months => v_period_months))::timestamp AT TIME ZONE v_timezone;
  v_year_start := make_date(EXTRACT(YEAR FROM (p_end_month_exclusive - 1))::integer, 1, 1)::timestamp AT TIME ZONE v_timezone;
  v_scan_start := LEAST(v_start, v_previous_start, v_year_start);
  v_recent_limit := CASE WHEN p_recent_limit IN (10,20,50) THEN p_recent_limit ELSE 20 END;

  RETURN (
    WITH base AS MATERIALIZED (
      SELECT
        f.id, f.municipio_id, f.vehicle_id, f.station_id, f.fuel_type_id, f.driver_id,
        f.responsible_unit_id, f.beneficiary_unit_id, f.status::text AS status,
        f.performed_at, f.submitted_at, f.liters,
        COALESCE(f.total_amount, f.liters * f.unit_price, 0)::numeric AS amount,
        f.unit_price, f.odometer_km, f.inconsistency_code, f.inconsistency_notes,
        v.placa, v.marca, v.modelo, v.operational_status::text AS vehicle_status,
        ru.nome AS responsible_unit_name, ru.sigla AS responsible_unit_sigla,
        bu.nome AS beneficiary_unit_name, bu.sigla AS beneficiary_unit_sigla,
        d.nome AS driver_name,
        s.nome_fantasia_snapshot AS station_name,
        ft.nome AS fuel_type_name,
        doc.document_status
      FROM public.fleet_fuelings f
      LEFT JOIN public.fleet_vehicles v
        ON v.id = f.vehicle_id AND v.municipio_id = v_municipio_id
      LEFT JOIN public.unidades_organizacionais ru
        ON ru.id = f.responsible_unit_id AND ru.municipio_id = v_municipio_id
      LEFT JOIN public.unidades_organizacionais bu
        ON bu.id = f.beneficiary_unit_id AND bu.municipio_id = v_municipio_id
      LEFT JOIN public.fleet_drivers d
        ON d.id = f.driver_id AND d.municipio_id = v_municipio_id
      LEFT JOIN public.fleet_fuel_stations s
        ON s.id = f.station_id AND s.municipio_id = v_municipio_id
      LEFT JOIN public.fleet_fuel_types ft
        ON ft.id = f.fuel_type_id AND ft.municipio_id = v_municipio_id
      LEFT JOIN LATERAL (
        SELECT fd.document_status::text AS document_status
        FROM public.fleet_fueling_documents fd
        WHERE fd.municipio_id = v_municipio_id AND fd.fueling_id = f.id AND fd.is_current = true
        ORDER BY fd.uploaded_at DESC, fd.id DESC
        LIMIT 1
      ) doc ON true
      WHERE f.municipio_id = v_municipio_id
        AND f.performed_at >= v_scan_start AND f.performed_at < v_end
        AND f.status::text NOT IN ('CANCELADO','RASCUNHO')
        AND f.canceled_at IS NULL
        AND (p_responsible_unit_id IS NULL OR f.responsible_unit_id = p_responsible_unit_id)
        AND (p_beneficiary_unit_id IS NULL OR f.beneficiary_unit_id = p_beneficiary_unit_id)
        AND (p_vehicle_id IS NULL OR f.vehicle_id = p_vehicle_id)
        AND (p_driver_id IS NULL OR f.driver_id = p_driver_id)
        AND (p_station_id IS NULL OR f.station_id = p_station_id)
        AND (p_fuel_type_id IS NULL OR f.fuel_type_id = p_fuel_type_id)
        AND (p_fueling_status IS NULL OR f.status::text = p_fueling_status)
        AND (
          p_document_status IS NULL
          OR (p_document_status = 'SEM_COMPROVANTE' AND doc.document_status IS NULL)
          OR (p_document_status <> 'SEM_COMPROVANTE' AND doc.document_status = p_document_status)
        )
    ), current_rows AS MATERIALIZED (
      SELECT * FROM base WHERE performed_at >= v_start AND performed_at < v_end
    ), scoped_inconsistencies AS MATERIALIZED (
      SELECT i.id,i.severity,i.title,i.description,i.status,i.created_at,i.fueling_id,i.vehicle_id,
             v.placa,i.resolved_at,i.resolution_notes
      FROM public.fleet_inconsistencies i
      LEFT JOIN public.fleet_vehicles v ON v.id=i.vehicle_id AND v.municipio_id=v_municipio_id
      WHERE i.municipio_id=v_municipio_id AND i.resolved_at IS NULL
        AND i.created_at >= v_start AND i.created_at < v_end
        AND (
          (i.fueling_id IS NOT NULL AND EXISTS (SELECT 1 FROM current_rows cr WHERE cr.id=i.fueling_id))
          OR (i.fueling_id IS NULL AND p_responsible_unit_id IS NULL AND p_beneficiary_unit_id IS NULL
              AND p_vehicle_id IS NULL AND p_driver_id IS NULL AND p_station_id IS NULL AND p_fuel_type_id IS NULL
              AND p_fueling_status IS NULL AND p_document_status IS NULL)
        )
    ), summary AS (
      SELECT
        COUNT(*)::bigint AS fueling_count,
        COALESCE(SUM(liters),0)::numeric AS liters,
        COALESCE(SUM(amount),0)::numeric AS registered_amount,
        COALESCE(SUM(amount) FILTER (WHERE status IN ('CONFERIDO','INCLUIDO_NO_FECHAMENTO')),0)::numeric AS confirmed_amount,
        COUNT(*) FILTER (WHERE status IN ('CONFERIDO','INCLUIDO_NO_FECHAMENTO'))::bigint AS confirmed_count,
        COUNT(*) FILTER (WHERE status NOT IN ('CONFERIDO','INCLUIDO_NO_FECHAMENTO'))::bigint AS pending_confirmation_count,
        COUNT(*) FILTER (WHERE document_status IS DISTINCT FROM 'ACEITO')::bigint AS pending_document_count,
        COUNT(*) FILTER (WHERE status = 'COM_INCONSISTENCIA' OR inconsistency_code IS NOT NULL)::bigint AS fueling_alert_count,
        COUNT(DISTINCT vehicle_id)::bigint AS distinct_vehicles,
        COUNT(DISTINCT station_id)::bigint AS distinct_stations,
        CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(amount) / COUNT(*) END::numeric AS average_per_fueling,
        CASE WHEN COALESCE(SUM(liters),0) = 0 THEN NULL ELSE SUM(amount) / SUM(liters) END::numeric AS weighted_price_per_liter
      FROM current_rows
    ),
    prev_summary AS (
      SELECT COALESCE(SUM(amount),0)::numeric AS amount, COUNT(*)::bigint AS count
      FROM base WHERE performed_at >= v_previous_start AND performed_at < v_start
    ),
    ytd_summary AS (
      SELECT COALESCE(SUM(amount),0)::numeric AS amount, COUNT(*)::bigint AS count
      FROM base WHERE performed_at >= v_year_start AND performed_at < v_end
    ),
    monthly_series AS (
      SELECT gs.month_start,
             COALESCE(SUM(b.amount),0)::numeric AS amount,
             COALESCE(SUM(b.liters),0)::numeric AS liters,
             COUNT(b.id)::bigint AS fueling_count
      FROM generate_series(date_trunc('month', p_start_month::timestamp),
                           date_trunc('month', (p_end_month_exclusive - 1)::timestamp),
                           interval '1 month') AS gs(month_start)
      LEFT JOIN base b
        ON b.performed_at >= (gs.month_start AT TIME ZONE v_timezone)
       AND b.performed_at < ((gs.month_start + interval '1 month') AT TIME ZONE v_timezone)
      GROUP BY gs.month_start
    ),
    month_json AS (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'month', to_char(month_start,'YYYY-MM'),
        'amount', amount,
        'liters', liters,
        'fueling_count', fueling_count
      ) ORDER BY month_start),'[]'::jsonb) AS value FROM monthly_series
    ),
    unit_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC),'[]'::jsonb) AS value
      FROM (
        SELECT responsible_unit_id AS id, COALESCE(responsible_unit_name,'Secretaria não identificada') AS label,
               COALESCE(responsible_unit_sigla,'') AS acronym,
               COUNT(*)::bigint AS fueling_count, SUM(liters)::numeric AS liters, SUM(amount)::numeric AS amount
        FROM current_rows GROUP BY responsible_unit_id,responsible_unit_name,responsible_unit_sigla
        ORDER BY SUM(amount) DESC LIMIT 12
      ) x
    ),
    beneficiary_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC),'[]'::jsonb) AS value
      FROM (
        SELECT beneficiary_unit_id AS id, COALESCE(beneficiary_unit_name,'Secretaria beneficiária não informada') AS label,
               COALESCE(beneficiary_unit_sigla,'') AS acronym,
               COUNT(*)::bigint AS fueling_count, SUM(liters)::numeric AS liters, SUM(amount)::numeric AS amount
        FROM current_rows GROUP BY beneficiary_unit_id,beneficiary_unit_name,beneficiary_unit_sigla
        ORDER BY SUM(amount) DESC LIMIT 12
      ) x
    ),
    vehicle_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC),'[]'::jsonb) AS value
      FROM (
        SELECT vehicle_id AS id, COALESCE(placa,'Veículo não identificado') AS label,
               concat_ws(' ',marca,modelo) AS description,
               COUNT(*)::bigint AS fueling_count, SUM(liters)::numeric AS liters, SUM(amount)::numeric AS amount,
               MAX(performed_at) AS last_fueling_at
        FROM current_rows GROUP BY vehicle_id,placa,marca,modelo
        ORDER BY SUM(amount) DESC LIMIT 12
      ) x
    ),
    driver_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC),'[]'::jsonb) AS value
      FROM (
        SELECT driver_id AS id, COALESCE(driver_name,'Motorista não informado') AS label,
               COUNT(*)::bigint AS fueling_count, SUM(liters)::numeric AS liters, SUM(amount)::numeric AS amount
        FROM current_rows GROUP BY driver_id,driver_name
        ORDER BY SUM(amount) DESC LIMIT 12
      ) x
    ),
    station_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC),'[]'::jsonb) AS value
      FROM (
        SELECT station_id AS id, COALESCE(station_name,'Posto não identificado') AS label,
               COUNT(*)::bigint AS fueling_count, SUM(liters)::numeric AS liters, SUM(amount)::numeric AS amount
        FROM current_rows GROUP BY station_id,station_name
        ORDER BY SUM(amount) DESC LIMIT 12
      ) x
    ),
    fuel_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.amount DESC),'[]'::jsonb) AS value
      FROM (
        SELECT fuel_type_id AS id, COALESCE(fuel_type_name,'Combustível não identificado') AS label,
               COUNT(*)::bigint AS fueling_count, SUM(liters)::numeric AS liters, SUM(amount)::numeric AS amount,
               CASE WHEN SUM(liters)=0 THEN NULL ELSE SUM(amount)/SUM(liters) END::numeric AS weighted_price_per_liter
        FROM current_rows GROUP BY fuel_type_id,fuel_type_name
        ORDER BY SUM(amount) DESC LIMIT 12
      ) x
    ),
    recent_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.performed_at DESC),'[]'::jsonb) AS value
      FROM (
        SELECT id,status,performed_at,submitted_at,vehicle_id,placa,driver_id,driver_name,station_id,station_name,
               fuel_type_id,fuel_type_name,liters,amount,unit_price,odometer_km,document_status,
               (submitted_at > performed_at + interval '1 hour') AS entered_later
        FROM current_rows ORDER BY performed_at DESC,id DESC LIMIT v_recent_limit
      ) x
    ),
    alert_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) AS value
      FROM (
        SELECT i.id, 'INCONSISTENCIA'::text AS kind, i.severity, i.title AS label, i.description,
               i.status, i.created_at, i.fueling_id, i.vehicle_id, i.placa,
               i.resolved_at, i.resolution_notes
        FROM scoped_inconsistencies i
        UNION ALL
        SELECT cr.id, 'COMPROVANTE'::text, 'ATENCAO'::text,
               CASE WHEN cr.document_status IS NULL THEN 'Comprovante não anexado'
                    WHEN cr.document_status='REJEITADO' THEN 'Comprovante rejeitado'
                    ELSE 'Comprovante aguardando conferência' END,
               concat('Abastecimento de ',COALESCE(cr.placa,'veículo sem placa'),' em ',to_char(cr.performed_at AT TIME ZONE v_timezone,'DD/MM/YYYY HH24:MI')),
               COALESCE(cr.document_status,'SEM_COMPROVANTE'), cr.performed_at, cr.id, cr.vehicle_id, cr.placa, NULL::timestamptz, NULL::text
        FROM current_rows cr WHERE cr.document_status IS DISTINCT FROM 'ACEITO'
        ORDER BY created_at DESC LIMIT 60
      ) x
    ),
    closure_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.reference_year DESC,x.reference_month DESC,x.station_name),'[]'::jsonb) AS value
      FROM (
        SELECT c.id AS closure_id,c.reference_year,c.reference_month,c.status::text AS closure_status,
               ch.station_id,COALESCE(s.nome_fantasia_snapshot,s.razao_social_snapshot,'Posto não identificado') AS station_name,
               ch.registered_fueling_count,ch.registered_liters,ch.registered_amount,ch.invoiced_amount,
               ch.divergence_amount,ch.documents_pending_count,ch.status AS station_check_status,
               COALESCE(ch.checked_at,c.updated_at) AS last_updated_at
        FROM public.fleet_monthly_closures c
        LEFT JOIN public.fleet_monthly_closure_station_checks ch
          ON ch.closure_id=c.id AND ch.municipio_id=v_municipio_id
        LEFT JOIN public.fleet_fuel_stations s
          ON s.id=ch.station_id AND s.municipio_id=v_municipio_id
        WHERE c.municipio_id=v_municipio_id
          AND make_date(c.reference_year::integer,c.reference_month::integer,1) >= p_start_month
          AND make_date(c.reference_year::integer,c.reference_month::integer,1) < p_end_month_exclusive
          AND (p_station_id IS NULL OR ch.station_id=p_station_id)
        ORDER BY c.reference_year DESC,c.reference_month DESC,station_name
      ) x
    ),
    financial_alert_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.reference_year DESC,x.reference_month DESC),'[]'::jsonb) AS value
      FROM (
        SELECT c.id AS closure_id,c.reference_year,c.reference_month,c.status::text AS closure_status,
               ch.station_id,COALESCE(s.nome_fantasia_snapshot,s.razao_social_snapshot,'Posto não identificado') AS station_name,
               ch.registered_amount,ch.invoiced_amount,ch.divergence_amount,ch.status AS station_check_status,
               'Divergência entre abastecimentos registrados e valor fiscal informado'::text AS label
        FROM public.fleet_monthly_closures c
        JOIN public.fleet_monthly_closure_station_checks ch
          ON ch.closure_id=c.id AND ch.municipio_id=v_municipio_id
        LEFT JOIN public.fleet_fuel_stations s
          ON s.id=ch.station_id AND s.municipio_id=v_municipio_id
        WHERE c.municipio_id=v_municipio_id
          AND make_date(c.reference_year::integer,c.reference_month::integer,1) >= p_start_month
          AND make_date(c.reference_year::integer,c.reference_month::integer,1) < p_end_month_exclusive
          AND (p_station_id IS NULL OR ch.station_id=p_station_id)
          AND COALESCE(ch.divergence_amount,0) <> 0
        ORDER BY c.reference_year DESC,c.reference_month DESC
      ) x
    ),
    cnh_alert_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.cnh_valid_until),'[]'::jsonb) AS value
      FROM (
        SELECT d.id,d.nome AS driver_name,d.cnh_valid_until,
               CASE WHEN d.cnh_valid_until < CURRENT_DATE THEN 'VENCIDA' ELSE 'VENCE_EM_ATE_60_DIAS' END AS alert_status,
               (d.cnh_valid_until-CURRENT_DATE) AS days_until_expiry
        FROM public.fleet_drivers d
        WHERE d.municipio_id=v_municipio_id AND d.ativo=true
          AND d.cnh_valid_until IS NOT NULL AND d.cnh_valid_until <= CURRENT_DATE + 60
        ORDER BY d.cnh_valid_until,d.nome
      ) x
    ),
    vehicle_status_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.vehicle_count DESC),'[]'::jsonb) AS value
      FROM (
        SELECT operational_status::text AS status,COUNT(*)::bigint AS vehicle_count
        FROM public.fleet_vehicles
        WHERE municipio_id=v_municipio_id AND operational_status::text <> 'ATIVO'
        GROUP BY operational_status
      ) x
    ),
    movement_json AS (
      SELECT COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.valid_from DESC),'[]'::jsonb) AS value
      FROM (
        SELECT a.id,a.vehicle_id,v.placa,a.responsible_unit_id,ru.nome AS responsible_unit_name,
               a.beneficiary_unit_id,bu.nome AS beneficiary_unit_name,a.purpose,a.valid_from,a.valid_until,a.status::text AS status
        FROM public.fleet_vehicle_authorizations a
        LEFT JOIN public.fleet_vehicles v ON v.id=a.vehicle_id AND v.municipio_id=v_municipio_id
        LEFT JOIN public.unidades_organizacionais ru ON ru.id=a.responsible_unit_id AND ru.municipio_id=v_municipio_id
        LEFT JOIN public.unidades_organizacionais bu ON bu.id=a.beneficiary_unit_id AND bu.municipio_id=v_municipio_id
        WHERE a.municipio_id=v_municipio_id AND a.status::text='APROVADA'
          AND a.valid_from < v_end AND a.valid_until >= v_start
          AND (p_vehicle_id IS NULL OR a.vehicle_id=p_vehicle_id)
          AND (p_responsible_unit_id IS NULL OR a.responsible_unit_id=p_responsible_unit_id)
          AND (p_beneficiary_unit_id IS NULL OR a.beneficiary_unit_id=p_beneficiary_unit_id)
        ORDER BY a.valid_from DESC
      ) x
    ),
    filter_options AS (
      SELECT jsonb_build_object(
        'units', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',u.id,'name',u.nome,'acronym',u.sigla) ORDER BY u.nome),'[]'::jsonb) FROM public.unidades_organizacionais u WHERE u.municipio_id=v_municipio_id),
        'vehicles', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',v.id,'label',concat_ws(' · ',v.placa,concat_ws(' ',v.marca,v.modelo))) ORDER BY v.placa),'[]'::jsonb) FROM public.fleet_vehicles v WHERE v.municipio_id=v_municipio_id),
        'drivers', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',d.id,'label',d.nome) ORDER BY d.nome),'[]'::jsonb) FROM public.fleet_drivers d WHERE d.municipio_id=v_municipio_id AND d.ativo=true),
        'stations', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',s.id,'label',COALESCE(s.nome_fantasia_snapshot,s.razao_social_snapshot)) ORDER BY COALESCE(s.nome_fantasia_snapshot,s.razao_social_snapshot)),'[]'::jsonb) FROM public.fleet_fuel_stations s WHERE s.municipio_id=v_municipio_id),
        'fuel_types', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id',ft.id,'label',ft.nome) ORDER BY ft.nome),'[]'::jsonb) FROM public.fleet_fuel_types ft WHERE ft.municipio_id=v_municipio_id)
      ) AS value
    )
    SELECT jsonb_build_object(
      'period',jsonb_build_object('start_month',p_start_month,'end_month_exclusive',p_end_month_exclusive,'timezone',v_timezone),
      'updated_at',statement_timestamp(),
      'summary',jsonb_build_object(
        'fueling_count',s.fueling_count,'liters',s.liters,'registered_amount',s.registered_amount,
        'confirmed_amount',s.confirmed_amount,'confirmed_count',s.confirmed_count,
        'pending_confirmation_count',s.pending_confirmation_count,'pending_document_count',s.pending_document_count,
        'fueling_alert_count',s.fueling_alert_count,'distinct_vehicles',s.distinct_vehicles,
        'distinct_stations',s.distinct_stations,'average_per_fueling',s.average_per_fueling,
        'weighted_price_per_liter',s.weighted_price_per_liter,
        'active_vehicle_count',(SELECT COUNT(*)::bigint FROM public.fleet_vehicles v WHERE v.municipio_id=v_municipio_id AND v.operational_status::text='ATIVO'),
        'year_to_date_amount',ys.amount,'year_to_date_count',ys.count,
        'previous_period_amount',ps.amount,'previous_period_count',ps.count,
        'period_variation_percent',CASE WHEN ps.amount=0 THEN NULL ELSE ((s.registered_amount-ps.amount)/ps.amount)*100 END,
        'period_variation_base_missing',ps.amount=0,
        'open_inconsistency_count',(SELECT COUNT(*)::bigint FROM scoped_inconsistencies),
        'open_closure_count',(SELECT COUNT(*)::bigint FROM public.fleet_monthly_closures c WHERE c.municipio_id=v_municipio_id AND make_date(c.reference_year::integer,c.reference_month::integer,1)>=p_start_month AND make_date(c.reference_year::integer,c.reference_month::integer,1)<p_end_month_exclusive AND c.status::text NOT IN ('FECHADO','ENCERRADO') AND (p_station_id IS NULL OR EXISTS (SELECT 1 FROM public.fleet_monthly_closure_station_checks ch WHERE ch.closure_id=c.id AND ch.station_id=p_station_id))),
        'cnh_expired_or_due_count',(SELECT COUNT(*)::bigint FROM public.fleet_drivers d WHERE d.municipio_id=v_municipio_id AND d.ativo=true AND d.cnh_valid_until IS NOT NULL AND d.cnh_valid_until<=CURRENT_DATE+60)
      ),
      'monthly',mj.value,
      'by_responsible_unit',uj.value,
      'by_beneficiary_unit',bj.value,
      'by_vehicle',vj.value,
      'by_driver',dj.value,
      'by_station',sj.value,
      'by_fuel_type',fj.value,
      'recent',rj.value,
      'alerts',aj.value,
      'financial_alerts',faj.value,
      'closures',cj.value,
      'cnh_alerts',cnhj.value,
      'vehicle_status',vsj.value,
      'approved_movements',mvj.value,
      'filter_options',fo.value
    )
    FROM summary s CROSS JOIN prev_summary ps CROSS JOIN ytd_summary ys
      CROSS JOIN month_json mj CROSS JOIN unit_json uj CROSS JOIN beneficiary_json bj
      CROSS JOIN vehicle_json vj CROSS JOIN driver_json dj CROSS JOIN station_json sj
      CROSS JOIN fuel_json fj CROSS JOIN recent_json rj CROSS JOIN alert_json aj
      CROSS JOIN financial_alert_json faj CROSS JOIN closure_json cj CROSS JOIN cnh_alert_json cnhj
      CROSS JOIN vehicle_status_json vsj CROSS JOIN movement_json mvj CROSS JOIN filter_options fo
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.fleet_dashboard_detail(
  p_start_month date,
  p_end_month_exclusive date,
  p_dimension text DEFAULT 'all',
  p_dimension_id uuid DEFAULT NULL,
  p_responsible_unit_id uuid DEFAULT NULL,
  p_beneficiary_unit_id uuid DEFAULT NULL,
  p_vehicle_id uuid DEFAULT NULL,
  p_driver_id uuid DEFAULT NULL,
  p_station_id uuid DEFAULT NULL,
  p_fuel_type_id uuid DEFAULT NULL,
  p_fueling_status text DEFAULT NULL,
  p_document_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_municipio_id uuid;
  v_timezone constant text := 'America/Sao_Paulo';
  v_start timestamptz;
  v_end timestamptz;
  v_limit integer;
  v_offset integer;
BEGIN
  IF auth.uid() IS NULL OR public.fleet_current_usuario_id() IS NULL OR NOT public.fleet_is_mayor_or_manager() THEN
    RAISE EXCEPTION 'Perfil sem permissão para consultar detalhes do painel de Frotas.' USING ERRCODE = '42501';
  END IF;
  v_municipio_id := public.fleet_current_municipio_id();
  IF v_municipio_id IS NULL THEN RAISE EXCEPTION 'Município não identificado.' USING ERRCODE = '42501'; END IF;
  IF p_start_month IS NULL OR p_end_month_exclusive IS NULL OR p_start_month >= p_end_month_exclusive
     OR date_trunc('month',p_start_month::timestamp)::date<>p_start_month
     OR date_trunc('month',p_end_month_exclusive::timestamp)::date<>p_end_month_exclusive THEN
    RAISE EXCEPTION 'Informe um intervalo mensal válido.' USING ERRCODE = '22023';
  END IF;
  IF p_dimension NOT IN ('all','responsible_unit','beneficiary_unit','vehicle','driver','station','fuel_type') THEN
    RAISE EXCEPTION 'Dimensão de detalhamento inválida.' USING ERRCODE = '22023';
  END IF;
  IF p_fueling_status IS NOT NULL AND p_fueling_status NOT IN (
    'RASCUNHO','ENVIADO_PELO_POSTO','PENDENTE_DE_COMPROVANTE','PENDENTE_DE_CONFERENCIA',
    'EM_ANALISE','COM_INCONSISTENCIA','SOLICITADA_CORRECAO','CORRIGIDO','CONFERIDO','INCLUIDO_NO_FECHAMENTO','CANCELADO'
  ) THEN RAISE EXCEPTION 'Situação de abastecimento inválida.' USING ERRCODE = '22023'; END IF;
  IF p_document_status IS NOT NULL AND p_document_status NOT IN ('SEM_COMPROVANTE','PENDENTE','ENVIADO','EM_ANALISE','ACEITO','REJEITADO','SUBSTITUIDO') THEN
    RAISE EXCEPTION 'Situação de comprovante inválida.' USING ERRCODE = '22023';
  END IF;

  v_start := p_start_month::timestamp AT TIME ZONE v_timezone;
  v_end := p_end_month_exclusive::timestamp AT TIME ZONE v_timezone;
  v_limit := GREATEST(1,LEAST(COALESCE(p_limit,50),100));
  v_offset := GREATEST(COALESCE(p_offset,0),0);

  RETURN (
    WITH matched AS MATERIALIZED (
      SELECT f.id,f.status::text AS status,f.performed_at,f.submitted_at,f.vehicle_id,v.placa,
             concat_ws(' ',v.marca,v.modelo) AS vehicle_description,f.driver_id,d.nome AS driver_name,
             f.station_id,COALESCE(s.nome_fantasia_snapshot,s.razao_social_snapshot) AS station_name,
             f.fuel_type_id,ft.nome AS fuel_type_name,f.responsible_unit_id,ru.nome AS responsible_unit_name,
             f.beneficiary_unit_id,bu.nome AS beneficiary_unit_name,f.liters,
             COALESCE(f.total_amount,f.liters*f.unit_price,0)::numeric AS amount,f.unit_price,f.odometer_km,
             doc.document_status
      FROM public.fleet_fuelings f
      LEFT JOIN public.fleet_vehicles v ON v.id=f.vehicle_id AND v.municipio_id=v_municipio_id
      LEFT JOIN public.fleet_drivers d ON d.id=f.driver_id AND d.municipio_id=v_municipio_id
      LEFT JOIN public.fleet_fuel_stations s ON s.id=f.station_id AND s.municipio_id=v_municipio_id
      LEFT JOIN public.fleet_fuel_types ft ON ft.id=f.fuel_type_id AND ft.municipio_id=v_municipio_id
      LEFT JOIN public.unidades_organizacionais ru ON ru.id=f.responsible_unit_id AND ru.municipio_id=v_municipio_id
      LEFT JOIN public.unidades_organizacionais bu ON bu.id=f.beneficiary_unit_id AND bu.municipio_id=v_municipio_id
      LEFT JOIN LATERAL (
        SELECT fd.document_status::text AS document_status FROM public.fleet_fueling_documents fd
        WHERE fd.municipio_id=v_municipio_id AND fd.fueling_id=f.id AND fd.is_current=true
        ORDER BY fd.uploaded_at DESC,fd.id DESC LIMIT 1
      ) doc ON true
      WHERE f.municipio_id=v_municipio_id AND f.performed_at>=v_start AND f.performed_at<v_end
        AND f.status::text NOT IN ('CANCELADO','RASCUNHO') AND f.canceled_at IS NULL
        AND (p_responsible_unit_id IS NULL OR f.responsible_unit_id=p_responsible_unit_id)
        AND (p_beneficiary_unit_id IS NULL OR f.beneficiary_unit_id=p_beneficiary_unit_id)
        AND (p_vehicle_id IS NULL OR f.vehicle_id=p_vehicle_id)
        AND (p_driver_id IS NULL OR f.driver_id=p_driver_id)
        AND (p_station_id IS NULL OR f.station_id=p_station_id)
        AND (p_fuel_type_id IS NULL OR f.fuel_type_id=p_fuel_type_id)
        AND (p_fueling_status IS NULL OR f.status::text=p_fueling_status)
        AND (p_document_status IS NULL OR (p_document_status='SEM_COMPROVANTE' AND doc.document_status IS NULL)
             OR (p_document_status<>'SEM_COMPROVANTE' AND doc.document_status=p_document_status))
        AND (p_dimension='all'
             OR (p_dimension='responsible_unit' AND f.responsible_unit_id=p_dimension_id)
             OR (p_dimension='beneficiary_unit' AND f.beneficiary_unit_id=p_dimension_id)
             OR (p_dimension='vehicle' AND f.vehicle_id=p_dimension_id)
             OR (p_dimension='driver' AND f.driver_id=p_dimension_id)
             OR (p_dimension='station' AND f.station_id=p_dimension_id)
             OR (p_dimension='fuel_type' AND f.fuel_type_id=p_dimension_id))
    ), page AS (
      SELECT * FROM matched ORDER BY performed_at DESC,id DESC LIMIT v_limit OFFSET v_offset
    )
    SELECT jsonb_build_object(
      'total_count',(SELECT COUNT(*)::bigint FROM matched),
      'offset',v_offset,'limit',v_limit,
      'rows',COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'id',p.id,'status',p.status,'performed_at',p.performed_at,'submitted_at',p.submitted_at,
        'vehicle_id',p.vehicle_id,'plate',p.placa,'vehicle_description',p.vehicle_description,
        'driver_id',p.driver_id,'driver_name',p.driver_name,'station_id',p.station_id,'station_name',p.station_name,
        'fuel_type_id',p.fuel_type_id,'fuel_type_name',p.fuel_type_name,
        'responsible_unit_id',p.responsible_unit_id,'responsible_unit_name',p.responsible_unit_name,
        'beneficiary_unit_id',p.beneficiary_unit_id,'beneficiary_unit_name',p.beneficiary_unit_name,
        'liters',p.liters,'amount',p.amount,'unit_price',p.unit_price,'odometer_km',p.odometer_km,
        'document_status',p.document_status
      ) ORDER BY p.performed_at DESC,p.id DESC) FROM page p),'[]'::jsonb)
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_dashboard_overview(date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_overview(date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_dashboard_detail(date,date,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_dashboard_detail(date,date,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer,integer) TO authenticated;
