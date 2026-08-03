"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createTournament,
  deleteTournament,
  listRegistrations,
  listTournaments,
  loadAppData,
} from "@/lib/store";
import { notifyNewTournament } from "@/lib/push";
import { LEVEL_LABELS } from "@/lib/levels";
import { TIME_SLOTS, endOfNextWeekStr, formatDateLong, localDateStr } from "@/lib/format";
import type { Registration, SessionState, Tournament } from "@/lib/types";
import { Badge, Btn, Card, EmptyState, Input, Loader, SectionTitle, Select } from "@/components/ui";

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

  // Créneaux (date + heure) déjà occupés par un tournoi, TOUS niveaux confondus.
  // On ne crée jamais un tournoi récurrent sur un créneau déjà pris : ainsi,
  // changer le niveau d'un tournoi ne provoque pas de doublon sur le même jour.
  const occupied = new Set(
    tournaments
      .filter((t) => t.status !== "cancelled")
      .map((t) => `${t.date}|${t.time}`)
  );

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

export default function AdminTournaments() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFar, setShowFar] = useState(false);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [fDate, setFDate] = useState(localDateStr(tomorrow));
  const [fTime, setFTime] = useState("12:30");
  const [fLevel, setFLevel] = useState("6/7");
  const [fCourts, setFCourts] = useState(2);

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
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const today = localDateStr(new Date());
  const windowEnd = endOfNextWeekStr();
  const activeTournaments = useMemo(
    () =>
      (tournaments ?? [])
        .filter((t) => t.date >= today && t.status !== "done" && t.status !== "cancelled")
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [tournaments, today]
  );
  // Semaine en cours + semaine suivante uniquement ; le reste est repliable.
  const upcoming = useMemo(
    () => activeTournaments.filter((t) => t.date <= windowEnd),
    [activeTournaments, windowEnd]
  );
  const farUpcoming = useMemo(
    () => activeTournaments.filter((t) => t.date > windowEnd),
    [activeTournaments, windowEnd]
  );

  const sessionActive = session?.sessionStarted && !session.sessionFinished;

  async function handleCreate() {
    try {
      await createTournament({
        date: fDate,
        time: fTime,
        level: fLevel,
        courts: fCourts,
        capacity: fCourts * 4,
      });
      notifyNewTournament(fLevel, fDate, fTime); // prévient les joueurs du niveau
      setShowForm(false);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (tournaments === null) return <Loader />;

  const renderCard = (t: Tournament, isPast: boolean) => {
    const tRegs = regs.filter((r) => r.tournament_id === t.id);
    const pending = tRegs.filter((r) => r.status === "pending").length;
    const approved = tRegs.filter((r) => r.status === "approved").map((r) => r.player_name);
    const gridNames = (t.teams || []).flatMap((tm) => tm.players).filter((p) => p?.trim());
    const confirmed = new Set([...approved, ...gridNames]).size;
    const ready = confirmed >= t.capacity;

    return (
      <Card
        key={t.id}
        tone={isPast ? "flat" : ready ? "gold" : "default"}
        className={`overflow-hidden ${isPast ? "opacity-55" : ""}`}
      >
        <div className="flex items-center gap-3 p-3.5">
          <Link href={`/admin/tournoi/${t.id}`} className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-bold text-bright">
              {formatDateLong(t.date)} · <span className="text-gold">{t.time}</span>
              {pending > 0 && !isPast && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[10px] font-extrabold text-white">
                  {pending}
                </span>
              )}
              {t.status === "locked" && <Badge>🔒</Badge>}
              {t.status === "done" && <Badge color="ok">Terminé</Badge>}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-sub">
              <span>Niveau {t.level}</span>·
              <span className={`font-bold ${ready ? "text-ok" : confirmed > 0 ? "text-gold" : "text-mut"}`}>
                {confirmed}/{t.capacity} joueurs
              </span>
            </div>
          </Link>
          {!isPast && (
            <button
              onClick={async () => {
                if (!confirm("Supprimer ce tournoi planifié ?")) return;
                await deleteTournament(t.id);
                reload();
              }}
              className="cursor-pointer px-2 py-1 text-mut hover:text-bad"
              title="Supprimer"
            >
              ✕
            </button>
          )}
        </div>
        {t.capacity > 0 && (
          <div className="h-[3px] bg-line">
            <div
              className={`h-full ${ready ? "bg-ok" : "bg-gold"}`}
              style={{ width: `${Math.min(100, Math.round((confirmed / t.capacity) * 100))}%` }}
            />
          </div>
        )}
      </Card>
    );
  };

  return (
    <div className="fade-up space-y-5">
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

      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <SectionTitle className="mb-0">Tournois à venir</SectionTitle>
          <Btn size="sm" variant="secondary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "✕ Fermer" : "+ Planifier"}
          </Btn>
        </div>

        {showForm && (
          <Card className="mb-3 space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">Date</label>
                <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">Heure</label>
                <Select value={fTime} onChange={(e) => setFTime(e.target.value)}>
                  {TIME_SLOTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">Niveau</label>
                <Select value={fLevel} onChange={(e) => setFLevel(e.target.value)}>
                  {LEVEL_LABELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </Select>
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">Terrains</label>
                <Select value={fCourts} onChange={(e) => setFCourts(Number(e.target.value))}>
                  <option value={1}>1 terrain (4 joueurs)</option>
                  <option value={2}>2 terrains (8 joueurs)</option>
                  <option value={3}>3 terrains (12 joueurs)</option>
                </Select>
              </div>
            </div>
            <Btn size="lg" onClick={handleCreate}>Créer le tournoi</Btn>
          </Card>
        )}

        {!upcoming.length ? (
          <Card>
            <EmptyState>Aucun tournoi cette semaine ni la semaine prochaine.</EmptyState>
          </Card>
        ) : (
          <div className="space-y-2.5">{upcoming.map((t) => renderCard(t, false))}</div>
        )}

        {farUpcoming.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowFar((v) => !v)}
              className="cursor-pointer text-[11px] font-bold uppercase tracking-[2px] text-mut hover:text-sub"
            >
              {showFar ? "▲" : "▼"} Tournois plus lointains ({farUpcoming.length})
            </button>
            {showFar && (
              <div className="mt-2.5 space-y-2.5">{farUpcoming.map((t) => renderCard(t, false))}</div>
            )}
          </div>
        )}
      </div>

      {error && (
        <Card tone="danger" className="p-3 text-xs text-bad">
          {error} — si les tables v2 n&apos;existent pas encore, exécutez <code>supabase/migration.sql</code>{" "}
          (voir README).
        </Card>
      )}
    </div>
  );
}
