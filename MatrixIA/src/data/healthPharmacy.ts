import { initialHealthTerritory } from "./healthTerritory";

export type PharmacyProduct = {
  id: string;
  code: string;
  name: string;
  minimumStock: number;
};
export type PharmacyLot = {
  id: string;
  batchCode: string;
  productId: string;
  unitId: string;
  quantity: number;
  expiresAt: string;
};
export type PharmacyMovementType = "Entrada" | "Ajuste" | "Dispensação";
export type PharmacyMovement = {
  id: string;
  type: PharmacyMovementType;
  lotId: string;
  unitId: string;
  quantity: number;
  at: string;
  actor: string;
  personId?: string;
  note: string;
};
export type HealthPharmacyDataset = {
  lots: PharmacyLot[];
  movements: PharmacyMovement[];
};

export const pharmacyProducts: PharmacyProduct[] = [
  {
    id: "SIM-FAR-ITEM-001",
    code: "ITEM-DEMO-A",
    name: "Medicamento fictício A",
    minimumStock: 30,
  },
  {
    id: "SIM-FAR-ITEM-002",
    code: "ITEM-DEMO-B",
    name: "Medicamento fictício B",
    minimumStock: 20,
  },
  {
    id: "SIM-FAR-ITEM-003",
    code: "ITEM-DEMO-C",
    name: "Insumo farmacêutico fictício C",
    minimumStock: 25,
  },
  {
    id: "SIM-FAR-ITEM-004",
    code: "ITEM-DEMO-D",
    name: "Medicamento fictício D",
    minimumStock: 15,
  },
];
const units = initialHealthTerritory.units;
const lot = (
  id: string,
  product: number,
  unit: number,
  quantity: number,
  expiresAt: string,
): PharmacyLot => ({
  id,
  batchCode: `LOTE-DEMO-${id.slice(-3)}`,
  productId: pharmacyProducts[product].id,
  unitId: units[unit % units.length].id,
  quantity,
  expiresAt,
});
export const initialHealthPharmacy: HealthPharmacyDataset = {
  lots: [
    lot("SIM-FAR-LOTE-001", 0, 0, 18, "2027-05-31"),
    lot("SIM-FAR-LOTE-002", 0, 1, 8, "2026-12-15"),
    lot("SIM-FAR-LOTE-003", 1, 0, 17, "2027-02-28"),
    lot("SIM-FAR-LOTE-004", 1, 2, 12, "2026-10-31"),
    lot("SIM-FAR-LOTE-005", 2, 1, 41, "2027-03-31"),
    lot("SIM-FAR-LOTE-006", 3, 0, 5, "2026-09-30"),
  ],
  movements: [
    {
      id: "SIM-FAR-MOV-001",
      type: "Entrada",
      lotId: "SIM-FAR-LOTE-001",
      unitId: units[0].id,
      quantity: 24,
      at: "2026-11-05T09:00:00-03:00",
      actor: "Farmácia · demonstração",
      note: "Entrada sintética de demonstração.",
    },
    {
      id: "SIM-FAR-MOV-002",
      type: "Dispensação",
      lotId: "SIM-FAR-LOTE-001",
      unitId: units[0].id,
      quantity: 6,
      at: "2026-11-12T10:30:00-03:00",
      actor: "Farmácia · demonstração",
      personId: "SIM-PES-001",
      note: "Saída fictícia vinculada à pessoa de demonstração; não é prescrição nem registro real.",
    },
    {
      id: "SIM-FAR-MOV-003",
      type: "Entrada",
      lotId: "SIM-FAR-LOTE-004",
      unitId: units[2 % units.length].id,
      quantity: 12,
      at: "2026-09-01T08:00:00-03:00",
      actor: "Farmácia · demonstração",
      note: "Lote sintético incluído para demonstrar alerta de validade.",
    },
  ],
};
export const nextPharmacyLotId = (lots: PharmacyLot[]) =>
  `SIM-FAR-LOTE-${String(lots.length + 1).padStart(3, "0")}`;
export const nextPharmacyMovementId = (movements: PharmacyMovement[]) =>
  `SIM-FAR-MOV-${String(movements.length + 1).padStart(3, "0")}`;
export const getPharmacySummary = (
  dataset: HealthPharmacyDataset,
  today = new Date().toISOString().slice(0, 10),
) => {
  const soon = new Date(`${today}T00:00:00Z`);
  soon.setUTCDate(soon.getUTCDate() + 60);
  const soonDate = soon.toISOString().slice(0, 10);
  const productUnitStocks = [
    ...new Set(dataset.lots.map((item) => `${item.productId}:${item.unitId}`)),
  ].map((key) => {
    const [productId, unitId] = key.split(":");
    return {
      productId,
      unitId,
      quantity: dataset.lots
        .filter(
          (item) => item.productId === productId && item.unitId === unitId,
        )
        .reduce((sum, item) => sum + item.quantity, 0),
    };
  });
  return {
    lots: dataset.lots.length,
    totalUnits: dataset.lots.reduce((sum, item) => sum + item.quantity, 0),
    lowStock: productUnitStocks.filter(
      (stock) =>
        stock.quantity <
        (pharmacyProducts.find((p) => p.id === stock.productId)?.minimumStock ??
          0),
    ).length,
    expiring: dataset.lots.filter(
      (item) =>
        item.quantity > 0 &&
        item.expiresAt >= today &&
        item.expiresAt <= soonDate,
    ).length,
    expired: dataset.lots.filter(
      (item) => item.quantity > 0 && item.expiresAt < today,
    ).length,
  };
};
