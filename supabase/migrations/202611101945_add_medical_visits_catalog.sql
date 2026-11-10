-- Registra o card futuro de Visitas Médicas no catálogo, sem ativar funcionalidades nem alterar permissões.
BEGIN;

INSERT INTO public.municipal_modules(id,label,description,icon_name,is_ready,status_label,sort_order)
VALUES (
  'medical-visits',
  'Visitas Médicas',
  'Módulo futuro para organizar informações de visitas médicas.',
  'Stethoscope',
  false,
  'Em preparação',
  6
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.municipal_secretariat_modules(secretariat_id,module_id,sort_order)
VALUES ('health','medical-visits',2)
ON CONFLICT (secretariat_id,module_id) DO NOTHING;

COMMIT;
