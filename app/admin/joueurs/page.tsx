"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import {
  listProfiles,
  markUserNotificationRead,
  resetAllScores,
  updateProfile,
} from "@/lib/store";
import { useAppData } from "@/lib/use-app-data";
import { PLAYER_LEVELS } from "@/lib/levels";
import type { Profile, Role } from "@/lib/types";
import { Avatar, Badge, Btn, Card, EmptyState, Loader, SectionTitle, Select } from "@/components/ui";

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
  const { data } = useAppData();
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
