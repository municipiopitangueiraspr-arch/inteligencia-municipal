BEGIN;

-- O papel técnico que já possui as atribuições de Governança passa a ser o
-- único papel institucional de administração do sistema.
UPDATE public.municipal_roles
SET label = 'Admin do Sistema',
    description = 'Administra usuários, secretarias, módulos, atribuições, acessos e auditoria do sistema.',
    is_active = true
WHERE id = 'GOVERNANCE_ADMIN';

-- O Admin do Sistema pode exercer todas as permissões administrativas e de
-- módulo existentes, sempre respeitando os módulos e escopos atribuídos.
INSERT INTO public.municipal_role_permissions(role_id, permission_id)
SELECT 'GOVERNANCE_ADMIN', p.id
FROM public.municipal_permissions p
ON CONFLICT DO NOTHING;

-- Remove o duplicado criado na etapa intermediária. Os usuários existentes
-- continuam vinculados a GOV_ADMIN, sem perda de atribuição.
UPDATE public.municipal_roles
SET is_active = false
WHERE id = 'SYSTEM_ADMIN';

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
    AND r.id IN ('GOVERNANCE_ADMIN','EXECUTIVE_VIEW','UNIT_MANAGER','OPERATOR','READ_ONLY')
  ORDER BY CASE r.id
    WHEN 'GOVERNANCE_ADMIN' THEN 1
    WHEN 'EXECUTIVE_VIEW' THEN 2
    WHEN 'UNIT_MANAGER' THEN 3
    WHEN 'OPERATOR' THEN 4
    WHEN 'READ_ONLY' THEN 5
    ELSE 99
  END;
END;
$$;

COMMIT;
