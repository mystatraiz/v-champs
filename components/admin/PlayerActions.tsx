"use client";

import { useState } from "react";
import { adminGetPhone, updateProfile } from "@/lib/store";
import type { Profile } from "@/lib/types";
import { Btn } from "@/components/ui";

// Numéro au format international pour WhatsApp (06… → 336…).
function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, "");
  return d.length === 10 && d.startsWith("0") ? `33${d.slice(1)}` : d;
}
const pretty = (phone: string) => phone.replace(/\D/g, "").replace(/(\d{2})(?=\d)/g, "$1 ");

// Actions admin sur un compte : voir le numéro (appel, SMS, WhatsApp) et
// bloquer / débloquer les inscriptions.
export function PlayerActions({ p, onChanged }: { p: Profile; onChanged: () => void }) {
  const [phone, setPhone] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function showPhone() {
    setLoading(true);
    setErr(null);
    try {
      setPhone(await adminGetPhone(p.id));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Numéro introuvable.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleBlock() {
    const name = `${p.first_name} ${p.last_name}`;
    let reason: string | null = null;
    if (!p.blocked) {
      const r = prompt(
        `Bloquer ${name} ?\n\nIl ne pourra plus s'inscrire aux tournois, leçons et matchs (ses inscriptions déjà faites restent : retire-les si besoin).\n\nRaison (facultatif, visible des admins seulement) :`,
        "Absences sans prévenir"
      );
      if (r === null) return; // annulé
      reason = r.trim() || null;
    } else if (!confirm(`Débloquer ${name} ? Il pourra de nouveau s'inscrire.`)) {
      return;
    }
    setBusy(true);
    try {
      await updateProfile(p.id, { blocked: !p.blocked, blocked_reason: p.blocked ? null : reason });
      onChanged();
    } catch (e) {
      alert(
        e instanceof Error && /blocked/.test(e.message)
          ? "La base n'est pas encore à jour : relance supabase/migration.sql (section 11)."
          : e instanceof Error
            ? e.message
            : "Erreur."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {p.blocked && (
        <div className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-xs text-bad">
          🚫 Bloqué — ne peut plus s&apos;inscrire
          {p.blocked_reason && <span className="text-sub"> · {p.blocked_reason}</span>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {phone ? (
          <>
            <a href={`tel:${phone}`} className="rounded-lg border border-line2 px-2.5 py-1.5 text-xs font-bold text-body">
              📞 {pretty(phone)}
            </a>
            <a href={`sms:${phone}`} className="rounded-lg border border-line2 px-2.5 py-1.5 text-xs font-bold text-sub">
              💬 SMS
            </a>
            <a
              href={`https://wa.me/${waNumber(phone)}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg bg-[#25D366] px-2.5 py-1.5 text-xs font-extrabold text-white"
            >
              WhatsApp
            </a>
          </>
        ) : (
          <Btn size="sm" variant="secondary" disabled={loading} onClick={showPhone}>
            📞 {loading ? "…" : "Voir le numéro"}
          </Btn>
        )}
        <Btn size="sm" variant={p.blocked ? "secondary" : "ghost"} disabled={busy} onClick={toggleBlock}>
          {p.blocked ? "✅ Débloquer" : "🚫 Bloquer"}
        </Btn>
      </div>
      {err && <p className="text-[11px] text-bad">{err}</p>}
    </div>
  );
}
