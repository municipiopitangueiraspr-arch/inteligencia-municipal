-- Monthly Closure v2 activation: 05_storage
BEGIN;

DROP POLICY IF EXISTS fleet_storage_manager_insert ON storage.objects;

CREATE POLICY fleet_storage_manager_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id='fleet-documents' AND public.fleet_is_closure_manager()
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text);

DROP POLICY IF EXISTS fleet_storage_manager_select ON storage.objects;

CREATE POLICY fleet_storage_manager_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='fleet-documents' AND public.fleet_is_closure_manager()
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text);

DROP POLICY IF EXISTS fleet_storage_monthly_closure_station_delete_orphan ON storage.objects;

CREATE POLICY fleet_storage_monthly_closure_station_delete_orphan ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id='fleet-documents'
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
    AND split_part(name,'/',2)='monthly-closures'
    AND EXISTS (
      SELECT 1 FROM public.fleet_monthly_closures c
      JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id
      JOIN public.fleet_station_members sm ON sm.station_id=sc.station_id AND sm.municipio_id=sc.municipio_id
      WHERE c.id::text=split_part(objects.name,'/',3)
        AND sc.station_id::text=split_part(objects.name,'/',4)
        AND c.municipio_id=public.fleet_current_municipio_id()
        AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo=true
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.fleet_monthly_closure_documents d
      WHERE d.municipio_id=public.fleet_current_municipio_id() AND d.storage_path=objects.name
    )
  );

DROP POLICY IF EXISTS fleet_storage_monthly_closure_station_insert ON storage.objects;

CREATE POLICY fleet_storage_monthly_closure_station_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id='fleet-documents'
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
    AND split_part(name,'/',2)='monthly-closures'
    AND EXISTS (
      SELECT 1
      FROM public.fleet_monthly_closures c
      JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id
      JOIN public.fleet_station_members sm ON sm.station_id=sc.station_id AND sm.municipio_id=sc.municipio_id
      WHERE c.id::text=split_part(objects.name,'/',3)
        AND sc.station_id::text=split_part(objects.name,'/',4)
        AND c.municipio_id=public.fleet_current_municipio_id()
        AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo=true
    )
  );

DROP POLICY IF EXISTS fleet_storage_monthly_closure_station_select ON storage.objects;

CREATE POLICY fleet_storage_monthly_closure_station_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id='fleet-documents'
    AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
    AND split_part(name,'/',2)='monthly-closures'
    AND (
      public.fleet_is_closure_manager() OR EXISTS (
        SELECT 1
        FROM public.fleet_monthly_closures c
        JOIN public.fleet_monthly_closure_station_checks sc ON sc.closure_id=c.id
        JOIN public.fleet_station_members sm ON sm.station_id=sc.station_id AND sm.municipio_id=sc.municipio_id
        WHERE c.id::text=split_part(objects.name,'/',3)
          AND sc.station_id::text=split_part(objects.name,'/',4)
          AND c.municipio_id=public.fleet_current_municipio_id()
          AND sm.usuario_id=public.fleet_current_usuario_id() AND sm.ativo=true
      )
    )
  );

COMMIT;
