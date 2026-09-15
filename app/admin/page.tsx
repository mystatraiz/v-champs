"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import {
  cancelLesson,
  cancelMatchSlot,
  cancelTournament,
  createLesson,
  createMatchSlot,
  createTournament,
  listLessonRegistrations,
  listLessons,
  listMatchSlotRegistrations,
  listMatchSlots,
  listProfiles,
  listRecurrenceRules,
  listRegistrations,
  listTournaments,
  loadAppData,
} from "@/lib/store";
import { notifyNewLesson, notifyNewMatchSlot, notifyNewTournament } from "@/lib/push";
import { useAppData } from "@/lib/use-app-data";
import {
  AGENDA_KINDS,
  buildAgenda,
  countsByDay,
  slidingDays,
  type AgendaKind,
} from "@/lib/agenda";
import { levelsLabel } from "@/lib/levels";
import { nextOccurrences } from "@/lib/recurrence";
import { lessonKind } from "@/lib/lessons";
import { endOfNextWeekStr, formatDateLong, localDateStr, playerIdentity } from "@/lib/format";
import type {
  Lesson,
  Profile,
  RecurrenceRule,
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

// Récurrences de secours, utilisées uniquement si la table des règles n'est pas
// encore disponible (migration non exécutée). Elles reprennent les créneaux
// historiques du club.
const FALLBACK_RULES: Omit<RecurrenceRule, "id" | "active" | "created_at">[] = [
  { kind: "tournament", start_date: "", time: "12:30", interval_weeks: 1, keep_ahead: 4, level: "6/7", levels: [], courts: 2, capacity: 8 },
  { kind: "tournament", start_date: "", time: "12:30", interval_weeks: 1, keep_ahead: 4, level: "6/7", levels: [], courts: 2, capacity: 8 },
  { kind: "tournament", start_date: "", time: "12:30", interval_weeks: 1, keep_ahead: 4, level: "5/6", levels: [], courts: 2, capacity: 8 },
];
// Jours ISO correspondants (lundi, mardi, jeudi) pour ancrer les règles de secours.
const FALLBACK_DAYS = [1, 2, 4];

function nextDateForIsoDay(isoDay: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const cur = d.getDay() === 0 ? 7 : d.getDay();
  d.setDate(d.getDate() + ((isoDay - cur + 7) % 7));
  return localDateStr(d);
}

// Maintient les prochaines occurrences de chaque règle active, pour les trois
// types de créneaux. Un créneau déjà présent (même type, même date, même heure)
// n'est jamais recréé : annuler une occurrence ne la fait donc pas revenir.
async function ensureRecurring(
  rules: RecurrenceRule[],
  existing: { tournament: Tournament[]; lesson: Lesson[]; match: MatchSlot[] }
): Promise<boolean> {
  const windowEnd = endOfNextWeekStr();
  const occupied = {
    tournament: new Set(existing.tournament.map((t) => `${t.date}|${t.time}`)),
    lesson: new Set(existing.lesson.map((l) => `${l.date}|${l.time}`)),
    match: new Set(existing.match.map((m) => `${m.date}|${m.time}`)),
  };
  let created = false;

  for (const rule of rules) {
    if (!rule.start_date) continue;
    for (const date of nextOccurrences(rule.start_date, rule.interval_weeks, rule.keep_ahead)) {
      const slot = `${date}|${rule.time}`;
      if (occupied[rule.kind].has(slot)) continue;
      occupied[rule.kind].add(slot);

      if (rule.kind === "tournament") {
        await createTournament({
          date,
          time: rule.time,
          level: rule.level || "6/7",
          courts: rule.courts,
          capacity: rule.capacity,
        });
        // On ne notifie que pour les créneaux déjà visibles côté joueur.
        if (date <= windowEnd) notifyNewTournament(rule.level || "6/7", date, rule.time);
      } else if (rule.kind === "lesson") {
        await createLesson({
          date,
          time: rule.time,
          levels: rule.levels || [],
          kind: rule.lesson_kind || "phases",
          theme: rule.theme ?? null,
          courts: rule.courts,
          capacity: rule.capacity,
        });
        if (date <= windowEnd)
          notifyNewLesson(rule.levels || [], rule.lesson_kind || "phases", date, rule.time);
      } else {
        await createMatchSlot({
          date,
          time: rule.time,
          levels: rule.levels || [],
          courts: rule.courts,
          capacity: rule.capacity,
        });
        if (date <= windowEnd) notifyNewMatchSlot(rule.levels || [], date, rule.time);
      }
      created = true;
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
    const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch {
        return fallback;
      }
    };

    let ts: Tournament[] = [];
    try {
      ts = await listTournaments();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
      setTournaments([]);
      return;
    }
    // Leçons, matchs et règles sont indépendants : si leurs tables manquent
    // encore, les tournois doivent rester affichés.
    let ls = await safe(listLessons(), [] as Lesson[]);
    let ms = await safe(listMatchSlots(), [] as MatchSlot[]);

    // Sans table de règles (migration non exécutée), on retombe sur les
    // récurrences historiques pour ne pas interrompre les tournois du club.
    let rules = await safe(listRecurrenceRules(), null);
    if (rules === null) {
      rules = FALLBACK_RULES.map((r, i) => ({
        ...r,
        id: `fallback-${i}`,
        active: true,
        start_date: nextDateForIsoDay(FALLBACK_DAYS[i]),
      }));
    }
    if (await ensureRecurring(rules, { tournament: ts, lesson: ls, match: ms })) {
      [ts, ls, ms] = await Promise.all([
        listTournaments(),
        safe(listLessons(), ls),
        safe(listMatchSlots(), ms),
      ]);
    }

    const [rs, lrs, mrs, app] = await Promise.all([
      safe(listRegistrations(), [] as Registration[]),
      safe(listLessonRegistrations(), [] as LessonRegistration[]),
      safe(listMatchSlotRegistrations(), [] as MatchSlotRegistration[]),
      loadAppData(),
    ]);

    setTournaments(ts);
    setLessons(ls);
    setMatchSlots(ms);
    setRegs(rs);
    setLessonRegs(lrs);
    setMatchRegs(mrs);
    setSession(app.currentSession);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  // Les profils servent à l'étiquette d'auteur (admins) et à l'autocomplétion
  // des joueurs (tous les organisateurs) : on les charge dans les deux cas.
  useEffect(() => {
    listProfiles()
      .then(setProfiles)
      .catch(() => setProfiles([]));
  }, []);

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
  // known_players ne contient que les joueurs ayant déjà joué une session. Les
  // comptes inscrits mais jamais alignés doivent aussi être proposés.
  const knownPlayers = [
    ...new Set([
      ...(appData?.knownPlayers ?? []),
      ...profiles
        .filter((p) => p.role !== "pending")
        .map((p) => p.linked_player_name || playerIdentity(p.first_name, p.last_name))
        .filter(Boolean),
    ]),
  ];

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
                      if (
                        !confirm(
                          "Annuler cette leçon ?\n\nElle disparaîtra pour les joueurs et ne sera pas recréée par la récurrence. Les demandes en cours seront effacées."
                        )
                      )
                        return;
                      await cancelLesson(l.id);
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
                      if (
                        !confirm(
                          "Annuler ce créneau de match ?\n\nIl disparaîtra pour les joueurs et ne sera pas recréé par la récurrence. Les demandes en cours seront effacées."
                        )
                      )
                        return;
                      await cancelMatchSlot(m.id);
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
                const label = `${formatDateLong(e.date)} à ${e.time}`;
                return (
                  <Card
                    key={`${e.kind}-${e.id}`}
                    className={`flex items-center gap-2 border-l-4 p-3 ${meta.edge}`}
                  >
                    <span className="text-sm">{meta.icon}</span>
                    {e.kind === "tournament" ? (
                      <Link
                        href={`/admin/tournoi/${e.id}`}
                        className="min-w-0 flex-1 truncate text-sm text-body"
                      >
                        {formatDateLong(e.date)} · <span className="text-gold">{e.time}</span>
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-sm text-body">
                        {formatDateLong(e.date)} · <span className="text-gold">{e.time}</span>
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-mut">{meta.short}</span>
                    {/* Annulable ici aussi : une récurrence créée par erreur se
                        corrige sans attendre que ses occurrences se rapprochent. */}
                    <button
                      onClick={async () => {
                        if (
                          !confirm(
                            `Annuler ce créneau ?\n\n${meta.short} — ${label}\n\nIl disparaîtra pour les joueurs et ne sera pas recréé par la récurrence.`
                          )
                        )
                          return;
                        if (e.kind === "tournament") await cancelTournament(e.id);
                        else if (e.kind === "lesson") await cancelLesson(e.id);
                        else await cancelMatchSlot(e.id);
                        reload();
                      }}
                      className="shrink-0 cursor-pointer px-1.5 text-mut hover:text-bad"
                      title="Annuler"
                    >
                      ✕
                    </button>
                  </Card>
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
