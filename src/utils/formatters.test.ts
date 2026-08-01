import { describe, it, expect } from 'vitest';
import { formatPi, formatDistance, formatDuration, maskPhone, localDateTimeValue } from './formatters';

describe('formatters', () => {
  it('formats Pi amounts with the symbol', () => {
    expect(formatPi(2.5)).toBe('2.50 π');
  });
  it('formats sub-km distances in metres', () => {
    expect(formatDistance(0.4)).toBe('400 m');
    expect(formatDistance(4.25)).toBe('4.3 km');
  });
  it('formats durations', () => {
    expect(formatDuration(12)).toBe('12 min');
    expect(formatDuration(90)).toBe('1 hr 30 min');
  });
  it('masks phone numbers', () => {
    expect(maskPhone('+1 555 123 4567')).toContain('4567');
    expect(maskPhone(undefined)).toBe('••••');
  });

  // This feeds the `min` of the "schedule a ride" picker. It has to be local
  // wall-clock time: an ISO/UTC string would let a passenger in a positive
  // offset pick a slot in the past, which the server then dispatches at once.
  describe('localDateTimeValue', () => {
    it('formats a local date as the datetime-local input expects', () => {
      expect(localDateTimeValue(new Date(2026, 7, 1, 21, 8))).toBe('2026-08-01T21:08');
    });

    it('zero-pads every part', () => {
      expect(localDateTimeValue(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05T09:07');
    });

    it('reports local time, not UTC', () => {
      const d = new Date(2026, 7, 1, 23, 30);
      expect(localDateTimeValue(d)).toBe('2026-08-01T23:30');
      // Round-tripping the value through Date must land on the same instant —
      // that is exactly what the browser does with the input's min.
      expect(new Date(localDateTimeValue(d)).getTime()).toBe(d.getTime());
    });
  });
});
