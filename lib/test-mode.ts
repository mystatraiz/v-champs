"use client";

// Mode test (bac à sable) — activé par appareil (localStorage), réservé au
// propriétaire. En mode test, toutes les données passent par des clés dédiées
// « test_… » : rien ne touche les données réelles.
const KEY = "vchamps_test_mode";

export function isTestMode(): boolean {
  if (typeof localStorage === "undefined") return false;
  return localStorage.getItem(KEY) === "1";
}

export function setTestMode(on: boolean): void {
  if (typeof localStorage === "undefined") return;
  if (on) localStorage.setItem(KEY, "1");
  else localStorage.removeItem(KEY);
}

// Préfixe une clé app_state selon le mode courant.
export function nsKey(base: string): string {
  return isTestMode() ? `test_${base}` : base;
}
