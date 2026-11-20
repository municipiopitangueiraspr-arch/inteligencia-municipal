export type Status = "Em dia" | "Atenção" | "Crítico";

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
};

export const departments: Department[] = [
  {
    name: "Administração e Finanças",
    shortName: "Administração",
    area: "Gestão interna",
    status: "Em dia",
    summary: "Processos administrativos dentro do ritmo esperado.",
    metric: "92%",
    metricLabel: "processos no prazo",
    trend: "+4% neste mês",
    icon: "AF",
  },
  {
    name: "Agricultura e Meio Ambiente",
    shortName: "Agricultura e Meio Ambiente",
    area: "Desenvolvimento rural",
    status: "Atenção",
    summary: "Há solicitações rurais aguardando encaminhamento.",
    metric: "18",
    metricLabel: "solicitações abertas",
    trend: "6 há mais de 7 dias",
    icon: "AM",
  },
  {
    name: "Assistência Social",
    shortName: "Assistência Social",
    area: "Proteção social",
    status: "Em dia",
    summary: "Acompanhamentos prioritários estão atualizados.",
    metric: "96%",
    metricLabel: "acompanhamentos em dia",
    trend: "+2% neste mês",
    icon: "AS",
  },
  {
    name: "Cultura e Turismo",
    shortName: "Cultura e Turismo",
    area: "Cultura e eventos",
    status: "Em dia",
    summary: "Agenda cultural e ações previstas em andamento.",
    metric: "8",
    metricLabel: "ações programadas",
    trend: "Próximos 30 dias",
    icon: "CT",
  },
  {
    name: "Desenvolvimento Econômico",
    shortName: "Desenvolvimento Econômico",
    area: "Emprego e renda",
    status: "Atenção",
    summary: "Atendimentos a empreendedores pedem acompanhamento.",
    metric: "27",
    metricLabel: "atendimentos no mês",
    trend: "5 aguardam retorno",
    icon: "DE",
  },
  {
    name: "Educação",
    shortName: "Educação",
    area: "Rede de ensino",
    status: "Em dia",
    summary: "Frequência e calendário escolar acompanhados.",
    metric: "94%",
    metricLabel: "frequência registrada",
    trend: "+1,2% neste mês",
    icon: "ED",
  },
  {
    name: "Esporte e Lazer",
    shortName: "Esporte e Lazer",
    area: "Atividades e espaços",
    status: "Em dia",
    summary: "Atividades e manutenção dos espaços em curso.",
    metric: "12",
    metricLabel: "turmas ativas",
    trend: "4 espaços atendidos",
    icon: "EL",
  },
  {
    name: "Obras",
    shortName: "Obras",
    area: "Infraestrutura",
    status: "Atenção",
    summary: "Duas frentes estão próximas do prazo previsto.",
    metric: "7",
    metricLabel: "obras em andamento",
    trend: "2 pedem atenção",
    icon: "OB",
  },
  {
    name: "Planejamento e Urbanismo",
    shortName: "Planejamento e Urbanismo",
    area: "Planejamento urbano",
    status: "Em dia",
    summary: "Análises e solicitações urbanísticas em andamento.",
    metric: "89%",
    metricLabel: "análises no prazo",
    trend: "+3% neste mês",
    icon: "PU",
  },
  {
    name: "Saúde e Vigilância Sanitária",
    shortName: "Saúde",
    area: "Atenção à saúde",
    status: "Atenção",
    summary: "A fila de consultas especializadas merece acompanhamento.",
    metric: "134",
    metricLabel: "pessoas aguardando consulta",
    trend: "12 há mais de 60 dias",
    icon: "SV",
  },
  {
    name: "Segurança Pública e Trânsito",
    shortName: "Segurança e Trânsito",
    area: "Segurança e mobilidade",
    status: "Em dia",
    summary: "Registros e ações preventivas atualizados.",
    metric: "41",
    metricLabel: "ações preventivas no mês",
    trend: "+8 neste mês",
    icon: "ST",
  },
];

export const priorities = [
  {
    level: "Atenção",
    title: "Fila de consultas especializadas",
    description:
      "12 pessoas aguardam há mais de 60 dias. A secretaria pode revisar os encaminhamentos prioritários.",
    department: "Saúde e Vigilância Sanitária",
    time: "Atualizado hoje, 09:20",
    icon: "heart",
  },
  {
    level: "Atenção",
    title: "Solicitações rurais sem retorno",
    description:
      "6 pedidos de apoio à agricultura estão abertos há mais de uma semana.",
    department: "Agricultura e Meio Ambiente",
    time: "Atualizado ontem, 16:45",
    icon: "sprout",
  },
  {
    level: "Acompanhamento",
    title: "Duas obras próximas do prazo",
    description:
      "As equipes podem atualizar a previsão e informar se precisam de apoio.",
    department: "Obras",
    time: "Atualizado ontem, 14:10",
    icon: "building",
  },
];

export const highlights = [
  {
    label: "Serviços no prazo",
    value: "87%",
    change: "+5%",
    helper: "em relação ao mês anterior",
    tone: "green",
    points: [42, 48, 45, 58, 56, 68, 72, 69, 81, 77, 87, 88],
  },
  {
    label: "Pedidos que precisam de atenção",
    value: "23",
    change: "−8",
    helper: "menos que no mês anterior",
    tone: "amber",
    points: [70, 64, 68, 56, 59, 50, 54, 43, 49, 40, 34, 30],
  },
  {
    label: "Atendimentos realizados",
    value: "1.284",
    change: "+12%",
    helper: "em relação ao mês anterior",
    tone: "blue",
    points: [36, 40, 48, 44, 55, 61, 58, 68, 70, 78, 75, 88],
  },
];

export const lastUpdated = "20 de novembro de 2026, às 09:40";
