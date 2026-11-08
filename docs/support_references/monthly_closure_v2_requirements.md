# Fechamento Mensal — referência funcional

**Fonte:** Google Docs compartilhado pelo usuário, “MÓDULO DE GESTÃO DE FROTAS - v2.0.docx” — https://docs.google.com/document/d/10MoNvj5-AYzVNKwzy9BOqXApyZSQPJG5/edit?usp=sharing&ouid=116818890489337337294&rtpof=true&sd=true

**Trechos lidos:** Capítulo 5, “Fechamento Mensal, Conferência de Abastecimentos e Controle Documental” (itens 5.1–5.26); regras operacionais complementares da versão 2.0 (itens 9–12). A versão 2.0 prevalece para o fluxo inicial de conferência e fechamento.

## Requisitos centrais usados nesta entrega

- O fechamento deve ser individualizável por posto/estabelecimento e competência, mantendo visão consolidada municipal.
- A competência é derivada de `performed_at` (data efetiva) no fuso civil de Pitangueiras, não de `submitted_at`.
- Abastecimentos cancelados não compõem o total líquido; totais de litros, combustível e valor são recalculados no backend e rastreáveis até os registros de origem.
- A nota fiscal mensal/documentos fiscais são distintos dos comprovantes individuais de abastecimento. Devem ter metadados estruturados, aceitar múltiplos documentos e permanecer em armazenamento privado.
- O total fiscal deve ser comparado com a soma dos abastecimentos; a diferença deve ser apresentada e tratada como divergência, sem tolerância financeira implícita.
- Conferência individual e conferência global do posto são etapas separadas. Pendências e divergências não podem ser apagadas para concluir o fechamento.
- A versão 2.0 define os estados administrativos do fluxo como `ABERTO`, `EM_CONFERENCIA`, `COM_DIVERGENCIA`, `CONFERIDO`, `FECHADO` e `REABERTO`.
- Somente Gestor de Frotas/Administrador podem conferir oficialmente, fechar, reabrir ou registrar divergência oficial; a consulta gerencial do Prefeito não concede alteração.
- Reabertura exige justificativa, preserva a composição anterior e cria histórico/versão comparável. Não há liquidação nem pagamento automático.
- RLS e RPCs do backend são obrigatórios; ocultar controles na interface não substitui autorização no banco.
- Relatórios/exportações avançadas são etapa posterior expressamente prevista na versão 2.0; não são requisito para liberar o núcleo operacional nesta fase.

## Mapeamento técnico desta implementação

- A linha municipal de `fleet_monthly_closures` funciona como agrupador de competência; cada `fleet_monthly_closure_station_checks` passa a ser o fechamento operacional do posto dentro daquele agrupador.
- `fleet_monthly_closure_transactions` fixa a composição e impede dupla inclusão do mesmo abastecimento.
- `fleet_monthly_closure_documents` guarda notas fiscais/documentos fiscais por posto, com metadados e referência a objeto privado.
- `fleet_monthly_closure_discrepancies`, `fleet_monthly_closure_messages`, `fleet_monthly_closure_reviews`, `fleet_monthly_closure_history` e `fleet_monthly_closure_versions` preservam tratativas, decisões, auditoria e snapshots.
- O único registro fictício existente é mantido e adaptado ao novo fluxo por checks por posto e composição rastreável; não é excluído nem marcado como legado.
