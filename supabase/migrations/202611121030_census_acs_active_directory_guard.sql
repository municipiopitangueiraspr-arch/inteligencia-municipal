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
    IF NOT EXISTS (SELECT 1 FROM public.usuarios WHERE uuid = NEW.user_id AND ativo IS TRUE) THEN
      RAISE EXCEPTION 'Selecione um usuário ativo do diretório municipal.' USING errcode = '23514';
    END IF;
    SELECT email INTO account_email FROM auth.users WHERE id = NEW.user_id;
    IF NOT FOUND OR NULLIF(BTRIM(account_email), '') IS NULL THEN
      RAISE EXCEPTION 'O ACS precisa estar vinculado a uma conta ativa do sistema.' USING errcode = '23514';
    END IF;
    NEW.email := account_email;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.census_acs_require_registered_user() FROM PUBLIC, anon, authenticated;
