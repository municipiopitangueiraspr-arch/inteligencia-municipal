-- Monthly Closure v2 activation: 04_rls
BEGIN;

ALTER TABLE public.fleet_monthly_closures ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fleet_monthly_closure_station_checks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fleet_monthly_closure_transactions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fleet_monthly_closure_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fleet_monthly_closure_discrepancies ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fleet_monthly_closure_messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fleet_monthly_closure_reviews ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fleet_monthly_closure_history ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.fleet_monthly_closure_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS fleet_closures_manager ON public.fleet_monthly_closures;

DROP POLICY IF EXISTS fleet_monthly_closures_read_v2 ON public.fleet_monthly_closures;

CREATE POLICY fleet_monthly_closures_read_v2 ON public.fleet_monthly_closures
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_can_read_monthly_closures() OR EXISTS (
      SELECT 1 FROM public.fleet_monthly_closure_station_checks sc
      WHERE sc.closure_id=fleet_monthly_closures.id
        AND public.fleet_is_station_member(sc.station_id,sc.municipio_id)
    )
  ));

DROP POLICY IF EXISTS fleet_closure_checks_manager ON public.fleet_monthly_closure_station_checks;

DROP POLICY IF EXISTS fleet_monthly_closure_station_checks_read_v2 ON public.fleet_monthly_closure_station_checks;

CREATE POLICY fleet_monthly_closure_station_checks_read_v2 ON public.fleet_monthly_closure_station_checks
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_can_read_monthly_closures() OR public.fleet_is_station_member(station_id,municipio_id)
  ));

DROP POLICY IF EXISTS fleet_monthly_closure_transactions_read_v2 ON public.fleet_monthly_closure_transactions;

CREATE POLICY fleet_monthly_closure_transactions_read_v2 ON public.fleet_monthly_closure_transactions
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_can_read_monthly_closures() OR public.fleet_is_station_member(station_id,municipio_id)
  ));

DROP POLICY IF EXISTS fleet_monthly_closure_documents_read_v2 ON public.fleet_monthly_closure_documents;

CREATE POLICY fleet_monthly_closure_documents_read_v2 ON public.fleet_monthly_closure_documents
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR public.fleet_is_station_member(station_id,municipio_id)
  ));

DROP POLICY IF EXISTS fleet_monthly_closure_discrepancies_read_v2 ON public.fleet_monthly_closure_discrepancies;

CREATE POLICY fleet_monthly_closure_discrepancies_read_v2 ON public.fleet_monthly_closure_discrepancies
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR public.fleet_is_station_member(station_id,municipio_id)
  ));

DROP POLICY IF EXISTS fleet_monthly_closure_messages_read_v2 ON public.fleet_monthly_closure_messages;

CREATE POLICY fleet_monthly_closure_messages_read_v2 ON public.fleet_monthly_closure_messages
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR public.fleet_is_station_member(station_id,municipio_id)
  ));

DROP POLICY IF EXISTS fleet_monthly_closure_reviews_read_v2 ON public.fleet_monthly_closure_reviews;

CREATE POLICY fleet_monthly_closure_reviews_read_v2 ON public.fleet_monthly_closure_reviews
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR public.fleet_is_station_member(station_id,municipio_id)
  ));

DROP POLICY IF EXISTS fleet_monthly_closure_history_read_v2 ON public.fleet_monthly_closure_history;

CREATE POLICY fleet_monthly_closure_history_read_v2 ON public.fleet_monthly_closure_history
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR (station_id IS NOT NULL AND public.fleet_is_station_member(station_id,municipio_id))
  ));

DROP POLICY IF EXISTS fleet_monthly_closure_versions_read_v2 ON public.fleet_monthly_closure_versions;

CREATE POLICY fleet_monthly_closure_versions_read_v2 ON public.fleet_monthly_closure_versions
  FOR SELECT TO authenticated
  USING (municipio_id=public.fleet_current_municipio_id() AND (
    public.fleet_is_closure_manager() OR (station_id IS NOT NULL AND public.fleet_is_station_member(station_id,municipio_id))
  ));

REVOKE ALL ON TABLE public.fleet_monthly_closures,public.fleet_monthly_closure_station_checks,
  public.fleet_monthly_closure_transactions,public.fleet_monthly_closure_documents,
  public.fleet_monthly_closure_discrepancies,public.fleet_monthly_closure_messages,
  public.fleet_monthly_closure_reviews,public.fleet_monthly_closure_history,
  public.fleet_monthly_closure_versions FROM anon,authenticated;

GRANT SELECT ON TABLE public.fleet_monthly_closures,public.fleet_monthly_closure_station_checks,
  public.fleet_monthly_closure_transactions,public.fleet_monthly_closure_documents,
  public.fleet_monthly_closure_discrepancies,public.fleet_monthly_closure_messages,
  public.fleet_monthly_closure_reviews,public.fleet_monthly_closure_history,
  public.fleet_monthly_closure_versions TO authenticated;

COMMIT;
