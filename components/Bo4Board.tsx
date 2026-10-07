"use client";

import { useMemo, useState } from "react";
import { BO4_POINTS_BY_POS, computeBo4Ranking } from "@/lib/bestof4";
import { LEVEL_LABELS } from "@/lib/levels";
import type { AppData } from "@/lib/store";
import { Card, EmptyState, RankBadge } from "./ui";

const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;
const tone = (n: number) => (n > 0 ? "text-ok" : n < 0 ? "text-bad" : "text-sub");

// Classement Best Of 4 : à part du classement V-Champs.
export function Bo4Board({ data, highlightPlayer }: { data: AppData; highlightPlayer?: string | null }) {
  const [levelFilter, setLevelFilter] = useState<string | null>(null);
  const rows = useMemo(() => computeBo4Ranking(data.history, levelFilter), [data.history, levelFilter]);
  const meKey = highlightPlayer?.toLowerCase().trim();
  // Seuls les niveaux où un Best Of 4 a été joué sont proposés.
  const levels = useMemo(() => {
    const played = new Set(data.history.filter((s) => s.format === "bo4").map((s) => s.label || "6/7"));
    return LEVEL_LABELS.filter((l) => played.has(l));
  }, [data.history]);

  return (
    <div>
      {levels.length > 1 && (
        <div className="mb-3 flex gap-1.5 overflow-x-auto">
          {[null, ...levels].map((lv) => (
            <button
              key={lv ?? "general"}
              onClick={() => setLevelFilter(lv)}
              className={`shrink-0 cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
                levelFilter === lv ? "border-gold bg-gold text-ink" : "border-line2 text-sub hover:text-body"
              }`}
            >
              {lv ?? "Général"}
            </button>
          ))}
        </div>
      )}

      {!rows.length ? (
        <Card>
          <EmptyState>Aucune session Best Of 4 pour l&apos;instant.</EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
                <th className="px-3 py-2.5">#</th>
                <th className="px-2 py-2.5">Joueur</th>
                <th className="px-2 py-2.5 text-end">Pts</th>
                <th className="px-2 py-2.5 text-end">S</th>
                <th className="px-2 py-2.5 text-end">🥇</th>
                <th className="px-3 py-2.5 text-end">+/-</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const diff = r.gamesFor - r.gamesAgainst;
                return (
                  <tr
                    key={r.key}
                    className={`border-b border-line/50 last:border-0 ${r.key === meKey ? "bg-gold/10" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <RankBadge rank={i + 1} />
                    </td>
                    <td className="min-w-0 px-2 py-2.5">
                      <div className="font-bold text-body">{r.name}</div>
                      <div className="text-[10px] text-mut">
                        G <span className={tone(r.leftDiff)}>{signed(r.leftDiff)}</span> · D{" "}
                        <span className={tone(r.rightDiff)}>{signed(r.rightDiff)}</span> · {r.wins}V/
                        {r.played}
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-end font-extrabold text-gold">{r.points}</td>
                    <td className="px-2 py-2.5 text-end text-sub">{r.sessions}</td>
                    <td className="px-2 py-2.5 text-end text-sub">{r.firsts}</td>
                    <td className={`px-3 py-2.5 text-end font-bold ${tone(diff)}`}>{signed(diff)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
      <p className="px-1 pt-2.5 text-[11px] leading-5 text-mut">
        Par session : {BO4_POINTS_BY_POS[1]} pts au 1er, {BO4_POINTS_BY_POS[2]} au 2e,{" "}
        {BO4_POINTS_BY_POS[3]} au 3e, {BO4_POINTS_BY_POS[4]} au 4e. S = sessions, 🥇 = victoires de
        session, G / D = +/- joué à gauche / à droite. Classement séparé : le Best Of 4 ne rapporte
        pas de points V-Champs.
      </p>
    </div>
  );
}
