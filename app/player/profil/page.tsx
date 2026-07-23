"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/use-app-data";
import { buildAllPlayerStats } from "@/lib/stats";
import { Avatar, Badge, Btn, Card, DonutTriple, Loader, SectionTitle, StatPill } from "@/components/ui";
import { PlayerSheet } from "@/components/PlayerSheet";
import { NotifToggle } from "@/components/NotifToggle";
import { ChangePassword } from "@/components/ChangePassword";

export default function PlayerProfil() {
  const { profile } = useAuth();
  const { data, loading } = useAppData();
  const [sheetOpen, setSheetOpen] = useState(false);

  const stats = useMemo(() => {
    if (!data || !profile?.linked_player_name) return null;
    const all = buildAllPlayerStats(data.history, data.currentSession);
    const key = profile.linked_player_name.toLowerCase().trim();
    const match = Object.keys(all).find((k) => k.toLowerCase().trim() === key);
    return match ? all[match] : null;
  }, [data, profile]);

  if (loading || !data || !profile) return <Loader />;

  const sideLabel = { left: "Gauche", right: "Droite", any: "Peu importe" }[profile.preferred_side] || "";
  const handLabel = profile.handedness === "right" ? "Droitier" : "Gaucher";
  const wr = stats && stats.played ? Math.round((stats.wins / stats.played) * 100) : 0;
  const diff = stats ? stats.jFor - stats.jAgainst : 0;

  return (
    <div className="fade-up mx-auto max-w-md space-y-4">
      <div className="flex flex-col items-center py-4 text-center">
        <Avatar name={`${profile.first_name} ${profile.last_name}`} size={72} />
        <h1 className="mt-3 text-lg font-extrabold text-bright">
          {profile.first_name} <span className="text-gold">«{profile.nickname}»</span>{" "}
          {profile.last_name.toUpperCase()}
        </h1>
        <div className="mt-2 flex flex-wrap justify-center gap-1.5">
          <Badge>🎾 {handLabel}</Badge>
          <Badge>📍 {sideLabel}</Badge>
          {profile.linked_player_name ? (
            <Badge color="ok">✓ Lié : {profile.linked_player_name}</Badge>
          ) : (
            <Badge color="bad">⏳ En attente de liaison</Badge>
          )}
        </div>
      </div>

      {stats ? (
        <>
          <div className="flex items-center justify-center gap-6">
            <DonutTriple
              wins={stats.wins}
              draws={stats.draws}
              losses={stats.losses}
              size={110}
              centerLabel={`${wr}%`}
              centerSub="WIN"
            />
            <div className="grid grid-cols-2 gap-2">
              <StatPill label="Matchs" value={stats.played} />
              <StatPill label="Victoires" value={stats.wins} color="var(--color-ok)" />
              <StatPill label="Nuls" value={stats.draws} color="var(--color-mut)" />
              <StatPill label="Défaites" value={stats.losses} color="var(--color-bad)" />
            </div>
          </div>

          <Card className="divide-y divide-line">
            <div className="flex justify-between px-4 py-3 text-sm">
              <span className="text-sub">Jeux marqués</span>
              <span className="font-bold">{stats.jFor}</span>
            </div>
            <div className="flex justify-between px-4 py-3 text-sm">
              <span className="text-sub">Jeux encaissés</span>
              <span className="font-bold">{stats.jAgainst}</span>
            </div>
            <div className="flex justify-between px-4 py-3 text-sm">
              <span className="text-sub">Différence</span>
              <span className={`font-bold ${diff >= 0 ? "text-ok" : "text-bad"}`}>
                {diff >= 0 ? "+" : ""}
                {diff}
              </span>
            </div>
          </Card>

          <Btn variant="secondary" size="lg" onClick={() => setSheetOpen(true)}>
            Voir la fiche détaillée →
          </Btn>
        </>
      ) : (
        <Card className="p-6 text-center text-sm text-mut">
          Vos statistiques apparaîtront ici une fois votre compte lié à un joueur par
          l&apos;administrateur.
        </Card>
      )}

      <div>
        <SectionTitle>🔔 Notifications</SectionTitle>
        <NotifToggle
          role="player"
          profileId={profile.id}
          intro="Sois prévenu(e) quand ton compte est validé et quand ta place à un tournoi est confirmée."
        />
      </div>

      <div>
        <SectionTitle>🔒 Mot de passe</SectionTitle>
        <ChangePassword />
      </div>

      <PlayerSheet
        data={data}
        playerName={sheetOpen ? profile.linked_player_name : null}
        onClose={() => setSheetOpen(false)}
      />
    </div>
  );
}
