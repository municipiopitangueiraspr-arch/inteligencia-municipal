BEGIN;

-- O fluxo aprovado só classifica como não residencial Comércio ou Área da Prefeitura.
-- Não converte classificações históricas silenciosamente: se houver dados antigos ativos,
-- interrompe a migration para revisão explícita antes de trocar o domínio.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.census_lot_indicator_exclusions
    WHERE reason NOT IN ('COMMERCE', 'MUNICIPAL_AREA')
  ) THEN
    RAISE EXCEPTION 'Há exclusões ativas com motivo legado. Revise os lotes antes de restringir o catálogo a Comércio e Área da Prefeitura.';
  END IF;
END;
$$;

ALTER TABLE public.census_lot_indicator_exclusions
  DROP CONSTRAINT IF EXISTS census_lot_indicator_exclusions_reason_check;
ALTER TABLE public.census_lot_indicator_exclusions
  ADD CONSTRAINT census_lot_indicator_exclusions_reason_check
  CHECK (reason IN ('COMMERCE', 'MUNICIPAL_AREA'));

CREATE OR REPLACE FUNCTION public.census_set_lot_indicator_exclusion(
  p_lot_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, auth
AS $$
DECLARE
  v_current_reason text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.census_user_can_access_lot(p_lot_id) THEN
    RAISE EXCEPTION 'Acesso não autorizado ao lote.' USING ERRCODE = '42501';
  END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('COMMERCE', 'MUNICIPAL_AREA') THEN
    RAISE EXCEPTION 'Selecione Comércio ou Área da Prefeitura para excluir o lote dos indicadores.' USING ERRCODE = '23514';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_lot_id::text, 0));
  SELECT exclusion.reason INTO v_current_reason
  FROM public.census_map_lots lot
  JOIN public.census_map_imports map_import
    ON map_import.id = lot.import_id
   AND map_import.is_current IS TRUE
   AND map_import.status = 'PUBLISHED'
   AND map_import.division_saved_at IS NOT NULL
  LEFT JOIN public.census_lot_indicator_exclusions exclusion ON exclusion.lot_id = lot.id
  WHERE lot.id = p_lot_id AND lot.is_valid IS TRUE
  FOR UPDATE OF lot;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'O lote não pertence ao mapa operacional atual.' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.census_households h
    WHERE h.lot_id = p_lot_id AND h.active IS TRUE
  ) THEN
    RAISE EXCEPTION 'Este lote possui domicílio residencial. Não pode ser excluído dos indicadores como comércio ou área da Prefeitura.' USING ERRCODE = '23514';
  END IF;

  IF v_current_reason IS DISTINCT FROM p_reason THEN
    INSERT INTO public.census_lot_indicator_exclusions (lot_id, reason, excluded_by, excluded_at)
    VALUES (p_lot_id, p_reason, auth.uid(), now())
    ON CONFLICT (lot_id) DO UPDATE
      SET reason = EXCLUDED.reason, excluded_by = EXCLUDED.excluded_by, excluded_at = EXCLUDED.excluded_at;
    INSERT INTO public.census_lot_indicator_exclusion_history (lot_id, action, reason, changed_by)
    VALUES (p_lot_id, CASE WHEN v_current_reason IS NULL THEN 'EXCLUDED' ELSE 'REASON_CHANGED' END, p_reason, auth.uid());
  END IF;
END;
$$;

COMMIT;
