import { rankTeamsInSession } from "./scoring";
import { lessonKind, lessonLevelsLabel } from "./lessons";
import { formatDateLong, teamLabel } from "./format";
import type {
  CombinedRankingRow,
  Lesson,
  Match,
  PlayerSessionScore,
  SessionHistoryEntry,
} from "./types";

function matchScoreStr(m: Match): string {
  if (m.scoreType === "sets" && m.sets) {
    return m.sets
      .filter((s) => s[0] + s[1] > 0)
      .map((s) => `${s[0]}-${s[1]}`)
      .join("/");
  }
  return `${m.score1}-${m.score2}`;
}

export function openWhatsApp(text: string): void {
  window.open("https://wa.me/?text=" + encodeURIComponent(text), "_blank");
}

// Adresse de l'appli (l'origine courante = l'URL de production quand on y accède).
function appUrl(): string {
  return typeof window !== "undefined" ? window.location.origin : "";
}

// Invitation à rejoindre l'appli, ajoutée en fin de message partagé.
function callToAction(): string[] {
  const url = appUrl();
  if (!url) return [];
  return ["", "🎾 Rejoins V-Champs, suis le classement et inscris-toi aux tournois :", url];
}

const MEDALS = ["🥇", "🥈", "🥉"];
const PLAYER_EMOJIS = ["🎾", "🏅", "⚡", "🔥", "💪", "🎯", "🌟", "👊"];

// Message WhatsApp d'annonce d'une leçon.
export function formatLessonText(lesson: Lesson, confirmedNames: string[]): string {
  const k = lessonKind(lesson.kind);
  const free = Math.max(0, lesson.capacity - confirmedNames.length);
  const locked = lesson.status === "locked";
  const url = appUrl();

  const lines: (string | null)[] = [
    `🎓 *Leçon — ${k.label}*`,
    "",
    `📅 *${formatDateLong(lesson.date)}*`,
    `⏰ *${lesson.time}*`,
    `🎯 ${lessonLevelsLabel(lesson.levels)}`,
    `🏟 ${lesson.courts} terrain${lesson.courts > 1 ? "s" : ""} · ${lesson.capacity} place${
      lesson.capacity > 1 ? "s" : ""
    }`,
    "",
    confirmedNames.length ? `👥 *Inscrits (${confirmedNames.length}/${lesson.capacity}) :*` : null,
    ...confirmedNames.map((p, i) => `${PLAYER_EMOJIS[i % PLAYER_EMOJIS.length]} ${p}`),
    confirmedNames.length ? "" : null,
    locked
      ? "🔒 *Leçon fermée — inscriptions closes*"
      : free === 0
        ? "🔴 *Complet !*"
        : `🟢 *${free} place${free > 1 ? "s" : ""} disponible${free > 1 ? "s" : ""}*`,
  ];

  if (!locked && free > 0 && url) {
    lines.push("", `👉 Réserve ta place sur V-Champs : ${url}`);
  }
  return lines.filter((l) => l !== null).join("\n");
}

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
  lines.push(...callToAction());
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

  const matches = entry.matches || [];
  if (matches.length) {
    lines.push("", "🎯 *Matchs*");
    matches
      .slice()
      .sort((a, b) => (a.roundNum || 0) - (b.roundNum || 0) || (a.court || 0) - (b.court || 0))
      .forEach((m) => {
        const t1 = entry.teams.find((t) => t.id === m.team1Id);
        const t2 = entry.teams.find((t) => t.id === m.team2Id);
        const n1 = (t1?.players || []).filter(Boolean).join("/") || "?";
        const n2 = (t2?.players || []).filter(Boolean).join("/") || "?";
        lines.push(`R${m.roundNum} · ${n1} ${matchScoreStr(m)} ${n2}`);
      });
  }

  const pts = scores
    .filter((r) => r.session_id === entry.date)
    .sort((a, b) => a.position - b.position || b.points_earned - a.points_earned);
  if (pts.length) {
    lines.push("", "⭐ *Points V-Champs*");
    pts.forEach((r) => lines.push(`• ${r.player_name} +${r.points_earned}`));
  }
  lines.push(...callToAction());
  return lines.join("\n");
}
