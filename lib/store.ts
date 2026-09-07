// ═══ Accès données Supabase — clés et formats identiques à la v1 ═══
import { supabase } from "./supabase";
import { computeSessionScores } from "./scoring";
import { recomputeTeamStats } from "./session";
import { isTestMode, nsKey } from "./test-mode";
import { localDateStr } from "./format";
import type {
  Lesson,
  LessonRegistration,
  MatchSlot,
  MatchSlotRegistration,
  PlayerSessionScore,
  Profile,
  Registration,
  RegistrationStatus,
  SessionHistoryEntry,
  SessionState,
  Tournament,
} from "./types";

// ─── Helpers app_state (stockage JSON générique) ───
async function readJsonKey<T>(key: string): Promise<T[]> {
  const { data } = await supabase.from("app_state").select("value").eq("key", key).maybeSingle();
  return (data?.value as T[]) || [];
}
async function writeJsonKey<T>(key: string, value: T[]): Promise<void> {
  await supabase.from("app_state").upsert({ key, value, updated_at: new Date().toISOString() });
}
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "id_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
}

// ─── Données historiques partagées avec la v1 ───

export interface AppData {
  currentSession: SessionState | null;
  history: SessionHistoryEntry[];
  scores: PlayerSessionScore[];
  knownPlayers: string[];
  pairNames: Record<string, string>;
}

export async function loadAppData(): Promise<AppData> {
  const testMode = isTestMode();
  const [sd, hd, rsd, pd, kd] = await Promise.all([
    supabase.from("app_state").select("value").eq("key", nsKey("current_session")).maybeSingle(),
    supabase.from("app_state").select("value").eq("key", nsKey("session_history")).maybeSingle(),
    supabase.from("app_state").select("value").eq("key", nsKey("scores_reset_at")).maybeSingle(),
    supabase.from("pair_names").select("pair_key,team_name"),
    supabase.from("known_players").select("name"),
  ]);

  const currentSession = (sd.data?.value as SessionState) || null;
  if (currentSession && !currentSession.pairNameMap) currentSession.pairNameMap = {};

  const resetAt = rsd.data?.value ? new Date(rsd.data.value as string).getTime() : 0;
  // En mode test, les scores vivent dans une clé JSON dédiée ; sinon la table.
  const rawScores = testMode
    ? await readJsonKey<PlayerSessionScore>("test_player_session_scores")
    : ((await supabase.from("player_session_scores").select("*")).data as PlayerSessionScore[]) || [];
  const scores = resetAt
    ? rawScores.filter((r) => new Date(r.created_at).getTime() > resetAt)
    : rawScores;

  const pairNames: Record<string, string> = {};
  (pd.data || []).forEach((r: { pair_key: string; team_name: string }) => {
    pairNames[r.pair_key] = r.team_name;
  });

  return {
    currentSession,
    history: (hd.data?.value as SessionHistoryEntry[]) || [],
    scores,
    knownPlayers: ((kd.data as { name: string }[]) || []).map((r) => r.name),
    pairNames,
  };
}

// Points V-Champs seuls, avec les mêmes règles que loadAppData (espace de test
// et remise à zéro du classement prises en compte).
export async function loadScores(): Promise<PlayerSessionScore[]> {
  const rsd = await supabase
    .from("app_state")
    .select("value")
    .eq("key", nsKey("scores_reset_at"))
    .maybeSingle();
  const raw = isTestMode()
    ? await readJsonKey<PlayerSessionScore>("test_player_session_scores")
    : ((await supabase.from("player_session_scores").select("*")).data as PlayerSessionScore[]) ||
      [];
  const resetAt = rsd.data?.value ? new Date(rsd.data.value as string).getTime() : 0;
  return resetAt ? raw.filter((r) => new Date(r.created_at).getTime() > resetAt) : raw;
}

export async function saveSessionState(state: SessionState): Promise<void> {
  await supabase.from("app_state").upsert({
    key: nsKey("current_session"),
    value: state,
    updated_at: new Date().toISOString(),
  });
}

export async function clearSessionState(): Promise<void> {
  await supabase.from("app_state").delete().eq("key", nsKey("current_session"));
}

export async function saveHistory(history: SessionHistoryEntry[]): Promise<void> {
  await supabase.from("app_state").upsert({
    key: nsKey("session_history"),
    value: history,
    updated_at: new Date().toISOString(),
  });
}

export async function savePairNames(pairNameMap: Record<string, string>): Promise<void> {
  if (isTestMode()) return; // pas d'écriture réelle en mode test
  const rows = Object.entries(pairNameMap).map(([pair_key, team_name]) => ({
    pair_key,
    team_name,
  }));
  if (rows.length) await supabase.from("pair_names").upsert(rows);
}

