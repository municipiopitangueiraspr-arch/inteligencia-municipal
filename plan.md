# Plano — Módulo de Gestão de Frotas

## Objetivo
Implementar a primeira camada operacional do módulo em React, preservando o login e o dashboard existentes, com integração ao Supabase principal.

## Escopo desta entrega
- Entrada do módulo a partir do dashboard;
- Shell visual próprio para Frotas;
- Visão geral com indicadores reais;
- Cadastro/listagem de veículos;
- Fila de conferência de abastecimentos;
- Consulta de postos e motoristas;
- Ação inicial de cadastro de veículo;
- Responsividade para desktop e mobile;
- Rota declarada em `public/manus-routes.json`.

## Decisões de implementação
- React + TypeScript + Vite, reutilizando `lucide-react`;
- Supabase JS já configurado em `src/lib/supabase.ts`;
- Componentes concentrados em `src/components/fleet/`;
- O módulo consulta apenas registros permitidos pelas policies RLS;
- A primeira entrega não cria relatórios, manutenção ou custos consolidados;
- Dados vazios e erros de acesso terão estados visuais explícitos.

## Design

### Estilos considerados
- **Sala de controle institucional** (0,07): painel denso, escuro e orientado a status.
- **Prefeitura editorial** (0,05): cartões claros, tipografia documental e detalhes dourados.
- **Operação de campo** (0,08): alto contraste, ações rápidas e status proeminentes.

### Estilo escolhido: Sala de controle institucional

**Movimento:** dashboard operacional municipal com navegação lateral, áreas de trabalho claras e acentos de estado.

**Princípios:** hierarquia rápida, confiança documental, status sempre visível e ações no contexto.

**Paleta:** navy institucional para navegação e autoridade; azul petróleo para operações; dourado para decisões e atenção; verde para conferido; âmbar e vermelho para pendências.

**Layout:** sidebar vertical no desktop, faixa contextual no conteúdo e tabelas densas com filtros; no mobile, a navegação vira uma faixa horizontal rolável.

**Elementos de assinatura:** indicador lateral dourado da seção ativa, chips de situação, cabeçalhos com kicker e cards de métrica com ícone funcional.

**Interação:** toda ação destrutiva ou de validação deverá ser explícita; estados de carregamento e vazio devem explicar o próximo passo.

**Animação:** transições curtas de 160–220ms, sem movimento decorativo; entradas de cartões podem usar fade/translate leve.

**Tipografia:** Manrope para títulos e números; DM Sans para conteúdo, tabelas e controles.

**Essência:** o posto de comando confiável para registrar, conferir e acompanhar a frota municipal.

**Tom:** direto, administrativo e orientado a decisão. Exemplos: “Abastecimentos aguardam conferência” e “Cadastre um veículo para iniciar o controle operacional”.

## Estrutura
- `src/components/FleetModule.tsx`: shell e navegação do módulo.
- `src/components/FleetModule.css`: identidade visual e responsividade.
- `src/App.tsx`: alternância entre dashboard e Frotas.
- `src/components/Dashboard.tsx`: entrada do módulo.
- `public/manus-routes.json`: rotas declaradas.

## Plano — Esqueleto do Censo Municipal (Etapa 2)
### Objetivo e escopo
Adicionar ao Hall da Inteligência Municipal uma entrada para o Censo Municipal e implementar um shell navegável inicial, reutilizando autenticação, identidade visual e a mesma moldura do módulo Gestão de Frotas: menu lateral com marca e voltar ao painel, navegação na mesma posição, cabeçalho e área de conteúdo. O shell terá visão geral e mapa em estado vazio, informando que a base cartográfica depende de análise. Não serão exibidos mapa, lotes, zonas, indicadores ou respostas inventados.

### Limites desta etapa
Não criar ou alterar tabelas, RLS, contas, dados, questionário funcional ou fluxo offline. O shell não acessará dados do Censo e sua entrada não concederá acesso a respostas ou informações sensíveis. Permissões e RLS serão desenhadas e aprovadas antes de conectar dados. Preservar os fluxos de Frotas e Portal do Fornecedor.

### Integração e estrutura
- `src/App.tsx`: alternância entre Hall, Frotas e Censo após autenticação existente.
- `src/components/Dashboard.tsx`: acesso ao Censo por cartão e navegação principal desktop/mobile.
- `src/components/census/`: novo shell React/TypeScript e CSS isolado do Censo.
- Reutilizar a estrutura `.fleet-shell`, `.fleet-sidebar`, `.fleet-nav`, `.fleet-header` e `.fleet-content`, os estilos de Frotas, o brasão, cores institucionais, tipografia Manrope/DM Sans e os padrões responsivos já existentes; somente as opções e o conteúdo central são específicos do Censo.

