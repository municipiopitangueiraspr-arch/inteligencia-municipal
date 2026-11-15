# Base de desenvolvimento — ACS, ACE, eSF e módulos assistenciais

## Fonte e decisão de uso

Esta síntese foi elaborada a partir do arquivo `ACS - ACE - MEDICOS.pdf`, versão 6.0, de 15 de novembro de 2026, fornecido pelo município via Google Drive. O documento é a referência funcional e arquitetural para as próximas evoluções da Plataforma Transversal Municipal.

A plataforma deve primeiro coletar, validar, versionar e auditar os registros de origem. A conversão para LEDI/e-SUS APS, PEC, SISAB, SINAN ou outros sistemas oficiais será uma camada posterior, após validação municipal da interface, do banco, das regras e dos fluxos.

## Princípios que passam a orientar o produto

1. **Registro de origem antes de indicador.** Totais e painéis são derivados de registros estruturados; não substituem FCI, FCD, FVD, MIAI, fichas de vigilância ou registros assistenciais.
2. **Estados não podem ser confundidos.** Planejado, iniciado, rascunho, concluído, validado localmente, sincronizado, pronto para exportação, exportado, aceito e processado são estados diferentes.
3. **Identidade territorial é transversal.** Município, estabelecimento, equipe, profissional, microárea, domicílio, família e cidadão devem manter vínculos vigentes, versionados e auditáveis.
4. **Códigos controlados e regras condicionais.** Motivos, desfechos, tipos de imóvel, agravos, procedimentos, medicamentos e demais domínios devem usar catálogos versionados. Texto livre é complemento, nunca substituto do código obrigatório.
5. **Histórico é preservado.** Correção, atualização, retificação, devolução, estorno ou reenvio não apagam o registro original; devem guardar valor anterior, valor novo, autor, data, justificativa e versão.
6. **Mínimo privilégio.** ACS, ACE, médico, supervisor, regulador, farmácia, vigilância e gestor recebem somente os dados necessários à finalidade e ao seu perfil.
7. **Indicador local não é indicador oficial.** Todo painel deve informar fonte, período, regra, versão, atualização e estado de processamento. Salvo no Supabase, aceito pelo PEC e processado no SISAB/SINAN não são sinônimos.
8. **Offline e idempotência são requisitos de domínio.** Coleta móvel deve funcionar sem conexão; cada registro exportável deve possuir UUID estável e reenvio do mesmo UUID nunca pode criar duplicidade.
9. **Saúde sensível exige proteção reforçada.** RLS por município/unidade/equipe/finalidade, buckets privados, URLs temporárias, logs de acesso, retenção definida e nenhuma credencial privilegiada no frontend público.
10. **O papel profissional não deve ser ampliado pela interface.** ACS não diagnostica nem prescreve; ACE registra risco ambiental e controle de vetores; alertas apoiam o trabalho, mas não criam diagnóstico, consulta ou visita automaticamente.

## Núcleo transversal de dados

A fundação deve contemplar:

- Município, estabelecimento, equipe/INE, microárea, profissionais, supervisores e períodos de vínculo.
- Domicílio/imóvel, endereço, geolocalização opcional, histórico e situação.
- Família, responsável, membros, mudança de território e situação cadastral.
- Cidadão, identificação, dados sociodemográficos, condições autorreferidas, vínculos e histórico.
- Agenda/tarefa, prioridade, prazo, responsável, origem e situação.
- Dispositivo, fila de sincronização, tentativas, payload original, payload normalizado e retornos de integração.
- Auditoria transversal de criação, leitura sensível, alteração, exportação, compartilhamento, correção e encerramento.
- Catálogos e tabelas oficiais com código, descrição, versão, vigência e origem normativa.

Toda entidade operacional deve considerar `id`, UUID interoperável quando aplicável, município/tenant, `created_at/created_by`, `updated_at/updated_by`, exclusão lógica quando necessária, fonte, versão do esquema e status.