export async function addKnownPlayers(names: string[], existing: string[]): Promise<string[]> {
  const lowSet = new Set(existing.map((n) => n.toLowerCase()));
  const newNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter(
    (n) => !lowSet.has(n.toLowerCase())
  );
  // En mode test on n'écrit pas dans la liste réelle (mais on renvoie la fusion).
  if (newNames.length && !isTestMode())
    await supabase.from("known_players").upsert(newNames.map((n) => ({ name: n })));
  return [...existing, ...newNames];
}

export async function upsertSessionScores(records: PlayerSessionScore[]): Promise<void> {
  if (!records.length) return;
  if (isTestMode()) {
    const existing = await readJsonKey<PlayerSessionScore>("test_player_session_scores");
    const ids = new Set(records.map((r) => `${r.player_name}|${r.session_id}`));
    const merged = existing.filter((r) => !ids.has(`${r.player_name}|${r.session_id}`)).concat(records);
    await writeJsonKey("test_player_session_scores", merged);
    return;
  }
  await supabase
    .from("player_session_scores")
    .upsert(records, { onConflict: "player_name,session_id" });
}

// Archive la session terminée : historique + points V-Champs.
export async function archiveSession(
  state: SessionState,
  history: SessionHistoryEntry[],
  scores: PlayerSessionScore[]
): Promise<{ history: SessionHistoryEntry[]; scores: PlayerSessionScore[]; state: SessionState }> {
  if (state.sessionArchivedAt) return { history, scores, state };
  if (!state.sessionStarted || !state.matches.some((m) => m.status === "finished"))
    return { history, scores, state };

  const archivedAt = new Date().toISOString();
  const newState = { ...state, sessionArchivedAt: archivedAt };
  const entry: SessionHistoryEntry = {
    date: archivedAt,
    teams: JSON.parse(JSON.stringify(state.teams)),
    matches: state.matches.filter((m) => m.status === "finished"),
    label: (state.label as string) || "6/7",
  };
  const newHistory = [...history, entry];
  await saveHistory(newHistory);

  const records = computeSessionScores(entry, archivedAt, scores);
  await upsertSessionScores(records);
  const newScores = scores.filter((r) => r.session_id !== archivedAt).concat(records);

  return { history: newHistory, scores: newScores, state: newState };
}

export async function resetAllScores(): Promise<void> {
  await supabase.from("app_state").upsert({
    key: nsKey("scores_reset_at"),
    value: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

// ─── Profils ───

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile) || null;
}

export async function listProfiles(): Promise<Profile[]> {
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as Profile[]) || [];
}

export async function updateProfile(id: string, patch: Partial<Profile>): Promise<void> {
  const { error } = await supabase.from("profiles").update(patch).eq("id", id);
  if (error) throw error;
}

// Réinitialise le mot de passe d'un joueur (via la route serveur sécurisée) et
// renvoie le mot de passe temporaire à lui communiquer.
export async function adminResetPassword(userId: string): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Session expirée — reconnecte-toi.");
  const res = await fetch("/api/admin/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || "Échec de la réinitialisation.");
  return j.password as string;
}

