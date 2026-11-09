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
