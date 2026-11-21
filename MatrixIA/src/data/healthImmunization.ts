import { initialHealthTerritory } from "./healthTerritory";
import { initialPeopleRegistry } from "./peopleRegistry";

export const vaccineSchemes = [
  {
    id: "SIM-ESQ-001",
    name: "Esquema demonstrativo A",
    vaccine: "Vacina demonstrativa A",
    doses: 3,
    intervalDays: 30,
  },
  {
    id: "SIM-ESQ-002",
    name: "Esquema demonstrativo B",
    vaccine: "Vacina demonstrativa B",
    doses: 2,
    intervalDays: 60,
  },
  {
    id: "SIM-ESQ-003",
    name: "Esquema demonstrativo C",
    vaccine: "Vacina demonstrativa C",
    doses: 1,
    intervalDays: 0,
  },
] as const;
export type VaccineScheme = (typeof vaccineSchemes)[number];
export type ImmunizationHistoryEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  note: string;
};
export type VaccineDose = {
  id: string;
  schemeId: string;
  doseNumber: number;
  appliedAt: string;
  unitId: string;
  lot: string;
  note: string;
  history: ImmunizationHistoryEvent[];
};
export type ImmunizationCourse = {
  id: string;
  personId: string;
  schemeId: string;
  startedAt: string;
  doses: VaccineDose[];
  nextDoseAt?: string;
  status: "Em andamento" | "Concluído";
  history: ImmunizationHistoryEvent[];
};
export type HealthImmunizationDataset = { courses: ImmunizationCourse[] };
const units = initialHealthTerritory.units;
const people = initialPeopleRegistry.people;
const event = (
  id: string,
  at: string,
  action: string,
  note: string,
): ImmunizationHistoryEvent => ({
  id,
  at,
  action,
  note,
  actor: "Equipe de Saúde · demonstração",
});
const dose = (
  id: string,
  number: number,
  at: string,
  unitIndex: number,
): VaccineDose => ({
  id,
  schemeId: "",
  doseNumber: number,
  appliedAt: at,
  unitId: units[unitIndex % units.length].id,
  lot: `LOTE-DEMO-${id.slice(-3)}`,
  note: "Aplicação fictícia para demonstração; não representa registro vacinal real.",
  history: [
    event(
      `${id}-H1`,
      `${at}T10:00:00`,
      "Dose demonstrativa registrada",
      "Registro sintético; conferir sistemas oficiais para qualquer decisão real.",
    ),
  ],
});
const course = (
  id: string,
  personIndex: number,
  schemeIndex: number,
  dates: string[],
  nextDoseAt?: string,
): ImmunizationCourse => {
  const scheme = vaccineSchemes[schemeIndex];
  const doses = dates.map((date, index) => ({
    ...dose(`${id}-D${index + 1}`, index + 1, date, index),
    schemeId: scheme.id,
  }));
  const complete = doses.length >= scheme.doses;
  return {
    id,
    personId: people[personIndex].id,
    schemeId: scheme.id,
    startedAt: dates[0] ?? "2026-10-01",
    doses,
    nextDoseAt: complete ? undefined : nextDoseAt,
    status: complete ? "Concluído" : "Em andamento",
    history: [
      event(
        `${id}-H1`,
        `${dates[0] ?? "2026-10-01"}T09:00:00`,
        "Esquema iniciado",
        `${scheme.name} é um esquema exclusivamente ilustrativo; intervalo sem validade clínica.`,
      ),
    ],
  };
};
export const initialHealthImmunization: HealthImmunizationDataset = {
  courses: [
    course("SIM-VAC-001", 1, 0, ["2026-10-01", "2026-10-31"], "2026-11-30"),
    course("SIM-VAC-002", 2, 1, ["2026-09-20"], "2026-11-19"),
    course("SIM-VAC-003", 5, 2, ["2026-11-10"]),
    course("SIM-VAC-004", 9, 0, ["2026-10-15"], "2026-11-14"),
  ],
};
export const nextImmunizationCourseId = (courses: ImmunizationCourse[]) =>
  `SIM-VAC-${String(courses.length + 1).padStart(3, "0")}`;
export const nextVaccineDoseId = (courseId: string, doses: VaccineDose[]) =>
  `${courseId}-D${String(doses.length + 1)}`;
export const getImmunizationSummary = (
  dataset: HealthImmunizationDataset,
  today = new Date().toISOString().slice(0, 10),
) => {
  const pendingCourses = dataset.courses.filter(
    (item) => item.status === "Em andamento" && item.nextDoseAt,
  );
  return {
    courses: dataset.courses.length,
    dosesApplied: dataset.courses.reduce(
      (sum, item) => sum + item.doses.length,
      0,
    ),
    activeSchemes: dataset.courses.filter(
      (item) => item.status === "Em andamento",
    ).length,
    upcoming: pendingCourses.filter((item) => item.nextDoseAt! >= today).length,
    overdue: pendingCourses.filter((item) => item.nextDoseAt! < today).length,
  };
};