// ─── Fusion / correction d'un nom de joueur ───
// Corrige un nom mal saisi (ex. « fredv ») vers le bon (ex. « Fred V ») dans
// TOUTES les données : historique des sessions, points V-Champs, joueurs connus,
// noms d'équipes mémorisés et comptes liés. Insensible à la casse sur l'ancien nom.
export async function renamePlayer(
  oldName: string,
  newName: string
): Promise<{ historyTouched: boolean; scoresTouched: number }> {
  const oldKey = oldName.toLowerCase().trim();
  const newTrim = newName.trim();
  const newKey = newTrim.toLowerCase().trim();
  const result = { historyTouched: false, scoresTouched: 0 };
  if (!oldKey || !newTrim || oldKey === newKey) return result;

  // 1) Historique des sessions (pilote stats matchs + palmarès)
  try {
    const { data } = await supabase
      .from("app_state")
      .select("value")
      .eq("key", "session_history")
      .maybeSingle();
    const history = ((data?.value as SessionHistoryEntry[]) || []).map((s) => ({
      ...s,
      teams: (s.teams || []).map((t) => ({
        ...t,
        players: (t.players || []).map((p) =>
          p && p.toLowerCase().trim() === oldKey ? newTrim : p
        ) as [string, string],
      })),
    }));
    const touched = history.some((s) =>
      (s.teams || []).some((t) => (t.players || []).includes(newTrim))
    );
    if (touched) {
      await supabase.from("app_state").upsert({
        key: "session_history",
        value: history,
        updated_at: new Date().toISOString(),
      });
      result.historyTouched = true;
    }
  } catch (e) {
    console.error("renamePlayer history:", e);
  }

  // 2) Points V-Champs (gère la contrainte unique player_name+session_id)
  try {
    const { data } = await supabase.from("player_session_scores").select("*");
    const rows = (data as PlayerSessionScore[]) || [];
    const newSessions = new Set(
      rows.filter((r) => (r.player_name || "").toLowerCase().trim() === newKey).map((r) => r.session_id)
    );
    for (const r of rows.filter((r) => (r.player_name || "").toLowerCase().trim() === oldKey)) {
      if (newSessions.has(r.session_id)) {
        // Le bon nom a déjà un score sur cette session → on retire le doublon
        await supabase
          .from("player_session_scores")
          .delete()
          .eq("player_name", r.player_name)
          .eq("session_id", r.session_id);
      } else {
        await supabase
          .from("player_session_scores")
          .update({ player_name: newTrim })
          .eq("player_name", r.player_name)
          .eq("session_id", r.session_id);
        newSessions.add(r.session_id);
      }
      result.scoresTouched++;
    }
  } catch (e) {
    console.error("renamePlayer scores:", e);
  }

  // 3) Joueurs connus (autocomplétion + liaison)
  try {
    const { data } = await supabase.from("known_players").select("name");
    const names = ((data as { name: string }[]) || []).map((r) => r.name);
    for (const n of names.filter((n) => n.toLowerCase().trim() === oldKey)) {
      await supabase.from("known_players").delete().eq("name", n);
    }
    if (!names.some((n) => n.toLowerCase().trim() === newKey)) {
      await supabase.from("known_players").upsert({ name: newTrim });
    }
  } catch (e) {
    console.error("renamePlayer known_players:", e);
  }

  // 4) Noms d'équipes mémorisés (clé = paire de noms en minuscules)
  try {
    const { data } = await supabase.from("pair_names").select("pair_key,team_name");
    const rows = (data as { pair_key: string; team_name: string }[]) || [];
    for (const row of rows) {
      const parts = row.pair_key.split("|");
      if (!parts.includes(oldKey)) continue;
      const newPairKey = parts.map((p) => (p === oldKey ? newKey : p)).sort().join("|");
      await supabase.from("pair_names").delete().eq("pair_key", row.pair_key);
      await supabase.from("pair_names").upsert({ pair_key: newPairKey, team_name: row.team_name });
    }
  } catch (e) {
    console.error("renamePlayer pair_names:", e);
  }

  // 5) Comptes liés à ce nom
  try {
    const { data } = await supabase.from("profiles").select("id,linked_player_name");
    const profs = (data as { id: string; linked_player_name: string | null }[]) || [];
    for (const p of profs.filter(
      (p) => p.linked_player_name && p.linked_player_name.toLowerCase().trim() === oldKey
    )) {
      await supabase.from("profiles").update({ linked_player_name: newTrim }).eq("id", p.id);
    }
  } catch (e) {
    console.error("renamePlayer profiles:", e);
  }

  return result;
}

// ─── Correction du score d'un match archivé ───
// Corrige un score saisi de travers (score inversé, faute de frappe) sur une
// session déjà terminée. Tout ce qui en découle est recalculé : statistiques des
// équipes, classement de la session, puis points V-Champs de chaque joueur.
export async function updateSessionMatchScore(
  sessionId: string,
  matchId: number,
  score1: number,
  score2: number
): Promise<void> {
  const { data } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", nsKey("session_history"))
    .maybeSingle();
  const history = (data?.value as SessionHistoryEntry[]) || [];
  const entry = history.find((s) => s.date === sessionId);
  if (!entry) throw new Error("Session introuvable dans l'historique.");
  const match = (entry.matches || []).find((m) => m.id === matchId);
  if (!match) throw new Error("Match introuvable dans cette session.");

  const s1 = Math.max(0, Math.round(score1));
  const s2 = Math.max(0, Math.round(score2));
  const matches = (entry.matches || []).map((m) => {
    if (m.id !== matchId) return m;
    // Score en sets : on conserve la nature du match en inversant les manches
    // lorsque le correctif revient à échanger les deux camps.
    const sets =
      m.scoreType === "sets" && m.sets && s1 === m.score2 && s2 === m.score1
        ? (m.sets.map(([a, b]) => [b, a]) as [number, number][])
        : m.sets;
    return { ...m, score1: s1, score2: s2, sets };
  });

  const updatedEntry: SessionHistoryEntry = {
    ...entry,
    matches,
    teams: recomputeTeamStats(entry.teams || [], matches),
  };
  await saveHistory(history.map((s) => (s.date === sessionId ? updatedEntry : s)));

  // Les positions finales ont pu changer : on rejoue le calcul des points.
  const allScores = await loadScores();
  const records = computeSessionScores(updatedEntry, sessionId, allScores);
  await upsertSessionScores(records);
}

