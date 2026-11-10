-- Governança municipal: apenas catálogo e registros de atribuições; não altera autorização dos módulos existentes.
BEGIN;

ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS perfil_municipal text;
DO $$ BEGIN
  ALTER TABLE public.usuarios ADD CONSTRAINT usuarios_perfil_municipal_check
    CHECK (perfil_municipal IS NULL OR perfil_municipal IN ('ADMIN','PREFEITO','SECRETARIO','ADMINISTRATIVO'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE public.usuarios SET perfil_municipal='ADMIN'
 WHERE perfil='ADMIN' AND ativo IS TRUE AND perfil_municipal IS NULL;

CREATE TABLE IF NOT EXISTS public.municipal_secretariats (
  id text PRIMARY KEY,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon_name text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.municipal_modules (
  id text PRIMARY KEY,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon_name text NOT NULL,
  is_ready boolean NOT NULL DEFAULT false,
  status_label text NOT NULL DEFAULT 'Em preparação',
  sort_order integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.municipal_secretariat_modules (
  secretariat_id text NOT NULL REFERENCES public.municipal_secretariats(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  module_id text NOT NULL REFERENCES public.municipal_modules(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (secretariat_id,module_id)
);
CREATE TABLE IF NOT EXISTS public.municipal_user_secretariats (
  user_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  secretariat_id text NOT NULL REFERENCES public.municipal_secretariats(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,secretariat_id)
);
CREATE TABLE IF NOT EXISTS public.municipal_user_modules (
  user_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  module_id text NOT NULL REFERENCES public.municipal_modules(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id,module_id)
);
COMMENT ON TABLE public.municipal_secretariat_modules IS 'Localização visual do cartão de módulo no hall; não representa permissão individual.';
COMMENT ON TABLE public.municipal_user_secretariats IS 'Vínculos cadastrais de usuários com secretarias; não aplicam controle de acesso nesta etapa.';
COMMENT ON TABLE public.municipal_user_modules IS 'Atribuições cadastrais de módulos; não aplicam controle de acesso nesta etapa.';
CREATE INDEX IF NOT EXISTS municipal_user_secretariats_secretariat_idx ON public.municipal_user_secretariats(secretariat_id);
CREATE INDEX IF NOT EXISTS municipal_user_modules_module_idx ON public.municipal_user_modules(module_id);

INSERT INTO public.municipal_secretariats(id,name,description,icon_name,sort_order,is_active) VALUES
('administration','Administração e Finanças','Gestão administrativa, financeira e dos recursos municipais.','Landmark',1,true),
('agriculture','Agricultura e Meio Ambiente','Desenvolvimento rural, agricultura e cuidado ambiental.','Sprout',2,true),
('social','Assistência Social','Políticas de proteção e atendimento social.','HeartHandshake',3,true),
('culture','Cultura e Turismo','Ações culturais, turismo e valorização do município.','Compass',4,true),
('development','Desenvolvimento Econômico','Iniciativas de desenvolvimento e fortalecimento econômico.','TrendingUp',5,true),
('education','Educação','Gestão e acompanhamento das ações educacionais.','GraduationCap',6,true),
('sports','Esporte e Lazer','Atividades esportivas, recreação e lazer.','Dumbbell',7,true),
('works','Obras, Planejamento e Urbanismo','Obras, planejamento territorial e desenvolvimento urbano.','Construction',8,true),
('health','Saúde','Serviços, planejamento e informações municipais de saúde.','HeartPulse',9,true),
('security','Segurança Pública e Trânsito','Segurança pública, mobilidade e trânsito municipal.','ShieldCheck',10,true)
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.municipal_modules(id,label,description,icon_name,is_ready,status_label,sort_order) VALUES
('fleet','Gestão de Frotas','Veículos, condutores e abastecimentos.','Truck',true,'Em implantação',1),
('census','Censo Municipal','Mapa e informações do território municipal.','MapPinned',true,'Estrutura inicial',2),
('atas','Atas e Pedidos','Atas de registro de preços e solicitações.','FileText',false,'Em preparação',3),
('compras','Compras Públicas','Processos, contratos e aquisições.','Package',false,'Em preparação',4),
('acts','Atos Oficiais','Publicações e documentos municipais.','ShieldCheck',false,'Em preparação',5)
ON CONFLICT(id) DO NOTHING;
INSERT INTO public.municipal_secretariat_modules(secretariat_id,module_id,sort_order) VALUES
('administration','fleet',1),('administration','atas',2),('administration','compras',3),('administration','acts',4),('health','census',1)
ON CONFLICT(secretariat_id,module_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.municipal_governance_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
 SELECT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.uuid=auth.uid() AND u.ativo IS TRUE
   AND (u.perfil='ADMIN' OR u.perfil_municipal='ADMIN'))
$$;
REVOKE ALL ON FUNCTION public.municipal_governance_is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_is_admin() TO authenticated;

ALTER TABLE public.municipal_secretariats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_secretariat_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_user_secretariats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_user_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY municipal_secretariats_read ON public.municipal_secretariats FOR SELECT TO authenticated USING(is_active OR public.municipal_governance_is_admin());
CREATE POLICY municipal_secretariats_admin_insert ON public.municipal_secretariats FOR INSERT TO authenticated WITH CHECK(public.municipal_governance_is_admin());
CREATE POLICY municipal_secretariats_admin_update ON public.municipal_secretariats FOR UPDATE TO authenticated USING(public.municipal_governance_is_admin()) WITH CHECK(public.municipal_governance_is_admin());
CREATE POLICY municipal_modules_authenticated_read ON public.municipal_modules FOR SELECT TO authenticated USING(true);
CREATE POLICY municipal_secretariat_modules_authenticated_read ON public.municipal_secretariat_modules FOR SELECT TO authenticated USING(true);
REVOKE ALL ON public.municipal_secretariats,public.municipal_modules,public.municipal_secretariat_modules,public.municipal_user_secretariats,public.municipal_user_modules FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.municipal_secretariats,public.municipal_modules,public.municipal_secretariat_modules TO authenticated;
GRANT INSERT,UPDATE ON public.municipal_secretariats TO authenticated;
GRANT ALL ON public.municipal_secretariats,public.municipal_modules,public.municipal_secretariat_modules,public.municipal_user_secretariats,public.municipal_user_modules TO service_role;

CREATE OR REPLACE FUNCTION public.municipal_governance_list_users()
RETURNS TABLE(user_id integer, uuid uuid, name text, email text, perfil_municipal text, ativo boolean, legacy_admin boolean, secretariat_ids text[], module_ids text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.municipal_governance_is_admin() THEN RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501'; END IF;
 RETURN QUERY SELECT u.id,u.uuid,u.nome::text,u.email::text,
   COALESCE(u.perfil_municipal,CASE WHEN u.perfil='ADMIN' THEN 'ADMIN' END),u.ativo,COALESCE(u.perfil='ADMIN' AND u.ativo IS TRUE,false),
   COALESCE((SELECT array_agg(us.secretariat_id ORDER BY us.secretariat_id) FROM public.municipal_user_secretariats us WHERE us.user_id=u.id),'{}'::text[]),
   COALESCE((SELECT array_agg(um.module_id ORDER BY um.module_id) FROM public.municipal_user_modules um WHERE um.user_id=u.id),'{}'::text[])
 FROM public.usuarios u
 WHERE u.uuid IS NOT NULL AND u.ativo IS TRUE
   AND COALESCE(u.perfil,'') NOT LIKE 'POSTO\_%' ESCAPE E'\\';
END $$;
REVOKE ALL ON FUNCTION public.municipal_governance_list_users() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_list_users() TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_save_user_assignments(p_user_id integer,p_profile text,p_secretariat_ids text[],p_module_ids text[])
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
 IF NOT public.municipal_governance_is_admin() THEN RAISE EXCEPTION 'Acesso administrativo obrigatório' USING ERRCODE='42501'; END IF;
 IF p_profile IS NULL OR p_profile NOT IN ('ADMIN','PREFEITO','SECRETARIO','ADMINISTRATIVO') THEN RAISE EXCEPTION 'Perfil municipal inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_user_id AND uuid IS NOT NULL AND ativo IS TRUE AND COALESCE(perfil,'') NOT LIKE 'POSTO\_%' ESCAPE E'\\') THEN RAISE EXCEPTION 'Usuário municipal não encontrado'; END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE id=p_user_id AND perfil='ADMIN' AND ativo IS TRUE) AND p_profile<>'ADMIN' THEN RAISE EXCEPTION 'O administrador ativo existente permanece administrador nesta etapa'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(COALESCE(p_secretariat_ids,'{}'::text[])) AS selected(secretariat_id) WHERE NOT EXISTS(SELECT 1 FROM public.municipal_secretariats s WHERE s.id=selected.secretariat_id)) THEN RAISE EXCEPTION 'Secretaria inválida'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(COALESCE(p_module_ids,'{}'::text[])) AS selected(module_id) WHERE NOT EXISTS(SELECT 1 FROM public.municipal_modules m WHERE m.id=selected.module_id)) THEN RAISE EXCEPTION 'Módulo inválido'; END IF;
 UPDATE public.usuarios SET perfil_municipal=p_profile WHERE id=p_user_id;
 DELETE FROM public.municipal_user_secretariats WHERE user_id=p_user_id;
 DELETE FROM public.municipal_user_modules WHERE user_id=p_user_id;
 INSERT INTO public.municipal_user_secretariats(user_id,secretariat_id) SELECT p_user_id,selected.secretariat_id FROM unnest(COALESCE(p_secretariat_ids,'{}'::text[])) AS selected(secretariat_id) ON CONFLICT DO NOTHING;
 INSERT INTO public.municipal_user_modules(user_id,module_id) SELECT p_user_id,selected.module_id FROM unnest(COALESCE(p_module_ids,'{}'::text[])) AS selected(module_id) ON CONFLICT DO NOTHING;
END $$;
REVOKE ALL ON FUNCTION public.municipal_governance_save_user_assignments(integer,text,text[],text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.municipal_governance_save_user_assignments(integer,text,text[],text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.municipal_governance_register_invited_user(p_auth_user_id uuid,p_name text,p_email text,p_profile text,p_secretariat_ids text[],p_module_ids text[])
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id integer;
BEGIN
 IF COALESCE(auth.role(),'') <> 'service_role' THEN RAISE EXCEPTION 'Somente service_role' USING ERRCODE='42501'; END IF;
 IF p_profile IS NULL OR p_profile NOT IN ('ADMIN','PREFEITO','SECRETARIO','ADMINISTRATIVO') THEN RAISE EXCEPTION 'Perfil municipal inválido'; END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE lower(email)=lower(p_email) AND uuid IS DISTINCT FROM p_auth_user_id AND COALESCE(perfil,'') LIKE 'POSTO\_%' ESCAPE E'\\') THEN RAISE EXCEPTION 'E-mail vinculado a usuário fornecedor'; END IF;
 IF EXISTS(SELECT 1 FROM public.usuarios WHERE lower(email)=lower(p_email) AND uuid IS DISTINCT FROM p_auth_user_id) THEN RAISE EXCEPTION 'E-mail já registrado'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(COALESCE(p_secretariat_ids,'{}'::text[])) AS selected(secretariat_id) WHERE NOT EXISTS(SELECT 1 FROM public.municipal_secretariats s WHERE s.id=selected.secretariat_id))
   OR EXISTS(SELECT 1 FROM unnest(COALESCE(p_module_ids,'{}'::text[])) AS selected(module_id) WHERE NOT EXISTS(SELECT 1 FROM public.municipal_modules m WHERE m.id=selected.module_id)) THEN RAISE EXCEPTION 'Atribuição inválida'; END IF;
 SELECT id INTO v_id FROM public.usuarios WHERE uuid=p_auth_user_id FOR UPDATE;
 IF v_id IS NULL THEN
   INSERT INTO public.usuarios(uuid,nome,email,perfil_municipal,ativo,primeiro_acesso,perfil_completo)
   VALUES(p_auth_user_id,p_name,p_email,p_profile,true,true,false) RETURNING id INTO v_id;
 ELSE
   UPDATE public.usuarios SET nome=p_name,email=p_email,perfil_municipal=p_profile,primeiro_acesso=true,perfil_completo=false WHERE id=v_id;
 END IF;
 DELETE FROM public.municipal_user_secretariats WHERE user_id=v_id;
 DELETE FROM public.municipal_user_modules WHERE user_id=v_id;
 INSERT INTO public.municipal_user_secretariats(user_id,secretariat_id) SELECT v_id,selected.secretariat_id FROM unnest(COALESCE(p_secretariat_ids,'{}'::text[])) AS selected(secretariat_id) ON CONFLICT DO NOTHING;
 INSERT INTO public.municipal_user_modules(user_id,module_id) SELECT v_id,selected.module_id FROM unnest(COALESCE(p_module_ids,'{}'::text[])) AS selected(module_id) ON CONFLICT DO NOTHING;
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.municipal_governance_register_invited_user(uuid,text,text,text,text[],text[]) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.municipal_governance_register_invited_user(uuid,text,text,text,text[],text[]) TO service_role;

COMMIT;
