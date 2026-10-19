import type {
  Category,
  DriverOffer,
  DriverProfile,
  EventInput,
  RideSeries,
  SeriesInput,
  MyRide,
  NewOffer,
  PickupSpot,
  PublicOffer,
  RequestResult,
  RideEvent,
  RideRequestInput,
  Session,
} from '../types';

/**
 * Everything the UI can ask the backend to do.
 * Two implementations: `demo.ts` (browser-only, for trying the site) and
 * `supabase.ts` (the real shared database).
 */
export interface RidesApi {
  mode: 'demo' | 'supabase';

  // Public (riders)
  listPickupSpots(): Promise<PickupSpot[]>;
  listUpcomingEvents(category?: Category): Promise<RideEvent[]>;
  getEvent(id: string): Promise<RideEvent | null>;
  listOffers(eventId: string): Promise<PublicOffer[]>;
  requestRide(input: RideRequestInput): Promise<RequestResult>;
  getMyRides(tokens: string[]): Promise<MyRide[]>;
  cancelRide(token: string): Promise<void>;

  // Sign-in
  getSession(): Promise<Session>;
  onSessionChange(cb: (s: Session) => void): () => void;
  /** Drivers sign in with an email link (demo mode signs in instantly). */
  signInDriver(email: string): Promise<{ linkSent: boolean }>;
  signInAdmin(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Changes the password of whoever is signed in (used for the shared admin login). */
  changePassword(newPassword: string): Promise<void>;

  // Drivers
  getDriverProfile(): Promise<DriverProfile | null>;
  saveDriverProfile(p: Omit<DriverProfile, 'id'>): Promise<void>;
  listMyOffers(): Promise<DriverOffer[]>;
  createOffer(o: NewOffer): Promise<void>;
  updateOfferLink(offerId: string, link: string | null): Promise<void>;
  deleteOffer(offerId: string): Promise<void>;

  // Admin
  listAllEvents(): Promise<RideEvent[]>;
  createEvent(e: EventInput): Promise<void>;
  updateEvent(id: string, e: EventInput): Promise<void>;
  deleteEvent(id: string): Promise<void>;
  /** Weekly rides (Church, CL). Saving one updates its upcoming dates. */
  listSeries(): Promise<RideSeries[]>;
  saveSeries(input: SeriesInput, id?: string): Promise<void>;
  addPickupSpot(name: string): Promise<void>;
  renamePickupSpot(id: string, name: string): Promise<void>;
  removePickupSpot(id: string): Promise<void>;
}
