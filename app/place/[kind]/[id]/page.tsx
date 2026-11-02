"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDateLong } from "@/lib/format";
import { SLOT_NOUN } from "@/lib/offer";
import { notifySpotTaken } from "@/lib/push";
import type { SlotKind } from "@/lib/types";
import { Btn, Card, Loader, Modal } from "@/components/ui";

// Tables lues selon le type de créneau (lecture publique, comme le lien
// d'inscription WhatsApp).
const TABLES: Record<SlotKind, { regs: string; slot: string; fk: string }> = {
  tournament: { regs: "registrations", slot: "tournaments", fk: "tournament_id" },
  lesson: { regs: "lesson_registrations", slot: "lessons", fk: "lesson_id" },
  match: { regs: "match_slot_registrations", slot: "match_slots", fk: "match_slot_id" },
};

interface Offer {
  playerName: string;
  status: string;
  date: string;
  time: string;
  slotStatus: string;
}

type Result = "ok" | "taken" | "already" | "closed" | "invalid";

const RESULT_UI: Record<Result, { icon: string; title: string; text: string }> = {
  ok: {
    icon: "✅",
    title: "C'est bon, la place est à toi !",
    text: "Tu es inscrit(e). À très vite sur le terrain 🎾",
  },
  taken: {
    icon: "😕",
    title: "Trop tard…",
    text: "Malheureusement quelqu'un a répondu avant toi et la place a déjà été prise. Tu restes en liste d'attente : on te prévient si une autre place se libère.",
  },
  already: {
    icon: "👍",
    title: "Tu es déjà inscrit(e)",
    text: "Ta place est confirmée, rien d'autre à faire.",
  },
  closed: {
    icon: "⏱",
    title: "Créneau terminé",
    text: "Ce créneau n'est plus ouvert aux inscriptions.",
  },
  invalid: {
    icon: "🔗",
    title: "Lien plus valable",
    text: "Ce lien ne correspond plus à une inscription en liste d'attente. Contacte un organisateur si besoin.",
  },
};

// Page ouverte depuis le lien WhatsApp « une place s'est libérée ».
export default function ClaimSpot({ params }: { params: Promise<{ kind: string; id: string }> }) {
  const { kind: rawKind, id } = use(params);
  const kind = (rawKind in TABLES ? rawKind : null) as SlotKind | null;
  const [offer, setOffer] = useState<Offer | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    if (!kind) return setOffer(null);
    (async () => {
      const t = TABLES[kind];
      const { data: reg } = await supabase.from(t.regs).select(`player_name, status, ${t.fk}`).eq("id", id).maybeSingle();
      if (!reg) return setOffer(null);
      const r = reg as unknown as Record<string, string>;
      const { data: slot } = await supabase.from(t.slot).select("date, time, status").eq("id", r[t.fk]).maybeSingle();
      if (!slot) return setOffer(null);
      setOffer({
        playerName: r.player_name,
        status: r.status,
        date: slot.date as string,
        time: slot.time as string,
        slotStatus: slot.status as string,
      });
    })().catch(() => setOffer(null));
  }, [kind, id]);

  async function claim() {
    if (!kind || !offer) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("claim_waitlist_spot", { p_kind: kind, p_reg: id });
      const res = (error ? "invalid" : (data as Result)) || "invalid";
      setResult(res in RESULT_UI ? res : "invalid");
      if (res === "ok") {
        setOffer({ ...offer, status: "approved" });
        notifySpotTaken(offer.playerName, kind, offer.date, offer.time);
      }
    } finally {
      setBusy(false);
    }
  }

  if (offer === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader />
      </main>
    );
  }

  const ui = result ? RESULT_UI[result] : null;

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="fade-up w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt="V-Champs" width={90} height={90} className="mb-2" />
          <h1 className="text-xl font-extrabold tracking-wide text-bright">V-CHAMPS</h1>
        </div>

        {!offer || !kind ? (
          <Card className="p-6 text-center">
            <div className="mb-2 text-4xl">🔗</div>
            <p className="text-sm font-semibold text-bad">Ce lien n&apos;est plus valable.</p>
            <Link href="/" className="mt-4 inline-block text-xs font-bold text-gold underline">
              Aller à l&apos;application →
            </Link>
          </Card>
        ) : (
          <Card tone="gold" className="p-6 text-center">
            <div className="mb-2 text-5xl">🎾</div>
            <h2 className="text-lg font-extrabold text-bright">Une place s&apos;est libérée !</h2>
            <p className="mt-1 text-sm text-sub">
              Pour {SLOT_NOUN[kind]} du <b className="text-body">{formatDateLong(offer.date)}</b> à{" "}
              <b className="text-gold">{offer.time}</b>
            </p>
            <p className="mt-3 text-xs text-mut">
              Place proposée à <b className="text-body">{offer.playerName}</b>
            </p>
            {offer.status === "approved" ? (
              <p className="mt-5 rounded-lg bg-ok/10 px-3 py-2.5 text-sm font-bold text-ok">
                ✅ Ta place est confirmée
              </p>
            ) : (
              <>
                <Btn size="lg" className="mt-5" disabled={busy} onClick={claim}>
                  {busy ? "…" : "⚡ Je prends la place"}
                </Btn>
                <p className="mt-2 text-[11px] text-mut">Premier arrivé, premier servi.</p>
              </>
            )}
            <Link href="/player" className="mt-4 inline-block text-xs font-bold text-gold underline">
              Ouvrir l&apos;application →
            </Link>
          </Card>
        )}
      </div>

      <Modal open={!!ui} onClose={() => setResult(null)}>
        {ui && (
          <div className="py-2 text-center">
            <div className="mb-2 text-5xl">{ui.icon}</div>
            <h3 className="mb-2 text-lg font-extrabold text-bright">{ui.title}</h3>
            <p className="text-sm leading-6 text-sub">{ui.text}</p>
            <Btn className="mt-5 w-full" onClick={() => setResult(null)}>
              OK
            </Btn>
          </div>
        )}
      </Modal>
    </main>
  );
}
