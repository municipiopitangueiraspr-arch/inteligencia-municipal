-- Hardening: remove policies globais permissivas criadas para o bucket de Compras.
-- As permissões de cada bucket continuam cobertas por policies específicas já existentes.
BEGIN;

DROP POLICY IF EXISTS compras_storage_anon_deny ON storage.objects;
DROP POLICY IF EXISTS compras_storage_delete_scope ON storage.objects;
DROP POLICY IF EXISTS compras_storage_insert_scope ON storage.objects;
DROP POLICY IF EXISTS compras_storage_read_scope ON storage.objects;
DROP POLICY IF EXISTS compras_storage_update_scope ON storage.objects;

COMMIT;
