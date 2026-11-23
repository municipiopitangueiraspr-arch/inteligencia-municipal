export type MapRegion = "centro" | "norte" | "leste" | "rural";

export type TerritoryHistoryEvent = { date: string; action: string; detail: string };
export type TeamCompositionEvent = { id: string; professionalId: string; role: string; validFrom: string; validTo?: string; action: "Inclusão" | "Alteração" | "Saída"; notes?: string };
export type HealthCatalog = { id: string; domain: "Tipo de unidade" | "Modelo de equipe" | "Categoria profissional" | "Tipo de área"; code: string; label: string; description?: string; version: number; validFrom: string; validTo?: string; active: boolean; history: TerritoryHistoryEvent[] };

export type HealthUnit = {
  id: string;
  name: string;
  kind: string;
  address: string;
  neighborhood: string;
  phone: string;
  region: MapRegion;
  active: boolean;
  validFrom?: string;
  validTo?: string;
  history?: TerritoryHistoryEvent[];
};

export type HealthTeam = {
  id: string;
  name: string;
  code: string;
  model: string;
  unitId: string;
  areaId: string;
  active: boolean;
  validFrom?: string;
  validTo?: string;
  compositionHistory?: TeamCompositionEvent[];
  history?: TerritoryHistoryEvent[];
};

export type HealthProfessional = {
  id: string;
  name: string;
  category: string;
  registration: string;
  unitId: string;
  teamId: string;
  phone: string;
  active: boolean;
  validFrom?: string;
  validTo?: string;
  history?: TerritoryHistoryEvent[];
};

export type ServiceArea = {
  id: string;
  name: string;
  code: string;
  teamId: string;
  estimatedResidents: number;
  region: MapRegion;
  color: string;
  active: boolean;
  validFrom?: string;
  validTo?: string;
  history?: TerritoryHistoryEvent[];
};

export type HealthTerritoryDataset = {
  units: HealthUnit[];
  teams: HealthTeam[];
  professionals: HealthProfessional[];
  areas: ServiceArea[];
  catalogs: HealthCatalog[];
};

export const mapRegionCenters: Record<MapRegion, { x: number; y: number }> = {
  centro: { x: 500, y: 320 },
  norte: { x: 500, y: 175 },
  leste: { x: 795, y: 355 },
  rural: { x: 480, y: 505 },
};

export const mapRegionLabels: Record<MapRegion, string> = {
  centro: "Centro",
  norte: "Norte",
  leste: "Leste",
  rural: "Área rural",
};

// Geometrias ilustrativas para prototipagem; não representam limites oficiais.
export const mapRegionPolygons: Record<MapRegion, string> = {
  centro:
    "350,255 425,220 510,235 570,270 600,335 570,390 500,420 420,400 365,355 330,305",
  norte:
    "390,65 455,42 525,55 590,92 610,155 575,205 510,235 425,220 375,175 360,115",
  leste:
    "640,245 710,210 790,225 860,270 890,330 860,395 800,430 725,410 670,375 625,315",
  rural:
    "320,420 390,395 470,415 525,455 555,520 525,580 455,605 380,585 325,545 295,485",
};

