"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addApprovedPlayer,
  addKnownPlayers,
  deleteRegistration,
  deleteTournament,
  getTournament,
  listProfiles,
  listRegistrations,
  loadAppData,
  savePairNames,
  saveSessionState,
  setRegistrationStatus,
  updateTournament,
} from "@/lib/store";
import { notifyPlayer, notifyTournamentFull } from "@/lib/push";
import { computeCombinedRanking } from "@/lib/scoring";
import { autoPlace, emptyTeam, normalizeName, pairKey, rebalanceTeams } from "@/lib/session";
import { formatDateLong } from "@/lib/format";
import type { AppData } from "@/lib/store";
import type { Profile, Registration, SessionState, Team, Tournament } from "@/lib/types";
import { Badge, Btn, Card, Loader, SectionTitle } from "@/components/ui";
import { TeamComposer } from "@/components/TeamComposer";

type Side = "left" | "right" | "any";

export default function TournamentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const [t, rs, app, profs] = await Promise.all([
      getTournament(id),
      listRegistrations(id),
      loadAppData(),
      listProfiles().catch(() => [] as Profile[]),
    ]);
    setTournament(t);
    setRegs(rs);
    setAppData(app);
    setProfiles(profs);
    if (t) {
      const base = t.teams?.length
        ? (t.teams as Team[])
        : Array.from({ length: t.courts * 2 }, (_, i) => emptyTeam(i));
      setTeams(structuredClone(base));
    }
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const persistTeams = useCallback(
    (next: Team[]) => {
      setTeams(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        updateTournament(id, { teams: next }).catch(() => {});
      }, 600);
    },
    [id]
  );

  // Force V-Champs (classement) par nom, pour l'équilibrage.
  const strengthMap = useMemo(() => {
    const m = new Map<string, number>();
    if (appData) {
      computeCombinedRanking(appData.scores, appData.history, null, null).forEach((r) =>
        m.set(r.key, r.score)
      );
    }
    return m;
  }, [appData]);

  const profById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);
  const profByName = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => {
      if (p.linked_player_name) m.set(p.linked_player_name.toLowerCase().trim(), p);
    });
    return m;
  }, [profiles]);

  const strengthOf = useCallback(
    (name: string) => strengthMap.get(name.toLowerCase().trim()) ?? 0,
    [strengthMap]
  );
  const sideOf = useCallback(
    (name: string, profileId: string | null): Side => {
      const byId = profileId ? profById.get(profileId) : undefined;
      const byName = profByName.get(name.toLowerCase().trim());
      return ((byId?.preferred_side || byName?.preferred_side || "any") as Side) || "any";
    },
    [profById, profByName]
  );

  const pending = useMemo(() => regs.filter((r) => r.status === "pending"), [regs]);
  const waitlist = useMemo(() => regs.filter((r) => r.status === "waitlist"), [regs]);

  if (tournament === undefined || !appData) return <Loader />;
  if (!tournament) {
    return (
      <Card className="p-6 text-center text-sm text-bad">
        Tournoi introuvable.
        <div className="mt-3">
          <Btn variant="secondary" size="sm" onClick={() => router.push("/admin")}>← Retour</Btn>
        </div>
      </Card>
    );
  }

  const t = tournament;
  const filledCount = teams.flatMap((tm) => tm.players).filter((p) => p?.trim()).length;
  const gridFull = filledCount === t.courts * 4;
  const confirmedNames = [
    ...new Set(teams.flatMap((tm) => tm.players).filter((p) => p?.trim())),
  ];

  // ── Placement automatique d'un joueur (côté + équilibrage) ──
  async function placeByName(name: string, profileId: string | null): Promise<boolean> {
    const { teams: next, placed } = autoPlace(
      teams,
      { name, side: sideOf(name, profileId), strength: strengthOf(name) },
      strengthOf
    );
    if (placed) {
      setTeams(next);
      await updateTournament(t.id, { teams: next });
    }
    return placed;
  }

  async function acceptRegistration(r: Registration) {
    setBusy(true);
    try {
      const placed = await placeByName(r.player_name, r.profile_id);
      await setRegistrationStatus(r.id, placed ? "approved" : "waitlist");
      if (r.profile_id) {
        if (placed)
          notifyPlayer(
            r.profile_id,
            "Inscription confirmée ✅",
            `Ta place au tournoi du ${formatDateLong(t.date)} (${t.time}) est confirmée !`
          );
        else
          notifyPlayer(
            r.profile_id,
            "Liste d'attente ⏳",
            `Le tournoi du ${formatDateLong(t.date)} est complet — tu es en liste d'attente.`
          );
      }
      if (placed && filledCount + 1 >= t.capacity) notifyTournamentFull(t.date, t.time);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function declineRegistration(r: Registration) {
    await setRegistrationStatus(r.id, "declined");
    if (r.profile_id)
      notifyPlayer(
        r.profile_id,
        "Demande non retenue",
        `Ta demande pour le tournoi du ${formatDateLong(t.date)} n'a pas pu être retenue.`
      );
    reload();
  }

  async function addPlayer(name: string) {
    const nm = normalizeName(name);
    if (!nm) return;
    const placed = await placeByName(nm, null);
    await addApprovedPlayer(t.id, nm, placed ? "approved" : "waitlist");
    reload();
  }

  async function removePlayer(name: string) {
    const key = name.toLowerCase().trim();
    const next = teams.map((tm) => ({
      ...tm,
      players: tm.players.map((p) => (p?.toLowerCase().trim() === key ? "" : p)) as [string, string],
    }));
    setTeams(next);
    await updateTournament(t.id, { teams: next });
    const reg = regs.find((r) => r.player_name.toLowerCase().trim() === key);
    if (reg) await setRegistrationStatus(reg.id, "waitlist");
    else await addApprovedPlayer(t.id, name, "waitlist");
    reload();
  }

  function rebalance() {
    const placedPlayers = teams.flatMap((tm) => tm.players).filter((p) => p?.trim());
    if (!placedPlayers.length) return;
    const players = placedPlayers.map((name) => ({
      name,
      side: sideOf(name, null),
      strength: strengthOf(name),
    }));
    persistTeams(rebalanceTeams(teams, players, strengthOf));
  }

  function shareWhatsApp() {
    const free = Math.max(0, t.capacity - confirmedNames.length);
    const emojis = ["🎾", "🏅", "⚡", "🔥", "💪", "🎯", "🌟", "👊"];
    const lines = [
      `🎾 *Mini Tournoi à ${t.capacity} - Niveau ${t.level}*`,
      ``,
      `📅 *${formatDateLong(t.date)}*`,
      `⏰ *${t.time}*`,
      ``,
      confirmedNames.length ? `👥 *Joueurs inscrits (${confirmedNames.length}/${t.capacity}) :*` : null,
      ...confirmedNames.map((p, i) => `${emojis[i % emojis.length]} ${p}`),
      ``,
      free === 0 ? `🔴 *Complet !*` : `🟢 *${free} place${free > 1 ? "s" : ""} disponible${free > 1 ? "s" : ""}*`,
      ``,
      `👉 Inscription : ${window.location.origin}/join/${t.id}`,
    ].filter((l) => l !== null);
    window.open("https://wa.me/?text=" + encodeURIComponent(lines.join("\n")), "_blank");
  }

  async function startSession() {
    if (!appData || busy) return;
    setBusy(true);
    try {
      const cleanTeams = structuredClone(teams).map((tm, i) => ({
        ...emptyTeam(i),
        name: tm.name || `Équipe ${i + 1}`,
        players: [normalizeName(tm.players[0] || ""), normalizeName(tm.players[1] || "")] as [string, string],
      }));
      const pairNameMap = { ...appData.pairNames };
      cleanTeams.forEach((tm) => {
        if (tm.players[0] && tm.players[1] && tm.name && !tm.name.startsWith("Équipe")) {
          pairNameMap[pairKey(tm.players[0], tm.players[1])] = tm.name;
        }
      });
      await Promise.all([
        savePairNames(pairNameMap),
        addKnownPlayers(cleanTeams.flatMap((tm) => tm.players), appData.knownPlayers),
      ]);
      const state: SessionState = {
        courts: t.courts,
        teams: cleanTeams,
        matches: [],
        matchCounter: 0,
        roundNum: 0,
        activeMatches: [],
        sessionStarted: true,
        sessionFinished: false,
        matchPhaseStarted: true,
        sessionArchivedAt: null,
        warmupStart: null,
        label: t.level,
        pairNameMap,
        plannedTournamentId: t.id,
      };
      await saveSessionState(state);
      await updateTournament(t.id, { status: "started", teams: cleanTeams });
      router.push("/admin/session");
    } finally {
      setBusy(false);
    }
  }

  const regRow = (r: Registration, actions: React.ReactNode) => (
    <div key={r.id} className="flex items-center gap-2.5 border-b border-line/60 px-3.5 py-2.5 last:border-0">
      <div className="min-w-0 flex-1">
        <span className="text-sm font-bold text-body">{r.player_name}</span>
        {r.is_guest && <span className="ml-2 text-[10px] font-bold uppercase text-mut">invité</span>}
        {!r.is_guest && r.profile_id && <span className="ml-1.5 text-[11px] text-gold">⭐</span>}
      </div>
      {actions}
    </div>
  );

  return (
    <div className="fade-up space-y-5">
      <div className="flex items-center gap-3">
        <Btn variant="ghost" size="sm" onClick={() => router.push("/admin")}>←</Btn>
        <div className="flex-1">
          <div className="font-extrabold text-bright">
            {formatDateLong(t.date)} · <span className="text-gold">{t.time}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <Badge color="gold">Niveau {t.level}</Badge>
            <Badge>{t.courts} terrain{t.courts > 1 ? "s" : ""}</Badge>
            <span className={`text-xs font-bold ${gridFull ? "text-ok" : "text-sub"}`}>
              {filledCount}/{t.courts * 4} placés
            </span>
          </div>
        </div>
        <button
          onClick={shareWhatsApp}
          className="cursor-pointer rounded-lg bg-[#25D366] px-3 py-2 text-sm font-extrabold text-white"
          title="Partager sur WhatsApp"
        >
          📲
        </button>
      </div>

      {pending.length > 0 && (
        <div>
          <SectionTitle>
            Demandes d&apos;inscription{" "}
            <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[10px] font-extrabold text-white">
              {pending.length}
            </span>
          </SectionTitle>
          <Card className="overflow-hidden">
            {pending.map((r) =>
              regRow(
                r,
                <>
                  <Btn size="sm" variant="success" disabled={busy} onClick={() => acceptRegistration(r)}>
                    ✓ Accepter &amp; placer
                  </Btn>
                  <Btn size="sm" variant="ghost" onClick={() => declineRegistration(r)}>
                    ✕
                  </Btn>
                </>
              )
            )}
          </Card>
          <p className="mt-1.5 px-1 text-[11px] text-mut">
            À l&apos;acceptation, le joueur est placé automatiquement selon son côté préféré et pour
            équilibrer les équipes (ou en liste d&apos;attente si complet).
          </p>
        </div>
      )}

      {waitlist.length > 0 && (
        <div>
          <SectionTitle>Liste d&apos;attente ({waitlist.length})</SectionTitle>
          <Card className="overflow-hidden">
            {waitlist.map((r) =>
              regRow(
                r,
                <>
                  <Btn
                    size="sm"
                    variant="secondary"
                    disabled={busy || gridFull}
                    onClick={() => acceptRegistration(r)}
                  >
                    Placer
                  </Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await deleteRegistration(r.id);
                      reload();
                    }}
                  >
                    ✕
                  </Btn>
                </>
              )
            )}
          </Card>
        </div>
      )}

      <div>
        <div className="mb-2.5 flex items-center justify-between">
          <SectionTitle className="mb-0">Composition des équipes</SectionTitle>
          <Btn size="sm" variant="secondary" disabled={filledCount < 2} onClick={rebalance}>
            ⚖️ Rééquilibrer
          </Btn>
        </div>
        <TeamComposer
          teams={teams}
          knownPlayers={appData.knownPlayers}
          onChange={persistTeams}
          onAddPlayer={addPlayer}
          onRemovePlayer={removePlayer}
        />
      </div>

      <div className="space-y-2.5 pt-1">
        <Btn size="lg" disabled={!gridFull || busy} onClick={startSession}>
          {gridFull ? "▶ Lancer la session" : `Placez les ${t.courts * 4} joueurs pour lancer`}
        </Btn>
        <div className="flex gap-2">
          <Btn
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              await updateTournament(t.id, {
                status: t.status === "locked" ? "open" : "locked",
              });
              reload();
            }}
          >
            {t.status === "locked" ? "🔓 Rouvrir les inscriptions" : "🔒 Clôturer les inscriptions"}
          </Btn>
          <Btn
            variant="ghost"
            onClick={async () => {
              if (!confirm("Supprimer ce tournoi ?")) return;
              await deleteTournament(t.id);
              router.push("/admin");
            }}
          >
            🗑
          </Btn>
        </div>
      </div>
    </div>
  );
}
