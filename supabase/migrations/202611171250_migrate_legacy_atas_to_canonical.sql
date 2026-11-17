BEGIN;

-- Preserva os saldos atuais do legado no modelo canônico sem apagar as tabelas antigas.
ALTER TABLE public.compras_processos_itens
  ADD COLUMN IF NOT EXISTS quantidade_consumida numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_quantidade numeric(15,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saldo_valor numeric(15,2) NOT NULL DEFAULT 0;

CREATE TEMP TABLE legacy_ata_process_map (
  ata_id integer PRIMARY KEY,
  processo_id uuid NOT NULL,
  contrato_id uuid NOT NULL,
  municipio_id uuid NOT NULL,
  unidade_id uuid NOT NULL,
  criado_por integer NOT NULL
) ON COMMIT DROP;

INSERT INTO legacy_ata_process_map(ata_id, processo_id, contrato_id, municipio_id, unidade_id, criado_por)
SELECT
  a.id,
  md5('inteligencia-municipal:legacy-ata-process:' || a.id::text)::uuid,
  md5('inteligencia-municipal:legacy-ata-contract:' || a.id::text)::uuid,
  a.municipio_id,
  COALESCE(
    (
      SELECT u.id
      FROM public.unidades_municipais u
      WHERE u.municipio_id = a.municipio_id
        AND u.ativo IS TRUE
        AND u.legacy_orgao_id = 6
      ORDER BY u.id
      LIMIT 1
    ),
    (
      SELECT u.id
      FROM public.unidades_municipais u
      WHERE u.municipio_id = a.municipio_id
        AND u.ativo IS TRUE
      ORDER BY u.id
      LIMIT 1
    )
  ),
  COALESCE((SELECT us.id FROM public.usuarios us WHERE us.id = 21 AND us.ativo IS TRUE LIMIT 1), (SELECT us.id FROM public.usuarios us WHERE us.ativo IS TRUE ORDER BY us.id LIMIT 1))
FROM public.atas a;

DO $check$
BEGIN
  IF EXISTS (SELECT 1 FROM legacy_ata_process_map WHERE unidade_id IS NULL) THEN
    RAISE EXCEPTION 'Migração interrompida: alguma ata não possui unidade municipal ativa';
  END IF;
  IF EXISTS (SELECT 1 FROM legacy_ata_process_map WHERE criado_por IS NULL) THEN
    RAISE EXCEPTION 'Migração interrompida: não existe usuário ativo para registrar os dados';
  END IF;
END;
$check$;

INSERT INTO public.compras_processos(
  id, municipio_id, unidade_id, numero_processo, ano, numero_edital, objeto, descricao,
  tipo_contratacao, modalidade, procedimento, valor_estimado, valor_homologado,
  status, ata_id, criado_por, data_abertura, data_homologacao, created_at, updated_at
)
SELECT
  m.processo_id,
  a.municipio_id,
  m.unidade_id,
  'LEG-ATA-' || a.id::text,
  COALESCE(EXTRACT(YEAR FROM a.data_assinatura)::integer, EXTRACT(YEAR FROM COALESCE(a.created_at, now()))::integer, EXTRACT(YEAR FROM now())::integer),
  COALESCE(NULLIF(btrim(a.numero_pregao), ''), NULLIF(btrim(a.pregao_numero), '')),
  COALESCE(NULLIF(btrim(a.objeto), ''), 'Ata de registro de preços ' || a.numero_ata),
  NULLIF(btrim(a.observacoes), ''),
  'REGISTRO_PRECOS',
  NULLIF(btrim(a.modalidade), ''),
  'MIGRACAO_LEGADO',
  GREATEST(COALESCE(a.valor_global, 0), 0),
  GREATEST(COALESCE(a.valor_global, 0), 0),
  'homologado',
  NULL,
  m.criado_por,
  a.data_assinatura,
  a.data_assinatura,
  COALESCE(a.created_at, now()) AT TIME ZONE 'UTC',
  COALESCE(a.updated_at, a.created_at, now()) AT TIME ZONE 'UTC'
FROM public.atas a
JOIN legacy_ata_process_map m ON m.ata_id = a.id
ON CONFLICT (id) DO UPDATE SET
  municipio_id = EXCLUDED.municipio_id,
  unidade_id = EXCLUDED.unidade_id,
  numero_processo = EXCLUDED.numero_processo,
  ano = EXCLUDED.ano,
  numero_edital = EXCLUDED.numero_edital,
  objeto = EXCLUDED.objeto,
  descricao = EXCLUDED.descricao,
  tipo_contratacao = EXCLUDED.tipo_contratacao,
  modalidade = EXCLUDED.modalidade,
  procedimento = EXCLUDED.procedimento,
  valor_estimado = EXCLUDED.valor_estimado,
  valor_homologado = EXCLUDED.valor_homologado,
  status = EXCLUDED.status,
  ata_id = EXCLUDED.ata_id,
  criado_por = EXCLUDED.criado_por,
  data_abertura = EXCLUDED.data_abertura,
  data_homologacao = EXCLUDED.data_homologacao,
  updated_at = now();

UPDATE public.atas a SET processo_compras_id = m.processo_id FROM legacy_ata_process_map m WHERE m.ata_id = a.id;
UPDATE public.compras_processos cp SET ata_id = m.ata_id, status = 'ata_gerada', updated_at = now() FROM legacy_ata_process_map m WHERE cp.id = m.processo_id;

INSERT INTO public.compras_contratos(
  id, municipio_id, processo_id, ata_id, fornecedor_id, numero, objeto,
  valor_inicial, valor_atual, vigencia_inicio, vigencia_fim, gestor_id, fiscal_id,
  situacao, created_by, created_at, updated_at
)
SELECT
  m.contrato_id,
  a.municipio_id,
  m.processo_id,
  a.id,
  a.fornecedor_id,
  a.numero_ata,
  COALESCE(NULLIF(btrim(a.objeto), ''), 'Ata de registro de preços ' || a.numero_ata),
  GREATEST(COALESCE(a.valor_global, 0), 0),
  GREATEST(COALESCE(a.valor_global, 0), 0),
  a.data_inicio_vigencia,
  a.data_fim_vigencia,
  a.gestor_id,
  a.fiscal_id,
  CASE a.situacao WHEN 'PROXIMA' THEN 'VIGENTE' WHEN 'VENCIDA' THEN 'ENCERRADA' ELSE COALESCE(a.situacao, 'ATIVA') END,
  m.criado_por,
  COALESCE(a.created_at, now()) AT TIME ZONE 'UTC',
  COALESCE(a.updated_at, a.created_at, now()) AT TIME ZONE 'UTC'
FROM public.atas a
JOIN legacy_ata_process_map m ON m.ata_id = a.id
WHERE a.fornecedor_id IS NOT NULL
ON CONFLICT (id) DO UPDATE SET
  municipio_id = EXCLUDED.municipio_id,
  processo_id = EXCLUDED.processo_id,
  ata_id = EXCLUDED.ata_id,
  fornecedor_id = EXCLUDED.fornecedor_id,
  numero = EXCLUDED.numero,
  objeto = EXCLUDED.objeto,
  valor_inicial = EXCLUDED.valor_inicial,
  valor_atual = EXCLUDED.valor_atual,
  vigencia_inicio = EXCLUDED.vigencia_inicio,
  vigencia_fim = EXCLUDED.vigencia_fim,
  gestor_id = EXCLUDED.gestor_id,
  fiscal_id = EXCLUDED.fiscal_id,
  situacao = EXCLUDED.situacao,
  updated_at = now();

INSERT INTO public.compras_processos_itens(
  id, municipio_id, processo_id, item_numero, codigo_catalogo, descricao,
  descricao_detalhada, especificacao_tecnica, unidade_medida, quantidade_solicitada,
  valor_unitario_estimado, quantidade_adjudicada, preco_unitario_adjudicado,
  categoria, lote_numero, status, item_ata_id, quantidade_consumida,
  saldo_quantidade, saldo_valor, created_at, updated_at
)
SELECT
  md5('inteligencia-municipal:legacy-ata-item:' || ia.id::text)::uuid,
  ia.municipio_id,
  m.processo_id,
  ia.item_numero,
  COALESCE(NULLIF(btrim(ia.codigo_catmat), ''), NULLIF(btrim(ia.codigo_material), ''), NULLIF(btrim(ia.codigo_siafem), '')),
  ia.descricao,
  ia.descricao_detalhada,
  ia.especificacao_tecnica,
  ia.unidade_medida,
  GREATEST(ia.quantidade_contratada, 0.000001),
  GREATEST(COALESCE(ia.valor_unitario, 0), 0),
  GREATEST(ia.quantidade_contratada, 0.000001),
  GREATEST(COALESCE(ia.valor_unitario, 0), 0),
  ia.categoria,
  ia.lote_numero,
  CASE WHEN COALESCE(ia.situacao, 'ATIVO') IN ('ATIVO','ATIVA','VIGENTE') THEN 'ATIVO' ELSE 'ENCERRADO' END,
  ia.id,
  GREATEST(COALESCE(ia.quantidade_contratada, 0) - COALESCE(ia.saldo_quantidade, 0), 0),
  GREATEST(COALESCE(ia.saldo_quantidade, 0), 0),
  GREATEST(COALESCE(ia.saldo_valor, 0), 0),
  COALESCE(ia.created_at, now()) AT TIME ZONE 'UTC',
  COALESCE(ia.updated_at, ia.created_at, now()) AT TIME ZONE 'UTC'
FROM public.itens_ata ia
JOIN legacy_ata_process_map m ON m.ata_id = ia.ata_id
ON CONFLICT (id) DO UPDATE SET
  municipio_id = EXCLUDED.municipio_id,
  processo_id = EXCLUDED.processo_id,
  item_numero = EXCLUDED.item_numero,
  codigo_catalogo = EXCLUDED.codigo_catalogo,
  descricao = EXCLUDED.descricao,
  descricao_detalhada = EXCLUDED.descricao_detalhada,
  especificacao_tecnica = EXCLUDED.especificacao_tecnica,
  unidade_medida = EXCLUDED.unidade_medida,
  quantidade_solicitada = EXCLUDED.quantidade_solicitada,
  valor_unitario_estimado = EXCLUDED.valor_unitario_estimado,
  quantidade_adjudicada = EXCLUDED.quantidade_adjudicada,
  preco_unitario_adjudicado = EXCLUDED.preco_unitario_adjudicado,
  categoria = EXCLUDED.categoria,
  lote_numero = EXCLUDED.lote_numero,
  status = EXCLUDED.status,
  item_ata_id = EXCLUDED.item_ata_id,
  quantidade_consumida = EXCLUDED.quantidade_consumida,
  saldo_quantidade = EXCLUDED.saldo_quantidade,
  saldo_valor = EXCLUDED.saldo_valor,
  updated_at = now();

-- A view passa a ler os itens canônicos. As reservas ainda são lidas do fluxo
-- operacional existente e relacionam-se pelo item_ata_id preservado.
CREATE OR REPLACE VIEW public.compras_vw_saldos_operacionais AS
SELECT
  cpi.municipio_id,
  cpi.item_ata_id,
  cp.ata_id,
  cpi.descricao,
  (cpi.quantidade_adjudicada::numeric(15,4)) AS quantidade_contratada,
  (cpi.saldo_quantidade::numeric(15,4)) AS saldo_quantidade,
  (cpi.saldo_valor::numeric(15,2)) AS saldo_valor,
  COALESCE(SUM(pr.quantidade) FILTER (WHERE pr.status = 'ATIVA'), 0::numeric) AS quantidade_reservada,
  cpi.saldo_quantidade - COALESCE(SUM(pr.quantidade) FILTER (WHERE pr.status = 'ATIVA'), 0::numeric) AS quantidade_utilizavel
FROM public.compras_processos_itens cpi
JOIN public.compras_processos cp ON cp.id = cpi.processo_id
LEFT JOIN public.pedidos_reservas pr ON pr.item_ata_id = cpi.item_ata_id AND pr.municipio_id = cpi.municipio_id
GROUP BY cpi.municipio_id, cpi.item_ata_id, cp.ata_id, cpi.descricao, cpi.quantidade_adjudicada, cpi.saldo_quantidade, cpi.saldo_valor;

COMMIT;
