// The real backend: Supabase (Postgres + Auth).
// Table/column names are snake_case in the database and camelCase in the app;
// the small `to...` functions below translate between them.
// Security lives in the database (see supabase/schema.sql), not here.

import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import type { AdminDriver, DriverOffer, EventInput, PickupSpot, PublicOffer, RideEvent, RideSeries, SeriesInput, Session, WeeklyDrive } from '../types';
import { markNeedsNewPassword, markResetRequested } from '../lib/storage';
import type { RidesApi } from './types';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
const adminDomain = (import.meta.env.VITE_ADMIN_EMAIL_DOMAIN as string | undefined) || 'lbcrides.app';

// PKCE puts the sign-in code in ?code= instead of the #hash, so it doesn't
// clash with the site's #/page routing.
// Only created when keys exist, so demo mode never touches Supabase.
const supabase = (url && anonKey
  ? createClient(url, anonKey, { auth: { flowType: 'pkce' } })
  : null) as unknown as SupabaseClient;

// When a driver opens a password-reset email link, Supabase signs them in and
// fires PASSWORD_RECOVERY. We note it so the site asks for a new password.
supabase?.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') markNeedsNewPassword();
});

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;

const toEvent = (r: Row): RideEvent => ({
  id: r.id,
  category: r.category,
  title: r.title,
  description: r.description ?? '',
  startsAt: r.starts_at,
  endsAt: r.ends_at,
  destination: r.destination ?? '',
  seriesId: r.series_id ?? null,
});

const toSeries = (r: Row): RideSeries => ({
  id: r.id,
  category: r.category,
  title: r.title,
  description: r.description ?? '',
  weekday: r.weekday,
  startTime: String(r.start_time).slice(0, 5),
  endTime: String(r.end_time).slice(0, 5),
  destination: r.destination ?? '',
  active: r.active,
});

const fromSeries = (s: SeriesInput) => ({
  category: s.category,
  title: s.title,
  description: s.description,
  weekday: s.weekday,
  start_time: s.startTime,
  end_time: s.endTime,
  destination: s.destination,
  active: s.active,
});

/**
 * Asks the database to post the next few weeks of Church/CL dates.
 * Runs at most once an hour per open page; it's safe to run any number of times.
 */
let lastEnsured = 0;
async function ensureUpcoming(force = false): Promise<void> {
  if (!force && Date.now() - lastEnsured < 60 * 60 * 1000) return;
  lastEnsured = Date.now();
  await supabase.rpc('ensure_upcoming_events');
}

const fromEvent = (e: EventInput) => ({
  category: e.category,
  title: e.title,
  description: e.description,
  starts_at: e.startsAt,
  ends_at: e.endsAt,
  destination: e.destination,
});

const toSpot = (r: Row): PickupSpot => ({ id: r.id, name: r.name, sortOrder: r.sort_order });

function toSession(user: User | null | undefined): Session {
  if (!user) return null;
  const role = user.app_metadata?.role === 'admin' ? 'admin' : 'driver';
  return { role, userId: user.id, email: user.email ?? '' };
}

/** Turns Supabase's sign-in errors into plain language. */
function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('already registered')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('email not confirmed')) return 'This account isn\'t confirmed yet. Ask a ride coordinator to reset your password.';
  if (m.includes('password should be')) return 'Use a longer password (at least 8 characters).';
  if (m.includes('rate limit')) return 'Too many tries. Wait a few minutes and try again.';
  return message;
}

/** Throws a readable error if Supabase returned one. */
function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error('Please sign in first.');
  return data.user.id;
}

