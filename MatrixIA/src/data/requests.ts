export type RequestStatus =
  | "Recebida"
  | "Em análise"
  | "Em atendimento"
  | "Concluída"
  | "Cancelada";

export type RequestPriority = "Baixa" | "Normal" | "Alta" | "Urgente";

export type RequestHistoryEntry = {
  id: string;
  at: string;
  actor: string;
  status: RequestStatus;
  note: string;
  previousAssignee?: string;
  assignedTo?: string;
};

export type MunicipalRequest = {
  id: string;
  protocol: string;
  subject: string;
  description: string;
  category: string;
  department: string;
  priority: RequestPriority;
  requester: string;
  contact: string;
  location: string;
  channel: string;
  status: RequestStatus;
  assignedTo: string;
  createdAt: string;
  dueAt: string;
  simulated: boolean;
  history: RequestHistoryEntry[];
};

export type MunicipalRequestDraft = Pick<
  MunicipalRequest,
  | "subject"
  | "description"
  | "category"
  | "department"
  | "priority"
  | "requester"
  | "contact"
  | "location"
  | "channel"
> & { createdBy: string };

const demoReference = new Date();
demoReference.setDate(demoReference.getDate() - 1);
demoReference.setHours(12, 0, 0, 0);

const seededDepartmentQueues = [
  { department: "Administração e Finanças", open: 3, overdue: 0 },
  { department: "Agricultura e Meio Ambiente", open: 4, overdue: 2 },
  { department: "Assistência Social", open: 3, overdue: 0 },
  { department: "Cultura e Turismo", open: 2, overdue: 0 },
  { department: "Desenvolvimento Econômico", open: 3, overdue: 1 },
  { department: "Educação", open: 4, overdue: 0 },
  { department: "Esporte e Lazer", open: 2, overdue: 0 },
  { department: "Obras", open: 5, overdue: 2 },
  { department: "Planejamento e Urbanismo", open: 2, overdue: 0 },
  { department: "Saúde e Vigilância Sanitária", open: 5, overdue: 2 },
  { department: "Segurança Pública e Trânsito", open: 3, overdue: 0 },
];

const demoSubjects: Record<string, string[]> = {
  "Administração e Finanças": [
    "Solicitação de cópia de documento municipal",
    "Orientação sobre atendimento ao contribuinte",
    "Pedido de informação sobre serviço público",
  ],
  "Agricultura e Meio Ambiente": [
    "Agendamento de orientação técnica rural",
    "Pedido de vistoria em estrada de acesso rural",
    "Solicitação de recolhimento de resíduos",
    "Apoio para cadastro de produtor",
  ],
  "Assistência Social": [
    "Orientação sobre serviços do CRAS",
    "Solicitação de retorno da equipe social",
    "Informação sobre atendimento socioassistencial",
  ],
  "Cultura e Turismo": [
    "Reserva de espaço para atividade comunitária",
    "Pedido de informação sobre agenda cultural",
  ],
  "Desenvolvimento Econômico": [
    "Orientação para formalização de pequeno negócio",
    "Informação sobre feira de produtores locais",
    "Pedido de retorno sobre atendimento ao empreendedor",
  ],
  Educação: [
    "Informação sobre transporte escolar",
    "Pedido de manutenção em unidade escolar",
    "Orientação sobre calendário escolar",
    "Solicitação de atualização de cadastro escolar",
  ],
  "Esporte e Lazer": [
    "Manutenção de equipamento esportivo",
    "Informação sobre inscrição em atividade municipal",
  ],
  Obras: [
    "Reparo de trecho de via urbana",
    "Manutenção de estrada rural",
    "Avaliação de drenagem em via pública",
    "Solicitação de limpeza de área pública",
    "Reparo de iluminação em espaço municipal",
  ],
  "Planejamento e Urbanismo": [
    "Orientação sobre consulta prévia",
    "Informação sobre andamento de processo urbanístico",
  ],
  "Saúde e Vigilância Sanitária": [
    "Informação sobre horário de atendimento da unidade",
    "Pedido de vistoria sanitária em estabelecimento",
    "Orientação sobre serviço municipal de saúde",
    "Solicitação de retorno da vigilância sanitária",
    "Informação sobre vacinação na unidade",
  ],
  "Segurança Pública e Trânsito": [
    "Avaliação de sinalização em cruzamento",
    "Pedido de orientação sobre interdição de via",
    "Solicitação de reforço de sinalização viária",
  ],
};

const demoRequesters = [
  "Mariana Oliveira",
  "João Ribeiro",
  "Ana Paula Martins",
  "Carlos Eduardo Lima",
  "Luciana Ferreira",
  "Rafael dos Santos",
  "Patrícia Almeida",
  "José Roberto Costa",
  "Fernanda Souza",
  "Paulo Henrique Mendes",
  "Camila Rodrigues",
];

const demoLocations = [
  "Centro · Rua das Araucárias",
  "Jardim Primavera · Rua Ipê",
  "Comunidade Água Clara · área rural",
  "Vila Nova · Avenida Paraná",
  "Centro · Praça Municipal",
  "Comunidade São Pedro · área rural",
  "Jardim das Flores · Rua Central",
];