// ─── Correction d'un joueur sur UNE SEULE session ───
// Cas typique : l'organisateur s'est trompé d'homonyme le jour J. Contrairement
// à renamePlayer, rien n'est modifié sur les autres sessions : seuls l'équipe de
// cette session et les points V-Champs correspondants changent de main.
export async function replacePlayerInSession(
  sessionId: string,
  oldName: string,
  newName: string
): Promise<void> {
  const oldKey = oldName.toLowerCase().trim();
  const newTrim = newName.trim();
  if (!oldKey || !newTrim || oldKey === newTrim.toLowerCase()) return;

  // 1) Historique : uniquement l'entrée de cette session.
  const { data } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", nsKey("session_history"))
    .maybeSingle();
  const history = (data?.value as SessionHistoryEntry[]) || [];
  let found = false;
  const updated = history.map((s) => {
    if (s.date !== sessionId) return s;
    found = true;
    return {
      ...s,
      teams: (s.teams || []).map((t) => ({
        ...t,
        players: (t.players || []).map((p) =>
          p && p.toLowerCase().trim() === oldKey ? newTrim : p
        ) as [string, string],
      })),
    };
  });
  if (!found) throw new Error("Session introuvable dans l'historique.");
  await saveHistory(updated);

  // 2) Points V-Champs de cette session (la clé unique est nom + session).
  const { data: rows } = await supabase
    .from("player_session_scores")
    .select("*")
    .eq("session_id", sessionId);
  const scores = (rows as PlayerSessionScore[]) || [];
  const target = scores.find((r) => (r.player_name || "").toLowerCase().trim() === oldKey);
  if (target) {
    const clash = scores.find(
      (r) => (r.player_name || "").toLowerCase().trim() === newTrim.toLowerCase()
    );
    // Le bon joueur a déjà des points sur cette session → on supprime le doublon.
    if (clash) {
      await supabase
        .from("player_session_scores")
        .delete()
        .eq("session_id", sessionId)
        .eq("player_name", target.player_name);
    } else {
      await supabase
        .from("player_session_scores")
        .update({ player_name: newTrim })
        .eq("session_id", sessionId)
        .eq("player_name", target.player_name);
    }
  }

  // 3) Le bon joueur rejoint les joueurs connus s'il n'y était pas.
  try {
    await supabase.from("known_players").upsert({ name: newTrim });
  } catch {
    /* sans conséquence pour la correction */
  }
}

// ─── Tournois ───
// En mode test : stockés dans app_state (clé « test_tournaments »). Sinon : table.
const TEST_TOURN = "test_tournaments";
const TEST_REG = "test_registrations";

export async function listTournaments(): Promise<Tournament[]> {
  if (isTestMode()) {
    const arr = await readJsonKey<Tournament>(TEST_TOURN);
    return arr.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .order("date", { ascending: true })
    .order("time", { ascending: true });
  if (error) throw error;
  return (data as Tournament[]) || [];
}

export async function getTournament(id: string): Promise<Tournament | null> {
  if (isTestMode()) {
    const arr = await readJsonKey<Tournament>(TEST_TOURN);
    return arr.find((t) => t.id === id) || null;
  }
  const { data } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
  return (data as Tournament) || null;
}

export async function createTournament(
  t: Pick<Tournament, "date" | "time" | "level" | "courts" | "capacity"> &
    Partial<Pick<Tournament, "created_by">>
): Promise<Tournament> {
  if (isTestMode()) {
    const arr = await readJsonKey<Tournament>(TEST_TOURN);
    const created: Tournament = {
      id: newId(),
      ...t,
      status: "open",
      teams: null,
      created_at: new Date().toISOString(),
    };
    await writeJsonKey(TEST_TOURN, [...arr, created]);
    return created;
  }
  const { data, error } = await supabase
    .from("tournaments")
    .insert({ ...t, status: "open" })
    .select()
    .single();
  if (error) throw error;
  return data as Tournament;
}

export async function updateTournament(id: string, patch: Partial<Tournament>): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<Tournament>(TEST_TOURN);
    await writeJsonKey(
      TEST_TOURN,
      arr.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
    return;
  }
  const { error } = await supabase.from("tournaments").update(patch).eq("id", id);
  if (error) throw error;
}

// Annule un tournoi. On ne le supprime pas : le créneau reste enregistré pour
// que la maintenance des récurrences ne le recrée pas aussitôt. Il disparaît des
// listes (organisateur comme joueur) et ses demandes sont effacées, sinon la
// pastille des inscriptions en attente compterait des demandes fantômes.
export async function cancelTournament(id: string): Promise<void> {
  await updateTournament(id, { status: "cancelled" });
  if (isTestMode()) {
    const arr = await readJsonKey<Registration>(TEST_REG);
    await writeJsonKey(
      TEST_REG,
      arr.filter((r) => r.tournament_id !== id)
    );
    return;
  }
  const { error } = await supabase.from("registrations").delete().eq("tournament_id", id);
  if (error) throw error;
}

export async function deleteTournament(id: string): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<Tournament>(TEST_TOURN);
    await writeJsonKey(
      TEST_TOURN,
      arr.filter((t) => t.id !== id)
    );
    return;
  }
  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) throw error;
}

