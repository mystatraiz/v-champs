"use client";

import { useEffect, useState } from "react";
import {
  PLAYER_COLORS,
  PLAYER_SLOTS,
  countEvents,
  type TrainingEventKind,
  type TrainingLive,
} from "@/lib/training";
import { formatClock } from "@/lib/format";
import { pointLabel, scoreFromEvents, scoreStatus, teamOf } from "@/lib/padel-score";
import { COURT_ORDER, COURT_ORDER_FLIPPED, CourtPicker, Sheet } from "./CourtPicker";

// Garde l'écran allumé pendant la saisie (Safari iOS 16.4+, Chrome).
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const request = async () => {
      try {
        lock = await navigator.wakeLock.request("screen");
      } catch {
        /* refusé (batterie faible…) : sans conséquence */
      }
    };
    const onVisible = () => document.visibilityState === "visible" && request();
    request();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      lock?.release().catch(() => {});
    };
  }, [active]);
}

const KIND_LABEL: Record<TrainingEventKind, string> = {
  touch: "balle",
  winner: "gagnant",
  error: "faute",
};

// ─── Saisie en direct (plein écran) ───
export function LiveTracker({
  live,
  onEvent,
  onUndo,
  onFinish,
  onAbort,
  onFlip,
  onSecondServer,
  onSideChanges,
}: {
  live: TrainingLive;
  onEvent: (p: number, k: TrainingEventKind) => void;
  onUndo: () => void;
  onFinish: () => void;
  onAbort: () => void;
  onFlip: () => void;
  onSecondServer: (p: number) => void;
  onSideChanges: (v: boolean) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  useWakeLock(true);

  const { touches, winners, errors } = countEvents(live.events);
  const balls = [0, 1, 2, 3].map((i) => touches[i] + winners[i] + errors[i]);
  const last = live.events[live.events.length - 1];
  const elapsed = Math.max(0, (now - new Date(live.startedAt).getTime()) / 1000);
  const score = live.scoring ? scoreFromEvents(live.scoring, live.events) : null;
  const status = score && live.scoring ? scoreStatus(score, live.scoring) : null;
  // Changement de côté attendu (après chaque jeu impair, tous les 6 points en
  // tie-break) mais pas encore fait à l'écran.
  const sideChanges = live.sideChanges !== false;
  const changeDue =
    sideChanges && !!score && !score.finished && (score.endChanges % 2 === 1) !== !!live.flipped;
  // Serveur de l'autre équipe : demandé une seule fois, à la fin du 1er jeu.
  const needSecond =
    !!score && !!live.scoring && live.scoring.secondServer == null && score.gamesPlayed >= 1 && !score.finished;
  const otherTeam = live.scoring ? 1 - teamOf(live.scoring.firstServer) : 1;
  const [serveSheet, setServeSheet] = useState(false);
  const [pickSecond, setPickSecond] = useState<number | null>(null);
  const [settings, setSettings] = useState(false);
  // Sans changement de côté, la question arrive dès la fin du 1er jeu.
  useEffect(() => {
    if (needSecond && !sideChanges) setServeSheet(true);
  }, [needSecond, sideChanges]);

  // Vue de l'observateur, derrière le terrain : l'équipe du bas lui tourne le
  // dos (sa gauche est à gauche), l'équipe du haut lui fait face (sa gauche
  // est à droite). Les trois blocs suivent cette disposition. Au changement
  // de côté, tout pivote de 180° : l'équipe 2 passe en haut, en miroir.
  // Index joueurs : 0 = éq. 1 gauche, 1 = éq. 1 droite, 2 = éq. 2 gauche, 3 = éq. 2 droite.
  const order = live.flipped ? COURT_ORDER_FLIPPED : COURT_ORDER;
  const grid = (render: (i: number) => React.ReactNode) => (
    <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-2 gap-1.5">
      {order.map((i) => (
        <div key={i} className="min-h-0">
          {render(i)}
        </div>
      ))}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col gap-2 bg-ink px-3"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSettings(true)}
          title="Réglages du match"
          className="tap-pad cursor-pointer rounded-lg border border-line2 px-3 py-2 text-xs font-bold text-sub"
        >
          ⚙️
        </button>
        <div className="flex-1 text-center font-mono text-lg font-extrabold tabular-nums text-sub">
          ⏱ {formatClock(elapsed)}
        </div>
        <button
          onClick={() => {
            onFlip();
            // Fin du 1er jeu : au changement de côté, on demande qui sert en face.
            if (needSecond) setServeSheet(true);
          }}
          title="Changement de côté : fait pivoter les places de 180°"
          className={`tap-pad cursor-pointer rounded-lg border px-3 py-2 text-xs font-extrabold ${
            changeDue
              ? "pulse-soft border-gold bg-gold text-ink"
              : live.flipped
                ? "border-gold bg-gold/15 text-gold"
                : "border-line2 text-sub"
          }`}
        >
          {changeDue ? "🔄 Changez !" : "🔄 Côtés"}
        </button>
        <button
          onClick={onFinish}
          className={`tap-pad cursor-pointer rounded-lg bg-gold px-3 py-2 text-xs font-extrabold text-ink ${
            score?.finished ? "pulse-soft" : ""
          }`}
        >
          ✓ Terminer
        </button>
      </div>

      {/* Tableau de score : même ordre que l'écran (équipe du haut en premier) */}
      {score && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-2.5 py-1">
          <div className="min-w-0 flex-1">
            {(live.flipped ? [1, 0] : [0, 1]).map((t) => {
              const serving = !score.finished && Math.floor(score.server / 2) === t;
              const won = score.finished && score.winner === t;
              return (
                <div key={t} className="flex items-center gap-2 leading-6">
                  <span className="w-4 shrink-0 text-center text-xs">{won ? "🏆" : serving ? "🎾" : ""}</span>
                  <span className={`min-w-0 flex-1 truncate text-[12px] ${won ? "font-extrabold text-gold" : "font-bold text-sub"}`}>
                    {live.players[t * 2]} / {live.players[t * 2 + 1]}
                  </span>
                  {/* Sets terminés en petit, puis jeux et points du set en cours */}
                  {score.setScores.map((set, k) => (
                    <span key={k} className="w-5 text-center text-xs font-bold tabular-nums text-mut">
                      {set.superTiebreak && set.tiebreak ? set.tiebreak[t] : set.games[t]}
                    </span>
                  ))}
                  {!score.finished && (
                    <>
                      <span className="w-6 text-center text-base font-extrabold tabular-nums text-bright">
                        {score.superTiebreak ? "" : score.games[t]}
                      </span>
                      <span className="w-9 text-center text-base font-extrabold tabular-nums text-gold">
                        {pointLabel(score, t as 0 | 1)}
                      </span>
                    </>
                  )}
                </div>
              );
            })}
          </div>
          {needSecond && (
            <button
              onClick={() => setServeSheet(true)}
              className="tap-pad pulse-soft shrink-0 cursor-pointer rounded-lg bg-gold px-2 py-1 text-[10px] font-extrabold text-ink"
            >
              🎾 Qui sert ?
            </button>
          )}
          {!needSecond && (status || score.finished) && (
            <div className="w-16 shrink-0 text-center text-[10px] font-extrabold uppercase leading-tight text-gold">
              {score.finished ? "Match terminé" : status}
            </div>
          )}
        </div>
      )}

      {/* Les 4 joueurs */}
      <div className="grid grid-cols-2 gap-1.5">
        {order.map((i) => (
          <div
            key={i}
            className="min-w-0 rounded-lg border-2 px-2.5 py-1.5"
            style={{ borderColor: PLAYER_COLORS[i], background: `${PLAYER_COLORS[i]}1f` }}
          >
            <div className="text-[9px] font-extrabold uppercase tracking-wider text-sub">
              Équipe {PLAYER_SLOTS[i].team} · {PLAYER_SLOTS[i].side === "G" ? "Gauche" : "Droite"}
            </div>
            <div className="flex items-center gap-1">
              <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-bright">
                {live.players[i]}
              </span>
              {score && !score.finished && !needSecond && score.server === i && (
                <span className="shrink-0 text-xs" title="Au service">🎾</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="text-[10px] font-extrabold uppercase tracking-widest text-mut">
        🎾 Balles touchées
      </div>
      {grid((i) => (
        <button
          onClick={() => onEvent(i, "touch")}
          className="tap-pad relative flex h-full w-full cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border-2"
          style={{ borderColor: PLAYER_COLORS[i], background: `${PLAYER_COLORS[i]}26` }}
        >
          <span key={balls[i]} className="tap-flash absolute inset-0 bg-white" />
          <span className="max-w-full truncate px-2 text-[11px] font-bold text-sub">
            {live.players[i]}
          </span>
          <span key={`n${balls[i]}`} className="tap-pop text-4xl font-extrabold tabular-nums text-bright">
            {balls[i]}
          </span>
        </button>
      ))}

      <div className="flex justify-between text-[10px] font-extrabold uppercase tracking-widest">
        <span className="text-bad">✗ Faute directe</span>
        <span className="text-ok">Point gagnant ✓</span>
      </div>
      {grid((i) => (
        <div
          className="flex h-full flex-col overflow-hidden rounded-xl border-2"
          style={{ borderColor: PLAYER_COLORS[i] }}
        >
          <div
            className="truncate px-2 py-0.5 text-center text-[10px] font-extrabold text-ink"
            style={{ background: PLAYER_COLORS[i] }}
          >
            {live.players[i]}
          </div>
          <div className="grid min-h-0 flex-1 grid-cols-2">
            {(
              [
                ["error", errors[i], "bg-bad/25", "text-bad", "✗"],
                ["winner", winners[i], "bg-ok/25", "text-ok", "✓"],
              ] as const
            ).map(([kind, n, bg, fg, icon]) => (
              <button
                key={kind}
                onClick={() => onEvent(i, kind)}
                className={`tap-pad relative flex cursor-pointer flex-col items-center justify-center overflow-hidden ${bg}`}
              >
                <span key={n} className="tap-flash absolute inset-0 bg-white" />
                <span className={`text-sm font-extrabold ${fg}`}>{icon}</span>
                <span key={`n${n}`} className={`tap-pop text-2xl font-extrabold tabular-nums ${fg}`}>
                  {n}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        onClick={onUndo}
        disabled={!last}
        className="tap-pad cursor-pointer rounded-xl border border-line2 bg-card py-3 text-sm font-bold text-body disabled:opacity-40"
      >
        {last
          ? `↶ Annuler : ${KIND_LABEL[last.k]} ${live.players[last.p]}${
              last.replaces != null ? ` (frappe ${live.players[last.replaces]} corrigée)` : ""
            }`
          : "↶ Annuler"}
      </button>

      {serveSheet && needSecond && (
        <Sheet>
          <h3 className="text-lg font-extrabold text-bright">Qui sert pour l&apos;équipe {otherTeam + 1} ?</h3>
          <p className="mb-3 text-xs text-mut">
            Touche le joueur qui sert ce jeu. Ensuite le service tourne tout seul.
          </p>
          <CourtPicker
            names={live.players}
            mode="select"
            flipped={!!live.flipped}
            allowed={[otherTeam * 2, otherTeam * 2 + 1]}
            selected={pickSecond}
            onSelect={setPickSecond}
          />
          <button
            disabled={pickSecond == null}
            onClick={() => {
              if (pickSecond == null) return;
              onSecondServer(pickSecond);
              setServeSheet(false);
            }}
            className="tap-pad mt-4 w-full cursor-pointer rounded-xl bg-gold py-3 text-sm font-extrabold text-ink disabled:opacity-40"
          >
            OK
          </button>
        </Sheet>
      )}

      {settings && (
        <Sheet>
          <h3 className="mb-3 text-lg font-extrabold text-bright">Réglages du match</h3>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line2 px-3 py-3">
            <span>
              <span className="block text-sm font-bold text-body">🔄 Changements de côté</span>
              <span className="block text-[11px] text-mut">
                Rappel après chaque jeu impair (et tous les 6 points en tie-break)
              </span>
            </span>
            <input
              type="checkbox"
              checked={sideChanges}
              onChange={(e) => onSideChanges(e.target.checked)}
              className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-gold)]"
            />
          </label>
          <button
            onClick={() => setSettings(false)}
            className="tap-pad mt-4 w-full cursor-pointer rounded-xl bg-gold py-3 text-sm font-extrabold text-ink"
          >
            OK
          </button>
          <button
            onClick={() => {
              setSettings(false);
              onAbort();
            }}
            className="tap-pad mt-2 w-full cursor-pointer rounded-xl border border-bad/50 py-2.5 text-sm font-bold text-bad"
          >
            Abandonner le match
          </button>
        </Sheet>
      )}
    </div>
  );
}

