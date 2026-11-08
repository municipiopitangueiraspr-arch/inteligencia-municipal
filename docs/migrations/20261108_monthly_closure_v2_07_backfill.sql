-- Monthly Closure v2 activation: 07_backfill
BEGIN;

WITH station_scope AS (
  SELECT c.id AS closure_id,c.municipio_id,s.id AS station_id
  FROM public.fleet_monthly_closures c
  JOIN public.fleet_fuel_stations s ON s.municipio_id=c.municipio_id AND s.status='ATIVO'::public.fleet_station_status
  UNION
  SELECT c.id,c.municipio_id,f.station_id
  FROM public.fleet_monthly_closures c
  JOIN public.fleet_fuelings f ON f.municipio_id=c.municipio_id
    AND f.performed_at>=make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')
    AND f.performed_at<make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')+interval '1 month'
  UNION
  SELECT c.id,c.municipio_id,sc.station_id
  FROM public.fleet_monthly_closures c
  JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id
), rollups AS (
  SELECT ss.closure_id,ss.municipio_id,ss.station_id,
    count(f.id) FILTER (WHERE f.status<>'CANCELADO'::public.fleet_fueling_status)::integer AS fueling_count,
    COALESCE(sum(f.liters) FILTER (WHERE f.status<>'CANCELADO'::public.fleet_fueling_status),0)::numeric(14,3) AS liters_total,
    COALESCE(sum(f.total_amount) FILTER (WHERE f.status<>'CANCELADO'::public.fleet_fueling_status),0)::numeric(14,2) AS amount_total,
    count(f.id) FILTER (WHERE f.status<>'CANCELADO'::public.fleet_fueling_status AND NOT EXISTS (
      SELECT 1 FROM public.fleet_fueling_documents fd
      WHERE fd.municipio_id=f.municipio_id AND fd.fueling_id=f.id AND fd.is_current
        AND fd.document_status='ACEITO'::public.fleet_document_status AND NULLIF(btrim(fd.storage_path),'') IS NOT NULL
    ))::integer AS documents_pending
  FROM station_scope ss
  JOIN public.fleet_monthly_closures c ON c.id=ss.closure_id
  LEFT JOIN public.fleet_fuelings f ON f.municipio_id=ss.municipio_id AND f.station_id=ss.station_id
    AND f.performed_at>=make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')
    AND f.performed_at<make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')+interval '1 month'
  GROUP BY ss.closure_id,ss.municipio_id,ss.station_id
)
INSERT INTO public.fleet_monthly_closure_station_checks (
  municipio_id,closure_id,station_id,registered_fueling_count,registered_liters,registered_amount,
  invoiced_amount,divergence_amount,documents_pending_count,status,closure_status
)
SELECT r.municipio_id,r.closure_id,r.station_id,r.fueling_count,r.liters_total,r.amount_total,
  NULL,NULL,r.documents_pending,
  CASE WHEN r.fueling_count=0 AND c.status='CONFERIDO'::public.fleet_closure_status THEN 'CONFERIDO' ELSE 'PENDENTE' END,
  c.status
FROM rollups r JOIN public.fleet_monthly_closures c ON c.id=r.closure_id
ON CONFLICT (closure_id,station_id) DO UPDATE SET
  registered_fueling_count=EXCLUDED.registered_fueling_count,
  registered_liters=EXCLUDED.registered_liters,
  registered_amount=EXCLUDED.registered_amount,
  documents_pending_count=EXCLUDED.documents_pending_count;

INSERT INTO public.fleet_monthly_closure_transactions (
  municipio_id,closure_id,station_check_id,station_id,fueling_id,included_at,inclusion_type,is_included,notes
)
SELECT c.municipio_id,c.id,sc.id,f.station_id,f.id,clock_timestamp(),'MIGRACAO_V2',
       f.status<>'CANCELADO'::public.fleet_fueling_status,
       CASE WHEN f.status='CANCELADO'::public.fleet_fueling_status THEN 'Registro cancelado, preservado fora do total líquido.' ELSE 'Composição fictícia adaptada ao fluxo v2.0.' END
FROM public.fleet_monthly_closures c
JOIN public.fleet_fuelings f ON f.municipio_id=c.municipio_id
  AND f.performed_at>=make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')
  AND f.performed_at<make_timestamptz(c.reference_year::integer,c.reference_month::integer,1,0,0,0,'America/Sao_Paulo')+interval '1 month'
JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id AND sc.station_id=f.station_id
ON CONFLICT (fueling_id) DO NOTHING;

UPDATE public.fleet_monthly_closures
SET notes='Período fictício adaptado ao fluxo de fechamento mensal v2.0.',updated_at=clock_timestamp()
WHERE notes ILIKE 'TESTE_FROTAS_V2%';

INSERT INTO public.fleet_monthly_closure_history (
  municipio_id,closure_id,entity_table,entity_id,action_type,previous_status,new_status,reason,metadata
)
SELECT c.municipio_id,c.id,'fleet_monthly_closures',c.id,'ADAPTACAO_FLUXO_V2',c.status::text,c.status::text,
       'Registros fictícios convertidos para composição por posto, conciliação e auditoria v2.0.',
       jsonb_build_object('migration','20261108_monthly_closure_v2','adapted_station_checks',
         (SELECT count(*) FROM public.fleet_monthly_closure_station_checks sc WHERE sc.closure_id=c.id),
         'linked_fuelings',(SELECT count(*) FROM public.fleet_monthly_closure_transactions t WHERE t.closure_id=c.id))
FROM public.fleet_monthly_closures c
WHERE NOT EXISTS (
  SELECT 1 FROM public.fleet_monthly_closure_history h
  WHERE h.closure_id=c.id AND h.entity_table='fleet_monthly_closures' AND h.action_type='ADAPTACAO_FLUXO_V2'
);

COMMENT ON TABLE public.fleet_monthly_closure_station_checks IS
  'Fechamento individual por posto dentro do agrupador municipal da competência; totais derivados no backend.';

COMMENT ON TABLE public.fleet_monthly_closure_transactions IS
  'Composição rastreável de abastecimentos por fechamento, com unicidade global para impedir dupla inclusão.';

COMMENT ON TABLE public.fleet_monthly_closure_documents IS
  'Notas fiscais e demais documentos fiscais do fechamento; os arquivos ficam no bucket privado fleet-documents.';

COMMENT ON TABLE public.fleet_monthly_closure_history IS
  'Trilha append-only de alterações, decisões, documentos e comunicações do fechamento mensal.';

COMMENT ON TABLE public.fleet_monthly_closure_versions IS
  'Snapshots imutáveis da composição por posto em conferência, reabertura e fechamento.';

COMMIT;
