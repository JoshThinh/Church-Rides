-- ============================================================================
-- LBC Rides — database schema
-- Run this whole file once in Supabase → SQL Editor → New query → Run.
-- It is safe to re-run: it drops and recreates the functions and policies.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists pickup_locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 60),
  sort_order  int  not null default 0,
  active      boolean not null default true
);

create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('church', 'cl', 'event')),
  title        text not null check (char_length(title) between 2 and 80),
  description  text not null default '',
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  destination  text not null default '',
  created_at   timestamptz not null default now(),
  constraint ends_after_start check (ends_at > starts_at)
);

-- One row per driver; id is their Supabase Auth user id.
create table if not exists drivers (
  id               uuid primary key references auth.users (id) on delete cascade,
  name             text not null,
  phone            text not null,
  car_description  text not null,
  seats            int  not null check (seats between 1 and 12)
);

create table if not exists ride_offers (
  id            uuid primary key default gen_random_uuid(),
  event_id      uuid not null references events (id) on delete cascade,
  driver_id     uuid not null references drivers (id) on delete cascade,
  seats         int  not null check (seats between 1 and 12),
  depart_time   timestamptz not null,
  gc_join_link  text check (gc_join_link is null or gc_join_link ~* '^https://(www\.)?(m\.me|messenger\.com|facebook\.com/messages)/'),
  created_at    timestamptz not null default now(),
  unique (event_id, driver_id)
);

create table if not exists ride_requests (
  id                 uuid primary key default gen_random_uuid(),
  -- Secret saved on the rider's phone; lets them see/cancel their own ride
  -- without making an account.
  token              uuid not null unique default gen_random_uuid(),
  event_id           uuid not null references events (id) on delete cascade,
  rider_name         text not null check (char_length(rider_name) between 2 and 60),
  phone              text not null check (phone ~ '^\d{10}$'),
  messenger          text not null default '',
  pickup_id          uuid not null references pickup_locations (id),
  notes              text not null default '',
  assigned_offer_id  uuid references ride_offers (id) on delete set null,
  created_at         timestamptz not null default now()
);

create index if not exists ride_requests_offer_idx on ride_requests (assigned_offer_id);
create index if not exists ride_requests_event_idx on ride_requests (event_id);
create index if not exists ride_offers_event_idx on ride_offers (event_id);

-- ---------------------------------------------------------------------------
-- Who is an admin?
-- The shared admin login is one Supabase Auth user whose app_metadata has
-- {"role": "admin"}. app_metadata can only be changed by the server, so
-- nobody can make themselves an admin from the website.
-- ---------------------------------------------------------------------------

create or replace function is_admin() returns boolean
language sql stable set search_path = public as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

-- ---------------------------------------------------------------------------
-- Row-Level Security: what each kind of visitor may read or change
-- ---------------------------------------------------------------------------

alter table pickup_locations enable row level security;
alter table events           enable row level security;
alter table drivers          enable row level security;
alter table ride_offers      enable row level security;
alter table ride_requests    enable row level security;

drop policy if exists "anyone reads pickup spots" on pickup_locations;
drop policy if exists "admin edits pickup spots"  on pickup_locations;
create policy "anyone reads pickup spots" on pickup_locations for select using (true);
create policy "admin edits pickup spots"  on pickup_locations for all using (is_admin()) with check (is_admin());

drop policy if exists "anyone reads events" on events;
drop policy if exists "admin edits events"  on events;
create policy "anyone reads events" on events for select using (true);
create policy "admin edits events"  on events for all using (is_admin()) with check (is_admin());

drop policy if exists "driver manages own profile" on drivers;
drop policy if exists "admin reads drivers"        on drivers;
create policy "driver manages own profile" on drivers for all
  using (id = auth.uid()) with check (id = auth.uid() and not is_admin());
create policy "admin reads drivers" on drivers for select using (is_admin());

