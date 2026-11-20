export type RegistryContact = {
  type: "telefone" | "e-mail";
  value: string;
  preferred?: boolean;
};

export type RegistryIdentifier = {
  type: "CPF" | "CNS" | "outro";
  value: string;
};

export type RegistryHistoryEvent = {
  date: string;
  action: string;
  detail: string;
};

export type RegistryPerson = {
  id: string;
  fullName: string;
  preferredName?: string;
  birthDate: string;
  contacts: RegistryContact[];
  identifiers: RegistryIdentifier[];
  notes: string;
  status: "Ativa" | "Inativa";
  history: RegistryHistoryEvent[];
};

export type RegistryFamily = {
  id: string;
  name: string;
  referencePersonId: string;
  status: "Ativa" | "Inativa";
  history: RegistryHistoryEvent[];
};

export type FamilyMembership = {
  id: string;
  personId: string;
  familyId: string;
  relationship: string;
  startDate: string;
  endDate?: string;
  history: RegistryHistoryEvent[];
};

/** Endereço geográfico compartilhável por mais de um domicílio/unidade residencial. */
export type RegistryAddress = {
  id: string;
  street: string;
  number: string;
  neighborhood: string;
  locality: string;
  postalCode: string;
  zone: "Urbana" | "Rural";
  areaId: string;
  history: RegistryHistoryEvent[];
};

/** Unidade domiciliar: características próprias e referência a um endereço. */
export type RegistryHousehold = {
  id: string;
  addressId: string;
  complement: string;
  occupationType: string;
  waterSupply: string;
  sewage: string;
  wasteCollection: string;
  energy: string;
  status: "Ativo" | "Inativo";
  history: RegistryHistoryEvent[];
};

export type ResidenceLink = {
  id: string;
  personId: string;
  householdId: string;
  startDate: string;
  endDate?: string;
  history: RegistryHistoryEvent[];
};

export type PeopleRegistryDataset = {
  people: RegistryPerson[];
  families: RegistryFamily[];
  familyMemberships: FamilyMembership[];
  addresses: RegistryAddress[];
  households: RegistryHousehold[];
  residenceLinks: ResidenceLink[];
};

const initialEvent = (action: string): RegistryHistoryEvent[] => [
  {
    date: "2025-01-15",
    action,
    detail: "Registro inicial de demonstração fictícia.",
  },
];

