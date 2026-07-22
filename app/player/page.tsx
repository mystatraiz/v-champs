"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  deleteRegistration,
  listRegistrations,
  listTournaments,
  requestRegistration,
} from "@/lib/store";
import { notifyAdmins, notifySpotFreed, notifyWithdrawal } from "@/lib/push";
import { labelIncludesPlayer } from "@/lib/levels";
import { formatDateLong, localDateStr } from "@/lib/format";
import type { Registration, Tournament } from "@/lib/types";
import { Badge, Btn, Card, EmptyState, Loader, SectionTitle } from "@/components/ui";

const STATUS_UI: Record<
  Registration["status"],
  { label: string; color: "gold" | "ok" | "bad" | "sub" }
> = {
  pending: { label: "Demande envoyée — en attente", color: "gold" },
  approved: { label: "Inscription confirmée ✓", color: "ok" },
  declined: { label: "Demande refusée", color: "bad" },
  waitlist: { label: "Liste d'attente", color: "sub" },
};

// Tournois à venir — uniquement ceux qui comprennent le niveau du joueur.
export default function PlayerTournaments() {
  const { profile } = useAuth();
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [ts, rs] = await Promise.all([listTournaments(), listRegistrations()]);
      setTournaments(ts);
      setRegs(rs);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
      setTournaments([]);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const myName = profile?.linked_player_name || profile?.nickname || "";

  // Tournois où le joueur a déjà une inscription (par compte ou par nom).
  const myTournamentIds = useMemo(() => {
    const key = myName.toLowerCase().trim();
    return new Set(
      regs
        .filter(
          (r) =>
            (profile && r.profile_id === profile.id) ||
            (key && r.player_name.toLowerCase().trim() === key)
        )
        .map((r) => r.tournament_id)
    );
  }, [regs, profile, myName]);

  const upcoming = useMemo(() => {
    if (!tournaments) return [];
    const today = localDateStr(new Date());
    return tournaments
      .filter((t) => t.date >= today && (t.status === "open" || t.status === "locked"))
      .filter(
        (t) =>
          // Niveau non défini → tous les tournois ; sinon ceux de son niveau ;
          // et TOUJOURS ceux où il est déjà inscrit (quel que soit le niveau).
          profile?.level == null ||
          labelIncludesPlayer(t.level, profile.level) ||
          myTournamentIds.has(t.id)
      );
  }, [tournaments, profile, myTournamentIds]);

  async function toggleRegistration(t: Tournament, mine: Registration | undefined) {
    if (!profile) return;
    setBusy(t.id);
    try {
      if (mine) {
        const wasApproved = mine.status === "approved";
        await deleteRegistration(mine.id);
        // Désistement : prévient les admins, et si une place confirmée se libère,
        // prévient les joueurs en liste d'attente.
        notifyWithdrawal(myName, t.date, t.time);
        if (wasApproved) notifySpotFreed(t.id, t.date);
      } else {
        await requestRegistration(t.id, myName, profile.id);
        notifyAdmins("registration", myName); // push aux admins (non bloquant)
      }
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(null);
    }
  }

  if (tournaments === null || !profile) return <Loader />;

  return (
    <div className="fade-up space-y-5">
      <div>
        <SectionTitle>Tournois à venir</SectionTitle>

        {!upcoming.length ? (
          <Card>
            <EmptyState>Aucun tournoi à venir pour le moment.</EmptyState>
          </Card>
        ) : (
          <div className="space-y-3">
            {upcoming.map((t) => {
              const tRegs = regs.filter((r) => r.tournament_id === t.id);
              const approved = tRegs.filter((r) => r.status === "approved");
              const mine = tRegs.find(
                (r) =>
                  r.profile_id === profile.id ||
                  (myName && r.player_name.toLowerCase().trim() === myName.toLowerCase().trim())
              );
              const gridNames = (t.teams || [])
                .flatMap((tm) => tm.players)
                .filter((p) => p?.trim());
              const confirmedNames = [
                ...new Set([...approved.map((r) => r.player_name), ...gridNames]),
              ];
              const full = confirmedNames.length >= t.capacity;
              const locked = t.status === "locked";

              return (
                <Card key={t.id} className="overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-extrabold text-bright">
                          {formatDateLong(t.date)}
                          <span className="ml-2 text-gold">{t.time}</span>
                        </div>
                        <div className="mt-1 flex items-center gap-2">
                          <Badge color="gold">Niveau {t.level}</Badge>
                          <span
                            className={`text-[11px] font-bold ${
                              full ? "text-bad" : "text-ok"
                            }`}
                          >
                            {confirmedNames.length}/{t.capacity} confirmés
                          </span>
                        </div>
                      </div>
                      {mine && <Badge color={STATUS_UI[mine.status].color}>{STATUS_UI[mine.status].label}</Badge>}
                    </div>

                    {confirmedNames.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {confirmedNames.map((n) => (
                          <span
                            key={n}
                            className="rounded-full bg-card2 px-2.5 py-1 text-[11px] font-semibold text-sub"
                          >
                            {n}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="mt-4">
                      {mine ? (
                        mine.status !== "declined" && (
                          <Btn
                            variant="ghost"
                            size="sm"
                            disabled={busy === t.id}
                            onClick={() => toggleRegistration(t, mine)}
                          >
                            ✕ Annuler ma {mine.status === "approved" ? "participation" : "demande"}
                          </Btn>
                        )
                      ) : locked ? (
                        <p className="text-xs font-semibold text-mut">
                          Inscriptions clôturées par l&apos;organisateur.
                        </p>
                      ) : (
                        <Btn
                          size="sm"
                          disabled={busy === t.id}
                          onClick={() => toggleRegistration(t, undefined)}
                        >
                          {full ? "Rejoindre la liste d'attente" : "🎾 Demander ma place"}
                        </Btn>
                      )}
                    </div>
                  </div>
                  <div className="h-1 bg-line">
                    <div
                      className={`h-full transition-all ${full ? "bg-ok" : "bg-gold"}`}
                      style={{
                        width: `${Math.min(100, Math.round((confirmedNames.length / t.capacity) * 100))}%`,
                      }}
                    />
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {error && (
        <Card tone="danger" className="p-3 text-xs text-bad">
          {error} — si les tables v2 n&apos;existent pas encore, exécutez le script{" "}
          <code>supabase/migration.sql</code>.
        </Card>
      )}
    </div>
  );
}