// Retire un joueur de la grille de composition d'un tournoi. Indispensable en
// cas de désistement : la fiche du tournoi affiche les joueurs d'après la
// grille, pas d'après les inscriptions — sans ça, un joueur désinscrit resterait
// visible et compterait dans les places prises.
export async function removeFromTournamentGrid(
  tournamentId: string,
  playerName: string
): Promise<void> {
  const key = (playerName || "").toLowerCase().trim();
  if (!key) return;
  const t = await getTournament(tournamentId);
  if (!t?.teams?.length) return;
  let touched = false;
  const teams = t.teams.map((tm) => ({
    ...tm,
    players: (tm.players || []).map((p) => {
      if (p && p.toLowerCase().trim() === key) {
        touched = true;
        return "";
      }
      return p;
    }) as [string, string],
  }));
  if (touched) await updateTournament(tournamentId, { teams });
}

// ─── Inscriptions ───

export async function listRegistrations(tournamentId?: string): Promise<Registration[]> {
  if (isTestMode()) {
    const arr = await readJsonKey<Registration>(TEST_REG);
    return (tournamentId ? arr.filter((r) => r.tournament_id === tournamentId) : arr).sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || "")
    );
  }
  let q = supabase.from("registrations").select("*").order("created_at", { ascending: true });
  if (tournamentId) q = q.eq("tournament_id", tournamentId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as Registration[]) || [];
}

export async function requestRegistration(
  tournamentId: string,
  playerName: string,
  profileId: string | null,
  isGuest = false
): Promise<Registration> {
  if (isTestMode()) {
    const arr = await readJsonKey<Registration>(TEST_REG);
    const created: Registration = {
      id: newId(),
      tournament_id: tournamentId,
      profile_id: profileId,
      player_name: playerName,
      status: "pending",
      is_guest: isGuest,
      created_at: new Date().toISOString(),
    };
    await writeJsonKey(TEST_REG, [...arr, created]);
    return created;
  }
  const { data, error } = await supabase
    .from("registrations")
    .insert({
      tournament_id: tournamentId,
      profile_id: profileId,
      player_name: playerName,
      status: "pending",
      is_guest: isGuest,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Registration;
}

// Ajoute un joueur saisi manuellement par l'admin comme inscription confirmée
// (persistée : elle réapparaît si on revient plus tard sur le tournoi).
export async function addApprovedPlayer(
  tournamentId: string,
  name: string,
  status: RegistrationStatus = "approved"
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = await listRegistrations(tournamentId);
  const dup = existing.find(
    (r) => r.player_name.toLowerCase().trim() === trimmed.toLowerCase()
  );
  if (dup) {
    if (dup.status !== status) await setRegistrationStatus(dup.id, status);
    return;
  }
  if (isTestMode()) {
    const arr = await readJsonKey<Registration>(TEST_REG);
    arr.push({
      id: newId(),
      tournament_id: tournamentId,
      profile_id: null,
      player_name: trimmed,
      status,
      is_guest: false,
      created_at: new Date().toISOString(),
    });
    await writeJsonKey(TEST_REG, arr);
    return;
  }
  const { error } = await supabase.from("registrations").insert({
    tournament_id: tournamentId,
    profile_id: null,
    player_name: trimmed,
    status,
    is_guest: false,
  });
  if (error) throw error;
}

export async function setRegistrationStatus(
  id: string,
  status: RegistrationStatus
): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<Registration>(TEST_REG);
    await writeJsonKey(
      TEST_REG,
      arr.map((r) => (r.id === id ? { ...r, status } : r))
    );
    return;
  }
  const { error } = await supabase.from("registrations").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteRegistration(id: string): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<Registration>(TEST_REG);
    await writeJsonKey(
      TEST_REG,
      arr.filter((r) => r.id !== id)
    );
    return;
  }
  const { error } = await supabase.from("registrations").delete().eq("id", id);
  if (error) throw error;
}

// ─── Leçons (coaching) ───
const TEST_LESSONS = "test_lessons";
const TEST_LESSON_REG = "test_lesson_registrations";

