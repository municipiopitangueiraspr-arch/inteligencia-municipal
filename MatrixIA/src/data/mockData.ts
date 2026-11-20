import {
  clinicalReferralSummary,
  simulatedTransportRecords,
} from "./dataLineage";

export type Status = "Em dia" | "Atenção" | "Crítico";
export type Severity = "Crítico" | "Atenção";

export type Department = {
  name: string;
  shortName: string;
  area: string;
  status: Status;
  summary: string;
  metric: string;
  metricLabel: string;
  trend: string;
  icon: string;
  openRequests: number;
  overdueRequests: number;
  nextAction: string;
  citizenImpact: string;
  relatedAreas?: string;
};

export type Priority = {
  level: Severity;
  title: string;
  description: string;
  department: string;
  owner: string;
  reference: string;
  action: string;
  impact: string;
  sourceId: string;
};

export const municipalityProfile = {
  name: "Pitangueiras",
  state: "Paraná",
  population: 3000,
  referenceDate: "19 de novembro de 2026",
  scenarioNote:
    "Cenário demonstrativo fictício para município de pequeno porte.",
};

// Solicitações administrativas registradas no painel: 36 abertas e 7 fora do prazo.
// A fila de encaminhamentos clínicos é outro conjunto e não entra nessa soma.
export const departments: Department[] = [
  {
    name: "Administração e Finanças",
    shortName: "Administração",
    area: "Gestão interna",
    status: "Em dia",
    summary: "A rotina financeira está dentro do cronograma do mês.",
    metric: "R$ 30,3 mi",
    metricLabel: "receita recebida até 31/out",
    trend: "R$ 750 mil abaixo do previsto no período",
    icon: "AF",
    openRequests: 3,
    overdueRequests: 0,
    nextAction:
      "Acompanhar a previsão de receita e a execução das despesas no fechamento mensal.",
    citizenImpact:
      "Antecipar diferenças entre a receita prevista e recebida ajuda a proteger a continuidade dos serviços básicos.",
  },
  {
    name: "Agricultura e Meio Ambiente",
    shortName: "Agricultura e Meio Ambiente",
    area: "Desenvolvimento rural",
    status: "Atenção",
    summary: "Dois pedidos de atendimento rural passaram do prazo combinado.",
    metric: "4",
    metricLabel: "solicitações em aberto",
    trend: "2 aguardam retorno há mais de 10 dias",
    icon: "AM",
    openRequests: 4,
    overdueRequests: 2,
    nextAction:
      "Confirmar com os produtores uma data para as duas visitas de campo pendentes.",
    citizenImpact:
      "Sem uma data de visita ou orientação, os produtores não conseguem planejar quando receberão o apoio solicitado.",
  },
  {
    name: "Assistência Social",
    shortName: "Assistência Social",
    area: "Proteção social",
    status: "Em dia",
    summary: "Os atendimentos prioritários do CRAS estão atualizados.",
    metric: "64",
    metricLabel: "atendimentos registrados em outubro",
    trend: "3 solicitações administrativas em aberto",
    icon: "AS",
    openRequests: 3,
    overdueRequests: 0,
    nextAction: "Manter o acompanhamento das famílias com retorno já agendado.",
    citizenImpact:
      "Retornos previsíveis reduzem deslocamentos desnecessários e ajudam as famílias a saber quando receberão atendimento.",
  },
  {
    name: "Cultura e Turismo",
    shortName: "Cultura e Turismo",
    area: "Cultura e eventos",
    status: "Em dia",
    summary:
      "As próximas atividades têm local e equipe responsáveis definidos.",
    metric: "3",
    metricLabel: "ações realizadas em outubro",
    trend: "2 atividades previstas até o fim do ano",
    icon: "CT",
    openRequests: 2,
    overdueRequests: 0,
    nextAction:
      "Confirmar os espaços e a divulgação das duas próximas atividades.",
    citizenImpact:
      "Uma agenda divulgada com antecedência facilita o acesso dos moradores às atividades e evita viagens sem necessidade.",
  },
  {
    name: "Desenvolvimento Econômico",
    shortName: "Desenvolvimento Econômico",
    area: "Emprego e renda",
    status: "Atenção",
    summary: "Um pedido de orientação a pequeno negócio aguarda retorno.",
    metric: "3",
    metricLabel: "solicitações em aberto",
    trend: "1 aguarda resposta há 8 dias",
    icon: "DE",
    openRequests: 3,
    overdueRequests: 1,
    nextAction:
      "Dar retorno ao empreendedor e registrar o próximo passo do atendimento.",
    citizenImpact:
      "Sem retorno, o empreendedor não sabe qual providência tomar nem quando poderá avançar com seu pedido.",
  },
  {
    name: "Educação",
    shortName: "Educação",
    area: "Rede de ensino",
    status: "Crítico",
    summary: `Um de ${simulatedTransportRecords.vehicles.length} micro-ônibus está parado; uma rota foi reorganizada.`,
    metric: `${simulatedTransportRecords.route.activeStudentCount} alunos`,
    metricLabel: "com rota escolar readequada",
    trend: `Micro-ônibus ${simulatedTransportRecords.maintenanceOrder.vehicleId} aguarda peça para os freios`,
    icon: "ED",
    openRequests: 4,
    overdueRequests: 0,
    nextAction:
      "Confirmar a entrega da peça e o retorno seguro do veículo antes da próxima rota.",
    citizenImpact:
      "A rota alternativa mantém o transporte de 32 alunos, mas precisa de acompanhamento para evitar atrasos e assegurar a continuidade do serviço.",
    relatedAreas: "Educação + Gestão de Frota da Administração",
  },
  {
    name: "Esporte e Lazer",
    shortName: "Esporte e Lazer",
    area: "Atividades e espaços",
    status: "Em dia",
    summary: "As turmas mantêm atividades regulares nos espaços municipais.",
    metric: "74",
    metricLabel: "participantes ativos em outubro",
    trend: "2 solicitações de rotina em aberto",
    icon: "EL",
    openRequests: 2,
    overdueRequests: 0,
    nextAction:
      "Conferir a agenda das turmas e a manutenção preventiva dos espaços.",
    citizenImpact:
      "A manutenção e a continuidade das turmas ajudam os moradores a usar os espaços públicos com regularidade.",
  },
  {
    name: "Obras",
    shortName: "Obras",
    area: "Infraestrutura",
    status: "Atenção",
    summary: "Duas ordens de serviço de manutenção rural estão atrasadas.",
    metric: "5",
    metricLabel: "ordens de serviço em aberto",
    trend: "2 aguardam equipe há mais de 10 dias",
    icon: "OB",
    openRequests: 5,
    overdueRequests: 2,
    nextAction:
      "Definir a data da equipe para manutenção dos dois trechos rurais pendentes.",
    citizenImpact:
      "A condição das estradas pode aumentar o tempo de deslocamento de moradores e veículos de serviço.",
  },
  {
    name: "Planejamento e Urbanismo",
    shortName: "Planejamento e Urbanismo",
    area: "Planejamento urbano",
    status: "Em dia",
    summary: "Os processos de análise estão dentro do prazo de atendimento.",
    metric: "7",
    metricLabel: "processos de alvará em análise",
    trend: "Nenhum processo vencido",
    icon: "PU",
    openRequests: 2,
    overdueRequests: 0,
    nextAction:
      "Atualizar os requerentes quando houver movimentação dos processos.",
    citizenImpact:
      "A atualização de cada etapa permite que moradores e comerciantes planejem obras e regularizações.",
  },
  {
    name: "Saúde e Vigilância Sanitária",
    shortName: "Saúde",
    area: "Atenção à saúde",
    status: "Atenção",
    summary: `${clinicalReferralSummary.waitingOver60Days} pessoas esperam há mais de 60 dias por consulta especializada.`,
    metric: `${clinicalReferralSummary.waitingOver60Days} pessoas`,
    metricLabel: "na fila clínica há mais de 60 dias",
    trend: `${clinicalReferralSummary.waiting} encaminhamentos clínicos aguardam consulta`,
    icon: "SV",
    openRequests: 5,
    overdueRequests: 2,
    nextAction:
      "Revisar a fila por tempo de espera e confirmar novas vagas com a regulação regional.",
    citizenImpact:
      "A demora pode prolongar o tempo até a avaliação especializada; a secretaria precisa revisar os casos com maior espera.",
  },
  {
    name: "Segurança Pública e Trânsito",
    shortName: "Segurança e Trânsito",
    area: "Segurança e mobilidade",
    status: "Em dia",
    summary:
      "Os registros de trânsito e as solicitações de sinalização estão atualizados.",
    metric: "12",
    metricLabel: "registros acompanhados em outubro",
    trend: "3 solicitações administrativas em aberto",
    icon: "ST",
    openRequests: 3,
    overdueRequests: 0,
    nextAction:
      "Manter a ronda de sinalização nos pontos indicados pela comunidade.",
    citizenImpact:
      "Acompanhar pedidos de sinalização ajuda a priorizar pontos de circulação usados por pedestres e motoristas.",
  },
];

