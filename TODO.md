# TODO — Módulo de Gestão de Frotas

## Shell e acesso ao módulo
- [ ] O usuário autenticado consegue abrir Gestão de Frotas a partir do dashboard.
- [ ] O módulo exibe navegação para Visão geral, Veículos, Abastecimentos, Postos, Motoristas e Configurações.
- [ ] A seção ativa permanece visível e o layout funciona em desktop e mobile.

## Visão geral
- [ ] Os indicadores consultam registros permitidos pelo Supabase: veículos ativos, abastecimentos do mês, pendências de conferência e alertas de comprovantes.
- [ ] O estado vazio explica o próximo passo e não apresenta dados fictícios como produção.

## Veículos
- [ ] Somente Gestor de Frotas ou Administrador pode cadastrar oficialmente veículos.
- [ ] O cadastro solicita placa, marca, modelo, ano, capacidade do tanque, tipo de combustível e unidade responsável quando disponíveis.
- [ ] A placa duplicada é rejeitada pelo banco e apresentada de forma compreensível.
- [ ] A situação e a capacidade do tanque ficam visíveis na listagem.

## Abastecimentos
- [ ] O gestor visualiza a fila de conferência conforme as policies RLS.
- [ ] A tela diferencia a data real do abastecimento da data de submissão.
- [ ] O valor total é exibido a partir do cálculo do banco.
- [ ] A secretaria responsável e a beneficiária aparecem separadamente quando houver cessão.
- [ ] O status `ENVIADO_PELO_POSTO` aparece como pendência de conferência.

## Dados do posto e motorista
- [ ] O posto é exibido com sua situação e representante principal.
- [ ] O motorista é exibido com vínculo e situação.

## Supabase e qualidade
- [ ] O cliente usa a sessão autenticada e não expõe chave administrativa.
- [ ] O build TypeScript/Vite passa sem erros.
- [ ] O manifesto `manus-routes.json` declara a rota do módulo.


## Esqueleto e acesso ao Censo Municipal — Etapa 2
- [ ] O Hall da intranet apresenta acesso ao Censo Municipal por cartão e por item de navegação desktop/mobile.
- [ ] O Censo abre dentro da aplicação autenticada existente; não cria login nem aplicação paralela.
- [ ] Ao alternar entre Frotas e Censo, a moldura do sistema mantém a mesma posição e comportamento: sidebar, marca/voltar, navegação, cabeçalho e área de conteúdo; mudam apenas as opções do módulo e seu conteúdo.
- [ ] O shell do Censo apresenta uma visão geral e área de mapa em estado vazio, indicando que a base cartográfica aguarda análise; não apresenta lotes, zonas, indicadores ou respostas fictícias como dados reais.
- [ ] A navegação do Censo inclui Gestão de DWG; a tela aceita seleção local de `.dwg` e `.dxf`, informa o arquivo selecionado nesta sessão e não afirma que ele foi salvo no Supabase enquanto a persistência não estiver conectada.
- [ ] A biblioteca de desenhos permanece vazia até existir arquivo no armazenamento municipal; a tela não lê o Google Drive em tempo de execução nem mostra um arquivo do Drive como já importado.
- [ ] A estrutura é utilizável em desktop, tablet e mobile e mantém a identidade visual institucional.
- [ ] Esta etapa não cria tabelas, permissões ou dados do Censo, nem altera os fluxos de Frotas e Portal do Fornecedor.
- [ ] O build TypeScript/Vite passa sem erros após a integração.

## Hall municipal em cards — redesign
- [x] Depois do login, o hall apresenta os módulos municipais em cards visuais centralizados e não exibe menu lateral no desktop nem navegação lateral móvel.
- [x] Cards de Gestão de Frotas e Censo Municipal abrem os callbacks já existentes; módulos sem navegação funcional são identificados como em preparação e não fingem ser acionáveis.
- [x] O hall mantém a identidade institucional, a identificação da conta e a ação de sair, sem alterar autenticação ou os menus internos dos módulos.
- [x] O hall funciona em desktop, tablet e celular e não mostra indicadores fictícios ou ações vazias.
- [x] O build TypeScript/Vite passa sem erros.

