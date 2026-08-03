// ═══ Système de classement V-Champs — port fidèle de la v1 ═══
import type {
  CombinedRankingRow,
  PlayerSessionScore,
  SessionHistoryEntry,
  SessionState,
  Team,
} from "./types";
import { getLevelMultiplier } from "./levels";
import { buildAllPlayerStats, computeAllSideStats } from "./stats";

export const BASE_POINTS_BY_POS: Record<number, number> = { 1: 100, 2: 75, 3: 50, 4: 25 };
export const RANKING_WINDOW_MS = 180 * 24 * 60 * 60 * 1000; // 180 jours
export const RETAINED_PERFS = 8; // 8 meilleures performances retenues

export function getDiffCoeff(diff: number): number {
  // Plage resserrée (0.95–1.05) : la force des adversaires nuance légèrement le
  // score, mais la position prime nettement (le 1er est clairement récompensé).
  if (diff >= 300) return 0.95;
  if (diff >= 200) return 0.97;
  if (diff >= 100) return 0.99;
  if (diff >= -99) return 1.0;
  if (diff >= -199) return 1.01;
  if (diff >= -299) return 1.03;
  return 1.05;
}

// Score servant au coefficient de force : 0 tant que le joueur a < 3 sessions valides.
export function getPlayerScoreForCoeff(
  scores: PlayerSessionScore[],
  playerName: string,
  excludeSessionId: string
): number {
  const cutoff = Date.now() - RANKING_WINDOW_MS;
  const valid = scores.filter(
    (r) =>
      r.player_name === playerName &&
      r.session_id !== excludeSessionId &&
      new Date(r.created_at).getTime() >= cutoff
  );
  if (valid.length < 3) return 0;
  return valid
    .sort((a, b) => b.points_earned - a.points_earned)
    .slice(0, RETAINED_PERFS)
    .reduce((sum, r) => sum + r.points_earned, 0);
}

export function rankTeamsInSession(teams: Team[]): Team[] {
  return [...teams].sort((a, b) => {
    const pa = (a.wins || 0) * 3 + (a.draws || 0);
    const pb = (b.wins || 0) * 3 + (b.draws || 0);
    if (pa !== pb) return pb - pa;
    const da = (a.pointsFor || 0) - (a.pointsAgainst || 0);
    const db = (b.pointsFor || 0) - (b.pointsAgainst || 0);
    if (da !== db) return db - da;
    return (b.pointsFor || 0) - (a.pointsFor || 0);
  });
}

// Calcule les points V-Champs de chaque joueur pour une session terminée.
export function computeSessionScores(
  session: { teams: Team[]; label?: string },
  sessionId: string,
  existingScores: PlayerSessionScore[]
): PlayerSessionScore[] {
  if (!session.teams || session.teams.length < 4) return [];
  const sortedTeams = rankTeamsInSession(session.teams);

  const playerScore: Record<string, number> = {};
  sortedTeams.forEach((team) => {
    (team.players || []).filter((p) => p && p.trim()).forEach((name) => {
      if (!(name in playerScore))
        playerScore[name] = getPlayerScoreForCoeff(existingScores, name, sessionId);
    });
  });

  const strengths = sortedTeams.map((team) =>
    (team.players || [])
      .filter((p) => p && p.trim())
      .reduce((s, p) => s + (playerScore[p] || 0), 0)
  );

  const levelMult = getLevelMultiplier(session.label);
  const records: PlayerSessionScore[] = [];
  sortedTeams.forEach((team, idx) => {
    const position = idx + 1;
    const basePoints = Math.round((BASE_POINTS_BY_POS[position] || 25) * levelMult);
    const myStrength = strengths[idx];
    const others = strengths.filter((_, i) => i !== idx);
    const avgOpp = others.length ? others.reduce((s, v) => s + v, 0) / others.length : 0;
    const diff = myStrength - avgOpp;
    const coeff = getDiffCoeff(diff);
    const pointsEarned = Math.round(basePoints * coeff);

    (team.players || []).filter((p) => p && p.trim()).forEach((playerName) => {
      records.push({
        player_name: playerName,
        session_id: sessionId,
        position,
        base_points: basePoints,
        coefficient: coeff,
        points_earned: pointsEarned,
        team_strength: myStrength,
        avg_opp_strength: Math.round(avgOpp),
        created_at: sessionId,
      });
    });
  });
  return records;
}

