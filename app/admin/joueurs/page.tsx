"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  adminResetPassword,
  listProfiles,
  markUserNotificationRead,
  renamePlayer,
  resetAllScores,
  updateProfile,
} from "@/lib/store";
import { useAppData } from "@/lib/use-app-data";
import type { AppData } from "@/lib/store";
import { PLAYER_LEVELS } from "@/lib/levels";
import { playerIdentity } from "@/lib/format";
import { notificationPermission, updateAppBadge } from "@/lib/badge";
import { notifyPlayer, pushSupported, subscribeAdminPush } from "@/lib/push";
import { isTestMode, setTestMode } from "@/lib/test-mode";
import { isOwner } from "@/lib/owner";
import { ChangePassword } from "@/components/ChangePassword";
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

// Encart : mode test (bac à sable) — réservé au propriétaire.
function TestModeCard() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(isTestMode()), []);

  function toggle() {
    setTestMode(!on);
    // Rechargement : toutes les données rebasculent sur le bon espace.
    window.location.reload();
  }

  return (
    <Card tone={on ? "gold" : "default"} className="p-4">
      <p className="mb-3 text-xs leading-5 text-sub">
        Le mode test est un <b className="text-body">bac à sable</b> : tu peux créer et lancer des
        tournois pour t&apos;entraîner, <b className="text-body">sans toucher aux vraies données</b>
        {" "}(classement, historique). Les joueurs ne voient rien et aucune notification n&apos;est
        envoyée. Actif uniquement sur cet appareil.
      </p>
      {on && (
        <p className="mb-3 rounded-lg bg-gold/10 px-3 py-2 text-xs font-bold text-gold">
          🧪 Mode test ACTIVÉ — tu manipules des données de test.
        </p>
      )}
      <Btn variant={on ? "danger" : "primary"} size="lg" onClick={toggle}>
        {on ? "Revenir aux vraies données" : "🧪 Activer le mode test"}
      </Btn>
    </Card>
  );
}

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

// Gestionnaire : liste tous les noms et permet de les renommer un par un.
function NamesManager({ data, onDone }: { data: AppData; onDone: () => void }) {
  const names = useMemo(() => collectPlayerNames(data), [data]);
  const [filter, setFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const filtered = names.filter((n) => n.name.toLowerCase().includes(filter.toLowerCase()));

  async function save(oldName: string) {
    const nv = value.trim();
    if (!nv || nv === oldName) {
      setEditing(null);
      return;
    }
    const exists = names.some((n) => n.name.toLowerCase().trim() === nv.toLowerCase().trim());
    if (
      !confirm(
        exists
          ? `« ${nv} » existe déjà : « ${oldName} » sera fusionné avec « ${nv} » partout. Continuer ?`
          : `Renommer « ${oldName} » en « ${nv} » partout (historique, points, palmarès, compte lié) ?`
      )
    )
      return;
    setBusy(true);
    try {
      await renamePlayer(oldName, nv);
      setEditing(null);
      onDone();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur pendant le renommage.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-3">
      <Input
        placeholder="Rechercher un nom…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="mb-3"
      />
      {!filtered.length ? (
        <EmptyState>Aucun nom.</EmptyState>
      ) : (
        <div className="max-h-96 divide-y divide-line overflow-y-auto">
          {filtered.map((n) =>
            editing === n.name ? (
              <div key={n.name} className="flex items-center gap-2 py-2">
                <Input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save(n.name)}
                  autoFocus
                />
                <Btn size="sm" variant="success" disabled={busy} onClick={() => save(n.name)}>
                  ✓
                </Btn>
                <Btn size="sm" variant="ghost" onClick={() => setEditing(null)}>
                  ✕
                </Btn>
              </div>
            ) : (
              <div key={n.name} className="flex items-center gap-2 py-2">
                <span className="flex-1 truncate text-sm text-body">
                  {n.name} <span className="text-xs text-mut">({n.count})</span>
                </span>
                <Btn
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditing(n.name);
                    setValue(n.name);
                  }}
                >
                  ✏️ Renommer
                </Btn>
              </div>
            )
          )}
        </div>
      )}
    </Card>
  );
}

