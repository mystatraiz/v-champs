// ═══ Best Of 4 : 4 joueurs, 1 terrain, chacun avec chacun des deux côtés ═══
// 3 partenaires × 2 côtés = 6 matchs par joueur (3 à gauche, 3 à droite).
// Programme fixe calculé pour ne jamais rejouer deux fois de suite la même
// affiche et ne jamais rester plus de deux matchs d'affilée du même côté.
// Classement à part : aucun point V-Champs, un classement Best Of 4 dédié.

import type { Match, SessionHistoryEntry, SessionState, Team } from "./types";
import { computeIndividualStandings } from "./mexicano";

export const BO4_ROUNDS = 6;
export const BO4_MATCH_DURATION = 13 * 60; // 6 min d'échauffement + 6 × 13 min ≈ 1h30
export const BO4_PLAYERS = 4;

// Indices dans l'ordre de tête de série (0 = mieux classé V-Champs).
// Chaque paire : [gauche, droite]. Le 1er match oppose 1+4 à 2+3.
export const BO4_SCHEDULE: [[number, number], [number, number]][] = [
  [[0, 3], [2, 1]],
  [[0, 2], [3, 1]],
  [[1, 0], [2, 3]],
  [[3, 0], [1, 2]],
  [[0, 1], [3, 2]],
  [[2, 0], [1, 3]],
];

// Points du classement Best Of 4 par place dans la session.
export const BO4_POINTS_BY_POS: Record<number, number> = { 1: 10, 2: 6, 3: 3, 4: 1 };

// Les 12 paires de la session (2 par match), dans l'ordre du programme :
// le match n oppose les équipes 2n et 2n+1.
export function buildBo4Teams(seedOrder: string[]): Team[] {
  const teams: Team[] = [];
  BO4_SCHEDULE.forEach((match) =>
    match.forEach(([l, r]) => {
      const players: [string, string] = [seedOrder[l], seedOrder[r]];
      teams.push({
        id: teams.length,
        name: players.join(" / "),
        players,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        matchesPlayed: 0,
      });
    })
  );
  return teams;
}

// Affiche du prochain match (roundNum = nombre de matchs déjà lancés).
export function bo4Matchups(state: SessionState) {
  const n = state.roundNum;
  return [
    {
      t1: 2 * n,
      t2: 2 * n + 1,
      played: 0,
      court: 1,
      servingTeam: (Math.random() < 0.5 ? 1 : 2) as 1 | 2,
    },
  ];
}

// ─── Classement Best Of 4 (toutes sessions) ───

export interface Bo4RankingRow {
  key: string;
  name: string;
  points: number;
  sessions: number;
  firsts: number;
  played: number;
  wins: number;
  gamesFor: number;
  gamesAgainst: number;
  leftDiff: number; // +/- quand il joue à gauche
  rightDiff: number; // +/- quand il joue à droite
}

function matchGames(m: Match): [number, number] {
  if (m.scoreType === "sets" && m.sets) {
    return [m.sets.reduce((s, r) => s + r[0], 0), m.sets.reduce((s, r) => s + r[1], 0)];
  }
  return [m.score1, m.score2];
}

export function computeBo4Ranking(
  history: SessionHistoryEntry[],
  levelFilter: string | null = null
): Bo4RankingRow[] {
  const rows = new Map<string, Bo4RankingRow>();
  const get = (name: string) => {
    const key = name.toLowerCase().trim();
    let r = rows.get(key);
    if (!r) {
      r = {
        key,
        name,
        points: 0,
        sessions: 0,
        firsts: 0,
        played: 0,
        wins: 0,
        gamesFor: 0,
        gamesAgainst: 0,
        leftDiff: 0,
        rightDiff: 0,
      };
      rows.set(key, r);
    }
    return r;
  };

  history
    .filter((s) => s.format === "bo4")
    .filter((s) => !levelFilter || (s.label || "6/7") === levelFilter)
    .forEach((s) => {
      const teams = s.teams || [];
      const matches = (s.matches || []).filter((m) => m.status === "finished");
      const standings = computeIndividualStandings(teams, matches, s.seedOrder || []).filter(
        (r) => r.played > 0
      );
      standings.forEach((st, i) => {
        const r = get(st.name);
        r.sessions++;
        r.points += BO4_POINTS_BY_POS[i + 1] || 0;
        if (i === 0) r.firsts++;
        r.played += st.played;
        r.wins += st.wins;
        r.gamesFor += st.gamesFor;
        r.gamesAgainst += st.gamesAgainst;
      });
      matches.forEach((m) => {
        const [g1, g2] = matchGames(m);
        (
          [
            [teams.find((t) => t.id === m.team1Id), g1 - g2],
            [teams.find((t) => t.id === m.team2Id), g2 - g1],
          ] as [Team | undefined, number][]
        ).forEach(([team, diff]) => {
          const [left, right] = team?.players || [];
          if (left?.trim()) get(left).leftDiff += diff;
          if (right?.trim()) get(right).rightDiff += diff;
        });
      });
    });

  return [...rows.values()]
    .filter((r) => r.sessions > 0)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.firsts - a.firsts ||
        b.gamesFor - b.gamesAgainst - (a.gamesFor - a.gamesAgainst) ||
        b.wins - a.wins
    );
}
