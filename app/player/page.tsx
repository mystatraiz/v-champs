"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  deleteLessonRegistration,
  deleteRegistration,
  listLessonRegistrations,
  listLessons,
  listMatchSlotRegistrations,
  listMatchSlots,
  listRegistrations,
  listTournaments,
  removeFromTournamentGrid,
  requestLessonRegistration,
  requestMatchSlotRegistration,
  requestRegistration,
  deleteMatchSlotRegistration,
} from "@/lib/store";
import { notifyAdmins, notifySpotFreed, notifyWithdrawal } from "@/lib/push";
import { labelIncludesPlayer, levelsIncludePlayer, levelsLabel } from "@/lib/levels";
import { lessonIncludesPlayer, lessonKind } from "@/lib/lessons";
import {
  endOfNextWeekStr,
  formatDateLong,
  localDateStr,
  playerIdentity,
  positionLabel,
} from "@/lib/format";
import type {
  Lesson,
  LessonRegistration,
  MatchSlot,
  MatchSlotRegistration,
  Registration,
  Tournament,
} from "@/lib/types";
import { Badge, Btn, Card, EmptyState, Loader, SectionBanner } from "@/components/ui";

const STATUS_UI: Record<
  Registration["status"],
  { label: string; color: "gold" | "ok" | "bad" | "sub" }
> = {
  pending: { label: "Demande envoyée — en attente", color: "gold" },
  approved: { label: "Inscription confirmée ✓", color: "ok" },
  declined: { label: "Demande refusée", color: "bad" },
  waitlist: { label: "Liste d'attente", color: "sub" },
};

// Libellé du statut, enrichi du rang d'arrivée quand on est en liste d'attente.
function statusLabel(
  mine: { id: string; status: Registration["status"] },
  all: { id: string; status: Registration["status"] }[]
): string {
  const base = STATUS_UI[mine.status].label;
  if (mine.status !== "waitlist") return base;
  const pos = all.filter((r) => r.status === "waitlist").findIndex((r) => r.id === mine.id) + 1;
  return pos > 0 ? `${base} — ${positionLabel(pos)}` : base;
}

