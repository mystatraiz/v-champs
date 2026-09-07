// ═══ Statistiques du club (espace organisateur) ═══
// Volontairement orientées action : ce qui aide à remplir les créneaux et à
// repérer les joueurs à relancer, plutôt que des compteurs décoratifs.

import type {
  Lesson,
  LessonRegistration,
  MatchSlot,
  MatchSlotRegistration,
  Profile,
  Registration,
  SessionHistoryEntry,
  Tournament,
} from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SlotLike {
  date: string;
  time: string;
  capacity: number;
  status: string;
}

// ─── Activité passée (sessions jouées) ───

export interface ActivityStats {
  sessions: number;
  matches: number;
  players: number;
  avgPlayersPerSession: number;
}

export function activityStats(history: SessionHistoryEntry[], days: number): ActivityStats {
  const cutoff = Date.now() - days * DAY_MS;
  const recent = history.filter((s) => new Date(s.date).getTime() >= cutoff);
  const players = new Set<string>();
  let matches = 0;
  recent.forEach((s) => {
    matches += (s.matches || []).length;
    (s.teams || []).forEach((t) =>
      (t.players || []).forEach((p) => {
        if (p?.trim()) players.add(p.trim().toLowerCase());
      })
    );
  });
  return {
    sessions: recent.length,
    matches,
    players: players.size,
    avgPlayersPerSession: recent.length ? Math.round((players.size / recent.length) * 10) / 10 : 0,
  };
}

// ─── Remplissage d'un ensemble de créneaux ───

export interface FillStats {
  slots: number;
  seats: number;
  taken: number;
  rate: number; // 0..100
  full: number;
  empty: number;
}

export function fillStats(slots: SlotLike[], filledBySlot: number[]): FillStats {
  const seats = slots.reduce((s, x) => s + x.capacity, 0);
  const taken = filledBySlot.reduce((s, n) => s + n, 0);
  return {
    slots: slots.length,
    seats,
    taken,
    rate: seats ? Math.round((taken / seats) * 100) : 0,
    full: slots.filter((s, i) => filledBySlot[i] >= s.capacity).length,
    empty: slots.filter((_, i) => filledBySlot[i] === 0).length,
  };
}

// Nombre d'inscrits confirmés pour chaque créneau, dans l'ordre donné.
export function confirmedCounts<T extends { id: string }, R extends { status: string }>(
  slots: T[],
  regs: R[],
  slotIdOf: (r: R) => string
): number[] {
  const bySlot = new Map<string, number>();
  regs.forEach((r) => {
    if (r.status !== "approved") return;
    const id = slotIdOf(r);
    bySlot.set(id, (bySlot.get(id) || 0) + 1);
  });
  return slots.map((s) => bySlot.get(s.id) || 0);
}

// ─── Créneaux horaires qui marchent le mieux ───

export interface SlotPerf {
  key: string; // « Mardi 12:30 »
  slots: number;
  rate: number;
}

const WEEKDAYS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

export function bestTimeSlots(slots: SlotLike[], filled: number[], min = 2): SlotPerf[] {
  const agg = new Map<string, { seats: number; taken: number; n: number }>();
  slots.forEach((s, i) => {
    const d = new Date(s.date + "T00:00:00");
    const key = `${WEEKDAYS[d.getDay()]} ${s.time}`;
    const a = agg.get(key) ?? { seats: 0, taken: 0, n: 0 };
    a.seats += s.capacity;
    a.taken += filled[i];
    a.n++;
    agg.set(key, a);
  });
  return [...agg.entries()]
    .filter(([, a]) => a.n >= min)
    .map(([key, a]) => ({ key, slots: a.n, rate: a.seats ? Math.round((a.taken / a.seats) * 100) : 0 }))
    .sort((a, b) => b.rate - a.rate);
}

// ─── Vitesse de remplissage ───
// Combien de temps s'écoule entre l'ouverture d'un créneau et le moment où la
// dernière place part. Sert à repérer les créneaux qui partent tout seuls et
// ceux qu'il faut relancer.

