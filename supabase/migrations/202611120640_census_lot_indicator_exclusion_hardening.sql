-- A tabela de auditoria é somente para uso interno das RPCs SECURITY DEFINER.
-- A política explícita de negação documenta e reforça que clientes não leem nem alteram o histórico.
DROP POLICY IF EXISTS census_lot_indicator_exclusion_history_deny_access
  ON public.census_lot_indicator_exclusion_history;
CREATE POLICY census_lot_indicator_exclusion_history_deny_access
  ON public.census_lot_indicator_exclusion_history
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- Índices para as FKs opcionais de auditoria, usados nas exclusões de usuário.
CREATE INDEX IF NOT EXISTS census_lot_indicator_exclusions_excluded_by_idx
  ON public.census_lot_indicator_exclusions (excluded_by);
CREATE INDEX IF NOT EXISTS census_lot_indicator_exclusion_history_changed_by_idx
  ON public.census_lot_indicator_exclusion_history (changed_by);
