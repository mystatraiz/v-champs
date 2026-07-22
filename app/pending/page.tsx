"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Btn, Card } from "@/components/ui";

export default function PendingPage() {
  const { user, profile, loading, signOut, refreshProfile } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (profile && profile.role !== "pending") router.replace("/");
  }, [user, profile, loading, router]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5">
      <div className="fade-up w-full max-w-sm text-center">
        <Image src="/logo.png" alt="V-Champs" width={90} height={90} className="mx-auto mb-5" />
        <Card className="p-7">
          <div className="mb-3 text-4xl">⏳</div>
          <h1 className="mb-2 text-xl font-extrabold text-bright">Compte en attente</h1>
          <p className="text-sm leading-6 text-sub">
            Votre compte a bien été créé{profile ? `, ${profile.first_name}` : ""}.
            <br />
            Un administrateur doit le valider et vous attribuer un niveau avant que vous puissiez
            accéder à l&apos;application.
          </p>
          <div className="mt-6 flex gap-2">
            <Btn variant="secondary" className="flex-1" onClick={() => refreshProfile()}>
              Actualiser
            </Btn>
            <Btn
              variant="ghost"
              className="flex-1"
              onClick={async () => {
                await signOut();
                router.replace("/login");
              }}
            >
              Déconnexion
            </Btn>
          </div>
        </Card>
      </div>
    </main>
  );
}