export interface SlotFill {
  key: string; // « Mardi 12:30 »
  hoursToFill: number | null; // null = jamais rempli
  lastMinute: boolean; // complété dans les 24 h précédant la séance
  everFull: boolean;
}

// Horodatage du début de la séance à partir de « 2026-09-08 » + « 12:30 ».
function slotStart(date: string, time: string): number {
  return new Date(`${date}T${(time || "00:00").padEnd(5, "0")}:00`).getTime();
}

export function slotFillTimes<
  T extends { id: string; date: string; time: string; capacity: number; created_at?: string },
  R extends { status: string; created_at: string },
>(slots: T[], regs: R[], slotIdOf: (r: R) => string): SlotFill[] {
  const approvedBySlot = new Map<string, number[]>();
  regs.forEach((r) => {
    if (r.status !== "approved" || !r.created_at) return;
    const id = slotIdOf(r);
    const arr = approvedBySlot.get(id) ?? [];
    arr.push(new Date(r.created_at).getTime());
    approvedBySlot.set(id, arr);
  });

  return slots.map((s) => {
    const d = new Date(s.date + "T00:00:00");
    const key = `${WEEKDAYS[d.getDay()]} ${s.time}`;
    const times = (approvedBySlot.get(s.id) ?? []).sort((a, b) => a - b);
    const opened = s.created_at ? new Date(s.created_at).getTime() : null;

    // La place qui complète le créneau est la capacité-ième inscription.
    const fullAt = times.length >= s.capacity ? times[s.capacity - 1] : null;
    const hoursToFill =
      fullAt != null && opened != null && fullAt >= opened
        ? Math.round(((fullAt - opened) / 3_600_000) * 10) / 10
        : null;

    return {
      key,
      hoursToFill,
      everFull: fullAt != null,
      lastMinute: fullAt != null && slotStart(s.date, s.time) - fullAt <= 24 * 3_600_000,
    };
  });
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  const m = v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
  return Math.round(m * 10) / 10;
}

export interface FillSpeedRow {
  key: string;
  slots: number;
  filled: number;
  medianHours: number | null;
  lastMinute: number;
}

// Agrège la vitesse de remplissage par créneau horaire récurrent.
export function fillSpeedByTimeSlot(fills: SlotFill[], min = 2): FillSpeedRow[] {
  const agg = new Map<string, { slots: number; filled: number; hours: number[]; late: number }>();
  fills.forEach((f) => {
    const a = agg.get(f.key) ?? { slots: 0, filled: 0, hours: [], late: 0 };
    a.slots++;
    if (f.everFull) a.filled++;
    if (f.hoursToFill != null) a.hours.push(f.hoursToFill);
    if (f.lastMinute) a.late++;
    agg.set(f.key, a);
  });
  return [...agg.entries()]
    .filter(([, a]) => a.slots >= min)
    .map(([key, a]) => ({
      key,
      slots: a.slots,
      filled: a.filled,
      medianHours: median(a.hours),
      lastMinute: a.late,
    }))
    .sort((a, b) => {
      // Les plus rapides d'abord ; les jamais remplis en dernier.
      if (a.medianHours == null) return 1;
      if (b.medianHours == null) return -1;
      return a.medianHours - b.medianHours;
    });
}

