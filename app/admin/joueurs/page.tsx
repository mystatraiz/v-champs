"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  listProfiles,
  markUserNotificationRead,
  renamePlayer,
  resetAllScores,
  updateProfile,
} from "@/lib/store";
import { useAppData } from "@/lib/use-app-data";
import type { AppData } from "@/lib/store";
import { PLAYER_LEVELS } from "@/lib/levels";
import type { Profile, Role } from "@/lib/types";
import { Avatar, Badge, Btn, Card, EmptyState, Input, Loader, SectionTitle, Select } from "@/components/ui";

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
        linked_player_name: role === "player" ? linked || p.nickname : null,
      });
      await markUserNotificationRead(p.id);
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
              <option value="">Nouveau : «{p.nickname}»</option>
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

  const reload = useCallback(async () => {
    setProfiles(await listProfiles());
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  if (!profiles || !data) return <Loader />;

  const pending = profiles.filter((p) => p.role === "pending");
  const others = profiles.filter((p) => p.role !== "pending");

  async function patch(p: Profile, patchData: Partial<Profile>) {
    await updateProfile(p.id, patchData);
    setSavedId(p.id);
    setTimeout(() => setSavedId(null), 1500);
    reload();
  }

  return (
    <div className="fade-up space-y-6">
      <div>
        <SectionTitle>✏️ Modifier les noms de joueurs</SectionTitle>
        <NamesManager
          data={data}
          onDone={() => {
            reloadData();
            reload();
          }}
        />
      </div>

      <div>
        <SectionTitle>🔗 Fusion rapide de deux noms</SectionTitle>
        <MergeTool
          data={data}
          onDone={() => {
            reloadData();
            reload();
          }}
        />
      </div>

      <div>
        <SectionTitle>
          Comptes en attente{" "}
          {pending.length > 0 && (
            <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[10px] font-extrabold text-white">
              {pending.length}
            </span>
          )}
        </SectionTitle>
        {!pending.length ? (
          <Card>
            <EmptyState>Aucun compte en attente.</EmptyState>
          </Card>
        ) : (
          <div className="space-y-3">
            {pending.map((p) => (
              <PendingCard key={p.id} p={p} knownPlayers={data.knownPlayers} onValidated={reload} />
            ))}
          </div>
        )}
      </div>

      <div>
        <SectionTitle>Tous les profils ({others.length})</SectionTitle>
        <div className="space-y-2.5">
          {others.map((p) => (
            <Card key={p.id} className="p-3.5">
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
                  {!data.knownPlayers.includes(p.nickname) && (
                    <option value={p.nickname}>{p.nickname} (surnom)</option>
                  )}
                  {[...data.knownPlayers].sort().map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </Select>
              </div>
            </Card>
          ))}
        </div>
      </div>

      <div>
        <SectionTitle className="text-bad">⚠️ Zone dangereuse</SectionTitle>
        <Card tone="danger" className="p-4">
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
        </Card>
      </div>
    </div>
  );
}
