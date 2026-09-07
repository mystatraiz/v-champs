"use client";

import { useState } from "react";
import {
  addApprovedMatchSlotPlayer,
  deleteMatchSlotRegistration,
  setMatchSlotRegistrationStatus,
  updateMatchSlot,
} from "@/lib/store";
import { MATCH_COURTS } from "@/lib/matches";
import { PLAYER_LEVELS } from "@/lib/levels";
import { formatMatchSlotText, openWhatsApp } from "@/lib/share";
import { TIME_SLOTS } from "@/lib/format";
import type { MatchSlot, MatchSlotRegistration, RegistrationStatus } from "@/lib/types";
import { RegistrationManager } from "@/components/RegistrationManager";
import { Btn, Input, Select } from "@/components/ui";

// Grille de sélection des niveaux visés (1 à 10).
export function LevelPicker({
  selected,
  disabled,
  onToggle,
}: {
  selected: number[];
  disabled?: boolean;
  onToggle: (n: number) => void;
}) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {PLAYER_LEVELS.map((n) => (
        <button
          key={n}
          disabled={disabled}
          onClick={() => onToggle(n)}
          className={`cursor-pointer rounded-lg border py-2 text-xs font-bold transition-colors ${
            selected.includes(n)
              ? "border-gold bg-gold text-ink"
              : "border-line2 text-sub hover:text-body"
          }`}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

// Détail d'un créneau : réglages, partage, et gestion des inscriptions.
export function MatchSlotDetail({
  slot,
  regs,
  knownPlayers,
  onChange,
}: {
  slot: MatchSlot;
  regs: MatchSlotRegistration[];
  knownPlayers: string[];
  onChange: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const approved = regs.filter((r) => r.status === "approved");
  const locked = slot.status === "locked";

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      onChange();
    } finally {
      setBusy(false);
    }
  }

  const patch = (p: Partial<MatchSlot>) => act(() => updateMatchSlot(slot.id, p));

  async function setCapacity(n: number) {
    const v = Math.max(1, Math.min(16, n));
    if (v === slot.capacity) return;
    await patch({ capacity: v });
  }

  return (
    <div className="border-t border-line px-3.5 py-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-surface p-2.5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-mut">Joueurs</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCapacity(slot.capacity - 1)}
            disabled={busy || slot.capacity <= 1}
            className="h-7 w-7 cursor-pointer rounded-lg border border-line2 font-bold text-sub disabled:opacity-40 hover:text-body"
          >
            −
          </button>
          <span className="w-8 text-center text-sm font-extrabold text-bright">{slot.capacity}</span>
          <button
            onClick={() => setCapacity(slot.capacity + 1)}
            disabled={busy || slot.capacity >= 16}
            className="h-7 w-7 cursor-pointer rounded-lg border border-line2 font-bold text-sub disabled:opacity-40 hover:text-body"
          >
            +
          </button>
        </div>
        <Btn
          size="sm"
          variant={locked ? "danger" : "secondary"}
          disabled={busy}
          onClick={() => patch({ status: locked ? "open" : "locked" })}
        >
          {locked ? "🔒 Verrouillé — rouvrir" : "🔓 Verrouiller"}
        </Btn>
        <Btn
          size="sm"
          variant="secondary"
          onClick={() =>
            openWhatsApp(formatMatchSlotText(slot, approved.map((r) => r.player_name)))
          }
        >
          📤 Partager
        </Btn>
        <Btn
          size="sm"
          variant={editing ? "primary" : "secondary"}
          onClick={() => setEditing((v) => !v)}
        >
          {editing ? "✓ Terminer" : "✏️ Modifier"}
        </Btn>
      </div>

      {locked && (
        <p className="mb-3 rounded-lg bg-bad/10 px-3 py-2 text-[11px] font-semibold leading-4 text-bad">
          Inscriptions bloquées : les joueurs ne peuvent plus demander de place, ni rejoindre la
          liste d&apos;attente.
        </p>
      )}

      {editing && (
        <div className="mb-3 space-y-3 rounded-lg border border-gold/40 bg-gold/5 p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
                Date
              </label>
              <Input
                type="date"
                value={slot.date}
                onChange={(e) => patch({ date: e.target.value })}
              />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
                Heure
              </label>
              <Select value={slot.time} onChange={(e) => patch({ time: e.target.value })}>
                {TIME_SLOTS.map((sl) => (
                  <option key={sl} value={sl}>
                    {sl}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Terrains
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {MATCH_COURTS.map((c) => (
                <button
                  key={c}
                  disabled={busy}
                  onClick={() => patch({ courts: c })}
                  className={`cursor-pointer rounded-lg border py-2 text-xs font-bold transition-colors ${
                    slot.courts === c
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
              Niveaux visés
            </label>
            <LevelPicker
              selected={slot.levels || []}
              disabled={busy}
              onToggle={(n) =>
                patch({
                  levels: (slot.levels || []).includes(n)
                    ? (slot.levels || []).filter((x) => x !== n)
                    : [...(slot.levels || []), n].sort((a, b) => a - b),
                })
              }
            />
            <p className="mt-1.5 text-[11px] text-mut">
              Le nombre de joueurs ne bouge pas tout seul : ajuste-le au-dessus si le changement de
              terrains l&apos;impose.
            </p>
          </div>
        </div>
      )}

      <RegistrationManager
        regs={regs}
        capacity={slot.capacity}
        knownPlayers={knownPlayers}
        busy={busy}
        onSetStatus={(id: string, status: RegistrationStatus) =>
          act(() => setMatchSlotRegistrationStatus(id, status))
        }
        onRemove={(id: string) => act(() => deleteMatchSlotRegistration(id))}
        onAdd={(name: string) => act(() => addApprovedMatchSlotPlayer(slot.id, name))}
      />
    </div>
  );
}
