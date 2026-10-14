// ═══ Score de padel calculé à partir des stats saisies ═══
// Un point gagnant donne le point à l'équipe du joueur, une faute directe le
// donne à l'équipe adverse. Le score n'est jamais stocké : il est recalculé
// à partir des événements, ce qui rend l'annulation automatique.
// Index joueurs : 0 = équipe 1 gauche, 1 = équipe 1 droite, 2 = équipe 2
// gauche, 3 = équipe 2 droite.

export type DeuceRule = "advantage" | "golden" | "star";
export type SetFormat = "set6" | "pro9";

export interface ScoreSettings {
  firstServer: number; // serveur du 1er jeu
  secondServer: number; // serveur du 2e jeu (équipe adverse)
  deuce: DeuceRule;
  format: SetFormat;
}

export const DEUCE_RULES: { value: DeuceRule; label: string; desc: string }[] = [
  { value: "advantage", label: "Avantages", desc: "Avantage classique à 40-40" },
  { value: "golden", label: "Point décisif", desc: "À 40-40, le point suivant gagne le jeu" },
  { value: "star", label: "Star point", desc: "2 avantages, puis point décisif à la 3e égalité" },
];

export const SET_FORMATS: { value: SetFormat; label: string; desc: string }[] = [
  { value: "set6", label: "Set de 6 jeux", desc: "Tie-break à 6-6" },
  { value: "pro9", label: "Match en 9 jeux", desc: "Tie-break à 8-8" },
];

// Ordre de service : serveur du jeu 1, du jeu 2, puis leurs partenaires.
export function serveOrder(s: ScoreSettings): number[] {
  return [s.firstServer, s.secondServer, s.firstServer ^ 1, s.secondServer ^ 1];
}

export const teamOf = (p: number) => (p < 2 ? 0 : 1);

export interface ScoreState {
  games: [number, number];
  points: [number, number]; // points du jeu en cours (ou du tie-break)
  tiebreak: boolean;
  server: number; // joueur au service pour le prochain point
  finished: boolean;
  winner: 0 | 1 | null; // équipe gagnante (0 = équipe 1)
  deciding: boolean; // le prochain point décide du jeu (point décisif / star point)
  deuceCount: number;
  gamesPlayed: number;
  tiebreakScore: [number, number] | null; // score du tie-break une fois joué
  pointsPlayed: number;
  // Changements de côté attendus depuis le début (après chaque jeu impair,
  // puis tous les 6 points en tie-break).
  endChanges: number;
}

const GAME_TARGET: Record<SetFormat, number> = { set6: 6, pro9: 9 };
const TIEBREAK_AT: Record<SetFormat, number> = { set6: 6, pro9: 8 };

export function initialScore(s: ScoreSettings): ScoreState {
  return {
    games: [0, 0],
    points: [0, 0],
    tiebreak: false,
    server: s.firstServer,
    finished: false,
    winner: null,
    deciding: false,
    deuceCount: 0,
    gamesPlayed: 0,
    tiebreakScore: null,
    pointsPlayed: 0,
    endChanges: 0,
  };
}

