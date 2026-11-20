# MatrixIA — visão da plataforma e escopo do protótipo

## Produto que queremos construir

A MatrixIA é uma plataforma única para a prefeitura, com cadastros compartilháveis, processos próprios para cada secretaria e uma visão executiva que consolida o trabalho municipal. O objetivo é substituir gradualmente sistemas municipais isolados nas rotinas que a plataforma vier a cobrir, registrando a informação na origem e reaproveitando-a nos serviços relacionados e nas exportações exigidas por sistemas estaduais, nacionais e federais.

A regra central do produto é: **nenhum alerta, indicador ou frase executiva nasce de um número solto**. Cada informação exibida precisa corresponder a um registro que possa ser criado ou atualizado em um módulo, às relações entre esses registros e a uma regra de agregação que possa ser explicada. A tela deve permitir navegar do resumo até a área de origem e entender quais registros, datas e estados o produziram.

O protótipo é uma simulação de front-end. Login, ações, registros e alterações usam estado local e dados fictícios; não há autenticação real, persistência, Supabase ou integração externa. As experiências do prefeito, secretário e operador devem estar disponíveis na demonstração, sem bloquear a exploração dos módulos por perfis reais.

## Entrada e três experiências

A plataforma tem uma única porta de entrada MatrixIA. Na tela demonstrativa, a pessoa seleciona uma das três experiências e acessa a respectiva área de trabalho:

- **Prefeito — Visão do Município:** síntese da cidade inteira, orientada a decisões. Mostra prioridades com consequência no serviço/morador, secretaria responsável, próxima providência, prazo, atualização, origem dos dados e caminho até os registros; panorama das onze secretarias; finanças; agenda de decisões; programas e projetos; e pendências compartilhadas entre áreas.
- **Secretário — Visão da Secretaria:** seleção de uma das onze pastas e visão executiva-operacional da área. Reúne serviços, solicitações, filas, prazos, equipe, indicadores, programas, orçamento, próximas ações e dependências com outras secretarias. Uma tarefa pode ser acompanhada até o registro operacional que a originou.
- **Operador — Meu Trabalho:** escolha de uma persona funcional para simular atividades de campo ou de unidade. A página apresenta agenda, fila de tarefas, registros recentes, pendências e formulários específicos do trabalho (por exemplo, visita domiciliar, atividade de vigilância, atendimento clínico, rotina escolar ou ordem de serviço). A atividade registrada deve atualizar a lista local da demonstração e explicitar que não foi persistida.

O protótipo evita telas sem saída: cada visão oferece retorno ao seletor de experiência, acesso à respectiva área e pelo menos um percurso navegável que demonstra a relação entre tarefa, processo e resumo gerencial.

## Arquitetura funcional da plataforma final

A experiência se organiza em quatro camadas conectadas, em vez de onze produtos separados:

1. **Fundação municipal compartilhada:** município, unidades, estruturas organizacionais, profissionais, equipes, pessoas, famílias/domicílios, endereços, serviços, agendas, documentos, solicitações, tarefas, bens, contratos, fornecedores, projetos, programas, orçamento e eventos. Cada módulo especializado usa referências comuns adequadas ao seu processo.
2. **Módulos das onze secretarias:** processos, telas e campos próprios para Administração e Finanças; Agricultura e Meio Ambiente; Assistência Social; Cultura e Turismo; Desenvolvimento Econômico; Educação; Esporte e Lazer; Obras; Planejamento e Urbanismo; Saúde e Vigilância Sanitária; Segurança Pública e Trânsito.
3. **Fluxos transversais:** encaminhamento entre áreas, serviço que exige mais de uma secretaria, tarefa compartilhada, transporte e manutenção de frota, atendimento ao morador, agenda municipal, documentos e projetos. Gestão de Frota é uma capacidade operacional ligada à estrutura que a prefeitura definir, não uma décima segunda secretaria.
4. **Gestão, análise e exportação:** painéis por experiência, relatórios explicáveis, catálogo de dados requeridos por destino oficial, validações, preparação de arquivo/lote, acompanhamento de envio e histórico de processamento. Indicadores são derivados dos registros operacionais; não se tornam um cadastro paralelo.

