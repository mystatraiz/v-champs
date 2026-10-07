"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/use-app-data";
import {
  deleteTrainingSession,
  loadTrainingSessions,
  newTrainingId,
  saveTrainingSession,
} from "@/lib/store";
import {
  PLAYER_COLORS,
  PLAYER_SLOTS,
  allTrainingPlayers,
  countEvents,
  formatTrainingText,
  pct,
  playerTrainingHistory,
  signed,
  trainingAverages,
  trainingTrend,
  type TrainingLive,
  type TrainingSession,
} from "@/lib/training";
import { formatDateShort } from "@/lib/format";
import { openWhatsApp } from "@/lib/share";
import { normalizeName } from "@/lib/session";
import { PlayerAutocomplete } from "@/components/PlayerAutocomplete";
import { TrainingSummary } from "@/components/admin/TrainingSummary";
import { LiveTracker } from "@/components/admin/TrainingLive";
import { Btn, Card, EmptyState, Loader, Modal, SectionTitle } from "@/components/ui";

const LIVE_KEY = "vchamps_training_live";
type Names = [string, string, string, string];

function readLive(): TrainingLive | null {
  try {
    const raw = localStorage.getItem(LIVE_KEY);
    return raw ? (JSON.parse(raw) as TrainingLive) : null;
  } catch {
    return null;
  }
}
function writeLive(live: TrainingLive | null) {
  try {
    if (live) localStorage.setItem(LIVE_KEY, JSON.stringify(live));
    else localStorage.removeItem(LIVE_KEY);
  } catch {
    /* stockage indisponible (navigation privée) : le match continue en mémoire */
  }
}

// ─── Progression d'un joueur ───
function Trend({ value, goodWhenUp }: { value: number | undefined; goodWhenUp: boolean }) {
  if (value === undefined || Math.abs(value) < 0.005) return null;
  const good = goodWhenUp ? value > 0 : value < 0;
  return (
    <span className={`ml-1 text-[10px] font-extrabold ${good ? "text-ok" : "text-bad"}`}>
      {value > 0 ? "▲" : "▼"}
    </span>
  );
}

