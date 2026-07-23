"use client";

import { useMemo, useState } from "react";
import type { Team } from "@/lib/types";
import { Card, Input, SectionTitle } from "./ui";

// Composition des équipes. Les joueurs sont placés automatiquement (par le
// parent) ; ici on peut ajouter un joueur (auto-placé), en déplacer un d'un
// slot à l'autre, ou le retirer (envoyé en liste d'attente).
export function TeamComposer({
  teams,
  knownPlayers,
  onChange,
  onAddPlayer,
  onRemovePlayer,
}: {
  teams: Team[];
  knownPlayers: string[];
  onChange: (teams: Team[]) => void;
  onAddPlayer: (name: string) => void;
  onRemovePlayer: (name: string) => void;
}) {
  const [sel, setSel] = useState<{ ti: number; pi: number } | null>(null);
  const [newName, setNewName] = useState("");

  const placedLow = useMemo(
    () =>
      new Set(
        teams.flatMap((t) => t.players).filter((p) => p?.trim()).map((p) => p.toLowerCase().trim())
      ),
    [teams]
  );
  const suggestions = useMemo(() => {
    const q = newName.trim().toLowerCase();
    if (q.length < 1) return [];
    return knownPlayers
      .filter((p) => p.toLowerCase().includes(q) && !placedLow.has(p.toLowerCase().trim()))
      .slice(0, 6);
  }, [newName, knownPlayers, placedLow]);

  function clickSlot(ti: number, pi: number) {
    const occupant = teams[ti].players[pi]?.trim() || "";
    if (sel) {
      // Déplace / échange le joueur sélectionné vers ce slot.
      const next = structuredClone(teams);
      const moving = next[sel.ti].players[sel.pi];
      next[sel.ti].players[sel.pi] = occupant;
      next[ti].players[pi] = moving;
      onChange(next);
      setSel(null);
    } else if (occupant) {
      setSel({ ti, pi });
    }
  }

  function addName() {
    const n = newName.trim();
    if (!n) return;
    onAddPlayer(n);
    setNewName("");
  }

  const complete = teams.filter((t) => t.players[0]?.trim() && t.players[1]?.trim()).length;
  const placed = teams.flatMap((t) => t.players).filter((p) => p?.trim()).length;
  const allReady = complete === teams.length && teams.length > 0;

  return (
    <div className="space-y-4">
      <div className="relative">
        <div className="flex gap-2">
          <Input
            placeholder="Ajouter un joueur (placé automatiquement)…"
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
                  onAddPlayer(s);
                  setNewName("");
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <SectionTitle className="mb-0">Équipes</SectionTitle>
        <span
          className={`rounded-full border px-3 py-1 text-xs font-extrabold ${
            allReady ? "border-ok/60 text-ok" : "border-gold/50 text-gold"
          }`}
        >
          {complete}/{teams.length} équipes · {placed}/{teams.length * 2} joueurs
        </span>
      </div>

      {sel && (
        <p className="text-xs text-gold">
          Déplacement de «&nbsp;{teams[sel.ti].players[sel.pi]}&nbsp;» — touchez un slot de
          destination, ou{" "}
          <button className="underline" onClick={() => setSel(null)}>
            annuler
          </button>
          .
        </p>
      )}

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
                const isSel = sel && sel.ti === ti && sel.pi === pi;
                return (
                  <div
                    key={pi}
                    onClick={() => clickSlot(ti, pi)}
                    className={`relative flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-lg border px-2 py-2 text-sm font-bold transition-colors ${
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
                      className="text-[9px] font-extrabold tracking-widest"
                      style={{ color: pi === 0 ? "var(--color-left)" : "var(--color-right)" }}
                    >
                      {pi === 0 ? "◀ GAUCHE" : "DROITE ▶"}
                    </span>
                    <span className="mt-0.5 truncate">{p || (sel ? "Placer ici" : "—")}</span>
                    {p && !sel && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemovePlayer(team.players[pi]);
                        }}
                        title="Retirer (→ liste d'attente)"
                        className="absolute right-1 top-1 cursor-pointer rounded px-1 text-xs text-mut hover:text-bad"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
