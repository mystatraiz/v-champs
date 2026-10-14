import type { TournamentFormat } from "./types";

// Formules de mini-tournoi : libellés et contraintes de terrain.
export const FORMATS: {
  value: TournamentFormat;
  icon: string;
  label: string;
  short: string;
  courts: number | null; // nombre de terrains imposé (null = libre)
  desc: string;
}[] = [
  {
    value: "equipes",
    icon: "👥",
    label: "Équipes fixes",
    short: "Équipes",
    courts: null,
    desc: "Paires fixes qui se rencontrent toutes.",
  },
  {
    value: "mexicano",
    icon: "🔀",
    label: "Mexicano",
    short: "Mexicano",
    courts: null, // 2 terrains (8 joueurs) ou 1 terrain (4 joueurs)
    desc: "Paires recomposées à chaque round. 2 terrains : 8 joueurs, 4 rounds puis finale et petite finale. 1 terrain : 4 joueurs, 3 rounds, chacun avec chacun.",
  },
  {
    value: "bo4",
    icon: "🔄",
    label: "Best Of 4",
    short: "Best Of 4",
    courts: 1,
    desc: "4 joueurs, 1 terrain : chacun joue avec chacun, à gauche ET à droite (6 matchs). Classement à part.",
  },
];

export const formatMeta = (f: TournamentFormat | null | undefined) =>
  FORMATS.find((x) => x.value === (f || "equipes"))!;

// Badge affiché pour les formules autres que la formule historique.
export const formatTag = (f: TournamentFormat | null | undefined) =>
  f && f !== "equipes" ? `${formatMeta(f).icon} ${formatMeta(f).label}` : null;