// Outil admin : fusionner un nom mal saisi vers le bon.
function MergeTool({ data, onDone }: { data: AppData; onDone: () => void }) {
  const names = useMemo(() => collectPlayerNames(data), [data]);
  const [oldName, setOldName] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function doMerge() {
    if (!oldName || !newName.trim()) return;
    if (oldName.toLowerCase().trim() === newName.toLowerCase().trim()) {
      setMsg("Les deux noms sont identiques.");
      return;
    }
    if (
      !confirm(
        `Fusionner « ${oldName} » → « ${newName.trim()} » ?\n\nToutes les sessions, points, palmarès et comptes liés au nom « ${oldName} » seront réattribués à « ${newName.trim()} ». Action définitive.`
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await renamePlayer(oldName, newName.trim());
      setMsg(
        `✓ Fusionné. ${r.historyTouched ? "Historique mis à jour." : ""} ${
          r.scoresTouched ? `${r.scoresTouched} score(s) réattribué(s).` : ""
        }`.trim() || "✓ Fusionné."
      );
      setOldName("");
      setNewName("");
      onDone();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Erreur pendant la fusion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="p-4">
      <p className="mb-3 text-xs leading-5 text-sub">
        Corrige un nom mal saisi (ex. « fredv ») en le fusionnant vers le bon (ex. « Fred V »).
        La correction s&apos;applique partout : historique, points V-Champs, palmarès et comptes liés.
      </p>
      <div className="space-y-2">
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
            Nom à corriger
          </label>
          <Select value={oldName} onChange={(e) => setOldName(e.target.value)}>
            <option value="">— Choisir le nom erroné —</option>
            {names.map((n) => (
              <option key={n.name} value={n.name}>
                {n.name} ({n.count})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">
            Vers le bon nom
          </label>
          <Input
            list="known-names-list"
            placeholder="Bon nom (ex. Fred V)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <datalist id="known-names-list">
            {names.map((n) => (
              <option key={n.name} value={n.name} />
            ))}
          </datalist>
        </div>
      </div>
      {msg && (
        <p className={`mt-2 text-xs font-semibold ${msg.startsWith("✓") ? "text-ok" : "text-bad"}`}>{msg}</p>
      )}
      <Btn
        className="mt-3"
        size="lg"
        disabled={busy || !oldName || !newName.trim()}
        onClick={doMerge}
      >
        {busy ? "Fusion en cours…" : "Fusionner les noms"}
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
  onValidated,
}: {
  p: Profile;
  knownPlayers: string[];
  onValidated: () => void;
}) {
  const [role, setRole] = useState<Role>("player");
  const [level, setLevel] = useState<string>("");
  const [linked, setLinked] = useState("");
  const [busy, setBusy] = useState(false);

  async function validate() {
    setBusy(true);
    try {
      await updateProfile(p.id, {
        role,
        level: role === "player" && level ? Number(level) : p.level,
        linked_player_name:
          role === "player" ? linked || playerIdentity(p.first_name, p.last_name) : null,
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
              <option value="">Nouveau : {playerIdentity(p.first_name, p.last_name)}</option>
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
  const { profile: me, user } = useAuth();
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
              <PendingCard key={p.id} p={p} knownPlayers={data.knownPlayers} onValidated={reload} />
            ))}
          </div>
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

      <CollapsibleCard icon="✏️" title="Noms des joueurs" subtitle="Corriger, renommer, fusionner">
        <div className="space-y-4">
          <div>
            <SectionTitle>Corriger / renommer</SectionTitle>
            <NamesManager
              data={data}
              onDone={() => {
                reloadData();
                reload();
              }}
            />
          </div>
          <div>
            <SectionTitle>Fusion rapide de deux noms</SectionTitle>
            <MergeTool
              data={data}
              onDone={() => {
                reloadData();
                reload();
              }}
            />
          </div>
        </div>
      </CollapsibleCard>

      <CollapsibleCard icon="🔔" title="Notifications" subtitle="Alertes & pastille sur l'icône">
        <BadgeSettings role={me?.role || "admin"} />
      </CollapsibleCard>

      <CollapsibleCard icon="🔒" title="Mon mot de passe" subtitle="Changer mon mot de passe">
        <ChangePassword />
      </CollapsibleCard>

      {isOwner(user?.email) && (
        <CollapsibleCard icon="🧪" title="Mode test" subtitle="Bac à sable (propriétaire)">
          <TestModeCard />
        </CollapsibleCard>
      )}

      <CollapsibleCard icon="⚠️" title="Zone dangereuse" subtitle="Réinitialiser le classement" tone="danger">
        <p className="mb-3 text-xs leading-5 text-sub">
          Remet le classement V-Champs à zéro (les scores antérieurs sont ignorés, l&apos;historique
          des sessions est conservé). Irréversible.
        </p>
        <Btn
          variant="danger"
          onClick={async () => {
            if (!confirm("Remettre le classement V-Champs à zéro ? Cette action est irréversible.")) return;
            if (!confirm("Confirmez une seconde fois : réinitialiser TOUS les scores ?")) return;
            await resetAllScores();
            alert("✓ Classement réinitialisé.");
          }}
        >
          🗑 Remettre le classement à zéro
        </Btn>
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
