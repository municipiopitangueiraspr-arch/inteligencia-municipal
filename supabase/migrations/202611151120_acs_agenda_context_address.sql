BEGIN;

CREATE OR REPLACE FUNCTION public.census_foundation_my_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,public,auth
AS $$
DECLARE
  v_user_id integer;
  v_professional jsonb;
  v_assignments jsonb;
  v_tasks jsonb;
BEGIN
  SELECT id INTO v_user_id
  FROM public.usuarios
  WHERE uuid=auth.uid() AND ativo IS TRUE;

  SELECT jsonb_build_object(
    'id',p.id,
    'user_id',p.user_id,
    'municipality_id',p.municipality_id,
    'full_name',p.full_name,
    'professional_category',p.professional_category,
    'active',p.active
  ) INTO v_professional
  FROM public.health_professionals p
  WHERE p.user_id=v_user_id AND p.active IS TRUE
  LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',a.id,
    'role_id',a.role_id,
    'municipality_id',a.municipality_id,
    'establishment_id',a.establishment_id,
    'team_id',a.team_id,
    'microarea_id',a.microarea_id,
    'valid_from',a.valid_from,
    'valid_until',a.valid_until
  ) ORDER BY a.valid_from DESC),'[]'::jsonb) INTO v_assignments
  FROM public.health_professional_assignments a
  JOIN public.health_professionals p ON p.id=a.professional_id
  WHERE p.user_id=v_user_id
    AND p.active IS TRUE
    AND a.active IS TRUE
    AND current_date BETWEEN a.valid_from AND COALESCE(a.valid_until,current_date);

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',t.id,
    'due_date',t.due_date,
    'priority',t.priority,
    'status',t.status,
    'task_type',t.task_type,
    'instructions',t.instructions,
    'household_id',t.household_id,
    'family_id',t.family_id,
    'citizen_id',t.citizen_id,
    'family_reference',f.family_reference,
    'citizen_name',c.full_name,
    'reason_code',r.code,
    'reason_label',r.label,
    'address_line',h.address_line,
    'address_number',h.address_number,
    'address_complement',h.address_complement,
    'neighborhood',h.neighborhood,
    'locality',h.locality,
    'postal_code',h.postal_code,
    'latitude',h.latitude,
    'longitude',h.longitude
  ) ORDER BY t.status,t.due_date,t.priority DESC),'[]'::jsonb) INTO v_tasks
  FROM public.census_agenda_tasks t
  LEFT JOIN public.census_households h ON h.id=t.household_id
  LEFT JOIN public.census_families f ON f.id=t.family_id
  LEFT JOIN public.census_citizens c ON c.id=t.citizen_id
  LEFT JOIN public.census_visit_reason_catalog r ON r.id=t.reason_id
  WHERE (
    t.professional_id=(v_professional->>'id')::uuid
    OR (t.professional_id IS NULL AND t.household_id IS NOT NULL AND public.census_user_can_access_household(t.household_id))
  )
  AND t.status IN ('PLANNED','IN_PROGRESS');

  RETURN jsonb_build_object(
    'status',CASE WHEN v_professional IS NULL THEN 'pending-assignment' ELSE 'ready' END,
    'professional',v_professional,
    'assignments',v_assignments,
    'tasks',v_tasks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.census_foundation_my_context() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.census_foundation_my_context() TO authenticated;

COMMIT;
