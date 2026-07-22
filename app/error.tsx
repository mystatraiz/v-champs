"use client";

import { useEffect } from "react";
import { Btn, Card } from "@/components/ui";

// Filet de sécurité : toute erreur de rendu non gérée affiche ce panneau
// plutôt qu'un écran blanc.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-5">
      <Card tone="danger" className="w-full max-w-sm p-6 text-center">
        <div className="mb-3 text-4xl">😕</div>
        <h1 className="mb-2 text-lg font-extrabold text-bright">Une erreur est survenue</h1>
        <p className="mb-5 text-sm leading-6 text-sub">
          Quelque chose n&apos;a pas pu s&apos;afficher. Réessaie — si le problème persiste,
          reviens à l&apos;accueil.
        </p>
        <div className="flex gap-2">
          <Btn className="flex-1" onClick={() => reset()}>
            Réessayer
          </Btn>
          <Btn variant="secondary" className="flex-1" onClick={() => (window.location.href = "/")}>
            Accueil
          </Btn>
        </div>
      </Card>
    </main>
  );
}
