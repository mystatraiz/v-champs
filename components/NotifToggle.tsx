"use client";

import { useEffect, useState } from "react";
import { notificationPermission } from "@/lib/badge";
import { pushSupported, subscribePush } from "@/lib/push";
import { Btn, Card } from "./ui";

// Encart d'activation des notifications push, réutilisable (joueur / en attente).
export function NotifToggle({
  role,
  profileId,
  intro,
}: {
  role?: string;
  profileId?: string;
  intro: string;
}) {
  const [perm, setPerm] = useState("default");
  const [supported, setSupported] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPerm(notificationPermission());
    setSupported(pushSupported());
  }, []);

  async function activate() {
    setBusy(true);
    try {
      const ok = await subscribePush({ role, profileId });
      setPerm(notificationPermission());
      if (!ok && Notification.permission !== "denied") {
        alert(
          "Impossible d'activer les notifications. Ajoute l'app à ton écran d'accueil (Partager → « Sur l'écran d'accueil ») et ouvre-la depuis cette icône."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="mb-3 text-xs leading-5 text-sub">{intro}</p>
      {perm === "unsupported" || !supported ? (
        <p className="text-xs text-mut">
          Les notifications nécessitent d&apos;ouvrir l&apos;app depuis l&apos;icône de l&apos;écran
          d&apos;accueil (Partager → « Sur l&apos;écran d&apos;accueil »).
        </p>
      ) : perm === "granted" ? (
        <div className="text-sm font-bold text-ok">✓ Notifications activées sur cet appareil.</div>
      ) : perm === "denied" ? (
        <p className="text-xs font-semibold text-bad">
          Notifications refusées. Autorise-les dans Réglages iOS → Notifications → V-Champs.
        </p>
      ) : (
        <Btn size="lg" disabled={busy} onClick={activate}>
          {busy ? "Activation…" : "🔔 Activer les notifications"}
        </Btn>
      )}
    </Card>
  );
}
