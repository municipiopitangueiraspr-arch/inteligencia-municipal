# Matriz de correspondência — ACS × e-SUS APS

**Versão da matriz:** 1.1.0
**Data:** 2026-11-15
**Escopo:** módulo ACS, Cadastro Individual, Cadastro Domiciliar e Territorial e Visita Domiciliar e Territorial.
**Estado:** preparação para a etapa futura de exportação; não representa homologação, transmissão ou aceitação pelo PEC/SISAB. A versão 1.1 registra as estruturas locais implementadas para fechar lacunas parciais sem inventar códigos oficiais.

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
| A VALIDAR | `address_line`, `address_number`, `address_complement`, `neighborhood`, `postal_code`, `locality`, `address_validation_status` | Campos oficiais de endereço a confirmar | Parte obrigatória conforme tipo de imóvel | CEP é normalizado para 8 dígitos; endereço recebe estado local `UNCONFIRMED`, `PARTIAL` ou `STRUCTURED` | Normalizar logradouro, número, complemento, CEP e localidade; confirmar nomes/códigos no leiaute oficial | Cadastro domiciliar/territorial |
| A VALIDAR | `latitude`, `longitude` | Coordenadas oficiais a confirmar | Condicional, quando coletadas | Faixas -90/90 e -180/180 são validadas no formulário e no banco | Converter para formato e precisão aceitos; confirmar se o destino aceita coordenadas | Localização territorial |
| A VALIDAR | `census_households.property_type`, `occupancy_status` e `census_attribute_catalog` | Código oficial a confirmar; `official_code` permanece nulo | Obrigatório conforme cadastro domiciliar | Catálogo municipal distingue domicílio urbano/rural/coletivo, não residencial, ocupação e não informado | Mapear os códigos municipais versionados ao leiaute oficial vigente | Cadastro domiciliar/territorial |
| A VALIDAR | `construction_material`, `rooms_count`, `bedrooms_count`, `housing_condition`, `housing_data_version` | Código oficial a confirmar; `official_code` permanece nulo | Obrigatório/condicional conforme ficha oficial | Quartos e cômodos são inteiros de 0 a 100; quartos não podem superar cômodos | Preservar versão local e converter para o modelo oficial confirmado | Cadastro domiciliar/territorial |
| A VALIDAR | `water_supply`, `water_treatment`, `sewage_disposal`, `toilet_available`, `electricity_access`, `garbage_disposal`, `cooking_fuel` | Código oficial a confirmar; `official_code` permanece nulo | Condicional ao tipo de imóvel e ficha aplicada | Cada valor é aceito somente se ativo no catálogo municipal vigente | Mapear domínios locais e aplicar regras condicionais do leiaute oficial | Cadastro domiciliar/territorial |
| A IMPLEMENTAR | Características do território | Código oficial a confirmar | Condicional | Aplicável quando o modelo exigir informação territorial | Criar catálogo e regras por tipo de imóvel | Cadastro domiciliar/territorial |
| PARCIAL | `source`, `version`, `created_at`, `updated_at` | Não é código e-SUS; metadado local | Obrigatório para governança local | Não substituir campos oficiais | Preservar como metadado e excluir do payload quando não aceito | Auditoria e rastreabilidade |

## 3. Família e cidadão / Cadastro Individual

