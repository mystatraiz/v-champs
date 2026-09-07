"use client";

import { useEffect, useState } from "react";
import { createLesson, createMatchSlot, createTournament } from "@/lib/store";
import { notifyNewLesson, notifyNewMatchSlot, notifyNewTournament } from "@/lib/push";
import { AGENDA_KINDS, type AgendaKind } from "@/lib/agenda";
import { LESSON_COURTS, LESSON_KINDS, lessonCapacity } from "@/lib/lessons";
import { MATCH_COURTS, matchCapacity } from "@/lib/matches";
import { LEVEL_LABELS } from "@/lib/levels";
import { TIME_SLOTS, localDateStr } from "@/lib/format";
import type { LessonKind } from "@/lib/types";
import { LevelPicker } from "./MatchSlotDetail";
import { Btn, Card, Input, Select } from "@/components/ui";

const label = (t: string) => (
  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">{t}</label>
);

// Grille de boutons exclusive (type, terrains…).
function Choice<T extends string | number>({
  options,
  value,
  onChange,
  cols = 2,
  render,
}: {
  options: T[];
  value: T;
  onChange: (v: T) => void;
  cols?: number;
  render: (v: T) => React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {options.map((o) => (
        <button
          key={String(o)}
          onClick={() => onChange(o)}
          className={`cursor-pointer rounded-lg border py-2.5 text-xs font-bold transition-colors ${
            value === o ? "border-gold bg-gold text-ink" : "border-line2 text-sub hover:text-body"
          }`}
        >
          {render(o)}
        </button>
      ))}
    </div>
  );
}

// Compteur − / + pour le nombre de places.
function Counter({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        className="h-9 w-9 cursor-pointer rounded-lg border border-line2 font-bold text-sub hover:text-body"
      >
        −
      </button>
      <span className="w-10 text-center text-lg font-extrabold text-bright">{value}</span>
      <button
        onClick={() => onChange(Math.min(16, value + 1))}
        className="h-9 w-9 cursor-pointer rounded-lg border border-line2 font-bold text-sub hover:text-body"
      >
        +
      </button>
    </div>
  );
}

// Création unifiée : un seul formulaire, un sélecteur de type en tête.
export function CreateSlotForm({ onCreated }: { onCreated: () => void }) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [kind, setKind] = useState<AgendaKind>("tournament");
  const [date, setDate] = useState(localDateStr(tomorrow));
  const [time, setTime] = useState("12:30");
  const [courts, setCourts] = useState(2);
  const [capacity, setCapacity] = useState(8);
  const [levels, setLevels] = useState<number[]>([]);
  const [level, setLevel] = useState("6/7"); // tournois uniquement
  const [lessonType, setLessonType] = useState<LessonKind>("phases");
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Capacité par défaut selon le type courant, puis ajustable à la main.
  const autoCapacity =
    kind === "tournament"
      ? courts * 4
      : kind === "lesson"
        ? lessonCapacity(lessonType, courts)
        : matchCapacity(courts);

  useEffect(() => {
    setCapacity(autoCapacity);
  }, [autoCapacity]);

  // Les tournois tournent sur 2 terrains par défaut, les leçons sur 1.
  useEffect(() => {
    setCourts(kind === "tournament" ? 2 : 1);
  }, [kind]);

  // Le club a deux terrains : même choix pour les trois types.
  const courtOptions = kind === "lesson" ? LESSON_COURTS : MATCH_COURTS;

  function toggleLevel(n: number) {
    setLevels((prev) =>
      prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n].sort((a, b) => a - b)
    );
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      if (kind === "tournament") {
        await createTournament({ date, time, level, courts, capacity });
        notifyNewTournament(level, date, time);
      } else if (kind === "lesson") {
        await createLesson({
          date,
          time,
          levels,
          kind: lessonType,
          theme: theme.trim() || null,
          courts,
          capacity,
        });
        notifyNewLesson(levels, lessonType, date, time);
      } else {
        await createMatchSlot({ date, time, levels, courts, capacity });
        notifyNewMatchSlot(levels, date, time);
      }
      setLevels([]);
      setTheme("");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur pendant la création.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-3 space-y-3 p-4">
      <div>
        {label("Que veux-tu créer ?")}
        <Choice
          options={AGENDA_KINDS.map((k) => k.key)}
          value={kind}
          onChange={setKind}
          cols={3}
          render={(k) => {
            const meta = AGENDA_KINDS.find((x) => x.key === k)!;
            return `${meta.icon} ${meta.short}`;
          }}
        />
      </div>

      {/* Une ligne chacun : sur Safari iOS le champ date natif refuse de se
          comprimer et déborde sur son voisin dans une grille à deux colonnes. */}
      <div>
        {label("Date")}
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>
      <div>
        {label("Heure")}
        <Select value={time} onChange={(e) => setTime(e.target.value)}>
          {TIME_SLOTS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      </div>

      {kind === "lesson" && (
        <>
          <div>
            {label("Type de leçon")}
            <Choice
              options={LESSON_KINDS.map((k) => k.value)}
              value={lessonType}
              onChange={setLessonType}
              render={(v) => {
                const meta = LESSON_KINDS.find((k) => k.value === v)!;
                return `${meta.icon} ${meta.label}`;
              }}
            />
          </div>
          <div>
            {label("Thème personnalisé")}
            <Input
              placeholder="ex : volée haute, sortie de vitre…"
              value={theme}
              onChange={(e) => setTheme(e.target.value)}
            />
          </div>
        </>
      )}

      <div>
        {label("Terrains")}
        <Choice
          options={courtOptions}
          value={courts}
          onChange={setCourts}
          render={(c) => `${c} terrain${c > 1 ? "s" : ""}`}
        />
      </div>

      <div>
        {label(kind === "tournament" ? "Nombre de joueurs" : "Nombre de places")}
        <Counter value={capacity} onChange={setCapacity} />
        <p className="mt-1.5 text-[11px] text-mut">
          {capacity === autoCapacity
            ? "Calculé d'après le type et les terrains — ajustable."
            : `Personnalisé (${autoCapacity} par défaut).`}
        </p>
      </div>

      <div>
        {label("Niveau")}
        {kind === "tournament" ? (
          <Select value={level} onChange={(e) => setLevel(e.target.value)}>
            {LEVEL_LABELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        ) : (
          <>
            <LevelPicker selected={levels} onToggle={toggleLevel} />
            <p className="mt-1.5 text-[11px] text-mut">
              {levels.length
                ? `Visible par les joueurs de niveau ${levels.join(", ")}.`
                : "Aucun niveau coché : visible par tous les joueurs."}
            </p>
          </>
        )}
      </div>

      {error && <p className="text-xs font-semibold text-bad">{error}</p>}

      <Btn size="lg" disabled={busy} onClick={submit}>
        {busy ? "Création…" : `Créer (${capacity} joueur${capacity > 1 ? "s" : ""})`}
      </Btn>
    </Card>
  );
}
