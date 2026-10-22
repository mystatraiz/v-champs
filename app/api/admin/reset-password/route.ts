import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function genTempPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // sans caractères ambigus
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;
  const svc = auth.svc;

  // Réinitialiser le mot de passe du joueur cible
  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const userId = String(body.userId || "");
  if (!userId) return NextResponse.json({ error: "Joueur manquant." }, { status: 400 });

  const password = genTempPassword();
  const { error: upErr } = await svc.auth.admin.updateUserById(userId, { password });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ password });
}
