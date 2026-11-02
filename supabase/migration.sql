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

-- ── 9. Formule des tournois ────────────────────────────────────────────────
-- « equipes » : 4 paires fixes qui se rencontrent toutes (formule historique).
-- « mexicano » : paires recomposées à chaque round selon le classement du jour.
-- « bo4 » : Best Of 4, 4 joueurs sur 1 terrain, chacun avec chacun des deux côtés.
alter table public.tournaments add column if not exists format text not null default 'equipes';
alter table public.tournaments drop constraint if exists tournaments_format_check;
alter table public.tournaments add constraint tournaments_format_check
  check (format in ('equipes','mexicano','bo4'));
alter table public.recurrence_rules add column if not exists format text;

-- ── 10. Reprise des tournois planifiés existants de la v1 (à venir) ────────
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

-- ── 11. Blocage d'un joueur & protection des champs gérés par l'admin ─────
-- Un joueur bloqué (absences répétées sans prévenir…) ne peut plus s'inscrire
-- aux tournois, leçons et matchs. Seul un admin peut bloquer / débloquer.
alter table public.profiles add column if not exists blocked boolean not null default false;
alter table public.profiles add column if not exists blocked_reason text;

-- Chacun peut modifier sa propre fiche (prénom, côté…) mais pas les champs
-- gérés par l'admin : rôle, niveau, joueur lié, blocage. Sans ce garde-fou,
-- un joueur pourrait se débloquer ou se donner le rôle admin via l'API.
create or replace function public.protect_profile_admin_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Ne protège que les requêtes venant de l'appli (joueur connecté ou
  -- visiteur) ; un admin, la clé serveur ou l'éditeur SQL passent.
  if coalesce(auth.role(), '') not in ('authenticated', 'anon') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'pending';
    new.level := null;
    new.linked_player_name := null;
    new.blocked := false;
    new.blocked_reason := null;
  else
    new.role := old.role;
    new.level := old.level;
    new.linked_player_name := old.linked_player_name;
    new.blocked := old.blocked;
    new.blocked_reason := old.blocked_reason;
  end if;
  return new;
end $$;

drop trigger if exists profiles_protect_admin_fields on public.profiles;
create trigger profiles_protect_admin_fields
  before insert or update on public.profiles
  for each row execute function public.protect_profile_admin_fields();

