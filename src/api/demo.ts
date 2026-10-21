// DEMO MODE: a fake backend that keeps everything in this browser's
// localStorage. It lets you click through the whole site before Supabase is
// set up. Nothing here is shared between devices.

import { pickOffer } from '../lib/assign';
import { hasEnded } from '../lib/format';
import type {
  AdminDriver,
  Category,
  DriverOffer,
  DriverProfile,
  EventInput,
  MyRide,
  NewOffer,
  PickupSpot,
  PublicOffer,
  RideEvent,
  RideRequestInput,
  RideSeries,
  Session,
  WeeklyDrive,
} from '../types';
import { signupsClosed } from '../types';
import type { RidesApi } from './types';

export const DEMO_ADMIN = { username: 'admin', password: 'demo1234' };

interface StoredOffer extends NewOffer {
  id: string;
  driverId: string;
  commitmentId?: string | null;
}

interface StoredCommitment extends WeeklyDrive {
  driverId: string;
}

interface StoredRequest extends RideRequestInput {
  id: string;
  token: string;
  assignedOfferId: string | null;
  createdAt: string;
}

type DemoEvent = RideEvent & { cancelled?: boolean };

interface DemoDb {
  pickupSpots: PickupSpot[];
  series: RideSeries[];
  events: DemoEvent[];
  drivers: DriverProfile[];
  offers: StoredOffer[];
  requests: StoredRequest[];
  session: Session;
  commitments?: StoredCommitment[];
  skips?: { commitmentId: string; eventId: string }[];
  /** Demo only: driver passwords in plain text. The real site never stores passwords like this. */
  passwords?: Record<string, string>;
}

const DB_KEY = 'lbc-rides:demo-db-v2';
const id = () => crypto.randomUUID();

/** Next given weekday (0 = Sunday) at hour:minute local time. */
function next(weekday: number, hour: number, minute = 0, weeksAhead = 0): Date {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  let add = (weekday - d.getDay() + 7) % 7;
  if (add === 0 && d < new Date()) add = 7;
  d.setDate(d.getDate() + add + weeksAhead * 7);
  return d;
}

const plusHours = (d: Date, h: number) => new Date(d.getTime() + h * 3_600_000);
const byStart = (a: RideEvent, b: RideEvent) => a.startsAt.localeCompare(b.startsAt);

/** A Date on the same day as `day`, at "HH:MM" local time. */
function atTime(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Same job as ensure_upcoming_events() in the database: post the next 3 weeks of weekly rides. */
function ensureUpcomingDemo(
  db: { series: RideSeries[]; events: DemoEvent[]; offers?: StoredOffer[]; commitments?: StoredCommitment[]; skips?: { commitmentId: string; eventId: string }[] },
  weeks = 3,
): void {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const s of db.series.filter((x) => x.active)) {
    for (let i = 0; i <= weeks * 7; i++) {
      const day = new Date(today);
      day.setDate(today.getDate() + i);
      if (day.getDay() !== s.weekday) continue;
      const start = atTime(day, s.startTime);
      if (start <= new Date()) continue;
      let end = atTime(day, s.endTime);
      if (end <= start) end = new Date(end.getTime() + 86_400_000);
      const startsAt = start.toISOString();
      const fields = { category: s.category, title: s.title, description: s.description, endsAt: end.toISOString(), destination: s.destination };
      const existing = db.events.find((e) => e.seriesId === s.id && e.startsAt === startsAt);
      if (existing) Object.assign(existing, fields, { cancelled: false });
      else db.events.push({ id: id(), startsAt, seriesId: s.id, ...fields });
    }
  }

  // Weekly drivers: list them on every upcoming date they haven't skipped.
  if (!db.offers) return;
  for (const c of (db.commitments ?? []).filter((x) => x.active)) {
    for (const e of db.events) {
      if (e.seriesId !== c.seriesId || e.cancelled || new Date(e.startsAt) <= new Date()) continue;
      if (db.skips?.some((k) => k.commitmentId === c.id && k.eventId === e.id)) continue;
      if (db.offers.some((o) => o.eventId === e.id && o.driverId === c.driverId)) continue;
      db.offers.push({
        id: id(),
        eventId: e.id,
        driverId: c.driverId,
        seats: c.seats,
        departTime: new Date(new Date(e.startsAt).getTime() - c.departOffsetMinutes * 60_000).toISOString(),
        gcJoinLink: c.gcJoinLink,
        commitmentId: c.id,
      });
    }
  }
}

