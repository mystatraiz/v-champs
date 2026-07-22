import { createClient } from "@supabase/supabase-js";

// Le même projet Supabase que la v1 — les deux applications partagent la base.
const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://shficsyskgqcmtinguum.supabase.co";
const SUPA_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoZmljc3lza2dxY210aW5ndXVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDAxOTIsImV4cCI6MjA5NTkxNjE5Mn0.5YL_WesWzAIdpy4CUhIXzFB_YmvxfPpHNIAsMT-mznk";

export const supabase = createClient(SUPA_URL, SUPA_KEY);

// Un numéro de téléphone sert d'identifiant : converti en email interne
// (identique à la v1 → les comptes existants fonctionnent tels quels).
export function phoneToEmail(phone: string): string {
  return phone.replace(/\D/g, "") + "@vchamps.club";
}