## Módulos das secretarias

Cada módulo combina cadastro e rotina operacional, acompanhamento de filas, documentos e relatórios próprios. O desenho inicial prevê:

- **Administração e Finanças:** pessoas e estrutura administrativa; protocolo; compras e contratos; patrimônio e frota; almoxarifado; orçamento, receita, empenho, liquidação e pagamento; execução e prestação de contas.
- **Agricultura e Meio Ambiente:** cadastro e atendimento rural; assistência ao produtor; serviços e equipamentos rurais; licenciamento, fiscalização, resíduos, áreas e ocorrências ambientais.
- **Assistência Social:** famílias e pessoas atendidas; unidades e equipes; acolhida, acompanhamento, visitas, benefícios, encaminhamentos, serviços, grupos e registros da rede socioassistencial.
- **Cultura e Turismo:** espaços e agentes; atividades, eventos, inscrições, editais, projetos, bens culturais e divulgação de calendário.
- **Desenvolvimento Econômico:** atendimento a empresas e empreendedores, solicitações de orientação, licenças integradas, programas, emprego, feiras e indicadores de atendimento.
- **Educação:** rede e unidades escolares, profissionais, matrículas, turmas, frequência, transporte escolar, alimentação, calendário, ocorrências e fluxo com outras áreas.
- **Esporte e Lazer:** equipamentos e espaços, modalidades, turmas, inscrições, agenda, participantes, equipes e manutenção.
- **Obras:** solicitações e ordens de serviço, vias e trechos, equipes, máquinas, materiais, medições, manutenção e andamento físico das intervenções.
- **Planejamento e Urbanismo:** planos, zoneamento, cadastros territoriais, projetos, consulta prévia, alvarás, aprovações e acompanhamento de processos.
- **Saúde e Vigilância Sanitária:** território, pessoas, unidades, equipes, agenda, atendimentos, visitas, procedimentos, encaminhamentos, regulação, vigilância e acompanhamento de agravos e inspeções.
- **Segurança Pública e Trânsito:** ocorrências e solicitações, sinalização, fiscalização, educação para o trânsito, mobilidade, rondas, locais e providências.

As listas são um mapa funcional para planejar o produto, não uma afirmação de que todos os municípios usam exatamente os mesmos fluxos. O catálogo de dados da plataforma deve permitir configurar formulários e campos por programa, serviço e destino de exportação.

## Cadastro uma vez, uso em vários serviços

A pessoa, unidade, endereço, profissional, bem ou projeto é uma referência comum quando os processos compartilham aquela entidade. As pastas continuam registrando seus próprios fatos operacionais: uma visita domiciliar não é um atendimento clínico; uma matrícula escolar não é um acompanhamento social; uma ordem de manutenção não é uma despesa paga. Os relacionamentos conectam esses fatos sem apagar as diferenças entre eles.

A base funcional deve distinguir, no mínimo: entidade de referência; evento ou atendimento; solicitação/encaminhamento; responsável e equipe; datas de abertura, realização, prazo e encerramento; situação atual; unidade/local; evidências/documentos; relação com outras áreas; origem do registro; e histórico de mudanças. O modelo detalhado será amadurecido módulo a módulo, mantendo esses contratos de integração.

## Origem dos alertas e regras demonstráveis

A interface do prefeito precisa mostrar origem, registros de exemplo, campos necessários, período considerado e regra de cálculo. A equipe deve poder clicar de um alerta para a secretaria e dali abrir seus registros-fonte. Os identificadores abaixo são todos fictícios e servem para demonstrar um modelo possível de cadastramento:

