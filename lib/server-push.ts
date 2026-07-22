// Utilitaires d'envoi push côté serveur (routes API uniquement).
import webpush from "web-push";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://shficsyskgqcmtinguum.supabase.co";
const SUPA_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoZmljc3lza2dxY210aW5ndXVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDAxOTIsImV4cCI6MjA5NTkxNjE5Mn0.5YL_WesWzAIdpy4CUhIXzFB_YmvxfPpHNIAsMT-mznk";

const VAPID_PUBLIC =
  process.env.WEBPUSH_VAPID_PUBLIC ??
  "BATMAZ0wA3-iHMgIf1IEiHBEplxM3UO9p7mO1fDTmfpxAFKHjBrblSTJEZwGX-VtvL_SGQcuv-3NfXX4mNETJlo";
const VAPID_PRIVATE =
  process.env.WEBPUSH_VAPID_PRIVATE ?? "izJGRbLtXW50owKKPsfeD33jeS7f9oMDU_8v-gnPAPk";
const VAPID_SUBJECT = process.env.WEBPUSH_SUBJECT ?? "mailto:contact@vchamps.club";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

export interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  role?: string;
  profileId?: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  count?: number;
}

export function getDb(): SupabaseClient {
  return createClient(SUPA_URL, SUPA_KEY);
}

export async function getSubs(db: SupabaseClient): Promise<StoredSub[]> {
  const { data } = await db
    .from("app_state")
    .select("value")
    .eq("key", "push_subscriptions")
    .maybeSingle();
  return ((data?.value as StoredSub[]) || []).filter((s) => s && s.endpoint);
}

// Envoie à `targets`, purge de `all` les abonnements expirés (404/410).
export async function sendToSubs(
  db: SupabaseClient,
  all: StoredSub[],
  targets: StoredSub[],
  payload: PushPayload
): Promise<number> {
  const body = JSON.stringify(payload);
  const dead = new Set<string>();
  await Promise.all(
    targets.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body);
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) dead.add(s.endpoint);
      }
    })
  );
  if (dead.size) {
    await db.from("app_state").upsert({
      key: "push_subscriptions",
      value: all.filter((s) => !dead.has(s.endpoint)),
      updated_at: new Date().toISOString(),
    });
  }
  return targets.length - dead.size;
}

export function frDate(d?: string): string {
  if (!d) return "";
  try {
    const dt = new Date(d.includes("T") ? d : d + "T00:00:00");
    const s = dt.toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return d;
  }
}