export const supabaseApi: RidesApi = {
  mode: 'supabase',

  async listPickupSpots() {
    const rows = check(await supabase.from('pickup_locations').select('*').eq('active', true).order('sort_order'));
    return (rows ?? []).map(toSpot);
  },

  async listUpcomingEvents(category) {
    await ensureUpcoming();
    let q = supabase.from('events').select('*').eq('cancelled', false).gt('starts_at', new Date().toISOString()).order('starts_at');
    if (category) q = q.eq('category', category);
    return (check(await q) ?? []).map(toEvent);
  },

  async getEvent(id) {
    const row = check(await supabase.from('events').select('*').eq('id', id).maybeSingle());
    return row ? toEvent(row) : null;
  },

  async listOffers(eventId) {
    const rows = check(await supabase.rpc('event_offers', { p_event_id: eventId })) as Row[] | null;
    return (rows ?? []).map(
      (r): PublicOffer => ({
        id: r.id,
        eventId: r.event_id,
        driverName: r.driver_name,
        carDescription: r.car_description ?? '',
        seats: r.seats,
        seatsTaken: r.seats_taken,
        departTime: r.depart_time,
        pickupIds: r.pickup_ids ?? [],
      }),
    );
  },

  async requestRide(input) {
    const res = check(
      await supabase.rpc('request_ride', {
        p_event_id: input.eventId,
        p_rider_name: input.riderName,
        p_phone: input.phone,
        p_messenger: input.messenger,
        p_pickup_id: input.pickupId,
        p_notes: input.notes,
        p_offer_id: input.offerId,
      }),
    ) as Row;
    return { token: res.token, assignedOfferId: res.assigned_offer_id };
  },

  async getMyRides(tokens) {
    if (tokens.length === 0) return [];
    const rows = (check(await supabase.rpc('my_rides', { p_tokens: tokens })) ?? []) as Row[];
    return rows.map((r) => ({
      token: r.token,
      event: toEvent(r.event),
      riderName: r.rider_name,
      pickupName: r.pickup_name ?? '',
      driver: r.driver
        ? { name: r.driver.name, phone: r.driver.phone, carDescription: r.driver.car_description, departTime: r.driver.depart_time }
        : null,
      gcJoinLink: r.gc_join_link ?? null,
    }));
  },

  async cancelRide(token) {
    check(await supabase.rpc('cancel_ride', { p_token: token }));
  },

  async getSession() {
    const { data } = await supabase.auth.getSession();
    return toSession(data.session?.user);
  },

  onSessionChange(cb) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(toSession(session?.user)));
    return () => data.subscription.unsubscribe();
  },

  async signInDriver(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw new Error(friendlyAuthError(error.message));
  },

  async signUpDriver(email, password) {
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
    if (error) throw new Error(friendlyAuthError(error.message));
    // Supabase returns a user that has no identities when the email is already taken.
    if (data.user && data.user.identities?.length === 0) {
      throw new Error('An account with this email already exists. Sign in instead.');
    }
    if (!data.session) {
      throw new Error('Your account was made, but email confirmation is still turned on in Supabase. Ask a ride coordinator to turn it off.');
    }
  },

  async requestPasswordReset(email) {
    markResetRequested();
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}${window.location.pathname}`,
    });
    if (error) {
      const m = error.message.toLowerCase();
      if (m.includes('rate limit')) throw new Error('Too many reset emails were sent recently. Try again in an hour, or ask a ride coordinator to reset your password.');
      if (m.includes('not authorized')) throw new Error("The site can't send emails yet. Ask a ride coordinator to reset your password from the admin page.");
      throw new Error(error.message);
    }
  },

  async signInAdmin(username, password) {
    const email = username.includes('@') ? username.trim() : `${username.trim().toLowerCase()}@${adminDomain}`;
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error('Wrong username or password.');
    if (data.user?.app_metadata?.role !== 'admin') {
      await supabase.auth.signOut();
      throw new Error('That account is not an admin.');
    }
  },

  async signOut() {
    await supabase.auth.signOut();
  },

  async changePassword(newPassword) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },

  async getDriverProfile() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return null;
    const row = check(await supabase.from('drivers').select('*').eq('id', auth.user.id).maybeSingle());
    return row
      ? { id: row.id, name: row.name, phone: row.phone, carDescription: row.car_description, seats: row.seats, approved: !!row.approved }
      : null;
  },

  async saveDriverProfile(p) {
    const id = await currentUserId();
    check(
      await supabase.from('drivers').upsert({ id, name: p.name, phone: p.phone, car_description: p.carDescription, seats: p.seats }),
    );
  },

  async listMyOffers() {
    const id = await currentUserId();
    await ensureUpcoming();
    const rows = (check(
      await supabase
        .from('ride_offers')
        .select(
          // The !constraint_name hints tell Supabase which link between tables to follow.
          'id, seats, depart_time, gc_join_link, commitment_id, event:events!ride_offers_event_id_fkey(*), riders:ride_requests!ride_requests_assigned_offer_id_fkey(id, rider_name, phone, messenger, notes, pickup_id, pickup:pickup_locations(name))',
        )
        .eq('driver_id', id),
    ) ?? []) as Row[];
    const now = new Date();
    return rows
      .map(
        (r): DriverOffer => ({
          id: r.id,
          event: toEvent(r.event),
          seats: r.seats,
          departTime: r.depart_time,
          gcJoinLink: r.gc_join_link,
          commitmentId: r.commitment_id ?? null,
          riders: (r.riders ?? []).map((x: Row) => ({
            requestId: x.id,
            riderName: x.rider_name,
            phone: x.phone,
            messenger: x.messenger ?? '',
            notes: x.notes ?? '',
            pickupId: x.pickup_id,
            pickupName: x.pickup?.name ?? '',
          })),
        }),
      )
      .filter((o, i) => new Date(o.event.endsAt) > now && !rows[i].event?.cancelled)
      .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  },

  async createOffer(o) {
    const id = await currentUserId();
    const res = await supabase.from('ride_offers').insert({
      driver_id: id,
      event_id: o.eventId,
      seats: o.seats,
      depart_time: o.departTime,
      gc_join_link: o.gcJoinLink,
    });
    if (res.error?.code === '23505') throw new Error('You are already driving for this ride.');
    check(res);
  },

  async updateOfferLink(offerId, link) {
    check(await supabase.from('ride_offers').update({ gc_join_link: link }).eq('id', offerId));
  },

  async deleteOffer(offerId) {
    const offer = check(await supabase.from('ride_offers').select('event_id, commitment_id').eq('id', offerId).maybeSingle()) as Row | null;
    if (offer?.commitment_id) {
      // Remember the skip so the weekly drive doesn't add this date back.
      check(
        await supabase
          .from('commitment_skips')
          .upsert({ commitment_id: offer.commitment_id, event_id: offer.event_id }, { onConflict: 'commitment_id,event_id', ignoreDuplicates: true }),
      );
    }
    check(await supabase.from('ride_offers').delete().eq('id', offerId));
  },

  async listMyWeeklyDrives() {
    const id = await currentUserId();
    const rows = (check(await supabase.from('driver_commitments').select('*').eq('driver_id', id)) ?? []) as Row[];
    return rows.map(
      (r): WeeklyDrive => ({
        id: r.id,
        seriesId: r.series_id,
        seats: r.seats,
        departOffsetMinutes: r.depart_offset_minutes,
        gcJoinLink: r.gc_join_link,
        active: r.active,
      }),
    );
  },

  async saveWeeklyDrive(input) {
    const driverId = await currentUserId();
    const row = check(
      await supabase
        .from('driver_commitments')
        .upsert(
          {
            driver_id: driverId,
            series_id: input.seriesId,
            seats: input.seats,
            depart_offset_minutes: input.departOffsetMinutes,
            gc_join_link: input.gcJoinLink,
            active: true,
          },
          { onConflict: 'driver_id,series_id' },
        )
        .select('id')
        .single(),
    ) as Row;

    // Update dates already posted for this weekly drive (seats, leave time, group chat link).
    const offers = (check(
      await supabase
        .from('ride_offers')
        .select('id, event:events!ride_offers_event_id_fkey(starts_at), riders:ride_requests!ride_requests_assigned_offer_id_fkey(id)')
        .eq('commitment_id', row.id),
    ) ?? []) as Row[];
    for (const o of offers) {
      const start = new Date(o.event.starts_at);
      if (start <= new Date()) continue;
      check(
        await supabase
          .from('ride_offers')
          .update({
            // Never drop below the riders already in that car.
            seats: Math.max(input.seats, (o.riders ?? []).length),
            gc_join_link: input.gcJoinLink,
            depart_time: new Date(start.getTime() - input.departOffsetMinutes * 60_000).toISOString(),
          })
          .eq('id', o.id),
      );
    }
    await ensureUpcoming(true);
  },

  async stopWeeklyDrive(commitmentId) {
    check(await supabase.from('driver_commitments').update({ active: false }).eq('id', commitmentId));
    // Remove upcoming dates nobody has signed up for; keep the ones with riders.
    const offers = (check(
      await supabase
        .from('ride_offers')
        .select('id, event:events!ride_offers_event_id_fkey(starts_at), riders:ride_requests!ride_requests_assigned_offer_id_fkey(id)')
        .eq('commitment_id', commitmentId),
    ) ?? []) as Row[];
    let kept = 0;
    for (const o of offers) {
      if (new Date(o.event.starts_at) <= new Date()) continue;
      if ((o.riders ?? []).length > 0) {
        kept++;
        continue;
      }
      check(await supabase.from('ride_offers').delete().eq('id', o.id));
    }
    return kept;
  },

  async listAllEvents() {
    await ensureUpcoming();
    return (check(await supabase.from('events').select('*').eq('cancelled', false).order('starts_at')) ?? []).map(toEvent);
  },

  async listSeries() {
    return (check(await supabase.from('ride_series').select('*').order('weekday').order('start_time')) ?? []).map(toSeries);
  },

  async saveSeries(input, id) {
    let seriesId = id;
    if (id) {
      check(await supabase.from('ride_series').update(fromSeries(input)).eq('id', id));
    } else {
      const row = check(await supabase.from('ride_series').insert(fromSeries(input)).select('id').single()) as Row;
      seriesId = row.id;
    }
    check(await supabase.rpc('sync_series', { p_series_id: seriesId }));
    lastEnsured = Date.now();
  },

  async createEvent(e) {
    check(await supabase.from('events').insert(fromEvent(e)));
  },

  async updateEvent(id, e) {
    check(await supabase.from('events').update(fromEvent(e)).eq('id', id));
  },

  async deleteEvent(id) {
    check(await supabase.from('events').delete().eq('id', id));
  },

  async adminListDrivers() {
    const rows = (check(await supabase.rpc('admin_list_drivers')) ?? []) as Row[];
    return rows.map(
      (r): AdminDriver => ({
        id: r.id,
        name: r.name,
        email: r.email ?? '',
        phone: r.phone,
        carDescription: r.car_description,
        seats: r.seats,
        approved: r.approved,
        createdAt: r.created_at,
      }),
    );
  },

  async setDriverApproved(driverId, approved) {
    check(await supabase.from('drivers').update({ approved }).eq('id', driverId));
  },

  async resetDriverPassword(email, newPassword) {
    check(await supabase.rpc('admin_set_driver_password', { p_email: email, p_password: newPassword }));
  },

  async addPickupSpot(name) {
    const rows = check(await supabase.from('pickup_locations').select('sort_order').order('sort_order', { ascending: false }).limit(1)) ?? [];
    const next = rows.length ? (rows[0] as Row).sort_order + 1 : 0;
    check(await supabase.from('pickup_locations').insert({ name: name.trim(), sort_order: next }));
  },

  async renamePickupSpot(id, name) {
    check(await supabase.from('pickup_locations').update({ name: name.trim() }).eq('id', id));
  },

  async removePickupSpot(id) {
    // Soft delete: hides it from the dropdown but keeps old sign-ups intact.
    check(await supabase.from('pickup_locations').update({ active: false }).eq('id', id));
  },
};