export async function listLessons(): Promise<Lesson[]> {
  if (isTestMode()) {
    const arr = await readJsonKey<Lesson>(TEST_LESSONS);
    return arr.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  const { data, error } = await supabase
    .from("lessons")
    .select("*")
    .order("date", { ascending: true })
    .order("time", { ascending: true });
  if (error) throw error;
  return (data as Lesson[]) || [];
}

export async function createLesson(
  l: Pick<Lesson, "date" | "time" | "levels" | "kind" | "courts" | "capacity"> &
    Partial<Pick<Lesson, "theme" | "created_by">>
): Promise<Lesson> {
  if (isTestMode()) {
    const arr = await readJsonKey<Lesson>(TEST_LESSONS);
    const created: Lesson = {
      id: newId(),
      ...l,
      status: "open",
      created_at: new Date().toISOString(),
    };
    await writeJsonKey(TEST_LESSONS, [...arr, created]);
    return created;
  }
  const { data, error } = await supabase
    .from("lessons")
    .insert({ ...l, status: "open" })
    .select()
    .single();
  if (error) throw error;
  return data as Lesson;
}

export async function updateLesson(id: string, patch: Partial<Lesson>): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<Lesson>(TEST_LESSONS);
    await writeJsonKey(
      TEST_LESSONS,
      arr.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
    return;
  }
  const { error } = await supabase.from("lessons").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteLesson(id: string): Promise<void> {
  if (isTestMode()) {
    const [lessons, regs] = await Promise.all([
      readJsonKey<Lesson>(TEST_LESSONS),
      readJsonKey<LessonRegistration>(TEST_LESSON_REG),
    ]);
    await writeJsonKey(
      TEST_LESSONS,
      lessons.filter((l) => l.id !== id)
    );
    await writeJsonKey(
      TEST_LESSON_REG,
      regs.filter((r) => r.lesson_id !== id)
    );
    return;
  }
  const { error } = await supabase.from("lessons").delete().eq("id", id);
  if (error) throw error;
}

export async function listLessonRegistrations(lessonId?: string): Promise<LessonRegistration[]> {
  if (isTestMode()) {
    const arr = await readJsonKey<LessonRegistration>(TEST_LESSON_REG);
    return (lessonId ? arr.filter((r) => r.lesson_id === lessonId) : arr).sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || "")
    );
  }
  let q = supabase.from("lesson_registrations").select("*").order("created_at", { ascending: true });
  if (lessonId) q = q.eq("lesson_id", lessonId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as LessonRegistration[]) || [];
}

export async function requestLessonRegistration(
  lessonId: string,
  playerName: string,
  profileId: string | null,
  isGuest = false
): Promise<LessonRegistration> {
  if (isTestMode()) {
    const arr = await readJsonKey<LessonRegistration>(TEST_LESSON_REG);
    const created: LessonRegistration = {
      id: newId(),
      lesson_id: lessonId,
      profile_id: profileId,
      player_name: playerName,
      status: "pending",
      is_guest: isGuest,
      created_at: new Date().toISOString(),
    };
    await writeJsonKey(TEST_LESSON_REG, [...arr, created]);
    return created;
  }
  const { data, error } = await supabase
    .from("lesson_registrations")
    .insert({
      lesson_id: lessonId,
      profile_id: profileId,
      player_name: playerName,
      status: "pending",
      is_guest: isGuest,
    })
    .select()
    .single();
  if (error) throw error;
  return data as LessonRegistration;
}

export async function setLessonRegistrationStatus(
  id: string,
  status: RegistrationStatus
): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<LessonRegistration>(TEST_LESSON_REG);
    await writeJsonKey(
      TEST_LESSON_REG,
      arr.map((r) => (r.id === id ? { ...r, status } : r))
    );
    return;
  }
  const { error } = await supabase.from("lesson_registrations").update({ status }).eq("id", id);
  if (error) throw error;
}

export async function deleteLessonRegistration(id: string): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<LessonRegistration>(TEST_LESSON_REG);
    await writeJsonKey(
      TEST_LESSON_REG,
      arr.filter((r) => r.id !== id)
    );
    return;
  }
  const { error } = await supabase.from("lesson_registrations").delete().eq("id", id);
  if (error) throw error;
}

// Ajout manuel par le coach : inscription directement confirmée.
export async function addApprovedLessonPlayer(lessonId: string, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = await listLessonRegistrations(lessonId);
  const dup = existing.find((r) => r.player_name.toLowerCase().trim() === trimmed.toLowerCase());
  if (dup) {
    if (dup.status !== "approved") await setLessonRegistrationStatus(dup.id, "approved");
    return;
  }
  if (isTestMode()) {
    const arr = await readJsonKey<LessonRegistration>(TEST_LESSON_REG);
    arr.push({
      id: newId(),
      lesson_id: lessonId,
      profile_id: null,
      player_name: trimmed,
      status: "approved",
      is_guest: false,
      created_at: new Date().toISOString(),
    });
    await writeJsonKey(TEST_LESSON_REG, arr);
    return;
  }
  const { error } = await supabase.from("lesson_registrations").insert({
    lesson_id: lessonId,
    profile_id: null,
    player_name: trimmed,
    status: "approved",
    is_guest: false,
  });
  if (error) throw error;
}

// ─── Créneaux de match ───
const TEST_MATCHES = "test_match_slots";
const TEST_MATCH_REG = "test_match_slot_registrations";

export async function listMatchSlots(): Promise<MatchSlot[]> {
  if (isTestMode()) {
    const arr = await readJsonKey<MatchSlot>(TEST_MATCHES);
    return arr.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  }
  const { data, error } = await supabase
    .from("match_slots")
    .select("*")
    .order("date", { ascending: true })
    .order("time", { ascending: true });
  if (error) throw error;
  return (data as MatchSlot[]) || [];
}

