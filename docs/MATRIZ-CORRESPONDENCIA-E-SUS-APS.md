# Matriz de correspondência — ACS × e-SUS APS

**Versão da matriz:** 1.0.0  
**Data:** 2026-11-15  
**Escopo:** módulo ACS, Cadastro Individual, Cadastro Domiciliar e Territorial e Visita Domiciliar e Territorial.  
**Estado:** preparação para a etapa futura de exportação; não representa homologação, transmissão ou aceitação pelo PEC/SISAB.

## Como ler a matriz

A coluna **Código oficial** só é preenchida quando o código, identificador ou campo foi confirmado em documentação oficial disponível. Quando aparece **A CONFIRMAR**, o sistema deve manter o valor municipal versionado e não deve tratá-lo como código e-SUS. A confirmação final deve ser feita contra o leiaute vigente do e-SUS APS/PEC/LEDI ou contra a interface oficial de integração escolhida pelo município.

Os estados usados são:

- **COBERTO:** existe campo estruturado e o fluxo atual já permite coletá-lo.
- **PARCIAL:** há campo ou fluxo relacionado, mas faltam atributos, validações ou vínculo oficial.
- **A IMPLEMENTAR:** ainda não existe estrutura ou tela suficiente.
- **A VALIDAR:** existe estrutura municipal, mas o mapeamento oficial ainda precisa ser confirmado.

## 1. Identidade e contexto institucional

| Estado | Campo de origem atual | Código oficial | Obrigatoriedade | Regra condicional | Transformação necessária | Destino da exportação |
|---|---|---|---|---|---|---|
| COBERTO | `municipalities.code`, `municipalities.name`, `state_code` | A CONFIRMAR no leiaute de identificação do município | Obrigatório no lote/registro | Deve corresponder ao município responsável pelo estabelecimento/equipe | Normalizar código municipal e UF conforme leiaute vigente | Cabeçalho/contexto do registro |
| COBERTO | `health_establishments.cnes`, `name` | CNES / campo oficial a confirmar | Obrigatório quando exigido pelo estabelecimento | Estabelecimento deve estar ativo e pertencer ao município | Validar formato CNES e vínculo municipal | Identificação da unidade |
| COBERTO | `health_teams.ine`, `name` | INE / campo oficial a confirmar | Obrigatório quando o registro for de equipe | Equipe deve pertencer ao estabelecimento e município | Validar INE, vigência e tipo de equipe | Identificação da equipe |
| COBERTO | `health_microareas.code`, `name` | Código de microárea oficial a confirmar | Condicional ao vínculo territorial | Deve estar vigente para a equipe na data do evento | Converter código municipal para o domínio aceito pelo destino | Território/microárea |
| PARCIAL | `health_professionals.cns`, `cbo`, `professional_category` | CNS e CBO oficiais; campo exato a confirmar | Obrigatório conforme profissional e modelo | ACS/ACE podem registrar MIVDT; outros profissionais não devem usar MIVDT | Validar CNS, CBO, categoria e vínculo na data | Profissional responsável |
| COBERTO | `health_professional_assignments.valid_from`, `valid_until`, `active` | A CONFIRMAR | Obrigatório para auditoria; pode não ser exportado | Evento deve usar vínculo vigente na data da coleta | Resolver o vínculo vigente e gravar snapshot no evento | Auditoria/contexto |

## 2. Domicílio e cadastro domiciliar/territorial

| Estado | Campo de origem atual | Código oficial | Obrigatoriedade | Regra condicional | Transformação necessária | Destino da exportação |
|---|---|---|---|---|---|---|
| COBERTO | `census_households.id`, `lot_id`, `label` | Identificador local; código e-SUS a confirmar | Obrigatório internamente | UUID deve permanecer estável para reenvio | Gerar identificador externo sem substituir o UUID local | Identificador do domicílio |
| COBERTO | `address_line`, `address_number`, `address_complement`, `neighborhood`, `postal_code`, `locality` | Campos oficiais de endereço a confirmar | Parte obrigatória conforme tipo de imóvel | Regras variam para imóvel sem número, rural ou coletivo | Normalizar logradouro, número, complemento, CEP e localidade | Cadastro domiciliar/territorial |
| PARCIAL | `latitude`, `longitude` | Coordenadas oficiais a confirmar | Condicional, quando coletadas | Validar faixa, precisão e origem da coordenada | Converter para formato e precisão aceitos | Localização territorial |
| A IMPLEMENTAR | Tipo de imóvel e situação de ocupação | Código oficial a confirmar | Obrigatório conforme cadastro domiciliar | Deve distinguir domicílio, imóvel não domiciliar, vazio e uso coletivo | Criar catálogo versionado e mapeamento oficial | Cadastro domiciliar/territorial |
| A IMPLEMENTAR | Condições de moradia | Código oficial a confirmar | Obrigatório/condicional conforme ficha oficial | Deve registrar somente os blocos aplicáveis ao imóvel | Criar campos estruturados para água, saneamento, energia, lixo, cômodos e material | Cadastro domiciliar/territorial |
| A IMPLEMENTAR | Características do território | Código oficial a confirmar | Condicional | Aplicável quando o modelo exigir informação territorial | Criar catálogo e regras por tipo de imóvel | Cadastro domiciliar/territorial |
| PARCIAL | `source`, `version`, `created_at`, `updated_at` | Não é código e-SUS; metadado local | Obrigatório para governança local | Não substituir campos oficiais | Preservar como metadado e excluir do payload quando não aceito | Auditoria e rastreabilidade |

