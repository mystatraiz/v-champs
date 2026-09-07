"use client";

import { useState } from "react";
import type { RegistrationStatus } from "@/lib/types";
import { PlayerAutocomplete } from "./PlayerAutocomplete";
import { Btn } from "./ui";

// Forme minimale commune aux inscriptions de leçons et de créneaux de match.
export interface SlotRegistration {
  id: string;
  player_name: string;
  status: RegistrationStatus;
  is_guest: boolean;
}

// Gestion des inscriptions d'un créneau : demandes à valider, joueurs confirmés,
// liste d'attente numérotée par ordre d'arrivée, et ajout manuel d'un joueur.
// Partagé par les leçons et les créneaux de match.
export function RegistrationManager({
  regs,
  capacity,
  knownPlayers,
  busy,
  onSetStatus,
  onRemove,
  onAdd,
}: {
  regs: SlotRegistration[];
  capacity: number;
  knownPlayers: string[];
  busy: boolean;
  onSetStatus: (id: string, status: RegistrationStatus) => void;
  onRemove: (id: string) => void;
  onAdd: (name: string) => void;
}) {
  const [manual, setManual] = useState("");

  const pending = regs.filter((r) => r.status === "pending");
  const approved = regs.filter((r) => r.status === "approved");
  const waitlist = regs.filter((r) => r.status === "waitlist");
  const full = approved.length >= capacity;

  function add(name = manual) {
    const n = name.trim();
    if (!n) return;
    onAdd(n);
    setManual("");
  }

  const heading = (text: string) => (
    <div className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-mut">{text}</div>
  );

  return (
    <>
      {pending.length > 0 && (
        <div className="mb-3">
          {heading(`Demandes (${pending.length})`)}
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
                  onClick={() => onSetStatus(r.id, full ? "waitlist" : "approved")}
                >
                  {full ? "⏳ Attente" : "✓ Valider"}
                </Btn>
                <Btn
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onSetStatus(r.id, "declined")}
                >
                  ✕
                </Btn>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-3">
        {heading(`Confirmés (${approved.length}/${capacity})`)}
        {!approved.length ? (
          <p className="text-xs text-mut">Personne pour le moment.</p>
        ) : (
          <div className="space-y-1.5">
            {approved.map((r) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-body">
                  ✓ {r.player_name}
                </span>
                <Btn size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(r.id)}>
                  ✕
                </Btn>
              </div>
            ))}
          </div>
        )}
      </div>

      {waitlist.length > 0 && (
        <div className="mb-3">
          {heading(`Liste d'attente (${waitlist.length}) — par ordre d'arrivée`)}
          <div className="space-y-1.5">
            {waitlist.map((r, i) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-card2 text-[11px] font-extrabold text-sub">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-sub">{r.player_name}</span>
                <Btn
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => onSetStatus(r.id, "approved")}
                >
                  ↑ Faire monter
                </Btn>
                <Btn size="sm" variant="ghost" disabled={busy} onClick={() => onRemove(r.id)}>
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
          onPick={(n) => add(n)}
          options={knownPlayers}
          exclude={regs.map((r) => r.player_name)}
          placeholder="Ajouter un joueur…"
        />
        <Btn size="sm" variant="secondary" disabled={busy || !manual.trim()} onClick={() => add()}>
          + Ajouter
        </Btn>
      </div>
    </>
  );
}
