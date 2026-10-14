// ═══ Score de padel calculé à partir des stats saisies ═══
// Un point gagnant donne le point à l'équipe du joueur, une faute directe le
// donne à l'équipe adverse. Le score n'est jamais stocké : il est recalculé
// à partir des événements, ce qui rend l'annulation automatique.
// Index joueurs : 0 = équipe 1 gauche, 1 = équipe 1 droite, 2 = équipe 2
// gauche, 3 = équipe 2 droite.

export type DeuceRule = "advantage" | "golden" | "star";
// set6 : 1 set de 6 jeux · pro9 : 1 set de 9 jeux · bo3 : 2 sets gagnants
// (3e set complet) · bo3stb : 2 sets gagnants, 3e set en super tie-break à 10.
export type SetFormat = "set6" | "pro9" | "bo3" | "bo3stb";

export interface ScoreSettings {
  firstServer: number; // serveur du 1er jeu
  // Serveur du 2e jeu (équipe adverse) : choisi à la fin du 1er jeu, null
  // avant ; on suppose alors le joueur de gauche de l'équipe adverse.
  secondServer: number | null;
  deuce: DeuceRule;
  format: SetFormat;
}

export const DEUCE_RULES: { value: DeuceRule; label: string; desc: string }[] = [
  { value: "advantage", label: "Avantages", desc: "Avantage classique à 40-40" },
  { value: "golden", label: "Point décisif", desc: "À 40-40, le point suivant gagne le jeu" },
  { value: "star", label: "Star point", desc: "2 avantages, puis point décisif à la 3e égalité" },
];

export const SET_FORMATS: { value: SetFormat; label: string; desc: string }[] = [
  { value: "set6", label: "1 set de 6 jeux", desc: "Tie-break à 6-6" },
  { value: "pro9", label: "1 set de 9 jeux", desc: "Tie-break à 8-8" },
  { value: "bo3", label: "2 sets gagnants", desc: "Sets de 6 jeux, 3e set complet" },
  { value: "bo3stb", label: "2 sets + super TB", desc: "3e set : super tie-break à 10" },
];

// Ordre de service : serveur du jeu 1, du jeu 2, puis leurs partenaires. Il
// se poursuit d'un set à l'autre.
export function serveOrder(s: ScoreSettings): number[] {
  const second = s.secondServer ?? (s.firstServer < 2 ? 2 : 0);
  return [s.firstServer, second, s.firstServer ^ 1, second ^ 1];
}

export const teamOf = (p: number) => (p < 2 ? 0 : 1);

export interface SetScore {
  games: [number, number];
  tiebreak: [number, number] | null; // score du tie-break (ou du super tie-break)
  superTiebreak: boolean; // set joué en super tie-break
}

export interface ScoreState {
  sets: [number, number]; // sets gagnés
  setScores: SetScore[]; // sets terminés
  games: [number, number]; // jeux du set en cours
  points: [number, number]; // points du jeu en cours (ou du tie-break)
  tiebreak: boolean; // tie-break (ou super tie-break) en cours
  superTiebreak: boolean;
  server: number; // joueur au service pour le prochain point
  finished: boolean;
  winner: 0 | 1 | null; // équipe gagnante (0 = équipe 1)
  deciding: boolean; // le prochain point décide du jeu (point décisif / star point)
  deuceCount: number;
  gamesPlayed: number; // jeux joués depuis le début (tie-breaks compris)
  pointsPlayed: number;
  // Changements de côté attendus depuis le début : après chaque jeu impair
  // de chaque set, puis tous les 6 points en tie-break.
  endChanges: number;
}

const formatSets = (f: SetFormat) => (f === "bo3" || f === "bo3stb" ? 2 : 1); // sets à gagner
const gameTarget = (f: SetFormat) => (f === "pro9" ? 9 : 6);
const tiebreakAt = (f: SetFormat) => (f === "pro9" ? 8 : 6);

export function initialScore(s: ScoreSettings): ScoreState {
  return {
    sets: [0, 0],
    setScores: [],
    games: [0, 0],
    points: [0, 0],
    tiebreak: false,
    superTiebreak: false,
    server: s.firstServer,
    finished: false,
    winner: null,
    deciding: false,
    deuceCount: 0,
    gamesPlayed: 0,
    pointsPlayed: 0,
    endChanges: 0,
  };
}

