"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/lib/supabase";
import { fetchProfile, requestRegistration } from "@/lib/store";
import { notifyAdmins } from "@/lib/push";
import { Btn, Card, Input, Loader, Select } from "@/components/ui";

type Mode = "login" | "register" | "complete";

function LoginInner() {
  const { user, profile, loading, signIn, signUp, completeProfile } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  const [mode, setMode] = useState<Mode>("login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nickname, setNickname] = useState("");
  const [hand, setHand] = useState("right");
  const [side, setSide] = useState("any");

  const joinId = params.get("join");
  const pseudo = params.get("pseudo");

  // Pré-remplissage quand on arrive depuis un lien d'inscription à un tournoi.
  useEffect(() => {
    const tab = params.get("tab");
    if (tab === "register") setMode("register");
    else if (tab === "login") setMode("login");
    if (pseudo) setNickname((n) => n || pseudo);
  }, [params, pseudo]);

  // Redirection si déjà connecté avec un profil complet
  useEffect(() => {
    if (loading) return;
    if (user && profile) {
      router.replace("/");
    } else if (user && !profile) {
      setMode("complete");
    } else if (params.get("step") === "complete" && user) {
      setMode("complete");
    }
  }, [user, profile, loading, router, params]);

  // Inscrit automatiquement au tournoi visé (après connexion ou création de compte).
  async function finishJoin(preferredName?: string) {
    if (!joinId) return;
    try {
      const {
        data: { user: u },
      } = await supabase.auth.getUser();
      let regName = preferredName?.trim();
      if (!regName && u) {
        const prof = await fetchProfile(u.id);
        regName = prof?.linked_player_name || prof?.nickname || pseudo || "";
      }
      if (!regName) regName = pseudo || "";
      if (!regName) return;
      await requestRegistration(joinId, regName, u?.id ?? null);
      notifyAdmins("registration", regName);
    } catch {
      /* déjà inscrit ou erreur réseau → sans conséquence */
    }
  }

  async function handleSubmit() {
    setError("");
    setBusy(true);
    try {
      if (mode === "login") {
        if (!phone || !password) return setError("Téléphone et mot de passe requis.");
        const err = await signIn(phone, password);
        if (err) return setError(err);
        await finishJoin();
        router.replace("/");
      } else if (mode === "register") {
        if (!phone || !password) return setError("Téléphone et mot de passe requis.");
        const err = await signUp(phone, password);
        if (err) return setError(err);
        setMode("complete");
      } else {
        if (!firstName || !lastName) return setError("Prénom et nom sont requis.");
        if (!nickname) return setError("Le surnom est requis.");
        const err = await completeProfile({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          nickname: nickname.trim(),
          handedness: hand,
          preferred_side: side,
        });
        if (err) return setError(err);
        await finishJoin(nickname.trim());
        router.replace("/pending");
      }
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <Loader />
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="fade-up w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center">
          <Image src="/logo.png" alt="V-Champs" width={110} height={110} priority className="mb-3" />
          <h1 className="text-2xl font-extrabold tracking-wide text-bright">V-CHAMPS</h1>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[3px] text-mut">
            Tournois &amp; classement padel
          </p>
        </div>

        <Card className="p-5">
          {mode !== "complete" && (
            <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-surface p-1">
              {(["login", "register"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setMode(m);
                    setError("");
                  }}
                  className={`cursor-pointer rounded-md py-2 text-sm font-bold transition-colors ${
                    mode === m ? "bg-gold text-ink" : "text-sub hover:text-body"
                  }`}
                >
                  {m === "login" ? "Connexion" : "Inscription"}
                </button>
              ))}
            </div>
          )}

          {mode === "complete" ? (
            <div className="space-y-3">
              <h2 className="text-center text-lg font-bold text-bright">Complétez votre profil</h2>
              <Input placeholder="Prénom" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <Input placeholder="Nom" value={lastName} onChange={(e) => setLastName(e.target.value)} />
              <Input placeholder="Surnom (affiché dans les classements)" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">Main</label>
                  <Select value={hand} onChange={(e) => setHand(e.target.value)}>
                    <option value="right">Droitier</option>
                    <option value="left">Gaucher</option>
                  </Select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-mut">Côté préféré</label>
                  <Select value={side} onChange={(e) => setSide(e.target.value)}>
                    <option value="any">Peu importe</option>
                    <option value="left">Gauche</option>
                    <option value="right">Droite</option>
                  </Select>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Input
                type="tel"
                placeholder="Numéro de téléphone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
              <Input
                type="password"
                placeholder="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              />
            </div>
          )}

          {error && <p className="mt-3 text-sm font-semibold text-bad">{error}</p>}

          <Btn size="lg" className="mt-5" onClick={handleSubmit} disabled={busy}>
            {busy
              ? "…"
              : mode === "login"
              ? "Se connecter"
              : mode === "register"
              ? "Créer mon compte"
              : "Valider mon profil"}
          </Btn>
        </Card>

        <p className="mt-6 text-center text-[11px] leading-5 text-mut">
          Votre numéro sert uniquement d&apos;identifiant de connexion.
          <br />
          Après inscription, un administrateur validera votre compte.
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <Loader />
        </main>
      }
    >
      <LoginInner />
    </Suspense>
  );
}
