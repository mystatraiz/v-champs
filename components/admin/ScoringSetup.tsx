"use client";

import { DEUCE_RULES, SET_FORMATS, type DeuceRule, type SetFormat } from "@/lib/padel-score";
import { Card, SectionTitle } from "@/components/ui";

const chip = (active: boolean) =>
  `min-w-0 cursor-pointer rounded-lg border px-2.5 py-2 text-center text-xs font-bold transition-colors ${
    active ? "border-gold bg-gold/15 text-gold" : "border-line2 text-sub"
  }`;

export interface MatchRules {
  deuce: DeuceRule;
  format: SetFormat;
}

// Règles du match avant de lancer : score ou non, règle à 40-40, format,
// rappel des changements de côté. Les serveurs sont choisis au lancement.
export function ScoringSetup({
  enabled,
  onEnabled,
  value,
  onChange,
  sideChanges,
  onSideChanges,
}: {
  enabled: boolean;
  onEnabled: (v: boolean) => void;
  value: MatchRules;
  onChange: (v: MatchRules) => void;
  sideChanges: boolean;
  onSideChanges: (v: boolean) => void;
}) {
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
            du joueur. Le serveur se choisit au lancement du match.
          </p>
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-sub">À 40-40</div>
            <div className="grid grid-cols-3 gap-1.5">
              {DEUCE_RULES.map((r) => (
                <button key={r.value} onClick={() => onChange({ ...value, deuce: r.value })} className={chip(value.deuce === r.value)}>
                  {r.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[10px] text-mut">{DEUCE_RULES.find((r) => r.value === value.deuce)?.desc}</p>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-bold text-sub">Format</div>
            <div className="grid grid-cols-2 gap-1.5">
              {SET_FORMATS.map((f) => (
                <button key={f.value} onClick={() => onChange({ ...value, format: f.value })} className={chip(value.format === f.value)}>
                  <div>{f.label}</div>
                  <div className="text-[10px] font-semibold opacity-75">{f.desc}</div>
                </button>
              ))}
            </div>
          </div>
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-line2 px-3 py-2.5">
            <span>
              <span className="block text-xs font-bold text-body">🔄 Changements de côté</span>
              <span className="block text-[10px] text-mut">
                Rappel après chaque jeu impair · modifiable en plein match
              </span>
            </span>
            <input
              type="checkbox"
              checked={sideChanges}
              onChange={(e) => onSideChanges(e.target.checked)}
              className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--color-gold)]"
            />
          </label>
        </>
      ) : (
        <p className="text-[11px] text-mut">Stats seules, sans tenir le score.</p>
      )}
    </Card>
  );
}
