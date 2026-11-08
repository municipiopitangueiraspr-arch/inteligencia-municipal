-- 3.7.2 do documento funcional: situação explícita para credenciamento encerrado.
-- Migration isolada porque o novo valor enum só pode ser usado após seu commit.
ALTER TYPE public.fleet_station_status
  ADD VALUE IF NOT EXISTS 'CREDENCIAMENTO_ENCERRADO';
