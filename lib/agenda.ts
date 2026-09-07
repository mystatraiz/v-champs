import { localDateStr } from "./format";
import type { Lesson, MatchSlot, Tournament } from "./types";

// ─── Agenda : tournois, leçons et créneaux de match sur une même frise ───
// Les trois types vivent dans des tables distinctes mais se lisent ensemble :
// ce qui compte pour un joueur, c'est « qu'est-ce que je peux jouer jeudi ».

export type AgendaKind = "tournament" | "lesson" | "match";

export const AGENDA_KINDS: {
  key: AgendaKind;
  label: string;
  short: string;
  icon: string;
  dot: string;
  text: string;
  edge: string;
}[] = [
  {
    key: "tournament",
    label: "Tournois",
    short: "Tournoi",
    icon: "🎾",
    dot: "bg-gold",
    text: "text-gold",
    edge: "border-l-gold",
  },
  {
    key: "lesson",
    label: "Leçons",
    short: "Leçon",
    icon: "🎓",
    dot: "bg-coach",
    text: "text-coach",
    edge: "border-l-coach",
  },
  {
    key: "match",
    label: "Matchs",
    short: "Match",
    icon: "🤝",
    dot: "bg-match",
    text: "text-match",
    edge: "border-l-match",
  },
];

export function agendaKind(kind: AgendaKind) {
  return AGENDA_KINDS.find((k) => k.key === kind) ?? AGENDA_KINDS[0];
}

export type AgendaEntry =
  | { kind: "tournament"; id: string; date: string; time: string; item: Tournament }
  | { kind: "lesson"; id: string; date: string; time: string; item: Lesson }
  | { kind: "match"; id: string; date: string; time: string; item: MatchSlot };

// Fusionne les trois sources et trie par date puis heure.
export function buildAgenda(
  tournaments: Tournament[],
  lessons: Lesson[],
  matches: MatchSlot[]
): AgendaEntry[] {
  const entries: AgendaEntry[] = [
    ...tournaments.map(
      (t): AgendaEntry => ({ kind: "tournament", id: t.id, date: t.date, time: t.time, item: t })
    ),
    ...lessons.map(
      (l): AgendaEntry => ({ kind: "lesson", id: l.id, date: l.date, time: l.time, item: l })
    ),
    ...matches.map(
      (m): AgendaEntry => ({ kind: "match", id: m.id, date: m.date, time: m.time, item: m })
    ),
  ];
  return entries.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}

// Les `count` prochains jours à partir d'aujourd'hui (fenêtre glissante).
export function slidingDays(count = 7): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    out.push(localDateStr(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// Pour chaque date, le nombre d'entrées par type (alimente les pastilles).
export function countsByDay(entries: AgendaEntry[]): Map<string, Record<AgendaKind, number>> {
  const map = new Map<string, Record<AgendaKind, number>>();
  entries.forEach((e) => {
    const day = map.get(e.date) ?? { tournament: 0, lesson: 0, match: 0 };
    day[e.kind]++;
    map.set(e.date, day);
  });
  return map;
}

// Libellés compacts pour la frise : « Lun. », « 14 ».
export function dayLabels(dateStr: string): { weekday: string; day: string } {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = d.toLocaleDateString("fr-FR", { weekday: "short" }).replace(".", "");
  return {
    weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1),
    day: String(d.getDate()),
  };
}
