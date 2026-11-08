BEGIN;

-- O bucket é compartilhado entre municípios; gestor e posto só acessam objetos
-- cujo primeiro segmento do path corresponde ao município da sessão.
DROP POLICY IF EXISTS fleet_storage_manager_insert ON storage.objects;
CREATE POLICY fleet_storage_manager_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='fleet-documents'
  AND public.fleet_is_manager()
  AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
);

DROP POLICY IF EXISTS fleet_storage_manager_select ON storage.objects;
CREATE POLICY fleet_storage_manager_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='fleet-documents'
  AND public.fleet_is_manager()
  AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
);

DROP POLICY IF EXISTS fleet_storage_station_insert ON storage.objects;
CREATE POLICY fleet_storage_station_insert ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id='fleet-documents'
  AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
  AND split_part(name,'/',2)='fuelings'
  AND EXISTS (
    SELECT 1
    FROM public.fleet_fuelings f
    JOIN public.fleet_station_members sm
      ON sm.station_id=f.station_id AND sm.municipio_id=f.municipio_id
    WHERE f.id::text=split_part(name,'/',3)
      AND f.municipio_id=public.fleet_current_municipio_id()
      AND sm.usuario_id=public.fleet_current_usuario_id()
      AND sm.ativo
  )
);

DROP POLICY IF EXISTS fleet_storage_station_select ON storage.objects;
CREATE POLICY fleet_storage_station_select ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id='fleet-documents'
  AND split_part(name,'/',1)=public.fleet_current_municipio_id()::text
  AND split_part(name,'/',2)='fuelings'
  AND EXISTS (
    SELECT 1
    FROM public.fleet_fuelings f
    JOIN public.fleet_station_members sm
      ON sm.station_id=f.station_id AND sm.municipio_id=f.municipio_id
    WHERE f.id::text=split_part(name,'/',3)
      AND f.municipio_id=public.fleet_current_municipio_id()
      AND sm.usuario_id=public.fleet_current_usuario_id()
      AND sm.ativo
  )
);

COMMIT;
