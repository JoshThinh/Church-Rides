import { describe, expect, it } from 'vitest';
import type { PublicOffer } from '../types';
import { groupByStop, pickOffer } from './assign';

function offer(id: string, seats: number, pickupIds: string[], departTime = '2026-10-18T16:30:00.000Z'): PublicOffer {
  return {
    id,
    eventId: 'e1',
    driverName: id,
    carDescription: '',
    seats,
    seatsTaken: pickupIds.length,
    departTime,
    pickupIds,
  };
}

describe('pickOffer', () => {
  it('returns null when there are no cars', () => {
    expect(pickOffer([], 'zura')).toBeNull();
  });

  it('returns null when every car is full', () => {
    expect(pickOffer([offer('a', 2, ['x', 'y'])], 'zura')).toBeNull();
  });

  it('prefers a car already stopping at the same pickup spot', () => {
    const offers = [offer('roomy', 6, []), offer('sameStop', 4, ['zura'])];
    expect(pickOffer(offers, 'zura')).toBe('sameStop');
  });

  it('otherwise picks the car with the most open seats', () => {
    const offers = [offer('small', 3, ['x']), offer('big', 6, ['y'])];
    expect(pickOffer(offers, 'zura')).toBe('big');
  });

  it('breaks ties by earliest departure', () => {
    const offers = [offer('late', 4, [], '2026-10-18T17:00:00.000Z'), offer('early', 4, [], '2026-10-18T16:00:00.000Z')];
    expect(pickOffer(offers, 'zura')).toBe('early');
  });

  it('skips a full car even if it stops at your spot', () => {
    const offers = [offer('fullSameStop', 1, ['zura']), offer('open', 4, [])];
    expect(pickOffer(offers, 'zura')).toBe('open');
  });
});

describe('groupByStop', () => {
  it('groups riders by pickup spot in pickup-list order', () => {
    const riders = [
      { name: 'A', pickupId: 'eureka', pickupName: 'Eureka Loop' },
      { name: 'B', pickupId: 'zura', pickupName: 'Zura Loop' },
      { name: 'C', pickupId: 'eureka', pickupName: 'Eureka Loop' },
    ];
    const stops = groupByStop(riders, ['zura', 'eureka']);
    expect(stops.map((s) => s.pickupName)).toEqual(['Zura Loop', 'Eureka Loop']);
    expect(stops[1].riders.map((r) => r.name)).toEqual(['A', 'C']);
  });
});
