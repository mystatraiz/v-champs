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

// Abonne l'appareil courant aux notifications push (admin/organisateur).
export async function subscribeAdminPush(role?: string): Promise<boolean> {
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
      role,
    });
    return true;
  } catch {
    return false;
  }
}

// Prévient les admins abonnés (appelé après une inscription ou un nouveau compte).
export async function notifyAdmins(
  type: "registration" | "account",
  name?: string
): Promise<void> {
  try {
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, name }),
      keepalive: true,
    });
  } catch {
    /* l'envoi de notification ne doit jamais bloquer l'action utilisateur */
  }
}
