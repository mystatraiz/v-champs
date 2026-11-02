// ═══ Place libérée : proposer la place à un joueur en liste d'attente ═══
// L'admin envoie sur WhatsApp un lien personnel ; le joueur l'ouvre et prend
// la place s'il en reste une (fonction claim_waitlist_spot, côté base).

import { formatDateLong } from "./format";
import type { SlotKind } from "./types";

export const SLOT_NOUN: Record<SlotKind, string> = {
  tournament: "le tournoi",
  lesson: "la leçon",
  match: "le match",
};

export function offerUrl(kind: SlotKind, registrationId: string): string {
  return `${window.location.origin}/place/${kind}/${registrationId}`;
}

export function offerMessage(p: {
  kind: SlotKind;
  playerName: string;
  date: string;
  time: string;
  detail?: string; // ex. « niveau 6/7 »
  url: string;
}): string {
  const first = p.playerName.trim().split(/\s+/)[0] || "";
  return [
    `🎾 Bonne nouvelle${first ? ` ${first}` : ""} ! Une place vient de se libérer pour ${SLOT_NOUN[p.kind]} du *${formatDateLong(p.date)}* à *${p.time}*${p.detail ? ` (${p.detail})` : ""}.`,
    ``,
    `⚡ Premier arrivé, premier servi : touche le lien pour prendre la place 👇`,
    p.url,
  ].join("\n");
}

// Lien WhatsApp : vers le numéro du joueur s'il est connu, sinon WhatsApp
// s'ouvre et l'admin choisit le contact.
export function whatsappLink(phone: string | null, text: string): string {
  const t = encodeURIComponent(text);
  if (!phone) return `https://wa.me/?text=${t}`;
  const d = phone.replace(/\D/g, "");
  const intl = d.length === 10 && d.startsWith("0") ? `33${d.slice(1)}` : d;
  return `https://wa.me/${intl}?text=${t}`;
}
