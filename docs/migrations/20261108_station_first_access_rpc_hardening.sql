-- Hardening complementar dos RPCs já existentes usados pelo Portal do Posto.
-- O envio de e-mail usa service_role; as telas de gestão exigem sessão autenticada.
REVOKE ALL ON FUNCTION public.fleet_update_email_notification(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fleet_update_email_notification(uuid,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.fleet_station_member_directory(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_station_member_directory(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fleet_station_user_candidates() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_station_user_candidates() TO authenticated;

-- A solicitação de primeiro acesso chama este helper dentro de RPC SECURITY DEFINER;
-- não é necessário expor o identificador municipal à sessão anônima.
REVOKE ALL ON FUNCTION public.fleet_public_municipio_id() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.fleet_public_municipio_id() TO authenticated;

-- Função de trigger, nunca endpoint RPC.
REVOKE ALL ON FUNCTION public.fleet_queue_access_received_email() FROM PUBLIC,anon,authenticated;