## Mapa do Censo — geometria, atribuição e seleção múltipla
- [x] Na importação, cada polilinha fechada com pelo menos três vértices e área positiva na camada `Lotes Urbanos` representa um lote; textos, endereços e rótulos desatualizados do DXF não são usados para nomear, validar ou classificar lotes.
- [x] Cada geometria importada recebe UUID próprio e fica associada ao polígono e ao registro do lote; a classificação e o salvamento não dependem de um identificador antigo do arquivo.
- [x] Polilinhas abertas ou sem área válida são ignoradas e a tela informa quantos elementos não foram importados.
- [x] Clique simples em um lote atribui a zona ativa imediatamente e pinta o polígono com a cor dessa zona; a divisão continua como rascunho até usar Salvar divisão.
- [x] O agente pode ativar seleção múltipla pelo botão ou usar Ctrl/Cmd+clique; lotes selecionados ficam destacados e podem receber juntos a zona ativa.
- [x] O mapa mantém pan por arraste no fundo, não captura o clique sobre o polígono, e permite ampliar/reduzir por roda e controles até 24x.
- [x] A correção do listener `wheel` usa `passive: false` e remove o listener ao desmontar/trocar o estado de carregamento.
- [x] O build TypeScript/Vite passa sem erros; lint direcionado não apresenta erros.

## Seleção de lotes por área no mapa do Censo
- [x] A tela oferece um modo separado `Selecionar por área`; enquanto ativo, arrastar no mapa desenha um retângulo sem deslocar o mapa.
- [x] Arrastar da esquerda para a direita seleciona polígonos totalmente contidos; arrastar da direita para a esquerda seleciona polígonos que cruzam ou estão dentro do retângulo.
- [x] O retângulo aparece durante a seleção e os lotes selecionados ficam destacados; Shift/Ctrl/Cmd acrescenta a nova seleção, e um clique curto no modo seleciona um lote isolado.
- [x] A tela mostra a quantidade selecionada, permite escolher a zona e oferece `Aplicar zona a N lote(s)` separadamente; aplicar altera a prévia local e somente `Salvar divisão` grava no banco.
- [x] `Esc` cancela a seleção e `Limpar seleção` continua disponível; clique simples e Ctrl/Cmd+clique existentes continuam funcionando fora do modo por área.
- [x] Testes sintéticos de janela/cruzamento e build TypeScript/Vite passam.

## Salvamento seguro da divisão do Censo
- [x] `Salvar divisão` atualiza registros existentes da importação por `import_id` e `id`; não usa upsert parcial que tente criar linhas sem `source_handle`/geometria.
- [x] Verifica UUIDs ausentes/duplicados e confirma que todos os IDs pertencem à importação antes de escrever; confere quantas linhas cada atualização realmente afetou.
- [x] Teste sintético e build passam, sem repetir a gravação no banco compartilhado.

## Entrada, hierarquia visual e confirmação de gravações no Censo
- [x] Ao entrar em Censo Municipal, abrir diretamente `Visão geral`; o cabeçalho identifica a seção ativa, e não abre `Preparar mapa` por padrão.
- [x] Em `Preparar mapa`, retirar o nome/descrição do arquivo importado da barra ao lado de `Salvar divisão`; mostrar um resumo visual dos lotes e posicionar um botão de salvar destacado junto ao painel de zonas.
- [x] Antes de criar zona, cadastrar ACS, vincular ACS a uma zona, importar mapa ou salvar divisão, pedir confirmação visual e não iniciar a escrita até o usuário confirmar.
- [x] Após confirmação, desabilitar repetições e mostrar spinner/mensagem clara enquanto houver upload ou gravação; informar sucesso ou falha com ícone e cor correspondentes.