const rawHealthTerritory = {
  units: [
    {
      id: "SIM-UBS-001",
      name: "UBS Municipal do Centro",
      kind: "Unidade Básica de Saúde",
      address: "Rua das Araucárias, 120",
      neighborhood: "Centro",
      phone: "(43) 3554-0101",
      region: "centro",
      active: true,
    },
    {
      id: "SIM-UBS-002",
      name: "USF Jardim do Norte",
      kind: "Unidade de Saúde da Família",
      address: "Avenida Paraná, 845",
      neighborhood: "Jardim do Norte",
      phone: "(43) 3554-0102",
      region: "norte",
      active: true,
    },
    {
      id: "SIM-UBS-003",
      name: "Ponto de Apoio Rural Boa Esperança",
      kind: "Ponto de Apoio à Saúde Rural",
      address: "Estrada Municipal, km 12",
      neighborhood: "Boa Esperança",
      phone: "(43) 3554-0103",
      region: "rural",
      active: true,
    },
  ],
  teams: [
    {
      id: "SIM-EQ-001",
      name: "Equipe Saúde da Família Centro",
      code: "ESF-01",
      model: "Saúde da Família",
      unitId: "SIM-UBS-001",
      areaId: "SIM-AREA-001",
      active: true,
    },
    {
      id: "SIM-EQ-002",
      name: "Equipe Saúde da Família Norte",
      code: "ESF-02",
      model: "Saúde da Família",
      unitId: "SIM-UBS-002",
      areaId: "SIM-AREA-002",
      active: true,
    },
    {
      id: "SIM-EQ-003",
      name: "Equipe de Atenção Primária Rural",
      code: "EAP-03",
      model: "Atenção Primária Rural",
      unitId: "SIM-UBS-003",
      areaId: "SIM-AREA-004",
      active: true,
    },
    {
      id: "SIM-EQ-004",
      name: "Equipe Multiprofissional Leste",
      code: "EMULTI-04",
      model: "Equipe Multiprofissional",
      unitId: "SIM-UBS-001",
      areaId: "SIM-AREA-003",
      active: true,
    },
  ],
  professionals: [
    {
      id: "SIM-PRO-001",
      name: "Ana Paula Ribeiro",
      category: "Médico de Família",
      registration: "CRM-DEMO-1001",
      unitId: "SIM-UBS-001",
      teamId: "SIM-EQ-001",
      phone: "(43) 9 9000-0101",
      active: true,
    },
    {
      id: "SIM-PRO-002",
      name: "João Marcos de Oliveira",
      category: "Enfermeiro(a)",
      registration: "COREN-DEMO-2001",
      unitId: "SIM-UBS-001",
      teamId: "SIM-EQ-001",
      phone: "(43) 9 9000-0102",
      active: true,
    },
    {
      id: "SIM-PRO-003",
      name: "Luciana Ferreira Costa",
      category: "Agente Comunitário de Saúde",
      registration: "MAT-DEMO-3001",
      unitId: "SIM-UBS-001",
      teamId: "SIM-EQ-001",
      phone: "(43) 9 9000-0103",
      active: true,
    },
    {
      id: "SIM-PRO-004",
      name: "Carlos Eduardo Martins",
      category: "Médico de Família",
      registration: "CRM-DEMO-1002",
      unitId: "SIM-UBS-002",
      teamId: "SIM-EQ-002",
      phone: "(43) 9 9000-0104",
      active: true,
    },
    {
      id: "SIM-PRO-005",
      name: "Mariana Lopes de Souza",
      category: "Técnico(a) de Enfermagem",
      registration: "COREN-DEMO-2002",
      unitId: "SIM-UBS-002",
      teamId: "SIM-EQ-002",
      phone: "(43) 9 9000-0105",
      active: true,
    },
    {
      id: "SIM-PRO-006",
      name: "Paulo Henrique Alves",
      category: "Agente Comunitário de Saúde",
      registration: "MAT-DEMO-3002",
      unitId: "SIM-UBS-003",
      teamId: "SIM-EQ-003",
      phone: "(43) 9 9000-0106",
      active: true,
    },
    {
      id: "SIM-PRO-007",
      name: "Renata de Fátima Gomes",
      category: "Cirurgião(ã)-dentista",
      registration: "CRO-DEMO-4001",
      unitId: "SIM-UBS-001",
      teamId: "SIM-EQ-004",
      phone: "(43) 9 9000-0107",
      active: true,
    },
    {
      id: "SIM-PRO-008",
      name: "Daniela Martins Pires",
      category: "Fisioterapeuta",
      registration: "CREFITO-DEMO-5001",
      unitId: "SIM-UBS-001",
      teamId: "SIM-EQ-004",
      phone: "(43) 9 9000-0108",
      active: true,
    },
    {
      id: "SIM-PRO-009",
      name: "Eliane Souza Batista",
      category: "Agente de Combate às Endemias",
      registration: "MAT-DEMO-6001",
      unitId: "SIM-UBS-002",
      teamId: "SIM-EQ-002",
      phone: "(43) 9 9000-0109",
      active: true,
    },
    {
      id: "SIM-PRO-010",
      name: "Roberto Nunes Cardoso",
      category: "Agente de Combate às Endemias",
      registration: "MAT-DEMO-6002",
      unitId: "SIM-UBS-001",
      teamId: "SIM-EQ-004",
      phone: "(43) 9 9000-0110",
      active: true,
    },
    {
      id: "SIM-PRO-011",
      name: "Tatiana de Almeida Costa",
      category: "Agente de Combate às Endemias",
      registration: "MAT-DEMO-6003",
      unitId: "SIM-UBS-001",
      teamId: "SIM-EQ-001",
      phone: "(43) 9 9000-0111",
      active: true,
    },
  ],
  areas: [
    {
      id: "SIM-AREA-001",
      name: "Microárea Centro Histórico",
      code: "MA-01",
      teamId: "SIM-EQ-001",
      estimatedResidents: 1230,
      region: "centro",
      color: "#25826f",
      active: true,
    },
    {
      id: "SIM-AREA-002",
      name: "Microárea Jardim do Norte",
      code: "MA-02",
      teamId: "SIM-EQ-002",
      estimatedResidents: 840,
      region: "norte",
      color: "#5578ba",
      active: true,
    },
    {
      id: "SIM-AREA-003",
      name: "Setor de Referência Leste",
      code: "SR-03",
      teamId: "SIM-EQ-004",
      estimatedResidents: 590,
      region: "leste",
      color: "#d49332",
      active: true,
    },
    {
      id: "SIM-AREA-004",
      name: "Microárea Rural Boa Esperança",
      code: "MR-04",
      teamId: "SIM-EQ-003",
      estimatedResidents: 340,
      region: "rural",
      color: "#9a6ab1",
      active: true,
    },
  ],
  catalogs: [
    { id: "SIM-CAT-001", domain: "Tipo de unidade", code: "UBS", label: "Unidade Básica de Saúde", version: 1, validFrom: "2025-01-01", active: true, history: [{ date: "2025-01-01", action: "Catálogo publicado", detail: "Versão inicial do item." }] },
    { id: "SIM-CAT-002", domain: "Tipo de unidade", code: "USF", label: "Unidade de Saúde da Família", version: 1, validFrom: "2025-01-01", active: true, history: [{ date: "2025-01-01", action: "Catálogo publicado", detail: "Versão inicial do item." }] },
    { id: "SIM-CAT-003", domain: "Modelo de equipe", code: "ESF", label: "Saúde da Família", version: 1, validFrom: "2025-01-01", active: true, history: [{ date: "2025-01-01", action: "Catálogo publicado", detail: "Versão inicial do item." }] },
    { id: "SIM-CAT-004", domain: "Modelo de equipe", code: "EMULTI", label: "Equipe Multiprofissional", version: 1, validFrom: "2025-01-01", active: true, history: [{ date: "2025-01-01", action: "Catálogo publicado", detail: "Versão inicial do item." }] },
    { id: "SIM-CAT-005", domain: "Categoria profissional", code: "ACS", label: "Agente Comunitário de Saúde", version: 1, validFrom: "2025-01-01", active: true, history: [{ date: "2025-01-01", action: "Catálogo publicado", detail: "Versão inicial do item." }] },
    { id: "SIM-CAT-006", domain: "Categoria profissional", code: "ENF", label: "Enfermeiro(a)", version: 1, validFrom: "2025-01-01", active: true, history: [{ date: "2025-01-01", action: "Catálogo publicado", detail: "Versão inicial do item." }] },
  ],
} satisfies HealthTerritoryDataset;

