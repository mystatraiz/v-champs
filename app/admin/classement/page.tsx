"use client";

import { useMemo, useState } from "react";
import { useAppData } from "@/lib/use-app-data";
import { buildTeamStats } from "@/lib/stats";
import { formatDateShort } from "@/lib/format";
import { RankingBoard } from "@/components/RankingBoard";
import { Card, EmptyState, Loader, SectionTitle } from "@/components/ui";

export default function AdminClassement() {
  const { data, loading } = useAppData();
  const [tab, setTab] = useState<"vchamps" | "equipes" | "sessions">("vchamps");

  const teamStats = useMemo(
    () => (data ? buildTeamStats(data.history, data.currentSession) : []),
    [data]
  );

  if (loading || !data) return <Loader />;

  return (
    <div className="fade-up">
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

      {tab === "vchamps" && <RankingBoard data={data} />}

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
                      return (
                        <tr key={t.name} className="border-b border-line/50 last:border-0">
                          <td className="px-3 py-2.5 font-extrabold text-gold">{i + 1}</td>
                          <td className="px-2 py-2.5">
                            <span className="font-bold text-body">{t.name}</span>
                            <div className="text-[11px] text-mut">
                              {t.players.filter(Boolean).join(" / ")}
                            </div>
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
                return (
                  <div
                    key={s.date}
                    className={`flex items-center gap-3 px-4 py-3 text-sm ${
                      i < arr.length - 1 ? "border-b border-line/60" : ""
                    }`}
                  >
                    <span className="w-16 text-xs text-mut">{formatDateShort(s.date)}</span>
                    <span className="rounded bg-card2 px-1.5 py-0.5 text-[10px] font-bold text-sub">
                      {s.label || "6/7"}
                    </span>
                    <span className="flex-1 truncate">
                      🏆 <span className="font-bold text-gold">{winner?.name}</span>{" "}
                      <span className="text-[11px] text-mut">
                        {winner?.players.filter(Boolean).join(" / ")}
                      </span>
                    </span>
                    <span className="text-[11px] text-mut">{s.matches.length} matchs</span>
                  </div>
                );
              })}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
