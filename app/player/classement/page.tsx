"use client";

import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/use-app-data";
import { RankingBoard } from "@/components/RankingBoard";
import { Loader, SectionTitle } from "@/components/ui";

export default function PlayerClassement() {
  const { profile } = useAuth();
  const { data, loading } = useAppData();

  if (loading || !data) return <Loader />;

  return (
    <div className="fade-up">
      <SectionTitle>Classement général V-Champs</SectionTitle>
      <RankingBoard data={data} highlightPlayer={profile?.linked_player_name} />
    </div>
  );
}
