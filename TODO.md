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
