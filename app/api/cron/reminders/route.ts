import { NextResponse } from "next/server";
import { frDate, getDb, getSubs, sendToSubs } from "@/lib/server-push";
import type { Team } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tâche planifiée quotidienne (Vercel Cron) : rappels aux joueurs pour les
// tournois du lendemain + alerte à l'admin si un tournoi n'est pas complet.
export async function GET(req: Request) {
  // Sécurité optionnelle : si CRON_SECRET est défini, on l'exige.
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const db = getDb();
  const subs = await getSubs(db);
  const admins = subs.filter((s) => s.role !== "player");

  // Date de demain (fuseau France)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toLocaleDateString("en-CA", {
    timeZone: "Europe/Paris",
  });

  const { data: tournaments } = await db
    .from("tournaments")
    .select("*")
    .eq("date", tomorrow)
    .in("status", ["open", "locked"]);

  let reminders = 0;
  let alerts = 0;

  for (const t of tournaments || []) {
    // Joueurs confirmés (demandes acceptées, avec compte)
    const { data: regs } = await db
      .from("registrations")
      .select("profile_id,player_name,status")
      .eq("tournament_id", t.id);
    const approved = (regs || []).filter((r) => r.status === "approved");
    const ids = new Set(approved.map((r) => r.profile_id as string).filter(Boolean));
    const targets = subs.filter((s) => s.profileId && ids.has(s.profileId));

    if (targets.length) {
      reminders += await sendToSubs(db, subs, targets, {
        title: "Rappel : tournoi demain 🎾",
        body: `Ton tournoi ${frDate(t.date)}${t.time ? ` à ${t.time}` : ""} — à demain !`,
        url: "/player",
      });
    }

    // Remplissage : joueurs confirmés (grille + demandes acceptées)
    const gridNames = ((t.teams as Team[] | null) || [])
      .flatMap((tm) => tm.players || [])
      .filter((p) => p && p.trim());
    const confirmed = new Set(
      [...approved.map((r) => r.player_name), ...gridNames].map((n) =>
        String(n).toLowerCase().trim()
      )
    );
    const missing = (t.capacity || 0) - confirmed.size;
    if (missing > 0 && admins.length) {
      alerts += await sendToSubs(db, subs, admins, {
        title: "Remplissage tournoi ⏳",
        body: `Il manque ${missing} joueur${missing > 1 ? "s" : ""} pour le tournoi de demain${t.time ? ` (${t.time})` : ""}.`,
        url: "/admin",
      });
    }
  }

  return NextResponse.json({
    date: tomorrow,
    tournaments: tournaments?.length || 0,
    reminders,
    alerts,
  });
}
