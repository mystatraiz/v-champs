"use client";

import { Fragment } from "react";
import { PLAYER_COLORS, computeTrainingStats, pct, signed, type TrainingSession } from "@/lib/training";

const tone = (n: number) => (n > 0 ? "text-ok" : n < 0 ? "text-bad" : "text-sub");

// Récapitulatif d'un match d'entraînement : une ligne par joueur, regroupés
// par équipe, avec le total de l'équipe.
export function TrainingSummary({ session }: { session: TrainingSession }) {
  const { players, teams, total } = computeTrainingStats(session);
  const minutes = Math.max(
    1,
    Math.round((new Date(session.endedAt).getTime() - new Date(session.date).getTime()) / 60000)
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-sub">
        <span>⏱ {minutes} min</span>
        <span>🎾 {total} balles touchées</span>
      </div>
      <div className="overflow-hidden rounded-xl border border-line">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] font-bold uppercase tracking-wider text-mut">
              <th className="px-3 py-2">Joueur</th>
              <th className="px-1.5 py-2 text-end">Balles</th>
              <th className="px-1.5 py-2 text-end text-ok">✓</th>
              <th className="px-1.5 py-2 text-end text-bad">✗</th>
              <th className="px-3 py-2 text-end">Net</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <Fragment key={t.team}>
                {players
                  .map((p, i) => ({ p, i }))
                  .filter(({ p }) => p.team === t.team)
                  .map(({ p, i }) => (
                    <tr key={i} className="border-b border-line/50">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: PLAYER_COLORS[i] }}
                          />
                          <span className="truncate font-bold text-body">{p.name}</span>
                          <span className="shrink-0 text-[10px] font-bold text-mut">{p.side}</span>
                        </div>
                        <div className="pl-4 text-[10px] text-mut">
                          {pct(p.winnerRate)} gagnants · {pct(p.errorRate)} fautes
                        </div>
                      </td>
                      <td className="px-1.5 py-2 text-end">
                        <div className="font-bold text-body">{p.balls}</div>
                        <div className="text-[10px] text-mut">{pct(p.share)}</div>
                      </td>
                      <td className="px-1.5 py-2 text-end font-bold text-ok">{p.winners}</td>
                      <td className="px-1.5 py-2 text-end font-bold text-bad">{p.errors}</td>
                      <td className={`px-3 py-2 text-end font-extrabold ${tone(p.net)}`}>
                        {signed(p.net)}
                      </td>
                    </tr>
                  ))}
                <tr className="border-b border-line bg-card2/60 last:border-0">
                  <td className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-sub">
                    Équipe {t.team}
                  </td>
                  <td className="px-1.5 py-1.5 text-end text-xs font-bold text-sub">{t.balls}</td>
                  <td className="px-1.5 py-1.5 text-end text-xs font-bold text-ok">{t.winners}</td>
                  <td className="px-1.5 py-1.5 text-end text-xs font-bold text-bad">{t.errors}</td>
                  <td className={`px-3 py-1.5 text-end text-xs font-extrabold ${tone(t.net)}`}>
                    {signed(t.net)}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[10px] leading-4 text-mut">
        Balles = frappes en jeu hors service, gagnants et fautes compris · % = part des balles du
        match · Net = gagnants − fautes directes.
      </p>
    </div>
  );
}
