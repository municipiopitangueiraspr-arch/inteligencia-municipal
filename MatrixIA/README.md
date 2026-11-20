# MatrixIA

Protótipo independente de front-end para uma visão executiva e transversal da gestão municipal. O prefeito começa por um resumo da prefeitura, pontos que merecem atenção e panorama das 11 secretarias. A navegação demonstra a diferença entre visão executiva e resumos por área; não implementa ainda os módulos operacionais dos servidores das secretarias.

## Escopo atual

Aplicação em React, Vite e TypeScript, com dados exclusivamente mockados em `src/data/mockData.ts`. **Não se conecta ao Supabase, não importa arquivos do aplicativo existente, não usa credenciais, não autentica usuários e não grava dados.** Os valores e o município mostrados são demonstrativos; não usar para decisões reais.

O diretório `MatrixIA/` é independente do app existente no repositório. O login, back-end, integração com IA e conexão a sistemas federais/estaduais/nacionais permanecem para etapas futuras.

## Executar

```bash
cd MatrixIA
npm install
npm run dev
```

Compilar para produção local:

```bash
npm run build
npm run preview
```
