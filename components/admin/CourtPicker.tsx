"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PLAYER_COLORS, PLAYER_SLOTS } from "@/lib/training";

// Les 4 joueurs disposés comme vus de derrière le terrain : l'équipe d'en
// face en haut (en miroir : sa droite à gauche), la sienne en bas.
// Index : 0 = équipe 1 gauche, 1 = équipe 1 droite, 2 = équipe 2 gauche, 3 = équipe 2 droite.
export const COURT_ORDER = [1, 0, 2, 3];
export const COURT_ORDER_FLIPPED = [3, 2, 0, 1];

const slotLabel = (i: number) =>
  `Équipe ${PLAYER_SLOTS[i].team} · ${PLAYER_SLOTS[i].side === "G" ? "Gauche" : "Droite"}`;

// Mode « swap » : on glisse un nom sur une autre carte pour échanger les deux
// places (ou on touche une carte puis une autre). Mode « select » : on touche
// le joueur à choisir parmi `allowed`.
export function CourtPicker({
  names,
  mode,
  onSwap,
  selected,
  onSelect,
  allowed,
  flipped = false,
}: {
  names: string[];
  flipped?: boolean; // après un changement de côté, l'équipe 2 est en face
  mode: "swap" | "select";
  onSwap?: (a: number, b: number) => void;
  selected?: number | null;
  onSelect?: (i: number) => void;
  allowed?: number[];
}) {
  const [picked, setPicked] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; x: number; y: number; moved: boolean } | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);

  const slotAt = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y)?.closest("[data-slot]") as HTMLElement | null;
    return el ? Number(el.dataset.slot) : null;
  };

  function down(i: number, e: React.PointerEvent) {
    if (mode !== "swap") return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY };
    setDrag({ from: i, x: e.clientX, y: e.clientY, moved: false });
  }
  function move(e: React.PointerEvent) {
    if (!drag || !start.current) return;
    const moved = drag.moved || Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
  }
  function up(i: number, e: React.PointerEvent) {
    if (mode === "select") {
      if (!allowed || allowed.includes(i)) onSelect?.(i);
      return;
    }
    const d = drag;
    setDrag(null);
    if (!d) return;
    if (d.moved) {
      const target = slotAt(e.clientX, e.clientY);
      if (target != null && target !== d.from) onSwap?.(d.from, target);
      setPicked(null);
      return;
    }
    // Simple toucher : 1er toucher = sélection, 2e toucher = échange.
    if (picked == null) setPicked(i);
    else {
      if (picked !== i) onSwap?.(picked, i);
      setPicked(null);
    }
  }

  return (
    <div className="relative">
      <div className="mb-1 text-center text-[10px] font-bold uppercase tracking-widest text-mut">
        En face
      </div>
      <div className="relative grid grid-cols-2 gap-2 rounded-xl border-2 border-line2 bg-[#14301f]/40 p-2">
        {(flipped ? COURT_ORDER_FLIPPED : COURT_ORDER).map((i) => {
          const disabled = mode === "select" && allowed && !allowed.includes(i);
          const active = mode === "select" ? selected === i : picked === i;
          const dragging = drag?.moved && drag.from === i;
          return (
            <button
              key={i}
              data-slot={i}
              onPointerDown={(e) => down(i, e)}
              onPointerMove={move}
              onPointerUp={(e) => up(i, e)}
              onPointerCancel={() => setDrag(null)}
              disabled={disabled}
              className={`tap-pad relative min-h-[78px] cursor-pointer touch-none rounded-lg border-2 px-2.5 py-2 text-start transition-all disabled:cursor-default disabled:opacity-30 ${
                active ? "scale-[1.03] ring-2 ring-gold" : ""
              } ${dragging ? "opacity-40" : ""}`}
              style={{ borderColor: PLAYER_COLORS[i], background: `${PLAYER_COLORS[i]}22` }}
            >
              <div className="text-[9px] font-extrabold uppercase tracking-wider text-sub">{slotLabel(i)}</div>
              <div className="mt-0.5 flex items-center gap-1">
                <span className="min-w-0 flex-1 truncate text-sm font-extrabold text-bright">{names[i]}</span>
                {mode === "select" && selected === i && <span className="text-base">🎾</span>}
              </div>
              {mode === "swap" && (
                <div className="mt-1 text-[10px] text-mut">{active ? "Touchez la place visée" : "⠿ Glisser"}</div>
              )}
            </button>
          );
        })}
        {/* Filet entre les deux équipes */}
        <div className="pointer-events-none absolute inset-x-2 top-1/2 h-px bg-line2" />
      </div>
      <div className="mt-1 text-center text-[10px] font-bold uppercase tracking-widest text-mut">
        De ton côté
      </div>

      {/* Portail sur <body> : la fenêtre animée (transform) décalerait sinon
          ce repère « fixed » qui suit le doigt. */}
      {drag?.moved && createPortal(
        <div
          className="pointer-events-none fixed z-[80] -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 bg-ink px-3 py-1.5 text-sm font-extrabold text-bright shadow-xl"
          style={{ left: drag.x, top: drag.y, borderColor: PLAYER_COLORS[drag.from] }}
        >
          {names[drag.from]}
        </div>,
        document.body
      )}
    </div>
  );
}

// Fenêtre plein écran par-dessus la saisie (au-dessus de l'écran de match).
export function Sheet({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/80 sm:items-center">
      <div
        className="fade-up max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-line bg-card p-5 sm:rounded-2xl"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        {children}
      </div>
    </div>
  );
}