// Applique un point gagné par l'équipe `t` (0 ou 1).
export function applyPoint(s: ScoreSettings, st: ScoreState, t: 0 | 1): ScoreState {
  if (st.finished) return st;
  const n: ScoreState = {
    ...st,
    games: [...st.games] as [number, number],
    points: [...st.points] as [number, number],
  };
  const o = (1 - t) as 0 | 1;
  const order = serveOrder(s);
  n.pointsPlayed++;

  const winGame = () => {
    n.games[t]++;
    n.points = [0, 0];
    n.deuceCount = 0;
    n.gamesPlayed++;
    // Changement de côté après chaque jeu impair.
    if (n.gamesPlayed % 2 === 1) n.endChanges++;
    const target = GAME_TARGET[s.format];
    const tbAt = TIEBREAK_AT[s.format];
    if (n.games[t] >= target && n.games[t] - n.games[o] >= 2) {
      n.finished = true;
      n.winner = t;
    } else if (n.games[0] === tbAt && n.games[1] === tbAt) {
      n.tiebreak = true;
    }
    n.server = order[n.gamesPlayed % 4];
  };

  if (st.tiebreak) {
    n.points[t]++;
    const total = n.points[0] + n.points[1];
    if (total % 6 === 0) n.endChanges++;
    if (n.points[t] >= 7 && n.points[t] - n.points[o] >= 2) {
      n.tiebreakScore = [...n.points] as [number, number];
      n.games[t]++;
      n.gamesPlayed++;
      n.points = [0, 0];
      n.tiebreak = false;
      n.finished = true;
      n.winner = t;
      return n;
    }
    // Tie-break : le 1er point est servi par le joueur dont c'est le tour,
    // puis chacun sert deux points à tour de rôle.
    n.server = order[(st.gamesPlayed + Math.floor((total + 1) / 2)) % 4];
    return n;
  }

  // Jeu normal.
  const level = st.points[0] === st.points[1] && st.points[0] >= 3;
  const decides =
    (s.deuce === "golden" && level) || (s.deuce === "star" && level && st.deuceCount >= 3);
  n.points[t]++;
  if (decides || (n.points[t] >= 4 && n.points[t] - n.points[o] >= 2)) {
    winGame();
  } else if (n.points[0] === n.points[1] && n.points[0] >= 3) {
    n.deuceCount++;
  }
  n.deciding =
    !n.finished &&
    !n.tiebreak &&
    n.points[0] === n.points[1] &&
    n.points[0] >= 3 &&
    (s.deuce === "golden" || (s.deuce === "star" && n.deuceCount >= 3));
  return n;
}

// Libellé des points d'une équipe dans le jeu en cours.
export function pointLabel(st: ScoreState, t: 0 | 1): string {
  if (st.tiebreak) return String(st.points[t]);
  const [a, b] = [st.points[t], st.points[1 - t]];
  if (a >= 3 && b >= 3) return a > b ? "AV" : "40";
  return ["0", "15", "30", "40"][Math.min(a, 3)];
}

// Ligne d'état sous le score : égalité, avantage, point décisif…
export function scoreStatus(st: ScoreState, s: ScoreSettings): string | null {
  if (st.finished) return null;
  if (st.tiebreak) return "Tie-break";
  const [a, b] = st.points;
  if (a >= 3 && b >= 3) {
    if (a !== b) return "Avantage";
    if (st.deciding) return s.deuce === "star" ? "⭐ Star point" : "Point décisif";
    return "Égalité";
  }
  return null;
}

// Score final ou à l'arrêt, en texte (ex. « 7-6 (7-4) » ou « 4-3 · 30-15 »).
// `first` : équipe dont le score est donné en premier (0 = équipe 1).
export function scoreText(st: ScoreState, first: 0 | 1 = 0): string {
  const [a, b] = first === 0 ? [0, 1] as const : [1, 0] as const;
  const set = `${st.games[a]}-${st.games[b]}`;
  if (st.finished)
    return st.tiebreakScore ? `${set} (${st.tiebreakScore[a]}-${st.tiebreakScore[b]})` : set;
  const pts = st.tiebreak
    ? `TB ${st.points[a]}-${st.points[b]}`
    : st.points[0] + st.points[1] > 0
      ? `${pointLabel(st, a)}-${pointLabel(st, b)}`
      : "";
  return pts ? `${set} · ${pts}` : set;
}

// Score à partir des événements de stats (gagnant = point pour l'équipe du
// joueur, faute = point pour l'équipe adverse ; les frappes ne comptent pas).
export function scoreFromEvents(
  s: ScoreSettings,
  events: { p: number; k: "touch" | "winner" | "error" }[]
): ScoreState {
  let st = initialScore(s);
  events.forEach((e) => {
    if (e.k === "touch" || e.p < 0 || e.p > 3) return;
    const team = teamOf(e.p);
    st = applyPoint(s, st, (e.k === "winner" ? team : 1 - team) as 0 | 1);
  });
  return st;
}
