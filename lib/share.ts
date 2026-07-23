import { rankTeamsInSession } from "./scoring";
import { formatDateLong, teamLabel } from "./format";
import type { CombinedRankingRow, PlayerSessionScore, SessionHistoryEntry } from "./types";

export function openWhatsApp(text: string): void {
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}

const MEDALS = ["🥇", "🥈", "🥉"];

// Message WhatsApp du classement général V-Champs.
export function formatRankingText(
  rows: CombinedRankingRow[],
  levelFilter: string | null,
  limit = 15
): string {
  const title = levelFilter ? `Classement V-Champs — Niveau ${levelFilter}` : "Classement V-Champs";
  const lines = [`🏆 *${title}*`, ""];
  rows.slice(0, limit).forEach((p, i) => {
    const rank = i < 3 ? MEDALS[i] : `${i + 1}.`;
    lines.push(`${rank} ${p.name} — *${p.score} pts* (${p.v}V)`);
  });
  if (rows.length > limit) lines.push(`… +${rows.length - limit} joueurs`);
  return lines.join("\n");
}

// Message WhatsApp des résultats d'une session.
export function formatSessionText(
  entry: SessionHistoryEntry,
  scores: PlayerSessionScore[]
): string {
  const ranked = rankTeamsInSession(entry.teams || []);
  const lines = [
    `🎾 *Résultats — ${formatDateLong(entry.date)}*`,
    `Niveau ${entry.label || "6/7"}`,
    "",
    "🏆 *Classement*",
  ];
  ranked.forEach((t, i) => {
    const rank = i < 3 ? MEDALS[i] : `${i + 1}.`;
    const pts = (t.wins || 0) * 3 + (t.draws || 0);
    const diff = (t.pointsFor || 0) - (t.pointsAgainst || 0);
    lines.push(`${rank} ${teamLabel(t.name, t.players)} — ${pts} pts (${diff >= 0 ? "+" : ""}${diff})`);
  });

  const pts = scores
    .filter((r) => r.session_id === entry.date)
    .sort((a, b) => a.position - b.position || b.points_earned - a.points_earned);
  if (pts.length) {
    lines.push("", "⭐ *Points V-Champs*");
    pts.forEach((r) => lines.push(`• ${r.player_name} +${r.points_earned}`));
  }
  return lines.join("\n");
}
