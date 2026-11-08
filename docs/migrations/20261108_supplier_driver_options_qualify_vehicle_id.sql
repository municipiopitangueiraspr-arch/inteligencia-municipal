BEGIN;

CREATE OR REPLACE FUNCTION public.fleet_supplier_driver_options(
  p_station_id uuid,
  p_vehicle_id uuid,
  p_performed_at timestamptz
)
RETURNS TABLE (
  id uuid,
  nome text,
  matricula text,
  cnh_valid_until date,
  cnh_category text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, auth, pg_temp
AS $$
DECLARE
  event_date date;
  target_vehicle public.fleet_vehicles%ROWTYPE;
  required_category text;
BEGIN
  IF auth.role() <> 'authenticated'
     OR p_station_id IS NULL
     OR p_vehicle_id IS NULL
     OR p_performed_at IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.fleet_station_members AS sm
       JOIN public.fleet_fuel_stations AS s
         ON s.id = sm.station_id
        AND s.municipio_id = sm.municipio_id
       WHERE sm.station_id = p_station_id
         AND sm.usuario_id = public.fleet_current_usuario_id()
         AND sm.ativo
         AND s.municipio_id = public.fleet_current_municipio_id()
         AND s.status::text = 'ATIVO'
     ) THEN
    RAISE EXCEPTION 'Usuário, posto ou parâmetros inválidos'
      USING ERRCODE = '42501';
  END IF;

  event_date := (p_performed_at AT TIME ZONE 'America/Sao_Paulo')::date;

  SELECT fv.*
  INTO target_vehicle
  FROM public.fleet_vehicles AS fv
  WHERE fv.id = p_vehicle_id
    AND fv.municipio_id = public.fleet_current_municipio_id();

  IF NOT FOUND OR target_vehicle.operational_status::text NOT IN ('ATIVO', 'CEDIDO') THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fleet_vehicle_restrictions AS r
    WHERE r.municipio_id = target_vehicle.municipio_id
      AND r.vehicle_id = target_vehicle.id
      AND r.active
      AND r.released_at IS NULL
      AND r.starts_at <= p_performed_at
      AND (r.ends_at IS NULL OR r.ends_at >= p_performed_at)
  ) THEN
    RETURN;
  END IF;

  SELECT c.required_cnh_category
  INTO required_category
  FROM public.fleet_vehicle_categories AS c
  WHERE c.id = target_vehicle.category_id
    AND c.municipio_id = target_vehicle.municipio_id;

  RETURN QUERY
  SELECT DISTINCT d.id, d.nome, d.matricula, d.cnh_valid_until, d.cnh_category
  FROM public.fleet_vehicle_driver_authorizations AS a
  JOIN public.fleet_drivers AS d
    ON d.id = a.driver_id
   AND d.municipio_id = a.municipio_id
  WHERE a.municipio_id = target_vehicle.municipio_id
    AND a.vehicle_id = target_vehicle.id
    AND a.status = 'ATIVA'
    AND a.ended_at IS NULL
    AND a.valid_from <= event_date
    AND (a.valid_until IS NULL OR a.valid_until >= event_date)
    AND d.ativo
    AND d.cnh_number IS NOT NULL
    AND d.cnh_valid_until >= event_date
    AND public.fleet_cnh_category_compatible(d.cnh_category, required_category)
  ORDER BY d.nome;
END;
$$;

REVOKE ALL ON FUNCTION public.fleet_supplier_driver_options(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_supplier_driver_options(uuid, uuid, timestamptz)
  TO authenticated;

COMMIT;
