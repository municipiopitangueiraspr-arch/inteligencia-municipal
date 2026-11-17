-- Fundação do módulo transversal de Atas, Saldos e Pedidos.
-- Não utiliza nem reativa tabelas legadas da intranet.
UPDATE public.municipal_modules
SET label = 'Atas, Saldos e Pedidos',
    description = 'Gestão transversal de atas, saldos, demandas, pedidos e entregas.',
    icon_name = 'Package',
    is_ready = true,
    status_label = 'Disponível',
    updated_at = now()
WHERE id = 'compras';
