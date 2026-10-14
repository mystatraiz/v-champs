"use client";

import { useMemo, useRef, useState } from "react";
import {
  PLAYER_COLORS,
  analyzeTraining,
  computeTrainingStats,
  pct,
  signed,
  type PlayerTrainingStats,
  type TrainingDetails,
  type TrainingSession,
} from "@/lib/training";
import { DEUCE_RULES, SET_FORMATS, pointLabel, scoreFromEvents } from "@/lib/padel-score";

const GOOD = "#34c273"; // --color-ok
const BAD = "#e5533f"; // --color-bad
const TRACK = "#3a3a40"; // --color-line2
const SURFACE = "#1c1c1f"; // --color-card (fond de la fenêtre)

const tone = (n: number) => (n > 0 ? "text-ok" : n < 0 ? "text-bad" : "text-sub");

// ─── Camembert (anneau) : gagnants / fautes / autres balles ───
// Trois parts d'un même tout, séparées par un fin espace couleur du fond.
function BallsDonut({ p }: { p: PlayerTrainingStats }) {
  const size = 96;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = Math.max(1, p.balls);
  const parts = [
    { v: p.winners, color: GOOD },
    { v: p.errors, color: BAD },
    { v: p.balls - p.winners - p.errors, color: TRACK },
  ].filter((x) => x.v > 0);
  const gap = parts.length > 1 ? 2 : 0; // px d'espace entre deux parts
  let offset = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" role="img"
      aria-label={`${p.winners} gagnants, ${p.errors} fautes sur ${p.balls} balles`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {p.balls === 0 ? (
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={TRACK} strokeWidth={stroke} />
        ) : (
          parts.map((part, i) => {
            const len = (part.v / total) * c;
            const dash = Math.max(0, len - gap);
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={part.color}
                strokeWidth={stroke}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })
        )}
      </g>
      <text x="50%" y="46%" textAnchor="middle" className="fill-[var(--color-bright)] text-[18px] font-extrabold">
        {signed(p.net)}
      </text>
      <text x="50%" y="64%" textAnchor="middle" className="fill-[var(--color-mut)] text-[9px] font-bold uppercase">
        net
      </text>
    </svg>
  );
}

