BEGIN;

CREATE OR REPLACE FUNCTION public.census_attach_task_subject(p_task_id uuid, p_family_id uuid, p_citizen_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,auth AS $$
DECLARE v_household_id uuid; v_professional_id uuid;
BEGIN
  SELECT t.household_id INTO v_household_id FROM public.census_agenda_tasks t
  WHERE t.id=p_task_id AND t.status IN ('PLANNED','IN_PROGRESS') FOR UPDATE;
  IF v_household_id IS NULL THEN RAISE EXCEPTION 'Tarefa de agenda não encontrada ou já encerrada.' USING ERRCODE='42501'; END IF;
  IF NOT public.census_user_can_access_household(v_household_id) THEN RAISE EXCEPTION 'A tarefa está fora do escopo territorial.' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.census_families f WHERE f.id=p_family_id AND f.household_id=v_household_id) THEN RAISE EXCEPTION 'A família não pertence ao domicílio da tarefa.' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.census_citizens c WHERE c.id=p_citizen_id AND c.family_id=p_family_id) THEN RAISE EXCEPTION 'O cidadão não pertence à família informada.' USING ERRCODE='23514'; END IF;
  SELECT p.id INTO v_professional_id FROM public.health_professionals p JOIN public.usuarios u ON u.id=p.user_id WHERE u.uuid=auth.uid() AND p.active IS TRUE LIMIT 1;
  IF v_professional_id IS NULL THEN RAISE EXCEPTION 'Usuário sem vínculo profissional ativo.' USING ERRCODE='42501'; END IF;
  IF EXISTS (SELECT 1 FROM public.census_agenda_tasks t WHERE t.id=p_task_id AND t.professional_id IS NOT NULL AND t.professional_id<>v_professional_id) THEN RAISE EXCEPTION 'A tarefa pertence a outro profissional.' USING ERRCODE='42501'; END IF;
  UPDATE public.census_agenda_tasks SET family_id=p_family_id, citizen_id=p_citizen_id, updated_at=now() WHERE id=p_task_id;
END; $$;

REVOKE ALL ON FUNCTION public.census_attach_task_subject(uuid,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.census_attach_task_subject(uuid,uuid,uuid) TO authenticated;

COMMIT;
