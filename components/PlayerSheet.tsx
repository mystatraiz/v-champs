"use client";

import { useMemo } from "react";
import { buildAllPlayerStats, buildPlayerPalmares, computeAllSideStats } from "@/lib/stats";
import { RANKING_WINDOW_MS, RETAINED_PERFS } from "@/lib/scoring";
import { formatDateShort, positionLabel } from "@/lib/format";
import type { AppData } from "@/lib/store";
import { DonutTriple, Modal, SectionTitle, StatPill } from "./ui";

// Fiche détaillée d'un joueur : stats globales, côtés, palmarès, perfs V-Champs.
export function PlayerSheet({
  data,
  playerName,
  onClose,
}: {
  data: AppData;
  playerName: string | null;
  onClose: () => void;
}) {
  // Toutes les données proviennent de la base partagée avec la v1 : on isole
  // chaque calcul pour qu'une éventuelle donnée mal formée n'affiche jamais
  // un écran vide (au pire une section reste absente).
  const stats = useMemo(() => {
    if (!playerName) return null;
    try {
      const all = buildAllPlayerStats(data.history, data.currentSession);
      const key = playerName.toLowerCase().trim();
      // Fusionne TOUTES les variantes de casse/orthographe du nom (ex. « Fred V »
      // et « Fred v ») comme le fait le classement, pour ne rater aucune session.
      const keys = Object.keys(all).filter((k) => k.toLowerCase().trim() === key);
      if (!keys.length) return null;
      return keys.reduce(
        (acc, k) => {
          const s = all[k];
          return {
            wins: acc.wins + s.wins,
            losses: acc.losses + s.losses,
            draws: acc.draws + s.draws,
            jFor: acc.jFor + s.jFor,
            jAgainst: acc.jAgainst + s.jAgainst,
            played: acc.played + s.played,
            teamNames: [...new Set([...acc.teamNames, ...s.teamNames])],
          };
        },
        { wins: 0, losses: 0, draws: 0, jFor: 0, jAgainst: 0, played: 0, teamNames: [] as string[] }
      );
    } catch {
      return null;
    }
  }, [data, playerName]);

  const side = useMemo(() => {
    if (!playerName) return null;
    try {
      const all = computeAllSideStats(data.history, data.currentSession);
      const key = playerName.toLowerCase().trim();
      const keys = Object.keys(all).filter((k) => k.toLowerCase().trim() === key);
      if (!keys.length) return null;
      return keys.reduce(
        (acc, k) => ({
          gauche: {
            wins: acc.gauche.wins + all[k].gauche.wins,
            played: acc.gauche.played + all[k].gauche.played,
          },
          droite: {
            wins: acc.droite.wins + all[k].droite.wins,
            played: acc.droite.played + all[k].droite.played,
          },
        }),
        { gauche: { wins: 0, played: 0 }, droite: { wins: 0, played: 0 } }
      );
    } catch {
      return null;
    }
  }, [data, playerName]);

  const palmares = useMemo(() => {
    if (!playerName) return [];
    try {
      return buildPlayerPalmares(data.history, playerName);
    } catch {
      return [];
    }
  }, [data, playerName]);

  const perfs = useMemo(() => {
    if (!playerName) return [];
    try {
      const key = playerName.toLowerCase().trim();
      const cutoff = Date.now() - RANKING_WINDOW_MS;
      const valid = data.scores.filter(
        (r) =>
          (r.player_name || "").toLowerCase().trim() === key &&
          new Date(r.created_at).getTime() >= cutoff
      );
      const sorted = [...valid].sort((a, b) => b.points_earned - a.points_earned);
      const retainedIds = new Set(sorted.slice(0, RETAINED_PERFS).map((r) => r.session_id));
      return valid
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .map((r) => ({ ...r, retained: retainedIds.has(r.session_id) }));
    } catch {
      return [];
    }
  }, [data.scores, playerName]);

  if (!playerName) return null;
  const wr = stats && stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;

  return (
    <Modal open={!!playerName} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-xl font-extrabold text-bright">{playerName}</h3>
        <button
          onClick={onClose}
          className="cursor-pointer rounded-lg px-2 py-1 text-lg text-mut hover:text-body"
        >
          ✕
        </button>
      </div>

      {stats ? (
        <>
          <div className="mb-4 flex items-center gap-5">
            <DonutTriple
              wins={stats.wins}
              draws={stats.draws}
              losses={stats.losses}
              size={104}
              centerLabel={`${wr}%`}
              centerSub="WIN"
            />
            <div className="grid flex-1 grid-cols-2 gap-2">
              <StatPill label="Matchs" value={stats.played} />
              <StatPill label="Victoires" value={stats.wins} color="var(--color-ok)" />
              <StatPill label="Nuls" value={stats.draws} color="var(--color-mut)" />
              <StatPill label="Défaites" value={stats.losses} color="var(--color-bad)" />
            </div>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2">
            <StatPill label="Jeux +" value={stats.jFor} />
            <StatPill label="Jeux -" value={stats.jAgainst} />
            <StatPill
              label="Diff"
              value={`${stats.jFor - stats.jAgainst >= 0 ? "+" : ""}${stats.jFor - stats.jAgainst}`}
              color={stats.jFor - stats.jAgainst >= 0 ? "var(--color-ok)" : "var(--color-bad)"}
            />
          </div>

          {side && (side.gauche.played > 0 || side.droite.played > 0) && (
            <div className="mb-4">
              <SectionTitle>Par côté</SectionTitle>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["◀ Gauche", side.gauche, "var(--color-left)"],
                    ["Droite ▶", side.droite, "var(--color-right)"],
                  ] as const
                ).map(([label, s, color]) => (
                  <div key={label} className="rounded-lg bg-card2 px-3 py-2.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
                      {label}
                    </div>
                    <div className="mt-0.5 text-sm font-bold">
                      {s.played ? `${Math.round((s.wins / s.played) * 100)}% ` : "—"}
                      <span className="text-xs font-semibold text-mut">
                        ({s.wins}V / {s.played}M)
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="mb-4 text-sm text-mut">Aucun match enregistré pour ce joueur.</p>
      )}

      {palmares.length > 0 && (
        <div className="mb-4">
          <SectionTitle>Palmarès ({palmares.length} sessions)</SectionTitle>
          <div className="overflow-hidden rounded-lg border border-line">
            {palmares.slice(0, 12).map((p, i) => (
              <div
                key={i}
                className={`flex items-center gap-3 bg-card2/50 px-3 py-2 text-sm ${
                  i < Math.min(palmares.length, 12) - 1 ? "border-b border-line" : ""
                }`}
              >
                <span
                  className={`w-9 text-center text-xs font-extrabold ${
                    p.position === 1 ? "text-gold" : p.position === 2 ? "text-sub" : "text-mut"
                  }`}
                >
                  {positionLabel(p.position)}
                </span>
                <span className="flex-1 truncate text-xs text-sub">
                  {p.partner ? `avec ${p.partner}` : p.teamName}
                </span>
                <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-bold text-mut">
                  {p.label}
                </span>
                <span className="text-[11px] text-mut">{formatDateShort(p.date)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {perfs.length > 0 && (
        <div>
          <SectionTitle>Performances V-Champs (180 jours)</SectionTitle>
          <div className="overflow-hidden rounded-lg border border-line">
            {perfs.slice(0, 12).map((r, i) => (
              <div
                key={r.session_id + i}
                className={`flex items-center gap-3 px-3 py-2 text-sm ${
                  r.retained ? "bg-card2/50" : "opacity-45"
                } ${i < Math.min(perfs.length, 12) - 1 ? "border-b border-line" : ""}`}
              >
                <span className="w-9 text-center text-xs font-extrabold text-sub">
                  {positionLabel(r.position)}
                </span>
                <span className="flex-1 text-[11px] text-mut">{formatDateShort(r.created_at)}</span>
                {!r.retained && (
                  <span className="text-[9px] font-bold uppercase text-mut">hors top {RETAINED_PERFS}</span>
                )}
                <span className="text-sm font-extrabold text-gold">+{r.points_earned}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