// ─── Carte d'un joueur ───
function PlayerCard({
  p,
  i,
  details,
  points,
}: {
  p: PlayerTrainingStats;
  i: number;
  details: TrainingDetails | null;
  points: number;
}) {
  const directed = details ? details.line[i] + details.diag[i] : 0;
  const linePct = directed ? details!.line[i] / directed : 0;
  const ended = p.winners + p.errors;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-card2/50">
      <div className="h-1" style={{ background: PLAYER_COLORS[i] }} />
      <div className="p-3">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate font-extrabold text-bright">{p.name}</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-mut">
              Équipe {p.team} · {p.side === "G" ? "Gauche" : "Droite"}
            </div>
          </div>
          <div className="shrink-0 text-end">
            <div className="text-lg font-extrabold text-bright">{p.balls}</div>
            <div className="text-[10px] text-mut">balles · {pct(p.share)}</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <BallsDonut p={p} />
          <div className="min-w-0 flex-1 space-y-1.5 text-[12px]">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: GOOD }} />
              <span className="flex-1 text-sub">Gagnants</span>
              <b className="text-body">{p.winners}</b>
              <span className="w-10 text-end text-mut">{pct(p.winnerRate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: BAD }} />
              <span className="flex-1 text-sub">Fautes</span>
              <b className="text-body">{p.errors}</b>
              <span className="w-10 text-end text-mut">{pct(p.errorRate)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: TRACK }} />
              <span className="flex-1 text-sub">Autres balles</span>
              <b className="text-body">{p.balls - ended}</b>
              <span className="w-10 text-end text-mut">
                {pct(p.balls ? (p.balls - ended) / p.balls : 0)}
              </span>
            </div>
            <div className="border-t border-line/60 pt-1.5 text-[11px] text-mut">
              {pct(p.teamShare)} des balles de l&apos;équipe
              {points > 0 && <> · a conclu {ended} point{ended > 1 ? "s" : ""} sur {points}</>}
            </div>
          </div>
        </div>

        {details && (
          <div className="mt-3">
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-sub">
                Ligne droite <b className="text-body">{details.line[i]}</b>{" "}
                <span className="text-mut">{directed ? pct(linePct) : ""}</span>
              </span>
              <span className="text-sub">
                <span className="text-mut">{directed ? pct(1 - linePct) : ""}</span>{" "}
                <b className="text-body">{details.diag[i]}</b> Diagonale
              </span>
            </div>
            <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-line2/40">
              {directed > 0 && (
                <>
                  <div
                    className="h-full rounded-l-full"
                    style={{ width: `${linePct * 100}%`, background: PLAYER_COLORS[i] }}
                  />
                  <div
                    className="h-full flex-1 rounded-r-full"
                    style={{ background: PLAYER_COLORS[i], opacity: 0.4 }}
                  />
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Courbes du +/- cumulé, point après point ───
function NetChart({ details, names }: { details: TrainingDetails; names: string[] }) {
  const W = 360;
  const H = 210;
  const pad = { l: 28, r: 12, t: 12, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const curve = details.curve;
  const n = curve.length - 1; // nombre de points

  const { yMin, yMax, ticks } = useMemo(() => {
    const all = curve.flat();
    let lo = Math.min(0, ...all);
    let hi = Math.max(0, ...all);
    // Amplitude minimale de 4 pour ne pas grossir d'un point à l'autre.
    if (hi - lo < 4) {
      const extra = 4 - (hi - lo);
      hi += Math.ceil(extra / 2);
      lo -= Math.floor(extra / 2);
    }
    const span = hi - lo;
    const step = span <= 6 ? 1 : span <= 12 ? 2 : span <= 30 ? 5 : 10;
    lo = Math.floor(lo / step) * step;
    hi = Math.ceil(hi / step) * step;
    const t: number[] = [];
    for (let v = lo; v <= hi; v += step) t.push(v);
    return { yMin: lo, yMax: hi, ticks: t };
  }, [curve]);

  const x = (k: number) => pad.l + (n === 0 ? 0 : (k / n) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + ((yMax - v) / (yMax - yMin || 1)) * (H - pad.t - pad.b);
  const xStep = n <= 10 ? 1 : n <= 30 ? 5 : n <= 60 ? 10 : 20;
  const xTicks = Array.from({ length: Math.floor(n / xStep) + 1 }, (_, j) => j * xStep);

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const k = Math.round(((px - pad.l) / (W - pad.l - pad.r)) * n);
    setHover(Math.max(0, Math.min(n, k)));
  }

  const final = curve[n];
  const hv = hover != null ? curve[hover] : null;

  return (
    <div>
      {/* Légende : trait de la couleur du joueur, nom et +/- final */}
      <div className="mb-2 grid grid-cols-2 gap-x-3 gap-y-1">
        {names.map((name, i) => (
          <div key={i} className="flex min-w-0 items-center gap-1.5 text-[12px]">
            <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ background: PLAYER_COLORS[i] }} />
            <span className="min-w-0 flex-1 truncate text-sub">{name}</span>
            <b className={tone(final[i])}>{signed(final[i])}</b>
          </div>
        ))}
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="block w-full touch-none select-none"
          onPointerMove={onMove}
          onPointerDown={onMove}
          // Au doigt, la lecture reste affichée après le tap (un autre tap la déplace).
          onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}
          role="img"
          aria-label="Évolution du +/- de chaque joueur, point après point"
        >
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={pad.l}
                x2={W - pad.r}
                y1={y(v)}
                y2={y(v)}
                stroke={v === 0 ? "#6b6b74" : "#2e2e33"}
                strokeWidth={1}
              />
              <text x={pad.l - 6} y={y(v) + 3.5} textAnchor="end" className="fill-[var(--color-mut)] text-[10px]">
                {v > 0 ? `+${v}` : v}
              </text>
            </g>
          ))}
          {xTicks.map((k) => (
            <text key={k} x={x(k)} y={H - 8} textAnchor="middle" className="fill-[var(--color-mut)] text-[10px]">
              {k}
            </text>
          ))}
          {hover != null && (
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} stroke="#9a9aa3" strokeWidth={1} />
          )}
          {names.map((_, i) => (
            <polyline
              key={i}
              fill="none"
              stroke={PLAYER_COLORS[i]}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
              points={curve.map((q, k) => `${x(k)},${y(q[i])}`).join(" ")}
            />
          ))}
          {names.map((_, i) => {
            const k = hover ?? n;
            return (
              <circle
                key={i}
                cx={x(k)}
                cy={y(curve[k][i])}
                r={4}
                fill={PLAYER_COLORS[i]}
                stroke={SURFACE}
                strokeWidth={2}
              />
            );
          })}
        </svg>

        {hover != null && hv && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-line2 bg-ink/95 px-2.5 py-1.5 text-[11px] shadow-lg"
            style={
              x(hover) > W / 2
                ? { right: `${((W - x(hover)) / W) * 100 + 2}%` }
                : { left: `${(x(hover) / W) * 100 + 2}%` }
            }
          >
            <div className="mb-0.5 font-bold text-mut">{hover === 0 ? "Départ" : `Après le point ${hover}`}</div>
            {names.map((name, i) => (
              <div key={i} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="h-[3px] w-3 rounded-full" style={{ background: PLAYER_COLORS[i] }} />
                <b className="w-7 text-bright">{signed(hv[i])}</b>
                <span className="text-sub">{name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 text-[10px] leading-4 text-mut">
        Axe horizontal : numéro du point · vertical : gagnants − fautes cumulés. Touchez ou glissez
        sur le graphique pour lire les valeurs à un point donné.
      </p>
    </div>
  );
}

// Récapitulatif d'un match d'entraînement : chiffres du match, une carte par
// joueur, puis les courbes du +/- point après point.
export function TrainingSummary({ session }: { session: TrainingSession }) {
  const { players, teams, total } = computeTrainingStats(session);
  const details = useMemo(
    () => (session.events?.length ? analyzeTraining(session.events) : null),
    [session.events]
  );
  const minutes = Math.max(
    1,
    Math.round((new Date(session.endedAt).getTime() - new Date(session.date).getTime()) / 60000)
  );

  const score = session.scoring ? scoreFromEvents(session.scoring, session.events || []) : null;

  const tile = (label: string, value: string) => (
    <div className="rounded-lg bg-card2 px-2 py-2 text-center">
      <div className="text-base font-extrabold text-bright">{value}</div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-mut">{label}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {score && session.scoring && (
        <div className="rounded-xl border border-gold/40 bg-gold/5 px-3 py-2.5">
          {([0, 1] as const).map((t) => {
            const won = score.finished && score.winner === t;
            return (
              <div key={t} className="flex items-center gap-2 leading-7">
                <span className="w-5 text-center">{won ? "🏆" : ""}</span>
                <span className={`min-w-0 flex-1 truncate text-sm ${won ? "font-extrabold text-bright" : "font-bold text-sub"}`}>
                  {session.players[t * 2]} / {session.players[t * 2 + 1]}
                </span>
                <span className="text-xl font-extrabold tabular-nums text-bright">
                  {score.games[t]}
                  {score.tiebreakScore && (
                    <sup className="ml-0.5 text-[11px] font-bold text-mut">{score.tiebreakScore[t]}</sup>
                  )}
                </span>
                {!score.finished && (
                  <span className="w-8 text-end text-sm font-bold tabular-nums text-gold">
                    {score.tiebreak ? score.points[t] : pointLabel(score, t)}
                  </span>
                )}
              </div>
            );
          })}
          <div className="mt-1 border-t border-line/60 pt-1.5 text-[10px] text-mut">
            {score.finished ? "Match terminé" : "Score à l'arrêt"} ·{" "}
            {SET_FORMATS.find((f) => f.value === session.scoring!.format)?.label} ·{" "}
            {DEUCE_RULES.find((r) => r.value === session.scoring!.deuce)?.label}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        {tile("Durée", `${minutes} min`)}
        {tile("Balles", String(total))}
        {details ? tile("Points", String(details.points)) : tile("Points", "—")}
        {details && tile("Échange moyen", `${details.avgRally.toFixed(1)}`)}
        {details && tile("Plus long", `${details.maxRally}`)}
        {details && tile("Balles / min", (total / minutes).toFixed(1))}
      </div>

      {([1, 2] as const).map((team) => {
        const t = teams[team - 1];
        return (
          <div key={team} className="space-y-2">
            <div className="flex items-baseline justify-between px-1">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-sub">
                Équipe {team}
              </span>
              <span className="text-[11px] text-mut">
                {t.balls} balles · <span className="text-ok">✓ {t.winners}</span> ·{" "}
                <span className="text-bad">✗ {t.errors}</span> · net{" "}
                <b className={tone(t.net)}>{signed(t.net)}</b>
              </span>
            </div>
            {players
              .map((p, i) => ({ p, i }))
              .filter(({ p }) => p.team === team)
              .map(({ p, i }) => (
                <PlayerCard key={i} p={p} i={i} details={details} points={details?.points ?? 0} />
              ))}
          </div>
        );
      })}

      {details && details.points > 0 ? (
        <div className="rounded-xl border border-line p-3">
          <div className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-sub">
            📈 +/- point après point
          </div>
          <NetChart details={details} names={players.map((p) => p.name)} />
        </div>
      ) : (
        !details && (
          <p className="text-[11px] leading-4 text-mut">
            Match saisi avant le suivi point par point : points, échanges, ligne / diagonale et
            courbes ne sont pas disponibles.
          </p>
        )
      )}

      <p className="text-[10px] leading-4 text-mut">
        Balles = frappes en jeu hors service, gagnants et fautes compris · Net = gagnants − fautes
        directes · Échange = balles jouées dans un point · Ligne droite / diagonale : déduit du
        joueur qui reprend la balle (la dernière frappe d&apos;un point n&apos;est pas comptée).
      </p>
    </div>
  );
}