### Diretrizes de interface
O mapa permanece como área de destaque, mas em estado vazio explícito até a análise do arquivo cartográfico. A interface será utilizável em desktop, tablet e mobile, com controles acessíveis. Não serão alterados estilos ou comportamento dos módulos existentes além do necessário para integrar o acesso no Hall.

## Plano — Gestão de desenhos CAD no Censo
Adicionar uma opção `Gestão de DWG` na navegação lateral do Censo, usando a moldura comum de Frotas. A tela permitirá selecionar um arquivo local `.dwg` ou `.dxf`, exibir nome e tamanho do arquivo escolhido nesta sessão e deixar explícito que a seleção local ainda não equivale a upload/persistência. A biblioteca do Censo apresentará estado vazio enquanto nenhum desenho estiver armazenado no backend; não incluir registros fictícios nem buscar arquivos do Drive em tempo de execução.

A persistência do original será tratada como etapa própria por Supabase Storage privado, com metadados no PostgreSQL, após definir as permissões e preparar a leitura geográfica. O arquivo DXF fornecido não será exposto como público nem apresentado como já importado. O processamento CAD, validação do sistema de coordenadas e separação de camadas por zona ficam fora desta tela inicial.

## Plano — Hall municipal em cards
### Objetivo e escopo aprovado
Remodelar somente o hall autenticado de `src/components/Dashboard.tsx`: apresentar os módulos municipais em cards visuais centralizados, sem navegação lateral nem menu lateral móvel. Preservar o login, a identificação do usuário e a saída da sessão. Manter funcionando os callbacks existentes para Gestão de Frotas e Censo Municipal.

### Decisões de interface
- Reutilizar a identidade visual institucional, o brasão, as cores e os ícones já instalados no projeto.
- Dar aos cards hierarquia visual clara, área clicável acessível e estado responsivo para desktop, tablet e celular.
- Só oferecer abertura aos módulos que tenham callback funcional no app atual; os demais permanecem visíveis como em preparação, sem ação falsa.
- Remover do hall indicadores `—` e ações vazias que não exibem dados funcionais, mantendo a tela focada na seleção de módulos.
- Preservar os menus internos de Frotas, Censo e Portal do Fornecedor; a remoção de navegação lateral vale apenas para o hall.

### Limites desta mudança
Não alterar autenticação, banco, permissões, módulos internos, manifestos de rota ou configurações de publicação. Validar com build local; não publicar no GitHub Pages sem aprovação específica.

## Escopo aprovado — interação do mapa do Censo
- Interpretar como lote cada polilinha fechada com pelo menos três vértices e área positiva na camada `Lotes Urbanos`; o importador não usa textos, endereços ou rótulos antigos do DXF para identificar ou validar lotes.
- Criar um UUID próprio para cada geometria importada e associá-lo ao respectivo polígono e registro de lote, permitindo classificação e gravação da divisão sem depender de identificadores cadastrais do desenho.
- Ignorar geometria aberta ou sem área válida e informar quantos elementos foram ignorados.
- Clique simples atribui imediatamente o lote à zona ativa e atualiza sua cor. Seleção múltipla pode ser ativada por botão ou por Ctrl/Cmd+clique; a ação de grupo aplica a zona ativa aos selecionados.
- Preservar pan por arraste do fundo do mapa, evitando capturar o pointer-down sobre os polígonos; ampliar o zoom por roda e controles até 24x.
- Não alterar schema/RLS; a divisão continua como rascunho local até usar o botão existente para salvar. Publicar no Pages somente conforme a autorização explícita do usuário.

## Escopo aprovado — seleção de lotes por área
- Adicionar um modo separado `Selecionar por área`; enquanto ativo, o arraste no mapa desenha um retângulo e não desloca o mapa.
- Da esquerda para a direita, selecionar somente polígonos inteiramente dentro da janela. Da direita para a esquerda, selecionar polígonos que cruzem ou estejam contidos na área.
- Mostrar o retângulo e destacar os lotes selecionados; permitir incluir a seleção à atual com Shift/Ctrl/Cmd e selecionar um lote isolado com um clique curto no modo.
- Mostrar a quantidade selecionada, manter a escolha da zona separada e oferecer ação explícita `Aplicar zona a N lote(s)`; essa ação atualiza a prévia local, e só o botão existente `Salvar divisão` grava no banco.
- `Esc` cancela a área/seleção em andamento; limpar seleção continua disponível. Preservar seleção por Ctrl/Cmd+clique e clique simples com atribuição imediata fora do modo por área.
- `Salvar divisão` atualiza apenas lotes existentes filtrando por `import_id` e `id`; valida IDs antes da escrita e confere quantas linhas foram atualizadas, sem usar upsert parcial que possa tentar inserir um lote sem `source_handle` obrigatório.

