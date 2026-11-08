-- Mantém consistência entre a whitelist do bucket e os formatos aceitos no fluxo.
WITH target AS (
  SELECT id FROM storage.buckets WHERE id='fleet-documents' LIMIT 1
)
UPDATE storage.buckets b
SET allowed_mime_types=ARRAY['application/pdf','image/jpeg','image/png','image/webp']::text[]
FROM target t
WHERE b.id=t.id;
