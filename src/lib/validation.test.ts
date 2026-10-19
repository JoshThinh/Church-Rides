import { describe, expect, it } from 'vitest';
import { eventSchema, formatPhone, isMessengerLink, normalizePhone, offerSchema, riderSchema } from './validation';

describe('phone numbers', () => {
  it('keeps only digits and drops a leading 1', () => {
    expect(normalizePhone('(619) 555-0142')).toBe('6195550142');
    expect(normalizePhone('+1 619 555 0142')).toBe('6195550142');
  });

  it('formats 10 digits nicely', () => {
    expect(formatPhone('6195550142')).toBe('(619) 555-0142');
  });
});

describe('riderSchema', () => {
  const good = { riderName: 'Jo', phone: '619-555-0142', messenger: '', pickupId: 'zura', notes: '' };

  it('accepts a normal sign-up and cleans the phone number', () => {
    const r = riderSchema.safeParse(good);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.phone).toBe('6195550142');
  });

  it('rejects a short phone number', () => {
    expect(riderSchema.safeParse({ ...good, phone: '555-0142' }).success).toBe(false);
  });

  it('requires a pickup spot', () => {
    expect(riderSchema.safeParse({ ...good, pickupId: '' }).success).toBe(false);
  });
});

describe('Messenger group links', () => {
  it('accepts m.me join links', () => {
    expect(isMessengerLink('https://m.me/j/AbCdEf123')).toBe(true);
  });

  it('rejects other sites', () => {
    expect(isMessengerLink('https://example.com/j/abc')).toBe(false);
    expect(isMessengerLink('m.me/j/abc')).toBe(false);
  });

  it('lets drivers leave the link blank for now', () => {
    const r = offerSchema.safeParse({ eventId: 'e1', seats: '4', departTime: '2026-10-18T09:30', gcJoinLink: '' });
    expect(r.success).toBe(true);
  });
});

describe('eventSchema', () => {
  const base = {
    category: 'event' as const,
    title: 'Fall retreat',
    description: '',
    startsAt: '2026-11-07T09:00',
    endsAt: '2026-11-07T19:00',
    destination: 'Camp',
  };

  it('accepts an event that ends after it starts', () => {
    expect(eventSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an end time before the start time', () => {
    expect(eventSchema.safeParse({ ...base, endsAt: '2026-11-07T08:00' }).success).toBe(false);
  });
});

import { seriesSchema } from './validation';

describe('seriesSchema', () => {
  const base = { category: 'church' as const, title: 'First service', description: '', weekday: 0, startTime: '08:30', endTime: '10:30', destination: '', active: true };

  it('accepts a weekly Sunday service', () => {
    expect(seriesSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a missing start time', () => {
    expect(seriesSchema.safeParse({ ...base, startTime: '' }).success).toBe(false);
  });
});