| Estado | Campo de origem atual | Código oficial | Obrigatoriedade | Regra condicional | Transformação necessária | Destino da exportação |
|---|---|---|---|---|---|---|
| COBERTO | `census_families.id`, `family_reference` | Identificador familiar oficial a confirmar | Obrigatório quando houver família | Deve pertencer a um domicílio vigente | Mapear referência local para identificador aceito pelo destino | Família/domicílio |
| COBERTO | `census_family_members.family_id`, `citizen_id`, `relationship_code`, `is_responsible` | Parentesco/responsável: código oficial a confirmar | Condicional ao cadastro familiar | Deve existir um responsável conforme regra oficial | Criar catálogo de parentesco e mapeamento | Composição familiar |
| A VALIDAR | `census_citizens.full_name`, `preferred_name` | Campo oficial de nome a confirmar | Obrigatório no cadastro individual | Nome é aparado e nome preferencial é preservado separadamente | Normalizar nome, preservar valor original e confirmar regra do destino | Cadastro individual |
| A VALIDAR | `birth_date`, `sex` | Data de nascimento e sexo oficiais; códigos a confirmar | Obrigatório/condicional | Banco mantém data/sexo estruturados e restringe sexo ao domínio local vigente | Converter sexo municipal para domínio oficial | Cadastro individual |
| A VALIDAR | `cns`, `cpf`, `cns_validation_status`, `cpf_validation_status` | CNS/CPF oficiais | Condicional, quando disponíveis | CNS exige formato de 15 dígitos; CPF tem dígitos verificadores; nenhum identificador é inventado | Normalizar dígitos e separar declaração local de confirmação oficial | Identificação do cidadão |
| COBERTO | `identification_status`, `data_source` | Metadado local; código oficial a confirmar | Obrigatório localmente | Provisório não deve ser apresentado como CNS/CPF validado | Mapear situação para estado aceito e preservar origem | Qualidade/auditoria |
| A VALIDAR | `race_color`, `nationality`, `education_level`, `occupation`, `mother_name`, `father_name`, `sociodemographic_data_version` | Códigos oficiais a confirmar; `official_code` permanece nulo | Conforme Cadastro Individual vigente | Raça/cor, nacionalidade e escolaridade usam catálogo ativo; textos de ocupação/filiação são aparados; regras de faixa etária ainda precisam ser confirmadas | Mapear domínios locais versionados e transformar conforme leiaute escolhido | Cadastro individual |
| A IMPLEMENTAR | Condições autorreferidas e situações de saúde do cidadão | Códigos oficiais a confirmar | Condicional ao campo/motivo | Não confundir relato do cidadão com diagnóstico profissional | Criar domínio de condição, origem e data de vigência | Cadastro individual/linha de cuidado |

## 4. Visita Domiciliar e Territorial — MIVDT

| Estado | Campo de origem atual | Código oficial | Obrigatoriedade | Regra condicional | Transformação necessária | Destino da exportação |
|---|---|---|---|---|---|---|
| COBERTO | `census_visits.id`, `visit_type='FVD'` | Identificador local; identificador oficial a confirmar | Obrigatório localmente | UUID deve ser idempotente | Gerar envelope externo sem alterar o UUID | Identificador do evento |
| COBERTO | `visit_date`, `created_at` | Data/hora oficiais a confirmar | Obrigatório | Data não pode ser futura conforme regra do destino | Aplicar timezone municipal e formato oficial | Data da visita |
| COBERTO | `professional_id`, `acs_id` | CNS/CBO/identificador oficial do profissional | Obrigatório | Profissional deve ser ACS/ACE para MIVDT | Resolver profissional, CNS, CBO e vínculo vigente | Profissional da visita |
| A VALIDAR | `municipality_id`, `establishment_id`, `team_id`, `microarea_id`, `territory_snapshot` | Campos oficiais a confirmar | Obrigatório no contexto territorial quando exigido | RPC resolve vínculo vigente e grava snapshot com estado `COMPLETE` ou `PARTIAL`; tarefa serve como fallback | Persistir snapshot do estabelecimento/equipe/microárea na FVD e confirmar nomes/códigos no leiaute | Contexto territorial |
| COBERTO | `family_id`, `citizen_id`, `household_id` | CNS/CPF ou identificador oficial | Condicional conforme motivo da visita | Visita periódica/controle vetorial pode usar responsável familiar; cidadão pode ser ausente | Resolver pessoa/local visitado conforme regra do modelo | Pessoa ou local visitado |
| COBERTO | `census_visit_reason_links`, `reason_version` | Motivo oficial a confirmar | Obrigatório; pode aceitar múltiplos | Compatibilidade com tipo de visita e desfecho | Criar tabela de mapeamento código municipal × código oficial | Motivo da visita |
| COBERTO | `outcome_id`, `outcome_version`, `status` | Desfecho oficial a confirmar | Obrigatório | Desfecho diferente de realizada exige justificativa | Mapear estados municipais para domínio oficial e manter justificativa | Desfecho |
| COBERTO | `notes`, `guidance`, `referral`, `return_date` | Texto/data oficiais a confirmar | Condicional | Encaminhamento e retorno só quando aplicáveis | Separar observação, orientação, encaminhamento e retorno nos campos oficiais | Observação/conduta |
| A VALIDAR | `census_questionnaire_responses.answers`, `census_questionnaire_field_mappings` | Campos oficiais dependem da ficha | Condicional ao questionário aplicado | Respostas continuam versionadas; cada pergunta pode ter domínio, regra, destino e estado de mapeamento próprios | Usar o mapeamento por questionário/versão/pergunta antes de qualquer adaptador | Dados complementares da ficha |
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