-- Inscriptions refusées en base pour un compte bloqué (politiques
-- « restrictives » : elles s'ajoutent aux autres au lieu de les élargir).
drop policy if exists "registrations_not_blocked" on public.registrations;
create policy "registrations_not_blocked" on public.registrations
  as restrictive for insert to authenticated
  with check (not exists (select 1 from public.profiles p where p.id = auth.uid() and p.blocked));
drop policy if exists "lesson_regs_not_blocked" on public.lesson_registrations;
create policy "lesson_regs_not_blocked" on public.lesson_registrations
  as restrictive for insert to authenticated
  with check (not exists (select 1 from public.profiles p where p.id = auth.uid() and p.blocked));
drop policy if exists "match_regs_not_blocked" on public.match_slot_registrations;
create policy "match_regs_not_blocked" on public.match_slot_registrations
  as restrictive for insert to authenticated
  with check (not exists (select 1 from public.profiles p where p.id = auth.uid() and p.blocked));

-- ── 12. Journal des désistements ──────────────────────────────────────────
-- Un joueur retiré d'un créneau (par lui-même ou par un admin) sort de la
-- liste au lieu de repasser en liste d'attente ; le retrait est consigné ici
-- pour garder la trace de qui l'a retiré et quand.
create table if not exists public.withdrawals (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null check (kind in ('tournament', 'lesson', 'match')),
  slot_id     uuid not null,
  player_name text not null,
  profile_id  uuid references public.profiles(id) on delete set null,
  by_admin    boolean not null default false,
  by_name     text,
  was_status  text,
  created_at  timestamptz not null default now()
);
create index if not exists withdrawals_slot_idx on public.withdrawals (kind, slot_id);
alter table public.withdrawals enable row level security;
drop policy if exists "withdrawals_select" on public.withdrawals;
create policy "withdrawals_select" on public.withdrawals for select to authenticated using (true);
drop policy if exists "withdrawals_insert" on public.withdrawals;
create policy "withdrawals_insert" on public.withdrawals for insert to authenticated with check (true);

-- ── 13. Place libérée : lien envoyé à un joueur en liste d'attente ────────
-- Le joueur ouvre le lien et prend la place s'il en reste une. Tout se fait
-- ici, en une seule opération qui verrouille le créneau : si deux joueurs
-- cliquent en même temps, un seul obtient la place. Réponses : 'ok',
-- 'taken' (plus de place), 'already' (déjà confirmé), 'closed' (créneau
-- terminé ou annulé), 'invalid' (lien plus valable).
create or replace function public.claim_waitlist_spot(p_kind text, p_reg uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_slot uuid; v_status text; v_name text; v_profile uuid;
  v_capacity int; v_slot_status text; v_date date; v_teams jsonb;
  v_taken int; v_side int; v_n int; v_placed boolean := false;
begin
  if p_kind = 'tournament' then
    select tournament_id, status, player_name, profile_id into v_slot, v_status, v_name, v_profile
      from registrations where id = p_reg;
    if not found then return 'invalid'; end if;
    select capacity, status, date, coalesce(teams, '[]'::jsonb) into v_capacity, v_slot_status, v_date, v_teams
      from tournaments where id = v_slot for update;
  elsif p_kind = 'lesson' then
    select lesson_id, status, player_name, profile_id into v_slot, v_status, v_name, v_profile
      from lesson_registrations where id = p_reg;
    if not found then return 'invalid'; end if;
    select capacity, status, date into v_capacity, v_slot_status, v_date
      from lessons where id = v_slot for update;
  elsif p_kind = 'match' then
    select match_slot_id, status, player_name, profile_id into v_slot, v_status, v_name, v_profile
      from match_slot_registrations where id = p_reg;
    if not found then return 'invalid'; end if;
    select capacity, status, date into v_capacity, v_slot_status, v_date
      from match_slots where id = v_slot for update;
  else
    return 'invalid';
  end if;

  if v_status = 'approved' then return 'already'; end if;
  if v_status <> 'waitlist' then return 'invalid'; end if;
  if v_slot_status in ('cancelled', 'done', 'started') or v_date < current_date then return 'closed'; end if;

  -- Places déjà prises (pour un tournoi : confirmés + joueurs de la grille).
  if p_kind = 'tournament' then
    select count(*) into v_taken from (
      select lower(trim(player_name)) as n from registrations
        where tournament_id = v_slot and status = 'approved'
      union
      select lower(trim(p)) from jsonb_array_elements(v_teams) t,
        jsonb_array_elements_text(coalesce(t->'players', '[]'::jsonb)) p
        where trim(p) <> ''
    ) x;
  elsif p_kind = 'lesson' then
    select count(*) into v_taken from lesson_registrations where lesson_id = v_slot and status = 'approved';
  else
    select count(*) into v_taken from match_slot_registrations where match_slot_id = v_slot and status = 'approved';
  end if;
  if v_taken >= v_capacity then return 'taken'; end if;

  if p_kind = 'tournament' then
    update registrations set status = 'approved' where id = p_reg;
    -- Placement dans la grille : côté préféré si possible, sinon 1re place libre.
    select case preferred_side when 'right' then 1 else 0 end into v_side from profiles where id = v_profile;
    v_side := coalesce(v_side, 0);
    v_n := jsonb_array_length(v_teams);
    for pass in 0..1 loop
      exit when v_placed;
      for i in 0..v_n - 1 loop
        for k in 0..1 loop
          continue when pass = 0 and k <> v_side;
          if coalesce(trim(v_teams->i->'players'->>k), '') = '' then
            v_teams := jsonb_set(v_teams, array[i::text, 'players', k::text], to_jsonb(v_name));
            v_placed := true;
            exit;
          end if;
        end loop;
        exit when v_placed;
      end loop;
    end loop;
    if v_placed then update tournaments set teams = v_teams where id = v_slot; end if;
  elsif p_kind = 'lesson' then
    update lesson_registrations set status = 'approved' where id = p_reg;
  else
    update match_slot_registrations set status = 'approved' where id = p_reg;
  end if;
  return 'ok';
end $$;