// Tournois à venir — uniquement ceux qui comprennent le niveau du joueur.
export default function PlayerTournaments() {
  const { profile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonRegs, setLessonRegs] = useState<LessonRegistration[]>([]);
  const [matchSlots, setMatchSlots] = useState<MatchSlot[]>([]);
  const [matchRegs, setMatchRegs] = useState<MatchSlotRegistration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [ts, rs] = await Promise.all([listTournaments(), listRegistrations()]);
      setTournaments(ts);
      setRegs(rs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
      setTournaments([]);
    }
    // Les leçons sont indépendantes : si leurs tables manquent encore, les
    // tournois doivent rester affichés.
    try {
      const [ls, lrs] = await Promise.all([listLessons(), listLessonRegistrations()]);
      setLessons(ls);
      setLessonRegs(lrs);
    } catch {
      setLessons([]);
    }
    // Idem pour les créneaux de match : indépendants du reste.
    try {
      const [ms, mrs] = await Promise.all([listMatchSlots(), listMatchSlotRegistrations()]);
      setMatchSlots(ms);
      setMatchRegs(mrs);
    } catch {
      setMatchSlots([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const myName =
    profile?.linked_player_name ||
    (profile ? playerIdentity(profile.first_name, profile.last_name) : "") ||
    profile?.nickname ||
    "";

  // Tournois où le joueur a déjà une inscription (par compte ou par nom).
  const myTournamentIds = useMemo(() => {
    const key = myName.toLowerCase().trim();
    return new Set(
      regs
        .filter(
          (r) =>
            (profile && r.profile_id === profile.id) ||
            (key && r.player_name.toLowerCase().trim() === key)
        )
        .map((r) => r.tournament_id)
    );
  }, [regs, profile, myName]);

  const upcoming = useMemo(() => {
    if (!tournaments) return [];
    const today = localDateStr(new Date());
    const windowEnd = endOfNextWeekStr();
    return tournaments
      .filter((t) => t.date >= today && (t.status === "open" || t.status === "locked"))
      .filter((t) => {
        // Fenêtre : semaine en cours + semaine suivante.
        const inWindow = t.date <= windowEnd;
        const levelOk = profile?.level == null || labelIncludesPlayer(t.level, profile.level);
        // Affiché si dans la fenêtre ET du bon niveau, OU déjà inscrit (exception).
        return (inWindow && levelOk) || myTournamentIds.has(t.id);
      });
  }, [tournaments, profile, myTournamentIds]);

  // Leçons où le joueur a déjà une inscription (par compte ou par nom).
  const myLessonIds = useMemo(() => {
    const key = myName.toLowerCase().trim();
    return new Set(
      lessonRegs
        .filter(
          (r) =>
            (profile && r.profile_id === profile.id) ||
            (key && r.player_name.toLowerCase().trim() === key)
        )
        .map((r) => r.lesson_id)
    );
  }, [lessonRegs, profile, myName]);

  const upcomingLessons = useMemo(() => {
    const today = localDateStr(new Date());
    const windowEnd = endOfNextWeekStr();
    return lessons
      .filter((l) => l.date >= today && (l.status === "open" || l.status === "locked"))
      .filter((l) => {
        const mine = myLessonIds.has(l.id);
        // Verrouillée : la leçon disparaît pour tout le monde, sauf pour les
        // joueurs qui y sont déjà inscrits (ils doivent garder leur créneau).
        if (l.status === "locked" && !mine) return false;
        const inWindow = l.date <= windowEnd;
        const levelOk = lessonIncludesPlayer(l.levels, profile?.level ?? null);
        return (inWindow && levelOk) || mine;
      });
  }, [lessons, profile, myLessonIds]);

  // Créneaux où le joueur a déjà une inscription (par compte ou par nom).
  const myMatchIds = useMemo(() => {
    const key = myName.toLowerCase().trim();
    return new Set(
      matchRegs
        .filter(
          (r) =>
            (profile && r.profile_id === profile.id) ||
            (key && r.player_name.toLowerCase().trim() === key)
        )
        .map((r) => r.match_slot_id)
    );
  }, [matchRegs, profile, myName]);

  const upcomingMatches = useMemo(() => {
    const today = localDateStr(new Date());
    const windowEnd = endOfNextWeekStr();
    return matchSlots
      .filter((m) => m.date >= today && (m.status === "open" || m.status === "locked"))
      .filter((m) => {
        const mine = myMatchIds.has(m.id);
        // Verrouillé : masqué à tous sauf aux inscrits, qui gardent leur créneau.
        if (m.status === "locked" && !mine) return false;
        const inWindow = m.date <= windowEnd;
        const levelOk = levelsIncludePlayer(m.levels, profile?.level ?? null);
        return (inWindow && levelOk) || mine;
      });
  }, [matchSlots, profile, myMatchIds]);

  async function toggleMatchRegistration(m: MatchSlot, mine: MatchSlotRegistration | undefined) {
    if (!profile) return;
    setBusy(m.id);
    try {
      if (mine) await deleteMatchSlotRegistration(mine.id);
      else {
        await requestMatchSlotRegistration(m.id, myName, profile.id);
        notifyAdmins("registration", myName); // push aux admins (non bloquant)
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function toggleLessonRegistration(l: Lesson, mine: LessonRegistration | undefined) {
    if (!profile) return;
    setBusy(l.id);
    try {
      if (mine) await deleteLessonRegistration(mine.id);
      else {
        await requestLessonRegistration(l.id, myName, profile.id);
        notifyAdmins("registration", myName); // push aux admins (non bloquant)
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  async function toggleRegistration(t: Tournament, mine: Registration | undefined) {
    if (!profile) return;
    setBusy(t.id);
    try {
      if (mine) {
        const wasApproved = mine.status === "approved";
        await deleteRegistration(mine.id);
        // Le joueur avait pu être placé dans la grille : l'en retirer aussi,
        // sinon l'organisateur continue de le voir inscrit.
        await removeFromTournamentGrid(t.id, mine.player_name);
        // Désistement : prévient les admins, et si une place confirmée se libère,
        // prévient les joueurs en liste d'attente.
        notifyWithdrawal(myName, t.date, t.time);
        if (wasApproved) notifySpotFreed(t.id, t.date);
      } else {
        await requestRegistration(t.id, myName, profile.id);
        notifyAdmins("registration", myName); // push aux admins (non bloquant)
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  if (tournaments === null || !profile) return <Loader />;

  return (
    <div className="fade-up space-y-5">
      <div>
        <SectionBanner
          icon="🎾"
          title="Tournois à venir"
          subtitle="Matchs & points au classement V-Champs"
          count={upcoming.length}
          accent="gold"
        />

        {!upcoming.length ? (
          <Card>
            <EmptyState>Aucun tournoi à venir pour le moment.</EmptyState>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcoming.map((t) => {
              const tRegs = regs.filter((r) => r.tournament_id === t.id);
              const approved = tRegs.filter((r) => r.status === "approved");
              const mine = tRegs.find(
                (r) =>
                  r.profile_id === profile.id ||
                  (myName && r.player_name.toLowerCase().trim() === myName.toLowerCase().trim())
              );
              const gridNames = (t.teams || [])
                .flatMap((tm) => tm.players)
                .filter((p) => p?.trim());
              const confirmedNames = [
                ...new Set([...approved.map((r) => r.player_name), ...gridNames]),
              ];
              const full = confirmedNames.length >= t.capacity;
              const locked = t.status === "locked";

              return (
                <Card key={t.id} className="overflow-hidden border-l-4 border-l-gold">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-extrabold text-bright">
                          {formatDateLong(t.date)}
                          <span className="ml-2 text-gold">{t.time}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge color="gold">Niveau {t.level}</Badge>
                          <span
                            className={`text-[11px] font-bold ${
                              full ? "text-bad" : "text-ok"
                            }`}
                          >
                            {confirmedNames.length}/{t.capacity} confirmés
                          </span>
                        </div>
                      </div>
                      {mine && (
                        <Badge color={STATUS_UI[mine.status].color}>
                          {statusLabel(mine, tRegs)}
                        </Badge>
                      )}
                    </div>

                    {confirmedNames.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {confirmedNames.map((n) => (
                          <span
                            key={n}
                            className="rounded-full bg-card2 px-2.5 py-1 text-[11px] font-semibold text-sub"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-4">
                      {mine ? (
                        mine.status !== "declined" && (
                          <Btn
                            variant="ghost"
                            size="sm"
                            disabled={busy === t.id}
                            onClick={() => toggleRegistration(t, mine)}
                          >
                            ✕ Annuler ma {mine.status === "approved" ? "participation" : "demande"}
                          </Btn>
                        )
                      ) : locked ? (
                        <p className="text-xs font-semibold text-mut">
                          Inscriptions clôturées par l&apos;organisateur.
                        </p>
                      ) : (
                        <Btn
                          size="sm"
                          disabled={busy === t.id}
                          onClick={() => toggleRegistration(t, undefined)}
                        >
                          {full ? "Rejoindre la liste d'attente" : "🎾 Demander ma place"}
                        </Btn>
                      )}
                    </div>
                  </div>
                  <div className="h-1 bg-line">
                    <div
                      className={`h-full transition-all ${full ? "bg-ok" : "bg-gold"}`}
                      style={{
                        width: `${Math.min(100, Math.round((confirmedNames.length / t.capacity) * 100))}%`,
                      }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {upcomingLessons.length > 0 && (
        <div>
          <SectionBanner
            icon="🎓"
            title="Leçons à venir"
            subtitle="Coaching — phases de jeu & panier (sans points)"
            count={upcomingLessons.length}
            accent="coach"
          />
          <div className="space-y-3">
            {upcomingLessons.map((l) => {
              const lRegs = lessonRegs.filter((r) => r.lesson_id === l.id);
              const approved = lRegs.filter((r) => r.status === "approved");
              const mine = lRegs.find(
                (r) =>
                  r.profile_id === profile.id ||
                  (myName && r.player_name.toLowerCase().trim() === myName.toLowerCase().trim())
              );
              const full = approved.length >= l.capacity;
              const locked = l.status === "locked";
              const k = lessonKind(l.kind);

              return (
                <Card key={l.id} className="overflow-hidden border-l-4 border-l-coach">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-extrabold text-bright">
                          {formatDateLong(l.date)}
                          <span className="ml-2 text-gold">{l.time}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge color="coach">
                            {k.icon} {k.label}
                          </Badge>
                          {l.theme && (
                            <span className="text-[11px] font-semibold text-body">
                              « {l.theme} »
                            </span>
                          )}
                          {locked && <Badge color="bad">🔒 Complète</Badge>}
                          <span className={`text-[11px] font-bold ${full ? "text-bad" : "text-ok"}`}>
                            {approved.length}/{l.capacity} confirmés
                          </span>
                        </div>
                      </div>
                      {mine && (
                        <Badge color={STATUS_UI[mine.status].color}>
                          {statusLabel(mine, lRegs)}
                        </Badge>
                      )}
                    </div>

                    {approved.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {approved.map((r) => (
                          <span
                            key={r.id}
                            className="rounded-full bg-card2 px-2.5 py-1 text-[11px] font-semibold text-sub"
                          >
                            {r.player_name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-4">
                      {mine ? (
                        mine.status !== "declined" && (
                          <Btn
                            variant="ghost"
                            size="sm"
                            disabled={busy === l.id}
                            onClick={() => toggleLessonRegistration(l, mine)}
                          >
                            ✕ Annuler ma {mine.status === "approved" ? "participation" : "demande"}
                          </Btn>
                        )
                      ) : locked ? (
                        <p className="text-xs font-semibold text-mut">
                          Inscriptions clôturées par le coach.
                        </p>
                      ) : (
                        <Btn
                          size="sm"
                          disabled={busy === l.id}
                          onClick={() => toggleLessonRegistration(l, undefined)}
                        >
                          {full ? "Rejoindre la liste d'attente" : "🎓 Demander ma place"}
                        </Btn>
                      )}
                    </div>
                  </div>
                  <div className="h-1 bg-line">
                    <div
                      className={`h-full transition-all ${full ? "bg-ok" : "bg-gold"}`}
                      style={{
                        width: `${Math.min(100, Math.round((approved.length / l.capacity) * 100))}%`,
                      }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {upcomingMatches.length > 0 && (
        <div>
          <SectionBanner
            icon="🤝"
            title="Matchs à venir"
            subtitle="Créneaux libres — sans points au classement"
            count={upcomingMatches.length}
            accent="match"
          />
          <div className="space-y-3">
            {upcomingMatches.map((m) => {
              const mRegs = matchRegs.filter((r) => r.match_slot_id === m.id);
              const approved = mRegs.filter((r) => r.status === "approved");
              const mine = mRegs.find(
                (r) =>
                  r.profile_id === profile.id ||
                  (myName && r.player_name.toLowerCase().trim() === myName.toLowerCase().trim())
              );
              const full = approved.length >= m.capacity;
              const locked = m.status === "locked";

              return (
                <Card key={m.id} className="overflow-hidden border-l-4 border-l-match">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-extrabold text-bright">
                          {formatDateLong(m.date)}
                          <span className="ml-2 text-gold">{m.time}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <Badge color="match">🤝 {levelsLabel(m.levels)}</Badge>
                          {locked && <Badge color="bad">🔒 Complet</Badge>}
                          <span className={`text-[11px] font-bold ${full ? "text-bad" : "text-ok"}`}>
                            {approved.length}/{m.capacity} confirmés
                          </span>
                        </div>
                      </div>
                      {mine && (
                        <Badge color={STATUS_UI[mine.status].color}>
                          {statusLabel(mine, mRegs)}
                        </Badge>
                      )}
                    </div>

                    {approved.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {approved.map((r) => (
                          <span
                            key={r.id}
                            className="rounded-full bg-card2 px-2.5 py-1 text-[11px] font-semibold text-sub"
                          >
                            {r.player_name}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-4">
                      {mine ? (
                        mine.status !== "declined" && (
                          <Btn
                            variant="ghost"
                            size="sm"
                            disabled={busy === m.id}
                            onClick={() => toggleMatchRegistration(m, mine)}
                          >
                            ✕ Annuler ma {mine.status === "approved" ? "participation" : "demande"}
                          </Btn>
                        )
                      ) : locked ? (
                        <p className="text-xs font-semibold text-mut">
                          Inscriptions clôturées par l&apos;organisateur.
                        </p>
                      ) : (
                        <Btn
                          size="sm"
                          disabled={busy === m.id}
                          onClick={() => toggleMatchRegistration(m, undefined)}
                        >
                          {full ? "Rejoindre la liste d'attente" : "🤝 Demander ma place"}
                        </Btn>
                      )}
                    </div>
                  </div>
                  <div className="h-1 bg-line">
                    <div
                      className={`h-full transition-all ${full ? "bg-ok" : "bg-gold"}`}
                      style={{
                        width: `${Math.min(100, Math.round((approved.length / m.capacity) * 100))}%`,
                      }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <Card tone="danger" className="p-3 text-xs text-bad">
          {error} — si les tables v2 n&apos;existent pas encore, exécutez le script{" "}
          <code>supabase/migration.sql</code>.
        </Card>
      )}
    </div>
  );
}