## Permanência no módulo e limpeza do mapa
- [x] Atualizar a página em Censo (ou Frotas) mantém o usuário no mesmo módulo; voltar ao hall ou sair limpa o estado salvo.
- [x] Remover da legenda do mapa o popup/aviso `Zona ativa: ...`; a zona ativa continua identificável no painel de zonas.

## Gestão de questionários do Censo
- [x] A opção `Questionários` abre uma gestão persistente com lista, criação e edição de questionários, estado `Rascunho`/`Ativo`/`Inativo` e pré-visualização; é possível ativar e inativar sem excluir o formulário.
- [x] O editor permite cadastrar título/subtítulo/descrição, adicionar/remover/reordenar seções e perguntas, editar rótulos e textos de ajuda, definir obrigatoriedade, tipo de resposta, opções e validações adequadas ao tipo.
- [x] Tipos oferecidos incluem texto curto e longo, número, moeda, data, sim/não, escolha única e múltipla, tabela repetível e assinatura; a pré-visualização mostra os controles correspondentes sem enviar respostas.
- [x] Antes de salvar alterações ou ativar/inativar, aparece confirmação; enquanto grava, os controles ficam bloqueados e uma indicação visual mostra carregamento e o resultado de sucesso ou erro.
- [x] A migration `202611091853_census_questionnaires.sql` foi aplicada ao Supabase; ela cria a tabela/RLS e semeia a ficha inicial em `Rascunho`. Em 10/11/2026, a ficha foi verificada no banco como `Ativa`, versão 1; seu status atual foi apenas consultado, não alterado.
- [x] A ficha inicial tem o título `FICHA DE CADASTRO E ACOMPANHAMENTO DOMICILIAR`, subtítulo `Levantamento Socioeconômico, Habitacional e de Saúde Familiar`, campos de identificação, as quatro seções e as perguntas/opções do Google Doc fornecido.
- [x] A pergunta 1.2 representa os oito moradores com colunas `Nome / Parentesco do Morador` e `Idade`, incluindo a primeira linha `Responsável`; o encerramento inclui `Assinatura do Morador Responsável`.
- [x] Os dados de resposta dos domicílios não são coletados nesta tela de gestão; o banco armazena apenas a definição do questionário.

## Mapa territorial, domicílios, visitas e respostas
- [x] A tela `Mapa territorial` carrega a última divisão salva e apresenta cada lote com a cor da sua zona; pan e zoom permanecem acessíveis, e um clique em lote abre/atualiza o painel lateral sem navegar para fora do mapa. Bundle correspondente ao merge foi encontrado no Pages público (HTTP 200).
- [x] Um lote pode conter mais de um domicílio; cada domicílio fica vinculado ao lote, cada visita ao domicílio e cada resposta à visita e ao questionário utilizado.
- [x] A migration cria estrutura para domicílios, visitas e respostas; as respostas guardam valores JSONB e snapshot/version do questionário usado, preservando o histórico quando o formulário for editado. Não apagar domicílios, visitas ou respostas por exclusão do mapa/questionário.
- [x] O painel lateral mostra zona e identificação do lote, domicílios, quantidade de moradores quando conhecida, faixa de renda, quantidade de questionários concluídos e data da visita mais recente; valores exatos de renda, respostas de saúde, nomes de moradores e assinaturas não são expostos no resumo do mapa.
- [x] A tela permite cadastrar um domicílio e iniciar uma visita, escolher um questionário ativo, preencher respostas por seção e tipo, validar campos obrigatórios e limites, salvar rascunho e enviar; questionários inativos/rascunho não podem iniciar novas respostas.
- [x] A pergunta de tabela permite registrar moradores até o limite definido e a pergunta de assinatura captura traços; respostas submetidas ficam somente para leitura e uma correção exige nova visita.
- [x] O dossiê exibe histórico de visitas e respostas; usuários autorizados podem continuar rascunhos e abrir respostas submetidas sem alterar o snapshot do questionário.
- [x] RLS permite acesso apenas a administradores municipais e ACS ativos cuja conta autenticada corresponda ao cadastro ACS e esteja vinculada à zona do lote; usuários sem esse vínculo não leem nem gravam dados sensíveis, e nenhuma tabela/view é acessível a `anon`.
- [x] Toda escrita de domicílio, visita ou resposta exige confirmação visual, exibe carregamento enquanto grava e informa sucesso/erro; testes não criam dados pessoais no banco compartilhado.
- [x] Testes sintéticos de validação das respostas, seleção do mapa e gestão de questionários, build TypeScript/Vite, lint direcionado (sem erros; com avisos de `set-state-in-effect`) e análise sintática das 122 instruções SQL passaram; nenhuma resposta pessoal de teste foi gravada no banco compartilhado. O PR #8 foi mesclado e o workflow Pages 42753046114 concluiu com sucesso; página pública e bundle responderam HTTP 200.