## 3. Família e cidadão / Cadastro Individual

| Estado | Campo de origem atual | Código oficial | Obrigatoriedade | Regra condicional | Transformação necessária | Destino da exportação |
|---|---|---|---|---|---|---|
| COBERTO | `census_families.id`, `family_reference` | Identificador familiar oficial a confirmar | Obrigatório quando houver família | Deve pertencer a um domicílio vigente | Mapear referência local para identificador aceito pelo destino | Família/domicílio |
| COBERTO | `census_family_members.family_id`, `citizen_id`, `relationship_code`, `is_responsible` | Parentesco/responsável: código oficial a confirmar | Condicional ao cadastro familiar | Deve existir um responsável conforme regra oficial | Criar catálogo de parentesco e mapeamento | Composição familiar |
| PARCIAL | `census_citizens.full_name`, `preferred_name` | Campo oficial de nome a confirmar | Obrigatório no cadastro individual | Nome preferencial não substitui nome civil quando o destino exigir ambos | Normalizar nome, preservar valor original e aplicar regra de acentuação definida | Cadastro individual |
| PARCIAL | `birth_date`, `sex` | Data de nascimento e sexo oficiais; códigos a confirmar | Obrigatório/condicional | Validar data futura, faixa e valores permitidos | Converter sexo municipal para domínio oficial | Cadastro individual |
| PARCIAL | `cns`, `cpf` | CNS/CPF oficiais | Condicional, quando disponíveis | Nunca gerar identificador; validar dígitos e duplicidade | Validar e enviar apenas valores confirmados ou declarados conforme regra | Identificação do cidadão |
| COBERTO | `identification_status`, `data_source` | Metadado local; código oficial a confirmar | Obrigatório localmente | Provisório não deve ser apresentado como CNS/CPF validado | Mapear situação para estado aceito e preservar origem | Qualidade/auditoria |
| A IMPLEMENTAR | Raça/cor, nacionalidade, escolaridade, ocupação, filiação e demais dados sociodemográficos | Códigos oficiais a confirmar | Conforme Cadastro Individual vigente | Campos dependem de faixa etária, situação e ficha utilizada | Criar colunas/catálogos versionados e validações condicionais | Cadastro individual |
| A IMPLEMENTAR | Condições autorreferidas e situações de saúde do cidadão | Códigos oficiais a confirmar | Condicional ao campo/motivo | Não confundir relato do cidadão com diagnóstico profissional | Criar domínio de condição, origem e data de vigência | Cadastro individual/linha de cuidado |

## 4. Visita Domiciliar e Territorial — MIVDT

| Estado | Campo de origem atual | Código oficial | Obrigatoriedade | Regra condicional | Transformação necessária | Destino da exportação |
|---|---|---|---|---|---|---|
| COBERTO | `census_visits.id`, `visit_type='FVD'` | Identificador local; identificador oficial a confirmar | Obrigatório localmente | UUID deve ser idempotente | Gerar envelope externo sem alterar o UUID | Identificador do evento |
| COBERTO | `visit_date`, `created_at` | Data/hora oficiais a confirmar | Obrigatório | Data não pode ser futura conforme regra do destino | Aplicar timezone municipal e formato oficial | Data da visita |
| COBERTO | `professional_id`, `acs_id` | CNS/CBO/identificador oficial do profissional | Obrigatório | Profissional deve ser ACS/ACE para MIVDT | Resolver profissional, CNS, CBO e vínculo vigente | Profissional da visita |
| PARCIAL | `municipality_id`, `establishment_id`, `team_id`, `microarea_id` | Campos oficiais a confirmar | Obrigatório no contexto territorial quando exigido | Devem ser gravados no evento, não apenas inferidos na tela | Persistir snapshot do estabelecimento/equipe/microárea na RPC FVD | Contexto territorial |
| COBERTO | `family_id`, `citizen_id`, `household_id` | CNS/CPF ou identificador oficial | Condicional conforme motivo da visita | Visita periódica/controle vetorial pode usar responsável familiar; cidadão pode ser ausente | Resolver pessoa/local visitado conforme regra do modelo | Pessoa ou local visitado |
| COBERTO | `census_visit_reason_links`, `reason_version` | Motivo oficial a confirmar | Obrigatório; pode aceitar múltiplos | Compatibilidade com tipo de visita e desfecho | Criar tabela de mapeamento código municipal × código oficial | Motivo da visita |
| COBERTO | `outcome_id`, `outcome_version`, `status` | Desfecho oficial a confirmar | Obrigatório | Desfecho diferente de realizada exige justificativa | Mapear estados municipais para domínio oficial e manter justificativa | Desfecho |
| COBERTO | `notes`, `guidance`, `referral`, `return_date` | Texto/data oficiais a confirmar | Condicional | Encaminhamento e retorno só quando aplicáveis | Separar observação, orientação, encaminhamento e retorno nos campos oficiais | Observação/conduta |
| PARCIAL | `census_questionnaire_responses.answers` | Campos oficiais dependem da ficha | Condicional ao questionário aplicado | Respostas não podem ser exportadas como um JSON genérico sem mapeamento | Criar mapeamento por `questionnaire_slug` e `version` | Dados complementares da ficha |
| A IMPLEMENTAR | Bloqueios de incompatibilidade entre motivo, desfecho e tipo de imóvel | Regras oficiais a confirmar | Obrigatório para qualidade | Ausência/recusa não pode receber campos incompatíveis com visita realizada | Criar motor de validação versionado | Validação antes do payload |

