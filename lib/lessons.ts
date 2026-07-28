import type { LessonKind } from "./types";

// Types de leçon et nombre de joueurs par terrain.
export const LESSON_KINDS: { value: LessonKind; label: string; icon: string; perCourt: number }[] = [
  { value: "phases", label: "Phases de jeu", icon: "🎾", perCourt: 4 },
  { value: "panier", label: "Panier", icon: "🧺", perCourt: 3 },
];

export const LESSON_COURTS = [1, 2];

export function lessonKind(kind: string) {
  return LESSON_KINDS.find((k) => k.value === kind) ?? LESSON_KINDS[0];
}

export function lessonKindLabel(kind: string): string {
  return lessonKind(kind).label;
}

// Capacité : 4 joueurs/terrain en phases de jeu, 3 en panier.
export function lessonCapacity(kind: string, courts: number): number {
  return lessonKind(kind).perCourt * Math.max(1, courts);
}

// Un joueur voit une leçon si elle cible son niveau. Une leçon sans niveau
// coché est ouverte à tous, et un joueur sans niveau attribué voit tout.
export function lessonIncludesPlayer(levels: number[] | null, playerLevel: number | null): boolean {
  if (!levels || levels.length === 0) return true;
  if (playerLevel == null) return true;
  return levels.includes(playerLevel);
}

// Libellé compact des niveaux ciblés : « Niveaux 5 · 6 · 7 » / « Tous niveaux ».
export function lessonLevelsLabel(levels: number[] | null): string {
  const l = [...(levels || [])].sort((a, b) => a - b);
  if (!l.length) return "Tous niveaux";
  return `Niveau${l.length > 1 ? "x" : ""} ${l.join(" · ")}`;
}
