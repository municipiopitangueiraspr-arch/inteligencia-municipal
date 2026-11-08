-- Bloqueia fechamentos mensais que contenham abastecimentos ativos sem conferência
-- ou sem comprovante atual aceito. A função faz as alterações em uma transação.

CREATE INDEX IF NOT EXISTS fleet_documents_current_by_fueling_idx
  ON public.fleet_fueling_documents (municipio_id, fueling_id)
  WHERE is_current = true;

CREATE OR REPLACE FUNCTION public.fleet_guard_monthly_closure_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_blocked integer;
BEGIN
  IF NEW.status IS DISTINCT FROM 'FECHADO'::public.fleet_closure_status THEN
    RETURN NEW;
  END IF;

  IF NEW.municipio_id IS DISTINCT FROM public.fleet_current_municipio_id()
     OR NOT public.fleet_is_manager() THEN
    RAISE EXCEPTION 'Somente o Gestor de Frotas do município pode fechar a competência.'
      USING ERRCODE = '42501';
  END IF;

  v_period_start := make_timestamptz(
    NEW.reference_year::integer, NEW.reference_month::integer, 1, 0, 0, 0, 'UTC'
  );
  v_period_end := v_period_start + interval '1 month';

  PERFORM 1
  FROM public.fleet_fuelings f
  WHERE f.municipio_id = NEW.municipio_id
    AND f.performed_at >= v_period_start
    AND f.performed_at < v_period_end
    AND f.status <> 'CANCELADO'::public.fleet_fueling_status
  ORDER BY f.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocked
  FROM public.fleet_fuelings f
  WHERE f.municipio_id = NEW.municipio_id
    AND f.performed_at >= v_period_start
    AND f.performed_at < v_period_end
    AND f.status <> 'CANCELADO'::public.fleet_fueling_status
    AND (
      f.status <> 'CONFERIDO'::public.fleet_fueling_status
      OR NOT EXISTS (
        SELECT 1
        FROM public.fleet_fueling_documents d
        WHERE d.municipio_id = f.municipio_id
          AND d.fueling_id = f.id
          AND d.is_current = true
          AND d.document_status = 'ACEITO'::public.fleet_document_status
          AND NULLIF(btrim(d.storage_path), '') IS NOT NULL
      )
    );

  IF v_blocked > 0 THEN
    RAISE EXCEPTION 'Fechamento bloqueado: % abastecimento(s) ativo(s) ainda precisam estar conferidos e com comprovante atual aceito.', v_blocked
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS fleet_monthly_closure_guard_before_close
  ON public.fleet_monthly_closures;
CREATE TRIGGER fleet_monthly_closure_guard_before_close
  BEFORE UPDATE OF status ON public.fleet_monthly_closures
  FOR EACH ROW
  WHEN (NEW.status = 'FECHADO'::public.fleet_closure_status)
  EXECUTE FUNCTION public.fleet_guard_monthly_closure_ready();

CREATE OR REPLACE FUNCTION public.fleet_close_month(p_closure_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_municipio_id uuid;
  v_usuario_id integer;
  v_closure public.fleet_monthly_closures%ROWTYPE;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_blocked integer;
  v_included integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  v_municipio_id := public.fleet_current_municipio_id();
  v_usuario_id := public.fleet_current_usuario_id();
  IF v_municipio_id IS NULL OR v_usuario_id IS NULL OR NOT public.fleet_is_manager() THEN
    RAISE EXCEPTION 'Somente o Gestor de Frotas autenticado pode fechar a competência.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_closure
  FROM public.fleet_monthly_closures
  WHERE id = p_closure_id
    AND municipio_id = v_municipio_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'O fechamento não foi encontrado para o município autenticado.'
      USING ERRCODE = 'P0002';
  END IF;
  IF v_closure.status = 'FECHADO'::public.fleet_closure_status THEN
    RAISE EXCEPTION 'Esta competência já está fechada.'
      USING ERRCODE = '23514';
  END IF;

  v_period_start := make_timestamptz(
    v_closure.reference_year::integer, v_closure.reference_month::integer, 1, 0, 0, 0, 'UTC'
  );
  v_period_end := v_period_start + interval '1 month';

  PERFORM 1
  FROM public.fleet_fuelings f
  WHERE f.municipio_id = v_municipio_id
    AND f.performed_at >= v_period_start
    AND f.performed_at < v_period_end
    AND f.status <> 'CANCELADO'::public.fleet_fueling_status
  ORDER BY f.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocked
  FROM public.fleet_fuelings f
  WHERE f.municipio_id = v_municipio_id
    AND f.performed_at >= v_period_start
    AND f.performed_at < v_period_end
    AND f.status <> 'CANCELADO'::public.fleet_fueling_status
    AND (
      f.status <> 'CONFERIDO'::public.fleet_fueling_status
      OR NOT EXISTS (
        SELECT 1
        FROM public.fleet_fueling_documents d
        WHERE d.municipio_id = f.municipio_id
          AND d.fueling_id = f.id
          AND d.is_current = true
          AND d.document_status = 'ACEITO'::public.fleet_document_status
          AND NULLIF(btrim(d.storage_path), '') IS NOT NULL
      )
    );

  IF v_blocked > 0 THEN
    RAISE EXCEPTION 'Fechamento bloqueado: % abastecimento(s) ativo(s) ainda precisam estar conferidos e com comprovante atual aceito.', v_blocked
      USING ERRCODE = '23514';
  END IF;

  -- Primeiro fecha a competência (o trigger valida enquanto todos ainda estão CONFERIDO),
  -- depois inclui os abastecimentos. A transação reverte ambos se qualquer operação falhar.
  UPDATE public.fleet_monthly_closures
  SET status = 'FECHADO'::public.fleet_closure_status,
      checked_by = v_usuario_id,
      checked_at = v_now,
      closed_by = v_usuario_id,
      closed_at = v_now,
      updated_at = v_now
  WHERE id = v_closure.id;

  UPDATE public.fleet_fuelings
  SET status = 'INCLUIDO_NO_FECHAMENTO'::public.fleet_fueling_status,
      updated_at = v_now
  WHERE municipio_id = v_municipio_id
    AND performed_at >= v_period_start
    AND performed_at < v_period_end
    AND status = 'CONFERIDO'::public.fleet_fueling_status;
  GET DIAGNOSTICS v_included = ROW_COUNT;

  RETURN jsonb_build_object(
    'closure_id', v_closure.id,
    'records_included', v_included,
    'closed_at', v_now
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.fleet_close_month(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fleet_close_month(uuid) TO authenticated;
