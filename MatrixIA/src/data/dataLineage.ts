export type DataLineage = {
  title: string;
  modules: string[];
  records: string[];
  capturedFields: string[];
  calculation: string;
  note: string;
};

import {
  getHealthReferralSummary,
  initialHealthReferrals,
} from "./healthReferrals";

/** Catálogo para explicar de onde cada destaque demonstrativo poderia ser calculado. */
export const dataLineage: Record<string, DataLineage> = {
  "school-transport": {
    title: "Transporte escolar em contingência",
    modules: [
      "Educação → Transporte escolar",
      "Administração → Patrimônio e manutenção de frota",
    ],
    records: [
      "Veículo MIC-02 · patrimônio SIM-PAT-002",
      "Ordem de manutenção SIM-MAN-014 · aberta em 18/nov · freios · aguardando peça",
      "Rota SIM-EDU-ROT-07 · 32 vínculos ativos de estudantes · situação contingência",
    ],
    capturedFields: [
      "veículo: identificador, tipo e situação operacional",
      "ordem: veículo relacionado, defeito, data de abertura, situação e previsão",
      "rota: trajeto, período, estudantes vinculados, veículo e situação",
      "contingência: rota alternativa, início, fim e justificativa",
    ],
    calculation:
      "Cruzar o veículo da rota com o inventário e as ordens de manutenção; quando o veículo não está disponível e a rota está em contingência, contar os vínculos ativos de estudantes e gerar a prioridade. O total de 3 veículos também vem do inventário.",
    note: "Todos os códigos, estados e vínculos são registros sintéticos do protótipo. Nenhuma ocorrência real foi importada.",
  },
  "clinical-referrals": {
    title: "Fila clínica de encaminhamentos especializados",
    modules: ["Saúde → Encaminhamentos e regulação"],
    records: [
      "36 encaminhamentos simulados em situação aguardando vaga",
      "8 registros de encaminhamento com data de entrada há mais de 60 dias",
    ],
    capturedFields: [
      "identificador do encaminhamento e pessoa vinculada",
      "origem, especialidade, data de encaminhamento e destino",
      "situação atual, datas de atualização e oferta/aceite de vaga",
    ],
    calculation:
      "Contar encaminhamentos ainda aguardando vaga no período; calcular o tempo desde a data de encaminhamento e contar separadamente os que excedem 60 dias. Essa fila não soma nem substitui solicitações administrativas municipais.",
    note: "Fila, datas e identificadores são fictícios e demonstram registros possíveis, não pessoas ou atendimentos reais.",
  },
  "works-orders": {
    title: "Ordens de manutenção rural fora do prazo",
    modules: ["Obras → Solicitações e ordens de serviço"],
    records: [
      "Ordem SIM-OBR-021 · trecho rural R-04 · aberta em 07/nov · sem conclusão",
      "Ordem SIM-OBR-022 · trecho rural R-09 · aberta em 08/nov · sem conclusão",
    ],
    capturedFields: [
      "local/trecho, descrição do problema e origem da solicitação",
      "data de abertura, prazo previsto, prioridade e situação",
      "equipe/equipamento designado, início e conclusão do serviço",
    ],
    calculation:
      "Filtrar ordens não concluídas cujo prazo previsto é anterior à data de referência; agrupar por secretaria/local e ordenar pelo tempo em aberto.",
    note: "Os dois trechos e identificadores são fictícios; devem ser substituídos por registros cadastrados para gerar dado real.",
  },
  "rural-visits": {
    title: "Pedidos de atendimento rural aguardando agendamento",
    modules: ["Agricultura e Meio Ambiente → Atendimento rural"],
    records: [
      "Solicitações SIM-AGR-031 e SIM-AGR-032 · visita de orientação · sem data agendada",
    ],
    capturedFields: [
      "solicitante/propriedade, tipo de apoio, local e data de entrada",
      "equipe responsável, prioridade, prazo, data combinada e situação",
      "data da visita, providência e retorno combinado",
    ],
    calculation:
      "Contar pedidos de visita sem agendamento que passaram do prazo de retorno cadastrado; encaminhar o resumo à fila da secretaria.",
    note: "Os pedidos são sintéticos e não identificam produtores reais.",
  },
  "business-guidance": {
    title: "Pedido de orientação econômica aguardando retorno",
    modules: ["Desenvolvimento Econômico → Atendimento ao empreendedor"],
    records: [
      "Atendimento SIM-DEC-008 · orientação a pequeno negócio · sem retorno registrado",
    ],
    capturedFields: [
      "empresa/empreendedor, assunto, canal e data de recebimento",
      "responsável, providência, prazo e histórico de contato",
      "situação e data de conclusão/retorno",
    ],
    calculation:
      "Identificar atendimentos em aberto sem interação registrada no prazo definido para aquele tipo de serviço.",
    note: "O identificador e o pedido são inventados para o protótipo.",
  },
};

const studentRouteLinks = Array.from({ length: 32 }, (_, index) => ({
  studentId: `SIM-EDU-ALUNO-${String(index + 1).padStart(3, "0")}`,
  routeId: "SIM-EDU-ROT-07",
  active: true,
}));

export const simulatedTransportRecords = {
  vehicles: [
    { id: "MIC-01", status: "Disponível" },
    { id: "MIC-02", status: "Em manutenção" },
    { id: "MIC-03", status: "Disponível" },
  ],
  maintenanceOrder: {
    id: "SIM-MAN-014",
    vehicleId: "MIC-02",
    openedAt: "2026-11-18",
    issue: "Freios",
    status: "Aguardando peça",
  },
  route: {
    id: "SIM-EDU-ROT-07",
    vehicleId: "MIC-02",
    activeStudentCount: studentRouteLinks.filter((link) => link.active).length,
    status: "Contingência",
    alternativeRouteId: "SIM-EDU-ROT-07B",
  },
  studentRouteLinks,
};

export const simulatedClinicalReferrals =
  initialHealthReferrals.referrals;

export const clinicalReferralSummary = getHealthReferralSummary(
  simulatedClinicalReferrals,
  "2026-11-19",
);
