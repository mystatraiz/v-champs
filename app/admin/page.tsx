"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  cancelTournament,
  createTournament,
  deleteLesson,
  deleteMatchSlot,
  listLessonRegistrations,
  listLessons,
  listMatchSlotRegistrations,
  listMatchSlots,
  listProfiles,
  listRegistrations,
  listTournaments,
  loadAppData,
} from "@/lib/store";
import { notifyNewTournament } from "@/lib/push";
import { useAppData } from "@/lib/use-app-data";
import {
  AGENDA_KINDS,
  buildAgenda,
  countsByDay,
  slidingDays,
  type AgendaKind,
} from "@/lib/agenda";
import { levelsLabel } from "@/lib/levels";
import { lessonKind } from "@/lib/lessons";
import { endOfNextWeekStr, formatDateLong, localDateStr } from "@/lib/format";
import type {
  Lesson,
  Profile,
  LessonRegistration,
  MatchSlot,
  MatchSlotRegistration,
  Registration,
  SessionState,
  Tournament,
} from "@/lib/types";
import { KindFilter, WeekStrip } from "@/components/WeekStrip";
import { CreateSlotForm } from "@/components/admin/CreateSlotForm";
import { LessonDetail } from "@/components/admin/LessonDetail";
import { MatchSlotDetail } from "@/components/admin/MatchSlotDetail";
import { Badge, Btn, Card, EmptyState, Loader, SectionTitle } from "@/components/ui";

// Règles de tournois récurrents (jour(s) de la semaine 0=dim..6=sam).
const RECURRENCES: {
  days: number[];
  time: string;
  level: string;
  courts: number;
  count: number;
}[] = [
  { days: [1, 2], time: "12:30", level: "6/7", courts: 2, count: 4 }, // lundi/mardi
  { days: [4], time: "12:30", level: "5/6", courts: 2, count: 4 }, // jeudi
];

