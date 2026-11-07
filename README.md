# Inteligência Municipal

Novo frontend institucional da Prefeitura Municipal de Pitangueiras–PR. O projeto começa pela tela de login e será ampliado com módulos municipais, iniciando por Gestão de Frotas.

## Stack inicial

- React + TypeScript
- Vite
- Supabase Auth e banco principal
- Lucide React
- Identidade visual institucional com brasão municipal

## Desenvolvimento

```bash
cp .env.example .env.local
# preencher VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm install
npm run dev
```

## Escopo desta primeira entrega

A primeira tela implementada é o login institucional com autenticação por e-mail e senha via Supabase, recuperação de senha e estados de carregamento/erro. O brasão utilizado foi obtido da pasta de documentos de apoio do Google Drive.

O módulo legado `gestao-atas` não faz parte deste repositório e permanece preservado como fonte de referência funcional.
