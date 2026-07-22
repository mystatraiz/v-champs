"use client";

import { VAPID_PUBLIC_KEY } from "./push-config";
import { savePushSubscription } from "./store";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function registerSW(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js");
  } catch {
    return null;
  }
}

// Abonne l'appareil courant aux notifications push. On rattache le rôle et,
// pour un joueur, son identifiant de compte (pour un ciblage individuel).
export async function subscribePush(
  opts: { role?: string; profileId?: string } = {}
): Promise<boolean> {
  if (!pushSupported()) return false;
  if (Notification.permission !== "granted") {
    const p = await Notification.requestPermission();
    if (p !== "granted") return false;
  }
  const reg = await registerSW();
  if (!reg) return false;
  try {
    await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }
    const json = sub.toJSON();
    if (!json.keys?.p256dh || !json.keys?.auth) return false;
    await savePushSubscription({
      endpoint: sub.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
      role: opts.role,
      profileId: opts.profileId,
    });
    return true;
  } catch {
    return false;
  }
}

// Raccourcis
export const subscribeAdminPush = (role?: string) => subscribePush({ role });
export const subscribePlayerPush = (profileId: string) => subscribePush({ role: "player", profileId });

// Envoi générique vers la route serveur (jamais bloquant).
async function post(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* l'envoi de notification ne doit jamais bloquer l'action utilisateur */
  }
}

// Admins : nouvelle demande d'inscription / nouveau compte.
export const notifyAdmins = (type: "registration" | "account", name?: string) =>
  post({ type, name });

// Un joueur précis (compte validé, inscription confirmée, demande refusée…).
export const notifyPlayer = (profileId: string, title: string, body: string) =>
  post({ type: "player", profileId, title, body });

// Nouveau tournoi → joueurs du bon niveau.
export const notifyNewTournament = (level: string, date: string, time: string) =>
  post({ type: "new-tournament", level, date, time });

// Place libérée → joueurs en liste d'attente du tournoi.
export const notifySpotFreed = (tournamentId: string, date: string) =>
  post({ type: "spot-freed", tournamentId, date });

// Désistement → admins.
export const notifyWithdrawal = (name: string, date: string, time: string) =>
  post({ type: "withdrawal", name, date, time });

// Tournoi complet → admins.
export const notifyTournamentFull = (date: string, time: string) =>
  post({ type: "tournament-full", date, time });

// Résultats de session → chaque joueur son bilan.
export const notifySessionResults = (
  results: { name: string; points: number; rank?: number }[]
) => post({ type: "session-results", results });
