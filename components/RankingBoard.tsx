"use client";

import { useMemo, useState } from "react";
import {
  computeCombinedRanking,
  computeMentions,
  computePrevRankMap,
} from "@/lib/scoring";
import { LEVEL_LABELS } from "@/lib/levels";
import { formatRankingText, openWhatsApp } from "@/lib/share";
import type { AppData } from "@/lib/store";
import { Card, EmptyState, RankBadge, SectionTitle } from "./ui";
import { PlayerSheet } from "./PlayerSheet";

function Trend({ curr, prev, isNew }: { curr: number; prev?: number; isNew: boolean }) {
  if (isNew) return <span className="ml-1 text-[9px] font-extrabold text-gold">NEW</span>;
  if (prev === undefined) return null;
  const delta = prev - curr;
  if (delta > 0) return <span className="ml-1 text-[10px] font-extrabold text-ok">▲{delta}</span>;
  if (delta < 0) return <span className="ml-1 text-[10px] font-extrabold text-bad">▼{Math.abs(delta)}</span>;
  return <span className="ml-1 text-[10px] text-mut">—</span>;
}

// Classement général V-Champs avec filtres par niveau et mentions spéciales.
export function RankingBoard({
  data,
  highlightPlayer,
  canShare = false,
}: {
  data: AppData;
  highlightPlayer?: string | null;
  canShare?: boolean;
}) {
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);

  const combined = useMemo(
    () =>
      computeCombinedRanking(data.scores, data.history, data.currentSession, levelFilter),
    [data, levelFilter]
  );
  const prevRankMap = useMemo(
    () => (levelFilter ? new Map<string, number>() : computePrevRankMap(data.scores)),
    [data.scores, levelFilter]
  );
  const mentions = useMemo(
    () =>
      levelFilter ? [] : computeMentions(combined, data.history, data.currentSession),
    [combined, data, levelFilter]
  );

  const hasPrevData = !levelFilter && prevRankMap.size > 0;
  const visible = expanded ? combined : combined.slice(0, 8);

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5">
        <div className="flex flex-1 gap-1.5 overflow-x-auto">
          {[null, ...LEVEL_LABELS].map((lv) => (
            <button
              key={lv ?? "general"}
              onClick={() => setLevelFilter(lv)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                levelFilter === lv
                  ? "border-gold bg-gold text-ink"
                  : "border-line2 text-sub hover:text-body"
              }`}
            >
              {lv ?? "Général"}
            </button>
          ))}
        </div>
        {canShare && combined.length > 0 && (
          <button
            onClick={() => openWhatsApp(formatRankingText(combined, levelFilter))}
            title="Partager le classement sur WhatsApp"
            className="shrink-0 cursor-pointer rounded-lg bg-[#25D366] px-2.5 py-1.5 text-sm font-extrabold text-white"
          >
            📲
          </button>
        )}
      </div>

      {!combined.length ? (
        <Card>
          <EmptyState>Le classement apparaîtra après la première session terminée.</EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
                  <th className="px-3 py-2.5">#</th>
                  <th className="px-2 py-2.5">Joueur</th>
                  <th className="px-3 py-2.5 text-right">V-Points</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((p, i) => {
                  const prevRank = prevRankMap.get(p.key);
                  const isNew = hasPrevData && prevRank === undefined;
                  const hl =
                    highlightPlayer &&
                    p.name.toLowerCase().trim() === highlightPlayer.toLowerCase().trim();
                  return (
                    <tr
                      key={p.key}
                      className={`border-b border-line/50 last:border-0 ${
                        hl ? "bg-gold/10" : ""
                      }`}
                    >
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <RankBadge rank={i + 1} />
                        <Trend curr={i + 1} prev={prevRank} isNew={isNew} />
                      </td>
                      <td className="w-full px-2 py-2.5">
                        <button
                          onClick={() => setOpenPlayer(p.name)}
                          className="cursor-pointer text-left font-semibold text-body underline-offset-2 hover:text-gold hover:underline"
                        >
                          {p.name}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-[15px] font-extrabold text-gold">
                        {p.score || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {combined.length > 8 && (
            <div className="border-t border-line p-2.5 text-center">
              <button
                onClick={() => setExpanded(!expanded)}
                className="cursor-pointer rounded-lg border border-line2 px-5 py-1.5 text-xs font-bold text-sub hover:text-body"
              >
                {expanded ? "▲ Réduire" : `▼ Voir tout (${combined.length} joueurs)`}
              </button>
            </div>
          )}
        </Card>
      )}

      {mentions.length > 0 && (
        <div className="mt-5">
          <SectionTitle>Mentions spéciales</SectionTitle>
          <Card>
            {mentions.map((m, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 px-4 py-2.5 ${
                  i < mentions.length - 1 ? "border-b border-line" : ""
                }`}
              >
                <span className="w-6 text-center text-lg">{m.icon}</span>
                <span className="flex-1 text-[11px] font-bold uppercase tracking-wider text-sub">
                  {m.label}
                </span>
                <span className="text-[13px] font-bold" style={m.color ? { color: m.color } : undefined}>
                  {m.name}
                </span>
                <span
                  className="min-w-9 text-right text-[13px] font-extrabold text-gold"
                  style={m.color ? { color: m.color } : undefined}
                >
                  {m.val}
                </span>
              </div>
            ))}
          </Card>
        </div>
      )}

      <PlayerSheet data={data} playerName={openPlayer} onClose={() => setOpenPlayer(null)} />
    </div>
  );
}
