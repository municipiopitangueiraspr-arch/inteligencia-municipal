-- Gestão de Zonas e ACS: o catálogo ACS passa a apontar para contas municipais existentes.
ALTER TABLE public.census_acs
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS census_acs_user_id_unique_idx
  ON public.census_acs (user_id) WHERE user_id IS NOT NULL;

-- Vincula cadastros ACS anteriores às contas já existentes quando o e-mail coincide.
UPDATE public.census_acs acs
SET user_id = account.id
FROM auth.users account
WHERE acs.user_id IS NULL
  AND NULLIF(LOWER(BTRIM(acs.email)), '') IS NOT NULL
  AND LOWER(BTRIM(acs.email)) = LOWER(BTRIM(account.email));

CREATE OR REPLACE FUNCTION public.census_acs_require_registered_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  account_email text;
BEGIN
  IF TG_OP = 'INSERT' AND NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'Associe o ACS a um usuário já cadastrado no sistema.' USING errcode = '23514';
  END IF;
  IF NEW.user_id IS NOT NULL THEN
    SELECT email INTO account_email FROM auth.users WHERE id = NEW.user_id;
    IF NOT FOUND OR NULLIF(BTRIM(account_email), '') IS NULL THEN
      RAISE EXCEPTION 'O ACS precisa estar vinculado a uma conta ativa do sistema.' USING errcode = '23514';
    END IF;
    NEW.email := account_email;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS census_acs_require_registered_user_trigger ON public.census_acs;
CREATE TRIGGER census_acs_require_registered_user_trigger
  BEFORE INSERT OR UPDATE OF user_id ON public.census_acs
  FOR EACH ROW EXECUTE FUNCTION public.census_acs_require_registered_user();

-- Zona é inativada; nenhuma operação de exclusão pode cascatar os vínculos ou dados territoriais.
CREATE OR REPLACE FUNCTION public.census_prevent_zone_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'Zonas não podem ser excluídas. Inative a zona para preservar o histórico.' USING errcode = '23514';
END;
$$;
DROP TRIGGER IF EXISTS census_zones_prevent_delete ON public.census_zones;
CREATE TRIGGER census_zones_prevent_delete
  BEFORE DELETE ON public.census_zones
  FOR EACH ROW EXECUTE FUNCTION public.census_prevent_zone_delete();
REVOKE DELETE ON TABLE public.census_zones FROM authenticated;

-- Cada edição encerra a linha anterior e cria a nova, preservando a trilha de vínculo.
ALTER TABLE public.census_acs_zone_assignments
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.census_acs_zone_assignments
  DROP CONSTRAINT IF EXISTS census_acs_zone_assignments_acs_id_zone_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS census_acs_zone_assignments_one_active_pair_idx
  ON public.census_acs_zone_assignments (acs_id, zone_id) WHERE active IS TRUE;

CREATE OR REPLACE FUNCTION public.census_save_acs_zone_assignment(
  p_assignment_id uuid,
  p_acs_id uuid,
  p_zone_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, app_private, auth
AS $$
DECLARE
  old_assignment public.census_acs_zone_assignments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT COALESCE(app_private.current_user_is_admin(), false) THEN
    RAISE EXCEPTION 'Somente um administrador municipal pode gerenciar vínculos Zona–ACS.' USING errcode = '42501';
  END IF;

  IF p_assignment_id IS NOT NULL THEN
    SELECT * INTO old_assignment
    FROM public.census_acs_zone_assignments
    WHERE id = p_assignment_id AND active IS TRUE
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'O vínculo selecionado não está ativo.' USING errcode = '22023';
    END IF;
    UPDATE public.census_acs_zone_assignments
    SET active = false, ended_at = now(), changed_by = auth.uid()
    WHERE id = p_assignment_id;
  END IF;

  IF p_acs_id IS NULL AND p_zone_id IS NULL THEN
    IF p_assignment_id IS NULL THEN
      RAISE EXCEPTION 'Selecione um vínculo para encerrar.' USING errcode = '22023';
    END IF;
    RETURN;
  END IF;
  IF p_acs_id IS NULL OR p_zone_id IS NULL THEN
    RAISE EXCEPTION 'Informe o ACS e a zona para salvar o vínculo.' USING errcode = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.census_acs WHERE id = p_acs_id AND active IS TRUE AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'Selecione um ACS ativo ligado a um usuário cadastrado.' USING errcode = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.census_zones WHERE id = p_zone_id AND active IS TRUE) THEN
    RAISE EXCEPTION 'Selecione uma zona ativa.' USING errcode = '23514';
  END IF;

  INSERT INTO public.census_acs_zone_assignments (acs_id, zone_id, active, created_at, ended_at, changed_by)
  VALUES (p_acs_id, p_zone_id, true, now(), NULL, auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.census_save_acs_zone_assignment(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.census_save_acs_zone_assignment(uuid, uuid, uuid) TO authenticated;
