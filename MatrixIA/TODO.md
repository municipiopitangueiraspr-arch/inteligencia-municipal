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
- [x] Validar a implementação: Prettier aplicado; `npm run build` (TypeScript e Vite) aprovado; `git diff --check` sem erros; cinco `sourceId` de prioridades resolvem para trilhas existentes; somas administrativas do mock conferidas (36 abertas e 7 atrasadas); prévia HTTP 200; manifesto `/manus-routes.json` HTTP 200.
- [ ] Salvar as alterações de produto e documentação em `main`, sem incluir a allowlist de host temporária usada apenas para servir a prévia desta sessão.

Os números, pessoas, entidades, datas, eventos e identificadores desta demonstração são fictícios; não foram extraídos de cadastros ou fontes oficiais de Pitangueiras. A interface não acessa dados oficiais, não usa autenticação real e não persiste alterações. As trilhas em `src/data/dataLineage.ts` demonstram que cada resumo pode ser produzido por registros operacionais cadastráveis e regras explícitas, mas não comprovam a ocorrência real dos eventos mostrados.
