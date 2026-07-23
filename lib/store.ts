// ═══ Accès données Supabase — clés et formats identiques à la v1 ═══
import { supabase } from "./supabase";
import { computeSessionScores } from "./scoring";
import { isTestMode, nsKey } from "./test-mode";
import type {
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
  t: Pick<Tournament, "date" | "time" | "level" | "courts" | "capacity">
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

// ─── Compteurs pour les pastilles de notification (admin) ───

export async function countPendingRegistrations(): Promise<number> {
  if (isTestMode()) {
    const arr = await readJsonKey<Registration>(TEST_REG);
    return arr.filter((r) => r.status === "pending").length;
  }
  const { count } = await supabase
    .from("registrations")
    .select("*", { count: "exact", head: true })
    .eq("status", "pending");
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
