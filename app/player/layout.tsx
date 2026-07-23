"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { isOwner } from "@/lib/owner";
import { Btn, Loader, Modal } from "@/components/ui";

// Message de bienvenue affiché une seule fois quand le compte vient d'être lié
// à un joueur (par l'admin) — ses stats/classement deviennent disponibles.
function LinkNotice() {
  const { profile } = useAuth();
  const [show, setShow] = useState(false);
  const linked = profile?.linked_player_name || null;

  useEffect(() => {
    if (!profile || !linked) return;
    try {
      const key = `vchamps_link_seen_${profile.id}`;
      if (localStorage.getItem(key) !== linked) setShow(true);
    } catch {
      /* localStorage indisponible : on n'affiche rien */
    }
  }, [profile, linked]);

  function dismiss() {
    try {
      if (profile && linked) localStorage.setItem(`vchamps_link_seen_${profile.id}`, linked);
    } catch {
      /* ignore */
    }
    setShow(false);
  }

  if (!linked) return null;

  return (
    <Modal open={show} onClose={dismiss}>
      <div className="text-center">
        <div className="mb-3 text-5xl">🎉</div>
        <h3 className="mb-2 text-xl font-extrabold text-bright">Ton compte est lié !</h3>
        <p className="text-sm leading-6 text-sub">
          Ton compte a été associé au joueur{" "}
          <b className="text-gold">«&nbsp;{linked}&nbsp;»</b>. Tes{" "}
          <b className="text-body">statistiques</b> et ton{" "}
          <b className="text-body">classement V-Champs</b> sont désormais disponibles dans ton
          profil.
        </p>
        <div className="mt-5 flex gap-2">
          <Link href="/player/profil" className="flex-1" onClick={dismiss}>
            <Btn className="w-full">Voir mon profil →</Btn>
          </Link>
          <Btn variant="secondary" className="flex-1" onClick={dismiss}>
            Plus tard
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

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
        {isOwner(user?.email) && (
          <Link
            href="/admin"
            title="Retour à l'espace admin"
            className="cursor-pointer rounded-lg border border-gold/50 px-2.5 py-1.5 text-xs font-bold text-gold hover:bg-gold/10"
          >
            ← Admin
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

      <LinkNotice />

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
