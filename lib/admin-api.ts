import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isOwner } from "@/lib/owner";

// Outils partagés des routes API réservées aux admins : la clé service_role
// vient uniquement des variables d'environnement Vercel, jamais du code.
export const SUPA_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://shficsyskgqcmtinguum.supabase.co";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNoZmljc3lza2dxY210aW5ndXVtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzNDAxOTIsImV4cCI6MjA5NTkxNjE5Mn0.5YL_WesWzAIdpy4CUhIXzFB_YmvxfPpHNIAsMT-mznk";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Vérifie que l'appel vient d'un admin (ou du propriétaire) et renvoie un
// client service_role ; sinon la réponse d'erreur à renvoyer telle quelle.
export async function requireAdmin(
  req: Request
): Promise<{ svc: SupabaseClient } | { error: NextResponse }> {
  if (!SERVICE_KEY) {
    return {
      error: NextResponse.json(
        {
          error:
            "Fonction non configurée. Ajoutez la variable SUPABASE_SERVICE_ROLE_KEY dans Vercel (voir README).",
        },
        { status: 501 }
      ),
    };
  }
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return { error: NextResponse.json({ error: "Non authentifié." }, { status: 401 }) };

  const anon = createClient(SUPA_URL, ANON_KEY);
  const {
    data: { user: requester },
    error: authErr,
  } = await anon.auth.getUser(token);
  if (authErr || !requester)
    return { error: NextResponse.json({ error: "Session invalide." }, { status: 401 }) };

  const svc = createClient(SUPA_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: prof } = await svc.from("profiles").select("role").eq("id", requester.id).maybeSingle();
  if (!(isOwner(requester.email) || prof?.role === "admin"))
    return { error: NextResponse.json({ error: "Accès refusé." }, { status: 403 }) };
  return { svc };
}