export interface GlobalRankingRow {
  name: string;
  score: number;
  validCount: number;
  retainedCount: number;
  bestPerformance: number;
  status: "active" | "inactive";
  allPerformances: PlayerSessionScore[];
}

export function computeGlobalRankings(arr: PlayerSessionScore[]): GlobalRankingRow[] {
  const cutoffMs = Date.now() - RANKING_WINDOW_MS;
  const byPlayer: Record<string, PlayerSessionScore[]> = {};
  arr.forEach((r) => {
    (byPlayer[r.player_name] = byPlayer[r.player_name] || []).push(r);
  });

  return Object.entries(byPlayer)
    .map(([name, perfs]) => {
      const valid = perfs.filter((p) => new Date(p.created_at).getTime() >= cutoffMs);
      const sorted = [...valid].sort((a, b) => b.points_earned - a.points_earned);
      const retained = sorted.slice(0, RETAINED_PERFS);
      const score = retained.reduce((s, r) => s + r.points_earned, 0);
      return {
        name,
        score,
        validCount: valid.length,
        retainedCount: retained.length,
        bestPerformance: retained[0]?.points_earned ?? 0,
        status: (valid.length >= 4 ? "active" : "inactive") as "active" | "inactive",
        allPerformances: perfs,
      };
    })
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "active" ? -1 : 1;
      return b.score - a.score;
    });
}

function getSessionLevelMap(history: SessionHistoryEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  history.forEach((s) => {
    if (s.date) map.set(s.date, s.label || "6/7");
  });
  return map;
}

// Classement combiné (points V-Champs + stats matchs), avec filtre par niveau.
export function computeCombinedRanking(
  allScores: PlayerSessionScore[],
  history: SessionHistoryEntry[],
  current: SessionState | null,
  levelFilter: string | null
): CombinedRankingRow[] {
  let scoresArr = allScores;
  let historyArr = history;
  let currentState = current;
  if (levelFilter) {
    const levelMap = getSessionLevelMap(history);
    scoresArr = allScores.filter(
      (r) => (levelMap.get(r.session_id) || "6/7") === levelFilter
    );
    historyArr = history.filter((s) => (s.label || "6/7") === levelFilter);
    if ((current?.label || "6/7") !== levelFilter) currentState = null;
  }
  const rankings = computeGlobalRankings(scoresArr);
  const matchStats = buildAllPlayerStats(historyArr, currentState);

  // Déduplication insensible à la casse
  const seen = new Map<string, string>();
  [...rankings.map((r) => r.name), ...Object.keys(matchStats)].forEach((name) => {
    const key = name.toLowerCase().trim();
    if (!seen.has(key)) seen.set(key, name);
  });
  if (!seen.size) return [];

  const cutoffMs = Date.now() - RANKING_WINDOW_MS;

  return [...seen.entries()]
    .map(([key, name]) => {
      const vcVariants = rankings.filter((r) => r.name.toLowerCase().trim() === key);
      const allPerfs = vcVariants.flatMap((r) => r.allPerformances);
      const validPerfs = allPerfs.filter(
        (p) => new Date(p.created_at).getTime() >= cutoffMs
      );
      const retained = [...validPerfs]
        .sort((a, b) => b.points_earned - a.points_earned)
        .slice(0, RETAINED_PERFS);
      const score = retained.reduce((s, p) => s + p.points_earned, 0);

      const ms = Object.keys(matchStats)
        .filter((k) => k.toLowerCase().trim() === key)
        .reduce(
          (acc, k) => {
            const s = matchStats[k];
            return {
              wins: acc.wins + s.wins,
              losses: acc.losses + s.losses,
              draws: acc.draws + (s.draws || 0),
              jFor: acc.jFor + s.jFor,
              jAgainst: acc.jAgainst + s.jAgainst,
              played: acc.played + s.played,
            };
          },
          { wins: 0, losses: 0, draws: 0, jFor: 0, jAgainst: 0, played: 0 }
        );

      return {
        key,
        name,
        score,
        sessions: validPerfs.length,
        m: ms.played,
        v: ms.wins,
        d: ms.losses,
        n: ms.draws,
        jDiff: ms.jFor - ms.jAgainst,
      };
    })
    .filter((p) => p.sessions >= 1 || p.m >= 1)
    .sort((a, b) => b.score - a.score || b.m - a.m);
}

