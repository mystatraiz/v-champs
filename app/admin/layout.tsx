"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { countPendingProfiles, countPendingRegistrations } from "@/lib/store";
import { updateAppBadge } from "@/lib/badge";
import { isOwner } from "@/lib/owner";
import { Loader } from "@/components/ui";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  // Compteurs des pastilles (demandes d'inscription + comptes à valider).
  const [pendingRegs, setPendingRegs] = useState(0);
  const [pendingAccounts, setPendingAccounts] = useState(0);

  const isReady = !loading && !!profile && (profile.role === "admin" || profile.role === "organisateur");
  const canModerate = profile?.role === "admin";

  const refreshBadges = useCallback(async () => {
    if (!isReady) return;
    try {
      const [regs, accs] = await Promise.all([
        countPendingRegistrations(),
        canModerate ? countPendingProfiles() : Promise.resolve(0),
      ]);
      setPendingRegs(regs);
      setPendingAccounts(accs);
      updateAppBadge(regs + accs); // badge sur l'icône de l'app (si installée)
    } catch {
      /* silencieux : les pastilles ne doivent jamais casser la navigation */
    }
  }, [isReady, canModerate]);

  // Rafraîchit à chaque changement d'onglet + toutes les 45 s.
  useEffect(() => {
    refreshBadges();
    const iv = setInterval(refreshBadges, 45000);
    return () => clearInterval(iv);
  }, [refreshBadges, pathname]);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!profile) router.replace("/login?step=complete");
    else if (profile.role === "pending") router.replace("/pending");
    else if (profile.role === "player") router.replace("/player");
  }, [user, profile, loading, router]);

  if (loading || !profile || (profile.role !== "admin" && profile.role !== "organisateur")) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader />
      </main>
    );
  }

  const isAdmin = profile.role === "admin";
  const tabs: { href: string; label: string; icon: string; badge?: number }[] = [
    { href: "/admin", label: "Tournois", icon: "🎾", badge: pendingRegs },
    { href: "/admin/classement", label: "Classement", icon: "🏆" },
    { href: "/admin/reglement", label: "Règlement", icon: "📖" },
    ...(isAdmin
      ? [{ href: "/admin/joueurs", label: "Réglages", icon: "⚙️", badge: pendingAccounts }]
      : []),
  ];

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur">
        <Image src="/logo.png" alt="" width={34} height={34} />
        <div className="flex-1">
          <div className="text-sm font-extrabold tracking-wide text-bright">V-CHAMPS</div>
          <div className="text-[10px] font-semibold uppercase tracking-[2px] text-gold">
            {isAdmin ? "Administration" : "Organisation"}
          </div>
        </div>
        {isOwner(user?.email) && (
          <Link
            href="/player"
            title="Voir l'application en tant que joueur"
            className="cursor-pointer rounded-lg border border-line2 px-2.5 py-1.5 text-xs font-bold text-sub hover:text-body"
          >
            👁 Joueur
          </Link>
        )}
        <button
          onClick={async () => {
            await signOut();
            router.replace("/login");
          }}
          title="Déconnexion"
          className="cursor-pointer rounded-lg border border-line2 px-2.5 py-1.5 text-xs font-bold text-sub hover:text-body"
        >
          ⎋
        </button>
      </header>

      <main className="flex-1 px-4 py-5 pb-24">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-ink/95 backdrop-blur">
        <div
          className="mx-auto grid max-w-3xl"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
        >
          {tabs.map((t) => {
            const active =
              t.href === "/admin"
                ? pathname === "/admin" ||
                  pathname.startsWith("/admin/tournoi") ||
                  pathname.startsWith("/admin/session")
                : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`relative flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  active ? "text-gold" : "text-mut hover:text-sub"
                }`}
              >
                <span className="relative text-lg leading-none">
                  {t.icon}
                  {!!t.badge && t.badge > 0 && (
                    <span className="absolute -right-3 -top-1.5 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-bad px-1 text-[10px] font-extrabold leading-none text-white ring-2 ring-ink">
                      {t.badge > 99 ? "99+" : t.badge}
                    </span>
                  )}
                </span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
