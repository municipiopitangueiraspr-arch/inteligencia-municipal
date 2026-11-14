BEGIN;

-- Papéis municipais apresentados na Governança. O papel GOV_ADMIN continua
-- existindo apenas como permissão técnica para administrar este painel.
INSERT INTO public.municipal_roles(id, label, description, is_system)
VALUES
  ('SYSTEM_ADMIN', 'Admin', 'Administra o sistema e os módulos municipais autorizados.', true)
ON CONFLICT (id) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    is_active = true;

UPDATE public.municipal_roles
SET label = 'Prefeito',
    description = 'Consulta a visão executiva e os dados institucionais autorizados.'
WHERE id = 'EXECUTIVE_VIEW';

UPDATE public.municipal_roles
SET label = 'Secretário',
    description = 'Acompanha e administra a operação da secretaria ou unidade autorizada.'
WHERE id = 'UNIT_MANAGER';

-- O Admin do sistema reúne as permissões administrativas e de leitura disponíveis.
INSERT INTO public.municipal_role_permissions(role_id, permission_id)
SELECT 'SYSTEM_ADMIN', p.id
FROM public.municipal_permissions p
ON CONFLICT DO NOTHING;

-- GOV_ADMIN não é um papel municipal selecionável: é a permissão técnica que
-- permite operar a Governança. ACS/ACE também permanecem técnicos de campo.
CREATE OR REPLACE FUNCTION public.municipal_governance_list_roles()
RETURNS TABLE(id text, label text, description text, is_active boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF NOT public.municipal_governance_is_admin() THEN
    RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501';
  END IF;
  RETURN QUERY
  SELECT r.id, r.label, r.description, r.is_active
  FROM public.municipal_roles r
  WHERE r.is_active IS TRUE
    AND r.id IN ('SYSTEM_ADMIN','EXECUTIVE_VIEW','UNIT_MANAGER','OPERATOR','READ_ONLY')
  ORDER BY CASE r.id
    WHEN 'SYSTEM_ADMIN' THEN 1
    WHEN 'EXECUTIVE_VIEW' THEN 2
    WHEN 'UNIT_MANAGER' THEN 3
    WHEN 'OPERATOR' THEN 4
    WHEN 'READ_ONLY' THEN 5
    ELSE 99
  END;
END;
$$;

COMMIT;
