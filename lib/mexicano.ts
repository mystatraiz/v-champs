// ═══ Mexicano : paires recomposées à chaque round selon le classement ═══
// 8 joueurs, 2 terrains. Pas de paires fixes : le classement est individuel
// (jeux gagnés). Round 1 tiré du classement V-Champs, rounds suivants du
// classement du jour. Sur chaque terrain, le 1er du groupe joue avec le 4e
// contre le 2e et le 3e, ce qui équilibre les deux paires.

import type { Match, SessionState, Team } from "./types";

export const MEXICANO_ROUNDS = 5;
export const MEXICANO_MATCH_DURATION = 15 * 60; // secondes
export const MEXICANO_PLAYERS = 8;

// Barème V-Champs sur 8 places individuelles : même amplitude que les
// 4 places par équipe de la formule classique (100 → 25).
export const MEXICANO_POINTS_BY_POS: Record<number, number> = {
  1: 100,
  2: 88,
  3: 76,
  4: 64,
  5: 52,
  6: 42,
  7: 32,
  8: 25,
};

export type Side = "left" | "right" | "any";

export interface PlayerStanding {
  name: string;
  gamesFor: number;
  gamesAgainst: number;
  wins: number;
  draws: number;
  losses: number;
  played: number;
}

function matchGames(m: Match): [number, number] {
  if (m.scoreType === "sets" && m.sets) {
    return [m.sets.reduce((s, r) => s + r[0], 0), m.sets.reduce((s, r) => s + r[1], 0)];
  }
  return [m.score1, m.score2];
}

// Classement individuel à partir des matchs terminés. Départage : jeux gagnés,
// puis différence de jeux, puis victoires, puis ordre de tête de série (le
// mieux classé V-Champs passe devant à égalité parfaite).
export function computeIndividualStandings(
  teams: Team[],
  matches: Match[],
  seedOrder: string[] = []
): PlayerStanding[] {
  const rows = new Map<string, PlayerStanding>();
  const get = (name: string) => {
    let r = rows.get(name);
    if (!r) {
      r = { name, gamesFor: 0, gamesAgainst: 0, wins: 0, draws: 0, losses: 0, played: 0 };
      rows.set(name, r);
    }
    return r;
  };
  // Tous les joueurs apparaissent, même sans match terminé (avant le round 1).
  seedOrder.forEach((n) => n && get(n));
  teams.forEach((t) => (t.players || []).forEach((p) => p?.trim() && get(p)));

  matches
    .filter((m) => m.status === "finished")
    .forEach((m) => {
      const t1 = teams.find((t) => t.id === m.team1Id);
      const t2 = teams.find((t) => t.id === m.team2Id);
      if (!t1 || !t2) return;
      const [g1, g2] = matchGames(m);
      const credit = (team: Team, gf: number, ga: number, sw: number, sl: number) =>
        (team.players || []).forEach((p) => {
          if (!p?.trim()) return;
          const r = get(p);
          r.played++;
          r.gamesFor += gf;
          r.gamesAgainst += ga;
          if (sw > sl) r.wins++;
          else if (sl > sw) r.losses++;
          else r.draws++;
        });
      credit(t1, g1, g2, m.score1, m.score2);
      credit(t2, g2, g1, m.score2, m.score1);
    });

  const seedIdx = (n: string) => {
    const i = seedOrder.findIndex((s) => s.toLowerCase().trim() === n.toLowerCase().trim());
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...rows.values()].sort(
    (a, b) =>
      b.gamesFor - a.gamesFor ||
      b.gamesFor - b.gamesAgainst - (a.gamesFor - a.gamesAgainst) ||
      b.wins - a.wins ||
      seedIdx(a.name) - seedIdx(b.name)
  );
}

// Place chaque joueur du bon côté selon sa préférence quand c'est possible.
function orderBySide(a: string, b: string, sides: Record<string, Side>): [string, string] {
  const sa = sides[a] || "any";
  const sb = sides[b] || "any";
  if (sa === "right" || sb === "left") return [b, a];
  return [a, b];
}

const partnerKey = (a: string, b: string) =>
  [a.toLowerCase().trim(), b.toLowerCase().trim()].sort().join("|");

// Découpages possibles d'un groupe de 4 (classés 1 à 4), par ordre de
// préférence : 1+4 contre 2+3 équilibre le mieux les deux paires.
const GROUP_SPLITS: [number, number, number, number][] = [
  [0, 3, 1, 2],
  [0, 2, 1, 3],
  [0, 1, 2, 3],
];

// Les 4 paires d'un round à partir d'un ordre de 8 joueurs : terrain 1 =
// joueurs 1 à 4, terrain 2 = joueurs 5 à 8. Dans chaque groupe, on garde
// 1+4 contre 2+3 sauf si cela reforme une paire déjà associée ce jour-là :
// on passe alors à 1+3 contre 2+4, puis à 1+2 contre 3+4.
export function roundPairs(
  order: string[],
  sides: Record<string, Side> = {},
  pastPartners: Set<string> = new Set()
): [string, string][] {
  const o = order.slice(0, MEXICANO_PLAYERS);
  const pairs: [string, string][] = [];
  [o.slice(0, 4), o.slice(4, 8)].forEach((g) => {
    const repeats = ([a, b, c, d]: number[]) =>
      Number(pastPartners.has(partnerKey(g[a], g[b]))) +
      Number(pastPartners.has(partnerKey(g[c], g[d])));
    let best = GROUP_SPLITS[0];
    for (const split of GROUP_SPLITS) {
      if (repeats(split) < repeats(best)) best = split;
    }
    const [a, b, c, d] = best;
    pairs.push(orderBySide(g[a], g[b], sides), orderBySide(g[c], g[d], sides));
  });
  return pairs;
}

// Ajoute à l'état les 4 paires du prochain round. Les équipes existantes ne
// sont jamais modifiées : la session live les retrouve par leur position.
export function appendRoundTeams(state: SessionState, order: string[]): SessionState {
  const s = structuredClone(state);
  const past = new Set(
    s.teams.filter((t) => t.players?.[0] && t.players?.[1]).map((t) => partnerKey(t.players[0], t.players[1]))
  );
  const pairs = roundPairs(order, s.playerSides || {}, past);
  pairs.forEach((players) => {
    const id = s.teams.length;
    s.teams.push({
      id,
      name: players.join(" / "),
      players,
      wins: 0,
      losses: 0,
      draws: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      matchesPlayed: 0,
    });
  });
  return s;
}

// Affiches du round : les 4 dernières paires ajoutées, deux par terrain.
export function mexicanoMatchups(state: SessionState) {
  const n = state.teams.length;
  return [
    { t1: n - 4, t2: n - 3, played: 0, court: 1, servingTeam: (Math.random() < 0.5 ? 1 : 2) as 1 | 2 },
    { t1: n - 2, t2: n - 1, played: 0, court: 2, servingTeam: (Math.random() < 0.5 ? 1 : 2) as 1 | 2 },
  ];
}

// Ordre du prochain round : le classement du jour.
export function nextRoundOrder(state: SessionState): string[] {
  return computeIndividualStandings(state.teams, state.matches, state.seedOrder || []).map(
    (r) => r.name
  );
}