// Applique un point gagné par l'équipe `t` (0 ou 1).
export function applyPoint(s: ScoreSettings, st: ScoreState, t: 0 | 1): ScoreState {
  if (st.finished) return st;
  const n: ScoreState = {
    ...st,
    sets: [...st.sets] as [number, number],
    setScores: [...st.setScores],
    games: [...st.games] as [number, number],
    points: [...st.points] as [number, number],
  };
  const o = (1 - t) as 0 | 1;
  const order = serveOrder(s);
  n.pointsPlayed++;

  // Fin d'un set gagné par `t` : match terminé ou set suivant.
  const winSet = (tb: [number, number] | null) => {
    n.setScores.push({ games: [...n.games] as [number, number], tiebreak: tb, superTiebreak: st.superTiebreak });
    n.sets[t]++;
    n.games = [0, 0];
    n.points = [0, 0];
    n.tiebreak = false;
    n.superTiebreak = false;
    if (n.sets[t] >= formatSets(s.format)) {
      n.finished = true;
      n.winner = t;
      return;
    }
    // 3e set en super tie-break à 1 set partout.
    if (s.format === "bo3stb" && n.sets[0] === 1 && n.sets[1] === 1) {
      n.tiebreak = true;
      n.superTiebreak = true;
    }
  };

  // Jeu gagné par `t` (tie-break compris, compté comme un jeu).
  const winGame = (tb: [number, number] | null) => {
    n.games[t]++;
    n.points = [0, 0];
    n.deuceCount = 0;
    n.gamesPlayed++;
    const inSet = n.games[0] + n.games[1];
    // Changement de côté après chaque jeu impair du set.
    if (inSet % 2 === 1) n.endChanges++;
    n.server = order[n.gamesPlayed % 4];
    if (tb || (n.games[t] >= gameTarget(s.format) && n.games[t] - n.games[o] >= 2)) {
      winSet(tb);
    } else if (n.games[0] === tiebreakAt(s.format) && n.games[1] === tiebreakAt(s.format)) {
      n.tiebreak = true;
    }
  };

  if (st.tiebreak) {
    n.points[t]++;
    const total = n.points[0] + n.points[1];
    if (total % 6 === 0) n.endChanges++;
    const target = st.superTiebreak ? 10 : 7;
    if (n.points[t] >= target && n.points[t] - n.points[o] >= 2) {
      const tb = [...n.points] as [number, number];
      if (st.superTiebreak) {
        // Le super tie-break remplace le 3e set : il compte comme un jeu 1-0.
        n.gamesPlayed++;
        n.server = order[n.gamesPlayed % 4];
        n.games[t] = 1;
        winSet(tb);
      } else {
        winGame(tb);
      }
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
    winGame(null);
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
  if (st.superTiebreak) return "Super tie-break";
  if (st.tiebreak) return "Tie-break";
  const [a, b] = st.points;
  if (a >= 3 && b >= 3) {
    if (a !== b) return "Avantage";
    if (st.deciding) return s.deuce === "star" ? "⭐ Star point" : "Point décisif";
    return "Égalité";
  }
  return null;
}

// Un set en texte : « 6-4 », « 7-6 (7-4) », super tie-break « [10-7] ».
export function setText(set: SetScore, first: 0 | 1 = 0): string {
  const [a, b] = first === 0 ? ([0, 1] as const) : ([1, 0] as const);
  if (set.superTiebreak && set.tiebreak) return `[${set.tiebreak[a]}-${set.tiebreak[b]}]`;
  const g = `${set.games[a]}-${set.games[b]}`;
  return set.tiebreak ? `${g} (${set.tiebreak[a]}-${set.tiebreak[b]})` : g;
}

// Score complet ou à l'arrêt (ex. « 6-4 3-6 [10-7] » ou « 6-4 2-1 · 30-15 »).
// `first` : équipe dont le score est donné en premier (0 = équipe 1).
export function scoreText(st: ScoreState, first: 0 | 1 = 0): string {
  const [a, b] = first === 0 ? ([0, 1] as const) : ([1, 0] as const);
  const done = st.setScores.map((set) => setText(set, first));
  if (st.finished) return done.join(" ");
  const current = st.superTiebreak
    ? `[${st.points[a]}-${st.points[b]}]`
    : `${st.games[a]}-${st.games[b]}`;
  const pts =
    st.superTiebreak
      ? ""
      : st.tiebreak
        ? `TB ${st.points[a]}-${st.points[b]}`
        : st.points[0] + st.points[1] > 0
          ? `${pointLabel(st, a)}-${pointLabel(st, b)}`
          : "";
  return [...done, current].join(" ") + (pts ? ` · ${pts}` : "");
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