// Maintient les prochains tournois récurrents (crée ceux qui manquent).
async function ensureRecurring(tournaments: Tournament[]): Promise<boolean> {
  const today = localDateStr(new Date());
  const windowEnd = endOfNextWeekStr();
  let created = false;

  // Créneaux (date + heure) déjà pris, TOUS niveaux et TOUS statuts confondus.
  // On ne crée jamais un tournoi récurrent sur un créneau déjà occupé : changer
  // le niveau d'un tournoi ne crée donc pas de doublon le même jour, et un
  // tournoi annulé par l'organisateur n'est pas ressuscité aussitôt.
  const occupied = new Set(tournaments.map((t) => `${t.date}|${t.time}`));

  for (const rule of RECURRENCES) {
    const upcoming = tournaments.filter((t) => {
      const d = new Date(t.date + "T00:00:00");
      return (
        t.date >= today &&
        t.time === rule.time &&
        t.level === rule.level &&
        rule.days.includes(d.getDay()) &&
        t.status !== "cancelled"
      );
    });
    let need = rule.count - upcoming.length;
    if (need <= 0) continue;

    const cursor = new Date();
    cursor.setDate(cursor.getDate() + 1);
    let safety = 0;
    while (need > 0 && safety < 120) {
      safety++;
      const dateStr = localDateStr(cursor);
      const slot = `${dateStr}|${rule.time}`;
      if (rule.days.includes(cursor.getDay()) && !occupied.has(slot)) {
        await createTournament({
          date: dateStr,
          time: rule.time,
          level: rule.level,
          courts: rule.courts,
          capacity: rule.courts * 4,
        });
        // Notification uniquement pour les tournois déjà visibles côté joueur :
        // la récurrence en crée aussi de plus lointains, masqués chez eux.
        if (dateStr <= windowEnd) notifyNewTournament(rule.level, dateStr, rule.time);
        occupied.add(slot);
        need--;
        created = true;
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  return created;
}

export default function AdminAgenda() {
  const router = useRouter();
  const { profile: me } = useAuth();
  const { data: appData } = useAppData();
  // Qui a créé quoi : réservé aux admins.
  const isAdmin = me?.role === "admin";
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonRegs, setLessonRegs] = useState<LessonRegistration[]>([]);
  const [matchSlots, setMatchSlots] = useState<MatchSlot[]>([]);
  const [matchRegs, setMatchRegs] = useState<MatchSlotRegistration[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [showFar, setShowFar] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<AgendaKind | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      let ts = await listTournaments();
      if (await ensureRecurring(ts)) ts = await listTournaments();
      const [rs, app] = await Promise.all([listRegistrations(), loadAppData()]);
      setTournaments(ts);
      setRegs(rs);
      setSession(app.currentSession);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
      setTournaments([]);
    }
    // Leçons et matchs sont indépendants : si leurs tables manquent encore,
    // les tournois doivent rester affichés.
    try {
      const [ls, lrs] = await Promise.all([listLessons(), listLessonRegistrations()]);
      setLessons(ls);
      setLessonRegs(lrs);
    } catch {
      setLessons([]);
    }
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

  useEffect(() => {
    if (!isAdmin) return;
    listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, [isAdmin]);

  const today = localDateStr(new Date());
  const windowEnd = endOfNextWeekStr();

  const active = useMemo(
    () => ({
      tournaments: (tournaments ?? []).filter(
        (t) => t.date >= today && t.status !== "done" && t.status !== "cancelled"
      ),
      lessons: lessons.filter((l) => l.date >= today && l.status !== "cancelled"),
      matches: matchSlots.filter((m) => m.date >= today && m.status !== "cancelled"),
    }),
    [tournaments, lessons, matchSlots, today]
  );

  const agenda = useMemo(
    () => buildAgenda(active.tournaments, active.lessons, active.matches),
    [active]
  );
  const near = useMemo(() => agenda.filter((e) => e.date <= windowEnd), [agenda, windowEnd]);
  const far = useMemo(() => agenda.filter((e) => e.date > windowEnd), [agenda, windowEnd]);

  const counts = useMemo(() => countsByDay(agenda), [agenda]);
  const byKind = useMemo(
    () => ({
      tournament: near.filter((e) => e.kind === "tournament").length,
      lesson: near.filter((e) => e.kind === "lesson").length,
      match: near.filter((e) => e.kind === "match").length,
    }),
    [near]
  );

  const visible = near
    .filter((e) => !selectedDay || e.date === selectedDay)
    .filter((e) => !kindFilter || e.kind === kindFilter);

  if (tournaments === null) return <Loader />;

  const sessionActive = session?.sessionStarted && !session.sessionFinished;
  const knownPlayers = appData?.knownPlayers ?? [];

  // Étiquette « créé par » — visible des seuls admins. Un créneau sans auteur
  // vient de la génération automatique des récurrences.
  const authorTag = (createdBy?: string | null) => {
    if (!isAdmin) return null;
    const p = createdBy ? profiles.find((x) => x.id === createdBy) : null;
    return (
      <span className="text-[10px] font-semibold text-mut">
        {p ? `par ${p.first_name} ${p.last_name.charAt(0).toUpperCase()}.` : "auto"}
      </span>
    );
  };

  // ── En-tête commun à toutes les cartes de l'agenda ──
  const cardHeader = (
    kind: AgendaKind,
    time: string,
    badges: React.ReactNode,
    pending: number,
    filled: number,
    capacity: number,
    onClick: () => void,
    onDelete: () => void,
    author?: React.ReactNode
  ) => {
    const ready = filled >= capacity;
    return (
      <div className="flex items-center gap-3 p-3.5">
        <button onClick={onClick} className="min-w-0 flex-1 cursor-pointer text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-base font-extrabold text-gold">{time}</span>
            {badges}
            {pending > 0 && (
              <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[10px] font-extrabold text-white">
                {pending}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-2 text-xs">
            <span
              className={`font-bold ${ready ? "text-ok" : filled > 0 ? "text-gold" : "text-mut"}`}
            >
              {filled}/{capacity} joueurs
            </span>
            {author}
          </div>
        </button>
        <button
          onClick={onDelete}
          className="cursor-pointer px-2 py-1 text-mut hover:text-bad"
          title={kind === "tournament" ? "Annuler" : "Supprimer"}
        >
          ✕
        </button>
      </div>
    );
  };

  const progress = (filled: number, capacity: number) => (
    <div className="h-[3px] bg-line">
      <div
        className={`h-full ${filled >= capacity ? "bg-ok" : "bg-gold"}`}
        style={{ width: `${Math.min(100, Math.round((filled / capacity) * 100))}%` }}
      />
    </div>
  );

  return (
    <div className="fade-up space-y-4">
      {sessionActive && (
        <Card tone="gold" className="flex items-center gap-3 p-4">
          <span className="pulse-soft text-xl">🔴</span>
          <div className="flex-1">
            <div className="font-extrabold text-bright">Session en cours</div>
            <div className="text-xs text-sub">
              Round {session?.roundNum ?? 0} · {session?.label || "6/7"}
            </div>
          </div>
          <Btn size="sm" onClick={() => router.push("/admin/session")}>
            Reprendre →
          </Btn>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <SectionTitle className="mb-0">Agenda</SectionTitle>
        <Btn size="sm" variant="secondary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "✕ Fermer" : "+ Créer"}
        </Btn>
      </div>

      {showForm && (
        <CreateSlotForm
          onCreated={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}

      <WeekStrip
        days={slidingDays(7)}
        counts={counts}
        selected={selectedDay}
        onSelect={setSelectedDay}
      />
      <KindFilter value={kindFilter} counts={byKind} onChange={setKindFilter} />

      {!visible.length ? (
        <Card>
          <EmptyState>
            {selectedDay
              ? "Rien de prévu ce jour-là."
              : kindFilter
                ? "Rien de prévu dans cette catégorie."
                : "Aucune séance cette semaine ni la semaine prochaine."}
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {visible.map((entry, i) => {
            const newDay = i === 0 || visible[i - 1].date !== entry.date;
            const meta = AGENDA_KINDS.find((k) => k.key === entry.kind)!;
            const open = openId === `${entry.kind}-${entry.id}`;
            const toggle = () => setOpenId(open ? null : `${entry.kind}-${entry.id}`);

            let card: React.ReactNode = null;

            if (entry.kind === "tournament") {
              const t = entry.item;
              const tRegs = regs.filter((r) => r.tournament_id === t.id);
              const approved = tRegs.filter((r) => r.status === "approved").map((r) => r.player_name);
              const gridNames = (t.teams || []).flatMap((tm) => tm.players).filter((p) => p?.trim());
              const filled = new Set([...approved, ...gridNames]).size;
              const pending = tRegs.filter((r) => r.status === "pending").length;
              card = (
                <Card tone={filled >= t.capacity ? "gold" : "default"} className={`overflow-hidden border-l-4 ${meta.edge}`}>
                  {cardHeader(
                    entry.kind,
                    t.time,
                    <>
                      <Badge color="gold">🎾 Tournoi · {t.level}</Badge>
                      {t.status === "locked" && <Badge>🔒</Badge>}
                    </>,
                    pending,
                    filled,
                    t.capacity,
                    () => router.push(`/admin/tournoi/${t.id}`),
                    async () => {
                      if (
                        !confirm(
                          "Annuler ce tournoi ?\n\nIl disparaîtra pour les joueurs, les demandes en cours seront effacées et il ne sera pas recréé automatiquement."
                        )
                      )
                        return;
                      await cancelTournament(t.id);
                      reload();
                    },
                    authorTag(t.created_by)
                  )}
                  {progress(filled, t.capacity)}
                </Card>
              );
            }

            if (entry.kind === "lesson") {
              const l = entry.item;
              const lRegs = lessonRegs.filter((r) => r.lesson_id === l.id);
              const filled = lRegs.filter((r) => r.status === "approved").length;
              const pending = lRegs.filter((r) => r.status === "pending").length;
              const k = lessonKind(l.kind);
              card = (
                <Card tone={filled >= l.capacity ? "gold" : "default"} className={`overflow-hidden border-l-4 ${meta.edge}`}>
                  {cardHeader(
                    entry.kind,
                    l.time,
                    <>
                      <Badge color="coach">
                        {k.icon} {k.label}
                      </Badge>
                      {l.theme && (
                        <span className="text-[11px] font-semibold text-body">« {l.theme} »</span>
                      )}
                      {l.status === "locked" && <Badge color="bad">🔒</Badge>}
                    </>,
                    pending,
                    filled,
                    l.capacity,
                    toggle,
                    async () => {
                      if (!confirm("Supprimer cette leçon ?")) return;
                      await deleteLesson(l.id);
                      reload();
                    },
                    authorTag(l.created_by)
                  )}
                  {open && (
                    <LessonDetail
                      lesson={l}
                      regs={lRegs}
                      knownPlayers={knownPlayers}
                      onChange={reload}
                    />
                  )}
                  {progress(filled, l.capacity)}
                </Card>
              );
            }

            if (entry.kind === "match") {
              const m = entry.item;
              const mRegs = matchRegs.filter((r) => r.match_slot_id === m.id);
              const filled = mRegs.filter((r) => r.status === "approved").length;
              const pending = mRegs.filter((r) => r.status === "pending").length;
              card = (
                <Card tone={filled >= m.capacity ? "gold" : "default"} className={`overflow-hidden border-l-4 ${meta.edge}`}>
                  {cardHeader(
                    entry.kind,
                    m.time,
                    <>
                      <Badge color="match">🤝 Match · {levelsLabel(m.levels)}</Badge>
                      {m.status === "locked" && <Badge color="bad">🔒</Badge>}
                    </>,
                    pending,
                    filled,
                    m.capacity,
                    toggle,
                    async () => {
                      if (!confirm("Supprimer ce créneau de match ?")) return;
                      await deleteMatchSlot(m.id);
                      reload();
                    },
                    authorTag(m.created_by)
                  )}
                  {open && (
                    <MatchSlotDetail
                      slot={m}
                      regs={mRegs}
                      knownPlayers={knownPlayers}
                      onChange={reload}
                    />
                  )}
                  {progress(filled, m.capacity)}
                </Card>
              );
            }

            return (
              <div key={`${entry.kind}-${entry.id}`}>
                {newDay && (
                  <div className="mb-2 mt-1 text-[11px] font-bold uppercase tracking-[2px] text-mut">
                    {formatDateLong(entry.date)}
                  </div>
                )}
                {card}
              </div>
            );
          })}
        </div>
      )}

      {far.length > 0 && (
        <div>
          <button
            onClick={() => setShowFar((v) => !v)}
            className="cursor-pointer text-[11px] font-bold uppercase tracking-[2px] text-mut hover:text-sub"
          >
            {showFar ? "▲" : "▼"} Plus lointain ({far.length})
          </button>
          {showFar && (
            <div className="mt-2.5 space-y-1.5">
              {far.map((e) => {
                const meta = AGENDA_KINDS.find((k) => k.key === e.kind)!;
                const inner = (
                  <Card className={`flex items-center gap-2 border-l-4 p-3 ${meta.edge}`}>
                    <span className="text-sm">{meta.icon}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-body">
                      {formatDateLong(e.date)} · <span className="text-gold">{e.time}</span>
                    </span>
                    <span className="text-[11px] text-mut">{meta.short}</span>
                  </Card>
                );
                return e.kind === "tournament" ? (
                  <Link key={`${e.kind}-${e.id}`} href={`/admin/tournoi/${e.id}`} className="block">
                    {inner}
                  </Link>
                ) : (
                  <div key={`${e.kind}-${e.id}`}>{inner}</div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {error && (
        <Card tone="danger" className="p-3 text-xs text-bad">
          {error} — si les tables v2 n&apos;existent pas encore, exécutez{" "}
          <code>supabase/migration.sql</code> (voir README).
        </Card>
      )}
    </div>
  );
}
