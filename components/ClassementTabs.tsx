"use client";

import { useMemo, useState } from "react";
import { buildTeamStats } from "@/lib/stats";
import { formatDateShort, teamLabel } from "@/lib/format";
import type { AppData } from "@/lib/store";
import type { SessionHistoryEntry } from "@/lib/types";
import { RankingBoard } from "./RankingBoard";
import { SessionSheet } from "./SessionSheet";
import { Card, EmptyState, SectionTitle } from "./ui";

// Classement à onglets (V-Champs / Équipes / Sessions), partagé admin & joueur.
export function ClassementTabs({
  data,
  highlightPlayer,
  canShare = false,
}: {
  data: AppData;
  highlightPlayer?: string | null;
  canShare?: boolean;
}) {
  const [tab, setTab] = useState<"vchamps" | "equipes" | "sessions">("vchamps");
  const [openSession, setOpenSession] = useState<SessionHistoryEntry | null>(null);

  const teamStats = useMemo(() => buildTeamStats(data.history, data.currentSession), [data]);
  const meKey = highlightPlayer?.toLowerCase().trim();

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-1 rounded-lg bg-surface p-1">
        {(
          [
            ["vchamps", "V-Champs"],
            ["equipes", "Équipes"],
            ["sessions", "Sessions"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`cursor-pointer rounded-md py-2 text-sm font-bold transition-colors ${
              tab === k ? "bg-gold text-ink" : "text-sub hover:text-body"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "vchamps" && (
        <RankingBoard data={data} highlightPlayer={highlightPlayer} canShare={canShare} />
      )}

      {tab === "equipes" && (
        <div>
          <SectionTitle>Classement des équipes (toutes sessions)</SectionTitle>
          {!teamStats.length ? (
            <Card>
              <EmptyState>Aucune donnée.</EmptyState>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
                      <th className="px-3 py-2.5">#</th>
                      <th className="px-2 py-2.5">Équipe</th>
                      <th className="px-2 py-2.5">M</th>
                      <th className="px-2 py-2.5">V</th>
                      <th className="px-2 py-2.5">D</th>
                      <th className="px-2 py-2.5">J+</th>
                      <th className="px-2 py-2.5">J-</th>
                      <th className="px-2 py-2.5">+/-</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamStats.map((t, i) => {
                      const diff = t.jFor - t.jAgainst;
                      const players = t.players.filter(Boolean).join(" / ");
                      return (
                        <tr key={t.name + i} className="border-b border-line/50 last:border-0">
                          <td className="px-3 py-2.5 font-extrabold text-gold">{i + 1}</td>
                          <td className="px-2 py-2.5">
                            <span className="font-bold text-body">{t.name}</span>
                            {t.name !== players && players && (
                              <div className="text-[11px] text-mut">{players}</div>
                            )}
                          </td>
                          <td className="px-2 py-2.5 text-sub">{t.played}</td>
                          <td className="px-2 py-2.5 text-ok">{t.wins}</td>
                          <td className="px-2 py-2.5 text-bad">{t.losses}</td>
                          <td className="px-2 py-2.5 text-sub">{t.jFor}</td>
                          <td className="px-2 py-2.5 text-sub">{t.jAgainst}</td>
                          <td
                            className={`px-2 py-2.5 font-bold ${
                              diff > 0 ? "text-ok" : diff < 0 ? "text-bad" : "text-sub"
                            }`}
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
            </Card>
          )}
        </div>
      )}

      {tab === "sessions" && (
        <div>
          <SectionTitle>Historique des sessions ({data.history.length})</SectionTitle>
          {!data.history.length ? (
            <Card>
              <EmptyState>Aucune session archivée.</EmptyState>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              {[...data.history].reverse().map((s, i, arr) => {
                const winner = [...s.teams].sort(
                  (a, b) =>
                    b.wins * 3 + (b.draws || 0) - (a.wins * 3 + (a.draws || 0)) ||
                    b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst)
                )[0];
                const played =
                  meKey &&
                  (s.teams || []).some((t) =>
                    (t.players || []).some((p) => p?.toLowerCase().trim() === meKey)
                  );
                return (
                  <button
                    key={s.date}
                    onClick={() => setOpenSession(s)}
                    className={`flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-card2 ${
                      i < arr.length - 1 ? "border-b border-line/60" : ""
                    } ${played ? "bg-gold/5" : ""}`}
                  >
                    <span className="w-16 shrink-0 text-xs text-mut">{formatDateShort(s.date)}</span>
                    <span className="shrink-0 rounded bg-card2 px-1.5 py-0.5 text-[10px] font-bold text-sub">
                      {s.label || "6/7"}
                    </span>
                    <span className="flex-1 truncate">
                      🏆{" "}
                      <span className="font-bold text-gold">
                        {winner ? teamLabel(winner.name, winner.players) : ""}
                      </span>
                      {played && (
                        <span className="ml-1 text-[10px] font-bold uppercase text-gold">· tu y étais</span>
                      )}
                    </span>
                    <span className="shrink-0 text-[11px] text-mut">{s.matches.length} matchs</span>
                    <span className="shrink-0 text-mut">›</span>
                  </button>
                );
              })}
            </Card>
          )}
        </div>
      )}

      <SessionSheet
        entry={openSession}
        scores={data.scores}
        onClose={() => setOpenSession(null)}
        canShare={canShare}
      />
    </div>
  );
}
