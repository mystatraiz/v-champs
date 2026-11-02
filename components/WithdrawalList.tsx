"use client";

import { useState } from "react";
import type { Withdrawal } from "@/lib/types";

const when = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const STATUS_WAS: Record<string, string> = {
  approved: "était confirmé",
  waitlist: "était en liste d'attente",
  pending: "demande en attente",
};

// Historique des retraits d'un créneau, en gris et sans bouton d'action :
// un joueur retiré n'est ni confirmé ni en liste d'attente, on ne risque pas
// de le remettre dans la partie par erreur.
export function WithdrawalList({ items }: { items: Withdrawal[] }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="mt-3 rounded-lg border border-line/70 bg-surface/40">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-mut"
      >
        <span>↩︎ Désistements ({items.length})</span>
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="border-t border-line/60 px-3 py-2">
          {items.map((w) => (
            <div key={w.id} className="py-1 text-xs text-mut">
              <span className="text-sub line-through decoration-mut/60">{w.player_name}</span>{" "}
              {w.by_admin ? `retiré par ${w.by_name || "un admin"}` : "s'est désisté"} le {when(w.created_at)}
              {w.was_status && STATUS_WAS[w.was_status] && (
                <span className="text-mut/80"> · {STATUS_WAS[w.was_status]}</span>
              )}
            </div>
          ))}
          <p className="mt-1 text-[10px] leading-4 text-mut">
            Pour remettre un joueur, ajoute-le de nouveau (il repart en fin de liste).
          </p>
        </div>
      )}
    </div>
  );
}