function seed(): DemoDb {
  const pickupSpots: PickupSpot[] = [
    'Zura Loop',
    'Eureka Loop',
    'Chapultepec Hall',
    'Cuicacalli Suites',
    'Villa Alvarado',
    'Aztec Corner',
    'South Campus Plaza',
    'Other / off-campus',
  ].map((name, i) => ({ id: id(), name, sortOrder: i }));

  const series: RideSeries[] = [
    { id: id(), category: 'church', title: 'First service', description: '', weekday: 0, startTime: '08:30', endTime: '10:30', destination: '', active: true },
    { id: id(), category: 'church', title: 'Second service', description: '', weekday: 0, startTime: '10:45', endTime: '12:45', destination: '', active: true },
    { id: id(), category: 'cl', title: 'Friday CL', description: '', weekday: 5, startTime: '19:00', endTime: '21:00', destination: '', active: true },
  ];
  const retreat = next(6, 9, 0, 2);
  const events: DemoEvent[] = [
    { id: id(), category: 'event', title: 'Fall retreat', description: 'Day trip with the college group. Bring a jacket.', startsAt: retreat.toISOString(), endsAt: plusHours(retreat, 10).toISOString(), destination: 'Camp Cedar Ridge' },
  ];
  ensureUpcomingDemo({ series, events });
  events.sort(byStart);
  const firstService = events.find((e) => e.seriesId === series[0].id)!;
  const cl = events.find((e) => e.seriesId === series[2].id)!;
  const church1 = new Date(firstService.startsAt);
  const clStart = new Date(cl.startsAt);

  const drivers: DriverProfile[] = [
    { id: 'demo-driver-maria', name: 'Maria L.', phone: '6195550142', carDescription: 'Silver Honda CR-V', seats: 4, approved: true },
    { id: 'demo-driver-daniel', name: 'Daniel K.', phone: '8585550199', carDescription: 'Blue Toyota Sienna', seats: 6, approved: true },
  ];

  const offers: StoredOffer[] = [
    { id: id(), driverId: drivers[0].id, eventId: firstService.id, seats: 4, departTime: plusHours(church1, -0.5).toISOString(), gcJoinLink: 'https://m.me/j/demo-maria' },
    { id: id(), driverId: drivers[1].id, eventId: firstService.id, seats: 6, departTime: plusHours(church1, -0.6).toISOString(), gcJoinLink: null },
    { id: id(), driverId: drivers[1].id, eventId: cl.id, seats: 6, departTime: plusHours(clStart, -0.5).toISOString(), gcJoinLink: 'https://m.me/j/demo-daniel' },
  ];

  const requests: StoredRequest[] = [
    { id: id(), token: id(), eventId: firstService.id, riderName: 'Kevin T.', phone: '6195550111', messenger: 'kevin.t', pickupId: pickupSpots[0].id, notes: '', offerId: null, assignedOfferId: offers[0].id, createdAt: new Date().toISOString() },
    { id: id(), token: id(), eventId: firstService.id, riderName: 'Grace P.', phone: '6195550122', messenger: '', pickupId: pickupSpots[2].id, notes: 'Might be 5 min late', offerId: null, assignedOfferId: offers[1].id, createdAt: new Date().toISOString() },
  ];

  return { pickupSpots, series, events, drivers, offers, requests, session: null };
}

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw) as DemoDb;
  } catch {
    /* fall through to a fresh seed */
  }
  const db = seed();
  save(db);
  return db;
}

function save(db: DemoDb): void {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* ignore */
  }
}

