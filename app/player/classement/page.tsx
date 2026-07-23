"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/use-app-data";
import { formatDateShort, teamLabel } from "@/lib/format";
import { RankingBoard } from "@/components/RankingBoard";
import { SessionSheet } from "@/components/SessionSheet";
import { Card, EmptyState, Loader, SectionTitle } from "@/components/ui";
import type { SessionHistoryEntry } from "@/lib/types";

export default function PlayerClassement() {
  const { profile } = useAuth();
  const { data, loading } = useAppData();
  const [openSession, setOpenSession] = useState<SessionHistoryEntry | null>(null);

  if (loading || !data) return <Loader />;

  const meKey = profile?.linked_player_name?.toLowerCase().trim();

  return (
    <div className="fade-up space-y-6">
      <div>
        <SectionTitle>Classement général V-Champs</SectionTitle>
        <RankingBoard data={data} highlightPlayer={profile?.linked_player_name} />
      </div>

      <div>
        <SectionTitle>Historique des sessions</SectionTitle>
        {!data.history.length ? (
          <Card>
            <EmptyState>Aucune session archivée.</EmptyState>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {[...data.history].reverse().map((s, i, arr) => {
              const winner = [...s.teams].sort(
                (a, b) =>
                  b.wins * 3 +
                  (b.draws || 0) -
                  (a.wins * 3 + (a.draws || 0)) ||
                  b.pointsFor - b.pointsAgainst - (a.pointsFor - a.pointsAgainst)
              )[0];
              // Le joueur a-t-il participé à cette session ?
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
                  <span className="shrink-0 text-mut">›</span>
                </button>
              );
            })}
          </Card>
        )}
      </div>

      <SessionSheet entry={openSession} scores={data.scores} onClose={() => setOpenSession(null)} />
    </div>
  );
}
