// Shared data shapes used across the app.
// Dates are ISO strings (e.g. "2026-10-18T16:30:00.000Z") so they work the
// same in the demo store, in Supabase, and in JSON.

export type Category = 'church' | 'cl' | 'event';

export interface PickupSpot {
  id: string;
  name: string;
  sortOrder: number;
}

export interface RideEvent {
  id: string;
  category: Category;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  destination: string;
}

/** What anyone can see about a driver's offer (no phone, no group chat link). */
export interface PublicOffer {
  id: string;
  eventId: string;
  driverName: string;
  carDescription: string;
  seats: number;
  seatsTaken: number;
  departTime: string;
  /** Pickup spot ids of riders already in this car (used by the matcher). */
  pickupIds: string[];
}

export interface RideRequestInput {
  eventId: string;
  riderName: string;
  phone: string;
  messenger: string;
  pickupId: string;
  notes: string;
  /** A specific driver's offer, or null for "any driver". */
  offerId: string | null;
}

export interface RequestResult {
  token: string;
  assignedOfferId: string | null;
}

/** A rider's own sign-up, looked up with the secret token saved on their device. */
export interface MyRide {
  token: string;
  event: RideEvent;
  pickupName: string;
  riderName: string;
  driver: {
    name: string;
    phone: string;
    carDescription: string;
    departTime: string;
  } | null;
  /** Only present while the event hasn't ended. */
  gcJoinLink: string | null;
}

export interface DriverProfile {
  id: string;
  name: string;
  phone: string;
  carDescription: string;
  seats: number;
}

export interface DriverRider {
  requestId: string;
  riderName: string;
  phone: string;
  messenger: string;
  pickupId: string;
  pickupName: string;
  notes: string;
}

export interface DriverOffer {
  id: string;
  event: RideEvent;
  seats: number;
  departTime: string;
  gcJoinLink: string | null;
  riders: DriverRider[];
}

export interface NewOffer {
  eventId: string;
  seats: number;
  departTime: string;
  gcJoinLink: string | null;
}

export interface EventInput {
  category: Category;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  destination: string;
}

export type Session =
  | { role: 'driver'; userId: string; email: string }
  | { role: 'admin'; userId: string; email: string }
  | null;

export const CATEGORY_LABELS: Record<Category, string> = {
  church: 'Church rides',
  cl: 'CL rides',
  event: 'Events',
};
