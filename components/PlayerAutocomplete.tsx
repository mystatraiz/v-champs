"use client";

import { useMemo, useState } from "react";
import { Input } from "./ui";

// Champ de saisie d'un nom de joueur avec suggestions filtrées et tappables.
// Volontairement pas de <datalist> : sur iOS les suggestions natives sont
// masquées par le clavier, une liste rendue sous le champ est bien plus lisible.
export function PlayerAutocomplete({
  value,
  onChange,
  onPick,
  options,
  exclude = [],
  placeholder = "Nom du joueur…",
  max = 6,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (name: string) => void;
  options: string[];
  exclude?: string[];
  placeholder?: string;
  max?: number;
}) {
  const [focused, setFocused] = useState(false);

  const suggestions = useMemo(() => {
    const taken = new Set(exclude.map((n) => n.toLowerCase().trim()).filter(Boolean));
    const q = value.trim().toLowerCase();
    const pool = [...new Set(options.map((n) => n.trim()).filter(Boolean))]
      .filter((n) => !taken.has(n.toLowerCase()))
      .filter((n) => !q || n.toLowerCase().includes(q));
    // Les noms qui commencent par la saisie d'abord, puis l'ordre alphabétique.
    return pool
      .sort((a, b) => {
        const as = a.toLowerCase().startsWith(q) ? 0 : 1;
        const bs = b.toLowerCase().startsWith(q) ? 0 : 1;
        return as !== bs ? as - bs : a.toLowerCase().localeCompare(b.toLowerCase());
      })
      .slice(0, max);
  }, [options, exclude, value, max]);

  const exact = suggestions.some((n) => n.toLowerCase() === value.trim().toLowerCase());
  const show = focused && suggestions.length > 0 && !exact;

  return (
    <div className="min-w-0 flex-1">
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        // Laisse le temps au tap d'une suggestion de se déclencher.
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        onKeyDown={(e) => e.key === "Enter" && onPick(value)}
        autoComplete="off"
      />
      {/* Liste en flux normal (et non en survol absolu) : les cartes parentes
          utilisent overflow-hidden, qui découperait un menu positionné. */}
      {show && (
        <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-line2 bg-surface">
          {suggestions.map((n) => (
            <button
              key={n}
              // pointerdown : se déclenche avant le blur du champ, au doigt
              // comme à la souris.
              onPointerDown={(e) => {
                e.preventDefault();
                onChange(n);
                setFocused(false);
              }}
              className="block w-full cursor-pointer border-b border-line px-3 py-2.5 text-left text-sm text-body last:border-0 hover:bg-card2"
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
