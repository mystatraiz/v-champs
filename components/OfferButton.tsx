"use client";

import { useState } from "react";
import { adminGetPhone } from "@/lib/store";
import { whatsappLink } from "@/lib/offer";
import { Btn } from "./ui";

// « Proposer la place » à un joueur en liste d'attente. En deux temps : on
// récupère son numéro, puis un vrai lien WhatsApp à toucher (Safari bloque
// l'ouverture d'une fenêtre qui n'est pas directement déclenchée par un toucher).
export function OfferButton({
  profileId,
  message,
  disabled,
}: {
  profileId: string | null;
  message: () => string;
  disabled?: boolean;
}) {
  const [href, setHref] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function prepare() {
    setLoading(true);
    setNote(null);
    let phone: string | null = null;
    if (profileId) {
      try {
        phone = await adminGetPhone(profileId);
      } catch {
        setNote("Numéro introuvable : choisis le contact dans WhatsApp.");
      }
    } else {
      setNote("Invité sans compte : choisis le contact dans WhatsApp.");
    }
    setHref(whatsappLink(phone, message()));
    setLoading(false);
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
  return (
    <Btn size="sm" variant="secondary" disabled={disabled || loading} onClick={prepare} title="Proposer la place libérée sur WhatsApp">
      {loading ? "…" : "📲 Proposer"}
    </Btn>
  );
}
