"use client";

import { useAppData } from "@/lib/use-app-data";
import { ClassementTabs } from "@/components/ClassementTabs";
import { Loader } from "@/components/ui";

export default function AdminClassement() {
  const { data, loading, reload } = useAppData();

  if (loading || !data) return <Loader />;

  return (
    <div className="fade-up">
      <ClassementTabs data={data} canShare canEdit onEdited={reload} />
    </div>
  );
}
