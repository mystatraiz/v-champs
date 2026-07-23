"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { Btn, Card, Input } from "./ui";

// Permet à l'utilisateur connecté de changer son propre mot de passe
// (utile après une réinitialisation par l'admin).
export function ChangePassword() {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit() {
    setMsg(null);
    if (pwd.length < 6) return setMsg({ ok: false, text: "Minimum 6 caractères." });
    if (pwd !== pwd2) return setMsg({ ok: false, text: "Les deux mots de passe ne correspondent pas." });
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setPwd("");
    setPwd2("");
    setMsg({ ok: true, text: "✓ Mot de passe modifié." });
  }

  return (
    <Card className="space-y-2.5 p-4">
      <Input
        type="password"
        placeholder="Nouveau mot de passe"
        value={pwd}
        onChange={(e) => setPwd(e.target.value)}
        autoComplete="new-password"
      />
      <Input
        type="password"
        placeholder="Confirmer le nouveau mot de passe"
        value={pwd2}
        onChange={(e) => setPwd2(e.target.value)}
        autoComplete="new-password"
        onKeyDown={(e) => e.key === "Enter" && submit()}
      />
      {msg && (
        <p className={`text-xs font-semibold ${msg.ok ? "text-ok" : "text-bad"}`}>{msg.text}</p>
      )}
      <Btn size="lg" disabled={busy} onClick={submit}>
        {busy ? "…" : "Changer mon mot de passe"}
      </Btn>
    </Card>
  );
}
