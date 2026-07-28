"use client";

import { useEffect, useState } from "react";
import { isStandalone, notificationPermission, updateAppBadge } from "@/lib/badge";
import { pushSupported, subscribePush } from "@/lib/push";
import { Btn, Modal } from "./ui";

const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000; // rappel au bout d'une semaine
const OPEN_DELAY_MS = 1200; // laisse la page peindre avant d'ouvrir

const offKey = (id: string) => `vchamps_install_off_${id}`;
const snoozeKey = (id: string) => `vchamps_install_snooze_${id}`;

// Ce que l'utilisateur gagne à activer les notifications, selon son rôle.
const BENEFITS: Record<"player" | "staff", string[]> = {
  player: [
    "Un tournoi de ton niveau vient d'ouvrir",
    "Ta place est confirmée par l'organisateur",
    "Une place se libère sur une session complète",
  ],
  staff: [
    "Un joueur demande une place sur une session",
    "Un nouveau compte attend ta validation",
    "Un joueur se désiste à la dernière minute",
  ],
};

// Étape numérotée de la marche à suivre.
function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`flex gap-3 ${done ? "opacity-60" : ""}`}>
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-extrabold ${
          done ? "bg-ok text-ink" : "bg-gold text-ink"
        }`}
      >
        {done ? "✓" : n}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-bright">{title}</div>
        {children}
      </div>
    </div>
  );
}

// Fenêtre d'accueil : explique comment installer l'app sur l'écran d'accueil et
// activer les notifications, avec une case « Ne plus me le rappeler ».
export function InstallPrompt({
  role,
  profileId,
  paused = false,
}: {
  role?: string;
  profileId: string;
  paused?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [perm, setPerm] = useState<string>("default");
  const [supported, setSupported] = useState(false);
  const [dontRemind, setDontRemind] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (paused || !profileId) return;
    const inst = isStandalone();
    const p = notificationPermission();
    setInstalled(inst);
    setPerm(p);
    setSupported(pushSupported());
    // Tout est déjà en place : plus rien à expliquer.
    if (inst && p === "granted") return;
    try {
      if (localStorage.getItem(offKey(profileId)) === "1") return;
      const snoozed = Number(localStorage.getItem(snoozeKey(profileId)) || 0);
      if (snoozed && Date.now() - snoozed < SNOOZE_MS) return;
    } catch {
      /* localStorage indisponible (navigation privée) : on affiche quand même */
    }
    const t = setTimeout(() => setOpen(true), OPEN_DELAY_MS);
    return () => clearTimeout(t);
  }, [paused, profileId]);

  function dismiss() {
    try {
      if (dontRemind) localStorage.setItem(offKey(profileId), "1");
      else localStorage.setItem(snoozeKey(profileId), String(Date.now()));
    } catch {
      /* ignore */
    }
    setOpen(false);
  }

  // Doit partir d'un geste utilisateur (obligatoire sur iOS Safari).
  async function activate() {
    setBusy(true);
    try {
      const ok = await subscribePush({ role, profileId });
      setPerm(notificationPermission());
      if (ok) updateAppBadge(0);
    } finally {
      setBusy(false);
    }
  }

  const notifOk = perm === "granted";
  const benefits = BENEFITS[role === "player" ? "player" : "staff"];
  // Sur iOS, le push n'existe pas tant que l'app n'est pas sur l'écran d'accueil.
  const canActivate = installed && supported && perm !== "denied";

  return (
    <Modal open={open} onClose={dismiss}>
      <div className="mb-4 text-center">
        <div className="mb-2 text-4xl">🎾</div>
        <h3 className="text-xl font-extrabold text-bright">Ne rate plus aucun tournoi</h3>
        <p className="mt-1 text-sm leading-5 text-sub">
          Installe V-Champs sur ton écran d&apos;accueil et active les notifications : tu es
          prévenu(e) tout de suite, sans avoir à revenir vérifier.
        </p>
      </div>

      <ul className="mb-5 space-y-1.5 rounded-xl bg-card2 p-3">
        {benefits.map((b) => (
          <li key={b} className="flex gap-2 text-xs leading-5 text-sub">
            <span className="text-gold">🔔</span>
            {b}
          </li>
        ))}
      </ul>

      <div className="space-y-4">
        <Step n={1} title="Ajoute l'app à ton écran d'accueil" done={installed}>
          {installed ? (
            <p className="mt-0.5 text-xs text-mut">C&apos;est déjà fait, parfait !</p>
          ) : (
            <p className="mt-0.5 text-xs leading-5 text-sub">
              Appuie sur le bouton <b className="text-body">Partager</b> de Safari (le carré avec
              une flèche, en bas), puis choisis{" "}
              <b className="text-body">« Sur l&apos;écran d&apos;accueil »</b>. Ouvre ensuite
              V-Champs depuis cette nouvelle icône.
            </p>
          )}
        </Step>

        <Step n={2} title="Active les notifications" done={notifOk}>
          {notifOk ? (
            <p className="mt-0.5 text-xs text-mut">Notifications activées sur cet appareil.</p>
          ) : perm === "denied" ? (
            <p className="mt-1 text-xs font-semibold leading-5 text-bad">
              Notifications refusées. Autorise-les dans Réglages iOS → Notifications → V-Champs,
              puis reviens ici.
            </p>
          ) : canActivate ? (
            <Btn size="sm" className="mt-2" disabled={busy} onClick={activate}>
              {busy ? "Activation…" : "🔔 Activer les notifications"}
            </Btn>
          ) : (
            <p className="mt-0.5 text-xs leading-5 text-mut">
              Termine d&apos;abord l&apos;étape 1 : les notifications ne sont possibles
              qu&apos;en ouvrant l&apos;app depuis l&apos;icône de l&apos;écran d&apos;accueil.
            </p>
          )}
        </Step>
      </div>

      <label className="mt-5 flex cursor-pointer items-center gap-2 text-xs font-semibold text-mut">
        <input
          type="checkbox"
          checked={dontRemind}
          onChange={(e) => setDontRemind(e.target.checked)}
          className="h-4 w-4 cursor-pointer accent-[var(--color-gold)]"
        />
        Ne plus me le rappeler
      </label>

      <Btn variant="secondary" className="mt-3 w-full" onClick={dismiss}>
        {installed && notifOk ? "C'est bon !" : "Plus tard"}
      </Btn>
    </Modal>
  );
}
