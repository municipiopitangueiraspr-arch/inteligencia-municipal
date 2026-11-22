export type QuestionnaireAudience = "Saúde" | "Assistência Social" | "Educação" | "Compartilhado";

export type QuestionnaireQuestionType =
  | "short_text"
  | "long_text"
  | "phone"
  | "number"
  | "currency"
  | "date"
  | "yes_no"
  | "single_choice"
  | "multiple_choice"
  | "signature";

export type QuestionnaireQuestion = {
  id: string;
  label: string;
  type: QuestionnaireQuestionType;
  required: boolean;
  helpText?: string;
  options?: string[];
  validation?: { min?: number; max?: number; minLength?: number; maxLength?: number };
};

export type QuestionnaireSection = {
  id: string;
  title: string;
  description?: string;
  questions: QuestionnaireQuestion[];
};

export type SharedQuestionnaire = {
  id: string;
  title: string;
  subtitle: string;
  audience: QuestionnaireAudience;
  version: number;
  status: "Ativo" | "Inativo" | "Rascunho";
  questions: { id: string; label: string; kind: "choice" | "text"; options?: string[] }[];
  formSchema?: { sections: QuestionnaireSection[] };
};

export type QuestionnaireResponse = {
  id: string;
  questionnaireId: string;
  questionnaireVersion?: number;
  lotId?: string;
  householdId?: string;
  visitId?: string;
  personId?: string;
  status: "Rascunho" | "Enviado";
  answers: Record<string, string>;
  updatedAt: string;
  context?: { personId?: string; householdId?: string; lotId?: string; visitId?: string; unitId?: string; professionalId?: string };
};

export type SharedQuestionnairesDataset = {
  questionnaires: SharedQuestionnaire[];
  responses: QuestionnaireResponse[];
};

export const initialSharedQuestionnaires: SharedQuestionnairesDataset = {
  questionnaires: [
    {
      id: "SIM-QST-TERRITORIO-001",
      title: "Conhecendo o domicílio",
      subtitle: "Cadastro territorial demonstrativo",
      audience: "Compartilhado",
      version: 1,
      status: "Ativo",
      questions: [
        { id: "residents", label: "Há moradores neste domicílio?", kind: "choice", options: ["Sim", "Não", "Não foi possível confirmar"] },
        { id: "water", label: "Como a casa recebe água?", kind: "choice", options: ["Rede pública", "Poço ou nascente", "Outra forma", "Não informado"] },
        { id: "nextStep", label: "Qual é o próximo passo administrativo?", kind: "choice", options: ["Nenhum por enquanto", "Nova visita", "Completar cadastro", "Encaminhar para conferência"] },
      ],
    },
    { id: "SIM-QST-VISITA-002", title: "Acompanhamento de visita", subtitle: "Registro compartilhado de rotina de campo", audience: "Saúde", version: 2, status: "Ativo", questions: [{ id: "contact", label: "Houve contato com alguém no local?", kind: "choice", options: ["Sim", "Não"] }, { id: "return", label: "É necessário retorno?", kind: "choice", options: ["Sim", "Não"] }] },
    { id: "SIM-QST-REDE-003", title: "Acolhida territorial", subtitle: "Modelo demonstrativo para fluxos intersetoriais", audience: "Assistência Social", version: 1, status: "Rascunho", questions: [{ id: "channel", label: "Como a família chegou ao serviço?", kind: "choice", options: ["Busca ativa", "Procura espontânea", "Encaminhamento"] }] },
  ],
  responses: [
    { id: "SIM-RESP-001", questionnaireId: "SIM-QST-TERRITORIO-001", lotId: "SIM-LOTE-001", householdId: "SIM-DOM-001", visitId: "SIM-VIS-CAMPO-001", personId: "SIM-PES-001", status: "Enviado", answers: { residents: "Sim", water: "Rede pública", nextStep: "Nenhum por enquanto" }, updatedAt: "2026-11-18T10:20:00" },
    { id: "SIM-RESP-002", questionnaireId: "SIM-QST-TERRITORIO-001", lotId: "SIM-LOTE-006", householdId: "SIM-DOM-003", visitId: "SIM-VIS-CAMPO-003", personId: "SIM-PES-005", status: "Enviado", answers: { residents: "Sim", water: "Rede pública", nextStep: "Completar cadastro" }, updatedAt: "2026-11-20T14:05:00" },
  ],
};
