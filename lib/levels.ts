import type { LevelLabel } from "./types";

export const LEVEL_LABELS: LevelLabel[] = ["4/5", "5/6", "6/7", "7/8"];

export const PLAYER_LEVELS = [4, 5, 6, 7, 8];

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

export const LEVEL_MULTIPLIER: Record<string, number> = {
  "4/5": 0.5,
  "5/6": 0.75,
  "6/7": 1,
  "7/8": 1.5,
};

export function getLevelMultiplier(label?: string): number {
  return LEVEL_MULTIPLIER[label ?? "6/7"] ?? 1;
}
