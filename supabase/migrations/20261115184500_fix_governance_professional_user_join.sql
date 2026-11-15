BEGIN;

-- health_professionals.user_id é FK integer para usuarios.id; auth.uid() é UUID.
-- Resolve a identidade pela chave pública UUID do diretório, sem comparar tipos distintos.
DO $$
DECLARE
  v_definition text;
  v_old text := 'FROM public.health_professionals acs JOIN public.health_professional_assignments assignment ON assignment.professional_id=acs.id WHERE acs.user_id=auth.uid()';
  v_new text := 'FROM public.health_professionals acs JOIN public.usuarios u ON u.id=acs.user_id JOIN public.health_professional_assignments assignment ON assignment.professional_id=acs.id WHERE u.uuid=auth.uid() AND u.ativo IS TRUE';
BEGIN
  v_definition := pg_get_functiondef('public.municipal_governance_get_my_context()'::regprocedure);
  IF position(v_old IN v_definition) = 0 THEN
    RAISE EXCEPTION 'A consulta ACS do contexto de Governança mudou; revisão manual necessária.';
  END IF;
  v_definition := replace(v_definition, v_old, v_new);
  EXECUTE v_definition;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;
