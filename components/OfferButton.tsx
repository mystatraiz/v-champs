"use client";

import { useState } from "react";
import {
  adminGetPhone,
  findProfileIdByPlayerName,
  linkRegistrationProfile,
  listProfiles,
} from "@/lib/store";
import { whatsappLink } from "@/lib/offer";
import type { Profile, SlotKind } from "@/lib/types";
import { Btn } from "./ui";

const label = (p: Profile) =>
  `${p.first_name} ${p.last_name}${p.linked_player_name ? ` (${p.linked_player_name})` : ""}`;

// « Proposer la place » à un joueur en liste d'attente. En deux temps : on
// récupère son numéro, puis un vrai lien WhatsApp à toucher (Safari bloque
// l'ouverture d'une fenêtre qui n'est pas directement déclenchée par un toucher).
// Inscription sans compte rattaché (ajout manuel) : le compte est retrouvé par
// le nom de joueur, ou choisi dans la liste ; il est alors mémorisé.
export function OfferButton({
  kind,
  registrationId,
  playerName,
  profileId,
  message,
  disabled,
}: {
  kind: SlotKind;
  registrationId: string;
  playerName: string;
  profileId: string | null;
  message: () => string;
  disabled?: boolean;
}) {
  const [href, setHref] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [choices, setChoices] = useState<Profile[] | null>(null);

  async function finish(pid: string | null) {
    let phone: string | null = null;
    if (pid) {
      try {
        phone = await adminGetPhone(pid);
      } catch {
        setNote("Numéro introuvable : choisis le contact dans WhatsApp.");
      }
    } else {
      setNote("Sans compte : choisis le contact dans WhatsApp.");
    }
    setHref(whatsappLink(phone, message()));
  }

  async function prepare() {
    setLoading(true);
    setNote(null);
    try {
      let pid = profileId;
      if (!pid) {
        pid = await findProfileIdByPlayerName(playerName);
        if (pid) await linkRegistrationProfile(kind, registrationId, pid).catch(() => {});
      }
      if (pid) return await finish(pid);
      // Compte introuvable par le nom : l'admin le choisit.
      const all = await listProfiles().catch(() => [] as Profile[]);
      setChoices(
        all
          .filter((p) => p.role !== "pending")
          .sort((a, b) => label(a).localeCompare(label(b), "fr"))
      );
    } finally {
      setLoading(false);
    }
  }

  async function pick(value: string) {
    setChoices(null);
    setLoading(true);
    try {
      if (value) await linkRegistrationProfile(kind, registrationId, value).catch(() => {});
      await finish(value || null);
    } finally {
      setLoading(false);
    }
  }

  if (href) {
    return (
      <span className="flex flex-col items-end gap-0.5">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          onClick={() => setTimeout(() => setHref(null), 500)}
          className="rounded-lg bg-[#25D366] px-2.5 py-1.5 text-xs font-extrabold text-white"
        >
          📲 Envoyer
        </a>
        {note && <span className="max-w-[160px] text-end text-[9px] leading-3 text-mut">{note}</span>}
      </span>
    );
  }
  if (choices) {
    return (
      <select
        autoFocus
        defaultValue="__"
        onChange={(e) => pick(e.target.value)}
        className="max-w-[150px] rounded-lg border border-gold/60 bg-surface px-2 py-1.5 text-xs text-body"
      >
        <option value="__" disabled>
          Quel compte ?
        </option>
        <option value="">— Pas de compte</option>
        {choices.map((p) => (
          <option key={p.id} value={p.id}>
            {label(p)}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Btn size="sm" variant="secondary" disabled={disabled || loading} onClick={prepare} title="Proposer la place libérée sur WhatsApp">
      {loading ? "…" : "📲 Proposer"}
    </Btn>
  );
}
