// ═══ Déroulement d'une session : équipes, rounds, scores ═══
import type { LevelLabel, Match, SessionState, Team } from "./types";

export const MAX_ROUNDS = 3;
export const WARMUP_DURATION = 6 * 60; // secondes
export const MATCH_DURATION = 27 * 60; // secondes

export function emptyTeam(id: number): Team {
  return {
    id,
    name: `Équipe ${id + 1}`,
    players: ["", ""],
    wins: 0,
    losses: 0,
    draws: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    matchesPlayed: 0,
  };
}

export function newSessionState(
  courts: number,
  label: LevelLabel | string,
  pairNameMap: Record<string, string>
): SessionState {
  const numTeams = courts * 2;
  return {
    courts,
    teams: Array.from({ length: numTeams }, (_, i) => emptyTeam(i)),
    matches: [],
    matchCounter: 0,
    roundNum: 0,
    activeMatches: [],
    sessionStarted: false,
    sessionFinished: false,
    matchPhaseStarted: false,
    sessionArchivedAt: null,
    warmupStart: null,
    label,
    participants: Array(numTeams * 2).fill(""),
    waitingList: [],
    plannedTournamentId: null,
    pairNameMap,
  };
}

export function normalizeName(name: string): string {
  const clean = name.trim().replace(/\s+/g, " ");
  return clean ? clean.charAt(0).toUpperCase() + clean.slice(1) : "";
}

export function pairKey(p1: string, p2: string): string {
  return [p1.toLowerCase().trim(), p2.toLowerCase().trim()].sort().join("|");
}

// Applique le nom d'équipe mémorisé pour cette paire de joueurs.
export function resolveTeamName(state: SessionState, team: Team): void {
  const [p1, p2] = team.players;
  if (!p1?.trim() || !p2?.trim()) return;
  const saved = state.pairNameMap[pairKey(p1, p2)];
  if (saved) team.name = saved;
}

function getMatchupCount(state: SessionState, t1id: number, t2id: number): number {
  return state.matches.filter(
    (m) =>
      m.status === "finished" &&
      ((m.team1Id === t1id && m.team2Id === t2id) ||
        (m.team1Id === t2id && m.team2Id === t1id))
  ).length;
}

export interface Matchup {
  t1: number;
  t2: number;
  played: number;
  court: number;
  servingTeam: 1 | 2;
}

// Propose les affiches du prochain round : priorité aux équipes qui se sont
// le moins affrontées, tirage au sort du service.
export function proposeBestMatchups(state: SessionState): Matchup[] {
  const n = state.teams.length;
  const usedTeams = new Set<number>();
  const matchups: Omit<Matchup, "court" | "servingTeam">[] = [];

  const pairs: { t1: number; t2: number; played: number }[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      pairs.push({ t1: i, t2: j, played: getMatchupCount(state, i, j) });
    }
  }
  pairs.sort((a, b) => {
    if (a.played !== b.played) return a.played - b.played;
    return Math.random() - 0.5;
  });

  for (const p of pairs) {
    if (matchups.length >= state.courts) break;
    if (!usedTeams.has(p.t1) && !usedTeams.has(p.t2)) {
      matchups.push(p);
      usedTeams.add(p.t1);
      usedTeams.add(p.t2);
    }
  }
  return matchups.map((m, idx) => ({
    ...m,
    court: idx + 1,
    servingTeam: Math.random() < 0.5 ? 1 : 2,
  }));
}

// Lance un round à partir des affiches (précalculées pour l'aperçu du service).
export function launchRound(state: SessionState, matchups: Matchup[]): SessionState {
  const s = structuredClone(state);
  s.roundNum++;
  s.activeMatches = [];
  const useSets = s.courts === 1;
  matchups.forEach((m) => {
    const match: Match = {
      id: s.matchCounter++,
      team1Id: m.t1,
      team2Id: m.t2,
      court: m.court,
      servingTeam: m.servingTeam,
      scoreType: useSets ? "sets" : "games",
      sets: [
        [0, 0],
        [0, 0],
        [0, 0],
      ],
      score1: 0,
      score2: 0,
      status: "active",
      roundNum: s.roundNum,
      startTime: Date.now(),
    };
    s.matches.push(match);
    s.activeMatches.push(match.id);
  });
  return s;
}

export function matchIsScored(m: Match): boolean {
  return m.scoreType === "sets"
    ? m.score1 === 2 || m.score2 === 2
    : m.score1 > 0 || m.score2 > 0;
}

export function allActiveScored(state: SessionState): boolean {
  const active = state.matches.filter((m) => m.status === "active");
  return active.length > 0 && active.every(matchIsScored);
}

// Clôture un match : met à jour victoires/défaites/jeux des deux équipes.
export function finishMatch(state: SessionState, matchId: number): void {
  const m = state.matches.find((x) => x.id === matchId);
  if (!m || m.status !== "active") return;
  m.status = "finished";

  const t1 = state.teams[m.team1Id];
  const t2 = state.teams[m.team2Id];
  t1.matchesPlayed++;
  t2.matchesPlayed++;

  let jFor1 = m.score1;
  let jAgainst1 = m.score2;
  if (m.scoreType === "sets" && m.sets) {
    jFor1 = m.sets.reduce((s, r) => s + r[0], 0);
    jAgainst1 = m.sets.reduce((s, r) => s + r[1], 0);
  }
  t1.pointsFor += jFor1;
  t1.pointsAgainst += jAgainst1;
  t2.pointsFor += jAgainst1;
  t2.pointsAgainst += jFor1;

  if (m.score1 > m.score2) {
    t1.wins++;
    t2.losses++;
  } else if (m.score2 > m.score1) {
    t2.wins++;
    t1.losses++;
  } else {
    t1.draws = (t1.draws || 0) + 1;
    t2.draws = (t2.draws || 0) + 1;
  }
  state.activeMatches = state.activeMatches.filter((id) => id !== matchId);
}

export function getTeamPoints(t: Team): number {
  return t.wins * 3 + (t.draws || 0);
}

export function getSortedTeams(state: SessionState): Team[] {
  return [...state.teams].sort((a, b) => {
    const pa = getTeamPoints(a);
    const pb = getTeamPoints(b);
    if (pa !== pb) return pb - pa;
    const da = a.pointsFor - a.pointsAgainst;
    const db = b.pointsFor - b.pointsAgainst;
    if (da !== db) return db - da;
    return b.pointsFor - a.pointsFor;
  });
}
