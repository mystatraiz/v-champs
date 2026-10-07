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
}: {
  live: TrainingLive;
  onEvent: (p: number, k: TrainingEventKind) => void;
  onUndo: () => void;
  onFinish: () => void;
  onAbort: () => void;
  onFlip: () => void;
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

  // Les trois blocs suivent la même disposition : équipe 1 en haut, équipe 2
  // en bas, gauche à gauche, droite à droite. Après un changement de côté,
  // tout pivote de 180° : l'ordre d'affichage est inversé.
  const order = live.flipped ? [3, 2, 1, 0] : [0, 1, 2, 3];
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
          onClick={onAbort}
          className="tap-pad cursor-pointer rounded-lg border border-line2 px-3 py-2 text-xs font-bold text-sub"
        >
          ✕
        </button>
        <div className="flex-1 text-center font-mono text-lg font-extrabold tabular-nums text-sub">
          ⏱ {formatClock(elapsed)}
        </div>
        <button
          onClick={onFlip}
          title="Changement de côté : fait pivoter les places de 180°"
          className={`tap-pad cursor-pointer rounded-lg border px-3 py-2 text-xs font-extrabold ${
            live.flipped ? "border-gold bg-gold/15 text-gold" : "border-line2 text-sub"
          }`}
        >
          🔄 Côtés
        </button>
        <button
          onClick={onFinish}
          className="tap-pad cursor-pointer rounded-lg bg-gold px-3 py-2 text-xs font-extrabold text-ink"
        >
          ✓ Terminer
        </button>
      </div>

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
            <div className="truncate text-sm font-extrabold text-bright">{live.players[i]}</div>
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
        {last ? `↶ Annuler : ${KIND_LABEL[last.k]} ${live.players[last.p]}` : "↶ Annuler"}
      </button>
    </div>
  );
}

