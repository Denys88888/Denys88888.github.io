import { describe, it, expect } from 'vitest';
import { fixSpeed } from './useGeolocation';

// The speed readout during navigation is only as good as this: phones with a
// GPS chip hand us a speed, but plenty of devices (and the emulator we test on)
// report none, and a parked car must not appear to be creeping forward.

function fix(lat: number, lng: number, at: number, speed: number | null = null) {
  return {
    coords: { latitude: lat, longitude: lng, speed },
    timestamp: at,
  } as unknown as GeolocationPosition;
}

const PREV = { lat: 52.2297, lng: 21.0122, at: 1_000_000 };

describe('fixSpeed', () => {
  it('trusts the speed the device measured', () => {
    expect(fixSpeed(fix(52.2297, 21.0122, PREV.at + 10_000, 13.5), PREV)).toBe(13.5);
  });

  it('derives the speed from the previous fix when the device reports none', () => {
    // 0.0009° of latitude ≈ 100 m; covered in 10 s ≈ 10 m/s.
    const speed = fixSpeed(fix(52.2306, 21.0122, PREV.at + 10_000), PREV);
    expect(speed).toBeGreaterThan(9);
    expect(speed).toBeLessThan(11);
  });

  it('falls back to derivation when the device reports a negative speed', () => {
    // -1 is how some Android builds say "unknown" instead of null.
    expect(fixSpeed(fix(52.2306, 21.0122, PREV.at + 10_000, -1), PREV)).toBeGreaterThan(9);
  });

  it('reads GPS jitter on a parked car as a standstill', () => {
    // ~2 m of drift, not motion.
    expect(fixSpeed(fix(52.229718, 21.0122, PREV.at + 5_000), PREV)).toBe(0);
  });

  it('knows nothing from a single fix', () => {
    expect(fixSpeed(fix(52.2297, 21.0122, PREV.at), null)).toBeNull();
  });

  it('will not average a speed across a long gap in tracking', () => {
    // App in the background for two minutes: the distance is real, but the
    // speed it implies says nothing about how fast the car is going now.
    expect(fixSpeed(fix(52.2306, 21.0122, PREV.at + 120_000), PREV)).toBeNull();
  });
});
