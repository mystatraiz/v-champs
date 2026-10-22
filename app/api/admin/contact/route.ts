import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Numéro de téléphone d'un joueur (admins uniquement). Le numéro sert
// d'identifiant de connexion : il est stocké dans l'email interne du compte
// « <chiffres>@vchamps.club », lisible seulement côté serveur.
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if ("error" in auth) return auth.error;

  const body = (await req.json().catch(() => ({}))) as { userId?: string };
  const userId = String(body.userId || "");
  if (!userId) return NextResponse.json({ error: "Joueur manquant." }, { status: 400 });

  const { data, error } = await auth.svc.auth.admin.getUserById(userId);
  if (error || !data.user) return NextResponse.json({ error: "Compte introuvable." }, { status: 404 });

  const email = data.user.email || "";
  const m = email.match(/^(\d{8,})@vchamps\.club$/);
  const phone = m ? m[1] : data.user.phone || null;
  if (!phone)
    return NextResponse.json({ error: "Pas de numéro : ce compte n'a pas été créé avec un téléphone." }, { status: 404 });
  return NextResponse.json({ phone });
}