## Dossiê do lote: código legível, ACS, domicílios e questionários
- [x] Ao clicar em um lote, o painel mostra a zona daquele lote, o ACS responsável se houver, a possibilidade administrativa de vincular um ACS especificamente àquele lote, o código legível do mapa (sem comandos de formatação CAD importados) e a quantidade de domicílios ativos vinculados ao lote.
- [x] A tela continua permitindo cadastrar um ou mais domicílios no lote, com identificação, confirmação antes da gravação e atualização imediata da quantidade e do dossiê após salvar.
- [x] Em cada domicílio, a tela oferece questionários ativos ainda não recebidos por aquele domicílio e permite iniciar uma visita já com o questionário escolhido; rascunhos e respostas submetidas contam como questionário já recebido e não são reapresentados como pendentes.
- [x] Se o domicílio já recebeu questionários, seu histórico permite abrir o snapshot e as respostas; respostas enviadas são somente leitura, e rascunhos existentes podem ser continuados sem alterar versões anteriores.
- [x] O vínculo direto ACS–lote persiste no Supabase, é administrável somente por administrador municipal e dá acesso ao lote ao ACS ativo cadastrado pelo mesmo e-mail autenticado sem revogar a cobertura existente por zona. Nenhuma leitura ou gravação é aberta a `anon`.
- [x] Os testes/build validam a limpeza do código importado, a apresentação do painel, o acesso por ACS direto ou por zona, o fluxo de questionários pendentes/histórico e a segurança da migration; os testes não gravam registros pessoais de demonstração no Supabase compartilhado.


### Publicação desta solicitação
Commit `429ed55` enviado ao branch `main`; o workflow GitHub Pages `42789420051` finalizou com sucesso. A página pública e o bundle atualizado foram verificados via HTTP 200, incluindo as ações de ACS por lote e questionários ativos pendentes.

## Hall organizado por secretarias
- [x] Depois do login existente, o hall apresenta cards com ícone destacado, nome e ação para acessar cada uma destas secretarias: Administração e Finanças; Agricultura e Meio Ambiente; Assistência Social; Cultura e Turismo; Desenvolvimento Econômico; Educação; Esporte e Lazer; Obras, Planejamento e Urbanismo; Saúde; Segurança Pública e Trânsito.
- [x] Ao acessar uma secretaria, a área correspondente apresenta somente os módulos atribuídos a ela: Administração e Finanças contém Gestão de Frotas, Atas e Pedidos, Compras Públicas e Atos Oficiais; Saúde contém Censo Municipal. Módulos sem fluxo funcional continuam identificados como em preparação, sem aparentar serem acessíveis.
- [x] Os demais cards de secretaria continuam disponíveis, mesmo sem módulos atribuídos nesta etapa; a navegação não cria permissões nem altera as regras existentes de acesso ou dados do Supabase.
- [x] A tela de login e o fluxo de autenticação permanecem inalterados.
- [x] O build TypeScript/Vite passa após a mudança.
- [ ] O front-end atualizado é publicado no GitHub Pages para teste remoto.
