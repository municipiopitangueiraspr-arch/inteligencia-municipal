# Plano — Módulo de Gestão de Frotas

## Objetivo
Implementar a primeira camada operacional do módulo em React, preservando o login e o dashboard existentes, com integração ao Supabase principal.

## Escopo desta entrega
- Entrada do módulo a partir do dashboard;
- Shell visual próprio para Frotas;
- Visão geral com indicadores reais;
- Cadastro/listagem de veículos;
- Fila de conferência de abastecimentos;
- Consulta de postos e motoristas;
- Ação inicial de cadastro de veículo;
- Responsividade para desktop e mobile;
- Rota declarada em `public/manus-routes.json`.

## Decisões de implementação
- React + TypeScript + Vite, reutilizando `lucide-react`;
- Supabase JS já configurado em `src/lib/supabase.ts`;
- Componentes concentrados em `src/components/fleet/`;
- O módulo consulta apenas registros permitidos pelas policies RLS;
- A primeira entrega não cria relatórios, manutenção ou custos consolidados;
- Dados vazios e erros de acesso terão estados visuais explícitos.

## Design

### Estilos considerados
- **Sala de controle institucional** (0,07): painel denso, escuro e orientado a status.
- **Prefeitura editorial** (0,05): cartões claros, tipografia documental e detalhes dourados.
- **Operação de campo** (0,08): alto contraste, ações rápidas e status proeminentes.

### Estilo escolhido: Sala de controle institucional

**Movimento:** dashboard operacional municipal com navegação lateral, áreas de trabalho claras e acentos de estado.

**Princípios:** hierarquia rápida, confiança documental, status sempre visível e ações no contexto.

**Paleta:** navy institucional para navegação e autoridade; azul petróleo para operações; dourado para decisões e atenção; verde para conferido; âmbar e vermelho para pendências.

**Layout:** sidebar vertical no desktop, faixa contextual no conteúdo e tabelas densas com filtros; no mobile, a navegação vira uma faixa horizontal rolável.

**Elementos de assinatura:** indicador lateral dourado da seção ativa, chips de situação, cabeçalhos com kicker e cards de métrica com ícone funcional.

**Interação:** toda ação destrutiva ou de validação deverá ser explícita; estados de carregamento e vazio devem explicar o próximo passo.

**Animação:** transições curtas de 160–220ms, sem movimento decorativo; entradas de cartões podem usar fade/translate leve.

**Tipografia:** Manrope para títulos e números; DM Sans para conteúdo, tabelas e controles.

**Essência:** o posto de comando confiável para registrar, conferir e acompanhar a frota municipal.

**Tom:** direto, administrativo e orientado a decisão. Exemplos: “Abastecimentos aguardam conferência” e “Cadastre um veículo para iniciar o controle operacional”.

## Estrutura
- `src/components/FleetModule.tsx`: shell e navegação do módulo.
- `src/components/FleetModule.css`: identidade visual e responsividade.
- `src/App.tsx`: alternância entre dashboard e Frotas.
- `src/components/Dashboard.tsx`: entrada do módulo.
- `public/manus-routes.json`: rotas declaradas.
