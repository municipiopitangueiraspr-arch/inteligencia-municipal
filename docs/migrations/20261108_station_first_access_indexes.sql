-- Índices de suporte às novas referências de auditoria e cadastro.
CREATE INDEX IF NOT EXISTS fleet_fuel_stations_updated_by_idx
  ON public.fleet_fuel_stations (updated_by)
  WHERE updated_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_station_audit_log_actor_idx
  ON public.fleet_station_audit_log (actor_usuario_id)
  WHERE actor_usuario_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS fleet_station_documents_uploaded_by_idx
  ON public.fleet_station_documents (uploaded_by)
  WHERE uploaded_by IS NOT NULL;
