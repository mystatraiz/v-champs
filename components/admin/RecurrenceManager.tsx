"use client";

import { useCallback, useEffect, useState } from "react";
import {
  cancelLesson,
  cancelMatchSlot,
  cancelTournament,
  deleteRecurrenceRule,
  listLessons,
  listMatchSlots,
  listRecurrenceRules,
  listTournaments,
} from "@/lib/store";
import { AGENDA_KINDS } from "@/lib/agenda";
import { levelsLabel } from "@/lib/levels";
import { formatDateShort, localDateStr } from "@/lib/format";
import { nextOccurrences, recurrenceLabel } from "@/lib/recurrence";
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

  // Créneaux à venir issus de cette règle : même type, même heure, et date
  // tombant sur une de ses occurrences. Sert à purger une récurrence créée par
  // erreur sans avoir à annuler chaque séance une par une.
  async function futureSlotsOf(r: RecurrenceRule): Promise<{ id: string; date: string }[]> {
    const today = localDateStr(new Date());
    // Un an d'avance : largement au-delà de ce que la maintenance crée.
    const dates = new Set(nextOccurrences(r.start_date, r.interval_weeks, 52));
    const rows =
      r.kind === "tournament"
        ? await listTournaments()
        : r.kind === "lesson"
          ? await listLessons()
          : await listMatchSlots();
    return (rows as { id: string; date: string; time: string; status: string }[])
      .filter(
        (x) =>
          x.date >= today &&
          x.time === r.time &&
          x.status !== "cancelled" &&
          x.status !== "done" &&
          dates.has(x.date)
      )
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((x) => ({ id: x.id, date: x.date }));
  }

  async function stop(r: RecurrenceRule) {
    const label = recurrenceLabel(r.start_date, r.time, r.interval_weeks);
    if (!confirm(`Arrêter cette récurrence ?\n\n${label}\n\nPlus aucune occurrence ne sera créée.`))
      return;

    setBusy(r.id);
    try {
      const planned = await futureSlotsOf(r);
      await deleteRecurrenceRule(r.id);

      // Arrêter la règle n'efface pas ce qu'elle a déjà créé : on propose de
      // purger, indispensable quand la récurrence était une erreur.
      if (planned.length) {
        const list = planned.map((p) => `· ${formatDateShort(p.date)}`).join("\n");
        if (
          confirm(
            `Récurrence arrêtée.\n\nAnnuler aussi les ${planned.length} séance${planned.length > 1 ? "s" : ""} déjà planifiée${planned.length > 1 ? "s" : ""} ?\n\n${list}\n\nElles disparaîtront pour les joueurs et leurs demandes seront effacées.`
          )
        ) {
          for (const p of planned) {
            if (r.kind === "tournament") await cancelTournament(p.id);
            else if (r.kind === "lesson") await cancelLesson(p.id);
            else await cancelMatchSlot(p.id);
          }
        }
      }
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
      <p className="mb-3 text-xs leading-5 text-sub">
        En arrêtant une récurrence, l&apos;app propose d&apos;annuler aussi les séances déjà
        planifiées — pratique si elle a été créée par erreur.
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
