// ═══ Stats d'entraînement : relevé en direct d'un match à 4 ═══
// Ordre fixe des joueurs, identique à la disposition à l'écran :
// 0 = équipe 1 gauche, 1 = équipe 1 droite, 2 = équipe 2 gauche, 3 = équipe 2 droite.
// Une balle « touchée » est une frappe en jeu (service exclu). Un point gagnant
// ou une faute directe est aussi une balle touchée.

import { formatDateLong } from "./format";
import { scoreFromEvents, scoreText, type ScoreSettings } from "./padel-score";

export type TrainingEventKind = "touch" | "winner" | "error";

export interface TrainingEvent {
  p: number; // index du joueur (0..3)
  k: TrainingEventKind;
  // Gagnant ou faute saisi juste après la frappe du même joueur : c'est la
  // même balle, elle n'est comptée qu'une fois (dans le gagnant / la faute).
  fromTouch?: boolean;
  // Gagnant ou faute saisi juste après une frappe tapée sur le PARTENAIRE :
  // deux partenaires ne frappent jamais l'un après l'autre, cette frappe était
  // donc une erreur de saisie. Elle est remplacée par le gagnant / la faute
  // (index du partenaire dont la frappe est retirée). Annuler la rétablit.
  replaces?: number;
}

// Déroulé d'un point : le service n'est pas noté, chaque frappe est tapée
// (à commencer par le retour du receveur), et le point se termine par une
// faute directe ou un point gagnant. Si la dernière frappe tapée est celle du
// joueur qui fait la faute ou le gagnant, elle est reprise par cet événement.
export function endOfPointEvent(
  events: TrainingEvent[],
  p: number,
  k: Exclude<TrainingEventKind, "touch">
): TrainingEvent {
  const last = events[events.length - 1];
  if (last && last.k === "touch" && last.p === p) return { p, k, fromTouch: true };
  if (last && last.k === "touch" && last.p === (p ^ 1)) return { p, k, replaces: last.p };
  return { p, k };
}

export type Quad = [number, number, number, number];

export interface TrainingSession {
  id: string;
  date: string; // ISO, début du match
  endedAt: string; // ISO
  players: [string, string, string, string];
  touches: Quad; // balles en jeu hors gagnants et fautes
  winners: Quad;
  errors: Quad;
  // Détail tap par tap (matchs saisis depuis l'ajout du suivi point par point) :
  // points, échanges, ligne / diagonale et courbes en dépendent.
  events?: TrainingEvent[];
  scoring?: ScoreSettings | null;
  created_by?: string | null;
}

// Match en cours, conservé dans le navigateur pour survivre à un rechargement.
export interface TrainingLive {
  startedAt: string;
  players: [string, string, string, string];
  events: TrainingEvent[];
  // Changement de côté : l'affichage pivote de 180° (le joueur en haut à
  // gauche passe en bas à droite) pour coller à ce que voit l'observateur.
  flipped?: boolean;
  // Score du match (null : stats seules, sans score).
  scoring?: ScoreSettings | null;
  // Rappel des changements de côté (désactivable en plein match).
  sideChanges?: boolean;
}

export const PLAYER_SLOTS = [
  { team: 1, side: "G" },
  { team: 1, side: "D" },
  { team: 2, side: "G" },
  { team: 2, side: "D" },
] as const;

// Une couleur par joueur, reprise dans tous les blocs et les graphiques (ni
// rouge ni vert, réservés aux fautes et aux gagnants). Palette validée sur le
// fond sombre de l'appli : distincte deux à deux, y compris en vision
// daltonienne, car les 4 courbes se croisent.
export const PLAYER_COLORS = ["#2c6fd1", "#22a2c2", "#c98500", "#d55181"];

export const zeroQuad = (): Quad => [0, 0, 0, 0];

export function countEvents(events: TrainingEvent[]) {
  const touches = zeroQuad();
  const winners = zeroQuad();
  const errors = zeroQuad();
  events.forEach((e) => {
    if (e.p < 0 || e.p > 3) return;
    if (e.k === "touch") touches[e.p]++;
    else {
      if (e.k === "winner") winners[e.p]++;
      else errors[e.p]++;
      // La frappe déjà tapée devient le gagnant / la faute : pas de double compte.
      if (e.fromTouch) touches[e.p]--;
      // Frappe tapée par erreur sur le partenaire : retirée.
      if (e.replaces != null) touches[e.replaces]--;
    }
  });
  return { touches, winners, errors };
}

