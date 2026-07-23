"use client";

import { useMemo } from "react";
import { rankTeamsInSession } from "@/lib/scoring";
import { formatDateLong, teamLabel } from "@/lib/format";
import type { Match, PlayerSessionScore, SessionHistoryEntry } from "@/lib/types";
import { Badge, Modal, SectionTitle } from "./ui";

function matchScoreStr(m: Match): string {
  if (m.scoreType === "sets" && m.sets) {
    return m.sets
      .filter((s) => s[0] + s[1] > 0)
      .map((s) => `${s[0]}-${s[1]}`)
      .join(" / ");
  }
  return `${m.score1} : ${m.score2}`;
}

// Résultats détaillés d'une session archivée.
export function SessionSheet({
  entry,
  scores,
  onClose,
}: {
  entry: SessionHistoryEntry | null;
  scores: PlayerSessionScore[];
  onClose: () => void;
}) {
  const ranked = useMemo(() => (entry ? rankTeamsInSession(entry.teams || []) : []), [entry]);
  const points = useMemo(() => {
    if (!entry) return [];
    return scores
      .filter((r) => r.session_id === entry.date)
      .sort((a, b) => a.position - b.position || b.points_earned - a.points_earned);
  }, [entry, scores]);

  if (!entry) return null;
  const finished = entry.matches || [];

  return (
    <Modal open={!!entry} onClose={onClose}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-extrabold text-bright">{formatDateLong(entry.date)}</h3>
          <Badge color="gold">Niveau {entry.label || "6/7"}</Badge>
        </div>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg px-2 py-1 text-lg text-mut hover:text-body"
        >
          ✕
        </button>
      </div>

      <SectionTitle>Classement final</SectionTitle>
      <div className="mb-5 overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
              <th className="px-3 py-2">#</th>
              <th className="px-2 py-2">Équipe</th>
              <th className="px-2 py-2">Pts</th>
              <th className="px-2 py-2">V</th>
              <th className="px-2 py-2">N</th>
              <th className="px-2 py-2">D</th>
              <th className="px-2 py-2">+/-</th>
            </tr>
          </thead>
          <tbody>
            {ranked.map((t, i) => {
              const diff = (t.pointsFor || 0) - (t.pointsAgainst || 0);
              const players = (t.players || []).filter(Boolean).join(" / ");
              const label = teamLabel(t.name, t.players);
              return (
                <tr key={t.id} className="border-b border-line/50 last:border-0">
                  <td className="px-3 py-2 font-extrabold text-gold">{i + 1}</td>
                  <td className="px-2 py-2">
                    <span className="font-bold text-body">{label}</span>
                    {label !== players && players && (
                      <div className="text-[11px] text-mut">{players}</div>
                    )}
                  </td>
                  <td className="px-2 py-2 font-extrabold">{(t.wins || 0) * 3 + (t.draws || 0)}</td>
                  <td className="px-2 py-2 text-ok">{t.wins || 0}</td>
                  <td className="px-2 py-2 text-sub">{t.draws || 0}</td>
                  <td className="px-2 py-2 text-bad">{t.losses || 0}</td>
                  <td
                    className={`px-2 py-2 font-bold ${diff > 0 ? "text-ok" : diff < 0 ? "text-bad" : "text-sub"}`}
                  >
                    {diff > 0 ? "+" : ""}
                    {diff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {points.length > 0 && (
        <>
          <SectionTitle>Points V-Champs gagnés</SectionTitle>
          <div className="mb-5 overflow-hidden rounded-xl border border-line">
            {points.map((r, i) => (
              <div
                key={r.player_name + i}
                className={`flex items-center gap-3 px-3.5 py-2 text-sm ${
                  i < points.length - 1 ? "border-b border-line/60" : ""
                }`}
              >
                <span className="w-8 text-xs font-extrabold text-sub">
                  {r.position === 1 ? "1er" : `${r.position}e`}
                </span>
                <span className="flex-1 font-bold">{r.player_name}</span>
                <span className="text-[11px] text-mut">×{r.coefficient.toFixed(2)}</span>
                <span className="font-extrabold text-gold">+{r.points_earned}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <SectionTitle>Matchs ({finished.length})</SectionTitle>
      <div className="overflow-hidden rounded-xl border border-line">
        {finished.length === 0 ? (
          <div className="px-3.5 py-3 text-sm text-mut">Aucun match enregistré.</div>
        ) : (
          finished.map((m, i) => {
            const t1 = entry.teams.find((t) => t.id === m.team1Id);
            const t2 = entry.teams.find((t) => t.id === m.team2Id);
            const w1 = m.score1 > m.score2;
            const w2 = m.score2 > m.score1;
            return (
              <div
                key={m.id ?? i}
                className={`flex items-center gap-2 px-3.5 py-2 text-[13px] ${
                  i < finished.length - 1 ? "border-b border-line/60" : ""
                }`}
              >
                <span className="w-12 shrink-0 text-[10px] font-bold text-mut">
                  T{m.court} R{m.roundNum}
                </span>
                <span className={`flex-1 truncate text-right ${w1 ? "font-bold text-gold" : "text-sub"}`}>
                  {(t1?.players || []).filter(Boolean).join(" / ") || "?"}
                </span>
                <span className="shrink-0 px-1 font-mono text-xs text-mut">{matchScoreStr(m)}</span>
                <span className={`flex-1 truncate ${w2 ? "font-bold text-gold" : "text-sub"}`}>
                  {(t2?.players || []).filter(Boolean).join(" / ") || "?"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </Modal>
  );
}
