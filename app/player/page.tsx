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
  Profile,
  Registration,
  Tournament,
} from "@/lib/types";
import { buildAgenda, countsByDay, slidingDays, type AgendaKind } from "@/lib/agenda";
import { KindFilter, WeekStrip } from "@/components/WeekStrip";
import { Badge, Btn, Card, EmptyState, Loader } from "@/components/ui";

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


// ─── Cartes de l'agenda joueur ───
// Chaque type garde son liseré et son badge de couleur : dans une liste
// chronologique mêlant les trois, la couleur est ce qui les distingue au vol.

function ActionRow({
  mine,
  locked,
  full,
  busy,
  lockedText,
  joinText,
  onToggle,
}: {
  mine?: { status: Registration["status"] };
  locked: boolean;
  full: boolean;
  busy: boolean;
  lockedText: string;
  joinText: string;
  onToggle: () => void;
}) {
  if (mine) {
    if (mine.status === "declined") return null;
    return (
      <Btn variant="ghost" size="sm" disabled={busy} onClick={onToggle}>
        ✕ Annuler ma {mine.status === "approved" ? "participation" : "demande"}
      </Btn>
    );
  }
  if (locked) return <p className="text-xs font-semibold text-mut">{lockedText}</p>;
  return (
    <Btn size="sm" disabled={busy} onClick={onToggle}>
      {full ? "Rejoindre la liste d'attente" : joinText}
    </Btn>
  );
}