export interface PlayerTrainingStats {
  name: string;
  team: 1 | 2;
  side: "G" | "D";
  balls: number; // total des balles touchées (gagnants et fautes compris)
  winners: number;
  errors: number;
  net: number; // gagnants − fautes
  share: number; // part des balles du match (0..1)
  teamShare: number; // part des balles de son équipe (0..1)
  winnerRate: number; // gagnants / balles (0..1)
  errorRate: number; // fautes / balles (0..1)
}

export interface TeamTrainingStats {
  team: 1 | 2;
  balls: number;
  winners: number;
  errors: number;
  net: number;
}

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);

export function computeTrainingStats(s: Pick<TrainingSession, "players" | "touches" | "winners" | "errors">) {
  const balls = [0, 1, 2, 3].map((i) => s.touches[i] + s.winners[i] + s.errors[i]);
  const total = balls.reduce((a, b) => a + b, 0);
  const teamBalls = [balls[0] + balls[1], balls[2] + balls[3]];
  const players: PlayerTrainingStats[] = PLAYER_SLOTS.map((slot, i) => ({
    name: s.players[i],
    team: slot.team,
    side: slot.side,
    balls: balls[i],
    winners: s.winners[i],
    errors: s.errors[i],
    net: s.winners[i] - s.errors[i],
    share: ratio(balls[i], total),
    teamShare: ratio(balls[i], teamBalls[slot.team - 1]),
    winnerRate: ratio(s.winners[i], balls[i]),
    errorRate: ratio(s.errors[i], balls[i]),
  }));
  const teams: TeamTrainingStats[] = ([1, 2] as const).map((team) => {
    const ps = players.filter((p) => p.team === team);
    const winners = ps.reduce((a, p) => a + p.winners, 0);
    const errors = ps.reduce((a, p) => a + p.errors, 0);
    return { team, balls: teamBalls[team - 1], winners, errors, net: winners - errors };
  });
  return { players, teams, total };
}

export const pct = (x: number) => `${Math.round(x * 100)} %`;
export const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

// ─── Analyse point par point ───
// Un point = les frappes tapées puis une faute directe ou un point gagnant.
// Direction d'une frappe, déduite du joueur qui la reprend : deux joueurs du
// même côté (gauche-gauche, droite-droite) se font face en diagonale ; un
// gauche et un droit adverses sont dans le même couloir, en ligne droite. La
// dernière frappe d'un point n'est pas reprise : sa direction est inconnue.

export interface TrainingDetails {
  points: number;
  avgRally: number; // balles par point (service exclu)
  maxRally: number;
  line: Quad; // frappes en ligne droite
  diag: Quad; // frappes en diagonale
  curve: Quad[]; // +/- cumulé de chaque joueur, avant le 1er point puis après chaque point
}

export function analyzeTraining(events: TrainingEvent[]): TrainingDetails {
  const line = zeroQuad();
  const diag = zeroQuad();
  const curve: Quad[] = [zeroQuad()];
  const rallies: number[] = [];
  let hitters: number[] = [];

  events.forEach((e) => {
    if (e.p < 0 || e.p > 3) return;
    if (e.k === "touch") {
      hitters.push(e.p);
      return;
    }
    if (e.replaces != null) hitters.pop(); // frappe du partenaire saisie par erreur
    if (!e.fromTouch) hitters.push(e.p);
    for (let i = 0; i < hitters.length - 1; i++) {
      const [a, b] = [hitters[i], hitters[i + 1]];
      if (PLAYER_SLOTS[a].team === PLAYER_SLOTS[b].team) continue; // saisie incohérente
      if (PLAYER_SLOTS[a].side === PLAYER_SLOTS[b].side) diag[a]++;
      else line[a]++;
    }
    rallies.push(hitters.length);
    hitters = [];
    const next = [...curve[curve.length - 1]] as Quad;
    next[e.p] += e.k === "winner" ? 1 : -1;
    curve.push(next);
  });

  return {
    points: rallies.length,
    avgRally: rallies.length ? rallies.reduce((a, b) => a + b, 0) / rallies.length : 0,
    maxRally: rallies.length ? Math.max(...rallies) : 0,
    line,
    diag,
    curve,
  };
}

// ─── Progression d'un joueur ───

export interface TrainingProgressRow extends PlayerTrainingStats {
  sessionId: string;
  date: string;
  partner: string;
}