export async function createMatchSlot(
  m: Pick<MatchSlot, "date" | "time" | "levels" | "courts" | "capacity"> &
    Partial<Pick<MatchSlot, "created_by">>
): Promise<MatchSlot> {
  if (isTestMode()) {
    const arr = await readJsonKey<MatchSlot>(TEST_MATCHES);
    const created: MatchSlot = {
      id: newId(),
      ...m,
      status: "open",
      created_at: new Date().toISOString(),
    };
    await writeJsonKey(TEST_MATCHES, [...arr, created]);
    return created;
  }
  const { data, error } = await supabase
    .from("match_slots")
    .insert({ ...m, status: "open" })
    .select()
    .single();
  if (error) throw error;
  return data as MatchSlot;
}

export async function updateMatchSlot(id: string, patch: Partial<MatchSlot>): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<MatchSlot>(TEST_MATCHES);
    await writeJsonKey(
      TEST_MATCHES,
      arr.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
    return;
  }
  const { error } = await supabase.from("match_slots").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMatchSlot(id: string): Promise<void> {
  if (isTestMode()) {
    const [slots, regs] = await Promise.all([
      readJsonKey<MatchSlot>(TEST_MATCHES),
      readJsonKey<MatchSlotRegistration>(TEST_MATCH_REG),
    ]);
    await writeJsonKey(
      TEST_MATCHES,
      slots.filter((m) => m.id !== id)
    );
    await writeJsonKey(
      TEST_MATCH_REG,
      regs.filter((r) => r.match_slot_id !== id)
    );
    return;
  }
  const { error } = await supabase.from("match_slots").delete().eq("id", id);
  if (error) throw error;
}

export async function listMatchSlotRegistrations(
  matchSlotId?: string
): Promise<MatchSlotRegistration[]> {
  if (isTestMode()) {
    const arr = await readJsonKey<MatchSlotRegistration>(TEST_MATCH_REG);
    return (matchSlotId ? arr.filter((r) => r.match_slot_id === matchSlotId) : arr).sort((a, b) =>
      (a.created_at || "").localeCompare(b.created_at || "")
    );
  }
  let q = supabase
    .from("match_slot_registrations")
    .select("*")
    .order("created_at", { ascending: true });
  if (matchSlotId) q = q.eq("match_slot_id", matchSlotId);
  const { data, error } = await q;
  if (error) throw error;
  return (data as MatchSlotRegistration[]) || [];
}

export async function requestMatchSlotRegistration(
  matchSlotId: string,
  playerName: string,
  profileId: string | null,
  isGuest = false
): Promise<MatchSlotRegistration> {
  if (isTestMode()) {
    const arr = await readJsonKey<MatchSlotRegistration>(TEST_MATCH_REG);
    const created: MatchSlotRegistration = {
      id: newId(),
      match_slot_id: matchSlotId,
      profile_id: profileId,
      player_name: playerName,
      status: "pending",
      is_guest: isGuest,
      created_at: new Date().toISOString(),
    };
    await writeJsonKey(TEST_MATCH_REG, [...arr, created]);
    return created;
  }
  const { data, error } = await supabase
    .from("match_slot_registrations")
    .insert({
      match_slot_id: matchSlotId,
      profile_id: profileId,
      player_name: playerName,
      status: "pending",
      is_guest: isGuest,
    })
    .select()
    .single();
  if (error) throw error;
  return data as MatchSlotRegistration;
}

export async function setMatchSlotRegistrationStatus(
  id: string,
  status: RegistrationStatus
): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<MatchSlotRegistration>(TEST_MATCH_REG);
    await writeJsonKey(
      TEST_MATCH_REG,
      arr.map((r) => (r.id === id ? { ...r, status } : r))
    );
    return;
  }
  const { error } = await supabase
    .from("match_slot_registrations")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteMatchSlotRegistration(id: string): Promise<void> {
  if (isTestMode()) {
    const arr = await readJsonKey<MatchSlotRegistration>(TEST_MATCH_REG);
    await writeJsonKey(
      TEST_MATCH_REG,
      arr.filter((r) => r.id !== id)
    );
    return;
  }
  const { error } = await supabase.from("match_slot_registrations").delete().eq("id", id);
  if (error) throw error;
}

// Ajout manuel par l'organisateur : inscription directement confirmée.
export async function addApprovedMatchSlotPlayer(
  matchSlotId: string,
  name: string
): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) return;
  const existing = await listMatchSlotRegistrations(matchSlotId);
  const dup = existing.find((r) => r.player_name.toLowerCase().trim() === trimmed.toLowerCase());
  if (dup) {
    if (dup.status !== "approved") await setMatchSlotRegistrationStatus(dup.id, "approved");
    return;
  }
  if (isTestMode()) {
    const arr = await readJsonKey<MatchSlotRegistration>(TEST_MATCH_REG);
    arr.push({
      id: newId(),
      match_slot_id: matchSlotId,
      profile_id: null,
      player_name: trimmed,
      status: "approved",
      is_guest: false,
      created_at: new Date().toISOString(),
    });
    await writeJsonKey(TEST_MATCH_REG, arr);
    return;
  }
  const { error } = await supabase.from("match_slot_registrations").insert({
    match_slot_id: matchSlotId,
    profile_id: null,
    player_name: trimmed,
    status: "approved",
    is_guest: false,
  });
  if (error) throw error;
}

