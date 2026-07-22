import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

interface StoredSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  role?: string;
}

export async function POST(req: Request) {
  const db = createClient(SUPA_URL, SUPA_KEY);
  const body = await req.json().catch(() => ({}) as { type?: string; name?: string });
  const type = body.type === "account" ? "account" : "registration";

  // Nombre réel d'actions en attente (sert au badge + évite d'envoyer dans le vide)
  const [regsRes, accsRes] = await Promise.all([
    db.from("registrations").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "pending"),
  ]);
  const total = (regsRes.count || 0) + (accsRes.count || 0);

  const title =
    type === "account" ? "Nouveau compte à valider" : "Nouvelle demande d'inscription";
  const text = body.name
    ? String(body.name).slice(0, 60)
    : type === "account"
      ? "Un joueur attend la validation de son compte."
      : "Un joueur veut rejoindre une partie.";

  const { data } = await db
    .from("app_state")
    .select("value")
    .eq("key", "push_subscriptions")
    .maybeSingle();
  const subs = ((data?.value as StoredSub[]) || []).filter((s) => s && s.endpoint);

  const payload = JSON.stringify({ title, body: text, count: total, url: "/admin" });
  const alive: StoredSub[] = [];

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: s.keys },
          payload
        );
        alive.push(s);
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        // 404/410 = abonnement expiré → on le retire ; sinon on le garde
        if (code !== 404 && code !== 410) alive.push(s);
      }
    })
  );

  if (alive.length !== subs.length) {
    await db.from("app_state").upsert({
      key: "push_subscriptions",
      value: alive,
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ sent: alive.length, total });
}
