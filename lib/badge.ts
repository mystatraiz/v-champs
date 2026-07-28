"use client";

// Badge sur l'icône de l'app (Badging API). Sur iOS, nécessite que l'app soit
// installée sur l'écran d'accueil et que les notifications soient autorisées.

export function badgingSupported(): boolean {
  return typeof navigator !== "undefined" && "setAppBadge" in navigator;
}

export function updateAppBadge(count: number): void {
  try {
    if (!badgingSupported()) return;
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0) nav.setAppBadge?.(count);
    else nav.clearAppBadge?.();
  } catch {
    /* non supporté / non installé : on ignore silencieusement */
  }
}

// L'app tourne-t-elle depuis l'icône de l'écran d'accueil (et non un onglet) ?
// Sur iOS, seul `navigator.standalone` répond ; ailleurs c'est le media query.
export function isStandalone(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const nav = navigator as Navigator & { standalone?: boolean };
    return window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
  } catch {
    return false;
  }
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

// Doit être appelé depuis un geste utilisateur (obligatoire sur iOS Safari).
export async function enableNotifications(): Promise<boolean> {
  try {
    if (typeof Notification === "undefined") return false;
    if (Notification.permission === "granted") return true;
    const p = await Notification.requestPermission();
    return p === "granted";
  } catch {
    return false;
  }
}
