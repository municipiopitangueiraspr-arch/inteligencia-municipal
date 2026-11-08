# Postos credenciados e primeiro acesso — referência funcional

**Fonte:** Google Docs compartilhado pelo usuário, “MÓDULO DE GESTÃO DE FROTAS - v2.0.docx” — https://docs.google.com/document/d/10MoNvj5-AYzVNKwzy9BOqXApyZSQPJG5/edit?usp=sharing&ouid=116818890489337337294&rtpof=true&sd=true

**Trechos usados:** princípios de acesso e rastreabilidade (2.1); perfis Administrador de Posto Credenciado e Atendente de Posto Credenciado (2.2.7–2.2.8); acumulação de perfis (2.3); gestão de usuários e vínculo a estabelecimento (3.4.1–3.4.3); critérios v2.0 de postos, submissão e isolamento (10.2–10.3 e 10.11–10.12).

## Requisitos cobertos

- Cada pessoa usa conta individual; senha é gerida pelo provedor de autenticação, não armazenada no perfil.
- O estabelecimento mantém representante legal como contato principal. A gestão de usuários secundários do próprio posto depende de autorização municipal expressa.
- O representante/administrador só administra usuários do seu estabelecimento; cada usuário do posto fica vinculado a um único posto ativo.
- Papéis secundários correspondem às funções previstas: operador, frentista e caixa/conferente. A submissão do posto permanece distinta da validação oficial municipal.
- Dados e operações de outros postos permanecem fora do escopo do usuário do posto. Suspensão ou fim de vigência bloqueia novas operações, preservando consulta ao histórico autorizado.
- A Prefeitura gerencia dados cadastrais, vigência, situação, autorização de usuários secundários e vínculos, com histórico auditável.
- A aprovação do primeiro acesso valida identidade/e-mail autenticados, CNPJ válido e correspondência única com o cadastro, e não ativa por si só um posto que ainda aguarda decisão municipal.

## Mapeamento técnico

- `REPRESENTANTE_LEGAL` implementa o representante legal/administrador principal e contato principal; `OPERADOR`, `FRENTISTA` e `CAIXA_CONFERENTE` são papéis secundários.
- O primeiro acesso usa conta Auth individual e confirmação de e-mail. A decisão municipal é server-side e fica auditada; nenhuma senha é recebida ou escrita em tabelas de perfil.
- `fleet_station_members` mantém o vínculo exclusivo ao posto e o guard server-side limita a administração de usuários secundários ao representante principal, com autorização municipal, situação ATIVO e vigência corrente.
- O contexto do posto permite consulta histórica quando a operação está bloqueada; a interface e a API impedem novas submissões fora do status/vigência.
- Os sete CNPJs encontrados no conjunto fictício foram inválidos. A migração substitui apenas esses identificadores por CNPJs sintéticos alfanuméricos válidos, registra as mudanças na auditoria e mantém os pedidos aprovados relacionados coerentes; não cria usuários ou documentos fiscais.

## Limite explícito da especificação

A versão consultada descreve perfis, vínculo, autenticação individual e responsabilidades, mas não prescreve uma tela/protocolo público específico chamado “Solicitação de Primeiro Acesso”, nem o provedor de e-mail de convite. O fluxo autenticado, confirmação de e-mail e aprovação municipal é a implementação adotada para cumprir os requisitos sem permitir aprovação automática ou credenciais compartilhadas.
