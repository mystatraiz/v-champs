"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import {
  listLessonRegistrations,
  listLessons,
  listMatchSlotRegistrations,
  listMatchSlots,
  listProfiles,
  listRegistrations,
  listTournaments,
} from "@/lib/store";
import { useAppData } from "@/lib/use-app-data";
import {
  accountStats,
  activityStats,
  bestTimeSlots,
  confirmedCounts,
  fillSpeedByTimeSlot,
  fillStats,
  formatDelay,
  median,
  organiserActivity,
  pendingCounts,
  playerActivity,
  slotFillTimes,
  underfilled,
} from "@/lib/admin-stats";
import { formatDateShort, localDateStr } from "@/lib/format";
import type {
  Lesson,
  LessonRegistration,
  MatchSlot,
  MatchSlotRegistration,
  Profile,
  Registration,
  Tournament,
} from "@/lib/types";
import { Card, EmptyState, Loader, SectionTitle } from "@/components/ui";

// Tuile de chiffre clé.
function Stat({
  value,
  label,
  hint,
  tone = "body",
}: {
  value: string | number;
  label: string;
  hint?: string;
  tone?: "body" | "gold" | "ok" | "bad";
}) {
  const color = {
    body: "text-bright",
    gold: "text-gold",
    ok: "text-ok",
    bad: "text-bad",
  }[tone];
  return (
    <div className="rounded-xl border border-line bg-card p-3">
      <div className={`text-2xl font-extrabold leading-none ${color}`}>{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-wider text-sub">{label}</div>
      {hint && <div className="mt-0.5 text-[10px] leading-3 text-mut">{hint}</div>}
    </div>
  );
}

// Barre de remplissage.
function Bar({ label, rate, detail }: { label: string; rate: number; detail: string }) {
  return (
    <div className="mb-2.5 last:mb-0">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-bold text-body">{label}</span>
        <span className="text-xs font-extrabold text-gold">{rate}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-card2">
        <div
          className={`h-full rounded-full ${rate >= 80 ? "bg-ok" : rate >= 40 ? "bg-gold" : "bg-bad"}`}
          style={{ width: `${Math.min(100, rate)}%` }}
        />
      </div>
      <div className="mt-0.5 text-[10px] text-mut">{detail}</div>
    </div>
  );
}

export default function AdminStats() {
  const { profile: me } = useAuth();
  const { data: appData } = useAppData();
  const isAdmin = me?.role === "admin";

  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [lessonRegs, setLessonRegs] = useState<LessonRegistration[]>([]);
  const [matchSlots, setMatchSlots] = useState<MatchSlot[]>([]);
  const [matchRegs, setMatchRegs] = useState<MatchSlotRegistration[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const load = useCallback(async () => {
    const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => {
      try {
        return await p;
      } catch {
        return fallback;
      }
    };
    const [ts, rs, ls, lrs, ms, mrs, ps] = await Promise.all([
      safe(listTournaments(), [] as Tournament[]),
      safe(listRegistrations(), [] as Registration[]),
      safe(listLessons(), [] as Lesson[]),
      safe(listLessonRegistrations(), [] as LessonRegistration[]),
      safe(listMatchSlots(), [] as MatchSlot[]),
      safe(listMatchSlotRegistrations(), [] as MatchSlotRegistration[]),
      safe(listProfiles(), [] as Profile[]),
    ]);
    setTournaments(ts);
    setRegs(rs);
    setLessons(ls);
    setLessonRegs(lrs);
    setMatchSlots(ms);
    setMatchRegs(mrs);
    setProfiles(ps);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const today = localDateStr(new Date());

  const stats = useMemo(() => {
    if (!tournaments || !appData) return null;
    const history = appData.history;

    const tFilled = confirmedCounts(tournaments, regs, (r) => r.tournament_id);
    const lFilled = confirmedCounts(lessons, lessonRegs, (r) => r.lesson_id);
    const mFilled = confirmedCounts(matchSlots, matchRegs, (r) => r.match_slot_id);

    // Le remplissage se juge sur les créneaux passés : les créneaux à venir se
    // remplissent encore, les compter écraserait la moyenne.
    const past = <T extends { date: string }>(arr: T[], filled: number[]) => {
      const idx = arr.map((_, i) => i).filter((i) => arr[i].date < today);
      return { slots: idx.map((i) => arr[i]), filled: idx.map((i) => filled[i]) };
    };
    const pt = past(tournaments, tFilled);
    const pl = past(lessons, lFilled);
    const pm = past(matchSlots, mFilled);

    const allPast = [...pt.slots, ...pl.slots, ...pm.slots];
    const allPastFilled = [...pt.filled, ...pl.filled, ...pm.filled];

    // Vitesse de remplissage : uniquement sur les créneaux passés, dont on
    // connaît le sort final.
    const speeds = [
      ...slotFillTimes(pt.slots, regs, (r) => r.tournament_id),
      ...slotFillTimes(pl.slots, lessonRegs, (r) => r.lesson_id),
      ...slotFillTimes(pm.slots, matchRegs, (r) => r.match_slot_id),
    ];
    const filledDelays = speeds
      .map((f) => f.hoursToFill)
      .filter((h): h is number => h != null);

    return {
      act30: activityStats(history, 30),
      act90: activityStats(history, 90),
      fillT: fillStats(pt.slots, pt.filled),
      fillL: fillStats(pl.slots, pl.filled),
      fillM: fillStats(pm.slots, pm.filled),
      best: bestTimeSlots(allPast, allPastFilled, 2).slice(0, 5),
      speed: fillSpeedByTimeSlot(speeds, 2),
      medianDelay: median(filledDelays),
      lastMinute: speeds.filter((f) => f.lastMinute).length,
      neverFull: speeds.filter((f) => !f.everFull).length,
      pastSlots: speeds.length,
      players: playerActivity(history),
      accounts: accountStats(profiles),
      todo: pendingCounts(regs, lessonRegs, matchRegs),
      under: underfilled(
        [
          ...tournaments.map((t, i) => ({ ...t, _f: tFilled[i] })),
          ...lessons.map((l, i) => ({ ...l, _f: lFilled[i] })),
          ...matchSlots.map((m, i) => ({ ...m, _f: mFilled[i] })),
        ],
        [
          ...tFilled,
          ...lFilled,
          ...mFilled,
        ],
        today
      ).slice(0, 6),
      organisers: organiserActivity(tournaments, lessons, matchSlots, profiles),
    };
  }, [tournaments, regs, lessons, lessonRegs, matchSlots, matchRegs, profiles, appData, today]);

  if (!stats) return <Loader />;

  const topPlayers = stats.players.slice(0, 8);
  // Ont déjà joué mais plus rien depuis 60 jours : candidats à la relance.
  const dormant = stats.players.filter((p) => (p.daysSince ?? 0) >= 60).slice(0, 8);

  return (
    <div className="fade-up space-y-5">
      {/* ── À traiter ── */}
      {(stats.todo.total > 0 || stats.accounts.pending > 0 || stats.accounts.withoutLevel > 0) && (
        <div>
          <SectionTitle>À traiter</SectionTitle>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              value={stats.todo.total}
              label="Demandes"
              hint={`${stats.todo.tournament} tournoi · ${stats.todo.lesson} leçon · ${stats.todo.match} match`}
              tone={stats.todo.total ? "bad" : "body"}
            />
            <Stat
              value={stats.accounts.pending}
              label="Comptes"
              hint="en attente de validation"
              tone={stats.accounts.pending ? "bad" : "body"}
            />
            <Stat
              value={stats.accounts.withoutLevel}
              label="Sans niveau"
              hint="ils voient tout"
              tone={stats.accounts.withoutLevel ? "gold" : "body"}
            />
          </div>
          {stats.accounts.withoutLevel > 0 && (
            <Link
              href="/admin/joueurs"
              className="mt-2 inline-block text-[11px] font-bold text-gold underline"
            >
              Attribuer les niveaux →
            </Link>
          )}
        </div>
      )}

      {/* ── Activité ── */}
      <div>
        <SectionTitle>Activité</SectionTitle>
        <div className="grid grid-cols-3 gap-2">
          <Stat value={stats.act30.sessions} label="Sessions" hint="30 derniers jours" tone="gold" />
          <Stat value={stats.act30.matches} label="Matchs" hint="30 derniers jours" />
          <Stat value={stats.act30.players} label="Joueurs" hint="ont joué sur 30 j" tone="ok" />
        </div>
        <p className="mt-1.5 text-[11px] text-mut">
          Sur 90 jours : {stats.act90.sessions} sessions, {stats.act90.matches} matchs,{" "}
          {stats.act90.players} joueurs différents.
        </p>
      </div>

      {/* ── Remplissage ── */}
      <div>
        <SectionTitle>Taux de remplissage</SectionTitle>
        <Card className="p-3.5">
          {stats.fillT.slots + stats.fillL.slots + stats.fillM.slots === 0 ? (
            <EmptyState>Pas encore de créneau passé à analyser.</EmptyState>
          ) : (
            <>
              <Bar
                label="🎾 Tournois"
                rate={stats.fillT.rate}
                detail={`${stats.fillT.taken}/${stats.fillT.seats} places sur ${stats.fillT.slots} créneaux · ${stats.fillT.full} complets`}
              />
              <Bar
                label="🎓 Leçons"
                rate={stats.fillL.rate}
                detail={`${stats.fillL.taken}/${stats.fillL.seats} places sur ${stats.fillL.slots} créneaux · ${stats.fillL.full} complètes`}
              />
              <Bar
                label="🤝 Matchs"
                rate={stats.fillM.rate}
                detail={`${stats.fillM.taken}/${stats.fillM.seats} places sur ${stats.fillM.slots} créneaux · ${stats.fillM.full} complets`}
              />
              <p className="mt-2 text-[10px] leading-4 text-mut">
                Calculé sur les créneaux passés uniquement — ceux à venir se remplissent encore.
              </p>
            </>
          )}
        </Card>
      </div>

      {/* ── Créneaux qui marchent ── */}
      {stats.best.length > 0 && (
        <div>
          <SectionTitle>Créneaux qui marchent le mieux</SectionTitle>
          <Card className="overflow-hidden">
            {stats.best.map((s, i) => (
              <div
                key={s.key}
                className={`flex items-center gap-3 px-3.5 py-2.5 ${
                  i < stats.best.length - 1 ? "border-b border-line/60" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-body">
                  {s.key}
                </span>
                <span className="text-[10px] text-mut">{s.slots} fois</span>
                <span
                  className={`text-sm font-extrabold ${
                    s.rate >= 80 ? "text-ok" : s.rate >= 40 ? "text-gold" : "text-bad"
                  }`}
                >
                  {s.rate}%
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ── Vitesse de remplissage ── */}
      {stats.pastSlots > 0 && (
        <div>
          <SectionTitle>Vitesse de remplissage</SectionTitle>
          <div className="mb-2 grid grid-cols-3 gap-2">
            <Stat
              value={formatDelay(stats.medianDelay)}
              label="Délai médian"
              hint="ouverture → complet"
              tone="gold"
            />
            <Stat
              value={stats.lastMinute}
              label="Dernière minute"
              hint="complétés < 24 h avant"
              tone={stats.lastMinute ? "bad" : "body"}
            />
            <Stat
              value={stats.neverFull}
              label="Jamais complets"
              hint={`sur ${stats.pastSlots} créneaux`}
              tone={stats.neverFull ? "bad" : "ok"}
            />
          </div>

          {stats.speed.length > 0 && (
            <Card className="overflow-hidden">
              {stats.speed.map((r, i) => (
                <div
                  key={r.key}
                  className={`px-3.5 py-2.5 ${
                    i < stats.speed.length - 1 ? "border-b border-line/60" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-body">
                      {r.key}
                    </span>
                    <span
                      className={`text-sm font-extrabold ${
                        r.medianHours == null
                          ? "text-mut"
                          : r.medianHours <= 24
                            ? "text-ok"
                            : r.medianHours <= 96
                              ? "text-gold"
                              : "text-bad"
                      }`}
                    >
                      {formatDelay(r.medianHours)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-mut">
                    {r.filled}/{r.slots} complets
                    {r.lastMinute > 0 && ` · ${r.lastMinute} à la dernière minute`}
                    {r.filled === 0 && " · jamais rempli"}
                  </div>
                </div>
              ))}
              <div className="border-t border-line px-3.5 py-2 text-[10px] leading-4 text-mut">
                Délai médian entre l&apos;ouverture du créneau et la prise de la dernière place.
                Les plus rapides en premier : ceux du bas sont à ouvrir plus tôt, ou à relancer.
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ── Créneaux à venir incomplets ── */}
      {stats.under.length > 0 && (
        <div>
          <SectionTitle>À remplir</SectionTitle>
          <Card className="overflow-hidden">
            {stats.under.map((s, i) => (
              <div
                key={s.id}
                className={`flex items-center gap-3 px-3.5 py-2.5 ${
                  i < stats.under.length - 1 ? "border-b border-line/60" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-body">
                  {formatDateShort(s.date)} · <span className="text-gold">{s.time}</span>
                </span>
                <span className="text-xs font-bold text-bad">
                  −{s.missing} joueur{s.missing > 1 ? "s" : ""}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ── Joueurs ── */}
      <div>
        <SectionTitle>Joueurs les plus actifs</SectionTitle>
        <Card className="overflow-hidden">
          {!topPlayers.length ? (
            <EmptyState>Aucune session enregistrée.</EmptyState>
          ) : (
            topPlayers.map((p, i) => (
              <div
                key={p.name}
                className={`flex items-center gap-3 px-3.5 py-2.5 ${
                  i < topPlayers.length - 1 ? "border-b border-line/60" : ""
                }`}
              >
                <span className="w-5 text-xs font-extrabold text-mut">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-body">
                  {p.name}
                </span>
                <span className="text-[10px] text-mut">
                  {p.daysSince != null ? `il y a ${p.daysSince} j` : ""}
                </span>
                <span className="text-sm font-extrabold text-gold">{p.sessions}</span>
              </div>
            ))
          )}
        </Card>
      </div>

      {dormant.length > 0 && (
        <div>
          <SectionTitle>À relancer — plus de 60 jours sans jouer</SectionTitle>
          <Card className="overflow-hidden">
            {dormant.map((p, i) => (
              <div
                key={p.name}
                className={`flex items-center gap-3 px-3.5 py-2.5 ${
                  i < dormant.length - 1 ? "border-b border-line/60" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm text-sub">{p.name}</span>
                <span className="text-[10px] text-mut">{p.sessions} sessions</span>
                <span className="text-xs font-bold text-bad">{p.daysSince} j</span>
              </div>
            ))}
          </Card>
        </div>
      )}

      {/* ── Comptes ── */}
      <div>
        <SectionTitle>Comptes</SectionTitle>
        <div className="grid grid-cols-4 gap-2">
          <Stat value={stats.accounts.players} label="Joueurs" />
          <Stat value={stats.accounts.organisers} label="Organis." />
          <Stat value={stats.accounts.admins} label="Admins" />
          <Stat value={stats.accounts.unlinked} label="Non liés" tone={stats.accounts.unlinked ? "gold" : "body"} />
        </div>
        {stats.accounts.byLevel.length > 0 && (
          <Card className="mt-2 p-3.5">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-mut">
              Répartition par niveau
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stats.accounts.byLevel.map((l) => (
                <span
                  key={l.level}
                  className="rounded-lg bg-card2 px-2.5 py-1 text-[11px] font-bold text-body"
                >
                  N{l.level} · <span className="text-gold">{l.count}</span>
                </span>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* ── Qui organise quoi (admins uniquement) ── */}
      {isAdmin && stats.organisers.length > 0 && (
        <div>
          <SectionTitle>Qui organise quoi</SectionTitle>
          <Card className="overflow-hidden">
            {stats.organisers.map((o, i) => (
              <div
                key={o.name}
                className={`flex items-center gap-3 px-3.5 py-2.5 ${
                  i < stats.organisers.length - 1 ? "border-b border-line/60" : ""
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-body">
                  {o.name}
                </span>
                <span className="text-[10px] text-mut">
                  🎾 {o.tournaments} · 🎓 {o.lessons} · 🤝 {o.matches}
                </span>
                <span className="text-sm font-extrabold text-gold">{o.total}</span>
              </div>
            ))}
          </Card>
          <p className="mt-1.5 text-[11px] text-mut">
            Les créneaux créés avant cette fonctionnalité, comme ceux générés par les récurrences,
            apparaissent en « Récurrence auto ».
          </p>
        </div>
      )}
    </div>
  );
}
