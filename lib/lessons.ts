import { levelsIncludePlayer, levelsLabel } from "./levels";
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

// Ciblage par niveaux : règles communes aux leçons et aux créneaux de match.
export const lessonIncludesPlayer = levelsIncludePlayer;
export const lessonLevelsLabel = levelsLabel;