const people: RegistryPerson[] = [
  {
    id: "SIM-PES-001",
    fullName: "Helena Duarte Campos",
    preferredName: "Lena",
    birthDate: "1984-03-12",
    contacts: [{ type: "telefone", value: "(43) 90000-0101", preferred: true }],
    identifiers: [{ type: "CPF", value: "CPF-DEMO-0001" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
  {
    id: "SIM-PES-002",
    fullName: "Miguel Duarte Campos",
    birthDate: "2012-08-24",
    contacts: [],
    identifiers: [{ type: "CNS", value: "CNS-DEMO-0002" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
  {
    id: "SIM-PES-003",
    fullName: "Rosa Almeida Nogueira",
    preferredName: "Dona Rosa",
    birthDate: "1957-11-02",
    contacts: [{ type: "telefone", value: "(43) 90000-0103", preferred: true }],
    identifiers: [{ type: "CPF", value: "CPF-DEMO-0003" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
  {
    id: "SIM-PES-004",
    fullName: "Caio Nogueira Lima",
    birthDate: "1990-05-17",
    contacts: [],
    identifiers: [{ type: "CPF", value: "CPF-DEMO-0004" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
  {
    id: "SIM-PES-005",
    fullName: "Joana Martins Reis",
    birthDate: "1978-07-09",
    contacts: [{ type: "telefone", value: "(43) 90000-0105", preferred: true }],
    identifiers: [{ type: "CNS", value: "CNS-DEMO-0005" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
  {
    id: "SIM-PES-006",
    fullName: "Pedro Martins Reis",
    preferredName: "Pedrinho",
    birthDate: "2010-01-30",
    contacts: [],
    identifiers: [{ type: "CNS", value: "CNS-DEMO-0006" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
  {
    id: "SIM-PES-007",
    fullName: "Lúcia Ferreira Prado",
    birthDate: "1968-09-14",
    contacts: [{ type: "telefone", value: "(43) 90000-0107", preferred: true }],
    identifiers: [{ type: "CPF", value: "CPF-DEMO-0007" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
  {
    id: "SIM-PES-008",
    fullName: "André Ferreira Prado",
    birthDate: "1995-12-21",
    contacts: [{ type: "telefone", value: "(43) 90000-0108", preferred: true }],
    identifiers: [{ type: "CPF", value: "CPF-DEMO-0008" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
  {
    id: "SIM-PES-009",
    fullName: "Marta Silva Queiroz",
    birthDate: "1988-04-06",
    contacts: [],
    identifiers: [{ type: "CNS", value: "CNS-DEMO-0009" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
  {
    id: "SIM-PES-010",
    fullName: "Davi Silva Queiroz",
    birthDate: "2016-10-11",
    contacts: [{ type: "telefone", value: "(43) 90000-0110", preferred: true }],
    identifiers: [{ type: "CNS", value: "CNS-DEMO-0010" }],
    notes: "Amostra fictícia; não representa cadastro real.",
    status: "Ativa",
    history: initialEvent("Cadastro criado"),
  },
];

const families: RegistryFamily[] = [
  {
    id: "SIM-FAM-001",
    name: "Família Duarte Campos",
    referencePersonId: "SIM-PES-001",
    status: "Ativa",
    history: initialEvent("Família cadastrada"),
  },
  {
    id: "SIM-FAM-002",
    name: "Família Nogueira",
    referencePersonId: "SIM-PES-003",
    status: "Ativa",
    history: initialEvent("Família cadastrada"),
  },
  {
    id: "SIM-FAM-003",
    name: "Família Martins Reis",
    referencePersonId: "SIM-PES-005",
    status: "Ativa",
    history: initialEvent("Família cadastrada"),
  },
  {
    id: "SIM-FAM-004",
    name: "Família Ferreira Prado",
    referencePersonId: "SIM-PES-007",
    status: "Ativa",
    history: initialEvent("Família cadastrada"),
  },
  {
    id: "SIM-FAM-005",
    name: "Família Silva Queiroz",
    referencePersonId: "SIM-PES-009",
    status: "Ativa",
    history: initialEvent("Família cadastrada"),
  },
];

const familyMemberships: FamilyMembership[] = [
  [1, 1, "Responsável"],
  [2, 1, "Filho(a)"],
  [3, 2, "Responsável"],
  [4, 2, "Neto"],
  [5, 3, "Responsável"],
  [6, 3, "Filho(a)"],
  [7, 4, "Responsável"],
  [8, 4, "Filho(a)"],
  [9, 5, "Responsável"],
  [10, 5, "Filho(a)"],
].map(([person, family, relationship]) => ({
  id: `SIM-VF-${String(person).padStart(3, "0")}`,
  personId: `SIM-PES-${String(person).padStart(3, "0")}`,
  familyId: `SIM-FAM-${String(family).padStart(3, "0")}`,
  relationship: String(relationship),
  startDate: "2025-01-15",
  history: initialEvent("Vínculo familiar iniciado"),
}));

const addresses: RegistryAddress[] = [
  {
    id: "SIM-END-001",
    street: "Rua das Acácias",
    number: "42",
    neighborhood: "Centro",
    locality: "Vila das Palmeiras",
    postalCode: "00000-001",
    zone: "Urbana",
    areaId: "SIM-AREA-001",
    history: initialEvent("Endereço fictício cadastrado"),
  },
  {
    id: "SIM-END-002",
    street: "Avenida Ipê",
    number: "318",
    neighborhood: "Jardim do Norte",
    locality: "Vila das Palmeiras",
    postalCode: "00000-002",
    zone: "Urbana",
    areaId: "SIM-AREA-002",
    history: initialEvent("Endereço fictício cadastrado"),
  },
  {
    id: "SIM-END-003",
    street: "Estrada do Pinhal",
    number: "s/n",
    neighborhood: "Boa Esperança",
    locality: "Vila das Palmeiras",
    postalCode: "00000-003",
    zone: "Rural",
    areaId: "SIM-AREA-004",
    history: initialEvent("Endereço fictício cadastrado"),
  },
  {
    id: "SIM-END-004",
    street: "Travessa das Flores",
    number: "7",
    neighborhood: "Setor Leste",
    locality: "Vila das Palmeiras",
    postalCode: "00000-004",
    zone: "Urbana",
    areaId: "SIM-AREA-003",
    history: initialEvent("Endereço fictício cadastrado"),
  },
];

const households: RegistryHousehold[] = [
  {
    id: "SIM-DOM-001",
    addressId: "SIM-END-001",
    complement: "Casa A",
    occupationType: "Próprio",
    waterSupply: "Rede pública",
    sewage: "Rede coletora",
    wasteCollection: "Regular",
    energy: "Rede elétrica",
    status: "Ativo",
    history: initialEvent("Domicílio cadastrado"),
  },
  {
    id: "SIM-DOM-002",
    addressId: "SIM-END-001",
    complement: "Casa B",
    occupationType: "Alugado",
    waterSupply: "Rede pública",
    sewage: "Rede coletora",
    wasteCollection: "Regular",
    energy: "Rede elétrica",
    status: "Ativo",
    history: initialEvent("Domicílio cadastrado"),
  },
  {
    id: "SIM-DOM-003",
    addressId: "SIM-END-002",
    complement: "Fundos",
    occupationType: "Próprio",
    waterSupply: "Rede pública",
    sewage: "Fossa séptica",
    wasteCollection: "Regular",
    energy: "Rede elétrica",
    status: "Ativo",
    history: initialEvent("Domicílio cadastrado"),
  },
  {
    id: "SIM-DOM-004",
    addressId: "SIM-END-003",
    complement: "Sítio Horizonte",
    occupationType: "Cedido",
    waterSupply: "Poço",
    sewage: "Fossa séptica",
    wasteCollection: "Comunitária",
    energy: "Rede elétrica",
    status: "Ativo",
    history: initialEvent("Domicílio cadastrado"),
  },
  {
    id: "SIM-DOM-005",
    addressId: "SIM-END-004",
    complement: "",
    occupationType: "Alugado",
    waterSupply: "Rede pública",
    sewage: "Rede coletora",
    wasteCollection: "Regular",
    energy: "Rede elétrica",
    status: "Ativo",
    history: initialEvent("Domicílio cadastrado"),
  },
];

const householdByPerson = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5];
const residenceLinks: ResidenceLink[] = householdByPerson.map(
  (household, index) => ({
    id: `SIM-RES-${String(index + 1).padStart(3, "0")}`,
    personId: `SIM-PES-${String(index + 1).padStart(3, "0")}`,
    householdId: `SIM-DOM-${String(household).padStart(3, "0")}`,
    startDate: "2025-01-15",
    history: initialEvent("Residência vinculada"),
  }),
);

export const initialPeopleRegistry: PeopleRegistryDataset = {
  people,
  families,
  familyMemberships,
  addresses,
  households,
  residenceLinks,
};
