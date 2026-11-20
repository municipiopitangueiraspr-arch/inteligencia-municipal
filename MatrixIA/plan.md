# MatrixIA — plano do protótipo de front-end

## Objetivo e limites

Construir um protótipo independente em React, Vite e TypeScript para apresentar ao prefeito uma visão municipal agregada, legível e orientada a prioridades. A primeira entrega é o painel inicial após login (o login fica para depois). Toda informação é demonstrativa, armazenada em mocks locais; este diretório não importa o cliente Supabase do app existente, não chama APIs e não altera o projeto raiz.

## Experiência recomendada

- O prefeito inicia em **Visão geral**, não em um módulo operacional de secretaria.
- Exibir poucos sinais explicados em linguagem simples: serviços no prazo, solicitações aguardando atenção, execução orçamentária ilustrativa e variação de atendimento.
- Dar destaque às prioridades e explicar por que merecem atenção; evitar depender de gráficos densos ou jargão.
- Mostrar um panorama das onze secretarias, com estado resumido e caminho para aprofundar.
- Direcionar o acesso de secretário para a sua área operacional. No futuro, acesso e escopo serão controlados por função; neste protótipo, o menu apenas demonstra a arquitetura.
- Identificar permanentemente os dados como fictícios; não apresentar estimativas mock como informação municipal real.

## Tecnologia e estrutura

Subprojeto Vite isolado na pasta `MatrixIA/`, com `src/data/mockData.ts` (fonte de dados demonstrativos), `src/App.tsx` (layout e navegação demonstrativa), `src/styles.css` (estilos responsivos), `src/main.tsx` (bootstrap) e `public/manus-routes.json` (inventário de rota). Dependências instaladas somente no subprojeto. Sem autenticação, persistência, Supabase, API, exportação ou integrações nesta etapa.

## Design

- **Sala de situação editorial (0,07):** painel de leitura rápida com hierarquia de manchetes e estados claros. Escolhido: comunica gestão e prioridade sem transformar o produto em um sistema de BI.
- **Centro cívico luminoso (0,04):** interface pública mais clara, cartões mais leves e linguagem acolhedora.
- **Console de dados técnico (0,03):** interface densa com mapas, grades e métricas compactas.

### Direção escolhida: sala de situação editorial

**Movimento:** dashboard editorial contemporâneo, inspirado em salas de situação cívicas, evitando estética de terminal técnico.

**Princípios:** hierarquia clara; linguagem cotidiana antes do indicador; atenção visual reservada para o que requer ação; densidade adaptável ao tamanho da tela.

**Cores:** azul-petróleo profundo para confiança e estrutura; fundo marfim frio para reduzir cansaço; verde para andamento saudável; âmbar para atenção sem alarmismo; vermelho somente para risco importante.

**Layout:** navegação lateral compacta, cabeçalho contextual e uma coluna principal de leitura com destaque horizontal para o resumo municipal e lista de prioridades; visão das secretarias em cartões compactos.

**Elementos assinatura:** faixa “Em poucas palavras” com síntese narrativa; marcadores de estado textuais acompanhados de cor; rótulo persistente “Dados demonstrativos”.

**Interação:** clique em secretaria abre seu resumo demonstrativo; navegação de abas distingue visão executiva de áreas; ações são reversíveis e não simulam alterações persistidas.

**Animação:** transições curtas (120–180 ms) em hover e navegação; respeitar `prefers-reduced-motion`; sem gráficos animados que distraiam da leitura.

**Tipografia:** system stack sans-serif para alta legibilidade, títulos semibold e números tabulares; corpo 14–16 px, títulos com contraste de escala.

**Essência da marca:** “A prefeitura inteira, explicada para quem precisa decidir.” Personalidade: clara, confiável, humana.

**Voz:** direta, explicativa e sem jargão. Exemplos: “Veja o que precisa de atenção hoje.” / “Este número está acima do mês passado.”

**Marca e cor assinatura:** wordmark tipográfico “MatrixIA” junto a símbolo abstrato de três módulos ligados; azul-petróleo como cor de marca.
