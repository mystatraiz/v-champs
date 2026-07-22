"use client";

import { useMemo, useState } from "react";
import type { Team } from "@/lib/types";
import { pairKey } from "@/lib/session";
import { Card, Input, SectionTitle } from "./ui";

export interface ComposerSelection {
  name: string;
  from: "pool" | { ti: number; pi: number };
}

// Composition des équipes : on touche un joueur puis un emplacement (mobile-first,
// remplace le drag & drop de la v1).
export function TeamComposer({
  teams,
  pool,
  knownPlayers,
  pairNameMap,
  onChange,
  onPoolAdd,
  onPoolRemove,
}: {
  teams: Team[];
  pool: string[]; // joueurs disponibles non placés
  knownPlayers: string[];
  pairNameMap: Record<string, string>;
  onChange: (teams: Team[]) => void;
  onPoolAdd: (name: string) => void;
  onPoolRemove: (name: string) => void;
}) {
  const [sel, setSel] = useState<ComposerSelection | null>(null);
  const [newName, setNewName] = useState("");

  const placedLow = useMemo(
    () => new Set(teams.flatMap((t) => t.players).filter((p) => p?.trim()).map((p) => p.toLowerCase().trim())),
    [teams]
  );
  const availablePool = pool.filter((p) => !placedLow.has(p.toLowerCase().trim()));
  const suggestions = useMemo(() => {
    const q = newName.trim().toLowerCase();
    if (q.length < 1) return [];
    const usedLow = new Set([...placedLow, ...pool.map((p) => p.toLowerCase().trim())]);
    return knownPlayers
      .filter((p) => p.toLowerCase().includes(q) && !usedLow.has(p.toLowerCase().trim()))
      .slice(0, 6);
  }, [newName, knownPlayers, placedLow, pool]);

  function applyTeams(next: Team[]) {
    // Résout automatiquement le nom d'équipe mémorisé pour chaque paire complète
    next.forEach((t) => {
      const [p1, p2] = t.players;
      if (p1?.trim() && p2?.trim()) {
        const saved = pairNameMap[pairKey(p1, p2)];
        if (saved && (t.name.startsWith("Équipe") || !t.name.trim())) t.name = saved;
      }
    });
    onChange(next);
  }

  function clickSlot(ti: number, pi: number) {
    const occupant = teams[ti].players[pi]?.trim() || null;
    if (sel) {
      const next = structuredClone(teams);
      // vide l'emplacement d'origine si la sélection vient d'un slot
      if (sel.from !== "pool") next[sel.from.ti].players[sel.from.pi] = occupant || "";
      next[ti].players[pi] = sel.name;
      applyTeams(next);
      setSel(null);
    } else if (occupant) {
      setSel({ name: occupant, from: { ti, pi } });
    }
  }

  function clickPoolChip(name: string) {
    setSel(sel?.name === name && sel.from === "pool" ? null : { name, from: "pool" });
  }

  function sendSelectionToPool() {
    if (!sel || sel.from === "pool") return;
    const next = structuredClone(teams);
    next[sel.from.ti].players[sel.from.pi] = "";
    applyTeams(next);
    setSel(null);
  }

  function addName() {
    const n = newName.trim();
    if (!n) return;
    onPoolAdd(n);
    setNewName("");
  }

  return (
    <div className="space-y-4">
      <div>
        <SectionTitle>
          Joueurs disponibles{" "}
          <span className="normal-case tracking-normal text-mut">
            — touchez un joueur puis un emplacement
          </span>
        </SectionTitle>
        <Card
          className={`min-h-14 p-3 transition-colors ${sel && sel.from !== "pool" ? "border-gold/60" : ""}`}
          tone="flat"
        >
          <div
            className="flex flex-wrap gap-2"
            onClick={(e) => {
              if (e.target === e.currentTarget) sendSelectionToPool();
            }}
          >
            {availablePool.length === 0 && !sel && (
              <span className="text-xs text-mut">Tous les joueurs sont placés 🎉</span>
            )}
            {availablePool.map((name) => (
              <span key={name} className="inline-flex items-center">
                <button
                  onClick={() => clickPoolChip(name)}
                  className={`cursor-pointer rounded-l-full border py-1.5 pl-3 pr-2 text-xs font-bold transition-colors ${
                    sel?.name === name && sel.from === "pool"
                      ? "border-gold bg-gold text-ink"
                      : "border-line2 bg-card2 text-body hover:border-mut"
                  }`}
                >
                  {name}
                </button>
                <button
                  onClick={() => onPoolRemove(name)}
                  className="cursor-pointer rounded-r-full border border-l-0 border-line2 bg-card2 py-1.5 pl-1 pr-2 text-xs text-mut hover:text-bad"
                  title="Retirer"
                >
                  ✕
                </button>
              </span>
            ))}
            {sel && sel.from !== "pool" && (
              <button
                onClick={sendSelectionToPool}
                className="cursor-pointer rounded-full border border-dashed border-gold/60 px-3 py-1.5 text-xs font-bold text-gold"
              >
                ↩ Renvoyer «{sel.name}» ici
              </button>
            )}
          </div>
        </Card>

        <div className="relative mt-2">
          <div className="flex gap-2">
            <Input
              placeholder="Ajouter un joueur…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addName()}
            />
            <button
              onClick={addName}
              className="shrink-0 cursor-pointer rounded-lg border border-line2 bg-card2 px-4 text-sm font-bold text-body hover:border-mut"
            >
              +
            </button>
          </div>
          {suggestions.length > 0 && (
            <div className="absolute inset-x-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-line2 bg-card shadow-xl">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="block w-full cursor-pointer px-3.5 py-2 text-left text-sm hover:bg-card2"
                  onClick={() => {
                    onPoolAdd(s);
                    setNewName("");
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((team, ti) => (
          <Card key={team.id} className="p-3.5">
            <input
              value={team.name}
              onChange={(e) => {
                const next = structuredClone(teams);
                next[ti].name = e.target.value;
                onChange(next);
              }}
              className="mb-2.5 w-full bg-transparent text-[13px] font-extrabold uppercase tracking-wider text-gold outline-none placeholder:text-mut"
              placeholder={`Équipe ${ti + 1}`}
            />
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((pi) => {
                const p = team.players[pi]?.trim();
                const isSel = sel && sel.from !== "pool" && sel.from.ti === ti && sel.from.pi === pi;
                return (
                  <button
                    key={pi}
                    onClick={() => clickSlot(ti, pi)}
                    className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-2 text-sm font-bold transition-colors ${
                      isSel
                        ? "border-gold bg-gold/15 text-gold"
                        : p
                        ? "border-line2 bg-card2 text-body"
                        : sel
                        ? "border-dashed border-gold/50 text-gold/70"
                        : "border-dashed border-line2 text-mut"
                    }`}
                  >
                    <span
                      className={`text-[9px] font-extrabold tracking-widest ${
                        pi === 0 ? "text-left" : "text-right"
                      }`}
                      style={{ color: pi === 0 ? "var(--color-left)" : "var(--color-right)" }}
                    >
                      {pi === 0 ? "◀ GAUCHE" : "DROITE ▶"}
                    </span>
                    <span className="mt-0.5 truncate">{p || (sel ? "Placer ici" : "—")}</span>
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
