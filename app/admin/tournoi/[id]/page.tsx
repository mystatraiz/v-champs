"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addKnownPlayers,
  deleteRegistration,
  deleteTournament,
  getTournament,
  listRegistrations,
  loadAppData,
  savePairNames,
  saveSessionState,
  setRegistrationStatus,
  updateTournament,
} from "@/lib/store";
import { emptyTeam, normalizeName, pairKey } from "@/lib/session";
import { formatDateLong } from "@/lib/format";
import type { AppData } from "@/lib/store";
import type { Registration, SessionState, Team, Tournament } from "@/lib/types";
import { Badge, Btn, Card, Loader, SectionTitle } from "@/components/ui";
import { TeamComposer } from "@/components/TeamComposer";

export default function TournamentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [appData, setAppData] = useState<AppData | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [manualPool, setManualPool] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reload = useCallback(async () => {
    const [t, rs, app] = await Promise.all([getTournament(id), listRegistrations(id), loadAppData()]);
    setTournament(t);
    setRegs(rs);
    setAppData(app);
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

  // Sauvegarde de la composition (débouncée)
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

  const approved = useMemo(() => regs.filter((r) => r.status === "approved"), [regs]);
  const pending = useMemo(() => regs.filter((r) => r.status === "pending"), [regs]);
  const waitlist = useMemo(() => regs.filter((r) => r.status === "waitlist"), [regs]);

  const pool = useMemo(() => {
    const names = new Set<string>();
    approved.forEach((r) => names.add(r.player_name));
    teams.flatMap((t) => t.players).filter((p) => p?.trim()).forEach((p) => names.add(p));
    manualPool.forEach((p) => names.add(p));
    return [...names];
  }, [approved, teams, manualPool]);

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

  const filledCount = teams.flatMap((t) => t.players).filter((p) => p?.trim()).length;
  const gridFull = filledCount === tournament.courts * 4;
  const confirmedNames = [
    ...new Set([
      ...approved.map((r) => r.player_name),
      ...teams.flatMap((t) => t.players).filter((p) => p?.trim()),
    ]),
  ];

  function shareWhatsApp() {
    if (!tournament) return;
    const free = Math.max(0, tournament.capacity - confirmedNames.length);
    const emojis = ["🎾", "🏅", "⚡", "🔥", "💪", "🎯", "🌟", "👊"];
    const lines = [
      `🎾 *Mini Tournoi à ${tournament.capacity} - Niveau ${tournament.level}*`,
      ``,
      `📅 *${formatDateLong(tournament.date)}*`,
      `⏰ *${tournament.time}*`,
      ``,
      confirmedNames.length ? `👥 *Joueurs inscrits (${confirmedNames.length}/${tournament.capacity}) :*` : null,
      ...confirmedNames.map((p, i) => `${emojis[i % emojis.length]} ${p}`),
      ``,
      free === 0 ? `🔴 *Complet !*` : `🟢 *${free} place${free > 1 ? "s" : ""} disponible${free > 1 ? "s" : ""}*`,
      ``,
      `👉 Inscription : ${window.location.origin}/join/${tournament.id}`,
    ].filter((l) => l !== null);
    window.open("https://wa.me/?text=" + encodeURIComponent(lines.join("\n")), "_blank");
  }

  async function startSession() {
    if (!tournament || !appData || busy) return;
    setBusy(true);
    try {
      const cleanTeams = structuredClone(teams).map((t, i) => ({
        ...emptyTeam(i),
        name: t.name || `Équipe ${i + 1}`,
        players: [normalizeName(t.players[0] || ""), normalizeName(t.players[1] || "")] as [string, string],
      }));

      // Mémorise noms d'équipes et joueurs connus
      const pairNameMap = { ...appData.pairNames };
      cleanTeams.forEach((t) => {
        if (t.players[0] && t.players[1] && t.name && !t.name.startsWith("Équipe")) {
          pairNameMap[pairKey(t.players[0], t.players[1])] = t.name;
        }
      });
      await Promise.all([
        savePairNames(pairNameMap),
        addKnownPlayers(cleanTeams.flatMap((t) => t.players), appData.knownPlayers),
      ]);

      const state: SessionState = {
        courts: tournament.courts,
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
        label: tournament.level,
        pairNameMap,
        plannedTournamentId: tournament.id,
      };
      await saveSessionState(state);
      await updateTournament(tournament.id, { status: "started", teams: cleanTeams });
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
            {formatDateLong(tournament.date)} · <span className="text-gold">{tournament.time}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-2">
            <Badge color="gold">Niveau {tournament.level}</Badge>
            <Badge>{tournament.courts} terrain{tournament.courts > 1 ? "s" : ""}</Badge>
            <span className={`text-xs font-bold ${gridFull ? "text-ok" : "text-sub"}`}>
              {filledCount}/{tournament.courts * 4} placés
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

      {(pending.length > 0 || waitlist.length > 0) && (
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
                  <Btn
                    size="sm"
                    variant="success"
                    onClick={async () => {
                      await setRegistrationStatus(r.id, "approved");
                      reload();
                    }}
                  >
                    ✓ Accepter
                  </Btn>
                  <Btn
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await setRegistrationStatus(r.id, "declined");
                      reload();
                    }}
                  >
                    ✕
                  </Btn>
                </>
              )
            )}
            {waitlist.map((r) =>
              regRow(
                r,
                <>
                  <Badge>Attente</Badge>
                  <Btn
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await setRegistrationStatus(r.id, "approved");
                      reload();
                    }}
                  >
                    ✓
                  </Btn>
                </>
              )
            )}
          </Card>
        </div>
      )}

      {approved.length > 0 && (
        <div>
          <SectionTitle>Inscrits confirmés ({approved.length})</SectionTitle>
          <Card className="overflow-hidden">
            {approved.map((r) =>
              regRow(
                r,
                <Btn
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await deleteRegistration(r.id);
                    reload();
                  }}
                >
                  Retirer
                </Btn>
              )
            )}
          </Card>
        </div>
      )}

      <div>
        <SectionTitle>Composition des équipes</SectionTitle>
        <TeamComposer
          teams={teams}
          pool={pool}
          knownPlayers={appData.knownPlayers}
          pairNameMap={appData.pairNames}
          onChange={persistTeams}
          onPoolAdd={(name) => setManualPool((p) => [...new Set([...p, normalizeName(name)])])}
          onPoolRemove={(name) =>
            setManualPool((p) => p.filter((n) => n.toLowerCase() !== name.toLowerCase()))
          }
        />
      </div>

      <div className="space-y-2.5 pt-1">
        <Btn size="lg" disabled={!gridFull || busy} onClick={startSession}>
          {gridFull ? "▶ Lancer la session" : `Placez les ${tournament.courts * 4} joueurs pour lancer`}
        </Btn>
        <div className="flex gap-2">
          <Btn
            variant="secondary"
            className="flex-1"
            onClick={async () => {
              await updateTournament(tournament.id, {
                status: tournament.status === "locked" ? "open" : "locked",
              });
              reload();
            }}
          >
            {tournament.status === "locked" ? "🔓 Rouvrir les inscriptions" : "🔒 Clôturer les inscriptions"}
          </Btn>
          <Btn
            variant="ghost"
            onClick={async () => {
              if (!confirm("Supprimer ce tournoi ?")) return;
              await deleteTournament(tournament.id);
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
