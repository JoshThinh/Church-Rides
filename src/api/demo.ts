// DEMO MODE: a fake backend that keeps everything in this browser's
// localStorage. It lets you click through the whole site before Supabase is
// set up. Nothing here is shared between devices.

import { pickOffer } from '../lib/assign';
import { hasEnded } from '../lib/format';
import type {
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
  Session,
} from '../types';
import type { RidesApi } from './types';

export const DEMO_ADMIN = { username: 'admin', password: 'demo1234' };

interface StoredOffer extends NewOffer {
  id: string;
  driverId: string;
}

interface StoredRequest extends RideRequestInput {
  id: string;
  token: string;
  assignedOfferId: string | null;
  createdAt: string;
}

interface DemoDb {
  pickupSpots: PickupSpot[];
  events: RideEvent[];
  drivers: DriverProfile[];
  offers: StoredOffer[];
  requests: StoredRequest[];
  session: Session;
}

const DB_KEY = 'lbc-rides:demo-db';
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

  const church1 = next(0, 10, 0);
  const church2 = next(0, 10, 0, 1);
  const cl = next(5, 19, 0);
  const retreat = next(6, 9, 0, 2);

  const events: RideEvent[] = [
    { id: id(), category: 'church', title: 'Sunday service', description: 'Main service, lunch after.', startsAt: church1.toISOString(), endsAt: plusHours(church1, 3).toISOString(), destination: 'LBC church building' },
    { id: id(), category: 'church', title: 'Sunday service', description: 'Main service, lunch after.', startsAt: church2.toISOString(), endsAt: plusHours(church2, 3).toISOString(), destination: 'LBC church building' },
    { id: id(), category: 'cl', title: 'Friday CL', description: 'Small groups and worship.', startsAt: cl.toISOString(), endsAt: plusHours(cl, 2.5).toISOString(), destination: 'Fellowship hall' },
    { id: id(), category: 'event', title: 'Fall retreat', description: 'Day trip with the college group. Bring a jacket.', startsAt: retreat.toISOString(), endsAt: plusHours(retreat, 10).toISOString(), destination: 'Camp Cedar Ridge' },
  ];

  const drivers: DriverProfile[] = [
    { id: 'demo-driver-maria', name: 'Maria L.', phone: '6195550142', carDescription: 'Silver Honda CR-V', seats: 4 },
    { id: 'demo-driver-daniel', name: 'Daniel K.', phone: '8585550199', carDescription: 'Blue Toyota Sienna', seats: 6 },
  ];

  const offers: StoredOffer[] = [
    { id: id(), driverId: drivers[0].id, eventId: events[0].id, seats: 4, departTime: plusHours(church1, -0.5).toISOString(), gcJoinLink: 'https://m.me/j/demo-maria' },
    { id: id(), driverId: drivers[1].id, eventId: events[0].id, seats: 6, departTime: plusHours(church1, -0.6).toISOString(), gcJoinLink: null },
    { id: id(), driverId: drivers[1].id, eventId: events[2].id, seats: 6, departTime: plusHours(cl, -0.5).toISOString(), gcJoinLink: 'https://m.me/j/demo-daniel' },
  ];

  const requests: StoredRequest[] = [
    { id: id(), token: id(), eventId: events[0].id, riderName: 'Kevin T.', phone: '6195550111', messenger: 'kevin.t', pickupId: pickupSpots[0].id, notes: '', offerId: null, assignedOfferId: offers[0].id, createdAt: new Date().toISOString() },
    { id: id(), token: id(), eventId: events[0].id, riderName: 'Grace P.', phone: '6195550122', messenger: '', pickupId: pickupSpots[2].id, notes: 'Might be 5 min late', offerId: null, assignedOfferId: offers[1].id, createdAt: new Date().toISOString() },
  ];

  return { pickupSpots, events, drivers, offers, requests, session: null };
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

const byStart = (a: RideEvent, b: RideEvent) => a.startsAt.localeCompare(b.startsAt);

function publicOffers(db: DemoDb, eventId: string): PublicOffer[] {
  return db.offers
    .filter((o) => o.eventId === eventId)
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
    return load()
      .events.filter((e) => !hasEnded(e) && (!category || e.category === category))
      .sort(byStart);
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
      if (!event || new Date(event.startsAt) <= new Date()) throw new Error('Sign-ups for this ride are closed.');
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

  async signInDriver(email) {
    await wait();
    const session: Session = { role: 'driver', userId: `demo:${email.toLowerCase()}`, email };
    update((db) => {
      db.session = session;
    });
    emit(session);
    return { linkSent: false };
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

  async changePassword() {
    throw new Error('Password changes only work when the site is connected to Supabase.');
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
      const rest = db.drivers.filter((d) => d.id !== s.userId);
      db.drivers = [...rest, { ...p, id: s.userId }];
    });
  },

  async listMyOffers() {
    const db = load();
    const s = db.session;
    if (!s || s.role !== 'driver') return [];
    const result: DriverOffer[] = [];
    for (const o of db.offers.filter((x) => x.driverId === s.userId)) {
      const event = db.events.find((e) => e.id === o.eventId);
      if (!event || hasEnded(event)) continue;
      result.push({
        id: o.id,
        event,
        seats: o.seats,
        departTime: o.departTime,
        gcJoinLink: o.gcJoinLink,
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
      db.offers = db.offers.filter((o) => !(o.id === offerId && o.driverId === s.userId));
      // Riders in that car go back to "waiting for a driver".
      db.requests.forEach((r) => {
        if (r.assignedOfferId === offerId) r.assignedOfferId = null;
      });
    });
  },

  async listAllEvents() {
    return [...load().events].sort(byStart);
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
