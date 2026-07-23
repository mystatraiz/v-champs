import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isOwner } from "@/lib/owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://shficsyskgqcmtinguum.supabase.co";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoZmljc3lza2dxY210aW5ndXVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDAxOTIsImV4cCI6MjA5NTkxNjE5Mn0.5YL_WesWzAIdpy4CUhIXzFB_YmvxfPpHNIAsMT-mznk";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function genTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans caractères ambigus
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function POST(req: Request) {
  if (!SERVICE_KEY) {
    return NextResponse.json(
      {
        error:
          "Réinitialisation non configurée. Ajoutez la variable SUPABASE_SERVICE_ROLE_KEY dans Vercel (voir README).",
      },
      { status: 501 }
    );
  }

  // 1) Authentifier le demandeur via son token de session
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const anon = createClient(SUPA_URL, ANON_KEY);
  const {
    data: { user: requester },
    error: authErr,
  } = await anon.auth.getUser(token);
  if (authErr || !requester)
    return NextResponse.json({ error: "Session invalide." }, { status: 401 });

  const svc = createClient(SUPA_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 2) Vérifier que le demandeur est admin ou propriétaire
  const { data: prof } = await svc
    .from("profiles")
    .select("role")
    .eq("id", requester.id)
    .maybeSingle();
  const allowed = isOwner(requester.email) || prof?.role === "admin";
  if (!allowed) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  // 3) Réinitialiser le mot de passe du joueur cible
  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const userId = String(body.userId || "");
  if (!userId) return NextResponse.json({ error: "Joueur manquant." }, { status: 400 });

  const password = genTempPassword();
  const { error: upErr } = await svc.auth.admin.updateUserById(userId, { password });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ password });
}
