"use client";

import { useEffect, useState } from "react";
import {
  addApprovedLessonPlayer,
  deleteLessonRegistration,
  setLessonRegistrationStatus,
  updateLesson,
} from "@/lib/store";
import { LESSON_COURTS, LESSON_KINDS } from "@/lib/lessons";
import { PLAYER_LEVELS } from "@/lib/levels";
import { formatLessonText, openWhatsApp } from "@/lib/share";
import { TIME_SLOTS } from "@/lib/format";
import type { Lesson, LessonRegistration, RegistrationStatus } from "@/lib/types";
import { RegistrationManager } from "@/components/RegistrationManager";
import { Btn, Input, Select } from "@/components/ui";

export function LessonDetail({
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
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [theme, setTheme] = useState(lesson.theme ?? "");

  // Le thème peut changer sous nos pieds (rechargement après enregistrement).
  useEffect(() => setTheme(lesson.theme ?? ""), [lesson.theme]);

  const approved = regs.filter((r) => r.status === "approved");
  const locked = lesson.status === "locked";

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onChange();
    } finally {
      setBusy(false);
    }
  }

  // Verrou : plus aucune demande ni liste d'attente possible côté joueur.
  async function toggleLock() {
    await act(() => updateLesson(lesson.id, { status: locked ? "open" : "locked" }));
  }

  async function setCapacity(n: number) {
    const v = Math.max(1, Math.min(12, n));
    if (v === lesson.capacity) return;
    await act(() => updateLesson(lesson.id, { capacity: v }));
  }

  return (
    <div className="border-t border-line px-3.5 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-mut">Places</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCapacity(lesson.capacity - 1)}
            disabled={busy || lesson.capacity <= 1}
            className="h-7 w-7 cursor-pointer rounded-lg border border-line2 font-bold text-sub disabled:opacity-40 hover:text-body"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-extrabold text-bright">
            {lesson.capacity}
          </span>
          <button
            onClick={() => setCapacity(lesson.capacity + 1)}
            disabled={busy || lesson.capacity >= 12}
            className="h-7 w-7 cursor-pointer rounded-lg border border-line2 font-bold text-sub disabled:opacity-40 hover:text-body"
          >
            +
          </button>
        </div>
        <Btn size="sm" variant={locked ? "danger" : "secondary"} disabled={busy} onClick={toggleLock}>
          {locked ? "🔒 Verrouillée — rouvrir" : "🔓 Verrouiller"}
        </Btn>
        <Btn
          size="sm"
          variant="secondary"
          onClick={() => openWhatsApp(formatLessonText(lesson, approved.map((r) => r.player_name)))}
        >
          📤 Partager
        </Btn>
        <Btn size="sm" variant={editing ? "primary" : "secondary"} onClick={() => setEditing((v) => !v)}>
          {editing ? "✓ Terminer" : "✏️ Modifier"}
        </Btn>
      </div>

      {editing && (
        <div className="mb-3 space-y-3 rounded-lg border border-gold/40 bg-gold/5 p-3">
          {/* Une ligne chacun : sur Safari iOS le champ date natif refuse de se
              comprimer et déborde sur son voisin dans une grille à deux colonnes. */}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Date
            </label>
            <Input
              type="date"
              value={lesson.date}
              onChange={(e) => act(() => updateLesson(lesson.id, { date: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Heure
            </label>
            <Select
              value={lesson.time}
              onChange={(e) => act(() => updateLesson(lesson.id, { time: e.target.value }))}
            >
              {TIME_SLOTS.map((sl) => (
                <option key={sl} value={sl}>
                  {sl}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Type de leçon
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {LESSON_KINDS.map((k) => (
                <button
                  key={k.value}
                  disabled={busy}
                  onClick={() => act(() => updateLesson(lesson.id, { kind: k.value }))}
                  className={`cursor-pointer rounded-lg border py-2 text-xs font-bold transition-colors ${
                    lesson.kind === k.value
                      ? "border-gold bg-gold text-ink"
                      : "border-line2 text-sub hover:text-body"
                  }`}
                >
                  {k.icon} {k.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Thème personnalisé
            </label>
            <div className="flex items-start gap-2">
              <Input
                placeholder="ex : volée haute, sortie de vitre…"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
              />
              {theme.trim() !== (lesson.theme ?? "").trim() && (
                <Btn
                  size="sm"
                  variant="success"
                  disabled={busy}
                  onClick={() =>
                    act(() => updateLesson(lesson.id, { theme: theme.trim() || null }))
                  }
                >
                  ✓
                </Btn>
              )}
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
                  disabled={busy}
                  onClick={() => act(() => updateLesson(lesson.id, { courts: c }))}
                  className={`cursor-pointer rounded-lg border py-2 text-xs font-bold transition-colors ${
                    lesson.courts === c
                      ? "border-gold bg-gold text-ink"
                      : "border-line2 text-sub hover:text-body"
                  }`}
                >
                  {c} terrain{c > 1 ? "s" : ""}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Niveaux concernés
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {PLAYER_LEVELS.map((n) => {
                const on = (lesson.levels || []).includes(n);
                return (
                  <button
                    key={n}
                    disabled={busy}
                    onClick={() =>
                      act(() =>
                        updateLesson(lesson.id, {
                          levels: on
                            ? (lesson.levels || []).filter((x) => x !== n)
                            : [...(lesson.levels || []), n].sort((a, b) => a - b),
                        })
                      )
                    }
                    className={`cursor-pointer rounded-lg border py-2 text-xs font-bold transition-colors ${
                      on ? "border-gold bg-gold text-ink" : "border-line2 text-sub hover:text-body"
                    }`}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-mut">
              Le nombre de places ne bouge pas tout seul : ajuste-le au-dessus si le changement de
              type ou de terrains l&apos;impose.
            </p>
          </div>
        </div>
      )}
      {locked && (
        <p className="mb-3 rounded-lg bg-bad/10 px-3 py-2 text-[11px] font-semibold leading-4 text-bad">
          Inscriptions bloquées : les joueurs ne peuvent plus demander de place, ni rejoindre la
          liste d&apos;attente.
        </p>
      )}

      <RegistrationManager
        regs={regs}
        capacity={lesson.capacity}
        knownPlayers={knownPlayers}
        busy={busy}
        onSetStatus={(id: string, status: RegistrationStatus) =>
          act(() => setLessonRegistrationStatus(id, status))
        }
        onRemove={(id: string) => act(() => deleteLessonRegistration(id))}
        onAdd={(name: string) => act(() => addApprovedLessonPlayer(lesson.id, name))}
      />
    </div>
  );
}
