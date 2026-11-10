-- Rename the public-facing module title while preserving its stable technical ID.
UPDATE public.municipal_modules
SET label = 'Saúde da Família/ACS'
WHERE id = 'census'
  AND label IS DISTINCT FROM 'Saúde da Família/ACS';
