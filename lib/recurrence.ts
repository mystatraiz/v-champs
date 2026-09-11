import { localDateStr } from "./format";

// ═══ Récurrences : un créneau qui se répète toutes les N semaines ═══
// La règle porte la date de sa première occurrence : elle fixe à la fois le
// jour de la semaine et la phase (utile pour « une semaine sur deux »).

export type RecurrenceKind = "tournament" | "lesson" | "match";

export const RECURRENCE_INTERVALS: { weeks: number; label: string }[] = [
  { weeks: 1, label: "Toutes les semaines" },
  { weeks: 2, label: "Une semaine sur deux" },
];

// Les `keepAhead` prochaines occurrences d'une règle, à partir d'aujourd'hui.
export function nextOccurrences(
  startDate: string,
  intervalWeeks: number,
  keepAhead: number,
  today = localDateStr(new Date())
): string[] {
  const step = Math.max(1, intervalWeeks) * 7;
  const d = new Date(startDate + "T00:00:00");
  if (isNaN(d.getTime())) return [];

  // Avance jusqu'à la première occurrence encore à venir.
  let safety = 0;
  while (localDateStr(d) < today && safety++ < 520) d.setDate(d.getDate() + step);

  const out: string[] = [];
  for (let i = 0; i < Math.max(1, keepAhead); i++) {
    out.push(localDateStr(d));
    d.setDate(d.getDate() + step);
  }
  return out;
}

// Libellé lisible d'une règle : « Tous les mardis à 12:30 ».
export function recurrenceLabel(startDate: string, time: string, intervalWeeks: number): string {
  const d = new Date(startDate + "T00:00:00");
  const day = d.toLocaleDateString("fr-FR", { weekday: "long" });
  const every = intervalWeeks === 1 ? `Tous les ${day}s` : `Un ${day} sur ${intervalWeeks}`;
  return `${every} à ${time}`;
}