// Les pastilles ne comptent que les demandes sur des créneaux À VENIR : une
// demande oubliée sur un créneau passé n'est plus actionnable (le créneau ne
// s'affiche plus nulle part) et empêcherait la pastille de redescendre à zéro.
export async function countPendingMatchSlotRegistrations(): Promise<number> {
  const today = localDateStr(new Date());
  if (isTestMode()) {
    const [arr, slots] = await Promise.all([
      readJsonKey<MatchSlotRegistration>(TEST_MATCH_REG),
      readJsonKey<MatchSlot>(TEST_MATCHES),
    ]);
    const upcoming = new Set(slots.filter((m) => m.date >= today).map((m) => m.id));
    return arr.filter((r) => r.status === "pending" && upcoming.has(r.match_slot_id)).length;
  }
  const { count } = await supabase
    .from("match_slot_registrations")
    .select("id, match_slots!inner(date)", { count: "exact", head: true })
    .eq("status", "pending")
    .gte("match_slots.date", today);
  return count || 0;
}

// ─── Compteurs pour les pastilles de notification (admin) ───

export async function countPendingLessonRegistrations(): Promise<number> {
  const today = localDateStr(new Date());
  if (isTestMode()) {
    const [arr, slots] = await Promise.all([
      readJsonKey<LessonRegistration>(TEST_LESSON_REG),
      readJsonKey<Lesson>(TEST_LESSONS),
    ]);
    const upcoming = new Set(slots.filter((l) => l.date >= today).map((l) => l.id));
    return arr.filter((r) => r.status === "pending" && upcoming.has(r.lesson_id)).length;
  }
  const { count } = await supabase
    .from("lesson_registrations")
    .select("id, lessons!inner(date)", { count: "exact", head: true })
    .eq("status", "pending")
    .gte("lessons.date", today);
  return count || 0;
}

export async function countPendingRegistrations(): Promise<number> {
  const today = localDateStr(new Date());
  if (isTestMode()) {
    const [arr, slots] = await Promise.all([
      readJsonKey<Registration>(TEST_REG),
      readJsonKey<Tournament>(TEST_TOURN),
    ]);
    const upcoming = new Set(slots.filter((t) => t.date >= today).map((t) => t.id));
    return arr.filter((r) => r.status === "pending" && upcoming.has(r.tournament_id)).length;
  }
  const { count } = await supabase
    .from("registrations")
    .select("id, tournaments!inner(date)", { count: "exact", head: true })
    .eq("status", "pending")
    .gte("tournaments.date", today);
  return count || 0;
}

export async function countPendingProfiles(): Promise<number> {
  const { count } = await supabase
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "pending");
  return count || 0;
}

// ─── Abonnements push (stockés dans app_state pour éviter une nouvelle table) ───

export interface StoredPushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  role?: string;
  profileId?: string;
}

export async function getPushSubscriptions(): Promise<StoredPushSub[]> {
  const { data } = await supabase
    .from("app_state")
    .select("value")
    .eq("key", "push_subscriptions")
    .maybeSingle();
  return (data?.value as StoredPushSub[]) || [];
}

export async function savePushSubscription(sub: StoredPushSub): Promise<void> {
  const subs = await getPushSubscriptions();
  // Déjà enregistré à l'identique : on évite une réécriture inutile de la liste
  // (elle est réenregistrée à chaque ouverture de l'app).
  const same = subs.find((s) => s.endpoint === sub.endpoint);
  if (same && same.role === sub.role && same.profileId === sub.profileId) return;
  const next = [...subs.filter((s) => s.endpoint !== sub.endpoint), sub];
  await supabase.from("app_state").upsert({
    key: "push_subscriptions",
    value: next,
    updated_at: new Date().toISOString(),
  });
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const subs = await getPushSubscriptions();
  await supabase.from("app_state").upsert({
    key: "push_subscriptions",
    value: subs.filter((s) => s.endpoint !== endpoint),
    updated_at: new Date().toISOString(),
  });
}

// ─── Notifications (compatibles v1) ───

export async function notifyNewUser(payload: Record<string, unknown>): Promise<void> {
  await supabase.from("notifications").insert({ type: "new_user", payload });
}

export async function markUserNotificationRead(userId: string): Promise<void> {
  await supabase
    .from("notifications")
    .update({ read: true })
    .eq("type", "new_user")
    .filter("payload->>user_id", "eq", userId);
}
