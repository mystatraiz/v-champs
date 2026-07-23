"use client";

import { useEffect, useState } from "react";
import { isTestMode } from "@/lib/test-mode";

// Bandeau permanent rappelant qu'on est en mode test (données de test).
export function TestModeBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(isTestMode()), []);
  if (!on) return null;
  return (
    <div className="bg-gold px-4 py-1 text-center text-[11px] font-extrabold uppercase tracking-wider text-ink">
      🧪 Mode test — données de test (le réel n&apos;est pas affecté)
    </div>
  );
}
