"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  adminResetPassword,
  listProfiles,
  markUserNotificationRead,
  replacePlayerInSession,
  updateProfile,
} from "@/lib/store";
import { useAppData } from "@/lib/use-app-data";
import type { AppData } from "@/lib/store";
import { PLAYER_LEVELS } from "@/lib/levels";
import { formatDateShort, playerIdentity, uniquePlayerIdentity } from "@/lib/format";
import { PlayerAutocomplete } from "@/components/PlayerAutocomplete";
import { StatsPanel } from "@/components/admin/StatsPanel";
import { notificationPermission, updateAppBadge } from "@/lib/badge";
import { notifyPlayer, pushSupported, subscribeAdminPush } from "@/lib/push";
import type { Profile, Role } from "@/lib/types";
import {
  Avatar,
  Badge,
  Btn,
  Card,
  CollapsibleCard,
  EmptyState,
  Input,
  Loader,
  Modal,
  SectionTitle,
  Select,
} from "@/components/ui";

// Encart : notifications push + badge sur l'icône de l'écran d'accueil.
function BadgeSettings({ role }: { role: string }) {
  const [perm, setPerm] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setPerm(notificationPermission());
    setSupported(pushSupported());
  }, []);

  async function activate() {
    setBusy(true);
    try {
      const ok = await subscribeAdminPush(role);
      setPerm(notificationPermission());
      if (ok) updateAppBadge(0);
      else if (Notification.permission !== "denied")
        alert(
          "Impossible d'activer les notifications. Assure-toi d'avoir ajouté l'app à l'écran d'accueil et de l'ouvrir depuis cette icône."
        );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="mb-3 text-xs leading-5 text-sub">
        Reçois une <b className="text-body">notification</b> et une <b className="text-body">pastille sur
        l&apos;icône</b> — même app fermée — dès qu&apos;un joueur s&apos;inscrit à une partie ou qu&apos;un
        nouveau compte attend ta validation.
      </p>
      <ol className="mb-3 list-decimal space-y-1 pl-4 text-xs leading-5 text-sub">
        <li>
          Ajoute l&apos;app à ton écran d&apos;accueil : bouton <b className="text-body">Partager</b> de
          Safari → <b className="text-body">« Sur l&apos;écran d&apos;accueil »</b>.
        </li>
        <li>Ouvre l&apos;app depuis cette icône, puis active les notifications ci-dessous.</li>
      </ol>
      {perm === "unsupported" || !supported ? (
        <p className="text-xs text-mut">
          Les notifications push nécessitent d&apos;ouvrir l&apos;app depuis l&apos;icône de l&apos;écran
          d&apos;accueil (pas un simple onglet Safari). Les pastilles restent visibles dans l&apos;app.
        </p>
      ) : perm === "granted" ? (
        <div className="text-sm font-bold text-ok">
          ✓ Notifications activées sur cet appareil.
          <button
            onClick={activate}
            className="ml-2 cursor-pointer text-xs font-semibold text-sub underline"
          >
            réactiver
          </button>
        </div>
      ) : perm === "denied" ? (
        <p className="text-xs font-semibold text-bad">
          Notifications refusées. Autorise-les dans Réglages iOS → Notifications → V-Champs, puis
          reviens ici.
        </p>
      ) : (
        <Btn size="lg" disabled={busy} onClick={activate}>
          {busy ? "Activation…" : "🔔 Activer les notifications"}
        </Btn>
      )}
    </Card>
  );
}

// Liste tous les noms de joueurs distincts trouvés dans les données, avec le
// nombre de sessions où ils apparaissent (aide à repérer les doublons).
function collectPlayerNames(data: AppData): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  const add = (n: string | undefined) => {
    const t = (n || "").trim();
    if (t) counts.set(t, (counts.get(t) || 0) + 1);
  };
  data.history.forEach((s) => (s.teams || []).forEach((t) => (t.players || []).forEach(add)));
  data.scores.forEach((r) => add(r.player_name));
  data.knownPlayers.forEach(add);
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

