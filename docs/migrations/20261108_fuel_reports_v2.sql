-- Relatórios de abastecimentos e postos v2.0.
-- Reutiliza as agregações do Dashboard, sem duplicar regras de cálculo ou escopo.
CREATE OR REPLACE FUNCTION public.fleet_fuel_report(
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
  p_recent_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_access jsonb;
  v_municipio_id uuid;
  v_municipio_nome text;
  v_data jsonb;
  v_detail jsonb;
BEGIN
  IF auth.uid() IS NULL OR public.fleet_current_usuario_id() IS NULL THEN
    RAISE EXCEPTION 'Autenticação necessária para gerar relatórios de abastecimento.' USING ERRCODE = '42501';
  END IF;

  -- O helper central determina município, perfil, escopo e vínculo vigente.
  v_access := public.fleet_dashboard_access();
  v_municipio_id := (v_access->>'municipio_id')::uuid;
  IF v_municipio_id IS NULL THEN
    RAISE EXCEPTION 'Não foi possível determinar o município autorizado.' USING ERRCODE = '42501';
  END IF;

  SELECT m.nome INTO v_municipio_nome
  FROM public.municipios m
  WHERE m.id = v_municipio_id AND m.ativo IS TRUE;
  IF v_municipio_nome IS NULL THEN
    RAISE EXCEPTION 'Município autorizado não encontrado ou inativo.' USING ERRCODE = '42501';
  END IF;

  -- A função de overview valida período e filtros, aplica RLS lógica de perfil,
  -- exclui registros inelegíveis e calcula totais/dimensões no banco.
  v_data := public.fleet_dashboard_overview(
    p_start_month,
    p_end_month_exclusive,
    p_responsible_unit_id,
    p_beneficiary_unit_id,
    p_vehicle_id,
    p_driver_id,
    p_station_id,
    p_fuel_type_id,
    p_fueling_status,
    p_document_status,
    p_recent_limit
  );

  -- Mantém opções históricas consultáveis, mas não as apresenta como vigentes.
  v_data := jsonb_set(
    v_data,
    '{filter_options,fuel_types}',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ft.id,
        'label', CASE WHEN ft.ativo IS TRUE THEN ft.nome ELSE ft.nome || ' · inativo/histórico' END,
        'active', ft.ativo
      ) ORDER BY ft.nome)
      FROM jsonb_array_elements(COALESCE(v_data #> '{filter_options,fuel_types}', '[]'::jsonb)) AS fuel_option(value)
      JOIN public.fleet_fuel_types ft
        ON ft.id = (fuel_option.value->>'id')::uuid AND ft.municipio_id = v_municipio_id
    ), '[]'::jsonb),
    true
  );
  v_data := jsonb_set(
    v_data,
    '{filter_options,stations}',
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'label', concat_ws(' · ',
          COALESCE(s.nome_fantasia_snapshot, s.razao_social_snapshot, 'Posto sem identificação'),
          CASE s.status::text
            WHEN 'ATIVO' THEN 'Ativo'
            WHEN 'PENDENTE' THEN 'Pendente'
            WHEN 'SUSPENSO' THEN 'Suspenso'
            WHEN 'INATIVO' THEN 'Inativo/histórico'
            WHEN 'CREDENCIAMENTO_ENCERRADO' THEN 'Credenciamento encerrado · histórico'
            ELSE s.status::text
          END
        ),
        'status', s.status::text,
        'active', s.status::text = 'ATIVO'
      ) ORDER BY COALESCE(s.nome_fantasia_snapshot, s.razao_social_snapshot))
      FROM jsonb_array_elements(COALESCE(v_data #> '{filter_options,stations}', '[]'::jsonb)) AS station_option(value)
      JOIN public.fleet_fuel_stations s
        ON s.id = (station_option.value->>'id')::uuid AND s.municipio_id = v_municipio_id
    ), '[]'::jsonb),
    true
  );

  -- A primeira página e os agregados são calculados dentro da mesma chamada RPC.
  v_detail := public.fleet_dashboard_detail(
    p_start_month, p_end_month_exclusive, 'all', NULL,
    p_responsible_unit_id, p_beneficiary_unit_id, p_vehicle_id, p_driver_id,
    p_station_id, p_fuel_type_id, p_fueling_status, p_document_status, 50, 0
  );
  v_data := jsonb_set(v_data, '{report_detail}', v_detail, true);

  RETURN jsonb_build_object(
    'context', jsonb_build_object(
      'municipality_id', v_municipio_id,
      'municipality_name', v_municipio_nome,
      'generated_at', statement_timestamp(),
      'user_email', NULLIF(auth.jwt()->>'email', ''),
      'role', v_access->>'role',
      'scope', v_access->>'scope',
      'units', COALESCE(v_access->'units', '[]'::jsonb),
      'filters', jsonb_build_object(
        'start_month', p_start_month,
        'end_month_exclusive', p_end_month_exclusive,
        'responsible_unit_id', p_responsible_unit_id,
        'beneficiary_unit_id', p_beneficiary_unit_id,
        'vehicle_id', p_vehicle_id,
        'driver_id', p_driver_id,
        'station_id', p_station_id,
        'fuel_type_id', p_fuel_type_id,
        'fueling_status', p_fueling_status,
        'document_status', p_document_status
      )
    ),
    'data', v_data
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_fuel_report(date, date, uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fleet_fuel_report(date, date, uuid, uuid, uuid, uuid, uuid, uuid, text, text, integer) TO authenticated;
