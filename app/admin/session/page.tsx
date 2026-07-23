"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  archiveSession,
  clearSessionState,
  loadAppData,
  saveSessionState,
  updateTournament,
} from "@/lib/store";
import {
  MATCH_DURATION,
  MAX_ROUNDS,
  WARMUP_DURATION,
  allActiveScored,
  finishMatch,
  getSortedTeams,
  launchRound,
  proposeBestMatchups,
  type Matchup,
} from "@/lib/session";
import { computeCombinedRanking } from "@/lib/scoring";
import { notifySessionResults } from "@/lib/push";
import { playBell, unlockAudio } from "@/lib/audio";
import { formatClock, teamLabel } from "@/lib/format";
import type { Match, PlayerSessionScore, SessionHistoryEntry, SessionState } from "@/lib/types";
import { Badge, Btn, Card, Loader, SectionTitle } from "@/components/ui";

// ─── Carte de match avec saisie du score ───
function MatchCard({
  match,
  state,
  now,
  onScore,
  onSetScore,
}: {
  match: Match;
  state: SessionState;
  now: number;
  onScore: (matchId: number, team: 1 | 2, delta: number) => void;
  onSetScore: (matchId: number, setIdx: number, team: 1 | 2, delta: number) => void;
}) {
  const t1 = state.teams[match.team1Id];
  const t2 = state.teams[match.team2Id];
  const elapsed = match.startTime ? (now - match.startTime) / 1000 : 0;
  const remaining = MATCH_DURATION - elapsed;
  const overtime = remaining <= 0;

  const teamBlock = (team: typeof t1, serving: boolean) => (
    <div className="flex-1 text-center">
      <div className="text-[9px] font-extrabold tracking-widest" style={{ color: "var(--color-left)" }}>
        ◀ G
      </div>
      <div className="truncate text-sm font-extrabold text-bright">{team.players[0] || "?"}</div>
      <div className="mt-1 text-[9px] font-extrabold tracking-widest" style={{ color: "var(--color-right)" }}>
        D ▶
      </div>
      <div className="truncate text-sm font-bold text-body">{team.players[1] || "?"}</div>
      {serving && (
        <div className="mt-1.5 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-extrabold tracking-wider text-gold">
          🎾 SERVICE
        </div>
      )}
    </div>
  );

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-extrabold uppercase tracking-wider text-sub">
          🏟 Terrain {match.court}
        </span>
        <span
          className={`font-mono text-lg font-extrabold tabular-nums tracking-wider ${
            overtime ? "pulse-soft text-bad" : remaining < 180 ? "text-gold" : "text-sub"
          }`}
        >
          {overtime ? "TEMPS ÉCOULÉ" : formatClock(remaining)}
        </span>
      </div>

      <div className="mb-4 flex items-center gap-2">
        {teamBlock(t1, match.servingTeam === 1)}
        <div className="text-xs font-extrabold text-mut">VS</div>
        {teamBlock(t2, match.servingTeam === 2)}
      </div>

      {match.scoreType === "games" ? (
        <div className="flex items-center justify-center gap-3">
          {([1, 2] as const).map((team, idx) => (
            <div key={team} className={`flex items-center gap-2 ${idx === 1 ? "flex-row-reverse" : ""}`}>
              <button
                onClick={() => onScore(match.id, team, -1)}
                className="h-10 w-10 cursor-pointer rounded-lg border border-line2 bg-card2 text-lg font-extrabold text-sub active:scale-95"
              >
                −
              </button>
              <span className="w-12 text-center text-3xl font-extrabold tabular-nums text-bright">
                {team === 1 ? match.score1 : match.score2}
              </span>
              <button
                onClick={() => onScore(match.id, team, 1)}
                className="h-10 w-10 cursor-pointer rounded-lg bg-gold text-lg font-extrabold text-ink active:scale-95"
              >
                +
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1.5">
          {[0, 1, 2].map((setIdx) => {
            const set = match.sets?.[setIdx] ?? [0, 0];
            const set3Disabled = setIdx === 2 && !(match.score1 >= 1 && match.score2 >= 1);
            return (
              <div
                key={setIdx}
                className={`flex items-center justify-center gap-2 ${set3Disabled ? "pointer-events-none opacity-30" : ""}`}
              >
                <span className="w-10 text-[10px] font-bold uppercase text-mut">Set {setIdx + 1}</span>
                {([1, 2] as const).map((team, idx) => (
                  <div key={team} className={`flex items-center gap-1.5 ${idx === 1 ? "flex-row-reverse" : ""}`}>
                    <button
                      onClick={() => onSetScore(match.id, setIdx, team, -1)}
                      className="h-8 w-8 cursor-pointer rounded-md border border-line2 bg-card2 text-sm font-extrabold text-sub"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-xl font-extrabold tabular-nums">{set[team - 1]}</span>
                    <button
                      onClick={() => onSetScore(match.id, setIdx, team, 1)}
                      className="h-8 w-8 cursor-pointer rounded-md bg-gold text-sm font-extrabold text-ink"
                    >
                      +
                    </button>
                  </div>
                ))}
              </div>
            );
          })}
          <div className="pt-1 text-center text-xs font-bold text-sub">
            Sets : <span className="text-bright">{match.score1}</span> —{" "}
            <span className="text-bright">{match.score2}</span>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function SessionLive() {
  const router = useRouter();
  const [state, setState] = useState<SessionState | null | undefined>(undefined);
  const [history, setHistory] = useState<SessionHistoryEntry[]>([]);
  const [scores, setScores] = useState<PlayerSessionScore[]>([]);
  const [pendingMatchups, setPendingMatchups] = useState<Matchup[] | null>(null);
  const [now, setNow] = useState(Date.now());
  const bellRung = useRef<Set<number | string>>(new Set());
  const archiving = useRef(false);

  useEffect(() => {
    (async () => {
      const app = await loadAppData();
      setState(app.currentSession ?? null);
      setHistory(app.history);
      setScores(app.scores);
    })();
  }, []);

  // Horloge globale (chronos)
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const persist = useCallback((s: SessionState) => {
    setState(s);
    saveSessionState(s).catch(() => {});
  }, []);

  const activeMatches = useMemo(
    () => (state ? state.matches.filter((m) => m.status === "active") : []),
    [state]
  );

  const phase: "loading" | "none" | "preview" | "warmup" | "play" | "done" = !state
    ? state === undefined
      ? "loading"
      : "none"
    : state.sessionFinished
    ? "done"
    : state.warmupStart
    ? "warmup"
    : activeMatches.length
    ? "play"
    : "preview";

  // Aperçu : calcule les affiches du round 1 (tirage du service inclus)
  useEffect(() => {
    if (phase === "preview" && state && !pendingMatchups) {
      setPendingMatchups(proposeBestMatchups(state));
    }
  }, [phase, state, pendingMatchups]);

  // Cloche de fin d'échauffement + lancement auto du round 1
  const warmupRemaining = state?.warmupStart
    ? WARMUP_DURATION - (now - state.warmupStart) / 1000
    : 0;
  useEffect(() => {
    if (phase === "warmup" && state && warmupRemaining <= 0 && !bellRung.current.has("warmup")) {
      bellRung.current.add("warmup");
      playBell(2);
      const matchups = pendingMatchups ?? proposeBestMatchups(state);
      persist({ ...launchRound({ ...state, warmupStart: null }, matchups) });
      setPendingMatchups(null);
    }
  }, [phase, state, warmupRemaining, pendingMatchups, persist]);

  // Cloche de fin de match (27 min)
  useEffect(() => {
    if (phase !== "play") return;
    activeMatches.forEach((m) => {
      if (!m.startTime) return;
      const remaining = MATCH_DURATION - (now - m.startTime) / 1000;
      if (remaining <= 0 && !bellRung.current.has(m.id)) {
        bellRung.current.add(m.id);
        playBell(3);
      }
    });
  }, [phase, activeMatches, now]);

  if (phase === "loading") return <Loader />;
  if (phase === "none" || !state) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm text-sub">Aucune session en cours.</p>
        <Btn variant="secondary" size="sm" className="mt-4" onClick={() => router.push("/admin")}>
          ← Retour aux tournois
        </Btn>
      </Card>
    );
  }

  function changeScore(matchId: number, team: 1 | 2, delta: number) {
    if (!state) return;
    unlockAudio();
    const s = structuredClone(state);
    const m = s.matches.find((x) => x.id === matchId);
    if (!m || m.status !== "active") return;
    if (team === 1) m.score1 = Math.max(0, m.score1 + delta);
    else m.score2 = Math.max(0, m.score2 + delta);
    persist(s);
  }

  function changeSetScore(matchId: number, setIdx: number, team: 1 | 2, delta: number) {
    if (!state) return;
    unlockAudio();
    const s = structuredClone(state);
    const m = s.matches.find((x) => x.id === matchId);
    if (!m || m.status !== "active") return;
    if (!m.sets) m.sets = [[0, 0], [0, 0], [0, 0]];
    m.sets[setIdx][team - 1] = Math.max(0, m.sets[setIdx][team - 1] + delta);
    m.score1 = m.sets.filter((x) => x[0] > x[1]).length;
    m.score2 = m.sets.filter((x) => x[1] > x[0]).length;
    persist(s);
  }

  async function finalizeSession(s: SessionState) {
    if (archiving.current) return;
    archiving.current = true;
    try {
      const finished = { ...s, sessionFinished: true };
      const res = await archiveSession(finished, history, scores);
      setHistory(res.history);
      setScores(res.scores);
      persist(res.state.sessionArchivedAt ? res.state : finished);
      if (s.plannedTournamentId) {
        updateTournament(s.plannedTournamentId, { status: "done" }).catch(() => {});
      }
      // Notifie chaque joueur de son bilan (points V-Champs + rang au classement).
      try {
        const sid = res.state.sessionArchivedAt;
        if (sid) {
          const ranking = computeCombinedRanking(res.scores, res.history, null, null);
          const rankOf = (name: string) => {
            const i = ranking.findIndex((p) => p.key === name.toLowerCase().trim());
            return i >= 0 ? i + 1 : undefined;
          };
          const results = res.scores
            .filter((r) => r.session_id === sid)
            .map((r) => ({ name: r.player_name, points: r.points_earned, rank: rankOf(r.player_name) }));
          if (results.length) notifySessionResults(results);
        }
      } catch {
        /* non bloquant */
      }
    } finally {
      archiving.current = false;
    }
  }

  async function validateRound() {
    if (!state || !allActiveScored(state)) return;
    const s = structuredClone(state);
    s.matches.filter((m) => m.status === "active").forEach((m) => finishMatch(s, m.id));
    if (s.roundNum >= MAX_ROUNDS) {
      playBell(3);
      await finalizeSession(s);
    } else {
      const next = launchRound(s, proposeBestMatchups(s));
      persist(next);
    }
  }

  async function cancelSession() {
    if (!state) return;
    const hasFinished = state.matches.some((m) => m.status === "finished");
    if (
      !confirm(
        hasFinished
          ? "Annuler la session ? Les matchs joués ne seront PAS archivés."
          : "Annuler la session ?"
      )
    )
      return;
    if (state.plannedTournamentId) {
      updateTournament(state.plannedTournamentId, { status: "open" }).catch(() => {});
    }
    await clearSessionState();
    router.push("/admin");
  }

  const sorted = getSortedTeams(state);
  const finishedMatches = [...state.matches.filter((m) => m.status === "finished")].reverse();

  const teamRankTable = (
    <Card className="overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
            <th className="px-3 py-2">#</th>
            <th className="px-2 py-2">Équipe</th>
            <th className="px-2 py-2">Pts</th>
            <th className="px-2 py-2">V</th>
            <th className="px-2 py-2">N</th>
            <th className="px-2 py-2">D</th>
            <th className="px-2 py-2">+/-</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t, i) => {
            const diff = t.pointsFor - t.pointsAgainst;
            const players = t.players.filter(Boolean).join(" / ");
            const label = teamLabel(t.name, t.players);
            return (
              <tr key={t.id} className="border-b border-line/50 last:border-0">
                <td className="px-3 py-2 font-extrabold text-gold">{i + 1}</td>
                <td className="px-2 py-2">
                  <span className="font-bold text-body">{label}</span>
                  {label !== players && players && (
                    <div className="text-[11px] text-mut">{players}</div>
                  )}
                </td>
                <td className="px-2 py-2 font-extrabold">{t.wins * 3 + (t.draws || 0)}</td>
                <td className="px-2 py-2 text-ok">{t.wins}</td>
                <td className="px-2 py-2 text-sub">{t.draws || 0}</td>
                <td className="px-2 py-2 text-bad">{t.losses}</td>
                <td className={`px-2 py-2 font-bold ${diff > 0 ? "text-ok" : diff < 0 ? "text-bad" : "text-sub"}`}>
                  {diff > 0 ? "+" : ""}
                  {diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );

  // ─── PHASE : résultats ───
  if (phase === "done") {
    const sessionScores = state.sessionArchivedAt
      ? scores.filter((r) => r.session_id === state.sessionArchivedAt)
      : [];
    return (
      <div className="fade-up space-y-5">
        <div className="py-3 text-center">
          <div className="text-4xl">🏆</div>
          <h1 className="mt-2 text-xl font-extrabold text-bright">Session terminée</h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-mut">
            Niveau {state.label || "6/7"} — résultats archivés
          </p>
        </div>
        <div>
          <SectionTitle>Classement final</SectionTitle>
          {teamRankTable}
        </div>
        {sessionScores.length > 0 && (
          <div>
            <SectionTitle>Points V-Champs gagnés</SectionTitle>
            <Card className="overflow-hidden">
              {[...sessionScores]
                .sort((a, b) => a.position - b.position || b.points_earned - a.points_earned)
                .map((r, i, arr) => (
                  <div
                    key={r.player_name}
                    className={`flex items-center gap-3 px-3.5 py-2 text-sm ${
                      i < arr.length - 1 ? "border-b border-line/60" : ""
                    }`}
                  >
                    <span className="w-8 text-xs font-extrabold text-sub">{r.position === 1 ? "1er" : `${r.position}e`}</span>
                    <span className="flex-1 font-bold">{r.player_name}</span>
                    <span className="text-[11px] text-mut">×{r.coefficient.toFixed(2)}</span>
                    <span className="font-extrabold text-gold">+{r.points_earned}</span>
                  </div>
                ))}
            </Card>
          </div>
        )}
        <Btn
          size="lg"
          onClick={async () => {
            await clearSessionState();
            router.push("/admin");
          }}
        >
          ✓ Clôturer et revenir aux tournois
        </Btn>
      </div>
    );
  }

  // ─── PHASE : aperçu des affiches ───
  if (phase === "preview") {
    return (
      <div className="fade-up space-y-4">
        <div className="text-center">
          <h1 className="text-lg font-extrabold text-bright">Affiches du round 1</h1>
          <p className="text-xs text-mut">Tirage du service effectué 🎲</p>
        </div>
        {(pendingMatchups ?? []).map((m) => {
          const t1 = state.teams[m.t1];
          const t2 = state.teams[m.t2];
          return (
            <Card key={m.court} tone="gold" className="p-4">
              <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-sub">
                🏟 Terrain {m.court}
              </div>
              <div className="flex items-center gap-2">
                {[t1, t2].map((t, idx) => (
                  <div key={t.id} className="flex-1 text-center">
                    <div className="truncate text-sm font-extrabold text-bright">{t.players[0] || "?"}</div>
                    <div className="truncate text-sm font-bold text-body">{t.players[1] || "?"}</div>
                    {m.servingTeam === idx + 1 && (
                      <div className="mt-1.5 inline-block rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-extrabold tracking-wider text-gold">
                        🎾 SERVICE
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
        <Btn
          size="lg"
          onClick={() => {
            unlockAudio();
            persist({ ...state, warmupStart: Date.now() });
          }}
        >
          ⏱ Lancer l&apos;échauffement (6 min)
        </Btn>
        <Btn variant="ghost" size="lg" onClick={cancelSession}>
          ✕ Annuler la session
        </Btn>
      </div>
    );
  }

  // ─── PHASE : échauffement ───
  if (phase === "warmup") {
    const pct = Math.min(100, ((WARMUP_DURATION - warmupRemaining) / WARMUP_DURATION) * 100);
    return (
      <div className="fade-up flex flex-col items-center gap-6 py-10">
        <h1 className="text-lg font-extrabold uppercase tracking-widest text-bright">Échauffement</h1>
        <div className="font-mono text-6xl font-extrabold tabular-nums text-gold">
          {formatClock(warmupRemaining)}
        </div>
        <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-line">
          <div className="h-full bg-gold transition-all" style={{ width: `${pct}%` }} />
        </div>
        <Btn
          size="lg"
          className="max-w-sm"
          onClick={() => {
            bellRung.current.add("warmup");
            playBell(1);
            const matchups = pendingMatchups ?? proposeBestMatchups(state);
            persist({ ...launchRound({ ...state, warmupStart: null }, matchups) });
            setPendingMatchups(null);
          }}
        >
          ▶ Démarrer les matchs maintenant
        </Btn>
        <Btn variant="ghost" onClick={cancelSession}>✕ Annuler la session</Btn>
      </div>
    );
  }

  // ─── PHASE : matchs en cours ───
  const canValidate = allActiveScored(state);
  const isLastRound = state.roundNum >= MAX_ROUNDS;

  return (
    <div className="fade-up space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-extrabold text-bright">
            Round {state.roundNum} <span className="text-mut">/ {MAX_ROUNDS}</span>
          </h1>
          <Badge color="gold">Niveau {state.label || "6/7"}</Badge>
        </div>
        <Btn variant="ghost" size="sm" onClick={cancelSession}>✕ Annuler</Btn>
      </div>

      <div className="space-y-3">
        {activeMatches.map((m) => (
          <MatchCard
            key={m.id}
            match={m}
            state={state}
            now={now}
            onScore={changeScore}
            onSetScore={changeSetScore}
          />
        ))}
      </div>

      <Btn size="lg" variant={canValidate ? "success" : "secondary"} disabled={!canValidate} onClick={validateRound}>
        {canValidate
          ? isLastRound
            ? "✓ Terminer la session"
            : "✓ Valider les scores → round suivant"
          : "Saisissez tous les scores pour valider"}
      </Btn>

      <div>
        <SectionTitle>Classement de la session</SectionTitle>
        {teamRankTable}
      </div>

      {finishedMatches.length > 0 && (
        <div>
          <SectionTitle>Matchs terminés</SectionTitle>
          <Card className="overflow-hidden">
            {finishedMatches.map((m, i) => {
              const t1 = state.teams[m.team1Id];
              const t2 = state.teams[m.team2Id];
              const w1 = m.score1 > m.score2;
              const w2 = m.score2 > m.score1;
              const scoreStr =
                m.scoreType === "sets" && m.sets
                  ? m.sets.filter((x) => x[0] + x[1] > 0).map((x) => `${x[0]}-${x[1]}`).join(" / ")
                  : `${m.score1} : ${m.score2}`;
              return (
                <div
                  key={m.id}
                  className={`flex items-center gap-2 px-3.5 py-2 text-[13px] ${
                    i < finishedMatches.length - 1 ? "border-b border-line/60" : ""
                  }`}
                >
                  <span className="w-12 text-[10px] font-bold text-mut">T{m.court} R{m.roundNum}</span>
                  <span className={`flex-1 truncate text-right ${w1 ? "font-bold text-gold" : "text-sub"}`}>
                    {t1.players.filter(Boolean).join(" / ")}
                  </span>
                  <span className="shrink-0 px-1 font-mono text-xs text-mut">{scoreStr}</span>
                  <span className={`flex-1 truncate ${w2 ? "font-bold text-gold" : "text-sub"}`}>
                    {t2.players.filter(Boolean).join(" / ")}
                  </span>
                </div>
              );
            })}
          </Card>
        </div>
      )}
    </div>
  );
}
