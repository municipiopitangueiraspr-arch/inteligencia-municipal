

## Nesta rodada — Campo territorial, jornada ACS e Questionários compartilhados

- [x] **Mapa e filtro de atuação:** disponibilizar mapa fictício com zonas, microáreas e lotes, estados de cobertura e painel do lote; aplicar automaticamente a microárea demonstrativa vinculada à persona ACS.
- [x] **Jornada guiada:** iniciar pelo lote e conduzir confirmação/criação do domicílio, seleção de família, busca de pessoa existente, aplicação de questionário e registro de visita em etapas curtas com progresso visual.
- [x] **Referências sem duplicação:** reutilizar `personId`, `familyId`, `householdId`, `addressId`, `areaId`, `teamId` e `professionalId` sempre que aplicável; manter pessoas, famílias, domicílios, endereços, unidades, equipes e profissionais nas coleções compartilhadas existentes.
- [x] **Pendências e rascunhos:** mostrar lotes sem contato ou aguardando conferência e respostas de questionário em rascunho, com atualização local dos estados e histórico operacional demonstrativo.
- [x] **Questionários transversais:** criar catálogo genérico com versões, público, perguntas e respostas; disponibilizar módulo compartilhado para Saúde e futuras secretarias sem duplicar questionários por pasta.
- [x] **Limites e validação:** manter dados fictícios, em memória e restritos à sessão; deixar explícito que o fluxo não é prontuário, transmissão oficial ou substituto de protocolos; validar `npm run build` e `git diff --check`. Não incluir `auditoria-cobertura-dados-saude.md`.
