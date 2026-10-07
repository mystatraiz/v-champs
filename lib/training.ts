// ═══ Stats d'entraînement : relevé en direct d'un match à 4 ═══
// Ordre fixe des joueurs, identique à la disposition à l'écran :
// 0 = équipe 1 gauche, 1 = équipe 1 droite, 2 = équipe 2 gauche, 3 = équipe 2 droite.
// Une balle « touchée » est une frappe en jeu (service exclu). Un point gagnant
// ou une faute directe est aussi une balle touchée.

import { formatDateLong } from "./format";

export type TrainingEventKind = "touch" | "winner" | "error";

export interface TrainingEvent {
  p: number; // index du joueur (0..3)
  k: TrainingEventKind;
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
}

export const PLAYER_SLOTS = [
  { team: 1, side: "G" },
  { team: 1, side: "D" },
  { team: 2, side: "G" },
  { team: 2, side: "D" },
] as const;

// Une couleur par joueur, reprise dans tous les blocs (ni rouge ni vert,
// réservés aux fautes et aux gagnants).
export const PLAYER_COLORS = ["#4f8ef7", "#a78bfa", "#f5b942", "#f472b6"];

export const zeroQuad = (): Quad => [0, 0, 0, 0];

export function countEvents(events: TrainingEvent[]) {
  const touches = zeroQuad();
  const winners = zeroQuad();
  const errors = zeroQuad();
  events.forEach((e) => {
    if (e.p < 0 || e.p > 3) return;
    if (e.k === "touch") touches[e.p]++;
    else if (e.k === "winner") winners[e.p]++;
    else errors[e.p]++;
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
  lines.push("", "✅ point gagnant · ❌ faute directe · net = gagnants − fautes");
  return lines.join("\n");
}
