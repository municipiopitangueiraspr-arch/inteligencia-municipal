# Dashboard Gerencial — aderência à especificação v2.0

**Referência funcional:** documento de apoio v2.0 informado pelo usuário, em especial §§ 1.4.5, 6.5–6.16, 6.19–6.23 e 6.25–6.26. O escopo futuro de manutenção e demais despesas do § 6.24 não é apresentado como funcionalidade já disponível.

## Implementação

- O PostgreSQL/Supabase calcula os indicadores e aplica filtros de competência, secretaria responsável/beneficiária, veículo, motorista, posto, combustível, situação do abastecimento e situação do comprovante. Não há agregação local sobre uma amostra parcial.
- O período inicial é de 12 competências, no fuso `America/Sao_Paulo`. As RPCs rejeitam períodos acima de 120 meses e competências futuras. O dia e o mês corrente são calculados pelo horário de Brasília.
- O painel distingue valor registrado e conferido, litros abastecidos, média ponderada registrada por litro, gasto médio por abastecimento, gasto do dia, do mês e do exercício, comparação com período equivalente anterior e comparação anual por mesmas competências.
- Há evolução mensal clicável, rankings Top 12 por secretaria/unidade, beneficiária, veículo, motorista, posto e combustível, detalhamento paginado (50 por vez, máximo 100 por chamada), abastecimentos recentes configuráveis (10/20/50), alertas/inconsistências, CNHs, situação cadastral da frota, autorizações aprovadas e conciliação dos fechamentos.
- CSV, Excel e PDF apresentam o perfil/escopo, filtros, indicadores e conjuntos relevantes de dados, com limites amostrais e ressalvas metodológicas identificados.

## Acesso e segurança

- `GESTOR_FROTAS` e `ADMINISTRADOR` podem acessar as funções administrativas previstas no módulo.
- `PREFEITO` pode consultar a visão municipal e o fechamento, sem acessar operações de edição por meio do painel.
- `FISCAL_FROTAS` tem leitura do dashboard no escopo municipal.
- `GESTOR_SECRETARIA` tem leitura limitada às unidades com vínculo organizacional vigente; esse limite é recalculado nas RPCs e filtros incompatíveis são rejeitados no servidor.
- As funções são `SECURITY DEFINER` com `search_path` fixo, autorizam a sessão/município dentro do banco e têm execução revogada de `PUBLIC`/`anon`, concedida somente a `authenticated`.

## Regras de apresentação e ressalvas

- Abastecimentos cancelados, com `canceled_at` preenchido ou em rascunho não entram nos totais. Não se inventa um estado de estorno que não existe no modelo atual.
- Os litros representam volume abastecido. Consumo médio efetivo não é calculado sem uma série validada de hodômetros e definição metodológica.
- Valores fiscais são exibidos por posto/competência, separados do valor operacional, sem dupla contagem. Relatórios identificam que filtros de abastecimento não se aplicam a todos os conjuntos (fechamentos, CNH e movimentações).
- O Top 12 é uma apresentação por dimensão; alertas retornam até 60 itens e os recentes seguem o seletor. Totais e cartões são integrais ao escopo autorizado; detalhes usam paginação.
- A variação percentual é descritiva e não classifica irregularidade por si só.

## Validação

A migration `docs/migrations/20261108_dashboard_v2_alignment.sql` foi analisada com parser PostgreSQL; o frontend foi submetido ao build de produção e lint. O rollout remoto deve ser feito junto com o deploy do frontend para manter o contrato das RPCs e os novos campos do resumo alinhados.
