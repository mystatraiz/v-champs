import { NextResponse } from "next/server";
import { levelsOfLabel } from "@/lib/levels";
import { frDate, getDb, getSubs, sendToSubs, type StoredSub } from "@/lib/server-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  type?: string;
  name?: string;
  profileId?: string;
  title?: string;
  body?: string;
  level?: string;
  levels?: number[];
  kind?: string;
  date?: string;
  time?: string;
  tournamentId?: string;
  results?: { name: string; points: number; rank?: number }[];
}

export async function POST(req: Request) {
  const db = getDb();
  const body = (await req.json().catch(() => ({}))) as Body;
  const subs = await getSubs(db);
  const admins = subs.filter((s) => s.role !== "player");

  const j = (sent: number) => NextResponse.json({ sent });

  // ── Notification à un joueur précis ──
  if (body.type === "player") {
    const pid = String(body.profileId || "");
    if (!pid) return j(0);
    const targets = subs.filter((s) => s.profileId === pid);
    return j(
      await sendToSubs(db, subs, targets, {
        title: (body.title || "V-Champs").slice(0, 80),
        body: (body.body || "").slice(0, 160),
        url: "/player",
      })
    );
  }

  // ── Nouveau tournoi → joueurs du bon niveau (ou sans niveau défini) ──
  if (body.type === "new-tournament") {
    const level = String(body.level || "");
    const lvls = levelsOfLabel(level);
    const { data: profs } = await db.from("profiles").select("id,level,role").eq("role", "player");
    const eligible = new Set(
      (profs || [])
        .filter((p) => p.level == null || lvls.includes(p.level as number))
        .map((p) => p.id as string)
    );
    const targets = subs.filter((s) => s.role === "player" && s.profileId && eligible.has(s.profileId));
    return j(
      await sendToSubs(db, subs, targets, {
        title: "Nouveau tournoi 🎾",
        body: `Niveau ${level} — ${frDate(body.date)}${body.time ? ` à ${body.time}` : ""}. Inscris-toi vite !`,
        url: "/player",
      })
    );
  }

  // ── Nouvelle leçon → joueurs des niveaux ciblés (liste vide = tous) ──
  if (body.type === "new-lesson") {
    const lvls = Array.isArray(body.levels) ? body.levels : [];
    const { data: profs } = await db.from("profiles").select("id,level,role").eq("role", "player");
    const eligible = new Set(
      (profs || [])
        .filter((p) => !lvls.length || p.level == null || lvls.includes(p.level as number))
        .map((p) => p.id as string)
    );
    const targets = subs.filter(
      (s) => s.role === "player" && s.profileId && eligible.has(s.profileId)
    );
    const kindLabel = body.kind === "panier" ? "Panier" : "Phases de jeu";
    return j(
      await sendToSubs(db, subs, targets, {
        title: "Nouvelle leçon 🎓",
        body: `${kindLabel} — ${frDate(body.date)}${body.time ? ` à ${body.time}` : ""}. Réserve ta place !`,
        url: "/player",
      })
    );
  }

  // ── Une place s'est libérée → joueurs en liste d'attente ──
  if (body.type === "spot-freed") {
    const tid = String(body.tournamentId || "");
    if (!tid) return j(0);
    const { data: regs } = await db
      .from("registrations")
      .select("profile_id")
      .eq("tournament_id", tid)
      .eq("status", "waitlist");
    const ids = new Set((regs || []).map((r) => r.profile_id as string).filter(Boolean));
    const targets = subs.filter((s) => s.profileId && ids.has(s.profileId));
    return j(
      await sendToSubs(db, subs, targets, {
        title: "Une place s'est libérée 🎾",
        body: `Une place vient de se libérer${body.date ? ` pour le tournoi du ${frDate(body.date)}` : ""}. Vite, confirme la tienne !`,
        url: "/player",
      })
    );
  }

  // ── Résultats de session → chaque joueur reçoit son bilan ──
  if (body.type === "session-results") {
    const results = Array.isArray(body.results) ? body.results : [];
    const { data: profs } = await db
      .from("profiles")
      .select("id,linked_player_name")
      .eq("role", "player");
    let sent = 0;
    for (const r of results) {
      const key = String(r.name || "").toLowerCase().trim();
      if (!key) continue;
      const ids = new Set(
        (profs || [])
          .filter((p) => p.linked_player_name && String(p.linked_player_name).toLowerCase().trim() === key)
          .map((p) => p.id as string)
      );
      const targets = subs.filter((s) => s.profileId && ids.has(s.profileId));
      if (!targets.length) continue;
      sent += await sendToSubs(db, subs, targets, {
        title: "Résultats de session 🏆",
        body: `+${r.points} pts V-Champs${r.rank ? ` — tu es ${r.rank}e au classement` : ""} !`,
        url: "/player",
      });
    }
    return j(sent);
  }

  // ── Tournoi complet → admins ──
  if (body.type === "tournament-full") {
    return j(
      await sendToSubs(db, subs, admins, {
        title: "Tournoi complet ✅",
        body: `Le tournoi du ${frDate(body.date)}${body.time ? ` (${body.time})` : ""} est complet.`,
        url: "/admin",
      })
    );
  }

  // ── Désistement → admins ──
  if (body.type === "withdrawal") {
    return j(
      await sendToSubs(db, subs, admins, {
        title: "Désistement ⚠️",
        body: `${(body.name || "Un joueur").slice(0, 40)} s'est désinscrit du tournoi du ${frDate(body.date)}${body.time ? ` (${body.time})` : ""}.`,
        url: "/admin",
      })
    );
  }

  // ── Broadcast admin par défaut : nouvelle demande / nouveau compte ──
  const type = body.type === "account" ? "account" : "registration";
  const [regsRes, lessonRegsRes, accsRes] = await Promise.all([
    db.from("registrations").select("*", { count: "exact", head: true }).eq("status", "pending"),
    db
      .from("lesson_registrations")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending"),
    db.from("profiles").select("*", { count: "exact", head: true }).eq("role", "pending"),
  ]);
  const total = (regsRes.count || 0) + (lessonRegsRes.count || 0) + (accsRes.count || 0);
  const sent = await sendToSubs(db, subs, admins, {
    title: type === "account" ? "Nouveau compte à valider" : "Nouvelle demande d'inscription",
    body: body.name
      ? String(body.name).slice(0, 60)
      : type === "account"
        ? "Un joueur attend la validation de son compte."
        : "Un joueur veut rejoindre une partie.",
    count: total,
    url: "/admin",
  });
  return NextResponse.json({ sent, total });
}
