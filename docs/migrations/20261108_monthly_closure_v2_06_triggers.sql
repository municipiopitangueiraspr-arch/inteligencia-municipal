-- Monthly Closure v2 activation: 06_triggers
BEGIN;

DROP TRIGGER IF EXISTS fleet_monthly_closure_guard_before_close ON public.fleet_monthly_closures;

DROP TRIGGER IF EXISTS fleet_monthly_closure_ready_guard ON public.fleet_monthly_closures;

DROP TRIGGER IF EXISTS fleet_monthly_closure_status_guard ON public.fleet_monthly_closures;

DROP TRIGGER IF EXISTS fleet_monthly_closure_01_status_guard ON public.fleet_monthly_closures;

DROP TRIGGER IF EXISTS fleet_monthly_closure_02_ready_guard ON public.fleet_monthly_closures;

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

COMMIT;
