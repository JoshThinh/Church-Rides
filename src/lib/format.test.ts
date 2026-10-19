import { describe, expect, it } from 'vitest';
import { daysFromToday, joinTimes, relativeDay } from './format';

// Friday, Oct 16 2026, 5:00 PM local time
const friday = new Date(2026, 9, 16, 17, 0);
const at = (month: number, day: number, h: number, m = 0) => new Date(2026, month, day, h, m).toISOString();

describe('relativeDay', () => {
  it('says Today for later today', () => {
    expect(relativeDay(at(9, 16, 19), friday)).toBe('Today');
  });

  it('says Tomorrow for Saturday', () => {
    expect(relativeDay(at(9, 17, 9), friday)).toBe('Tomorrow');
  });

  it('says This Sunday for the coming Sunday', () => {
    expect(relativeDay(at(9, 18, 8, 30), friday)).toBe('This Sunday');
  });

  it('counts days across a month boundary', () => {
    expect(daysFromToday(at(10, 1, 8, 30), friday)).toBe(16);
  });
});

describe('joinTimes', () => {
  it('joins two morning services', () => {
    const out = joinTimes([at(9, 18, 8, 30), at(9, 18, 10, 45)]);
    expect(out.replace(/\s/g, ' ')).toBe('8:30 & 10:45 AM');
  });
});
