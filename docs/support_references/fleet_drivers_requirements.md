# Referência funcional — Motoristas e condutores

**Fonte:** [Documento de Apoio — Módulo de Gestão de Frotas](https://docs.google.com/document/d/10MoNvj5-AYzVNKwzy9BOqXApyZSQPJG5/edit?usp=sharing&ouid=116818890489337337294&rtpof=true&sd=true)
**Seções consultadas:** 3.5–3.5.3 e 9.8–9.8.1
**Consulta:** 8 de novembro de 2026, via Google Workspace Docs API.

## Requisitos da seção 3.5

O sistema deve manter cadastro centralizado de motoristas e condutores autorizados, independente das contas de usuários da aplicação, usado especialmente para identificar quem conduzia o veículo no abastecimento. Dados pessoais e documentos devem ser coletados apenas na medida necessária à finalidade administrativa e operacional, observando a LGPD.

A interface deve listar e pesquisar motoristas por nome, CPF ou matrícula; filtrar por situação; visualizar e editar o cadastro; permitir cadastro, ativação e inativação; consultar a validade da CNH e o histórico de autorizações e vínculos com veículos. O formulário organiza identificação pessoal (nome, CPF, matrícula/identificação funcional), contato (telefone), habilitação (número, categoria e validade da CNH) e situação (ativo/inativo).

Regras de negócio: cada motorista tem identificação única; CPF, quando usado, deve ser validado e não se duplica entre cadastros ativos; um motorista pode ser autorizado a vários veículos e um veículo pode ter vários motoristas. A autorização é um vínculo próprio com veículo, motorista, início/fim, situação, responsável pela concessão e justificativa. Motoristas inativos não podem ser selecionados em novos abastecimentos, salvo exceção formalmente autorizada. Alertas podem sinalizar CNH vencida ou próxima do vencimento. Inativação e alteração cadastral não apagam nem alteram os abastecimentos históricos, e a autorização deve ser validada na data efetiva da operação.

## Requisitos relevantes da seção 9.8

A designação do condutor deve usar o cadastro central. Antes da liberação da viagem, verificar cadastro ativo, CNH cadastrada, categoria compatível com o veículo, validade na data efetiva e restrições/disponibilidade. Uma indicação não concede automaticamente autorização. Substituições, quando implementadas, preservam o condutor anterior, novo condutor, data/hora, responsável e motivo.

## Aplicação nesta implementação

A implementação usa RPCs municipais para pesquisa paginada com CPF/CNH mascarados, leitura de detalhes autorizada, gravação auditada e validação de categoria/validade/autorização no instante efetivo. A tabela base restringe leitura de colunas pessoais; os snapshots de abastecimento preservam nome e matrícula na operação. As regras de escala/indisponibilidade de viagens pertencem ao fluxo de viagens, não ao escopo atual de abastecimento.
