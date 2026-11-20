# MatrixIA

Protótipo independente de front-end para uma visão executiva e transversal de uma prefeitura de pequeno porte. Ao entrar, o prefeito vê decisões que podem afetar o morador, solicitações e atrasos por secretaria, um resumo financeiro com data de fechamento e o panorama das onze áreas.

## Cenário demonstrativo

Os registros locais simulam uma cidade de 3.000 habitantes. As situações se relacionam: 36 solicitações administrativas abertas nas onze secretarias (7 fora do prazo); um micro-ônibus escolar indisponível, com rota reorganizada para 32 alunos; e, em um conjunto distinto, 36 encaminhamentos clínicos aguardando consulta, dos quais 8 há mais de 60 dias. A fila clínica não integra a soma de solicitações administrativas. Os dados financeiros comparam a receita recebida com o valor previsto até outubro.

**Tudo é fictício.** Nenhum nome de cidadão, saldo, contrato, fila, ocorrência ou número representa registro oficial de Pitangueiras ou de outro município. Os resumos por secretaria e as prioridades também identificam o cenário como simulado. A posição financeira fecha em 31/10/2026 (atualizada em 04/11); solicitações e demais situações usam como referência 19/11/2026, com carimbos de atualização por bloco. Gestão de Frota aparece apenas como área operacional transversal ligada à Administração, não como uma 12ª secretaria.

A aplicação usa React, Vite e TypeScript, lê dados de `src/data/mockData.ts` e **não se conecta ao Supabase, não autentica usuários, não chama APIs e não grava informações**. Login, back-end, integrações e conexão com IA ficam para etapas futuras.

## Executar localmente

```bash
cd MatrixIA
npm install
npm run dev
```

Validar o build de front-end:

```bash
npm run build
npm run preview
```