## Módulo ACS

O ACS trabalha principalmente com pessoas, famílias, domicílios e vulnerabilidades. O escopo inicial deve cobrir território, família, cidadão, visita e sincronização.

A visita deve separar claramente:

- **Planejada:** tarefa criada para pessoa, família, domicílio ou microárea.
- **Iniciada:** atendimento aberto pelo ACS.
- **Concluída:** evento com data, profissional, desfecho e dados mínimos válidos.

A FVD deve registrar cabeçalho profissional/territorial, pessoa ou local visitado, múltiplos motivos codificados, desfecho codificado, acompanhamentos, medidas condicionais, orientação, retorno e encaminhamento. Motivos incompatíveis com ausência/recusa ou com o tipo de imóvel devem ser bloqueados. Desfechos diferentes de “realizada” exigem justificativa estruturada.

Motivos relevantes incluem cadastro/atualização, visita periódica, gestação/puerpério/lactação, criança/adolescente/idoso, hipertensão/diabetes, sofrimento psíquico, uso de álcool/tabaco/outras drogas, busca ativa, risco familiar, vulnerabilidade social, vacinação, orientação, atividade coletiva, queixa/sinal/sintoma e situação ambiental/vetorial quando aplicável.

O cadastro individual deve permitir identificação provisória, validação de CNS/CPF/data de nascimento quando houver integração autorizada e rotulagem explícita de dado informado pelo cidadão versus observado/relatado na visita. Nunca inventar identificadores.

## Atendimento médico e linhas de cuidado eSF

O atendimento médico é um Atendimento Individual longitudinal, não uma simples agenda. Deve ficar vinculado a cidadão, profissional, equipe, estabelecimento, território, condição e episódio de cuidado. Não deve ser fundido com a FVD do ACS.

Deve distinguir planejado, iniciado, concluído e processado; registrar local, modalidade, demanda programada/espontânea, profissional, cidadão, condição avaliada, CID/CIAP quando aplicável, sinais vitais, exames, procedimentos, conduta, encaminhamento, retorno e auditoria.

As linhas prioritárias são:

- Gestação e puerpério.
- Criança e desenvolvimento infantil.
- Diabetes.
- Hipertensão.
- Pessoa idosa.
- Saúde da mulher.

As oportunidades de cuidado devem ser versionadas por regra e período, com origem, cidadão, responsável, prioridade e situação (`aberta`, `em atendimento`, `resolvida`, `não aplicável`, `recusada`, `vencida`, `revisada`). O painel deve distinguir coletado, validado pela plataforma, aceito pelo PEC e processado no SISAB.

## Módulo ACE

O ACE é uma aplicação de Vigilância Ambiental e Controle de Endemias, não uma cópia do ACS. O núcleo é o imóvel e o risco ambiental, incluindo domicílios e imóveis não domiciliares: comércio, escola, terreno baldio, ponto estratégico, abrigo, oficina, ferro-velho, borracharia e outros tipos municipais.

O módulo deve oferecer cadastro versionado de imóveis, ciclos, roteiros, tarefas, inspeções, ambientes, recipientes, achados, intervenções, produtos, lotes, aplicações, amostras, cadeia de custódia, ocorrências, bloqueios e ações integradas.

A inspeção deve registrar acesso, ambientes, recipientes, vetor/reservatório, risco, orientação, ação e desfecho codificado. Controle químico/biológico exige produto, princípio ativo, concentração, lote, validade, quantidade, unidade, aplicador e segurança. O sistema deve impedir produto vencido ou sem rastreabilidade.

ACS e ACE compartilham território, agenda, encaminhamentos e ocorrências relacionadas, mas não formulários nem acesso amplo ao prontuário ou aos produtos de controle.

## Regulação e atenção especializada

O fluxo comum é: identificação de necessidade → avaliação → solicitação/encaminhamento → prioridade/regulação → fila/autorização → vaga/agendamento → confirmação → execução → resultado/evolução → contrarreferência → retorno e encerramento.

