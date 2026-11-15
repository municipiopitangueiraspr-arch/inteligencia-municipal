BEGIN;

-- Dados locais estruturados. official_code permanece nulo até confirmação do leiaute oficial.
ALTER TABLE public.census_households
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS occupancy_status text,
  ADD COLUMN IF NOT EXISTS construction_material text,
  ADD COLUMN IF NOT EXISTS rooms_count integer,
  ADD COLUMN IF NOT EXISTS bedrooms_count integer,
  ADD COLUMN IF NOT EXISTS water_supply text,
  ADD COLUMN IF NOT EXISTS water_treatment text,
  ADD COLUMN IF NOT EXISTS sewage_disposal text,
  ADD COLUMN IF NOT EXISTS toilet_available text,
  ADD COLUMN IF NOT EXISTS electricity_access text,
  ADD COLUMN IF NOT EXISTS garbage_disposal text,
  ADD COLUMN IF NOT EXISTS cooking_fuel text,
  ADD COLUMN IF NOT EXISTS housing_condition text,
  ADD COLUMN IF NOT EXISTS housing_data_version integer NOT NULL DEFAULT 1;

ALTER TABLE public.census_citizens
  ADD COLUMN IF NOT EXISTS race_color text,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS education_level text,
  ADD COLUMN IF NOT EXISTS occupation text,
  ADD COLUMN IF NOT EXISTS mother_name text,
  ADD COLUMN IF NOT EXISTS father_name text,
  ADD COLUMN IF NOT EXISTS sociodemographic_data_version integer NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.census_attribute_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  source text NOT NULL DEFAULT 'municipal_foundation_v1',
  official_code text,
  official_version text,
  active boolean NOT NULL DEFAULT true,
  valid_from date NOT NULL DEFAULT current_date,
  valid_until date,
  UNIQUE (domain, code, version),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

