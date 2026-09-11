"use client";

import { useMemo, useState } from "react";
import { Input } from "./ui";

// Champ de saisie d'un nom de joueur avec suggestions filtrées et tappables.
// Volontairement pas de <datalist> : sur iOS les suggestions natives sont
// masquées par le clavier, une liste rendue sous le champ est bien plus lisible.
// Comparaison tolérante : casse et accents ignorés, espaces normalisés.
// « Puech » se retrouve en tapant « puech », « Frédéric » en tapant « frederic ».
function norm(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

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
    const taken = new Set(exclude.map((n) => norm(n)).filter(Boolean));
    const q = norm(value);
    const pool = [...new Set(options.map((n) => n.trim()).filter(Boolean))].filter(
      (n) => !taken.has(norm(n))
    );
    if (!q) return pool.sort((a, b) => norm(a).localeCompare(norm(b))).slice(0, max);

    // Rang de pertinence : début du nom, puis début d'un mot (« Tom » dans
    // « Alex Tom. »), puis n'importe où dans la chaîne.
    const rank = (n: string): number => {
      const v = norm(n);
      if (v.startsWith(q)) return 0;
      if (v.split(/[\s'-]+/).some((w) => w.startsWith(q))) return 1;
      return v.includes(q) ? 2 : 3;
    };

    return pool
      .map((n) => ({ n, r: rank(n) }))
      .filter((x) => x.r < 3)
      .sort((a, b) => (a.r !== b.r ? a.r - b.r : norm(a.n).localeCompare(norm(b.n))))
      .map((x) => x.n)
      .slice(0, max);
  }, [options, exclude, value, max]);

  const exact = suggestions.some((n) => norm(n) === norm(value));
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
        autoCorrect="off"
        autoCapitalize="words"
        spellCheck={false}
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
