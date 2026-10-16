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
  if v_event.id is null or v_event.starts_at <= now() then
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
