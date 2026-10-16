import type { PublicOffer } from '../types';

/**
 * Picks the best car for a rider who chose "any driver".
 *
 * Rules, in order:
 *  1. Only cars with an open seat.
 *  2. Prefer a car that is already stopping at the rider's pickup spot
 *     (fewer stops for the driver).
 *  3. Then the car with the most open seats (spreads riders out).
 *  4. Then the car that leaves earliest.
 *
 * Returns the offer id, or null when every car is full.
 * The same rules live in supabase/schema.sql (request_ride) so the demo
 * and the real database behave the same.
 */
export function pickOffer(offers: PublicOffer[], pickupId: string): string | null {
  const open = offers.filter((o) => o.seatsTaken < o.seats);
  if (open.length === 0) return null;

  const sorted = [...open].sort((a, b) => {
    const aStops = a.pickupIds.includes(pickupId) ? 1 : 0;
    const bStops = b.pickupIds.includes(pickupId) ? 1 : 0;
    if (aStops !== bStops) return bStops - aStops;

    const aFree = a.seats - a.seatsTaken;
    const bFree = b.seats - b.seatsTaken;
    if (aFree !== bFree) return bFree - aFree;

    return a.departTime.localeCompare(b.departTime);
  });

  return sorted[0].id;
}

/**
 * Orders a driver's riders into pickup stops: groups by pickup spot, in the
 * order the spots appear in the pickup list.
 */
export function groupByStop<T extends { pickupId: string; pickupName: string }>(
  riders: T[],
  spotOrder: string[],
): { pickupId: string; pickupName: string; riders: T[] }[] {
  const groups = new Map<string, { pickupId: string; pickupName: string; riders: T[] }>();
  for (const r of riders) {
    const g = groups.get(r.pickupId) ?? { pickupId: r.pickupId, pickupName: r.pickupName, riders: [] };
    g.riders.push(r);
    groups.set(r.pickupId, g);
  }
  const rank = (id: string) => {
    const i = spotOrder.indexOf(id);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };
  return [...groups.values()].sort((a, b) => rank(a.pickupId) - rank(b.pickupId));
}
