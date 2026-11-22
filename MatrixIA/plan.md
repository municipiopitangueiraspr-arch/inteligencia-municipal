

## Módulo de Saúde — Campo territorial, lotes e questionários compartilhados

A experiência de campo começa pelo mapa fictício, não por um formulário genérico. `FieldworkModule.tsx` apresenta zonas/microáreas, lotes, estados de cobertura, dossiê do lote, pendências e rascunhos. Na persona ACS, o filtro é automático para a microárea demonstrativa do profissional; na Secretaria, a equipe pode consultar as áreas sintéticas do cenário. Os lotes guardam somente associações e eventos da jornada, apontando por IDs para área, domicílio, família, pessoa, profissional e questionário.

A jornada guiada permite confirmar/criar o domicílio mínimo quando não há referência, escolher família e pessoa existentes, aplicar um questionário ativo e registrar a visita. O cadastro consulta e atualiza a coleção única de `peopleRegistry` por referências; não cria uma base paralela de pessoas, famílias, endereços ou domicílios. Visita e resposta permanecem fatos operacionais próprios, com estados de concluído, retorno necessário, sem contato, pendência ou rascunho.

`sharedQuestionnaires.ts` define um contrato genérico para catálogo, versão, público, perguntas e respostas. `SharedQuestionnairesModule.tsx` expõe o catálogo para reutilização por Saúde, Assistência Social, Educação e outras secretarias futuras. A aplicação atual é fictícia, local à sessão e administrativa: não transmite dados, não substitui protocolos, prontuários ou sistemas oficiais e não implementa autenticação, persistência, exportação ou integração cartográfica.
