import type { TournamentFormat } from "./types";

// Modes de mini-tournoi proposés dans les menus. Un mode correspond à un
// format stocké en base + un nombre de terrains : « Rotation » est le moteur
// Mexicano joué à 4 sur 1 terrain (aucune valeur de plus en base).
export type FormatMode = "equipes" | "mexicano" | "rotation" | "bo4";

export const FORMATS: {
  value: FormatMode;
  format: TournamentFormat; // valeur enregistrée sur le tournoi
  icon: string;
  label: string;
  short: string;
  courts: number | null; // nombre de terrains imposé (null = libre)
  desc: string;
}[] = [
  {
    value: "equipes",
    format: "equipes",
    icon: "👥",
    label: "Équipes fixes",
    short: "Équipes",
    courts: null,
    desc: "Paires fixes qui se rencontrent toutes.",
  },
  {
    value: "mexicano",
    format: "mexicano",
    icon: "🔀",
    label: "Mexicano",
    short: "Mexicano",
    courts: 2,
    desc: "8 joueurs, 2 terrains : paires recomposées à chaque round selon le classement du jour, puis finale et petite finale.",
  },
  {
    value: "rotation",
    format: "mexicano",
    icon: "🔁",
    label: "Rotation",
    short: "Rotation",
    courts: 1,
    desc: "4 joueurs, 1 terrain : 3 rounds de 27 min, chacun joue une fois avec chacun des 3 autres. Points V-Champs.",
  },
  {
    value: "bo4",
    format: "bo4",
    icon: "🔄",
    label: "Best Of 4",
    short: "Best Of 4",
    courts: 1,
    desc: "4 joueurs, 1 terrain : chacun joue avec chacun, à gauche ET à droite (6 matchs). Classement à part.",
  },
];

// Mode d'un tournoi ou d'une session à partir de son format et de son nombre
// de terrains (ou de joueurs pour une session archivée).
export function modeOf(format: TournamentFormat | null | undefined, courts?: number | null): FormatMode {
  if (format === "bo4") return "bo4";
  if (format === "mexicano") return courts === 1 ? "rotation" : "mexicano";
  return "equipes";
}

export const modeMeta = (m: FormatMode) => FORMATS.find((x) => x.value === m)!;

// Terrains d'une session archivée : l'historique ne garde que les joueurs.
export const historyCourts = (e: { seedOrder?: string[] }) =>
  e.seedOrder && e.seedOrder.length > 0 && e.seedOrder.length <= 4 ? 1 : 2;

// Badge affiché pour les modes autres que la formule historique.
export function formatTag(format: TournamentFormat | null | undefined, courts?: number | null) {
  const m = modeOf(format, courts);
  return m === "equipes" ? null : `${modeMeta(m).icon} ${modeMeta(m).label}`;
}
