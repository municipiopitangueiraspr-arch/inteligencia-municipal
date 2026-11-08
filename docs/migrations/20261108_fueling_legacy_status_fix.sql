-- Correção idempotente pós-migração: registros legados sem motorista nunca podem
-- permanecer como operacionalmente registrados ou aptos à conferência.
WITH targets AS (
  SELECT f.id
  FROM public.fleet_fuelings f
  WHERE f.driver_id IS NULL
    AND f.status NOT IN ('CANCELADO','INCLUIDO_NO_FECHAMENTO')
    AND (f.status IS DISTINCT FROM 'COM_INCONSISTENCIA'
      OR f.operational_status IS DISTINCT FROM 'SINALIZADO'
      OR f.review_status IS DISTINCT FROM 'COM_PENDENCIA')
  ORDER BY f.id
  LIMIT 1000
)
UPDATE public.fleet_fuelings f
SET status='COM_INCONSISTENCIA',
    operational_status='SINALIZADO',
    review_status='COM_PENDENCIA',
    review_pending_reason=COALESCE(NULLIF(btrim(f.review_pending_reason),''),'Registro legado sem motorista associado; regularização necessária antes da conferência.'),
    inconsistency_code=COALESCE(f.inconsistency_code,'MOTORISTA_AUSENTE'),
    inconsistency_notes=concat_ws(' ',f.inconsistency_notes,'Registro fictício legado sem motorista; status bloqueado para impedir conferência indevida.'),
    updated_at=clock_timestamp()
FROM targets t
WHERE f.id=t.id;

-- Abastecimentos sem comprovante aceito aguardam complementação, ainda que o
-- status legado original fosse CONFERIDO antes das novas regras de evidência.
WITH targets AS (
  SELECT f.id
  FROM public.fleet_fuelings f
  WHERE f.status='PENDENTE_DE_COMPROVANTE'
    AND (f.operational_status IS DISTINCT FROM 'AGUARDANDO_COMPLEMENTACAO'
      OR f.review_status IS DISTINCT FROM 'COM_PENDENCIA')
  ORDER BY f.id
  LIMIT 1000
)
UPDATE public.fleet_fuelings f
SET operational_status='AGUARDANDO_COMPLEMENTACAO',
    review_status='COM_PENDENCIA',
    review_pending_reason=COALESCE(NULLIF(btrim(f.review_pending_reason),''),'Registro legado sem comprovante atual aceito; aguarda complementação e conferência municipal.'),
    updated_at=clock_timestamp()
FROM targets t
WHERE f.id=t.id;
