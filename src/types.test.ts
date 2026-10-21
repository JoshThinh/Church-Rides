import { describe, expect, it } from 'vitest';
import { signupsClosed } from './types';

describe('signupsClosed', () => {
  const now = new Date('2026-10-25T14:00:00Z');
  const at = (minutesFromNow: number) => ({ startsAt: new Date(now.getTime() + minutesFromNow * 60_000).toISOString() });

  it('is open more than an hour before the start', () => {
    expect(signupsClosed(at(61), now)).toBe(false);
  });

  it('closes exactly one hour before the start', () => {
    expect(signupsClosed(at(60), now)).toBe(true);
  });

  it('is closed 30 minutes before the start', () => {
    expect(signupsClosed(at(30), now)).toBe(true);
  });
});
