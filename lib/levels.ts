import type { LevelLabel } from "./types";

export const LEVEL_LABELS: LevelLabel[] = ["3/4", "4/5", "5/6", "6/7", "7/8", "8/9", "9/10"];

export const PLAYER_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// Un tournoi « 6/7 » comprend les joueurs de niveau 6 et 7.
export function levelsOfLabel(label: string): number[] {
  const parts = label.split("/").map((s) => parseInt(s, 10)).filter((n) => !isNaN(n));
  return parts.length ? parts : [];
}

// Un joueur voit uniquement les tournois qui comprennent son niveau.
export function labelIncludesPlayer(label: string, playerLevel: number | null): boolean {
  if (playerLevel == null) return false;
  return levelsOfLabel(label).includes(playerLevel);
}

// ─── Ciblage par liste de niveaux (leçons, créneaux de match) ───
// Une liste vide vise tous les niveaux, et un joueur sans niveau attribué voit
// tout — même règle que pour les tournois.
export function levelsIncludePlayer(levels: number[] | null, playerLevel: number | null): boolean {
  if (!levels || levels.length === 0) return true;
  if (playerLevel == null) return true;
  return levels.includes(playerLevel);
}

// Libellé compact : « Niveaux 5 · 6 · 7 » / « Tous niveaux ».
export function levelsLabel(levels: number[] | null): string {
  const l = [...(levels || [])].sort((a, b) => a - b);
  if (!l.length) return "Tous niveaux";
  return `Niveau${l.length > 1 ? "x" : ""} ${l.join(" · ")}`;
}

export const LEVEL_MULTIPLIER: Record<string, number> = {
  "3/4": 0.35,
  "4/5": 0.5,
  "5/6": 0.75,
  "6/7": 1,
  "7/8": 1.5,
  "8/9": 2,
  "9/10": 2.5,
};

export function getLevelMultiplier(label?: string): number {
  return LEVEL_MULTIPLIER[label ?? "6/7"] ?? 1;
}
