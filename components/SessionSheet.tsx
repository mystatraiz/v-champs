"use client";

import { useEffect, useMemo, useState } from "react";
import { rankTeamsInSession } from "@/lib/scoring";
import { formatDateLong, teamLabel } from "@/lib/format";
import { formatSessionText, openWhatsApp } from "@/lib/share";
import { updateSessionMatchScore } from "@/lib/store";
import type { Match, PlayerSessionScore, SessionHistoryEntry } from "@/lib/types";
import { Badge, Btn, Modal, SectionTitle } from "./ui";

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
// Édition du score d'un match : saisie des deux camps + inversion en un geste.
function MatchScoreEditor({
  m,
  busy,
  onSave,
}: {
  m: Match;
  busy: boolean;
  onSave: (s1: number, s2: number) => void;
}) {
  const [a, setA] = useState(String(m.score1));
  const [b, setB] = useState(String(m.score2));

  // Le score affiché change sous nos pieds après enregistrement : on resynchronise.
  useEffect(() => {
    setA(String(m.score1));
    setB(String(m.score2));
  }, [m.score1, m.score2]);

  const n = (v: string) => Math.max(0, parseInt(v, 10) || 0);
  const dirty = n(a) !== m.score1 || n(b) !== m.score2;

  return (
    <span className="flex shrink-0 items-center gap-1">
      <input
        inputMode="numeric"
        value={a}
        onChange={(e) => setA(e.target.value.replace(/\D/g, "").slice(0, 2))}
        className="w-8 rounded border border-line2 bg-surface px-1 py-0.5 text-center font-mono text-xs text-body outline-none focus:border-gold/60"
      />
      <button
        onClick={() => onSave(m.score2, m.score1)}
        disabled={busy}
        title="Inverser le score"
        className="cursor-pointer px-0.5 text-xs text-mut hover:text-gold disabled:opacity-40"
      >
        ⇄
      </button>
      <input
        inputMode="numeric"
        value={b}
        onChange={(e) => setB(e.target.value.replace(/\D/g, "").slice(0, 2))}
        className="w-8 rounded border border-line2 bg-surface px-1 py-0.5 text-center font-mono text-xs text-body outline-none focus:border-gold/60"
      />
      {dirty && (
        <Btn size="sm" variant="success" disabled={busy} onClick={() => onSave(n(a), n(b))}>
          ✓
        </Btn>
      )}
    </span>
  );
}

export function SessionSheet({
  entry,
  scores,
  onClose,
  canShare = false,
  canEdit = false,
  onEdited,
}: {
  entry: SessionHistoryEntry | null;
  scores: PlayerSessionScore[];
  onClose: () => void;
  canShare?: boolean;
  canEdit?: boolean;
  onEdited?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Correction d'un score : le classement de la session et les points V-Champs
  // sont recalculés côté store, on recharge ensuite les données.
  async function fixScore(matchId: number, s1: number, s2: number) {
    if (!entry) return;
    setBusyId(matchId);
    setErr(null);
    try {
      await updateSessionMatchScore(entry.date, matchId, s1, s2);
      onEdited?.();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur pendant la correction.");
    } finally {
      setBusyId(null);
    }
  }

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
        <div className="flex items-center gap-2">
          {canShare && (
            <button
              onClick={() => openWhatsApp(formatSessionText(entry, scores))}
              title="Partager sur WhatsApp"
              className="cursor-pointer rounded-lg bg-[#25D366] px-2.5 py-1.5 text-sm font-extrabold text-white"
            >
              📲
            </button>
          )}
          <button
            onClick={onClose}
            className="cursor-pointer rounded-lg px-2 py-1 text-lg text-mut hover:text-body"
          >
            ✕
          </button>
        </div>
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

      <div className="flex items-center justify-between">
        <SectionTitle className="mb-0">Matchs ({finished.length})</SectionTitle>
        {canEdit && finished.length > 0 && (
          <button
            onClick={() => {
              setEditing((v) => !v);
              setErr(null);
            }}
            className="mb-2.5 cursor-pointer text-[11px] font-bold uppercase tracking-wider text-gold"
          >
            {editing ? "✓ Terminer" : "✏️ Corriger"}
          </button>
        )}
      </div>
      {editing && (
        <p className="mb-2 text-[11px] leading-4 text-mut">
          Corrige un score mal saisi. Le classement de la session et les points V-Champs sont
          recalculés automatiquement.
        </p>
      )}
      {err && <p className="mb-2 text-xs font-semibold text-bad">{err}</p>}
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
                {editing ? (
                  <MatchScoreEditor
                    m={m}
                    busy={busyId === m.id}
                    onSave={(a, b) => fixScore(m.id, a, b)}
                  />
                ) : (
                  <span className="shrink-0 px-1 font-mono text-xs text-mut">{matchScoreStr(m)}</span>
                )}
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