## Escopo aprovado — navegação e feedback visual do Censo
- Ao abrir o módulo Censo Municipal, iniciar em `Visão geral`; o título do cabeçalho acompanha a seção ativa.
- Na preparação do mapa, remover o nome do arquivo importado da barra junto ao botão de salvar; exibir um resumo visual de lotes classificados e colocar um botão `Salvar divisão` grande e evidente no painel de zonas.
- Antes de qualquer escrita feita por esta tela, pedir confirmação visual: criar zona, cadastrar ACS, vincular ACS à zona, importar mapa ou salvar a divisão.
- Após confirmar, desabilitar ações duplicadas e mostrar spinner e mensagem de progresso durante gravações de mapa/zona; indicar sucesso ou erro com estilo e ícone coerentes. Não inventar porcentagens quando o backend não reporta progresso.
- Reutilizar React, CSS e cliente Supabase existentes; sem migration ou mudança de RLS.

## Escopo aprovado — permanência no módulo e limpeza da legenda
- Guardar a área principal ativa (`dashboard`, `fleet` ou `census`) em `sessionStorage` somente enquanto houver sessão autenticada, para que atualizar a página mantenha o usuário no mesmo módulo; limpar a preferência ao voltar ao hall ou sair.
- Remover da legenda do mapa o aviso flutuante `Zona ativa: ...`; manter a zona escolhida e sua indicação visual no painel lateral de classificação.

## Escopo aprovado — gestão de questionários do Censo
- Substituir o placeholder `Questionários` por uma tela de gestão onde a equipe lista, cria, edita, salva, pré-visualiza e ativa/inativa questionários; não oferecer exclusão permanente.
- Persistir cada definição (título, subtítulo, descrição, estado e seções/perguntas) em `public.census_questionnaires.form_schema` como JSONB, com RLS para usuários autenticados, seguindo o padrão das tabelas de Censo. Essa tela não coleta nem armazena respostas dos domicílios.
- O editor permite adicionar/remover/reordenar seções e perguntas, editar rótulo/ajuda, marcar obrigatório, selecionar tipo de resposta, configurar opções e validações compatíveis com o tipo. Incluir tipos texto curto/longo, número, moeda, data, sim/não, escolha única/múltipla, tabela repetível e assinatura.
- Antes de salvar ou mudar estado, confirmar visualmente; durante a escrita, desabilitar duplicatas e mostrar progresso, sucesso ou erro. Inativar preserva o questionário e seu histórico.
- Precarregar a ficha do Google Doc fornecido, com o título `FICHA DE CADASTRO E ACOMPANHAMENTO DOMICILIAR`, subtítulo `Levantamento Socioeconômico, Habitacional e de Saúde Familiar`, os campos de identificação, as quatro seções e as perguntas/opções do original. Representar a relação de moradores como tabela repetível com as oito linhas previstas, e registrar a assinatura do morador responsável como campo de assinatura.
- Organizar o código em `src/components/census/questionnaires/` (tipos, lógica, gestão/editor, pré-visualização e estilos); manter a definição inicial como seed JSONB idempotente na migration versionada em `supabase/migrations/`, evitando duas cópias do formulário. Reutilizar o shell e a identidade visual do Censo/Frotas; não criar uma nova rota pública.