O núcleo deve separar solicitação, regulação, fila, oferta de vaga, agendamento, execução, resultado, episódio especializado e retorno à APS. Solicitações devolvidas ou negadas permanecem no histórico.

Especialidades iniciais: consultas, exames, fisioterapia/reabilitação, odontologia, psicologia, neurologia, dermatologia, nutrição, fonoaudiologia e terapia ocupacional quando habilitadas. Dados clínicos sensíveis, especialmente psicologia e imagens dermatológicas, ficam restritos e privados.

## Assistência farmacêutica

Separar explicitamente: catálogo, estoque, prescrição/solicitação e dispensação. Prescrição não é entrega; reserva não é retirada; baixa de estoque não ocorre antes da confirmação, salvo fluxo emergencial auditado.

Controlar itens, protocolos, unidades, lotes, validade, saldo, reservas, movimentos, FEFO, dispensação integral/parcial, devolução, estorno, perdas, itens controlados e acompanhamento de retirada. O ACS recebe apenas tarefas autorizadas sobre acesso ou dificuldade de retirada, nunca o prontuário farmacêutico completo.

## Vigilância epidemiológica e SINAN

O módulo é a camada operacional de suspeita, notificação, investigação, laboratório, controle, contatos, surtos, encerramento e transmissão. Um registro salvo no Supabase não deve ser apresentado como enviado ou aceito pelo SINAN.

Separar suspeita, notificação, investigação, laboratório, medida de controle, acompanhamento, encerramento, retificação/cancelamento e transmissão/retorno. Agravos, fichas, campos, prazos, destinatários, duplicidade e regras devem ser versionados; não podem ficar fixos no frontend.

Notificações imediatas exigem prazo, destinatário, responsável e confirmação. Pushes e alertas não devem expor diagnóstico ou nome completo. Casos individuais permanecem ligados a episódios de surto sem serem substituídos por agregados.

## Ordem de implementação adotada como referência

1. Fundação: autenticação, município, unidade, equipe, profissionais, microáreas, perfis, RLS, auditoria e catálogos versionados.
2. Território: domicílio, endereço, família, membros e histórico.
3. Cidadão: identificação, sociodemografia, condições autorreferidas, vínculos e histórico.
4. ACS: agenda, visita offline, motivos, desfechos, acompanhamentos, encaminhamento e revisão.
5. Atendimento médico: atendimento individual, local, modalidade, demanda, condições, medidas, exames, condutas e retorno.
6. Linhas de cuidado e painel de oportunidades.
7. Qualidade: validações, sincronização, idempotência, pendências e testes anonimizados.
8. Exportação e homologação PEC/LEDI.
9. Regulação e atenção especializada.
10. Assistência farmacêutica.
11. Vigilância epidemiológica/SINAN.
12. Vigilância Sanitária e demais módulos reutilizando a fundação, sem misturar modelos de informação.

## Regras de produto para a implementação atual

- Manter Gestor/Prefeito em acompanhamento somente leitura quando a tarefa não exigir ação operacional.
- Usar linguagem operacional e contextual: o que ocorreu, onde, com quem, qual etapa, qual pendência e próximo passo.
- Não exibir “cobertura”, “produção”, “aceito pelo SISAB” ou “indicador oficial” sem explicar fonte e estado.
- Construir filtros e drill-downs a partir dos registros que originaram a contagem, com a mesma unidade de medida.
- Não criar tabelas ou fluxos específicos por profissão quando o processo puder ser parametrizado por especialidade, finalidade e perfil.
- Manter o banco operacional separado de integração, auditoria e indicadores derivados.

Este documento é uma síntese de produto e arquitetura. Antes da exportação oficial ou de qualquer afirmação de conformidade, a versão do LEDI/PEC/SISAB/SINAN, a legislação aplicável e os fluxos municipais devem ser confirmados com a equipe responsável.
