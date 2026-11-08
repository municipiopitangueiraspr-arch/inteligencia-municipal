-- Monthly Closure v2 activation: 08_grants
BEGIN;

REVOKE ALL ON FUNCTION public.fleet_is_closure_manager() FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_can_read_monthly_closures() FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_is_station_member(uuid,uuid) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fleet_is_closure_manager() TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_can_read_monthly_closures() TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_is_station_member(uuid,uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.fleet_internal_refresh_monthly_closure(uuid) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fleet_recompute_monthly_closure_parent(uuid) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fleet_snapshot_monthly_closure_station(uuid,text) FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fleet_snapshot_monthly_closure_station_trigger() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fleet_log_monthly_closure_history() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fleet_guard_monthly_closure_ready() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fleet_guard_monthly_closure_transition() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fleet_guard_monthly_closure_fueling() FROM PUBLIC,anon,authenticated;

REVOKE ALL ON FUNCTION public.fleet_prepare_monthly_closure(smallint,smallint,text) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_supplier_monthly_closure(uuid,smallint,smallint) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_monthly_closure_municipal_summary(smallint,smallint) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_request_monthly_closure(uuid,uuid,boolean) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_start_monthly_closure_station_review(uuid,uuid,text) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_register_monthly_closure_document(uuid,uuid,text,text,text,text,date,text,numeric,text,text,text,bigint,text,uuid) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_review_monthly_closure_document(uuid,public.fleet_document_status,text) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_review_monthly_closure_fueling(uuid,uuid,text) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_record_monthly_closure_discrepancy(uuid,uuid,uuid,text,text,text,numeric,timestamptz) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_send_monthly_closure_message(uuid,uuid,uuid,text,text) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_resolve_monthly_closure_discrepancy(uuid,text,text) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_confirm_monthly_closure_station(uuid,uuid,text,boolean) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_refresh_monthly_closure(uuid) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_close_month(uuid) FROM PUBLIC,anon;

REVOKE ALL ON FUNCTION public.fleet_reopen_monthly_closure(uuid,text) FROM PUBLIC,anon;

GRANT EXECUTE ON FUNCTION public.fleet_prepare_monthly_closure(smallint,smallint,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_supplier_monthly_closure(uuid,smallint,smallint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_monthly_closure_municipal_summary(smallint,smallint) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_request_monthly_closure(uuid,uuid,boolean) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_start_monthly_closure_station_review(uuid,uuid,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_register_monthly_closure_document(uuid,uuid,text,text,text,text,date,text,numeric,text,text,text,bigint,text,uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_review_monthly_closure_document(uuid,public.fleet_document_status,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_review_monthly_closure_fueling(uuid,uuid,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_record_monthly_closure_discrepancy(uuid,uuid,uuid,text,text,text,numeric,timestamptz) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_send_monthly_closure_message(uuid,uuid,uuid,text,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_resolve_monthly_closure_discrepancy(uuid,text,text) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_confirm_monthly_closure_station(uuid,uuid,text,boolean) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_refresh_monthly_closure(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_close_month(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.fleet_reopen_monthly_closure(uuid,text) TO authenticated;

COMMIT;
