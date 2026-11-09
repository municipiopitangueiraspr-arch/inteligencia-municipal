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
