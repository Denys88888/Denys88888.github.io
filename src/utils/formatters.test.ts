import { describe, it, expect } from 'vitest';
import { formatPi, formatDistance, formatDuration, maskPhone } from './formatters';

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
    expect(formatDuration(90)).toBe('1 h 30 min');
  });
  it('masks phone numbers', () => {
    expect(maskPhone('+1 555 123 4567')).toContain('4567');
    expect(maskPhone(undefined)).toBe('••••');
  });
});