INSERT INTO public.census_attribute_catalog (domain, code, label, version, source)
VALUES
 ('PROPERTY_TYPE','URBANA','Domicílio urbano',1,'municipal_foundation_v1'),
 ('PROPERTY_TYPE','RURAL','Domicílio rural',1,'municipal_foundation_v1'),
 ('PROPERTY_TYPE','COLETIVO','Domicílio coletivo',1,'municipal_foundation_v1'),
 ('PROPERTY_TYPE','NAO_RESIDENCIAL','Imóvel não residencial',1,'municipal_foundation_v1'),
 ('OCCUPANCY_STATUS','PROPRIO','Próprio',1,'municipal_foundation_v1'),
 ('OCCUPANCY_STATUS','ALUGADO','Alugado',1,'municipal_foundation_v1'),
 ('OCCUPANCY_STATUS','CEDIDO','Cedido',1,'municipal_foundation_v1'),
 ('OCCUPANCY_STATUS','OCUPACAO','Ocupação sem propriedade declarada',1,'municipal_foundation_v1'),
 ('OCCUPANCY_STATUS','VAGO','Vago ou sem ocupação',1,'municipal_foundation_v1'),
 ('OCCUPANCY_STATUS','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('CONSTRUCTION_MATERIAL','ALVENARIA','Alvenaria',1,'municipal_foundation_v1'),
 ('CONSTRUCTION_MATERIAL','MADEIRA','Madeira',1,'municipal_foundation_v1'),
 ('CONSTRUCTION_MATERIAL','TAIPA','Taipa ou material semelhante',1,'municipal_foundation_v1'),
 ('CONSTRUCTION_MATERIAL','OUTRO','Outro material',1,'municipal_foundation_v1'),
 ('CONSTRUCTION_MATERIAL','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('WATER_SUPPLY','REDE_PUBLICA','Rede pública',1,'municipal_foundation_v1'),
 ('WATER_SUPPLY','POCO_NASCENTE','Poço ou nascente',1,'municipal_foundation_v1'),
 ('WATER_SUPPLY','CISTERNA','Cisterna',1,'municipal_foundation_v1'),
 ('WATER_SUPPLY','CARRO_PIPA','Carro-pipa',1,'municipal_foundation_v1'),
 ('WATER_SUPPLY','OUTRA','Outra fonte',1,'municipal_foundation_v1'),
 ('WATER_SUPPLY','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('WATER_TREATMENT','FILTRADA','Filtrada',1,'municipal_foundation_v1'),
 ('WATER_TREATMENT','FERVIDA','Fervida',1,'municipal_foundation_v1'),
 ('WATER_TREATMENT','CLORADA','Clorada',1,'municipal_foundation_v1'),
 ('WATER_TREATMENT','MINERAL','Mineral',1,'municipal_foundation_v1'),
 ('WATER_TREATMENT','SEM_TRATAMENTO','Sem tratamento informado',1,'municipal_foundation_v1'),
 ('WATER_TREATMENT','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('SEWAGE_DISPOSAL','REDE_COLETORA','Rede coletora',1,'municipal_foundation_v1'),
 ('SEWAGE_DISPOSAL','FOSSA_SEPTICA','Fossa séptica',1,'municipal_foundation_v1'),
 ('SEWAGE_DISPOSAL','FOSSA_RUDIMENTAR','Fossa rudimentar',1,'municipal_foundation_v1'),
 ('SEWAGE_DISPOSAL','CEU_ABERTO','Céu aberto',1,'municipal_foundation_v1'),
 ('SEWAGE_DISPOSAL','OUTRO','Outro destino',1,'municipal_foundation_v1'),
 ('SEWAGE_DISPOSAL','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('TOILET_AVAILABLE','SIM','Sim',1,'municipal_foundation_v1'),
 ('TOILET_AVAILABLE','NAO','Não',1,'municipal_foundation_v1'),
 ('TOILET_AVAILABLE','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('ELECTRICITY_ACCESS','REDE_PUBLICA','Rede pública',1,'municipal_foundation_v1'),
 ('ELECTRICITY_ACCESS','OUTRA_FONTE','Outra fonte',1,'municipal_foundation_v1'),
 ('ELECTRICITY_ACCESS','SEM_ENERGIA','Sem energia elétrica',1,'municipal_foundation_v1'),
 ('ELECTRICITY_ACCESS','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('GARBAGE_DISPOSAL','COLETA_PUBLICA','Coleta pública',1,'municipal_foundation_v1'),
 ('GARBAGE_DISPOSAL','QUEIMADO','Queimado',1,'municipal_foundation_v1'),
 ('GARBAGE_DISPOSAL','ENTERRADO','Enterrado',1,'municipal_foundation_v1'),
 ('GARBAGE_DISPOSAL','JOGADO_TERRENO','Jogado em terreno ou área aberta',1,'municipal_foundation_v1'),
 ('GARBAGE_DISPOSAL','OUTRO','Outro destino',1,'municipal_foundation_v1'),
 ('GARBAGE_DISPOSAL','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('COOKING_FUEL','GAS_BOTIJAO','Gás de botijão',1,'municipal_foundation_v1'),
 ('COOKING_FUEL','GAS_ENCANADO','Gás encanado',1,'municipal_foundation_v1'),
 ('COOKING_FUEL','LENHA','Lenha',1,'municipal_foundation_v1'),
 ('COOKING_FUEL','CARVAO','Carvão',1,'municipal_foundation_v1'),
 ('COOKING_FUEL','ELETRICIDADE','Eletricidade',1,'municipal_foundation_v1'),
 ('COOKING_FUEL','OUTRO','Outro combustível',1,'municipal_foundation_v1'),
 ('COOKING_FUEL','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('HOUSING_CONDITION','ADEQUADA','Adequada',1,'municipal_foundation_v1'),
 ('HOUSING_CONDITION','NECESSITA_REPARO','Necessita reparo',1,'municipal_foundation_v1'),
 ('HOUSING_CONDITION','RISCO_ESTRUTURAL','Risco estrutural percebido',1,'municipal_foundation_v1'),
 ('HOUSING_CONDITION','NAO_AVALIADA','Não avaliada',1,'municipal_foundation_v1'),
 ('RACE_COLOR','BRANCA','Branca',1,'municipal_foundation_v1'),
 ('RACE_COLOR','PRETA','Preta',1,'municipal_foundation_v1'),
 ('RACE_COLOR','PARDA','Parda',1,'municipal_foundation_v1'),
 ('RACE_COLOR','AMARELA','Amarela',1,'municipal_foundation_v1'),
 ('RACE_COLOR','INDIGENA','Indígena',1,'municipal_foundation_v1'),
 ('RACE_COLOR','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('NATIONALITY','BRASILEIRA','Brasileira',1,'municipal_foundation_v1'),
 ('NATIONALITY','NATURALIZADA','Brasileira naturalizada',1,'municipal_foundation_v1'),
 ('NATIONALITY','ESTRANGEIRA','Estrangeira',1,'municipal_foundation_v1'),
 ('NATIONALITY','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1'),
 ('EDUCATION_LEVEL','NAO_ALFABETIZADO','Não alfabetizado',1,'municipal_foundation_v1'),
 ('EDUCATION_LEVEL','FUNDAMENTAL_INCOMPLETO','Fundamental incompleto',1,'municipal_foundation_v1'),
 ('EDUCATION_LEVEL','FUNDAMENTAL_COMPLETO','Fundamental completo',1,'municipal_foundation_v1'),
 ('EDUCATION_LEVEL','MEDIO_INCOMPLETO','Médio incompleto',1,'municipal_foundation_v1'),
 ('EDUCATION_LEVEL','MEDIO_COMPLETO','Médio completo',1,'municipal_foundation_v1'),
 ('EDUCATION_LEVEL','SUPERIOR_INCOMPLETO','Superior incompleto',1,'municipal_foundation_v1'),
 ('EDUCATION_LEVEL','SUPERIOR_COMPLETO','Superior completo',1,'municipal_foundation_v1'),
 ('EDUCATION_LEVEL','NAO_INFORMADO','Não informado',1,'municipal_foundation_v1')
ON CONFLICT (domain, code, version) DO UPDATE
SET label = EXCLUDED.label, source = EXCLUDED.source, active = true;

CREATE INDEX IF NOT EXISTS census_attribute_catalog_domain_idx
  ON public.census_attribute_catalog(domain, active, code);

CREATE OR REPLACE FUNCTION public.census_validate_structured_attributes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_field text;
  v_value text;
  v_domain text;
BEGIN
  IF TG_TABLE_NAME = 'census_households' THEN
    IF new.rooms_count IS NOT NULL AND (new.rooms_count < 0 OR new.rooms_count > 100) THEN
      RAISE EXCEPTION 'A quantidade de cômodos deve estar entre 0 e 100.' USING ERRCODE = '23514';
    END IF;
    IF new.bedrooms_count IS NOT NULL AND (new.bedrooms_count < 0 OR new.bedrooms_count > 100) THEN
      RAISE EXCEPTION 'A quantidade de quartos deve estar entre 0 e 100.' USING ERRCODE = '23514';
    END IF;
    IF new.rooms_count IS NOT NULL AND new.bedrooms_count IS NOT NULL AND new.bedrooms_count > new.rooms_count THEN
      RAISE EXCEPTION 'A quantidade de quartos não pode superar a quantidade de cômodos.' USING ERRCODE = '23514';
    END IF;
    FOREACH v_field IN ARRAY ARRAY['property_type','occupancy_status','construction_material','water_supply','water_treatment','sewage_disposal','toilet_available','electricity_access','garbage_disposal','cooking_fuel','housing_condition'] LOOP
      v_value := to_jsonb(new) ->> v_field;
      IF v_value IS NULL OR v_value = '' THEN CONTINUE; END IF;
      v_domain := upper(v_field);
      IF v_field = 'construction_material' THEN v_domain := 'CONSTRUCTION_MATERIAL';
      ELSIF v_field = 'property_type' THEN v_domain := 'PROPERTY_TYPE';
      ELSIF v_field = 'occupancy_status' THEN v_domain := 'OCCUPANCY_STATUS';
      ELSIF v_field = 'water_supply' THEN v_domain := 'WATER_SUPPLY';
      ELSIF v_field = 'water_treatment' THEN v_domain := 'WATER_TREATMENT';
      ELSIF v_field = 'sewage_disposal' THEN v_domain := 'SEWAGE_DISPOSAL';
      ELSIF v_field = 'toilet_available' THEN v_domain := 'TOILET_AVAILABLE';
      ELSIF v_field = 'electricity_access' THEN v_domain := 'ELECTRICITY_ACCESS';
      ELSIF v_field = 'garbage_disposal' THEN v_domain := 'GARBAGE_DISPOSAL';
      ELSIF v_field = 'cooking_fuel' THEN v_domain := 'COOKING_FUEL';
      ELSIF v_field = 'housing_condition' THEN v_domain := 'HOUSING_CONDITION';
      END IF;
      IF NOT EXISTS (SELECT 1 FROM public.census_attribute_catalog c WHERE c.domain = v_domain AND c.code = v_value AND c.active IS TRUE AND current_date BETWEEN c.valid_from AND coalesce(c.valid_until,current_date)) THEN
        RAISE EXCEPTION 'Valor de % não está no catálogo vigente.', v_field USING ERRCODE = '23514';
      END IF;
    END LOOP;
    new.housing_data_version := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE coalesce(old.housing_data_version, 0) + 1 END;
  ELSE
    IF new.race_color IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.census_attribute_catalog c WHERE c.domain='RACE_COLOR' AND c.code=new.race_color AND c.active IS TRUE) THEN RAISE EXCEPTION 'Raça/cor não está no catálogo vigente.' USING ERRCODE='23514'; END IF;
    IF new.nationality IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.census_attribute_catalog c WHERE c.domain='NATIONALITY' AND c.code=new.nationality AND c.active IS TRUE) THEN RAISE EXCEPTION 'Nacionalidade não está no catálogo vigente.' USING ERRCODE='23514'; END IF;
    IF new.education_level IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.census_attribute_catalog c WHERE c.domain='EDUCATION_LEVEL' AND c.code=new.education_level AND c.active IS TRUE) THEN RAISE EXCEPTION 'Escolaridade não está no catálogo vigente.' USING ERRCODE='23514'; END IF;
    new.occupation := nullif(btrim(new.occupation), '');
    new.mother_name := nullif(btrim(new.mother_name), '');
    new.father_name := nullif(btrim(new.father_name), '');
    new.sociodemographic_data_version := CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE coalesce(old.sociodemographic_data_version, 0) + 1 END;
  END IF;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS census_households_validate_structured_attributes ON public.census_households;
CREATE TRIGGER census_households_validate_structured_attributes
BEFORE INSERT OR UPDATE ON public.census_households
FOR EACH ROW EXECUTE FUNCTION public.census_validate_structured_attributes();
DROP TRIGGER IF EXISTS census_citizens_validate_structured_attributes ON public.census_citizens;
CREATE TRIGGER census_citizens_validate_structured_attributes
BEFORE INSERT OR UPDATE ON public.census_citizens
FOR EACH ROW EXECUTE FUNCTION public.census_validate_structured_attributes();

ALTER TABLE public.census_attribute_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS census_attribute_catalog_read ON public.census_attribute_catalog;
CREATE POLICY census_attribute_catalog_read ON public.census_attribute_catalog FOR SELECT TO authenticated USING (active IS TRUE);
DROP POLICY IF EXISTS census_attribute_catalog_manage ON public.census_attribute_catalog;
CREATE POLICY census_attribute_catalog_manage ON public.census_attribute_catalog FOR ALL TO authenticated USING (public.municipal_foundation_is_admin()) WITH CHECK (public.municipal_foundation_is_admin());
REVOKE ALL ON public.census_attribute_catalog FROM PUBLIC, anon;
GRANT SELECT ON public.census_attribute_catalog TO authenticated;
GRANT ALL ON public.census_attribute_catalog TO service_role;
REVOKE ALL ON FUNCTION public.census_validate_structured_attributes() FROM PUBLIC, anon, authenticated;

COMMIT;