## 5. Agenda, processamento e integração

| Estado | Campo de origem atual | Código oficial | Obrigatoriedade | Regra condicional | Transformação necessária | Destino da exportação |
|---|---|---|---|---|---|---|
| COBERTO | `census_agenda_tasks` | Não é ficha oficial; código de tarefa a confirmar | Obrigatório localmente | Tarefa não deve ser confundida com visita realizada | Transformar tarefa em evento somente após registro válido | Planejamento local |
| COBERTO | `processing_status` | Estados locais: `LOCAL_DRAFT`, `LOCALLY_VALIDATED`, `READY_FOR_EXPORT`, `EXPORTED`, `ACCEPTED`, `PROCESSED`, `RETURNED` | Obrigatório localmente | Somente `READY_FOR_EXPORT` pode entrar na fila futura | Mapear retorno oficial para estados locais sem apagar o original | Fila de integração |
| A IMPLEMENTAR | UUID de idempotência, tentativas, payload original/normalizado e retorno | Identificador/protocolo oficial a confirmar | Obrigatório para integração | Reenvio do mesmo evento não pode duplicar | Criar fila de sincronização e tabela de retornos | Integração PEC/LEDI/SISAB |
| A IMPLEMENTAR | Versão do leiaute e mapeamento aplicado | Versão oficial do leiaute | Obrigatório no payload ou envelope quando exigido | Uma alteração do leiaute não pode reinterpretar registros antigos | Versionar adaptador e congelar payload normalizado | Integração e auditoria |
| A IMPLEMENTAR | Resultado da validação pré-exportação | Códigos de erro oficiais a confirmar | Obrigatório antes do envio | Registro incompleto deve ficar devolvido com pendência explícita | Criar relatório de erros por campo e regra | Qualidade/retorno |

## 6. Matriz de decisão para a etapa de exportação

Antes de desenvolver o exportador, cada linha deve receber uma destas decisões:

1. **Mapeamento confirmado:** o campo municipal e o código oficial estão confirmados na versão do leiaute escolhida.
2. **Transformação definida:** o campo existe, mas exige conversão, normalização ou combinação com outro campo.
3. **Campo ainda ausente:** o banco ou a tela precisa ser ampliado antes da exportação.
4. **Não exportável:** o campo é exclusivamente operacional, de auditoria ou de segurança local.
5. **Homologação necessária:** o campo está tecnicamente mapeado, mas precisa ser testado no PEC/LEDI/SISAB com retorno real.

## Fontes oficiais consultadas

- Ministério da Saúde. [Manual e-SUS APS](https://www.gov.br/saude/pt-br/composicao/saps/deaps/publicacoes/manual-e-sus-aps), versão eletrônica atualizada em 2026.
- Ministério da Saúde. [Modelo de Informação de Visita Domiciliar e Territorial — MIVDT](https://sisaps.saude.gov.br/sistemas/siaps/docs/modelos/Atendimentos/mivdt). O modelo informa que a visita domiciliar é destinada a ACS/ACE e que outros profissionais registram atendimento individual no domicílio.
- Ministério da Saúde. [Ficha de Visita Domiciliar e Territorial — versão 4.1](https://sisaps.saude.gov.br/esus/upload/docs/ficha_v_domiciliar_terr_v4_1.pdf). Referência histórica de campos da ficha CDS; a versão escolhida para exportação deve ser confirmada antes do desenvolvimento do adaptador.
- Ministério da Saúde. [Manual de utilização do aplicativo e-SUS APS Território](https://sisaps.saude.gov.br/sistemas/esusaps/docs/manual_utilizacao_aplicativo_esus_aps_territorio.pdf).
- Ministério da Saúde. [Nota Técnica nº 30/2025-CGESCO/DESCO/SAPS/MS](https://www.gov.br/saude/pt-br/centrais-de-conteudo/publicacoes/notas-tecnicas/2025/nota-tecnica-no-30-2025-cgesco-desco-saps-ms.pdf), sobre Cadastro Individual e Cadastro Domiciliar e Territorial.

> Esta matriz é um instrumento de engenharia de dados e governança. Ela não declara compatibilidade, certificação ou homologação com e-SUS APS, PEC, LEDI, SISAB ou SIAPS.