export function playerTrainingHistory(
  sessions: TrainingSession[],
  playerName: string
): TrainingProgressRow[] {
  const key = playerName.toLowerCase().trim();
  const rows: TrainingProgressRow[] = [];
  sessions.forEach((s) => {
    const idx = s.players.findIndex((p) => p.toLowerCase().trim() === key);
    if (idx < 0) return;
    const stats = computeTrainingStats(s).players[idx];
    rows.push({ ...stats, sessionId: s.id, date: s.date, partner: s.players[idx ^ 1] });
  });
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export interface TrainingAverages {
  matches: number;
  ballsPerMatch: number;
  share: number;
  winnerRate: number;
  errorRate: number;
  netPerMatch: number;
}

// Moyennes pondérées par le nombre de balles (un match très court ne pèse pas
// autant qu'un long).
export function trainingAverages(rows: TrainingProgressRow[]): TrainingAverages | null {
  if (!rows.length) return null;
  const balls = rows.reduce((a, r) => a + r.balls, 0);
  const winners = rows.reduce((a, r) => a + r.winners, 0);
  const errors = rows.reduce((a, r) => a + r.errors, 0);
  return {
    matches: rows.length,
    ballsPerMatch: balls / rows.length,
    share: rows.reduce((a, r) => a + r.share, 0) / rows.length,
    winnerRate: ratio(winners, balls),
    errorRate: ratio(errors, balls),
    netPerMatch: (winners - errors) / rows.length,
  };
}

// Tendance : les 3 derniers matchs comparés aux précédents (au moins 2
// matchs de chaque côté, sinon pas de tendance).
export function trainingTrend(rows: TrainingProgressRow[]) {
  if (rows.length < 4) return null;
  const recent = trainingAverages(rows.slice(0, 3))!;
  const before = trainingAverages(rows.slice(3))!;
  return {
    winnerRate: recent.winnerRate - before.winnerRate,
    errorRate: recent.errorRate - before.errorRate,
    netPerMatch: recent.netPerMatch - before.netPerMatch,
  };
}

export function allTrainingPlayers(sessions: TrainingSession[]): string[] {
  const seen = new Map<string, string>();
  sessions.forEach((s) =>
    s.players.forEach((p) => {
      const k = p.toLowerCase().trim();
      if (k && !seen.has(k)) seen.set(k, p);
    })
  );
  return [...seen.values()].sort((a, b) => a.localeCompare(b, "fr"));
}

// ─── Partage WhatsApp ───

export function formatTrainingText(s: TrainingSession): string {
  const { players, teams } = computeTrainingStats(s);
  const minutes = Math.max(
    1,
    Math.round((new Date(s.endedAt).getTime() - new Date(s.date).getTime()) / 60000)
  );
  const lines = [
    `🎯 *Stats d'entraînement — ${formatDateLong(s.date)}*`,
    `⏱ ${minutes} min`,
  ];
  ([1, 2] as const).forEach((team) => {
    const t = teams[team - 1];
    lines.push("", `*Équipe ${team}* — ${t.balls} balles · ✅ ${t.winners} · ❌ ${t.errors} · net ${signed(t.net)}`);
    players
      .filter((p) => p.team === team)
      .forEach((p) =>
        lines.push(
          `• ${p.name} (${p.side}) — ${p.balls} balles (${pct(p.share)}) · ✅ ${p.winners} · ❌ ${p.errors} · net ${signed(p.net)}`
        )
      );
  });
  if (s.scoring) {
    const st = scoreFromEvents(s.scoring, s.events || []);
    const team = (t: 0 | 1) => `${s.players[t * 2]} / ${s.players[t * 2 + 1]}`;
    lines.splice(
      2,
      0,
      st.finished && st.winner != null
        ? `🏆 *${team(st.winner)}* gagnent ${scoreText(st, st.winner)}`
        : `🎾 Score à l'arrêt : ${scoreText(st)} (équipe 1 - équipe 2)`
    );
  }
  if (s.events?.length) {
    const d = analyzeTraining(s.events);
    lines.splice(
      2,
      0,
      `🎾 ${d.points} points · échange moyen ${d.avgRally.toFixed(1)} frappes · plus long ${d.maxRally}`
    );
    lines.push("", "*Ligne droite / diagonale*");
    players.forEach((p, i) => lines.push(`• ${p.name} — ${d.line[i]} ligne · ${d.diag[i]} diagonale`));
  }
  lines.push("", "✅ point gagnant · ❌ faute directe · net = gagnants − fautes");
  return lines.join("\n");
}
