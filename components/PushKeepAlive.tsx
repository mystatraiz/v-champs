"use client";

import { useEffect } from "react";
import { notificationPermission } from "@/lib/badge";
import { pushSupported, subscribePush } from "@/lib/push";

// Réenregistre silencieusement l'abonnement push à chaque ouverture de l'app.
// iOS invalide régulièrement les abonnements (mise à jour de la PWA, longue
// inactivité) ; le serveur purge alors l'endpoint mort et, sans ce filet, plus
// aucune notification n'arrive tant que l'utilisateur ne retourne pas appuyer
// sur le bouton d'activation. L'appel est sans effet si rien n'a changé.
export function PushKeepAlive({ role, profileId }: { role?: string; profileId?: string }) {
  useEffect(() => {
    if (!profileId || !pushSupported()) return;
    // Pas de demande de permission ici : uniquement pour ceux qui ont déjà dit oui.
    if (notificationPermission() !== "granted") return;
    subscribePush({ role, profileId });
  }, [role, profileId]);

  return null;
}
