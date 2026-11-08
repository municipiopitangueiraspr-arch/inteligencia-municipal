-- Mantém os indicadores de CNH coerentes com o filtro global de motorista.
-- Reaplica apenas a definição da RPC já implantada, sem acessar dados de usuários.
DO $migration$
DECLARE
  v_signature regprocedure := to_regprocedure('public.fleet_dashboard_overview(date,date,uuid,uuid,uuid,uuid,uuid,uuid,text,text,integer)');
  v_definition text;
  v_old text := 'd.ativo=true AND d.cnh_valid_until IS NOT NULL';
  v_new text := 'd.ativo=true AND (p_driver_id IS NULL OR d.id=p_driver_id) AND d.cnh_valid_until IS NOT NULL';
  v_old_count integer;
  v_new_count integer;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'RPC fleet_dashboard_overview não encontrada; não foi aplicada a migração de filtro de CNH.';
  END IF;
  SELECT pg_get_functiondef(v_signature::oid) INTO v_definition;
  v_old_count := (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old);
  v_new_count := (length(v_definition)-length(replace(v_definition,v_new,'')))/length(v_new);
  IF v_old_count = 2 THEN
    EXECUTE replace(v_definition,v_old,v_new);
  ELSIF v_old_count = 0 AND v_new_count = 2 THEN
    NULL; -- já aplicada
  ELSE
    RAISE EXCEPTION 'Definição inesperada da RPC: esperados 2 filtros CNH não modificados ou 2 já modificados; encontrados % e %.', v_old_count, v_new_count;
  END IF;
END
$migration$;
