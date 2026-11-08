# Relatórios de abastecimentos e postos — mapeamento v2.0

**Fonte funcional:** Documento de Apoio v2.0, Google Docs fornecido pelo usuário: https://docs.google.com/document/d/10MoNvj5-AYzVNKwzy9BOqXApyZSQPJG5/edit

**Delimitação do trabalho:** conforme orientação do usuário, esta entrega cobre somente relatórios de abastecimentos e postos credenciados. Relatórios de manutenção, multas, seguros, movimentações de veículos e demais despesas permanecem fora deste escopo.

## Critérios funcionais e implementação

| Documento v2.0 | Implementação nesta tela |
| --- | --- |
| § 6.15.6 — anomalias são instrumentos de análise, não prova automática de irregularidade | Alertas aparecem como sinalizadores para análise; a tela/exportação informa explicitamente que não concluem irregularidade. |
| §§ 6.16–6.16.2 — situação por posto, competência, valores registrados/fiscais, divergências, situação e pendências documentais | Seções de fechamentos, pendências e divergências por posto, segundo dados autorizados no overview. A tela informa que fechamentos/divergências usam competência e posto e não herdam filtros individuais de veículo, motorista, secretaria, combustível, situação e comprovante. |
| § 6.17 — abastecimentos recentes com data/hora da operação e lançamento, veículo, placa, motorista, posto, combustível, quantidade, valor, situação; 10/20/50 e opção de consultar todos | Seletor 10/20/50; data da operação e data de lançamento; marcação de lançamento posterior; tabela separada de detalhe paginado de todos os resultados filtrados (50 por página) com navegação. |
| § 6.18 — gastos por secretaria, veículo, motorista, estabelecimento e combustível; consumo por período; evolução mensal; comparativo anual; preço médio por estabelecimento; alertas/documentos; fechamentos e divergências | Agregados por todas as dimensões acima, série mensal, comparativos do exercício/período anterior, preço médio ponderado por posto, alertas/documentos e dados de fechamento disponíveis segundo escopo. Itens fora do pedido (movimentações e consumo médio efetivo sem metodologia válida) não são estimados. |
| § 6.18.1 — PDF, Excel (.xlsx), CSV | Exportação nos três formatos. Valores do Excel são numéricos quando representam quantidade/valor; planilhas e CSV recebem proteção contra injeção de fórmulas em textos. |
| § 6.18.2 — município, relatório, período, filtros, data/hora, usuário, indicadores e detalhamentos | Metadados incluídos em todas as exportações. A exportação de detalhe informa a página exportada; totais agregados permanecem integrais ao escopo autorizado. |
| § 6.18.3 — mesma regra de cálculo e valores da consulta correspondente | Overview, primeira página de detalhe e instante de geração são produzidos pela mesma RPC; navegação das páginas seguintes usa o RPC paginado existente, com mesmos parâmetros de filtros e autorização. Rankings mostram os até 12 maiores por dimensão conforme o Dashboard; os totais não são truncados. |
| § 6.19 — atualização após novos abastecimentos, correções, cancelamentos, conferência | Consultas são executadas sob demanda no Supabase. Rascunhos/cancelamentos não compõem totais ativos; histórico elegível permanece consultável. Há atualização explícita na tela. |
| §§ 10.21–10.22 — exportação protegida, interface responsiva | Todos os formatos respeitam o escopo decidido no backend; a tela usa tabelas com rolagem horizontal e controles responsivos. |
| §§ 10.23.2–10.23.5 — perfis de gestão, fiscalização, secretaria e prefeito | Gerente/admin municipal e perfis municipais de consulta veem a tela conforme a autorização central; gestor de secretaria recebe apenas vínculos permitidos. O usuário de posto não recebe acesso ao consolidado municipal. |

## Backend e segurança

A migration `docs/migrations/20261108_fuel_reports_v2.sql` cria `public.fleet_fuel_report`, uma RPC `SECURITY DEFINER` com `search_path` fixado. Ela valida autenticação, usa `fleet_dashboard_access()` para determinar município, perfil e unidades, e chama `fleet_dashboard_overview()` e `fleet_dashboard_detail()` com os filtros selecionados. A função enriquece somente as opções já permitidas pelo overview; combustíveis inativos e postos suspensos/inativos/encerrados são rotulados como inativos ou históricos, sem apagar a possibilidade de consultar o histórico.

A execução é revogada de `PUBLIC` e `anon` e concedida somente a `authenticated`. A RPC de detalhe existente mantém autorização e escopo próprios; esconder itens na navegação não é considerado controle de segurança. Usuários dos postos não recebem permissão no relatório municipal.

## Critérios e ressalvas explícitos

- A competência do abastecimento usa `performed_at` (data/hora da ocorrência), exibida no fuso `America/Sao_Paulo`; `submitted_at` aparece separadamente como data/hora do lançamento.
- Preço médio ponderado = valor registrado ÷ litros. A soma de litros abastecidos não é apresentada como consumo efetivo do veículo.
- O ranking do overview é limitado aos 12 maiores por dimensão. O detalhe é navegável em páginas de 50 até o limite seguro de 100.050 registros; acima disso, a tela avisa para refinar filtros. A exportação inclui a página detalhada atualmente aberta e identifica esse limite.
- O detalhe mantém o limite máximo de deslocamento definido na RPC paginada; filtros de período e dimensões reduzem o universo antes da paginação.
- Fechamentos e divergências fiscais são tratados separadamente dos filtros de abastecimento (competência e posto); essa ressalva aparece na tela e nas exportações. Para perfil de secretaria, fechamentos fiscais não são disponibilizados.
- A versão v2.0 descreve relatórios como etapa posterior à estabilização operacional (seção de implementação, item “Relatórios como etapa posterior”). Esta implementação ocorre agora a pedido explícito do usuário, depois das telas operacionais de abastecimento, fechamento e postos já trabalhadas nesta sessão.
