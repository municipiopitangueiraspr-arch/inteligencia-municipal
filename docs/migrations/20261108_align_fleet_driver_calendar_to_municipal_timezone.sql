CREATE OR REPLACE FUNCTION public.fleet_search_drivers(
  p_search text,
  p_status text,
  p_cnh_status text,
  p_page integer,
  p_page_size integer
)
RETURNS TABLE(
  total_count bigint,
  id uuid,
  nome text,
  matricula text,
  cpf_masked text,
  cnh_masked text,
  cnh_category text,
  cnh_valid_until date,
  unidade_id uuid,
  unidade_nome text,
  ativo boolean,
  authorization_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
AS $$
DECLARE
  m uuid := public.fleet_current_municipio_id();
  pg integer := GREATEST(COALESCE(p_page,0),0);
  sz integer := LEAST(GREATEST(COALESCE(p_page_size,25),1),100);
  v_today date := (statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.role() <> 'authenticated' OR m IS NULL OR NOT public.fleet_is_manager() THEN
    RAISE EXCEPTION 'Acesso restrito a gestores de frota' USING ERRCODE='42501';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT d.*,
      u.nome AS unit_name,
      (
        SELECT count(*)
        FROM public.fleet_vehicle_driver_authorizations a
        WHERE a.municipio_id=d.municipio_id
          AND a.driver_id=d.id
          AND a.status='ATIVA'
          AND a.ended_at IS NULL
          AND a.valid_from<=v_today
          AND (a.valid_until IS NULL OR a.valid_until>=v_today)
      ) AS authorization_count
    FROM public.fleet_drivers d
    LEFT JOIN public.unidades_organizacionais u
      ON u.id=d.unidade_id AND u.municipio_id=d.municipio_id
    WHERE d.municipio_id=m
      AND (NULLIF(btrim(p_search),'') IS NULL OR concat_ws(' ',d.nome,d.matricula,d.cpf,d.cnh_number,d.telefone) ILIKE '%'||btrim(p_search)||'%')
      AND (p_status IS NULL OR upper(p_status) IN ('TODOS','ALL')
        OR (upper(p_status) IN ('ATIVO','ACTIVE') AND d.ativo)
        OR (upper(p_status) IN ('INATIVO','INACTIVE') AND NOT d.ativo))
      AND (p_cnh_status IS NULL OR upper(p_cnh_status) IN ('TODOS','ALL')
        OR (upper(p_cnh_status) IN ('VENCIDA','EXPIRED') AND d.cnh_valid_until<v_today)
        OR (upper(p_cnh_status) IN ('VENCE_60_DIAS','VENCE_EM_60_DIAS','EXPIRING') AND d.cnh_valid_until BETWEEN v_today AND v_today+60)
        OR (upper(p_cnh_status) IN ('SEM_VALIDADE','NO_EXPIRY') AND d.cnh_valid_until IS NULL)
        OR (upper(p_cnh_status) IN ('VALIDA','VALID') AND d.cnh_valid_until>=v_today))
  ), counted AS (
    SELECT count(*)::bigint AS n FROM filtered
  ), page AS (
    SELECT * FROM filtered ORDER BY filtered.nome,filtered.id LIMIT sz OFFSET pg*sz
  )
  SELECT counted.n,f.id,f.nome,f.matricula,
    CASE WHEN f.cpf IS NULL THEN NULL ELSE '***.***.***-'||right(f.cpf,2) END,
    CASE WHEN f.cnh_number IS NULL THEN NULL ELSE '********'||right(f.cnh_number,3) END,
    f.cnh_category,f.cnh_valid_until,f.unidade_id,f.unit_name,f.ativo,f.authorization_count
  FROM page f CROSS JOIN counted ORDER BY f.nome,f.id;
END
$$;

CREATE OR REPLACE FUNCTION public.fleet_driver_summary()
RETURNS TABLE(
  total_count bigint,
  active_count bigint,
  inactive_count bigint,
  cnh_expired_count bigint,
  cnh_expires_60_days_count bigint,
  cnh_without_validity_count bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog,public,auth,pg_temp
AS $$
DECLARE
  v_today date := (statement_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF auth.role()<>'authenticated' OR NOT public.fleet_is_manager() THEN
    RAISE EXCEPTION 'Acesso restrito a gestores de frota' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT count(*)::bigint,
    count(*) FILTER (WHERE ativo)::bigint,
    count(*) FILTER (WHERE NOT ativo)::bigint,
    count(*) FILTER (WHERE cnh_valid_until<v_today)::bigint,
    count(*) FILTER (WHERE cnh_valid_until BETWEEN v_today AND v_today+60)::bigint,
    count(*) FILTER (WHERE cnh_valid_until IS NULL)::bigint
  FROM public.fleet_drivers
  WHERE municipio_id=public.fleet_current_municipio_id();
END
$$;

REVOKE ALL ON FUNCTION public.fleet_search_drivers(text,text,text,integer,integer) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.fleet_driver_summary() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_search_drivers(text,text,text,integer,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_driver_summary() TO authenticated;