| Destaque no painel                                 | Registros necessários no sistema                                                                                                                                                                                                                                                        | Regra que gera o destaque                                                                                                                                                                                                  |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rota escolar readequada; micro-ônibus indisponível | Inventário de veículos (identificador, tipo, situação); ordem de manutenção (veículo, defeito, abertura, estado, peça/serviço, previsão); rota (trajeto, escola, veículos, período, estudantes vinculados); mudança de contingência (rota alternativa, início/fim, estudantes afetados) | Contar veículos cadastrados e em operação; relacionar a ordem aberta ao veículo da rota; identificar a rota contingenciada e contar os vínculos ativos. Exibir quantidade afetada só se houver esses vínculos registrados. |
| Fila de encaminhamentos especializados             | Encaminhamento (identificador, pessoa, origem, especialidade, data, destino, situação, retornos); vaga/regulação (oferta, data e estado)                                                                                                                                                | Contar encaminhamentos ainda aguardando e calcular dias desde a data de encaminhamento. A fila clínica é independente da central de solicitações administrativas.                                                          |
| Ordens de manutenção rural atrasadas               | Solicitação/ordem de serviço (local, descrição, área, abertura, prazo, prioridade, equipe, situação e datas de execução)                                                                                                                                                                | Contar ordens abertas cujo prazo cadastrado passou; ordenar pela data de abertura/prioridade para o acompanhamento.                                                                                                        |
| Solicitações municipais abertas e vencidas         | Solicitação (canal, assunto, secretaria, unidade/local, recebimento, prazo, situação, responsável, encaminhamentos e conclusão)                                                                                                                                                         | Contar registros não concluídos e, separadamente, os que ultrapassaram o prazo definido para o serviço. Agrupar por secretaria sem misturar com filas clínicas especializadas.                                             |
| Receita recebida contra previsão                   | Lançamentos da previsão e da arrecadação (fonte/receita, competência, valor, data, situação e período de fechamento)                                                                                                                                                                    | Somar valores recebidos e previstos para o mesmo intervalo, apresentar percentual e diferença monetária, deixando o fechamento explícito.                                                                                  |

No exemplo de transporte já usado pelo protótipo, a frase do cartão foi **criada como texto de demonstração**, não extraída de um sistema ou cadastro real. Para que o número “32 alunos” seja aceitável no produto, o protótipo passa a documentar sua proveniência como combinação de uma rota com 32 vínculos ativos de estudantes, um veículo identificado e uma ordem de manutenção aberta; o status de contingência da rota determina que o sistema destaque o caso. Até que os registros-fonte existam, esses IDs, datas e valores devem ser lidos como registros sintéticos, não como fatos sobre Pitangueiras.

O mesmo critério vale para números de saúde, obras, finanças e as demais secretarias. Uma métrica sem regra e sem origem não deve ser apresentada como fato: deve ser calculada de um conjunto definido de registros ou rotulada como hipótese de demonstração.

## Implementação desta etapa

O subprojeto segue isolado em `MatrixIA/`, com React, Vite e TypeScript. `src/App.tsx` compõe as telas e a troca local de experiência; `src/components/` organiza login e espaços de trabalho; `src/data/mockData.ts` contém o cenário municipal; `src/data/` concentra registros demonstrativos, catálogos de processos e regras simples de composição; `src/styles.css` mantém identidade institucional e responsividade; `public/manus-routes.json` declara as rotas da aplicação.

Nesta etapa, as três entradas, transições, seleções de secretaria/persona, formulários demonstrativos e visualização de procedência funcionam no front-end com dados fictícios em memória. A gravação real, autenticação, integrações, exportações e substituição de sistemas só poderão ser exercitadas quando as etapas técnicas correspondentes forem implementadas; isso não limita a amplitude funcional que o protótipo pode demonstrar.

## Direção visual e voz

**Movimento:** painel cívico executivo contemporâneo, com linguagem direta e hierarquia de sala de situação.

**Princípios:** explicar a origem dos números; mostrar impacto e ação; manter a navegação simples para atividades especializadas; apresentar os contextos das três experiências sem fragmentar a marca.

**Cores:** azul institucional para navegação, decisões e elementos estruturais; superfície clara para leitura; chips sólidos de estado com texto de contraste: verde para em dia, laranja para atenção e vermelho para crítico.

