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
- [ ] O shell do Censo apresenta uma visão geral e área de mapa em estado vazio, indicando que a base cartográfica aguarda análise; não apresenta lotes, zonas, indicadores ou respostas fictícias como dados reais.
- [ ] A estrutura é utilizável em desktop, tablet e mobile e mantém a identidade visual institucional.
- [ ] Esta etapa não cria tabelas, permissões ou dados do Censo, nem altera os fluxos de Frotas e Portal do Fornecedor.
- [ ] O build TypeScript/Vite passa sem erros após a integração.
