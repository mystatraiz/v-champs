-- ═════════════════════════════════════════════════════════════════════════
--  V-CHAMPS PRO (v2) — Migration Supabase
--  À exécuter UNE FOIS dans Supabase → SQL Editor → New query → Run.
--  Script idempotent : il peut être relancé sans risque.
--  Il n'altère AUCUNE donnée de la v1 (app_state, profiles, scores…) —
--  les deux applications continuent de partager la même base.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 1. Niveau du joueur (attribué par l'admin, 1 à 10) ─────────────────────
alter table public.profiles add column if not exists level int;
-- Contrainte 1..10 (remplace l'ancienne 4..8 le cas échéant). Idempotent.
alter table public.profiles drop constraint if exists profiles_level_check;
alter table public.profiles add constraint profiles_level_check check (level between 1 and 10);

-- ── 2. Tournois planifiés (remplace le JSON planned_tournaments de la v1) ──
create table if not exists public.tournaments (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  time       text not null default '12:30',
  level      text not null default '6/7',
  courts     int  not null default 2,
  capacity   int  not null default 8,
  status     text not null default 'open'
             check (status in ('open','locked','started','done','cancelled')),
  teams      jsonb,
  created_at timestamptz not null default now()
);

-- ── 3. Demandes d'inscription des joueurs ──────────────────────────────────
create table if not exists public.registrations (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete set null,
  player_name   text not null,
  status        text not null default 'pending'
                check (status in ('pending','approved','declined','waitlist')),
  is_guest      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Un même nom ne peut s'inscrire qu'une fois par tournoi
create unique index if not exists registrations_unique_name
  on public.registrations (tournament_id, lower(trim(player_name)));

-- ── 4. Row Level Security ───────────────────────────────────────────────────
-- Modèle aligné sur la v1 : lecture publique, écriture ouverte aux comptes
-- connectés (la gestion fine des rôles est faite côté application).
alter table public.tournaments   enable row level security;
alter table public.registrations enable row level security;

drop policy if exists "tournaments_select" on public.tournaments;
create policy "tournaments_select" on public.tournaments
  for select using (true);

drop policy if exists "tournaments_write" on public.tournaments;
create policy "tournaments_write" on public.tournaments
  for all to authenticated using (true) with check (true);

drop policy if exists "registrations_select" on public.registrations;
create policy "registrations_select" on public.registrations
  for select using (true);

-- Les invités (non connectés, lien WhatsApp) peuvent uniquement déposer
-- une demande "pending".
drop policy if exists "registrations_insert_guest" on public.registrations;
create policy "registrations_insert_guest" on public.registrations
  for insert to anon with check (status = 'pending');

drop policy if exists "registrations_write" on public.registrations;
create policy "registrations_write" on public.registrations
  for all to authenticated using (true) with check (true);

-- ── 5. Leçons (coaching) ───────────────────────────────────────────────────
-- Une leçon cible un ou plusieurs niveaux de joueurs (1..10) et se décline en
-- deux types : « phases » (phases de jeu, 4 joueurs/terrain) et « panier »
-- (3 joueurs/terrain).
create table if not exists public.lessons (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  time       text not null default '12:30',
  levels     int[] not null default '{}',
  kind       text not null default 'phases' check (kind in ('phases','panier')),
  courts     int  not null default 1,
  capacity   int  not null default 4,
  status     text not null default 'open'
             check (status in ('open','locked','done','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.lesson_registrations (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  profile_id  uuid references public.profiles(id) on delete set null,
  player_name text not null,
  status      text not null default 'pending'
              check (status in ('pending','approved','declined','waitlist')),
  is_guest    boolean not null default false,
  created_at  timestamptz not null default now()
);

-- Thème libre saisi par le coach (« Volée haute », « Sortie de vitre »…).
alter table public.lessons add column if not exists theme text;

-- Un même nom ne peut s'inscrire qu'une fois par leçon
create unique index if not exists lesson_registrations_unique_name
  on public.lesson_registrations (lesson_id, lower(trim(player_name)));

alter table public.lessons              enable row level security;
alter table public.lesson_registrations enable row level security;

drop policy if exists "lessons_select" on public.lessons;
create policy "lessons_select" on public.lessons
  for select using (true);

drop policy if exists "lessons_write" on public.lessons;
create policy "lessons_write" on public.lessons
  for all to authenticated using (true) with check (true);

drop policy if exists "lesson_regs_select" on public.lesson_registrations;
create policy "lesson_regs_select" on public.lesson_registrations
  for select using (true);

drop policy if exists "lesson_regs_insert_guest" on public.lesson_registrations;
create policy "lesson_regs_insert_guest" on public.lesson_registrations
  for insert to anon with check (status = 'pending');

drop policy if exists "lesson_regs_write" on public.lesson_registrations;
create policy "lesson_regs_write" on public.lesson_registrations
  for all to authenticated using (true) with check (true);

-- ── 6. Créneaux de match (organisés par les coachs / admins) ───────────────
-- Un créneau libre proposé aux joueurs des niveaux visés. Pas de composition
-- d'équipes ni de score : les joueurs jouent entre eux, rien n'entre au
-- classement V-Champs (ce rôle reste celui des tournois).
create table if not exists public.match_slots (
  id         uuid primary key default gen_random_uuid(),
  date       date not null,
  time       text not null default '18:30',
  levels     int[] not null default '{}',
  courts     int  not null default 1,
  capacity   int  not null default 4,
  status     text not null default 'open'
             check (status in ('open','locked','done','cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.match_slot_registrations (
  id            uuid primary key default gen_random_uuid(),
  match_slot_id uuid not null references public.match_slots(id) on delete cascade,
  profile_id    uuid references public.profiles(id) on delete set null,
  player_name   text not null,
  status        text not null default 'pending'
                check (status in ('pending','approved','declined','waitlist')),
  is_guest      boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Un même nom ne peut s'inscrire qu'une fois par créneau
create unique index if not exists match_slot_registrations_unique_name
  on public.match_slot_registrations (match_slot_id, lower(trim(player_name)));

alter table public.match_slots              enable row level security;
alter table public.match_slot_registrations enable row level security;

drop policy if exists "match_slots_select" on public.match_slots;
create policy "match_slots_select" on public.match_slots
  for select using (true);

drop policy if exists "match_slots_write" on public.match_slots;
create policy "match_slots_write" on public.match_slots
  for all to authenticated using (true) with check (true);

drop policy if exists "match_regs_select" on public.match_slot_registrations;
create policy "match_regs_select" on public.match_slot_registrations
  for select using (true);

drop policy if exists "match_regs_insert_guest" on public.match_slot_registrations;
create policy "match_regs_insert_guest" on public.match_slot_registrations
  for insert to anon with check (status = 'pending');

drop policy if exists "match_regs_write" on public.match_slot_registrations;
create policy "match_regs_write" on public.match_slot_registrations
  for all to authenticated using (true) with check (true);

-- ── 7. Qui a créé le créneau ───────────────────────────────────────────────
-- Renseigné à la création ; reste vide pour les tournois générés
-- automatiquement par les règles de récurrence.
alter table public.tournaments add column if not exists created_by uuid
  references public.profiles(id) on delete set null;
alter table public.lessons     add column if not exists created_by uuid
  references public.profiles(id) on delete set null;
alter table public.match_slots add column if not exists created_by uuid
  references public.profiles(id) on delete set null;

-- ── 8. Règles de récurrence ────────────────────────────────────────────────
-- Un créneau qui se répète. start_date porte la première occurrence : elle fixe
-- le jour de la semaine et la phase (pour « une semaine sur deux »).
create table if not exists public.recurrence_rules (
  id             uuid primary key default gen_random_uuid(),
  kind           text not null check (kind in ('tournament','lesson','match')),
  start_date     date not null,
  time           text not null,
  interval_weeks int  not null default 1 check (interval_weeks between 1 and 4),
  keep_ahead     int  not null default 4 check (keep_ahead between 1 and 12),
  -- Gabarit du créneau à créer
  level          text,                        -- tournois
  levels         int[] not null default '{}', -- leçons et matchs
  lesson_kind    text,                        -- leçons
  theme          text,                        -- leçons
  courts         int  not null default 2,
  capacity       int  not null default 8,
  active         boolean not null default true,
  created_by     uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

alter table public.recurrence_rules enable row level security;

drop policy if exists "recurrence_select" on public.recurrence_rules;
create policy "recurrence_select" on public.recurrence_rules
  for select using (true);

drop policy if exists "recurrence_write" on public.recurrence_rules;
create policy "recurrence_write" on public.recurrence_rules
  for all to authenticated using (true) with check (true);

-- Reprise des deux récurrences historiques (lundi/mardi 6/7, jeudi 5/6), qui
-- étaient codées en dur. Ancrées sur le prochain jour correspondant.
insert into public.recurrence_rules (kind, start_date, time, interval_weeks, keep_ahead, level, courts, capacity)
select v.kind, v.start_date, v.time, 1, 4, v.level, 2, 8
from (values
  ('tournament', (current_date + ((1 - extract(isodow from current_date)::int + 7) % 7))::date, '12:30', '6/7'),
  ('tournament', (current_date + ((2 - extract(isodow from current_date)::int + 7) % 7))::date, '12:30', '6/7'),
  ('tournament', (current_date + ((4 - extract(isodow from current_date)::int + 7) % 7))::date, '12:30', '5/6')
) as v(kind, start_date, time, level)
where not exists (
  select 1 from public.recurrence_rules r
  where r.kind = v.kind and r.time = v.time
    and extract(isodow from r.start_date) = extract(isodow from v.start_date)
);

-- ── 9. Reprise des tournois planifiés existants de la v1 (à venir) ─────────
insert into public.tournaments (date, time, level, courts, capacity, status, teams)
select
  (elem->>'date')::date,
  coalesce(nullif(elem->>'time',''), '12:30'),
  coalesce(nullif(elem->>'label',''), '6/7'),
  2,
  8,
  'open',
  case when jsonb_typeof(elem->'teams') = 'array' then elem->'teams' else null end
from public.app_state s,
     jsonb_array_elements(s.value) elem
where s.key = 'planned_tournaments'
  and (elem->>'date')::date >= current_date
  and not exists (
    select 1 from public.tournaments t
    where t.date = (elem->>'date')::date
      and t.time = coalesce(nullif(elem->>'time',''), '12:30')
  );

-- Reprise des inscrits via lien (joinList) → demandes en attente
insert into public.registrations (tournament_id, player_name, status, is_guest)
select
  t.id,
  j->>'name',
  'pending',
  coalesce((j->>'isGuest')::boolean, true)
from public.app_state s,
     jsonb_array_elements(s.value) elem
join public.tournaments t
  on t.date = (elem->>'date')::date
 and t.time = coalesce(nullif(elem->>'time',''), '12:30')
cross join lateral jsonb_array_elements(coalesce(elem->'joinList','[]'::jsonb)) j
where s.key = 'planned_tournaments'
  and (elem->>'date')::date >= current_date
on conflict (tournament_id, lower(trim(player_name))) do nothing;
