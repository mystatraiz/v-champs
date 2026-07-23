"use client";

import { useAuth } from "@/lib/auth-context";
import { useAppData } from "@/lib/use-app-data";
import { ClassementTabs } from "@/components/ClassementTabs";
import { Loader } from "@/components/ui";

export default function PlayerClassement() {
  const { profile } = useAuth();
  const { data, loading } = useAppData();

  if (loading || !data) return <Loader />;

  return (
    <div className="fade-up">
      <ClassementTabs data={data} highlightPlayer={profile?.linked_player_name} />
    </div>
  );
}
