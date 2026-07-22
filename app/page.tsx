"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Loader } from "@/components/ui";

// Aiguillage racine : selon l'état de connexion et le rôle.
export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!profile) router.replace("/login?step=complete");
    else if (profile.role === "pending") router.replace("/pending");
    else if (profile.role === "player") router.replace("/player");
    else router.replace("/admin");
  }, [user, profile, loading, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Loader />
    </main>
  );
}