// Outil admin : corriger un joueur sur UNE session (erreur d'homonyme le jour J).
// Les autres sessions de ce joueur ne bougent pas.
function SessionFixTool({ data, onDone }: { data: AppData; onDone: () => void }) {
  const [sessionId, setSessionId] = useState("");
  const [wrong, setWrong] = useState("");
  const [right, setRight] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // Sessions les plus récentes d'abord.
  const sessions = useMemo(
    () => [...data.history].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30),
    [data.history]
  );
  const session = sessions.find((s) => s.date === sessionId);
  const participants = useMemo(
    () =>
      session
        ? [...new Set((session.teams || []).flatMap((t) => t.players).filter(Boolean))].sort()
        : [],
    [session]
  );
  const knownNames = useMemo(() => collectPlayerNames(data).map((n) => n.name), [data]);

  async function apply() {
    if (!sessionId || !wrong || !right.trim()) return;
    if (wrong.toLowerCase().trim() === right.toLowerCase().trim()) {
      setMsg("Les deux noms sont identiques.");
      return;
    }
    if (
      !confirm(
        `Sur la session du ${formatDateShort(sessionId)} uniquement :\n« ${wrong} » devient « ${right.trim()} ».\n\nLes matchs et les points V-Champs de cette session passent à ${right.trim()}. Les autres sessions de « ${wrong} » ne changent pas.\n\nContinuer ?`
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await replacePlayerInSession(sessionId, wrong, right.trim());
      setMsg(`✓ Corrigé sur la session du ${formatDateShort(sessionId)}.`);
      setWrong("");
      setRight("");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur pendant la correction.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="mb-3 text-xs leading-5 text-sub">
        L&apos;organisateur s&apos;est trompé de joueur sur une session (deux homonymes, par
        exemple) ? Remplace-le <b className="text-body">sur cette session seulement</b> : les
        matchs et les points V-Champs du jour passent au bon joueur, tout son autre historique
        reste intact.
      </p>
      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
            Session concernée
          </label>
          <Select
            value={sessionId}
            onChange={(e) => {
              setSessionId(e.target.value);
              setWrong("");
              setMsg(null);
            }}
          >
            <option value="">— Choisir la session —</option>
            {sessions.map((s) => (
              <option key={s.date} value={s.date}>
                {formatDateShort(s.date)} · {s.label || "?"}
              </option>
            ))}
          </Select>
        </div>
        {sessionId && (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Joueur inscrit par erreur
            </label>
            <Select value={wrong} onChange={(e) => setWrong(e.target.value)}>
              <option value="">— Choisir le joueur à remplacer —</option>
              {participants.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </Select>
          </div>
        )}
        {wrong && (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Joueur qui a réellement joué
            </label>
            <PlayerAutocomplete
              value={right}
              onChange={setRight}
              onPick={setRight}
              options={knownNames}
              exclude={participants}
              placeholder="Nom du bon joueur"
            />
          </div>
        )}
      </div>
      {msg && (
        <p className={`mt-2 text-xs font-semibold ${msg.startsWith("✓") ? "text-ok" : "text-bad"}`}>
          {msg}
        </p>
      )}
      <Btn
        className="mt-3"
        size="lg"
        disabled={busy || !sessionId || !wrong || !right.trim()}
        onClick={apply}
      >
        {busy ? "Correction en cours…" : "Corriger cette session"}
      </Btn>
    </Card>
  );
}

const ROLE_LABEL: Record<Role, string> = {
  pending: "En attente",
  player: "🎾 Joueur",
  organisateur: "📋 Organisateur",
  admin: "⚙️ Admin",
};

// Validation d'un compte en attente : rôle + niveau + liaison joueur.
function PendingCard({
  p,
  knownPlayers,
  takenNames,
  onValidated,
}: {
  p: Profile;
  knownPlayers: string[];
  takenNames: string[];
  onValidated: () => void;
}) {
  const [role, setRole] = useState<Role>("player");
  const [level, setLevel] = useState<string>("");
  const [linked, setLinked] = useState("");
  const [busy, setBusy] = useState(false);

  // Identité unique proposée pour un nouveau joueur (allongée si collision).
  const suggested = uniquePlayerIdentity(p.first_name, p.last_name, takenNames);

  async function validate() {
    setBusy(true);
    try {
      await updateProfile(p.id, {
        role,
        level: role === "player" && level ? Number(level) : p.level,
        linked_player_name: role === "player" ? linked || suggested : null,
      });
      await markUserNotificationRead(p.id);
      notifyPlayer(
        p.id,
        "Compte validé 🎾",
        role === "player"
          ? "Ton compte est activé ! Tes statistiques et le classement V-Champs sont disponibles."
          : "Ton compte est activé, bienvenue sur V-Champs !"
      );
      onValidated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-3">
        <Avatar name={`${p.first_name} ${p.last_name}`} />
        <div>
          <div className="font-bold text-bright">
            {p.first_name} «{p.nickname}» {p.last_name.toUpperCase()}
          </div>
          <div className="text-xs text-sub">
            {p.handedness === "right" ? "Droitier" : "Gaucher"} · Côté{" "}
            {{ left: "gauche", right: "droit", any: "peu importe" }[p.preferred_side]}
          </div>
        </div>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1.5">
        {(["player", "organisateur", "admin"] as Role[]).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`cursor-pointer rounded-lg border py-2 text-xs font-bold transition-colors ${
              role === r ? "border-gold bg-gold text-ink" : "border-line2 text-sub hover:text-body"
            }`}
          >
            {ROLE_LABEL[r]}
          </button>
        ))}
      </div>

      {role === "player" && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Niveau
            </label>
            <Select value={level} onChange={(e) => setLevel(e.target.value)}>
              <option value="">— Non défini —</option>
              {PLAYER_LEVELS.map((l) => (
                <option key={l} value={l}>Niveau {l}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
              Lier au joueur
            </label>
            <Select value={linked} onChange={(e) => setLinked(e.target.value)}>
              <option value="">Nouveau : {suggested}</option>
              {[...knownPlayers].sort().map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </Select>
          </div>
        </div>
      )}

      <Btn variant="success" size="lg" disabled={busy} onClick={validate}>
        ✓ Valider le compte
      </Btn>
    </Card>
  );
}

export default function AdminJoueurs() {
  const { profile: me } = useAuth();
  const { data, reload: reloadData } = useAppData();
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [resetting, setResetting] = useState<string | null>(null);
  const [resetInfo, setResetInfo] = useState<{ name: string; password: string } | null>(null);
  const [search, setSearch] = useState("");

  const reload = useCallback(async () => {
    setProfiles(await listProfiles());
  }, []);

  async function resetPwd(p: Profile) {
    if (
      !confirm(
        `Réinitialiser le mot de passe de ${p.first_name} ${p.last_name} ?\nUn mot de passe temporaire sera généré à lui transmettre.`
      )
    )
      return;
    setResetting(p.id);
    try {
      const password = await adminResetPassword(p.id);
      setResetInfo({ name: `${p.first_name} ${p.last_name}`, password });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur lors de la réinitialisation.");
    } finally {
      setResetting(null);
    }
  }

  useEffect(() => {
    reload();
  }, [reload]);

  if (!profiles || !data) return <Loader />;

  const pending = profiles.filter((p) => p.role === "pending");
  const others = profiles.filter((p) => p.role !== "pending");
  // Sans niveau, un compte validé voit tous les créneaux : à traiter en priorité.
  const noLevel = others.filter((p) => p.level == null);
  // Noms déjà pris : joueurs connus + comptes déjà liés (pour éviter les
  // collisions « Prénom + Initiale » lors de la validation d'un nouveau compte).
  const takenNames = [
    ...data.knownPlayers,
    ...profiles.map((p) => p.linked_player_name || ""),
  ].filter(Boolean);
  const q = search.trim().toLowerCase();
  const filteredOthers = q
    ? others.filter((p) =>
        [p.first_name, p.last_name, p.nickname, p.linked_player_name || ""]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
    : others;

  async function patch(p: Profile, patchData: Partial<Profile>) {
    try {
      await updateProfile(p.id, patchData);
    } catch (e) {
      alert(
        e instanceof Error
          ? `Échec de l'enregistrement : ${e.message}`
          : "Échec de l'enregistrement."
      );
      reload();
      return;
    }
    setSavedId(p.id);
    setTimeout(() => setSavedId(null), 1500);
    reload();
  }

  return (
    <div className="fade-up space-y-3">
      <CollapsibleCard
        icon="👤"
        title="Comptes à valider"
        subtitle="Nouveaux comptes en attente"
        badge={pending.length}
        defaultOpen={pending.length > 0}
      >
        {!pending.length ? (
          <EmptyState>Aucun compte en attente.</EmptyState>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <PendingCard
                key={p.id}
                p={p}
                knownPlayers={data.knownPlayers}
                takenNames={takenNames}
                onValidated={reload}
              />
            ))}
          </div>
        )}
      </CollapsibleCard>

      <CollapsibleCard
        icon="🎯"
        title="Joueurs sans niveau"
        subtitle="Sans niveau, ils voient tous les créneaux"
        badge={noLevel.length}
        defaultOpen={noLevel.length > 0}
      >
        {!noLevel.length ? (
          <EmptyState>Tous les joueurs ont un niveau attribué.</EmptyState>
        ) : (
          <>
            <p className="mb-3 text-xs leading-5 text-sub">
              Tant qu&apos;un joueur n&apos;a pas de niveau, il voit{" "}
              <b className="text-body">tous les tournois, leçons et matchs</b>, quel que soit son
              vrai niveau. Attribue-le ici pour qu&apos;il ne reçoive que ce qui le concerne.
            </p>
            <div className="space-y-2">
              {noLevel.map((p) => (
                <div key={p.id} className="flex items-center gap-2.5">
                  <Avatar name={`${p.first_name} ${p.last_name}`} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-bright">
                      {p.first_name} {p.last_name.toUpperCase()}
                    </div>
                    <div className="text-[11px] text-mut">{ROLE_LABEL[p.role]}</div>
                  </div>
                  {savedId === p.id && (
                    <span className="text-[11px] font-bold text-ok">✓</span>
                  )}
                  <Select
                    value=""
                    className="w-32 text-xs"
                    onChange={(e) =>
                      e.target.value && patch(p, { level: Number(e.target.value) })
                    }
                  >
                    <option value="">Niveau —</option>
                    {PLAYER_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        Niveau {l}
                      </option>
                    ))}
                  </Select>
                </div>
              ))}
            </div>
          </>
        )}
      </CollapsibleCard>

      <CollapsibleCard
        icon="👥"
        title="Joueurs & comptes"
        subtitle={`${others.length} profil${others.length > 1 ? "s" : ""} · rôles, niveaux, mots de passe`}
      >
        <Input
          placeholder="Rechercher un joueur…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />
        {!filteredOthers.length ? (
          <EmptyState>Aucun profil trouvé.</EmptyState>
        ) : (
          <div className="space-y-2.5">
            {filteredOthers.map((p) => (
              <Card key={p.id} className="p-3.5" tone="flat">
                <div className="flex items-center gap-3">
                  <Avatar name={`${p.first_name} ${p.last_name}`} size={38} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-bright">
                      {p.first_name} «{p.nickname}» {p.last_name.toUpperCase()}
                      {p.id === me?.id && <span className="ml-2 text-[10px] text-mut">(vous)</span>}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <Badge color={p.role === "admin" ? "bad" : p.role === "organisateur" ? "gold" : "sub"}>
                        {ROLE_LABEL[p.role]}
                      </Badge>
                      {p.linked_player_name && <Badge color="ok">→ {p.linked_player_name}</Badge>}
                      {savedId === p.id && <span className="text-[11px] font-bold text-ok">✓ Enregistré</span>}
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Select
                    value={p.role}
                    disabled={p.id === me?.id}
                    onChange={(e) => patch(p, { role: e.target.value as Role })}
                    className="text-xs"
                  >
                    <option value="player">Joueur</option>
                    <option value="organisateur">Organisateur</option>
                    <option value="admin">Admin</option>
                    <option value="pending">En attente</option>
                  </Select>
                  <Select
                    value={p.level ?? ""}
                    onChange={(e) => patch(p, { level: e.target.value ? Number(e.target.value) : null })}
                    className="text-xs"
                  >
                    <option value="">Niveau —</option>
                    {PLAYER_LEVELS.map((l) => (
                      <option key={l} value={l}>Niveau {l}</option>
                    ))}
                  </Select>
                  <Select
                    value={p.linked_player_name ?? ""}
                    onChange={(e) => patch(p, { linked_player_name: e.target.value || null })}
                    className="text-xs"
                  >
                    <option value="">Non lié</option>
                    {(() => {
                      const identity = playerIdentity(p.first_name, p.last_name);
                      const extras = [identity, p.nickname].filter(
                        (n, i, arr) => n && arr.indexOf(n) === i && !data.knownPlayers.includes(n)
                      );
                      return extras.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ));
                    })()}
                    {[...data.knownPlayers].sort().map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </Select>
                </div>

                <div className="mt-2">
                  <Btn size="sm" variant="ghost" disabled={resetting === p.id} onClick={() => resetPwd(p)}>
                    🔑 {resetting === p.id ? "Réinitialisation…" : "Réinitialiser le mot de passe"}
                  </Btn>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CollapsibleCard>

      <CollapsibleCard
        icon="📊"
        title="Statistiques"
        subtitle="Activité, remplissage, joueurs à relancer"
      >
        <StatsPanel />
      </CollapsibleCard>

      <CollapsibleCard
        icon="✏️"
        title="Erreur de joueur sur une session"
        subtitle="Remplacer un homonyme inscrit par erreur"
      >
        <SessionFixTool
          data={data}
          onDone={() => {
            reloadData();
            reload();
          }}
        />
      </CollapsibleCard>

      <CollapsibleCard icon="🔔" title="Notifications" subtitle="Alertes & pastille sur l'icône">
        <BadgeSettings role={me?.role || "admin"} />
      </CollapsibleCard>

      <Modal open={!!resetInfo} onClose={() => setResetInfo(null)}>
        <div className="text-center">
          <div className="mb-2 text-4xl">🔑</div>
          <h3 className="mb-1 text-lg font-extrabold text-bright">Mot de passe réinitialisé</h3>
          <p className="text-sm text-sub">
            Nouveau mot de passe temporaire pour <b className="text-body">{resetInfo?.name}</b> :
          </p>
          <div className="my-4 select-all rounded-xl border border-gold/50 bg-gold/10 py-3 text-2xl font-extrabold tracking-widest text-gold">
            {resetInfo?.password}
          </div>
          <p className="text-xs leading-5 text-mut">
            Transmets-le-lui (WhatsApp, SMS…). Il se connecte avec son numéro habituel et ce mot de
            passe.
          </p>
          <Btn className="mt-4 w-full" onClick={() => setResetInfo(null)}>
            J&apos;ai noté
          </Btn>
        </div>
      </Modal>
    </div>
  );
}