// Libellé lisible d'un délai en heures.
export function formatDelay(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${Math.round(hours)} h`;
  return `${Math.round(hours / 24)} j`;
}

// ─── Joueurs : les plus actifs, et ceux qui ont décroché ───

export interface PlayerActivity {
  name: string;
  sessions: number;
  lastPlayed: string | null;
  daysSince: number | null;
}

export function playerActivity(history: SessionHistoryEntry[]): PlayerActivity[] {
  const map = new Map<string, { name: string; sessions: number; last: number }>();
  history.forEach((s) => {
    const ts = new Date(s.date).getTime();
    const seen = new Set<string>();
    (s.teams || []).forEach((t) =>
      (t.players || []).forEach((p) => {
        const name = (p || "").trim();
        if (!name) return;
        const key = name.toLowerCase();
        if (seen.has(key)) return; // une session compte une fois par joueur
        seen.add(key);
        const cur = map.get(key) ?? { name, sessions: 0, last: 0 };
        cur.sessions++;
        cur.last = Math.max(cur.last, ts);
        map.set(key, cur);
      })
    );
  });
  const now = Date.now();
  return [...map.values()]
    .map((p) => ({
      name: p.name,
      sessions: p.sessions,
      lastPlayed: p.last ? new Date(p.last).toISOString() : null,
      daysSince: p.last ? Math.floor((now - p.last) / DAY_MS) : null,
    }))
    .sort((a, b) => b.sessions - a.sessions);
}

// ─── Comptes : ce qui demande une action ───

export interface AccountStats {
  total: number;
  players: number;
  organisers: number;
  admins: number;
  pending: number;
  withoutLevel: number;
  unlinked: number;
  byLevel: { level: number; count: number }[];
}

export function accountStats(profiles: Profile[]): AccountStats {
  const active = profiles.filter((p) => p.role !== "pending");
  const byLevel = new Map<number, number>();
  active.forEach((p) => {
    if (p.level != null) byLevel.set(p.level, (byLevel.get(p.level) || 0) + 1);
  });
  return {
    total: profiles.length,
    players: profiles.filter((p) => p.role === "player").length,
    organisers: profiles.filter((p) => p.role === "organisateur").length,
    admins: profiles.filter((p) => p.role === "admin").length,
    pending: profiles.filter((p) => p.role === "pending").length,
    withoutLevel: active.filter((p) => p.level == null).length,
    unlinked: active.filter((p) => !p.linked_player_name).length,
    byLevel: [...byLevel.entries()]
      .map(([level, count]) => ({ level, count }))
      .sort((a, b) => a.level - b.level),
  };
}

// ─── Ce qu'il reste à traiter ───

export function pendingCounts(
  regs: Registration[],
  lessonRegs: LessonRegistration[],
  matchRegs: MatchSlotRegistration[]
): { tournament: number; lesson: number; match: number; total: number } {
  const n = (arr: { status: string }[]) => arr.filter((r) => r.status === "pending").length;
  const t = n(regs);
  const l = n(lessonRegs);
  const m = n(matchRegs);
  return { tournament: t, lesson: l, match: m, total: t + l + m };
}

// Créneaux à venir encore incomplets, du plus proche au plus lointain.
export function underfilled(
  slots: (SlotLike & { id: string })[],
  filled: number[],
  today: string
): { id: string; date: string; time: string; missing: number }[] {
  return slots
    .map((s, i) => ({ ...s, filled: filled[i] }))
    .filter((s) => s.date >= today && s.status !== "cancelled" && s.filled < s.capacity)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    .map((s) => ({ id: s.id, date: s.date, time: s.time, missing: s.capacity - s.filled }));
}

// Récapitulatif : combien de créneaux chaque organisateur a-t-il créés ?
export function organiserActivity(
  tournaments: Tournament[],
  lessons: Lesson[],
  matches: MatchSlot[],
  profiles: Profile[]
): { name: string; tournaments: number; lessons: number; matches: number; total: number }[] {
  const name = (id?: string | null) => {
    if (!id) return "Récurrence auto";
    const p = profiles.find((x) => x.id === id);
    return p ? `${p.first_name} ${p.last_name.charAt(0).toUpperCase()}.` : "Compte supprimé";
  };
  const map = new Map<string, { tournaments: number; lessons: number; matches: number }>();
  const bump = (id: string | null | undefined, key: "tournaments" | "lessons" | "matches") => {
    const n = name(id);
    const cur = map.get(n) ?? { tournaments: 0, lessons: 0, matches: 0 };
    cur[key]++;
    map.set(n, cur);
  };
  tournaments.forEach((t) => bump(t.created_by, "tournaments"));
  lessons.forEach((l) => bump(l.created_by, "lessons"));
  matches.forEach((m) => bump(m.created_by, "matches"));

  return [...map.entries()]
    .map(([name, v]) => ({ name, ...v, total: v.tournaments + v.lessons + v.matches }))
    .sort((a, b) => b.total - a.total);
}
