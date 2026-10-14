"use client";

import { DEUCE_RULES, SET_FORMATS, teamOf, type ScoreSettings } from "@/lib/padel-score";
import { PLAYER_COLORS, PLAYER_SLOTS } from "@/lib/training";
import { Card, SectionTitle } from "@/components/ui";

const chip = (active: boolean) =>
  `min-w-0 cursor-pointer rounded-lg border px-2.5 py-2 text-start text-xs font-bold transition-colors ${
    active ? "border-gold bg-gold/15 text-gold" : "border-line2 text-sub"
  }`;

// Réglages du score avant le match : qui sert les deux premiers jeux (la
// rotation suit ensuite toute seule), règle à 40-40 et format du set.
export function ScoringSetup({
  names,
  enabled,
  onEnabled,
  value,
  onChange,
}: {
  names: string[];
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  value: ScoreSettings;
  onChange: (v: ScoreSettings) => void;
}) {
  const label = (i: number) =>
    names[i] || `Équipe ${PLAYER_SLOTS[i].team} · ${PLAYER_SLOTS[i].side === "G" ? "gauche" : "droite"}`;
  const playerChip = (i: number, active: boolean, onClick: () => void) => (
    <button key={i} onClick={onClick} className={chip(active)}>
      <span className="flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: PLAYER_COLORS[i] }} />
        <span className="truncate">{label(i)}</span>
      </span>
    </button>
  );
  const otherTeam = 1 - teamOf(value.firstServer);

  return (
    <Card className="space-y-3 p-3.5">
      <label className="flex cursor-pointer items-center justify-between gap-3">
        <SectionTitle className="mb-0">🎾 Compter les points</SectionTitle>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onEnabled(e.target.checked)}
          className="h-5 w-5 cursor-pointer accent-[var(--color-gold)]"
        />
      </label>
      {enabled ? (
        <>
          <p className="text-[11px] leading-4 text-mut">
            Faute directe = point pour l&apos;équipe adverse · point gagnant = point pour l&apos;équipe
            du joueur.
          </p>
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-sub">Service au 1er jeu</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[0, 1, 2, 3].map((i) =>
                playerChip(i, value.firstServer === i, () =>
                  onChange({
                    ...value,
                    firstServer: i,
                    // Le 2e jeu est servi par l'équipe adverse.
                    secondServer:
                      teamOf(value.secondServer) === teamOf(i) ? (teamOf(i) === 0 ? 2 : 0) : value.secondServer,
                  })
                )
              )}
            </div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-sub">Service au 2e jeu</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[otherTeam * 2, otherTeam * 2 + 1].map((i) =>
                playerChip(i, value.secondServer === i, () => onChange({ ...value, secondServer: i }))
              )}
            </div>
            <p className="mt-1.5 text-[10px] leading-4 text-mut">
              Ensuite le service tourne tout seul : {label(value.firstServer)} →{" "}
              {label(value.secondServer)} → {label(value.firstServer ^ 1)} →{" "}
              {label(value.secondServer ^ 1)}.
            </p>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-sub">À 40-40</div>
            <div className="grid grid-cols-3 gap-1.5">
              {DEUCE_RULES.map((r) => (
                <button
                  key={r.value}
                  onClick={() => onChange({ ...value, deuce: r.value })}
                  className={`${chip(value.deuce === r.value)} text-center`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-mut">
              {DEUCE_RULES.find((r) => r.value === value.deuce)?.desc}
            </p>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-sub">Format</div>
            <div className="grid grid-cols-2 gap-1.5">
              {SET_FORMATS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => onChange({ ...value, format: f.value })}
                  className={`${chip(value.format === f.value)} text-center`}
                >
                  <div>{f.label}</div>
                  <div className="text-[10px] font-semibold opacity-75">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        <p className="text-[11px] text-mut">Stats seules, sans tenir le score.</p>
      )}
    </Card>
  );
}
