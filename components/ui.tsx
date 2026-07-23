"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({
  children,
  className = "",
  tone = "default",
}: {
  children: ReactNode;
  className?: string;
  tone?: "default" | "gold" | "danger" | "flat";
}) {
  const border =
    tone === "gold"
      ? "border-gold/50"
      : tone === "danger"
      ? "border-bad/50"
      : "border-line";
  return (
    <div className={`rounded-xl border ${border} bg-card ${tone === "flat" ? "" : "shadow-lg shadow-black/20"} ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={`text-[11px] font-bold uppercase tracking-[2px] text-sub mb-2.5 ${className}`}>
      {children}
    </h2>
  );
}

// Carte-catégorie dépliable : en-tête tappable + corps révélé au clic.
export function CollapsibleCard({
  icon,
  title,
  subtitle,
  badge,
  defaultOpen = false,
  tone = "default",
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  badge?: number;
  defaultOpen?: boolean;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const border = tone === "danger" ? "border-bad/50" : "border-line";
  return (
    <div className={`overflow-hidden rounded-xl border ${border} bg-card shadow-lg shadow-black/20`}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="text-xl leading-none">{icon}</span>
        <span className="min-w-0 flex-1">
          <span
            className={`block text-sm font-extrabold ${tone === "danger" ? "text-bad" : "text-bright"}`}
          >
            {title}
          </span>
          {subtitle && <span className="block truncate text-[11px] text-mut">{subtitle}</span>}
        </span>
        {!!badge && badge > 0 && (
          <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-bad px-1 text-[10px] font-extrabold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
        <span className={`text-sm text-mut transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
      </button>
      {open && <div className="border-t border-line px-4 py-4">{children}</div>}
    </div>
  );
}

type BtnVariant = "primary" | "secondary" | "success" | "danger" | "ghost";

const btnStyles: Record<BtnVariant, string> = {
  primary:
    "bg-gold text-ink hover:bg-gold2 font-bold shadow-lg shadow-gold/10 disabled:bg-line2 disabled:text-mut disabled:shadow-none",
  secondary:
    "bg-card2 text-body border border-line2 hover:border-mut font-semibold disabled:opacity-40",
  success: "bg-ok text-white hover:brightness-110 font-bold disabled:opacity-40",
  danger: "bg-bad text-white hover:brightness-110 font-bold disabled:opacity-40",
  ghost: "bg-transparent text-sub border border-line hover:text-body hover:border-line2 font-semibold disabled:opacity-40",
};

export function Btn({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "px-3 py-1.5 text-xs rounded-lg",
    md: "px-4 py-2.5 text-sm rounded-lg",
    lg: "px-5 py-3.5 text-base rounded-xl w-full",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 transition-all cursor-pointer disabled:cursor-not-allowed ${sizes[size]} ${btnStyles[variant]} ${className}`}
      {...props}
    />
  );
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-line2 bg-surface px-3.5 py-2.5 text-sm text-body placeholder:text-mut outline-none focus:border-gold/60 transition-colors ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-line2 bg-surface px-3 py-2.5 text-sm text-body outline-none focus:border-gold/60 transition-colors ${className}`}
      {...props}
    />
  );
}

export function Badge({
  children,
  color = "sub",
  className = "",
}: {
  children: ReactNode;
  color?: "sub" | "gold" | "ok" | "bad" | "left" | "right";
  className?: string;
}) {
  const colors = {
    sub: "border-line2 text-sub",
    gold: "border-gold/60 text-gold",
    ok: "border-ok/60 text-ok",
    bad: "border-bad/60 text-bad",
    left: "border-left/60 text-left",
    right: "border-right/60 text-right",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${colors[color]} ${className}`}
    >
      {children}
    </span>
  );
}

export function RankBadge({ rank }: { rank: number }) {
  const cls =
    rank === 1 ? "bg-gold text-ink" : rank === 2 ? "bg-[#b8b8c0] text-ink" : "";
  const style =
    rank === 3
      ? { background: "#a97142", color: "#0a0a0b" }
      : rank > 3
      ? { background: "var(--color-card2)", color: "var(--color-sub)" }
      : undefined;
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-extrabold ${rank <= 2 ? cls : ""}`}
      style={style}
    >
      {rank}
    </span>
  );
}

export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold/80 to-gold/40 font-extrabold text-ink"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials || "?"}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-sm text-mut">{children}</div>;
}

export function Loader({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-line2 border-t-gold" />
      <div className="text-xs font-semibold uppercase tracking-widest text-mut">{label}</div>
    </div>
  );
}

export function StatPill({ label, value, color }: { label: string; value: ReactNode; color?: string }) {
  return (
    <div className="flex flex-col items-center rounded-lg bg-card2 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-mut">{label}</span>
      <span className="text-lg font-extrabold" style={color ? { color } : undefined}>
        {value}
      </span>
    </div>
  );
}

// Roue tricolore victoires / nuls / défaites
export function DonutTriple({
  wins,
  draws,
  losses,
  size = 100,
  stroke = 10,
  centerLabel,
  centerSub,
}: {
  wins: number;
  draws: number;
  losses: number;
  size?: number;
  stroke?: number;
  centerLabel?: string;
  centerSub?: string;
}) {
  const total = Math.max(1, wins + draws + losses);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const segs = [
    { v: wins, color: "var(--color-ok)" },
    { v: draws, color: "var(--color-mut)" },
    { v: losses, color: "var(--color-bad)" },
  ];
  let offset = 0;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        {segs.map((s, i) => {
          const len = (s.v / total) * c;
          const el = (
            <circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return s.v > 0 ? el : null;
        })}
      </svg>
      {(centerLabel || centerSub) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel && <span className="text-xl font-extrabold">{centerLabel}</span>}
          {centerSub && (
            <span className="text-[9px] font-bold uppercase tracking-widest text-mut">{centerSub}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Bloque le défilement de l'arrière-plan quand la fenêtre est ouverte.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  // Rendu via un portail sur <body> : la fenêtre échappe ainsi aux animations
  // (transform) des pages qui, sur Safari iOS, la « piégeaient » en bas du
  // contenu au lieu de la superposer par-dessus l'écran.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Fond sombre sur sa propre couche : PAS de backdrop-filter au-dessus du
          contenu (Safari iOS masque sinon le contenu de la fenêtre). */}
      <div className="absolute inset-0 bg-black/75" onClick={onClose} aria-hidden="true" />
      <div className="fade-up relative z-10 max-h-[88dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-line bg-card p-5 sm:rounded-2xl">
        {children}
      </div>
    </div>,
    document.body
  );
}