-- Offers (they hold the group chat link) are only readable by their driver
-- and admins. Riders see public info through event_offers() below.
drop policy if exists "driver manages own offers" on ride_offers;
drop policy if exists "admin manages offers"      on ride_offers;
create policy "driver manages own offers" on ride_offers for all
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());
create policy "admin manages offers" on ride_offers for all using (is_admin()) with check (is_admin());

-- Rider phone numbers: only the rider's own driver and admins can read them.
-- There is NO insert policy: riders sign up only through request_ride().
drop policy if exists "driver reads own riders" on ride_requests;
drop policy if exists "admin manages requests"  on ride_requests;
create policy "driver reads own riders" on ride_requests for select using (
  exists (select 1 from ride_offers o where o.id = ride_requests.assigned_offer_id and o.driver_id = auth.uid())
);
create policy "admin manages requests" on ride_requests for all using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- Public functions (SECURITY DEFINER = runs with table-owner rights, so it
-- can return exactly the safe columns and nothing more)
-- ---------------------------------------------------------------------------

-- Drivers for one event, without phone numbers or group chat links.
create or replace function event_offers(p_event_id uuid)
returns table (
  id uuid, event_id uuid, driver_name text, car_description text,
  seats int, seats_taken int, depart_time timestamptz, pickup_ids uuid[]
)
language sql stable security definer set search_path = public as $$
  select o.id, o.event_id, d.name, d.car_description, o.seats,
         count(r.id)::int,
         o.depart_time,
         coalesce(array_agg(r.pickup_id) filter (where r.id is not null), '{}')
  from ride_offers o
  join drivers d on d.id = o.driver_id
  left join ride_requests r on r.assigned_offer_id = o.id
  where o.event_id = p_event_id
  group by o.id, d.name, d.car_description
  order by o.depart_time;
$$;

