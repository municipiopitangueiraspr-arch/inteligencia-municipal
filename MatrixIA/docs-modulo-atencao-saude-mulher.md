# Referências do módulo — Atenção à Saúde da Mulher, Pré-Natal e Puerpério

## Documentos-base

- MatrixIA — visão da plataforma e escopo do protótipo: https://docs.google.com/document/d/1-YeJEYlqKIgISkx26Va-B930pUBiV45g/edit?usp=sharing&ouid=116818890489337337294&rtpof=true&sd=true
- Mapa nacional de transmissões por secretaria municipal: https://docs.google.com/document/d/1rx4t8CVQLgt8sSLCOHQ24ikqzg4eL5tk/edit?usp=sharing&ouid=116818890489337337294&rtpof=true&sd=true
- Sistemas estaduais do Paraná e dados municipais: https://docs.google.com/document/d/1sd66WBmu-CWy4k30IHOjZlJLz9rPSN7x/edit?usp=sharing&ouid=116818890489337337294&rtpof=true&sd=true

## Pontos aplicados

O documento de visão pede que qualquer indicador seja derivado de registros operacionais identificáveis, com origem e regra de composição explicáveis. O MatrixIA é um protótipo de front-end: os registros são fictícios, em memória, não autenticados e não persistidos. Referências compartilhadas podem ser reutilizadas, mas eventos clínicos continuam no módulo de origem.

Os documentos de transmissões distinguem registro municipal de atenção primária, eventos vitais e envio a sistemas nacionais. O fluxo de SINASC é relativo a Declarações de Nascido Vivo e nascimento; a documentação afirma que não substitui o registro civil. O texto estadual/federal ressalva que o Município não deve presumir sistemas, perfis ou integrações disponíveis nem exportar uma base integral de prontuário. Os destinos, obrigações, campos e prazos dependem do fluxo e do sistema oficial aplicável.

Por isso, a implementação demonstra apenas a organização de etapas administrativas do acompanhamento (pré-natal, registro de nascimento e puerpério), a ligação a uma referência municipal sintética e pendências de documentação/registro com datas demonstrativas. Os totais derivam dos casos e pendências apresentados. Não inclui semanas gestacionais, classificação de risco, sintomas, exames, tratamento, plano clínico, recomendações, alertas clínicos ou prazos assistenciais prescritos. Não envia dados a e-SUS APS/Siaps, SINASC, RNDS, CARE-PR ou qualquer sistema externo, nem os representa como integrados.

Aviso persistente: dados e identificadores fictícios; não inserir informações reais. O módulo apoia demonstração de fluxo administrativo e não oferece conduta clínica, não substitui avaliação profissional, protocolos vigentes, prontuário, sistema oficial, nem transmissão oficial. Alterações ficam somente na sessão e desaparecem ao recarregar ou encerrar.
