"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getTournament, listRegistrations, requestRegistration } from "@/lib/store";
import { notifyAdmins } from "@/lib/push";
import { formatDateLong } from "@/lib/format";
import type { Registration, Tournament } from "@/lib/types";
import { Badge, Btn, Card, Input, Loader } from "@/components/ui";

// Page publique d'invitation : lien partagé sur WhatsApp.
export default function JoinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { profile, loading: authLoading } = useAuth();
  const [tournament, setTournament] = useState<Tournament | null | undefined>(undefined);
  const [regs, setRegs] = useState<Registration[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [t, rs] = await Promise.all([getTournament(id), listRegistrations(id)]);
        setTournament(t);
        setRegs(rs);
      } catch {
        setTournament(null);
      }
    })();
  }, [id]);

  if (tournament === undefined || authLoading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader />
      </main>
    );
  }

  const approved = regs.filter((r) => r.status === "approved");
  const gridNames = (tournament?.teams || []).flatMap((tm) => tm.players).filter((p) => p?.trim());
  const confirmed = [...new Set([...approved.map((r) => r.player_name), ...gridNames])];
  const free = tournament ? Math.max(0, tournament.capacity - confirmed.length) : 0;

  // Voie recommandée : on emmène vers la création de compte, pseudo pré-rempli,
  // et l'inscription à ce tournoi se fera automatiquement après la création.
  function goCreateAccount() {
    const n = name.trim();
    if (!n) {
      setError("Saisis ton prénom / pseudo d'abord.");
      return;
    }
    router.push(`/login?join=${id}&pseudo=${encodeURIComponent(n)}&tab=register`);
  }

  async function submitGuest() {
    if (!tournament) return;
    const n = name.trim();
    if (!n) return setError("Saisis ton prénom.");
    const allNames = regs.map((r) => r.player_name.toLowerCase().trim());
    if (allNames.includes(n.toLowerCase()) || confirmed.some((c) => c.toLowerCase().trim() === n.toLowerCase())) {
      return setError("Ce prénom est déjà inscrit !");
    }
    setBusy(true);
    try {
      await requestRegistration(tournament.id, n, profile?.id ?? null, !profile);
      notifyAdmins("registration", n); // push aux admins (non bloquant)
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur lors de l'inscription");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="fade-up w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <Image src="/logo.png" alt="V-Champs" width={90} height={90} className="mb-2" />
          <h1 className="text-xl font-extrabold tracking-wide text-bright">V-CHAMPS</h1>
        </div>

        {!tournament ? (
          <Card className="p-6 text-center">
            <p className="text-sm font-semibold text-bad">Session introuvable ou expirée.</p>
            <Link href="/" className="mt-4 inline-block text-xs font-bold text-gold underline">
              Aller à l&apos;application →
            </Link>
          </Card>
        ) : done ? (
          <Card tone="gold" className="p-7 text-center">
            <div className="mb-3 text-5xl">✅</div>
            <h2 className="mb-1 text-lg font-extrabold text-bright">Demande envoyée !</h2>
            <p className="text-sm text-sub">
              L&apos;organisateur validera ta place — <b className="text-gold">{name.trim()}</b>.
            </p>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="text-center">
              <div className="text-xl font-extrabold text-bright">{formatDateLong(tournament.date)}</div>
              <div className="mt-0.5 text-lg font-bold text-gold">{tournament.time}</div>
              <div className="mt-2 flex justify-center gap-2">
                <Badge color="gold">Niveau {tournament.level}</Badge>
                <Badge color={free > 0 ? "ok" : "bad"}>
                  {free > 0 ? `🎟️ ${free} place${free > 1 ? "s" : ""} dispo` : "Complet"}
                </Badge>
              </div>
            </div>

            {confirmed.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {confirmed.map((n) => (
                  <span key={n} className="rounded-full bg-card2 px-2.5 py-1 text-[11px] font-semibold text-sub">
                    {n}
                  </span>
                ))}
              </div>
            )}

            {free > 0 && (
              <div className="mt-5 space-y-3">
                <Input
                  placeholder="Ton prénom / pseudo"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && goCreateAccount()}
                />
                {error && <p className="text-sm font-semibold text-bad">{error}</p>}

                {/* Voie principale : créer un compte pour fixer le pseudo + stats + niveau */}
                <Btn size="lg" onClick={goCreateAccount} disabled={busy}>
                  🎾 M&apos;inscrire &amp; créer mon compte
                </Btn>
                <p className="text-center text-[11px] leading-4 text-mut">
                  Ton pseudo est conservé pour la prochaine fois, avec tes stats et ton classement.
                </p>

                <div className="flex items-center gap-2 pt-1">
                  <div className="h-px flex-1 bg-line" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-mut">ou</span>
                  <div className="h-px flex-1 bg-line" />
                </div>

                {/* Voie rapide : invité, juste pour cette fois */}
                <button
                  onClick={submitGuest}
                  disabled={busy}
                  className="w-full cursor-pointer text-center text-xs font-semibold text-sub underline underline-offset-2 hover:text-body disabled:opacity-50"
                >
                  M&apos;inscrire juste pour cette fois (invité)
                </button>
              </div>
            )}

            <p className="mt-5 text-center text-[11px] text-mut">
              Tu as déjà un compte ?{" "}
              <Link
                href={`/login?join=${tournament.id}&tab=login`}
                className="font-bold text-gold underline"
              >
                Connecte-toi
              </Link>
            </p>
          </Card>
        )}
      </div>
    </main>
  );
}
