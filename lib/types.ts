// ─── Domain types ────────────────────────────────────────────────────────────

export type LevelLabel = "3/4" | "4/5" | "5/6" | "6/7" | "7/8" | "8/9" | "9/10";

export type Role = "pending" | "player" | "organisateur" | "admin";

export interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  nickname: string;
  handedness: "right" | "left";
  preferred_side: "left" | "right" | "any";
  role: Role;
  linked_player_name: string | null;
  level: number | null; // 4..8 — attribué par l'admin
  created_at?: string;
}

export interface Team {
  id: number;
  name: string;
  players: [string, string]; // [gauche, droite]
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  matchesPlayed: number;
}

export type MatchStatus = "active" | "finished";

export interface Match {
  id: number;
  team1Id: number;
  team2Id: number;
  court: number;
  servingTeam?: 1 | 2;
  scoreType: "games" | "sets";
  sets?: [number, number][];
  score1: number;
  score2: number;
  status: MatchStatus;
  roundNum: number;
  startTime?: number;
}

// Forme identique à l'app v1 (clé app_state.current_session) pour rester
// interopérable avec la base existante.
export interface SessionState {
  courts: number;
  teams: Team[];
  matches: Match[];
  matchCounter: number;
  roundNum: number;
  activeMatches: number[];
  sessionStarted: boolean;
  sessionFinished: boolean;
  matchPhaseStarted: boolean;
  sessionArchivedAt?: string | null;
  warmupStart?: number | null;
  label?: LevelLabel | string;
  participants?: string[];
  waitingList?: string[];
  plannedTournamentId?: string | null;
  pairNameMap: Record<string, string>;
}

// Entrée d'historique (app_state.session_history) — format v1 conservé.
export interface SessionHistoryEntry {
  date: string; // ISO — sert aussi de session_id
  teams: Team[];
  matches: Match[];
  label: string;
}

export interface PlayerSessionScore {
  player_name: string;
  session_id: string;
  position: number;
  base_points: number;
  coefficient: number;
  points_earned: number;
  team_strength: number;
  avg_opp_strength: number;
  created_at: string;
}

// ─── Nouvelles tables (v2) ───────────────────────────────────────────────────

export type TournamentStatus = "open" | "locked" | "started" | "done" | "cancelled";

export interface Tournament {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  level: LevelLabel | string;
  courts: number;
  capacity: number;
  status: TournamentStatus;
  teams: Team[] | null; // grille brouillon de composition
  created_at?: string;
}

export type RegistrationStatus = "pending" | "approved" | "declined" | "waitlist";

export interface Registration {
  id: string;
  tournament_id: string;
  profile_id: string | null;
  player_name: string;
  status: RegistrationStatus;
  is_guest: boolean;
  created_at: string;
}

// ─── Leçons (coaching) ───────────────────────────────────────────────────────

export type LessonKind = "phases" | "panier";
export type LessonStatus = "open" | "locked" | "done" | "cancelled";

export interface Lesson {
  id: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  levels: number[]; // niveaux de joueurs ciblés (1..10) ; vide = tous niveaux
  kind: LessonKind;
  theme?: string | null; // thème libre saisi par le coach
  courts: number;
  capacity: number;
  status: LessonStatus;
  created_at?: string;
}

export interface LessonRegistration {
  id: string;
  lesson_id: string;
  profile_id: string | null;
  player_name: string;
  status: RegistrationStatus;
  is_guest: boolean;
  created_at: string;
}

export interface AggPlayerStats {
  wins: number;
  losses: number;
  draws: number;
  jFor: number;
  jAgainst: number;
  played: number;
  teamNames: string[];
}

export interface CombinedRankingRow {
  key: string;
  name: string;
  score: number;
  sessions: number;
  m: number;
  v: number;
  d: number;
  n: number;
  jDiff: number;
}