// Rang de chaque joueur avant la dernière session (pour les flèches de tendance).
export function computePrevRankMap(allScores: PlayerSessionScore[]): Map<string, number> {
  const allSids = [...new Set(allScores.map((r) => r.session_id))].sort();
  if (allSids.length < 2) return new Map();
  const latestSid = allSids[allSids.length - 1];
  const cutoffMs = Date.now() - RANKING_WINDOW_MS;

  const byKey: Record<string, PlayerSessionScore[]> = {};
  allScores
    .filter((r) => r.session_id !== latestSid)
    .forEach((r) => {
      const key = r.player_name.toLowerCase().trim();
      (byKey[key] = byKey[key] || []).push(r);
    });

  const prevList = Object.entries(byKey)
    .map(([key, perfs]) => {
      const valid = perfs.filter((p) => new Date(p.created_at).getTime() >= cutoffMs);
      const retained = [...valid]
        .sort((a, b) => b.points_earned - a.points_earned)
        .slice(0, RETAINED_PERFS);
      const score = retained.reduce((s, p) => s + p.points_earned, 0);
      return { key, score, sessions: valid.length };
    })
    .filter((p) => p.sessions >= 1)
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));

  const map = new Map<string, number>();
  prevList.forEach((p, i) => map.set(p.key, i + 1));
  return map;
}

export interface Mention {
  icon: string;
  label: string;
  name: string;
  val: string;
  color?: string;
}

// Mentions spéciales du classement général.
export function computeMentions(
  combined: CombinedRankingRow[],
  history: SessionHistoryEntry[],
  current: SessionState | null
): Mention[] {
  const mentions: Mention[] = [];
  const withMatches = combined.filter((p) => p.m >= 3);
  if (withMatches.length) {
    const mostWins = [...withMatches].sort((a, b) => b.v - a.v)[0];
    mentions.push({ icon: "🏆", label: "Plus de victoires", name: mostWins.name, val: `${mostWins.v}V` });
  }

  // Mentions +/- : toutes calculées sur la même base (différence de jeux par
  // côté), pour que gauche + droite = total et que les trois soient comparables.
  const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
  const sideMap = computeAllSideStats(history, current);
  const entries = Object.entries(sideMap);

  const bestOverall = entries
    .filter(([, s]) => s.gauche.played + s.droite.played >= 5)
    .sort((a, b) => b[1].gauche.diff + b[1].droite.diff - (a[1].gauche.diff + a[1].droite.diff))[0];
  if (bestOverall) {
    const total = bestOverall[1].gauche.diff + bestOverall[1].droite.diff;
    mentions.push({ icon: "📈", label: "Meilleur +/-", name: bestOverall[0], val: signed(total) });
  }

  const bestGauche = entries
    .filter(([, s]) => s.gauche.played >= 5)
    .sort((a, b) => b[1].gauche.diff - a[1].gauche.diff)[0];
  const bestDroite = entries
    .filter(([, s]) => s.droite.played >= 5)
    .sort((a, b) => b[1].droite.diff - a[1].droite.diff)[0];
  if (bestGauche) {
    mentions.push({
      icon: "◀",
      label: "Meilleur +/- à gauche",
      name: bestGauche[0],
      val: signed(bestGauche[1].gauche.diff),
      color: "#3b82f6",
    });
  }
  if (bestDroite) {
    mentions.push({
      icon: "▶",
      label: "Meilleur +/- à droite",
      name: bestDroite[0],
      val: signed(bestDroite[1].droite.diff),
      color: "#f97316",
    });
  }
  return mentions;
}