function Progression({ sessions }: { sessions: TrainingSession[] }) {
  const names = useMemo(() => allTrainingPlayers(sessions), [sessions]);
  const [player, setPlayer] = useState<string>("");
  const selected = player || names[0] || "";
  const rows = useMemo(() => playerTrainingHistory(sessions, selected), [sessions, selected]);
  const avg = trainingAverages(rows);
  const trend = trainingTrend(rows);

  if (!names.length) {
    return (
      <Card>
        <EmptyState>Aucun match enregistré pour l&apos;instant.</EmptyState>
      </Card>
    );
  }

  const tile = (label: string, value: string, t?: React.ReactNode) => (
    <div className="rounded-lg bg-card2 px-2 py-2 text-center">
      <div className="text-base font-extrabold text-bright">
        {value}
        {t}
      </div>
      <div className="text-[9px] font-bold uppercase tracking-wider text-mut">{label}</div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {names.map((n) => (
          <button
            key={n}
            onClick={() => setPlayer(n)}
            className={`shrink-0 cursor-pointer rounded-full border px-3 py-1.5 text-xs font-bold ${
              n === selected ? "border-gold bg-gold text-ink" : "border-line2 text-sub"
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {avg && (
        <Card className="p-3">
          <div className="grid grid-cols-3 gap-1.5">
            {tile("Matchs", String(avg.matches))}
            {tile("Balles / match", String(Math.round(avg.ballsPerMatch)))}
            {tile("Part du jeu", pct(avg.share))}
            {tile("Gagnants", pct(avg.winnerRate), <Trend value={trend?.winnerRate} goodWhenUp />)}
            {tile("Fautes", pct(avg.errorRate), <Trend value={trend?.errorRate} goodWhenUp={false} />)}
            {tile(
              "Net / match",
              signed(Math.round(avg.netPerMatch * 10) / 10),
              <Trend value={trend?.netPerMatch} goodWhenUp />
            )}
          </div>
          <p className="mt-2 text-[10px] leading-4 text-mut">
            {trend
              ? "▲▼ : les 3 derniers matchs comparés aux précédents (vert = progrès)."
              : "La tendance apparaît à partir de 4 matchs."}{" "}
            % calculés sur l&apos;ensemble des balles touchées.
          </p>
        </Card>
      )}

      <Card className="overflow-hidden">
        {rows.map((r, i) => (
          <div
            key={r.sessionId}
            className={`flex items-center gap-2 px-3 py-2 text-[13px] ${
              i < rows.length - 1 ? "border-b border-line/60" : ""
            }`}
          >
            <span className="w-14 shrink-0 text-[11px] text-mut">{formatDateShort(r.date)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs text-sub">
                {r.side === "G" ? "Gauche" : "Droite"} · avec {r.partner}
              </span>
              <span className="block text-[10px] text-mut">
                {r.balls} balles ({pct(r.share)}) · {pct(r.winnerRate)} G · {pct(r.errorRate)} F
              </span>
            </span>
            <span className="shrink-0 text-xs font-bold text-ok">✓{r.winners}</span>
            <span className="shrink-0 text-xs font-bold text-bad">✗{r.errors}</span>
            <span
              className={`w-9 shrink-0 text-end font-extrabold ${
                r.net > 0 ? "text-ok" : r.net < 0 ? "text-bad" : "text-sub"
              }`}
            >
              {signed(r.net)}
            </span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// ─── Page ───
export default function TrainingTool() {
  const router = useRouter();
  const { profile } = useAuth();
  const { data } = useAppData();
  const isAdmin = profile?.role === "admin";

  const [tab, setTab] = useState<"match" | "historique" | "progression">("match");
  const [sessions, setSessions] = useState<TrainingSession[] | null>(null);
  const [names, setNames] = useState<Names>(["", "", "", ""]);
  const [live, setLive] = useState<TrainingLive | null>(null);
  const [shown, setShown] = useState<TrainingSession | null>(null);
  const [saving, setSaving] = useState(false);
  const liveRef = useRef<TrainingLive | null>(null);

  // Outil réservé aux admins (les organisateurs n'y ont pas accès).
  useEffect(() => {
    if (profile && !isAdmin) router.replace("/admin");
  }, [profile, isAdmin, router]);

  const reload = useCallback(() => {
    loadTrainingSessions()
      .then(setSessions)
      .catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    reload();
    const saved = readLive();
    if (saved) {
      setLive(saved);
      liveRef.current = saved;
    }
  }, [reload]);

  const updateLive = (next: TrainingLive | null) => {
    liveRef.current = next;
    setLive(next);
    writeLive(next);
  };

  const knownPlayers = useMemo(() => {
    const set = new Set<string>(data?.knownPlayers || []);
    (sessions || []).forEach((s) => s.players.forEach((p) => set.add(p)));
    return [...set];
  }, [data, sessions]);

  if (!profile || !isAdmin || sessions === null) return <Loader />;

  const cleanNames = names.map((n) => normalizeName(n)) as Names;
  const ready =
    cleanNames.every(Boolean) && new Set(cleanNames.map((n) => n.toLowerCase())).size === 4;

  function setName(i: number, v: string) {
    setNames((prev) => {
      const next = [...prev] as Names;
      next[i] = v;
      return next;
    });
  }

  function swapSides(team: 1 | 2) {
    const a = team === 1 ? 0 : 2;
    setNames((prev) => {
      const next = [...prev] as Names;
      [next[a], next[a + 1]] = [next[a + 1], next[a]];
      return next;
    });
  }

  function start() {
    if (!ready) return;
    updateLive({ startedAt: new Date().toISOString(), players: cleanNames, events: [] });
  }

  async function finish() {
    const cur = liveRef.current;
    if (!cur || saving) return;
    if (!cur.events.length) {
      if (confirm("Aucune statistique saisie. Quitter sans enregistrer ?")) updateLive(null);
      return;
    }
    if (!confirm("Terminer le match et enregistrer les statistiques ?")) return;
    setSaving(true);
    try {
      const counts = countEvents(cur.events);
      const session: TrainingSession = {
        id: newTrainingId(),
        date: cur.startedAt,
        endedAt: new Date().toISOString(),
        players: cur.players,
        ...counts,
        created_by: profile?.id ?? null,
      };
      await saveTrainingSession(session);
      updateLive(null);
      setShown(session);
      reload();
    } catch (e) {
      alert(
        `Enregistrement impossible (${e instanceof Error ? e.message : "erreur réseau"}). Le match est conservé : réessaie dans un instant.`
      );
    } finally {
      setSaving(false);
    }
  }

  if (live) {
    return (
      <LiveTracker
        live={live}
        onEvent={(p, k) => {
          const cur = liveRef.current;
          if (cur) updateLive({ ...cur, events: [...cur.events, { p, k }] });
        }}
        onUndo={() => {
          const cur = liveRef.current;
          if (cur?.events.length) updateLive({ ...cur, events: cur.events.slice(0, -1) });
        }}
        onFinish={finish}
        onAbort={() => {
          if (confirm("Abandonner ce match ? Les statistiques saisies seront perdues.")) updateLive(null);
        }}
        onFlip={() => {
          const cur = liveRef.current;
          if (cur) updateLive({ ...cur, flipped: !cur.flipped });
        }}
      />
    );
  }

  return (
    <div className="fade-up space-y-4">
      <div className="flex items-center gap-3">
        <Btn variant="ghost" size="sm" onClick={() => router.push("/admin/joueurs")}>←</Btn>
        <div>
          <h1 className="text-lg font-extrabold text-bright">🎯 Stats d&apos;entraînement</h1>
          <p className="text-[11px] text-mut">Balles touchées, gagnants et fautes directes</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded-lg bg-surface p-1">
        {(
          [
            ["match", "Nouveau match"],
            ["historique", `Historique (${sessions.length})`],
            ["progression", "Progression"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`cursor-pointer rounded-md px-1 py-2 text-[12px] font-bold leading-tight ${
              tab === k ? "bg-gold text-ink" : "text-sub"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "match" && (
        <div className="space-y-3">
          {([1, 2] as const).map((team) => {
            const a = team === 1 ? 0 : 2;
            return (
              <Card key={team} className="space-y-2.5 p-3.5">
                <div className="flex items-center justify-between">
                  <SectionTitle className="mb-0">
                    Équipe {team}{" "}
                    <span className="font-semibold normal-case tracking-normal text-mut">
                      · {team === 1 ? "en face de toi" : "de ton côté"}
                    </span>
                  </SectionTitle>
                  <button
                    onClick={() => swapSides(team)}
                    className="cursor-pointer rounded-lg border border-line2 px-2.5 py-1 text-xs font-bold text-sub"
                    title="Échanger gauche et droite"
                  >
                    ⇄ Gauche / Droite
                  </button>
                </div>
                {[a, a + 1].map((i) => (
                  <div key={i}>
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-sub">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLAYER_COLORS[i] }} />
                      {PLAYER_SLOTS[i].side === "G" ? "Joueur gauche" : "Joueur droit"}
                    </div>
                    <PlayerAutocomplete
                      value={names[i]}
                      onChange={(v) => setName(i, v)}
                      onPick={(v) => setName(i, v)}
                      options={knownPlayers}
                      exclude={names.filter((_, j) => j !== i)}
                    />
                  </div>
                ))}
              </Card>
            );
          })}
          <Btn size="lg" disabled={!ready} onClick={start}>
            {ready ? "▶ Commencer la saisie" : "Renseigne 4 joueurs différents"}
          </Btn>
          <p className="px-1 text-[11px] leading-5 text-mut">
            Pendant le match : un tap sur la case d&apos;un joueur = une balle touchée (hors
            service). Rouge = faute directe, vert = point gagnant : ils comptent aussi comme une balle
            touchée. L&apos;écran est vu de derrière le terrain : l&apos;équipe d&apos;en face est
            affichée en miroir (son joueur de gauche à droite). Au changement de côté, le bouton 🔄 Côtés fait pivoter les places : le joueur en haut à
            gauche passe en bas à droite. L&apos;écran reste allumé et le match en cours est conservé
            si l&apos;appli se ferme.
          </p>
        </div>
      )}

      {tab === "historique" &&
        (sessions.length === 0 ? (
          <Card>
            <EmptyState>Aucun match enregistré.</EmptyState>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {sessions.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setShown(s)}
                className={`flex w-full cursor-pointer items-center gap-3 px-3.5 py-3 text-left text-sm hover:bg-card2 ${
                  i < sessions.length - 1 ? "border-b border-line/60" : ""
                }`}
              >
                <span className="w-14 shrink-0 text-xs text-mut">{formatDateShort(s.date)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-body">
                    {s.players[0]} / {s.players[1]}
                  </span>
                  <span className="block truncate text-xs text-sub">
                    vs {s.players[2]} / {s.players[3]}
                  </span>
                </span>
                <span className="shrink-0 text-mut">›</span>
              </button>
            ))}
          </Card>
        ))}

      {tab === "progression" && <Progression sessions={sessions} />}

      <Modal open={!!shown} onClose={() => setShown(null)}>
        {shown && (
          <div>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-extrabold text-bright">Match d&apos;entraînement</h3>
                <p className="text-xs text-mut">{formatDateShort(shown.date)}</p>
              </div>
              <button
                onClick={() => openWhatsApp(formatTrainingText(shown))}
                title="Partager sur WhatsApp"
                className="cursor-pointer rounded-lg bg-[#25D366] px-2.5 py-1.5 text-sm font-extrabold text-white"
              >
                📲
              </button>
            </div>
            <TrainingSummary session={shown} />
            <div className="mt-4 flex gap-2">
              <Btn className="flex-1" onClick={() => setShown(null)}>
                Fermer
              </Btn>
              <Btn
                variant="ghost"
                onClick={async () => {
                  if (!confirm("Supprimer définitivement ce match de l'historique ?")) return;
                  await deleteTrainingSession(shown.id);
                  setShown(null);
                  reload();
                }}
              >
                🗑
              </Btn>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
