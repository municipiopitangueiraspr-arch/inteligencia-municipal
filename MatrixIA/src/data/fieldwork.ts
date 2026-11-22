import type { MapRegion } from "./healthTerritory";

export type FieldworkLotStatus = "not-started" | "in-progress" | "pending" | "complete" | "no-contact";

export type FieldworkZone = {
  id: string;
  areaId: string;
  name: string;
  code: string;
  region: MapRegion;
  color: string;
  teamId: string;
  acsProfessionalId: string;
};

export type FieldworkLot = {
  id: string;
  zoneId: string;
  label: string;
  street: string;
  number: string;
  neighborhood: string;
  block: string;
  x: number;
  y: number;
  householdId?: string;
  status: FieldworkLotStatus;
  note: string;
};

export type FieldworkVisitOutcome = "completed" | "no-contact" | "return-needed";

export type FieldworkVisit = {
  id: string;
  lotId: string;
  householdId?: string;
  familyId?: string;
  personId?: string;
  professionalId: string;
  date: string;
  outcome: FieldworkVisitOutcome;
  note: string;
  questionnaireResponseId?: string;
};

export type FieldworkDataset = {
  lots: FieldworkLot[];
  visits: FieldworkVisit[];
};

export const initialFieldwork: FieldworkDataset = {
  lots: [
    { id: "SIM-LOTE-001", zoneId: "SIM-ZONA-001", label: "Lote 001", street: "Rua das Acácias", number: "42", neighborhood: "Centro", block: "A", x: 32, y: 29, householdId: "SIM-DOM-001", status: "complete", note: "Domicílio e família já conhecidos." },
    { id: "SIM-LOTE-002", zoneId: "SIM-ZONA-001", label: "Lote 002", street: "Rua das Acácias", number: "48", neighborhood: "Centro", block: "A", x: 43, y: 27, householdId: "SIM-DOM-002", status: "pending", note: "Questionário aguardando conferência." },
    { id: "SIM-LOTE-003", zoneId: "SIM-ZONA-001", label: "Lote 003", street: "Rua das Acácias", number: "56", neighborhood: "Centro", block: "A", x: 54, y: 30, status: "not-started", note: "Nenhum domicílio confirmado neste lote." },
    { id: "SIM-LOTE-004", zoneId: "SIM-ZONA-001", label: "Lote 004", street: "Rua do Cedro", number: "18", neighborhood: "Centro", block: "B", x: 36, y: 42, status: "no-contact", note: "Última tentativa sem contato." },
    { id: "SIM-LOTE-005", zoneId: "SIM-ZONA-001", label: "Lote 005", street: "Rua do Cedro", number: "24", neighborhood: "Centro", block: "B", x: 49, y: 45, householdId: "SIM-DOM-001", status: "in-progress", note: "Há mais de uma unidade residencial neste endereço." },
    { id: "SIM-LOTE-006", zoneId: "SIM-ZONA-002", label: "Lote 006", street: "Avenida Ipê", number: "318", neighborhood: "Jardim do Norte", block: "C", x: 68, y: 22, householdId: "SIM-DOM-003", status: "complete", note: "Registro atualizado recentemente." },
    { id: "SIM-LOTE-007", zoneId: "SIM-ZONA-002", label: "Lote 007", street: "Avenida Ipê", number: "326", neighborhood: "Jardim do Norte", block: "C", x: 80, y: 25, status: "not-started", note: "Comece confirmando o endereço." },
    { id: "SIM-LOTE-008", zoneId: "SIM-ZONA-003", label: "Lote 008", street: "Estrada do Pinhal", number: "s/n", neighborhood: "Boa Esperança", block: "Rural", x: 25, y: 70, householdId: "SIM-DOM-004", status: "pending", note: "Cadastro domiciliar com campos a revisar." },
    { id: "SIM-LOTE-009", zoneId: "SIM-ZONA-003", label: "Lote 009", street: "Estrada do Pinhal", number: "s/n", neighborhood: "Boa Esperança", block: "Rural", x: 39, y: 78, status: "not-started", note: "Área rural sem domicílio confirmado." },
  ],
  visits: [
    { id: "SIM-VIS-CAMPO-001", lotId: "SIM-LOTE-001", householdId: "SIM-DOM-001", familyId: "SIM-FAM-001", personId: "SIM-PES-001", professionalId: "SIM-PRO-003", date: "2026-11-18", outcome: "completed", note: "Cadastro demonstrativo conferido.", questionnaireResponseId: "SIM-RESP-001" },
    { id: "SIM-VIS-CAMPO-002", lotId: "SIM-LOTE-004", professionalId: "SIM-PRO-003", date: "2026-11-19", outcome: "no-contact", note: "Nova tentativa necessária." },
    { id: "SIM-VIS-CAMPO-003", lotId: "SIM-LOTE-006", householdId: "SIM-DOM-003", familyId: "SIM-FAM-003", personId: "SIM-PES-005", professionalId: "SIM-PRO-003", date: "2026-11-20", outcome: "completed", note: "Questionário enviado.", questionnaireResponseId: "SIM-RESP-002" },
  ],
};

export const fieldworkZones: FieldworkZone[] = [
  { id: "SIM-ZONA-001", areaId: "SIM-AREA-001", name: "Centro Histórico", code: "MA-01", region: "centro", color: "#25826f", teamId: "SIM-EQ-001", acsProfessionalId: "SIM-PRO-003" },
  { id: "SIM-ZONA-002", areaId: "SIM-AREA-002", name: "Jardim do Norte", code: "MA-02", region: "norte", color: "#5578ba", teamId: "SIM-EQ-002", acsProfessionalId: "SIM-PRO-005" },
  { id: "SIM-ZONA-003", areaId: "SIM-AREA-004", name: "Boa Esperança Rural", code: "MR-04", region: "rural", color: "#9a6ab1", teamId: "SIM-EQ-003", acsProfessionalId: "SIM-PRO-006" },
];

export const fieldworkStatusLabels: Record<FieldworkLotStatus, string> = {
  "not-started": "Não iniciado",
  "in-progress": "Em andamento",
  pending: "Pendência",
  complete: "Concluído",
  "no-contact": "Sem contato",
};