const demoActors: Record<string, string> = {
  "Administração e Finanças": "Protocolo Geral",
  "Agricultura e Meio Ambiente": "Atendimento Rural",
  "Assistência Social": "Recepção do CRAS",
  "Cultura e Turismo": "Atendimento de Cultura",
  "Desenvolvimento Econômico": "Sala do Empreendedor",
  Educação: "Secretaria Escolar",
  "Esporte e Lazer": "Atendimento de Esportes",
  Obras: "Central de Serviços Urbanos",
  "Planejamento e Urbanismo": "Atendimento de Urbanismo",
  "Saúde e Vigilância Sanitária": "Recepção da Secretaria de Saúde",
  "Segurança Pública e Trânsito": "Central de Trânsito",
};

const prioritySequence: RequestPriority[] = [
  "Normal",
  "Alta",
  "Baixa",
  "Normal",
];
const channelSequence = [
  "Presencial",
  "Telefone",
  "Portal demonstrativo",
  "E-mail",
];
const categorySequence = [
  "Informação",
  "Serviço municipal",
  "Solicitação",
  "Fiscalização",
];

function shiftDays(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted.toISOString();
}

function createSeededRequests(): MunicipalRequest[] {
  let sequence = 1;

  return seededDepartmentQueues.flatMap(({ department, open, overdue }) =>
    Array.from({ length: open }, (_, index) => {
      const isOverdue = index < overdue;
      const createdAt = shiftDays(
        demoReference,
        isOverdue ? -12 - index : -2 - (index % 2),
      );
      const dueAt = shiftDays(new Date(createdAt), isOverdue ? 3 : 5);
      const status: RequestStatus =
        index % 3 === 0
          ? "Em análise"
          : index % 3 === 1
            ? "Em atendimento"
            : "Recebida";
      const protocol = `PROTO-${demoReference.getFullYear()}-${String(sequence).padStart(5, "0")}`;
      const id = `SIM-${protocol}`;
      const subjectList = demoSubjects[department];
      const requester = demoRequesters[(sequence - 1) % demoRequesters.length];

      sequence += 1;
      return {
        id,
        protocol,
        subject: subjectList[index % subjectList.length],
        description: `Registro demonstrativo para ilustrar o acompanhamento de ${subjectList[index % subjectList.length].toLocaleLowerCase("pt-BR")} pela equipe responsável.`,
        category: categorySequence[(sequence - 2) % categorySequence.length],
        department,
        priority: prioritySequence[(sequence - 2) % prioritySequence.length],
        requester,
        contact: `(${43}) 9${String(8100 + sequence).padStart(4, "0")}-${String(1000 + sequence).slice(-4)}`,
        location: demoLocations[(sequence - 2) % demoLocations.length],
        channel: channelSequence[(sequence - 2) % channelSequence.length],
        status,
        assignedTo: demoActors[department],
        createdAt,
        dueAt,
        simulated: true,
        history: [
          {
            id: `${id}-H01`,
            at: createdAt,
            actor: "Central de Atendimento",
            status,
            note: "Solicitação sintética criada para compor a fila demonstrativa.",
            assignedTo: demoActors[department],
          },
        ],
      } satisfies MunicipalRequest;
    }),
  );
}

export const initialMunicipalRequests = createSeededRequests();

export function getRequestCounts(requests: MunicipalRequest[]) {
  const openRequests = requests.filter(
    (request) =>
      request.status !== "Concluída" && request.status !== "Cancelada",
  );
  const now = Date.now();

  return {
    open: openRequests.length,
    overdue: openRequests.filter((request) => Date.parse(request.dueAt) < now)
      .length,
  };
}

export function getDepartmentRequestCounts(
  requests: MunicipalRequest[],
  department: string,
) {
  return getRequestCounts(
    requests.filter((request) => request.department === department),
  );
}

export function nextProtocolNumber(requests: MunicipalRequest[]) {
  const greatest = requests.reduce((max, request) => {
    const match = request.protocol.match(/-(\d+)$/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `PROTO-${new Date().getFullYear()}-${String(greatest + 1).padStart(5, "0")}`;
}

export function createHistoryEntry(
  request: MunicipalRequest,
  input: {
    status: RequestStatus;
    actor: string;
    note: string;
    previousAssignee: string;
    assignedTo: string;
  },
): RequestHistoryEntry {
  return {
    id: `${request.id}-H${String(request.history.length + 1).padStart(2, "0")}`,
    at: new Date().toISOString(),
    actor: input.actor,
    status: input.status,
    note: input.note,
    previousAssignee: input.previousAssignee,
    assignedTo: input.assignedTo,
  };
}

export function formatRequestDate(value: string, includeTime = false) {
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(includeTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function isRequestOverdue(request: MunicipalRequest, now = Date.now()) {
  return (
    request.status !== "Concluída" &&
    request.status !== "Cancelada" &&
    Date.parse(request.dueAt) < now
  );
}
