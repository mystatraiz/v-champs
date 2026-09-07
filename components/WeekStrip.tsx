"use client";

import { AGENDA_KINDS, dayLabels, type AgendaKind } from "@/lib/agenda";
import { localDateStr } from "@/lib/format";

// Frise glissante de 7 jours : chaque jour porte des pastilles de couleur
// indiquant ce qui s'y passe. Toucher un jour filtre la liste en dessous.
export function WeekStrip({
  days,
  counts,
  selected,
  onSelect,
}: {
  days: string[];
  counts: Map<string, Record<AgendaKind, number>>;
  selected: string | null;
  onSelect: (date: string | null) => void;
}) {
  const today = localDateStr(new Date());

  return (
    <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
      {days.map((date) => {
        const { weekday, day } = dayLabels(date);
        const c = counts.get(date);
        const total = c ? c.tournament + c.lesson + c.match : 0;
        const active = selected === date;
        const isToday = date === today;

        return (
          <button
            key={date}
            onClick={() => onSelect(active ? null : date)}
            className={`flex min-w-[46px] flex-1 shrink-0 cursor-pointer flex-col items-center gap-0.5 rounded-xl border py-2 transition-colors ${
              active
                ? "border-gold bg-gold/15"
                : total > 0
                  ? "border-line2 hover:border-mut"
                  : "border-line opacity-55"
            }`}
          >
            <span
              className={`text-[9px] font-bold uppercase tracking-wider ${
                active ? "text-gold" : "text-mut"
              }`}
            >
              {weekday}
            </span>
            <span
              className={`text-base font-extrabold leading-none ${
                active ? "text-gold" : isToday ? "text-bright" : "text-body"
              }`}
            >
              {day}
            </span>
            {/* Hauteur réservée en permanence : les jours vides ne décalent rien. */}
            <span className="flex h-1.5 items-center gap-[3px]">
              {AGENDA_KINDS.map((k) =>
                c && c[k.key] > 0 ? (
                  <span key={k.key} className={`h-1.5 w-1.5 rounded-full ${k.dot}`} />
                ) : null
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Ligne de filtres par type, partagée joueur / organisateur.
export function KindFilter({
  value,
  counts,
  onChange,
}: {
  value: AgendaKind | null;
  counts: Record<AgendaKind, number>;
  onChange: (k: AgendaKind | null) => void;
}) {
  const total = counts.tournament + counts.lesson + counts.match;
  return (
    <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
      <button
        onClick={() => onChange(null)}
        className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
          value === null ? "border-gold bg-gold text-ink" : "border-line2 text-sub hover:text-body"
        }`}
      >
        Tout ({total})
      </button>
      {AGENDA_KINDS.map((k) => (
        <button
          key={k.key}
          onClick={() => onChange(value === k.key ? null : k.key)}
          className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
            value === k.key
              ? "border-gold bg-gold text-ink"
              : "border-line2 text-sub hover:text-body"
          }`}
        >
          {k.icon} {k.label} ({counts[k.key]})
        </button>
      ))}
    </div>
  );
}