**Layout:** login em composição clara e direta; visão do prefeito com síntese e fila de decisão; visão da secretaria com quadro de operação e tarefas; área do operador com agenda e registros de rotina.

**Assinaturas:** marca MatrixIA; identificação da experiência em uso; indicador “dados simulados”; trilha “módulo de origem → registros → regra de cálculo”.

**Interação:** acesso demonstrativo a prefeito, secretário e operador; troca de experiência; seleção de secretaria/persona; abertura de detalhe, registro-fonte, próximo passo e formulário local; responsividade para uso em computador e celular.

**Tipografia:** sans-serif de alta legibilidade, títulos objetivos, texto de apoio curto e valores tabulares.

**Essência da marca:** “A prefeitura inteira, explicada para quem precisa decidir e executar.” Personalidade: clara, confiável e prática. Voz direta, sem jargão.

## Fluxo funcional de Solicitações e Protocolos

O protótipo inclui uma central municipal para demandas administrativas. O cadastro feito pelo operador informa assunto, descrição, categoria, solicitante, contato opcional, local, canal, secretaria responsável e prioridade. A aplicação atribui um protocolo demonstrativo, situação inicial, responsável, datas de recebimento e prazo; toda alteração acrescenta evento ao histórico do mesmo registro. O secretário acompanha a fila da pasta selecionada e pode atualizar situação, responsável e nota de andamento. O prefeito consulta os protocolos e resumos agregados.

No front-end, `src/data/requests.ts` define o contrato comum (`MunicipalRequest`), os registros sintéticos iniciais, a regra de aberto/atrasado e a numeração demonstrativa. `src/components/RequestCenter.tsx` apresenta lista, filtros, detalhamento, histórico e atualização da secretaria; `OperationalWorkspace.tsx` oferece o cadastro ao operador e passa as alterações à aplicação. `App.tsx` mantém a coleção única em memória e deriva dela os totais por secretaria e do município. Os 36 registros abertos e 7 vencidos são seeds fictícios alinhados ao cenário que já existia. A fila de encaminhamentos clínicos especializados continua separada e não é contada como solicitação administrativa.

Não existe persistência nesta etapa: cadastro, atualização e histórico desaparecem ao recarregar ou encerrar a sessão. O protocolo exibido não é número oficial de prefeitura e os registros não correspondem a manifestações reais. O futuro backend deverá substituir a geração local por numeração transacional, trilha auditável e persistência apropriada, preservando o mesmo contrato funcional.

## Módulo de Saúde — Território, Unidades e Equipes

O primeiro módulo operacional estruturado da Saúde organiza quatro cadastros relacionados: unidades, equipes, profissionais e áreas de atuação. Cada equipe aponta para uma unidade de referência e uma área; cada profissional é vinculado a uma equipe e herda dela a unidade; a área mantém equipe responsável, código e população estimada demonstrativa. Unidades guardam tipo, endereço/localidade, telefone demonstrativo e posição territorial. Cadastros podem ser editados e ativados/desativados sem apagar o registro da demonstração.

A visão territorial usa um mapa SVG esquemático, inspirado no mapa territorial do sistema Inteligência Municipal: polígonos selecionáveis para áreas, marcadores para unidades e equipes, alternância de camadas, filtro por área, busca, legenda, zoom, painel de detalhes e navegação do mapa para a lista/cadastro. O protótipo não importa nem consulta a cartografia real do município: limites, posições, população, identificadores, profissionais e contatos são fictícios. Geometrias oficiais, edição/desenho de limites e geocodificação ficam para uma etapa posterior.

No front-end, `src/data/healthTerritory.ts` define os tipos e registros demonstrativos; `src/components/HealthTerritoryModule.tsx` contém mapa, cadastros, filtros, detalhes e formulários; `OperationalWorkspace.tsx` apresenta o módulo dentro da Secretaria de Saúde; e `App.tsx` mantém a coleção em memória compartilhada durante a demonstração entre as experiências. Nenhuma gravação é enviada ao Supabase ou a um serviço externo; os novos dados desaparecem ao recarregar ou encerrar a sessão.