export const initialHealthTerritory: HealthTerritoryDataset = {
  ...rawHealthTerritory,
  units: rawHealthTerritory.units.map((item) => ({ ...item, validFrom: (item as HealthUnit).validFrom ?? "2025-01-01", history: (item as HealthUnit).history ?? [{ date: "2025-01-01", action: "Cadastro inicial", detail: "Unidade incorporada ao cenário territorial." }] })),
  teams: rawHealthTerritory.teams.map((item) => ({ ...item, validFrom: (item as HealthTeam).validFrom ?? "2025-01-01", compositionHistory: (item as HealthTeam).compositionHistory ?? [], history: (item as HealthTeam).history ?? [{ date: "2025-01-01", action: "Cadastro inicial", detail: "Equipe incorporada ao cenário territorial." }] })),
  professionals: rawHealthTerritory.professionals.map((item) => ({ ...item, validFrom: (item as HealthProfessional).validFrom ?? "2025-01-01", history: (item as HealthProfessional).history ?? [{ date: "2025-01-01", action: "Cadastro inicial", detail: "Profissional incorporado ao cenário territorial." }] })),
  areas: rawHealthTerritory.areas.map((item) => ({ ...item, validFrom: (item as ServiceArea).validFrom ?? "2025-01-01", history: (item as ServiceArea).history ?? [{ date: "2025-01-01", action: "Cadastro inicial", detail: "Área incorporada ao cenário territorial." }] })),
};
