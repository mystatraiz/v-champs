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
import { TIME_SLOTS, formatDateLong, localDateStr } from "@/lib/format";
import type { Registration, SessionState, Tournament } from "@/lib/types";
import { Badge, Btn, Card, EmptyState, Input, Loader, SectionTitle, Select } from "@/components/ui";

// Maintient 4 tournois récurrents lundi/mardi 12:30 niveau 6/7 à venir (comme la v1).
async function ensureRecurring(tournaments: Tournament[]): Promise<boolean> {
  const today = localDateStr(new Date());
  const upcoming = tournaments.filter((t) => {
    const d = new Date(t.date + "T00:00:00");
    return (
      t.date >= today &&
      t.time === "12:30" &&
      t.level === "6/7" &&
      (d.getDay() === 1 || d.getDay() === 2) &&
      t.status !== "cancelled"
    );
  });
  if (upcoming.length >= 4) return false;

  const existingDates = new Set(tournaments.map((t) => t.date));
  let added = 0;
  const needed = 4 - upcoming.length;
  const cursor = new Date();
  cursor.setDate(cursor.getDate() + 1);
  let safety = 0;
  while (added < needed && safety < 60) {
    safety++;
    const day = cursor.getDay();
    const dateStr = localDateStr(cursor);
    if ((day === 1 || day === 2) && !existingDates.has(dateStr)) {
      await createTournament({ date: dateStr, time: "12:30", level: "6/7", courts: 2, capacity: 8 });
      existingDates.add(dateStr);
      added++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return added > 0;
}

export default function AdminTournaments() {
  const router = useRouter();
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showPast, setShowPast] = useState(false);

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
  const { upcoming, past } = useMemo(() => {
    const list = tournaments ?? [];
    return {
      upcoming: list
        .filter((t) => t.date >= today && t.status !== "done" && t.status !== "cancelled")
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
      past: list
        .filter((t) => t.date < today || t.status === "done" || t.status === "cancelled")
        .sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
    };
  }, [tournaments, today]);

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
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">Date</label>
                <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">Heure</label>
                <Select value={fTime} onChange={(e) => setFTime(e.target.value)}>
                  {TIME_SLOTS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">Niveau</label>
                <Select value={fLevel} onChange={(e) => setFLevel(e.target.value)}>
                  {LEVEL_LABELS.map((l) => (
                    <option key={l} value={l}>{l}</option>
                  ))}
                </Select>
              </div>
              <div>
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
            <EmptyState>Aucun tournoi planifié.</EmptyState>
          </Card>
        ) : (
          <div className="space-y-2.5">{upcoming.map((t) => renderCard(t, false))}</div>
        )}
      </div>

      {past.length > 0 && (
        <div>
          <button
            onClick={() => setShowPast(!showPast)}
            className="mb-2.5 cursor-pointer text-[11px] font-bold uppercase tracking-[2px] text-mut hover:text-sub"
          >
            {showPast ? "▲" : "▼"} Tournois passés ({past.length})
          </button>
          {showPast && <div className="space-y-2.5">{past.slice(0, 15).map((t) => renderCard(t, true))}</div>}
        </div>
      )}

      {error && (
        <Card tone="danger" className="p-3 text-xs text-bad">
          {error} — si les tables v2 n&apos;existent pas encore, exécutez <code>supabase/migration.sql</code>{" "}
          (voir README).
        </Card>
      )}
    </div>
  );
}
