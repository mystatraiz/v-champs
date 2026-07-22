-- ═════════════════════════════════════════════════════════════════════════
--  V-CHAMPS PRO (v2) — Migration Supabase
--  À exécuter UNE FOIS dans Supabase → SQL Editor → New query → Run.
--  Script idempotent : il peut être relancé sans risque.
--  Il n'altère AUCUNE donnée de la v1 (app_state, profiles, scores…) —
--  les deux applications continuent de partager la même base.
-- ═════════════════════════════════════════════════════════════════════════

-- ── 1. Niveau du joueur (attribué par l'admin, 4 à 8) ──────────────────────
alter table public.profiles
  add column if not exists level int check (level between 4 and 8);

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

-- ── 5. Reprise des tournois planifiés existants de la v1 (à venir) ─────────
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
