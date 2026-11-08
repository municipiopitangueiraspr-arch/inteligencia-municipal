-- O RPC de fechamento é disponível apenas a sessões autenticadas; a própria função
-- também valida Gestor de Frotas e município antes de alterar qualquer dado.
REVOKE ALL ON FUNCTION public.fleet_close_month(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fleet_close_month(uuid) TO authenticated;
