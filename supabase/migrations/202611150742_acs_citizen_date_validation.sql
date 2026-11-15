BEGIN;

CREATE OR REPLACE FUNCTION public.census_prepare_citizen_identifiers()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cns text := nullif(regexp_replace(coalesce(new.cns, ''), '[^0-9]', '', 'g'), '');
  v_cpf text := nullif(regexp_replace(coalesce(new.cpf, ''), '[^0-9]', '', 'g'), '');
BEGIN
  new.full_name := btrim(new.full_name);
  new.preferred_name := nullif(btrim(new.preferred_name), '');
  IF new.birth_date IS NOT NULL AND new.birth_date > current_date THEN
    RAISE EXCEPTION 'A data de nascimento não pode estar no futuro.' USING ERRCODE = '23514';
  END IF;
  new.cns := v_cns;
  new.cpf := v_cpf;
  IF v_cns IS NULL THEN
    new.cns_validation_status := 'NOT_INFORMED';
  ELSIF v_cns !~ '^[0-9]{15}$' THEN
    RAISE EXCEPTION 'O CNS deve conter 15 dígitos.' USING ERRCODE = '23514';
  ELSE
    new.cns_validation_status := 'FORMAT_VALID';
  END IF;
  IF v_cpf IS NULL THEN
    new.cpf_validation_status := 'NOT_INFORMED';
  ELSIF v_cpf !~ '^[0-9]{11}$' OR NOT public.census_is_valid_cpf(v_cpf) THEN
    RAISE EXCEPTION 'Informe um CPF válido ou deixe o campo em branco.' USING ERRCODE = '23514';
  ELSE
    new.cpf_validation_status := 'CHECK_DIGIT_VALID';
  END IF;
  IF TG_OP = 'INSERT' OR new.cns IS DISTINCT FROM old.cns OR new.cpf IS DISTINCT FROM old.cpf THEN
    new.identifiers_validated_at := now();
  END IF;
  new.updated_at := now();
  RETURN new;
END;
$$;

COMMIT;
