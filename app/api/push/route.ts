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
  profileId?: string;
}

interface Body {
  type?: string;
  name?: string;
  profileId?: string;
  title?: string;
  body?: string;
}

export async function POST(req: Request) {
  const db = createClient(SUPA_URL, SUPA_KEY);
  const body = (await req.json().catch(() => ({}))) as Body;

  const { data } = await db
    .from("app_state")
    .select("value")
    .eq("key", "push_subscriptions")
    .maybeSingle();
  const subs = ((data?.value as StoredSub[]) || []).filter((s) => s && s.endpoint);

  let targets: StoredSub[];
  let payloadObj: { title: string; body: string; url: string; count?: number };

  if (body.type === "player") {
    // Notification adressée à un joueur précis (tous ses appareils).
    const pid = String(body.profileId || "");
    if (!pid) return NextResponse.json({ sent: 0 });
    targets = subs.filter((s) => s.profileId === pid);
    payloadObj = {
      title: (body.title || "V-Champs").slice(0, 80),
      body: (body.body || "").slice(0, 160),
      url: "/player",
    };
  } else {
    // Broadcast aux admins/organisateurs (jamais aux joueurs).
    const type = body.type === "account" ? "account" : "registration";
    const [regsRes, accsRes] = await Promise.all([
      db.from("registrations").select("*", { count: "exact", head: true }).eq("status", "pending"),
      db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "pending"),
    ]);
    const total = (regsRes.count || 0) + (accsRes.count || 0);
    targets = subs.filter((s) => s.role !== "player");
    payloadObj = {
      title: type === "account" ? "Nouveau compte à valider" : "Nouvelle demande d'inscription",
      body: body.name
        ? String(body.name).slice(0, 60)
        : type === "account"
          ? "Un joueur attend la validation de son compte."
          : "Un joueur veut rejoindre une partie.",
      count: total,
      url: "/admin",
    };
  }

  const payload = JSON.stringify(payloadObj);
  const dead = new Set<string>();

  await Promise.all(
    targets.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payload);
      } catch (e) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) dead.add(s.endpoint); // abonnement expiré
      }
    })
  );

  if (dead.size) {
    await db.from("app_state").upsert({
      key: "push_subscriptions",
      value: subs.filter((s) => !dead.has(s.endpoint)),
      updated_at: new Date().toISOString(),
    });
  }

  return NextResponse.json({ sent: targets.length - dead.size });
}
