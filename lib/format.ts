export function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr.includes("T") ? dateStr : dateStr + "T00:00:00");
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export function positionLabel(pos: number): string {
  return pos === 1 ? "1er" : `${pos}e`;
}

// Un nom d'équipe « Équipe 1 », « Équipe 2 »… est un libellé par défaut.
export function isGenericTeamName(name?: string): boolean {
  return !name || /^équipe\s*\d+$/i.test(name.trim());
}

// Libellé d'affichage d'une équipe : les noms des joueurs si l'équipe n'a pas
// de nom personnalisé, sinon le nom personnalisé.
export function teamLabel(name: string | undefined, players: (string | undefined)[]): string {
  const p = (players || []).filter(Boolean).join(" / ");
  return isGenericTeamName(name) ? p || name || "" : (name as string);
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

// Créneaux de 1h30 de 8h à 23h
export const TIME_SLOTS: string[] = (() => {
  const slots: string[] = [];
  let m = 8 * 60;
  while (m <= 23 * 60) {
    slots.push(
      `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
    );
    m += 90;
  }
  return slots;
})();