## Escopo aprovado — mapa territorial, domicílios, visitas e respostas
- Implementar `Mapa territorial` como mapa somente de leitura que carrega a divisão salva mais recente, pinta os lotes pela zona e abre um painel lateral no clique; preservar zoom até 24x, pan por arraste, suporte a teclado/controles e adaptação mobile.
- Um lote pode conter vários domicílios. Criar `census_households` ligado ao lote, `census_visits` ligado ao domicílio e `census_questionnaire_responses` ligada à visita e ao questionário. O schema reserva um marcador de domicílio ativo; esta etapa não oferece exclusão permanente, e visitas/respostas mantêm histórico.
- Cada resposta salva JSONB e um snapshot imutável do título, slug, schema e versão do questionário usado. A versão incrementa quando o conteúdo do questionário muda; o trigger do banco captura a versão ativa no primeiro registro da resposta.
- O painel do lote apresenta apenas resumo operacional e demográfico seguro: domicílios, pessoas (quando informado), faixa de renda (não valor exato), última visita e quantidade de questionários concluídos. Respostas de saúde, nomes e assinatura não aparecem no mapa/resumo; são carregadas somente no dossiê após autorização.
- A UI permite cadastrar domicílio, registrar visita, selecionar questionário ativo, preencher rascunho, validar obrigatoriedade/limites/tabela/assinatura, salvar e finalizar; respostas submetidas são somente leitura e correções ocorrem em nova visita.
- RLS limita domicílios, visitas e respostas a administradores municipais (`app_private.current_user_is_admin()`) e ACS ativos cujo e-mail autenticado corresponda ao cadastro e tenha vínculo ativo com a zona do lote. O banco atribui `acs_id` a partir do JWT; usuários não podem forjar o ACS responsável. Qualquer ACS com vínculo ativo na zona pode continuar um rascunho, mas uma resposta enviada é imutável. Remover acesso anônimo e não conceder leitura/escrita a qualquer usuário autenticado sem vínculo.
- Uma importação só aparece no Mapa territorial depois que `division_saved_at` é preenchido após todos os lotes terem sido gravados com sucesso; ao iniciar novo salvamento, o marcador é invalidado até a conclusão. Imports antigos só são marcados como salvos quando todas as geometrias válidas já têm zona. Policies também protegem consultas diretas às tabelas-base e restringem DXF privado, ACS, vínculos e gestão de questionários a administradores; ACS consulta somente mapas/lotes autorizados e questionários ativos.
- Componentes e lógica novos ficam em `src/components/census/territory/`; reutilizar o shell e o cliente Supabase existentes. A visão de resumo é um view com `security_invoker`, limitado aos campos necessários. Não adicionar amostras de dados pessoais nem persistência offline nesta etapa.
- A migration `202611091915_census_households_visits_responses.sql` é aditiva e não apaga registros; substitui policies abertas por acesso ADMIN/ACS vinculado. Foi aplicada ao Supabase compartilhado após autorização explícita em 9 de novembro de 2026; metadados de tabelas e policies foram verificados sem consultar respostas pessoais. Testes sintéticos e build passaram sem escrita de dados de teste. O PR #8 foi mesclado no commit `801a695c2f526cbfc0a21b960f371d8675d195a2`; o workflow Pages `42753046114` concluiu com sucesso, e a página pública/bundle foram verificados via HTTP 200 e marcadores do módulo territorial.


# Plano — Núcleo de Governança de Acessos e migração do ACS

## Objetivo
Evoluir o painel de Governança já existente, que hoje apenas cadastra secretarias, usuários e módulos, para um núcleo transversal de identidade, estrutura organizacional, papéis, permissões, atribuições e escopos. Migrar o cadastro atual de ACS para uma atribuição formal no módulo Saúde da Família/ACS, preservando vínculos de zona e lote.

## Implementação
- Criar no Supabase a hierarquia permanente do organograma em `municipal_org_units`, com pai, código, tipo, ordem, situação e descrição; omitir unidades temporárias identificadas por ano, processo ou PAD.
- Criar catálogos de `municipal_roles` e `municipal_permissions`, relações papel-permissão e atribuições por unidade.
- Criar concessões de módulo e escopo associadas à atribuição, com validade e auditoria.
- Migrar administradores existentes para Governança e usuários ACS vinculados para papel `ACS`, unidade Saúde da Família e módulo `census`, sem alterar vínculos territoriais atuais.
- Exigir no backend concessão central do módulo antes de liberar o acesso operacional, mantendo as políticas territoriais existentes para decidir quais lotes/domicílios o ACS pode consultar ou alterar.
- Ampliar o painel para administrar unidades organizacionais e apresentar atribuições, mantendo o convite por e-mail e o primeiro acesso do Supabase Auth.

## Estrutura do projeto
- `supabase/migrations/`: DDL, seed permanente e funções/RLS da Governança.
- `supabase/functions/invite-municipal-user/`: convite de identidade via Supabase Auth.
- `src/components/GovernancePanel.tsx`: painel de unidades, pessoas, papéis, módulos e atribuições.
- `src/lib/municipal-catalog.ts`: tipos e catálogo visual compartilhado.
- `src/components/census/`: módulo operacional ACS, consumidor da concessão central e do escopo territorial.

## Design
Estilo: **governança institucional clara**. Interface com abas, listas densas, hierarquia organizacional visível, estados de alto contraste e ações reversíveis. Azul petróleo e cinza institucional indicam controle; verde indica ativo/aprovado; âmbar indica pendência; vermelho indica inativo/revogado. Editar uma unidade não apaga histórico; inativar impede novos vínculos, preservando auditoria. Convites deixam explícito que a senha será criada pelo próprio usuário.