function CardShell({
  edge,
  time,
  badges,
  names,
  filled,
  capacity,
  children,
}: {
  edge: string;
  time: string;
  badges: React.ReactNode;
  names: string[];
  filled: number;
  capacity: number;
  children: React.ReactNode;
}) {
  const full = filled >= capacity;
  // Les noms des inscrits sont repliés : le compteur suffit au premier coup
  // d'œil, la liste ne s'ouvre que si on la demande.
  const [showNames, setShowNames] = useState(false);

  return (
    <Card className={`overflow-hidden border-l-4 ${edge}`}>
      <div className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-extrabold text-gold">{time}</span>
          {badges}
          <span className={`text-[11px] font-bold ${full ? "text-bad" : "text-ok"}`}>
            {filled}/{capacity}
          </span>
        </div>

        {names.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowNames((v) => !v)}
              className="cursor-pointer text-[11px] font-bold text-mut hover:text-sub"
            >
              {showNames ? "▲" : "▼"} {names.length} inscrit{names.length > 1 ? "s" : ""}
            </button>
            {showNames && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {names.map((n) => (
                  <span
                    key={n}
                    className="rounded-full bg-card2 px-2.5 py-1 text-[11px] font-semibold text-sub"
                  >
                    {n}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="mt-4">{children}</div>
      </div>
      <div className="h-1 bg-line">
        <div
          className={`h-full transition-all ${full ? "bg-ok" : "bg-gold"}`}
          style={{ width: `${Math.min(100, Math.round((filled / capacity) * 100))}%` }}
        />
      </div>
    </Card>
  );
}

function TournamentCard({
  t,
  regs,
  profile,
  myName,
  busy,
  onToggle,
}: {
  t: Tournament;
  regs: Registration[];
  profile: Profile;
  myName: string;
  busy: string | null;
  onToggle: (t: Tournament, mine: Registration | undefined) => void;
}) {
  const tRegs = regs.filter((r) => r.tournament_id === t.id);
  const approved = tRegs.filter((r) => r.status === "approved");
  const mine = tRegs.find(
    (r) =>
      r.profile_id === profile.id ||
      (myName && r.player_name.toLowerCase().trim() === myName.toLowerCase().trim())
  );
  // La grille de composition fait foi une fois les équipes formées.
  const gridNames = (t.teams || []).flatMap((tm) => tm.players).filter((p) => p?.trim());
  const names = [...new Set([...approved.map((r) => r.player_name), ...gridNames])];

  return (
    <CardShell
      edge="border-l-gold"
      time={t.time}
      filled={names.length}
      capacity={t.capacity}
      names={names}
      badges={
        <>
          <Badge color="gold">🎾 Tournoi · niveau {t.level}</Badge>
          {mine && <Badge color={STATUS_UI[mine.status].color}>{statusLabel(mine, tRegs)}</Badge>}
        </>
      }
    >
      <ActionRow
        mine={mine}
        locked={t.status === "locked"}
        full={names.length >= t.capacity}
        busy={busy === t.id}
        lockedText="Inscriptions clôturées par l'organisateur."
        joinText="🎾 Demander ma place"
        onToggle={() => onToggle(t, mine)}
      />
    </CardShell>
  );
}

function LessonCard({
  l,
  regs,
  profile,
  myName,
  busy,
  onToggle,
}: {
  l: Lesson;
  regs: LessonRegistration[];
  profile: Profile;
  myName: string;
  busy: string | null;
  onToggle: (l: Lesson, mine: LessonRegistration | undefined) => void;
}) {
  const lRegs = regs.filter((r) => r.lesson_id === l.id);
  const approved = lRegs.filter((r) => r.status === "approved");
  const mine = lRegs.find(
    (r) =>
      r.profile_id === profile.id ||
      (myName && r.player_name.toLowerCase().trim() === myName.toLowerCase().trim())
  );
  const k = lessonKind(l.kind);

  return (
    <CardShell
      edge="border-l-coach"
      time={l.time}
      filled={approved.length}
      capacity={l.capacity}
      names={approved.map((r) => r.player_name)}
      badges={
        <>
          <Badge color="coach">
            {k.icon} {k.label}
          </Badge>
          {l.theme && <span className="text-[11px] font-semibold text-body">« {l.theme} »</span>}
          {l.status === "locked" && <Badge color="bad">🔒 Complète</Badge>}
          {mine && <Badge color={STATUS_UI[mine.status].color}>{statusLabel(mine, lRegs)}</Badge>}
        </>
      }
    >
      <ActionRow
        mine={mine}
        locked={l.status === "locked"}
        full={approved.length >= l.capacity}
        busy={busy === l.id}
        lockedText="Inscriptions clôturées par le coach."
        joinText="🎓 Demander ma place"
        onToggle={() => onToggle(l, mine)}
      />
    </CardShell>
  );
}

function MatchCard({
  m,
  regs,
  profile,
  myName,
  busy,
  onToggle,
}: {
  m: MatchSlot;
  regs: MatchSlotRegistration[];
  profile: Profile;
  myName: string;
  busy: string | null;
  onToggle: (m: MatchSlot, mine: MatchSlotRegistration | undefined) => void;
}) {
  const mRegs = regs.filter((r) => r.match_slot_id === m.id);
  const approved = mRegs.filter((r) => r.status === "approved");
  const mine = mRegs.find(
    (r) =>
      r.profile_id === profile.id ||
      (myName && r.player_name.toLowerCase().trim() === myName.toLowerCase().trim())
  );

  return (
    <CardShell
      edge="border-l-match"
      time={m.time}
      filled={approved.length}
      capacity={m.capacity}
      names={approved.map((r) => r.player_name)}
      badges={
        <>
          <Badge color="match">🤝 Match · {levelsLabel(m.levels)}</Badge>
          {m.status === "locked" && <Badge color="bad">🔒 Complet</Badge>}
          {mine && <Badge color={STATUS_UI[mine.status].color}>{statusLabel(mine, mRegs)}</Badge>}
        </>
      }
    >
      <ActionRow
        mine={mine}
        locked={m.status === "locked"}
        full={approved.length >= m.capacity}
        busy={busy === m.id}
        lockedText="Inscriptions clôturées par l'organisateur."
        joinText="🤝 Demander ma place"
        onToggle={() => onToggle(m, mine)}
      />
    </CardShell>
  );
}

// Agenda du joueur : frise 7 jours + liste chronologique des trois types.
export default function PlayerAgenda() {
  const { profile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonRegs, setLessonRegs] = useState<LessonRegistration[]>([]);
  const [matchSlots, setMatchSlots] = useState<MatchSlot[]>([]);
  const [matchRegs, setMatchRegs] = useState<MatchSlotRegistration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<AgendaKind | null>(null);

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

  // Frise 7 jours + liste chronologique fusionnée : un joueur cherche d'abord
  // « qu'est-ce que je peux jouer tel jour », pas « quels sont les tournois ».
  const agenda = buildAgenda(upcoming, upcomingLessons, upcomingMatches);
  const days = slidingDays(7);
  const counts = countsByDay(agenda);
  const byKind = {
    tournament: agenda.filter((e) => e.kind === "tournament").length,
    lesson: agenda.filter((e) => e.kind === "lesson").length,
    match: agenda.filter((e) => e.kind === "match").length,
  };
  const visible = agenda
    .filter((e) => !selectedDay || e.date === selectedDay)
    .filter((e) => !kindFilter || e.kind === kindFilter);

  return (
    <div className="fade-up space-y-4">
      <WeekStrip days={days} counts={counts} selected={selectedDay} onSelect={setSelectedDay} />
      <KindFilter value={kindFilter} counts={byKind} onChange={setKindFilter} />

      {!visible.length ? (
        <Card>
          <EmptyState>
            {selectedDay
              ? "Rien de prévu ce jour-là."
              : kindFilter
                ? "Rien de prévu dans cette catégorie."
                : "Aucune séance à venir pour le moment."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((entry, i) => {
            // Séparateur de date dès qu'on change de jour.
            const newDay = i === 0 || visible[i - 1].date !== entry.date;
            return (
              <div key={`${entry.kind}-${entry.id}`}>
                {newDay && (
                  <div className="mb-2 mt-1 text-[11px] font-bold uppercase tracking-[2px] text-mut">
                    {formatDateLong(entry.date)}
                  </div>
                )}
                {entry.kind === "tournament" && (
                  <TournamentCard
                    t={entry.item}
                    regs={regs}
                    profile={profile}
                    myName={myName}
                    busy={busy}
                    onToggle={toggleRegistration}
                  />
                )}
                {entry.kind === "lesson" && (
                  <LessonCard
                    l={entry.item}
                    regs={lessonRegs}
                    profile={profile}
                    myName={myName}
                    busy={busy}
                    onToggle={toggleLessonRegistration}
                  />
                )}
                {entry.kind === "match" && (
                  <MatchCard
                    m={entry.item}
                    regs={matchRegs}
                    profile={profile}
                    myName={myName}
                    busy={busy}
                    onToggle={toggleMatchRegistration}
                  />
                )}
              </div>
            );
          })}
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
