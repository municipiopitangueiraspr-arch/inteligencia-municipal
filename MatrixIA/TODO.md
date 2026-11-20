# MatrixIA — andamento

## Entregue anteriormente

- [x] Subprojeto isolado React + Vite + TypeScript; mantém a aplicação existente conectada ao Supabase sem alterações.
- [x] Visão inicial do prefeito Samuel Teixeira, orientada a município fictício de cerca de 3.000 habitantes, com decisões, finanças, solicitações administrativas e panorama das onze secretarias.
- [x] Mocks conectados a um cenário comum, identidade azul institucional e chips de status sólidos de alto contraste.

## Nesta rodada — implementado

- [x] Implementar uma tela de entrada MatrixIA utilizável no protótipo, com os acessos demonstrativos **Prefeito**, **Secretário** e **Operador**, e transição funcional para a experiência escolhida. A entrada deixa claro que login e credenciais são apenas demonstração.
- [x] Ao selecionar **Prefeito**, abrir a visão executiva como tela inicial completa: indicadores, resumo executivo, prioridades, finanças, panorama das onze secretarias, busca local, notificações, ajuda e detalhes de origem. A navegação principal não usa botões sem ação nem chamadas de recurso “em construção”.
- [x] Entregar uma entrada funcional de **Secretário**, com escolha entre as onze secretarias e um espaço de trabalho com indicadores demonstrativos, filas, próximos passos, serviços/módulos previstos, vínculos transversais e formulário de atualização. A atualização aparece na pasta a que pertence, somente em memória nesta sessão.
- [x] Entregar uma entrada funcional de **Operador**, com escolha de persona funcional, agenda/fila e formulário demonstrativo coerente com a atividade; os registros criados exibem identificador, hora e valores/rótulos originais dos campos, permanecem na sessão e não são persistidos.
- [x] Tornar verificável a procedência dos destaques: abrir módulos de origem, tipos de registro, campos cadastráveis e regra de cálculo. O cenário de transporte relaciona veículo, ordem de manutenção, rota em contingência e vínculos ativos de estudantes. A fila clínica é calculada a partir de encaminhamentos e permanece distinta das solicitações administrativas.
- [x] Documentar em `plan.md` a visão da plataforma final: camadas transversais, cadastros compartilhados, módulos das onze secretarias, fluxos entre pastas, painéis por experiência e caminho de exportações nacionais/estaduais/federais, sem restringir a visão futura pelas limitações técnicas desta etapa.
- [x] Validar a implementação anterior: Prettier aplicado; `npm run build` (TypeScript e Vite) aprovado; `git diff --check` sem erros; cinco `sourceId` de prioridades resolvem para trilhas existentes; somas administrativas do mock conferidas (36 abertas e 7 atrasadas); prévia HTTP 200; manifesto `/manus-routes.json` HTTP 200.
- [x] Salvar as alterações anteriores de produto e documentação em `main`, sem incluir a allowlist de host temporária usada apenas para servir a prévia desta sessão; commit de produto publicado em `f3fca08`.

Os números, pessoas, entidades, datas, eventos e identificadores desta demonstração são fictícios; não foram extraídos de cadastros ou fontes oficiais de Pitangueiras. A interface não acessa dados oficiais, não usa autenticação real e não persiste alterações. As trilhas em `src/data/dataLineage.ts` demonstram que cada resumo pode ser produzido por registros operacionais cadastráveis e regras explícitas, mas não comprovam a ocorrência real dos eventos mostrados.

## Nesta rodada — Solicitações e Protocolos

- [x] **Cadastro pelo operador:** disponibilizar tela/formulário de demanda com assunto, descrição, categoria, solicitante, contato opcional, localização, canal de entrada, secretaria responsável e prioridade; validar campos obrigatórios, criar registro único com protocolo demonstrativo e mostrar confirmação com número gerado.
- [x] **Registro transversal compartilhado:** cada solicitação deve conter protocolo, dados cadastrados, origem demonstrativa, estado, responsável, datas de abertura/prazo e histórico cronológico; novos registros feitos pelo operador devem aparecer imediatamente na fila da secretaria responsável e nos resumos do prefeito.
- [x] **Acompanhamento pela secretaria:** a fila deve ser filtrável pela secretaria selecionada, mostrar prazo/prioridade/solicitante e permitir atualizar situação e responsável, registrando cada alteração no histórico do mesmo protocolo.
- [x] **Visão do prefeito:** calcular solicitações abertas, vencidas e distribuição por secretaria a partir do mesmo conjunto de registros; permitir consultar a lista e abrir detalhes/histórico sem misturar encaminhamentos clínicos especializados.
- [x] **Dados demonstrativos coerentes:** preservar inicialmente os totais anteriores de 36 solicitações administrativas abertas e 7 vencidas, identificando registros semente como fictícios e mantendo contagens derivadas dos registros, não em contadores paralelos.
- [x] **Limite desta etapa:** armazenar tudo somente em memória no estado da aplicação; não integrar backend, Supabase, autenticação ou persistência. Deixar explícito que dados semente e cadastros feitos na demonstração são fictícios e que os novos registros desaparecem ao encerrar/recarregar a sessão.
- [x] **Entrega e revisão:** atualizar arquitetura funcional se necessário; aplicar formatação, validar compilação e consistência dos totais, revisar integração ponta a ponta e salvar apenas arquivos de produto/documentação, sem incluir a alteração temporária em `vite.config.ts`.
