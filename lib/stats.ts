import type {
  AggPlayerStats,
  Match,
  SessionHistoryEntry,
  SessionState,
  Team,
} from "./types";
import { isGenericTeamName, teamLabel } from "./format";
import { computeFinalStandings, computeIndividualStandings } from "./mexicano";

interface SessionLike {
  teams: Team[];
  matches: Match[];
}

// Le Best Of 4 a son propre classement : ses matchs ne comptent pas dans les
// statistiques V-Champs (victoires, côtés, équipes).
function collectSessions(
  history: SessionHistoryEntry[],
  current: SessionState | null
): SessionLike[] {
  const sessions: SessionLike[] = history.filter((s) => s.format !== "bo4");
  if (current && current.sessionStarted && !current.sessionFinished && current.format !== "bo4") {
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
        (team.players || [])
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
        const players = (team.players || []).filter((p) => p && p.trim());
        // Clé = paire de joueurs (pour agréger le même duo entre sessions) ;
        // repli sur le nom si aucun joueur renseigné.
        const key =
          players.length > 0
            ? players.map((p) => p.toLowerCase().trim()).sort().join("|")
            : team.name;
        if (!allTeams[key])
          allTeams[key] = {
            name: teamLabel(team.name, team.players),
            players: [...(team.players || [])],
            wins: 0,
            losses: 0,
            draws: 0,
            jFor: 0,
            jAgainst: 0,
            played: 0,
          };
        // Si un nom personnalisé apparaît dans une session, on le préfère.
        if (isGenericTeamName(allTeams[key].name) && !isGenericTeamName(team.name)) {
          allTeams[key].name = team.name;
        }
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
  gauche: { wins: number; played: number; diff: number };
  droite: { wins: number; played: number; diff: number };
}

// Stats par côté (gauche / droite) pour chaque joueur : victoires, matchs joués
// et différence de jeux (+/-) réalisée sur ce côté.
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
        (team.players || []).forEach((player, idx) => {
          if (!player?.trim()) return;
          const side = idx === 0 ? "gauche" : "droite";
          if (!sideMap[player])
            sideMap[player] = {
              gauche: { wins: 0, played: 0, diff: 0 },
              droite: { wins: 0, played: 0, diff: 0 },
            };
          sideMap[player][side].played++;
          sideMap[player][side].diff += myScore - oppScore;
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
    // Mexicano : les paires changent à chaque round, le rang est individuel.
    if (session.format === "mexicano" || session.format === "bo4") {
      const rank = session.format === "mexicano" ? computeFinalStandings : computeIndividualStandings;
      const standings = rank(
        session.teams || [],
        session.matches || [],
        session.seedOrder || []
      ).filter((r) => r.played > 0);
      const idx = standings.findIndex((r) => r.name.toLowerCase().trim() === key);
      if (idx >= 0) {
        entries.push({
          date: session.date,
          label: session.label || "6/7",
          position: idx + 1,
          teamName: session.format === "mexicano" ? "Mexicano" : "Best Of 4",
          partner: null,
        });
      }
      return;
    }
    const ranked = [...(session.teams || [])].sort((a, b) => {
      const pa = (a.wins || 0) * 3 + (a.draws || 0);
      const pb = (b.wins || 0) * 3 + (b.draws || 0);
      if (pa !== pb) return pb - pa;
      const da = (a.pointsFor || 0) - (a.pointsAgainst || 0);
      const db = (b.pointsFor || 0) - (b.pointsAgainst || 0);
      if (da !== db) return db - da;
      return (b.pointsFor || 0) - (a.pointsFor || 0);
    });
    ranked.forEach((team, idx) => {
      const players = team.players || [];
      const inTeam = players.some((p) => p?.toLowerCase().trim() === key);
      if (!inTeam) return;
      const partner = players.find((p) => p?.toLowerCase().trim() !== key) || null;
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

// Vainqueur d'une session archivée, quelle que soit la formule : la paire en
// tête (équipes fixes) ou le joueur en tête (Mexicano, Best Of 4).
export function sessionWinnerLabel(s: SessionHistoryEntry): string {
  if (s.format === "mexicano" || s.format === "bo4") {
    const rank = s.format === "mexicano" ? computeFinalStandings : computeIndividualStandings;
    return rank(s.teams || [], s.matches || [], s.seedOrder || [])[0]?.name || "";
  }
  const winner = [...(s.teams || [])].sort(
    (a, b) =>
      b.wins * 3 + (b.draws || 0) - (a.wins * 3 + (a.draws || 0)) ||
      b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst)
  )[0];
  return winner ? teamLabel(winner.name, winner.players) : "";
}
