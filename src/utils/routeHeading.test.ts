import { describe, it, expect } from 'vitest';
import { routeBearingAhead } from './routeHeading';

// The driver's map puts this bearing at the top of the screen, so these pin the
// one thing the owner asked for: the road ahead runs bottom-to-top. Coordinates
// are around Warsaw, where a degree of longitude is ~0.61 of a degree of
// latitude — which is exactly where a naive lat/lng comparison goes wrong.

// Smallest angle between two bearings, so 359° and 1° count as 2° apart.
const off = (a: number | null, b: number): number => {
  if (a === null) return Infinity;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe('routeBearingAhead', () => {
  it('reads north off a road running north', () => {
    const road: [number, number][] = [[52.2, 21.0], [52.201, 21.0], [52.202, 21.0]];
    expect(off(routeBearingAhead(road, { lat: 52.2005, lng: 21.0 }), 0)).toBeLessThan(1);
  });

  it('reads east off a road running east', () => {
    const road: [number, number][] = [[52.2, 21.0], [52.2, 21.002], [52.2, 21.004]];
    expect(off(routeBearingAhead(road, { lat: 52.2, lng: 21.001 }), 90)).toBeLessThan(1);
  });

  // Same street, opposite way. The order of the route is the direction of
  // travel — the map must not care which way the street happens to be drawn.
  it('reads south off the same road driven the other way', () => {
    const road: [number, number][] = [[52.202, 21.0], [52.201, 21.0], [52.2, 21.0]];
    expect(off(routeBearingAhead(road, { lat: 52.2015, lng: 21.0 }), 180)).toBeLessThan(1);
  });

  // The difference between route-up and car-to-a-point: a fix ~20 m east of a
  // north-running road, looking 40 m ahead, would read ~26° if it aimed at a
  // vertex. The road is still going north, and so must the map.
  it('keeps the road vertical when the GPS fix is off to the side', () => {
    const road: [number, number][] = [[52.2, 21.0], [52.201, 21.0], [52.202, 21.0]];
    expect(off(routeBearingAhead(road, { lat: 52.2005, lng: 21.0003 }), 0)).toBeLessThan(1);
  });

  describe('around a corner (100 m north, then east)', () => {
    const road: [number, number][] = [[52.2, 21.0], [52.2009, 21.0], [52.2009, 21.0015]];

    it('stays on the current street while the corner is still well ahead', () => {
      expect(off(routeBearingAhead(road, { lat: 52.2002, lng: 21.0 }), 0)).toBeLessThan(1);
    });

    // Inside the lookahead the chord cuts the corner, so the map is partway
    // round rather than snapping at the vertex. 20 m short of the corner the 40 m
    // chord splits evenly — 20 north, 20 east — which reads about 45°.
    it('is partway round just before the corner', () => {
      const b = routeBearingAhead(road, { lat: 52.20072, lng: 21.0 });
      expect(off(b, 0)).toBeGreaterThan(20);
      expect(off(b, 90)).toBeGreaterThan(20);
    });

    it('has turned onto the new street once past it', () => {
      expect(off(routeBearingAhead(road, { lat: 52.2009, lng: 21.001 }), 90)).toBeLessThan(1);
    });
  });

  // Out along a street and back down it a lane over: both legs are within a
  // couple of metres of the car. The first is the one being driven.
  it('follows the leg driven first when the route doubles back past the car', () => {
    const road: [number, number][] = [
      [52.2, 21.0],
      [52.202, 21.0],
      [52.202, 21.00004],
      [52.2, 21.00004],
    ];
    expect(off(routeBearingAhead(road, { lat: 52.2003, lng: 21.00002 }), 0)).toBeLessThan(1);
  });

  it('has nothing to say past the end of the road', () => {
    const road: [number, number][] = [[52.2, 21.0], [52.201, 21.0]];
    expect(routeBearingAhead(road, { lat: 52.2015, lng: 21.0 })).toBeNull();
  });

  it('has nothing to say without a road', () => {
    expect(routeBearingAhead([], { lat: 52.2, lng: 21.0 })).toBeNull();
    expect(routeBearingAhead([[52.2, 21.0]], { lat: 52.2, lng: 21.0 })).toBeNull();
  });
});