-- Rider sign-up. Picks a car with the same rules as src/lib/assign.ts:
-- open seat → already stopping at your pickup spot → most open seats → leaves first.
create or replace function request_ride(
  p_event_id uuid, p_rider_name text, p_phone text, p_messenger text,
  p_pickup_id uuid, p_notes text, p_offer_id uuid default null
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_event   events;
  v_offer   uuid;
  v_token   uuid;
  v_taken   int;
  v_seats   int;
begin
  select * into v_event from events where id = p_event_id;
  if v_event.id is null or v_event.cancelled or v_event.starts_at <= now() then
    raise exception 'Sign-ups for this ride are closed.';
  end if;
  if not exists (select 1 from pickup_locations where id = p_pickup_id and active) then
    raise exception 'Choose a pickup spot.';
  end if;

  -- Lock this event's offers so two people can't grab the last seat at once.
  perform 1 from ride_offers where event_id = p_event_id for update;

  if p_offer_id is not null then
    select o.seats, count(r.id) into v_seats, v_taken
    from ride_offers o left join ride_requests r on r.assigned_offer_id = o.id
    where o.id = p_offer_id and o.event_id = p_event_id
    group by o.id;
    if v_seats is null then raise exception 'That driver is no longer available.'; end if;
    if v_taken >= v_seats then raise exception 'That car just filled up. Pick another driver or "Any driver".'; end if;
    v_offer := p_offer_id;
  else
    select o.id into v_offer
    from ride_offers o left join ride_requests r on r.assigned_offer_id = o.id
    where o.event_id = p_event_id
    group by o.id
    having count(r.id) < o.seats
    order by bool_or(r.pickup_id = p_pickup_id) desc nulls last,
             o.seats - count(r.id) desc,
             o.depart_time
    limit 1;
  end if;

  insert into ride_requests (event_id, rider_name, phone, messenger, pickup_id, notes, assigned_offer_id)
  values (p_event_id, trim(p_rider_name), p_phone, coalesce(trim(p_messenger), ''), p_pickup_id, coalesce(trim(p_notes), ''), v_offer)
  returning token into v_token;

  return json_build_object('token', v_token, 'assigned_offer_id', v_offer);
end;
$$;

-- A rider's own rides, looked up by the tokens saved on their device.
-- The group chat link is only returned while the event has not ended.
create or replace function my_rides(p_tokens uuid[])
returns json
language sql stable security definer set search_path = public as $$
  select coalesce(json_agg(x order by (x->'event'->>'starts_at')), '[]'::json) from (
    select json_build_object(
      'token', r.token,
      'rider_name', r.rider_name,
      'pickup_name', p.name,
      'event', to_json(e),
      'driver', case when o.id is null then null else json_build_object(
        'name', d.name, 'phone', d.phone, 'car_description', d.car_description, 'depart_time', o.depart_time
      ) end,
      'gc_join_link', case when e.ends_at > now() then o.gc_join_link else null end
    ) as x
    from ride_requests r
    join events e on e.id = r.event_id
    join pickup_locations p on p.id = r.pickup_id
    left join ride_offers o on o.id = r.assigned_offer_id
    left join drivers d on d.id = o.driver_id
    where r.token = any (p_tokens)
  ) rides;
$$;

create or replace function cancel_ride(p_token uuid) returns void
language sql security definer set search_path = public as $$
  delete from ride_requests where token = p_token;
$$;

grant execute on function event_offers(uuid) to anon, authenticated;
grant execute on function request_ride(uuid, text, text, text, uuid, text, uuid) to anon, authenticated;
grant execute on function my_rides(uuid[]) to anon, authenticated;
grant execute on function cancel_ride(uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nightly cleanup: delete group chat links for events that have ended.
-- (The links are already hidden from riders by my_rides(); this removes them.)
-- Enable "pg_cron" in Database → Extensions first, then run this block.
-- ---------------------------------------------------------------------------
-- select cron.schedule(
--   'clear-ended-gc-links',
--   '0 9 * * *',  -- 09:00 UTC = 2 AM in San Diego
--   $$ update ride_offers o set gc_join_link = null
--      from events e
--      where e.id = o.event_id and e.ends_at < now() and o.gc_join_link is not null $$
-- );

-- ---------------------------------------------------------------------------
-- Starting data
-- ---------------------------------------------------------------------------

insert into pickup_locations (name, sort_order)
select v.name, v.ord from (values
  ('Zura Loop', 0), ('Eureka Loop', 1), ('Chapultepec Hall', 2), ('Cuicacalli Suites', 3),
  ('Villa Alvarado', 4), ('Aztec Corner', 5), ('South Campus Plaza', 6), ('Other / off-campus', 7)
) as v(name, ord)
where not exists (select 1 from pickup_locations);

-- ---------------------------------------------------------------------------
-- Make the shared admin login (do this once):
--  1. Authentication → Users → Add user → email: admin@lbcrides.app,
--     pick a password, tick "Auto confirm user".
--  2. Run:
--     update auth.users
--     set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
--     where email = 'admin@lbcrides.app';
--  On the site, sign in with username "admin" and that password.
-- ---------------------------------------------------------------------------

-- ============================================================================
-- Weekly rides (added Oct 2026): Church and CL repeat every week and post
-- their own dates for the next 3 weeks. Times are San Diego local time.
-- ============================================================================

create table if not exists ride_series (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in ('church', 'cl')),
  title        text not null check (char_length(title) between 2 and 80),
  description  text not null default '',
  weekday      int  not null check (weekday between 0 and 6),   -- 0 = Sunday … 6 = Saturday
  start_time   time not null,
  end_time     time not null,
  destination  text not null default '',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

alter table ride_series enable row level security;
drop policy if exists "anyone reads weekly rides" on ride_series;
drop policy if exists "admin edits weekly rides"  on ride_series;
create policy "anyone reads weekly rides" on ride_series for select using (true);
create policy "admin edits weekly rides"  on ride_series for all using (is_admin()) with check (is_admin());

alter table events add column if not exists series_id uuid references ride_series (id) on delete set null;
alter table events add column if not exists cancelled boolean not null default false;
create unique index if not exists events_series_start_uidx on events (series_id, starts_at);

-- Posts the next few weeks of dates for every active weekly ride. Safe to call any number of times.
-- A date hidden earlier comes back if it matches the schedule again.
create or replace function ensure_upcoming_events(p_weeks int default 3) returns int
language plpgsql security definer set search_path = public as $$
declare
  v_today date := (now() at time zone 'America/Los_Angeles')::date;
  v_added int;
begin
  insert into events (category, title, description, starts_at, ends_at, destination, series_id)
  select s.category, s.title, s.description,
         (g.day + s.start_time) at time zone 'America/Los_Angeles',
         (g.day + s.end_time + case when s.end_time <= s.start_time then interval '1 day' else interval '0' end)
           at time zone 'America/Los_Angeles',
         s.destination, s.id
  from ride_series s
  cross join lateral (
    select d::date as day
    from generate_series(v_today, v_today + least(greatest(p_weeks, 1), 8) * 7, interval '1 day') d
  ) g
  where s.active
    and extract(dow from g.day) = s.weekday
    and (g.day + s.start_time) at time zone 'America/Los_Angeles' > now()
  on conflict (series_id, starts_at) do update
    set cancelled = false, title = excluded.title, description = excluded.description,
        destination = excluded.destination, ends_at = excluded.ends_at, category = excluded.category;
  get diagnostics v_added = row_count;
  return v_added;
end;
$$;

-- After an admin edits or pauses a weekly ride: hide its future dates that nobody
-- has signed up for or offered to drive, update the rest, then refill from the schedule.
create or replace function sync_series(p_series_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s ride_series;
begin
  if not is_admin() then raise exception 'Only admins can change weekly rides.'; end if;
  select * into s from ride_series where id = p_series_id;
  if s.id is null then return; end if;

  update events e set cancelled = true
  where e.series_id = s.id and e.starts_at > now()
    and not exists (select 1 from ride_requests r where r.event_id = e.id)
    and not exists (select 1 from ride_offers o where o.event_id = e.id);

  update events e set
    title = s.title, description = s.description, destination = s.destination, category = s.category
  where e.series_id = s.id and e.starts_at > now();

  perform ensure_upcoming_events();
end;
$$;

grant execute on function ensure_upcoming_events(int) to anon, authenticated;
grant execute on function sync_series(uuid) to authenticated;

insert into ride_series (category, title, description, weekday, start_time, end_time, destination)
select * from (values
  ('church', 'First service',  '', 0, time '08:30', time '10:30', ''),
  ('church', 'Second service', '', 0, time '10:45', time '12:45', ''),
  ('cl',     'Friday CL',      '', 5, time '19:00', time '21:00', '')
) v(category, title, description, weekday, start_time, end_time, destination)
where not exists (select 1 from ride_series);

-- ============================================================================
-- Drive every week (added Oct 2026): a driver signs up once for a weekly ride
-- and is listed on every upcoming date. ensure_upcoming_events() (live
-- version in Supabase) also inserts these drivers' offers; skipped weeks are
-- remembered in commitment_skips.
-- ============================================================================

create table if not exists driver_commitments (
  id                     uuid primary key default gen_random_uuid(),
  driver_id              uuid not null references drivers (id) on delete cascade,
  series_id              uuid not null references ride_series (id) on delete cascade,
  seats                  int  not null check (seats between 1 and 12),
  depart_offset_minutes  int  not null default 30 check (depart_offset_minutes between 0 and 180),
  gc_join_link           text check (gc_join_link is null or gc_join_link ~* '^https://(www\.)?(m\.me|messenger\.com|facebook\.com/messages)/'),
  active                 boolean not null default true,
  created_at             timestamptz not null default now(),
  unique (driver_id, series_id)
);
alter table driver_commitments enable row level security;
drop policy if exists "driver manages own weekly drives" on driver_commitments;
drop policy if exists "admin reads weekly drives" on driver_commitments;
create policy "driver manages own weekly drives" on driver_commitments for all
  using (driver_id = auth.uid()) with check (driver_id = auth.uid());
create policy "admin reads weekly drives" on driver_commitments for select using (is_admin());

create table if not exists commitment_skips (
  commitment_id  uuid not null references driver_commitments (id) on delete cascade,
  event_id       uuid not null references events (id) on delete cascade,
  primary key (commitment_id, event_id)
);
alter table commitment_skips enable row level security;
drop policy if exists "driver manages own skips" on commitment_skips;
create policy "driver manages own skips" on commitment_skips for all
  using (exists (select 1 from driver_commitments c where c.id = commitment_id and c.driver_id = auth.uid()))
  with check (exists (select 1 from driver_commitments c where c.id = commitment_id and c.driver_id = auth.uid()));

alter table ride_offers add column if not exists commitment_id uuid references driver_commitments (id) on delete set null;

-- Add to the end of ensure_upcoming_events(), before "return v_added;":
--   insert into ride_offers (event_id, driver_id, seats, depart_time, gc_join_link, commitment_id)
--   select e.id, c.driver_id, c.seats, e.starts_at - make_interval(mins => c.depart_offset_minutes), c.gc_join_link, c.id
--   from driver_commitments c
--   join events e on e.series_id = c.series_id
--   where c.active and not e.cancelled and e.starts_at > now()
--     and not exists (select 1 from commitment_skips k where k.commitment_id = c.id and k.event_id = e.id)
--   on conflict (event_id, driver_id) do nothing;

-- ============================================================================
-- Safety fixes (Oct 2026)
--  * Drivers need admin approval before riders can see them (drivers.approved).
--  * Waiting riders are matched automatically when a seat opens (fill_waiting_riders + triggers).
--  * A car can't drop below the riders already in it (offer_seats_guard).
--  * One sign-up per phone per ride (ride_requests_event_phone_uidx).
--  * Sign-ups close 60 minutes before the start (request_ride).
-- The live versions of event_offers() and request_ride() also require d.approved.
-- ============================================================================

alter table drivers add column if not exists approved boolean not null default false;
create unique index if not exists ride_requests_event_phone_uidx on ride_requests (event_id, phone);

create or replace function trg_driver_approval_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    if tg_op = 'INSERT' then new.approved := false; else new.approved := old.approved; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists driver_approval_guard on drivers;
create trigger driver_approval_guard before insert or update on drivers
  for each row execute function trg_driver_approval_guard();
drop policy if exists "admin approves drivers" on drivers;
create policy "admin approves drivers" on drivers for update using (is_admin()) with check (is_admin());

create or replace function fill_waiting_riders(p_event_id uuid) returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  v_offer uuid;
  v_count int := 0;
begin
  if not exists (select 1 from events where id = p_event_id and not cancelled and starts_at > now()) then
    return 0;
  end if;
  for r in select id, pickup_id from ride_requests where event_id = p_event_id and assigned_offer_id is null order by created_at loop
    v_offer := null;
    select o.id into v_offer
    from ride_offers o
    join drivers d on d.id = o.driver_id and d.approved
    left join ride_requests q on q.assigned_offer_id = o.id
    where o.event_id = p_event_id
    group by o.id
    having count(q.id) < o.seats
    order by bool_or(q.pickup_id = r.pickup_id) desc nulls last, o.seats - count(q.id) desc, o.depart_time
    limit 1;
    exit when v_offer is null;
    update ride_requests set assigned_offer_id = v_offer where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke execute on function fill_waiting_riders(uuid) from public, anon, authenticated;

-- Triggers that call it: zz_fill_after_offer_change (ride_offers insert / seats update / delete)
-- and zz_fill_after_driver_approved (drivers.approved changes). See the live database for their bodies.
