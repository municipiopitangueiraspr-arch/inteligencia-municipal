# MatrixIA — plano do protótipo de front-end

## Objetivo e limites

Construir um protótipo independente em React, Vite e TypeScript que ajude o prefeito de uma cidade simulada de 3.000 habitantes a entender o que exige decisão, quais serviços estão atrasados e como está a execução financeira, sem obrigá-lo a abrir onze sistemas. A primeira entrega é o painel inicial, sem login, back-end, Supabase, persistência, APIs, IA ou dados municipais reais.

## Experiência do prefeito

A primeira tela abre com uma síntese do que pode afetar o morador; prioridades explicam o contexto, o impacto e o próximo passo; a posição financeira separa orçamento aprovado, receita recebida, previsão acumulada e despesas empenhadas/pagas; o panorama mostra as onze secretarias sem transformar a tela em um relatório técnico. Os resumos das secretarias apontam solicitações administrativas abertas, atrasos, um indicador operacional e a ação seguinte. Esta visão executiva é diferente da futura tela operacional do secretário.

## Integridade dos dados demonstrativos

O conjunto de mocks descreve um cenário explicitamente fictício para uma prefeitura de cerca de 3 mil moradores. Os totais das solicitações administrativas são derivados dos registros das onze secretarias: 36 abertas, 7 atrasadas. Essa central é distinta da fila clínica de saúde, que tem 36 encaminhamentos aguardando consulta, 8 há mais de 60 dias. O cenário liga transporte escolar (1 de 3 micro-ônibus indisponível e rota readequada para 32 alunos), saúde, obras (duas ordens de serviço atrasadas) e receita (R$ 30,3 milhões recebidos contra R$ 31,05 milhões previstos até outubro). Cada secretaria deve mostrar consequência concreta para o morador; responsáveis e prazos devem ser coerentes com a hora de atualização. Gestão de Frota é apoio operacional transversal, não uma 12ª secretaria. Manter visíveis os períodos de referência e os avisos de simulação em resumos e prioridades. Não tratar os dados como indicadores oficiais nem usá-los para decisões reais.

## Tecnologia e estrutura

Subprojeto Vite isolado na pasta `MatrixIA/`, com `src/data/mockData.ts` como fonte local demonstrativa, `src/App.tsx` para visão executiva, navegação e resumos de secretaria, `src/styles.css` para identidade e responsividade, `src/main.tsx` para inicialização e `public/manus-routes.json` para declarar a rota inicial. Dependências ficam isoladas da aplicação raiz.

## Direção visual

**Movimento:** painel cívico executivo contemporâneo, com linguagem direta e hierarquia de sala de situação.

**Princípios:** mostrar impacto antes do jargão; priorizar decisões e prazos; dar contexto e período a cada número; manter boa leitura em telas pequenas.

**Cores:** azul institucional forte para navegação, títulos e informação estrutural; fundo claro para leitura; chips de estado com cores sólidas e texto branco de contraste: verde para em dia, âmbar/laranja escuro para atenção e vermelho para crítico. Ícone e texto acompanham a cor para não depender apenas dela.

**Layout:** navegação lateral compacta; panorama e indicadores executivos na primeira dobra; prioridades junto ao painel financeiro; todas as onze secretarias abaixo para leitura transversal.

**Elementos assinatura:** aviso persistente “Cenário simulado · 3.000 habitantes”; faixa de decisão do dia; “próximo passo” associado ao impacto para o cidadão; status textual em chip sólido.

**Interação:** expansão das cinco prioridades, atalho para resumo de secretaria, navegação responsiva; nenhum botão deve sugerir gravação ou integração real ainda inexistente.

**Animação:** transições curtas, sem motion excessivo, respeitando `prefers-reduced-motion`.

**Tipografia:** system sans-serif de alta legibilidade, títulos semibold e hierarquia curta; valores financeiros e contagens com alinhamento visual claro.

**Essência da marca:** “A prefeitura inteira, explicada para quem precisa decidir.” Personalidade: clara, confiável e prática. Voz: direta e sem jargão — “Veja o que precisa de atenção hoje”; “Esta diferença compara o realizado com a previsão até outubro”. Marca: wordmark MatrixIA e símbolo geométrico de três módulos conectados; assinatura azul institucional.