export const priorities: Priority[] = [
  {
    level: "Crítico",
    title: "Transporte escolar com rota readequada",
    description: `O micro-ônibus ${simulatedTransportRecords.maintenanceOrder.vehicleId} está em manutenção desde 18/nov aguardando peça para os freios. A rota ${simulatedTransportRecords.route.id.replace("SIM-EDU-", "")} está em contingência, com ${simulatedTransportRecords.route.activeStudentCount} vínculos ativos de estudantes.`,
    department: "Educação",
    owner: "Educação + Gestão de Frota da Administração",
    reference: "Registro atualizado em 19/nov, 15h20",
    action:
      "Cobrar a oficina antes do fechamento de hoje, às 17h. Se o reparo não estiver concluído, manter a rota alternativa amanhã.",
    impact: `${simulatedTransportRecords.route.activeStudentCount} estudantes · ${simulatedTransportRecords.vehicles.filter((vehicle) => vehicle.status !== "Disponível").length} de ${simulatedTransportRecords.vehicles.length} micro-ônibus indisponível`,
    sourceId: "school-transport",
  },
  {
    level: "Atenção",
    title: `${clinicalReferralSummary.waitingOver60Days} pessoas aguardam consulta especializada há mais de 60 dias`,
    description: `São ${clinicalReferralSummary.waiting} encaminhamentos clínicos na regulação. Essa fila é separada das solicitações administrativas exibidas no cartão do município.`,
    department: "Saúde e Vigilância Sanitária",
    owner: "Regulação da Secretaria de Saúde",
    reference: "Posição simulada em 19/nov",
    action:
      "Revisar os oito casos com maior espera e confirmar a próxima oferta de vagas regionais.",
    impact: `${clinicalReferralSummary.waitingOver60Days} pessoas na faixa de maior espera`,
    sourceId: "clinical-referrals",
  },
  {
    level: "Atenção",
    title: "Dois trechos rurais aguardam manutenção",
    description:
      "Duas ordens de serviço estão abertas há mais de 10 dias. As equipes ainda não registraram data prevista para atendimento.",
    department: "Obras",
    owner: "Secretaria de Obras",
    reference: "Ordens de serviço atualizadas em 19/nov, 14h10",
    action: "Informar a sequência da equipe e uma previsão para cada trecho.",
    impact: "2 ordens de serviço fora do prazo",
    sourceId: "works-orders",
  },
  {
    level: "Atenção",
    title: "Dois pedidos de visita rural aguardam resposta",
    description:
      "As solicitações de orientação aos produtores estão abertas há mais de 10 dias sem data combinada para visita.",
    department: "Agricultura e Meio Ambiente",
    owner: "Equipe de atendimento rural",
    reference: "Solicitações atualizadas em 19/nov, 13h40",
    action:
      "Agendar as visitas ou informar aos solicitantes quando serão atendidos.",
    impact: "2 solicitações vencidas",
    sourceId: "rural-visits",
  },
  {
    level: "Atenção",
    title: "Empreendedor aguarda retorno da prefeitura",
    description:
      "Um pedido de orientação para pequeno negócio está sem resposta há oito dias.",
    department: "Desenvolvimento Econômico",
    owner: "Secretaria de Desenvolvimento Econômico",
    reference: "Atendimento atualizado em 19/nov, 11h05",
    action: "Registrar responsável pelo retorno e a providência combinada.",
    impact: "1 solicitação vencida",
    sourceId: "business-guidance",
  },
];

export const municipalitySnapshot = {
  previousMonthOpenRequests: 42,
  schoolBusesAvailable: simulatedTransportRecords.vehicles.filter(
    (vehicle) => vehicle.status === "Disponível",
  ).length,
  schoolBusesTotal: simulatedTransportRecords.vehicles.length,
  studentsAffectedByTransportChange:
    simulatedTransportRecords.route.activeStudentCount,
  specialtyReferralsWaiting: clinicalReferralSummary.waiting,
  specialtyReferralsOver60Days: clinicalReferralSummary.waitingOver60Days,
  primaryCareVisitsOctober: 1126,
  studentsEnrolled: 418,
  schoolAttendanceOctoberPercent: 94.2,
};

export const financialPosition = {
  fiscalYear: 2026,
  annualBudgetMillions: 37.2,
  revenueReceivedMillions: 30.3,
  revenuePlannedThroughOctoberMillions: 31.05,
  expenditureCommittedMillions: 27.5,
  expenditurePaidMillions: 23.8,
  referenceDate: "31/out/2026",
  updatedDate: "4/nov/2026",
};

export const lastUpdated = "19 de novembro de 2026, às 16:40";
