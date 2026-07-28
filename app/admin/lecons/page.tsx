"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addApprovedLessonPlayer,
  createLesson,
  deleteLesson,
  deleteLessonRegistration,
  listLessonRegistrations,
  listLessons,
  setLessonRegistrationStatus,
} from "@/lib/store";
import { notifyNewLesson } from "@/lib/push";
import {
  LESSON_COURTS,
  LESSON_KINDS,
  lessonCapacity,
  lessonKind,
  lessonLevelsLabel,
} from "@/lib/lessons";
import { PLAYER_LEVELS } from "@/lib/levels";
import { useAppData } from "@/lib/use-app-data";
import { TIME_SLOTS, endOfNextWeekStr, formatDateLong, localDateStr } from "@/lib/format";
import type { Lesson, LessonKind, LessonRegistration } from "@/lib/types";
import { PlayerAutocomplete } from "@/components/PlayerAutocomplete";
import { Badge, Btn, Card, EmptyState, Input, Loader, SectionTitle, Select } from "@/components/ui";

// Détail d'une leçon : demandes à valider + joueurs confirmés.
function LessonDetail({
  lesson,
  regs,
  knownPlayers,
  onChange,
}: {
  lesson: Lesson;
  regs: LessonRegistration[];
  knownPlayers: string[];
  onChange: () => void;
}) {
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);

  const pending = regs.filter((r) => r.status === "pending");
  const approved = regs.filter((r) => r.status === "approved");
  const waitlist = regs.filter((r) => r.status === "waitlist");
  const full = approved.length >= lesson.capacity;

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onChange();
    } finally {
      setBusy(false);
    }
  }

  async function addManual(name = manual) {
    const n = name.trim();
    if (!n) return;
    await act(async () => {
      await addApprovedLessonPlayer(lesson.id, n);
      setManual("");
    });
  }

  return (
    <div className="border-t border-line px-3.5 py-3">
      {pending.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-mut">
            Demandes ({pending.length})
          </div>
          <div className="space-y-1.5">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-body">
                  {r.player_name}
                  {r.is_guest && <span className="ml-1.5 text-[10px] text-mut">invité</span>}
                </span>
                <Btn
                  size="sm"
                  variant="success"
                  disabled={busy}
                  onClick={() =>
                    act(() => setLessonRegistrationStatus(r.id, full ? "waitlist" : "approved"))
                  }
                >
                  {full ? "⏳ Attente" : "✓ Valider"}
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act(() => setLessonRegistrationStatus(r.id, "declined"))}
                >
                  ✕
                </Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3">
        <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-mut">
          Confirmés ({approved.length}/{lesson.capacity})
        </div>
        {!approved.length ? (
          <p className="text-xs text-mut">Personne pour le moment.</p>
        ) : (
          <div className="space-y-1.5">
            {approved.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-body">
                  ✓ {r.player_name}
                </span>
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act(() => deleteLessonRegistration(r.id))}
                >
                  ✕
                </Btn>
              </div>
            ))}
          </div>
        )}
      </div>

      {waitlist.length > 0 && (
        <div className="mb-3">
          <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-mut">
            Liste d&apos;attente ({waitlist.length})
          </div>
          <div className="space-y-1.5">
            {waitlist.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm text-sub">{r.player_name}</span>
                <Btn
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act(() => setLessonRegistrationStatus(r.id, "approved"))}
                >
                  ↑ Faire monter
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act(() => deleteLessonRegistration(r.id))}
                >
                  ✕
                </Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-start gap-2">
        <PlayerAutocomplete
          value={manual}
          onChange={setManual}
          onPick={(n) => addManual(n)}
          options={knownPlayers}
          exclude={regs.map((r) => r.player_name)}
          placeholder="Ajouter un joueur…"
        />
        <Btn
          size="sm"
          variant="secondary"
          disabled={busy || !manual.trim()}
          onClick={() => addManual()}
        >
          + Ajouter
        </Btn>
      </div>
    </div>
  );
}

