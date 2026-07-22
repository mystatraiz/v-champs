import type {
  AggPlayerStats,
  Match,
  SessionHistoryEntry,
  SessionState,
  Team,
} from "./types";

interface SessionLike {
  teams: Team[];
  matches: Match[];
}

function collectSessions(
  history: SessionHistoryEntry[],
  current: SessionState | null
): SessionLike[] {
  const sessions: SessionLike[] = [...history];
  if (current && current.sessionStarted && !current.sessionFinished) {
    sessions.push({
      teams: current.teams,
      matches: current.matches.filter((m) => m.status === "finished"),
    });
  }
  return sessions;
}

function matchGames(m: Match): [number, number] {
  if (m.scoreType === "sets" && m.sets) {
    return [m.sets.reduce((s, r) => s + r[0], 0), m.sets.reduce((s, r) => s + r[1], 0)];
  }
  return [m.score1, m.score2];
}

// Stats agrégées par joueur sur toutes les sessions (historique + session en cours).
export function buildAllPlayerStats(
  history: SessionHistoryEntry[],
  current: SessionState | null
): Record<string, AggPlayerStats> {
  const stats: Record<string, AggPlayerStats> = {};
  collectSessions(history, current).forEach((session) => {
    session.matches.forEach((m) => {
      const t1 = session.teams.find((t) => t.id === m.team1Id);
      const t2 = session.teams.find((t) => t.id === m.team2Id);
      if (!t1 || !t2) return;
      const [sf1, sa1] = matchGames(m);
      (
        [
          [t1, m.score1, m.score2, sf1, sa1],
          [t2, m.score2, m.score1, sa1, sf1],
        ] as [Team, number, number, number, number][]
      ).forEach(([team, sw, sl, sf, sa]) => {
        team.players
          .filter((p) => p && p.trim())
          .forEach((p) => {
            if (!stats[p])
              stats[p] = { wins: 0, losses: 0, draws: 0, jFor: 0, jAgainst: 0, played: 0, teamNames: [] };
            const ps = stats[p];
            ps.played++;
            ps.jFor += sf;
            ps.jAgainst += sa;
            if (sw > sl) ps.wins++;
            else if (sl > sw) ps.losses++;
            else ps.draws++;
            if (!ps.teamNames.includes(team.name)) ps.teamNames.push(team.name);
          });
      });
    });
  });
  return stats;
}

export interface TeamAggStats {
  name: string;
  players: string[];
  wins: number;
  losses: number;
  draws: number;
  jFor: number;
  jAgainst: number;
  played: number;
}

export function buildTeamStats(
  history: SessionHistoryEntry[],
  current: SessionState | null
): TeamAggStats[] {
  const allTeams: Record<string, TeamAggStats> = {};
  collectSessions(history, current).forEach((session) => {
    session.matches.forEach((m) => {
      const t1 = session.teams.find((t) => t.id === m.team1Id);
      const t2 = session.teams.find((t) => t.id === m.team2Id);
      if (!t1 || !t2) return;
      const [sf1, sa1] = matchGames(m);
      (
        [
          [t1, m.score1, m.score2, sf1, sa1],
          [t2, m.score2, m.score1, sa1, sf1],
        ] as [Team, number, number, number, number][]
      ).forEach(([team, sw, sl, sf, sa]) => {
        const key = team.name;
        if (!allTeams[key])
          allTeams[key] = {
            name: key,
            players: [...team.players],
            wins: 0,
            losses: 0,
            draws: 0,
            jFor: 0,
            jAgainst: 0,
            played: 0,
          };
        allTeams[key].played++;
        allTeams[key].jFor += sf;
        allTeams[key].jAgainst += sa;
        if (sw > sl) allTeams[key].wins++;
        else if (sl > sw) allTeams[key].losses++;
        else allTeams[key].draws++;
      });
    });
  });
  return Object.values(allTeams).sort(
    (a, b) =>
      b.wins * 3 + b.draws - (a.wins * 3 + a.draws) ||
      b.jFor - b.jAgainst - (a.jFor - a.jAgainst)
  );
}

export interface SideStats {
  gauche: { wins: number; played: number };
  droite: { wins: number; played: number };
}

// Stats victoire par côté (gauche / droite) pour chaque joueur.
export function computeAllSideStats(
  history: SessionHistoryEntry[],
  current: SessionState | null
): Record<string, SideStats> {
  const sideMap: Record<string, SideStats> = {};
  collectSessions(history, current).forEach((session) => {
    session.matches.forEach((m) => {
      const t1 = session.teams.find((t) => t.id === m.team1Id);
      const t2 = session.teams.find((t) => t.id === m.team2Id);
      if (!t1 || !t2) return;
      for (const team of [t1, t2]) {
        const myScore = team === t1 ? m.score1 : m.score2;
        const oppScore = team === t1 ? m.score2 : m.score1;
        const won = myScore > oppScore;
        team.players.forEach((player, idx) => {
          if (!player?.trim()) return;
          const side = idx === 0 ? "gauche" : "droite";
          if (!sideMap[player])
            sideMap[player] = {
              gauche: { wins: 0, played: 0 },
              droite: { wins: 0, played: 0 },
            };
          sideMap[player][side].played++;
          if (won) sideMap[player][side].wins++;
        });
      }
    });
  });
  return sideMap;
}

// Palmarès : positions finales d'un joueur par session archivée.
export interface PalmaresEntry {
  date: string;
  label: string;
  position: number;
  teamName: string;
  partner: string | null;
}

export function buildPlayerPalmares(
  history: SessionHistoryEntry[],
  playerName: string
): PalmaresEntry[] {
  const key = playerName.toLowerCase().trim();
  const entries: PalmaresEntry[] = [];
  history.forEach((session) => {
    const ranked = [...session.teams].sort((a, b) => {
      const pa = (a.wins || 0) * 3 + (a.draws || 0);
      const pb = (b.wins || 0) * 3 + (b.draws || 0);
      if (pa !== pb) return pb - pa;
      const da = (a.pointsFor || 0) - (a.pointsAgainst || 0);
      const db = (b.pointsFor || 0) - (b.pointsAgainst || 0);
      if (da !== db) return db - da;
      return (b.pointsFor || 0) - (a.pointsFor || 0);
    });
    ranked.forEach((team, idx) => {
      const inTeam = team.players.some((p) => p?.toLowerCase().trim() === key);
      if (!inTeam) return;
      const partner = team.players.find((p) => p?.toLowerCase().trim() !== key) || null;
      entries.push({
        date: session.date,
        label: session.label || "6/7",
        position: idx + 1,
        teamName: team.name,
        partner,
      });
    });
  });
  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}
