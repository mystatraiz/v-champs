"use client";

import { useCallback, useEffect, useState } from "react";
import { deleteRecurrenceRule, listRecurrenceRules } from "@/lib/store";
import { AGENDA_KINDS } from "@/lib/agenda";
import { levelsLabel } from "@/lib/levels";
import { recurrenceLabel } from "@/lib/recurrence";
import type { RecurrenceRule } from "@/lib/types";
import { Btn, EmptyState, Loader } from "@/components/ui";

// Liste des créneaux qui se répètent, avec de quoi les arrêter. Arrêter une
// règle n'efface pas les créneaux déjà planifiés.
export function RecurrenceManager() {
  const [rules, setRules] = useState<RecurrenceRule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setRules(await listRecurrenceRules());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
      setRules([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function stop(r: RecurrenceRule) {
    const label = recurrenceLabel(r.start_date, r.time, r.interval_weeks);
    if (
      !confirm(
        `Arrêter cette récurrence ?\n\n${label}\n\nPlus aucune occurrence ne sera créée. Les créneaux déjà planifiés restent en place — annule-les un par un si besoin.`
      )
    )
      return;
    setBusy(r.id);
    try {
      await deleteRecurrenceRule(r.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur pendant l'arrêt.");
    } finally {
      setBusy(null);
    }
  }

  if (rules === null) return <Loader />;

  return (
    <>
      <p className="mb-3 text-xs leading-5 text-sub">
        Ces créneaux se recréent tout seuls : les{" "}
        <b className="text-body">4 prochaines occurrences</b> de chaque règle sont maintenues à
        l&apos;ouverture de l&apos;agenda. Une récurrence se crée en cochant{" "}
        <b className="text-body">🔁 Répéter ce créneau</b> au moment de la création.
      </p>

      {error && <p className="mb-2 text-xs font-semibold text-bad">{error}</p>}

      {!rules.length ? (
        <EmptyState>Aucune récurrence active.</EmptyState>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => {
            const meta = AGENDA_KINDS.find((k) => k.key === r.kind) ?? AGENDA_KINDS[0];
            return (
              <div
                key={r.id}
                className={`flex items-center gap-2.5 rounded-lg border border-line bg-surface p-2.5 border-l-4 ${meta.edge}`}
              >
                <span className="text-base leading-none">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-bright">
                    {recurrenceLabel(r.start_date, r.time, r.interval_weeks)}
                  </div>
                  <div className="truncate text-[11px] text-mut">
                    {meta.short}
                    {r.kind === "tournament"
                      ? ` · niveau ${r.level}`
                      : ` · ${levelsLabel(r.levels)}`}
                    {` · ${r.capacity} joueurs`}
                  </div>
                </div>
                <Btn size="sm" variant="ghost" disabled={busy === r.id} onClick={() => stop(r)}>
                  ⏹ Arrêter
                </Btn>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