export default function AdminLessons() {
  const { data: appData } = useAppData();
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [regs, setRegs] = useState<LessonRegistration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFar, setShowFar] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const [fDate, setFDate] = useState(localDateStr(tomorrow));
  const [fTime, setFTime] = useState("12:30");
  const [fKind, setFKind] = useState<LessonKind>("phases");
  const [fCourts, setFCourts] = useState(1);
  const [fLevels, setFLevels] = useState<number[]>([]);

  const reload = useCallback(async () => {
    try {
      const [ls, rs] = await Promise.all([listLessons(), listLessonRegistrations()]);
      setLessons(ls);
      setRegs(rs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
      setLessons([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const today = localDateStr(new Date());
  const windowEnd = endOfNextWeekStr();
  const active = useMemo(
    () =>
      (lessons ?? [])
        .filter((l) => l.date >= today && l.status !== "cancelled")
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
    [lessons, today]
  );
  const upcoming = useMemo(() => active.filter((l) => l.date <= windowEnd), [active, windowEnd]);
  const far = useMemo(() => active.filter((l) => l.date > windowEnd), [active, windowEnd]);

  const capacity = lessonCapacity(fKind, fCourts);

  function toggleLevel(n: number) {
    setFLevels((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)));
  }

  async function handleCreate() {
    try {
      await createLesson({
        date: fDate,
        time: fTime,
        levels: fLevels,
        kind: fKind,
        courts: fCourts,
        capacity,
      });
      notifyNewLesson(fLevels, fKind, fDate, fTime); // prévient les joueurs ciblés
      setShowForm(false);
      setFLevels([]);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    }
  }

  if (lessons === null) return <Loader />;

  const renderCard = (l: Lesson) => {
    const lRegs = regs.filter((r) => r.lesson_id === l.id);
    const pending = lRegs.filter((r) => r.status === "pending").length;
    const confirmed = lRegs.filter((r) => r.status === "approved").length;
    const ready = confirmed >= l.capacity;
    const k = lessonKind(l.kind);
    const open = openId === l.id;

    return (
      <Card key={l.id} tone={ready ? "gold" : "default"} className="overflow-hidden">
        <div className="flex items-center gap-3 p-3.5">
          <button
            onClick={() => setOpenId(open ? null : l.id)}
            className="min-w-0 flex-1 cursor-pointer text-left"
          >
            <div className="flex flex-wrap items-center gap-2 font-bold text-bright">
              {formatDateLong(l.date)} · <span className="text-gold">{l.time}</span>
              {pending > 0 && (
                <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[10px] font-extrabold text-white">
                  {pending}
                </span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-sub">
              <Badge color="gold">
                {k.icon} {k.label}
              </Badge>
              <span>{lessonLevelsLabel(l.levels)}</span>·
              <span
                className={`font-bold ${ready ? "text-ok" : confirmed > 0 ? "text-gold" : "text-mut"}`}
              >
                {confirmed}/{l.capacity} joueurs
              </span>
            </div>
          </button>
          <span className="text-xs text-mut">{open ? "▲" : "▼"}</span>
          <button
            onClick={async () => {
              if (!confirm("Supprimer cette leçon ?")) return;
              await deleteLesson(l.id);
              reload();
            }}
            className="cursor-pointer px-2 py-1 text-mut hover:text-bad"
            title="Supprimer"
          >
            ✕
          </button>
        </div>

        {open && (
          <LessonDetail
            lesson={l}
            regs={lRegs}
            knownPlayers={appData?.knownPlayers ?? []}
            onChange={reload}
          />
        )}

        <div className="h-[3px] bg-line">
          <div
            className={`h-full ${ready ? "bg-ok" : "bg-gold"}`}
            style={{ width: `${Math.min(100, Math.round((confirmed / l.capacity) * 100))}%` }}
          />
        </div>
      </Card>
    );
  };

  return (
    <div className="fade-up space-y-5">
      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <SectionTitle className="mb-0">Leçons à venir</SectionTitle>
          <Btn size="sm" variant="secondary" onClick={() => setShowForm(!showForm)}>
            {showForm ? "✕ Fermer" : "+ Planifier"}
          </Btn>
        </div>

        {showForm && (
          <Card className="mb-3 space-y-3 p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
                  Date
                </label>
                <Input type="date" value={fDate} onChange={(e) => setFDate(e.target.value)} />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
                  Heure
                </label>
                <Select value={fTime} onChange={(e) => setFTime(e.target.value)}>
                  {TIME_SLOTS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
                Type de leçon
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {LESSON_KINDS.map((k) => (
                  <button
                    key={k.value}
                    onClick={() => setFKind(k.value)}
                    className={`cursor-pointer rounded-lg border py-2.5 text-xs font-bold transition-colors ${
                      fKind === k.value
                        ? "border-gold bg-gold text-ink"
                        : "border-line2 text-sub hover:text-body"
                    }`}
                  >
                    {k.icon} {k.label}
                    <div className="text-[10px] font-semibold opacity-70">
                      {k.perCourt} joueurs/terrain
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
                Terrains
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {LESSON_COURTS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setFCourts(c)}
                    className={`cursor-pointer rounded-lg border py-2 text-xs font-bold transition-colors ${
                      fCourts === c
                        ? "border-gold bg-gold text-ink"
                        : "border-line2 text-sub hover:text-body"
                    }`}
                  >
                    {c} terrain{c > 1 ? "s" : ""} ({lessonCapacity(fKind, c)} joueurs)
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
                Niveaux concernés
              </label>
              <div className="grid grid-cols-5 gap-1.5">
                {PLAYER_LEVELS.map((n) => (
                  <button
                    key={n}
                    onClick={() => toggleLevel(n)}
                    className={`cursor-pointer rounded-lg border py-2 text-xs font-bold transition-colors ${
                      fLevels.includes(n)
                        ? "border-gold bg-gold text-ink"
                        : "border-line2 text-sub hover:text-body"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-mut">
                {fLevels.length
                  ? `Visible par les joueurs de niveau ${fLevels.join(", ")}.`
                  : "Aucun niveau coché : la leçon sera visible par tous les joueurs."}
              </p>
            </div>

            <Btn size="lg" onClick={handleCreate}>
              Créer la leçon ({capacity} places)
            </Btn>
          </Card>
        )}

        {!upcoming.length ? (
          <Card>
            <EmptyState>Aucune leçon cette semaine ni la semaine prochaine.</EmptyState>
          </Card>
        ) : (
          <div className="space-y-2.5">{upcoming.map(renderCard)}</div>
        )}

        {far.length > 0 && (
          <div className="mt-3">
            <button
              onClick={() => setShowFar((v) => !v)}
              className="cursor-pointer text-[11px] font-bold uppercase tracking-[2px] text-mut hover:text-sub"
            >
              {showFar ? "▲" : "▼"} Leçons plus lointaines ({far.length})
            </button>
            {showFar && <div className="mt-2.5 space-y-2.5">{far.map(renderCard)}</div>}
          </div>
        )}
      </div>

      {error && (
        <Card tone="danger" className="p-3 text-xs text-bad">
          {error} — si les tables des leçons n&apos;existent pas encore, exécutez{" "}
          <code>supabase/migration.sql</code> (voir README).
        </Card>
      )}
    </div>
  );
}
