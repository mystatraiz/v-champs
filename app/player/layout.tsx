"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Loader } from "@/components/ui";

const TABS = [
  { href: "/player", label: "Tournois", icon: "🎾" },
  { href: "/player/classement", label: "Classement", icon: "🏆" },
  { href: "/player/profil", label: "Profil", icon: "👤" },
  { href: "/player/reglement", label: "Règlement", icon: "📖" },
];

export default function PlayerLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, loading, signOut } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace("/login");
    else if (!profile) router.replace("/login?step=complete");
    else if (profile.role === "pending") router.replace("/pending");
  }, [user, profile, loading, router]);

  if (loading || !profile || profile.role === "pending") {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader />
      </main>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-line bg-ink/90 px-4 py-3 backdrop-blur">
        <Image src="/logo.png" alt="" width={34} height={34} />
        <div className="flex-1">
          <div className="text-sm font-extrabold tracking-wide text-bright">V-CHAMPS</div>
          <div className="text-[10px] font-semibold uppercase tracking-[2px] text-mut">
            Espace joueur
          </div>
        </div>
        {profile.level != null && (
          <span className="rounded-full border border-gold/50 px-2.5 py-1 text-[11px] font-extrabold text-gold">
            Niv. {profile.level}
          </span>
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
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          {TABS.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                  active ? "text-gold" : "text-mut hover:text-sub"
                }`}
              >
                <span className="text-lg leading-none">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
