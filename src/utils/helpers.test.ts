import { describe, it, expect, afterEach } from 'vitest';
import { estimateFare, setFareOverrides } from './helpers';

// The quote on the order screen is computed client-side, so it can drift from
// what the server will actually charge. It did: the admin panel's minFare and
// per-km rate reached the server but not the client, and a price change made in
// admin never showed up in the app. These lock the two halves together —
// mirror of taxi-pro-server/src/services/fareCalculator.ts.
describe('estimateFare', () => {
  afterEach(() => setFareOverrides({}));

  it('falls back to the built-in table when the settings fetch has not landed', () => {
    // economy: base 1.0 + 10km * 0.5 + 20min * 0.1 = 8.0
    expect(estimateFare('economy', 10, 20)).toBe(8);
  });

  it('rescales the per-km rate for every class, not just economy', () => {
    // Doubling the economy rate (0.5 -> 1.0) doubles each class's per-km term.
    setFareOverrides({ baseFarePerKm: 1.0 });
    expect(estimateFare('economy', 10, 20)).toBe(13); // 1.0 + 10*0.5*2 + 20*0.1
    expect(estimateFare('business', 10, 20)).toBe(26.1); // 2.5 + 10*1.0*2 + 20*0.18
  });

  it('raises the class floor but never lowers it', () => {
    setFareOverrides({ minFare: 12 });
    expect(estimateFare('economy', 1, 1)).toBe(12); // 1.6 raw -> floored to 12
    // A floor lower than the class's own is ignored: economy computes 1.6 here,
    // which already clears both, and an empty business trip still bills its 3.5.
    setFareOverrides({ minFare: 0.5 });
    expect(estimateFare('economy', 1, 1)).toBe(1.6);
    expect(estimateFare('business', 0, 0)).toBe(3.5);
  });

  it('applies surge on top of the admin-tuned rate', () => {
    setFareOverrides({ baseFarePerKm: 1.0 });
    expect(estimateFare('economy', 10, 20, 2)).toBe(26); // 13 * 2
  });

  it('ignores a zero or negative rate rather than zeroing every fare', () => {
    setFareOverrides({ baseFarePerKm: 0 });
    expect(estimateFare('economy', 10, 20)).toBe(8);
  });
});