/** Small helper: load, change, save. */
function update<T>(fn: (db: DemoDb) => T): T {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

const listeners = new Set<(s: Session) => void>();
const emit = (s: Session) => listeners.forEach((cb) => cb(s));


function publicOffers(db: DemoDb, eventId: string): PublicOffer[] {
  return db.offers
    .filter((o) => o.eventId === eventId && db.drivers.find((d) => d.id === o.driverId)?.approved)
    .map((o) => {
      const driver = db.drivers.find((d) => d.id === o.driverId);
      const riders = db.requests.filter((r) => r.assignedOfferId === o.id);
      return {
        id: o.id,
        eventId: o.eventId,
        driverName: driver?.name ?? 'Driver',
        carDescription: driver?.carDescription ?? '',
        seats: o.seats,
        seatsTaken: riders.length,
        departTime: o.departTime,
        pickupIds: riders.map((r) => r.pickupId),
      };
    })
    .sort((a, b) => a.departTime.localeCompare(b.departTime));
}

/** Same job as fill_waiting_riders() in the database: give waiting riders a seat. */
function fillWaiting(db: DemoDb): void {
  for (const e of db.events) {
    if (e.cancelled || new Date(e.startsAt) <= new Date()) continue;
    for (const r of db.requests.filter((x) => x.eventId === e.id && !x.assignedOfferId)) {
      const offerId = pickOffer(publicOffers(db, e.id), r.pickupId);
      if (!offerId) break;
      r.assignedOfferId = offerId;
    }
  }
}

function requireRole(db: DemoDb, role: 'driver' | 'admin') {
  if (!db.session || db.session.role !== role) throw new Error(role === 'admin' ? 'Sign in as admin first.' : 'Sign in as a driver first.');
  return db.session;
}

const wait = () => new Promise((r) => setTimeout(r, 120));

export const demoApi: RidesApi = {
  mode: 'demo',

  async listPickupSpots() {
    return [...load().pickupSpots].sort((a, b) => a.sortOrder - b.sortOrder);
  },

  async listUpcomingEvents(category?: Category) {
    return update((db) => {
      ensureUpcomingDemo(db);
      return db.events
        .filter((e) => !e.cancelled && new Date(e.startsAt) > new Date() && (!category || e.category === category))
        .sort(byStart);
    });
  },

  async getEvent(eventId) {
    return load().events.find((e) => e.id === eventId) ?? null;
  },

  async listOffers(eventId) {
    return publicOffers(load(), eventId);
  },

  async requestRide(input) {
    await wait();
    return update((db) => {
      const event = db.events.find((e) => e.id === input.eventId);
      if (!event || event.cancelled || signupsClosed(event)) throw new Error('Sign-ups for this ride are closed. They close 1 hour before it starts.');
      if (db.requests.some((r) => r.eventId === input.eventId && r.phone === input.phone)) {
        throw new Error('This phone number is already signed up for this ride. Check My rides.');
      }
      if (!db.pickupSpots.some((p) => p.id === input.pickupId)) throw new Error('Choose a pickup spot.');

      const offers = publicOffers(db, input.eventId);
      let assigned: string | null;
      if (input.offerId) {
        const chosen = offers.find((o) => o.id === input.offerId);
        if (!chosen) throw new Error('That driver is no longer available.');
        if (chosen.seatsTaken >= chosen.seats) throw new Error(`${chosen.driverName}'s car just filled up. Pick another driver or "Any driver".`);
        assigned = chosen.id;
      } else {
        assigned = pickOffer(offers, input.pickupId);
      }

      const token = id();
      db.requests.push({ ...input, id: id(), token, assignedOfferId: assigned, createdAt: new Date().toISOString() });
      return { token, assignedOfferId: assigned };
    });
  },

  async getMyRides(tokens) {
    const db = load();
    const rides: MyRide[] = [];
    for (const token of tokens) {
      const req = db.requests.find((r) => r.token === token);
      const event = req && db.events.find((e) => e.id === req.eventId);
      if (!req || !event) continue;
      const offer = db.offers.find((o) => o.id === req.assignedOfferId);
      const driver = offer && db.drivers.find((d) => d.id === offer.driverId);
      rides.push({
        token,
        event,
        riderName: req.riderName,
        pickupName: db.pickupSpots.find((p) => p.id === req.pickupId)?.name ?? '',
        driver: offer && driver ? { name: driver.name, phone: driver.phone, carDescription: driver.carDescription, departTime: offer.departTime } : null,
        gcJoinLink: offer && !hasEnded(event) ? offer.gcJoinLink : null,
      });
    }
    return rides.sort((a, b) => byStart(a.event, b.event));
  },

  async cancelRide(token) {
    update((db) => {
      db.requests = db.requests.filter((r) => r.token !== token);
    });
  },

  async getSession() {
    return load().session;
  },

  onSessionChange(cb) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },

  async signInDriver(email, password) {
    await wait();
    const key = email.trim().toLowerCase();
    const db = load();
    if (db.passwords?.[key] !== password) throw new Error('Wrong email or password.');
    const session: Session = { role: 'driver', userId: `demo:${key}`, email: key };
    update((d) => {
      d.session = session;
    });
    emit(session);
  },

  async signUpDriver(email, password) {
    await wait();
    const key = email.trim().toLowerCase();
    const session: Session = { role: 'driver', userId: `demo:${key}`, email: key };
    update((d) => {
      d.passwords = d.passwords ?? {};
      if (d.passwords[key]) throw new Error('An account with this email already exists. Sign in instead.');
      d.passwords[key] = password;
      d.session = session;
    });
    emit(session);
  },

  async requestPasswordReset() {
    // Demo mode can't send email; pretend it worked so the screen can be tried out.
    await wait();
  },

  async signInAdmin(username, password) {
    await wait();
    if (username.trim().toLowerCase() !== DEMO_ADMIN.username || password !== DEMO_ADMIN.password) {
      throw new Error('Wrong username or password.');
    }
    const session: Session = { role: 'admin', userId: 'demo-admin', email: 'admin' };
    update((db) => {
      db.session = session;
    });
    emit(session);
  },

  async signOut() {
    update((db) => {
      db.session = null;
    });
    emit(null);
  },

  async changePassword(newPassword) {
    update((db) => {
      const s = db.session;
      if (!s || s.role !== 'driver') throw new Error('The admin password can only be changed when the site is connected to Supabase.');
      db.passwords = { ...(db.passwords ?? {}), [s.email]: newPassword };
    });
  },

  async getDriverProfile() {
    const db = load();
    const s = db.session;
    if (!s || s.role !== 'driver') return null;
    return db.drivers.find((d) => d.id === s.userId) ?? null;
  },

  async saveDriverProfile(p) {
    update((db) => {
      const s = requireRole(db, 'driver');
      const existing = db.drivers.find((d) => d.id === s.userId);
      const rest = db.drivers.filter((d) => d.id !== s.userId);
      db.drivers = [...rest, { ...p, id: s.userId, approved: existing?.approved ?? false }];
    });
  },

  async listMyOffers() {
    const db = update((d) => {
      ensureUpcomingDemo(d);
      return d;
    });
    const s = db.session;
    if (!s || s.role !== 'driver') return [];
    const result: DriverOffer[] = [];
    for (const o of db.offers.filter((x) => x.driverId === s.userId)) {
      const event = db.events.find((e) => e.id === o.eventId);
      if (!event || hasEnded(event) || event.cancelled) continue;
      result.push({
        id: o.id,
        event,
        seats: o.seats,
        departTime: o.departTime,
        gcJoinLink: o.gcJoinLink,
        commitmentId: o.commitmentId ?? null,
        riders: db.requests
          .filter((r) => r.assignedOfferId === o.id)
          .map((r) => ({
            requestId: r.id,
            riderName: r.riderName,
            phone: r.phone,
            messenger: r.messenger,
            notes: r.notes,
            pickupId: r.pickupId,
            pickupName: db.pickupSpots.find((p) => p.id === r.pickupId)?.name ?? '',
          })),
      });
    }
    return result.sort((a, b) => byStart(a.event, b.event));
  },

  async createOffer(o) {
    await wait();
    update((db) => {
      const s = requireRole(db, 'driver');
      if (db.offers.some((x) => x.driverId === s.userId && x.eventId === o.eventId)) {
        throw new Error('You are already driving for this ride.');
      }
      db.offers.push({ ...o, id: id(), driverId: s.userId });
      fillWaiting(db);
    });
  },

  async updateOfferLink(offerId, link) {
    update((db) => {
      const s = requireRole(db, 'driver');
      const offer = db.offers.find((o) => o.id === offerId && o.driverId === s.userId);
      if (offer) offer.gcJoinLink = link;
    });
  },

  async deleteOffer(offerId) {
    update((db) => {
      const s = requireRole(db, 'driver');
      const offer = db.offers.find((o) => o.id === offerId && o.driverId === s.userId);
      if (offer?.commitmentId) db.skips = [...(db.skips ?? []), { commitmentId: offer.commitmentId, eventId: offer.eventId }];
      db.offers = db.offers.filter((o) => !(o.id === offerId && o.driverId === s.userId));
      // Riders in that car go back to "waiting for a driver".
      db.requests.forEach((r) => {
        if (r.assignedOfferId === offerId) r.assignedOfferId = null;
      });
      fillWaiting(db);
    });
  },

  async listMyWeeklyDrives() {
    const db = load();
    const s = db.session;
    if (!s || s.role !== 'driver') return [];
    return (db.commitments ?? []).filter((c) => c.driverId === s.userId);
  },

  async saveWeeklyDrive(input) {
    await wait();
    update((db) => {
      const s = requireRole(db, 'driver');
      db.commitments = db.commitments ?? [];
      let c = db.commitments.find((x) => x.driverId === s.userId && x.seriesId === input.seriesId);
      if (c) Object.assign(c, input, { active: true });
      else {
        c = { ...input, id: id(), driverId: s.userId, active: true };
        db.commitments.push(c);
      }
      const commitmentId = c.id;
      // Update dates already posted for this weekly drive.
      for (const o of db.offers.filter((x) => x.commitmentId === commitmentId)) {
        const e = db.events.find((x) => x.id === o.eventId);
        if (!e || new Date(e.startsAt) <= new Date()) continue;
        o.seats = Math.max(input.seats, db.requests.filter((r) => r.assignedOfferId === o.id).length);
        o.gcJoinLink = input.gcJoinLink;
        o.departTime = new Date(new Date(e.startsAt).getTime() - input.departOffsetMinutes * 60_000).toISOString();
      }
      ensureUpcomingDemo(db);
      fillWaiting(db);
    });
  },

  async stopWeeklyDrive(commitmentId) {
    return update((db) => {
      const s = requireRole(db, 'driver');
      const c = (db.commitments ?? []).find((x) => x.id === commitmentId && x.driverId === s.userId);
      if (!c) return 0;
      c.active = false;
      let kept = 0;
      db.offers = db.offers.filter((o) => {
        if (o.commitmentId !== commitmentId) return true;
        const e = db.events.find((x) => x.id === o.eventId);
        if (!e || new Date(e.startsAt) <= new Date()) return true;
        if (db.requests.some((r) => r.assignedOfferId === o.id)) {
          kept++;
          return true;
        }
        return false;
      });
      return kept;
    });
  },

  async listAllEvents() {
    return update((db) => {
      ensureUpcomingDemo(db);
      return db.events.filter((e) => !e.cancelled).sort(byStart);
    });
  },

  async listSeries() {
    return [...load().series].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
  },

  async saveSeries(input, seriesId) {
    await wait();
    update((db) => {
      requireRole(db, 'admin');
      const sid = seriesId ?? id();
      db.series = seriesId ? db.series.map((x) => (x.id === seriesId ? { ...input, id: sid } : x)) : [...db.series, { ...input, id: sid }];
      const now = new Date();
      for (const e of db.events) {
        if (e.seriesId !== sid || new Date(e.startsAt) <= now) continue;
        const used = db.requests.some((r) => r.eventId === e.id) || db.offers.some((o) => o.eventId === e.id && !o.commitmentId);
        if (!used) e.cancelled = true;
        Object.assign(e, { title: input.title, description: input.description, destination: input.destination, category: input.category });
      }
      ensureUpcomingDemo(db);
    });
  },

  async createEvent(e) {
    await wait();
    update((db) => {
      requireRole(db, 'admin');
      db.events.push({ ...e, id: id() });
    });
  },

  async updateEvent(eventId, e: EventInput) {
    await wait();
    update((db) => {
      requireRole(db, 'admin');
      db.events = db.events.map((x) => (x.id === eventId ? { ...e, id: eventId } : x));
    });
  },

  async deleteEvent(eventId) {
    update((db) => {
      requireRole(db, 'admin');
      db.events = db.events.filter((x) => x.id !== eventId);
      const gone = new Set(db.offers.filter((o) => o.eventId === eventId).map((o) => o.id));
      db.offers = db.offers.filter((o) => !gone.has(o.id));
      db.requests = db.requests.filter((r) => r.eventId !== eventId);
    });
  },

  async adminListDrivers() {
    const db = load();
    if (db.session?.role !== 'admin') throw new Error('Sign in as admin first.');
    return db.drivers
      .map(
        (d): AdminDriver => ({
          id: d.id,
          name: d.name,
          email: d.id.startsWith('demo:') ? d.id.slice(5) : `${d.name.split(' ')[0].toLowerCase()}@example.com`,
          phone: d.phone,
          carDescription: d.carDescription,
          seats: d.seats,
          approved: d.approved,
          createdAt: new Date().toISOString(),
        }),
      )
      .sort((a, b) => Number(a.approved) - Number(b.approved));
  },

  async setDriverApproved(driverId, approved) {
    update((db) => {
      requireRole(db, 'admin');
      const d = db.drivers.find((x) => x.id === driverId);
      if (!d) return;
      d.approved = approved;
      if (!approved) {
        // Their riders on upcoming dates go back to waiting and get re-matched.
        const theirOffers = new Set(db.offers.filter((o) => o.driverId === driverId).map((o) => o.id));
        db.requests.forEach((r) => {
          if (r.assignedOfferId && theirOffers.has(r.assignedOfferId)) r.assignedOfferId = null;
        });
      }
      fillWaiting(db);
    });
  },

  async resetDriverPassword(email, newPassword) {
    update((db) => {
      requireRole(db, 'admin');
      const key = email.trim().toLowerCase();
      if (!db.passwords?.[key]) throw new Error('No account uses that email.');
      db.passwords[key] = newPassword;
    });
  },

  async addPickupSpot(name) {
    update((db) => {
      requireRole(db, 'admin');
      const max = Math.max(-1, ...db.pickupSpots.map((p) => p.sortOrder));
      db.pickupSpots.push({ id: id(), name: name.trim(), sortOrder: max + 1 });
    });
  },

  async renamePickupSpot(spotId, name) {
    update((db) => {
      requireRole(db, 'admin');
      const spot = db.pickupSpots.find((p) => p.id === spotId);
      if (spot) spot.name = name.trim();
    });
  },

  async removePickupSpot(spotId) {
    update((db) => {
      requireRole(db, 'admin');
      if (db.requests.some((r) => r.pickupId === spotId)) {
        throw new Error('Riders are signed up at this spot. Rename it instead of removing it.');
      }
      db.pickupSpots = db.pickupSpots.filter((p) => p.id !== spotId);
    });
  },
};

/** Wipes the demo data back to the starting example. */
export function resetDemo(): void {
  try {
    localStorage.removeItem(DB_KEY);
  } catch {
    /* ignore */
  }
}
