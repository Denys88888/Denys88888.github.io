import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchRouteSteps, parseMaxspeed, speedLimitKph } from './mapService';

// Lane guidance and the speed-limit sign both come from raw OpenStreetMap data
// reached through two different public services, and both are free-form enough
// that a wrong reading would show the driver a confident, wrong instruction.

afterEach(() => {
  vi.unstubAllGlobals();
});

function osrmReply(steps: unknown[]) {
  return {
    ok: true,
    json: async () => ({ code: 'Ok', routes: [{ legs: [{ steps }] }] }),
  };
}

const turnRight = {
  distance: 120,
  name: 'Świętokrzyska',
  maneuver: { type: 'turn', modifier: 'right', location: [21.0122, 52.2297] },
  intersections: [
    {
      lanes: [
        { valid: false, indications: ['straight'] },
        { valid: false, indications: ['straight'] },
        { valid: true, indications: ['right'] },
      ],
    },
    // A later intersection on the same step describes a junction the driver
    // has not reached yet — its lanes must not be used for this turn.
    { lanes: [{ valid: true, indications: ['straight'] }] },
  ],
};

describe('fetchRouteSteps', () => {
  it('takes the lanes of the junction the maneuver happens at', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(osrmReply([turnRight])));

    const steps = await fetchRouteSteps([
      { lat: 52.2297, lng: 21.0122 },
      { lat: 52.245, lng: 21.04 },
    ]);

    expect(steps?.[0].lanes).toEqual([
      { valid: false, indications: ['straight'] },
      { valid: false, indications: ['straight'] },
      { valid: true, indications: ['right'] },
    ]);
  });

  it('leaves lanes unset where OSM has no lane data', async () => {
    const plain = { ...turnRight, intersections: [{ out: 0 }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(osrmReply([plain])));

    const steps = await fetchRouteSteps([
      { lat: 52.2297, lng: 21.0122 },
      { lat: 52.245, lng: 21.04 },
    ]);

    expect(steps?.[0].lanes).toBeUndefined();
    expect(steps?.[0].road).toBe('Świętokrzyska');
  });

  it('keeps a lane with no indications rather than dropping it from the row', async () => {
    // Lane count is what makes the strip line up with the road; a lane OSM
    // says nothing about still exists and still has to be drawn.
    const blank = { ...turnRight, intersections: [{ lanes: [{ valid: true }, { valid: false }] }] };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(osrmReply([blank])));

    const steps = await fetchRouteSteps([
      { lat: 52.2297, lng: 21.0122 },
      { lat: 52.245, lng: 21.04 },
    ]);

    expect(steps?.[0].lanes).toEqual([
      { valid: true, indications: ['none'] },
      { valid: false, indications: ['none'] },
    ]);
  });
});

describe('parseMaxspeed', () => {
  it('reads a plain km/h number', () => {
    expect(parseMaxspeed('50')).toBe(50);
  });

  it('converts mph to km/h', () => {
    expect(parseMaxspeed('30 mph')).toBe(48);
    expect(parseMaxspeed('70mph')).toBe(113);
  });

  it('shows no sign for values that are not a number', () => {
    // Putting "urban" or "none" on a speed-limit sign, or guessing what the
    // local default is, is worse than showing nothing.
    for (const raw of ['none', 'DE:urban', 'walk', 'signals', '', undefined]) {
      expect(parseMaxspeed(raw)).toBeNull();
    }
  });
});

describe('speedLimitKph', () => {
  it('asks OSM once per road cell and reuses the answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ elements: [{ tags: { maxspeed: '50' } }] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const point = { lat: 40.1111, lng: 30.2222 };
    expect(await speedLimitKph(point)).toBe(50);
    // A few metres on is the same cell — a driver must not generate one
    // Overpass request per GPS tick.
    expect(await speedLimitKph({ lat: 40.11112, lng: 30.22221 })).toBe(50);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reports no limit when Overpass is down, and retries later', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({
        ok: true,
        json: async () => ({ elements: [{ tags: { maxspeed: '80' } }] }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const point = { lat: 41.3333, lng: 31.4444 };
    expect(await speedLimitKph(point)).toBeNull();
    // The failure must not be cached as "this road has no limit".
    expect(await speedLimitKph(point)).toBe(80);
  });

  it('backs off after a run of failures, then tries again once the pause is over', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('overpass busy'));
    vi.stubGlobal('fetch', fetchMock);

    // Three strikes in a row: stop hammering a public service that is down.
    for (const lng of [50.1, 50.2, 50.3]) {
      expect(await speedLimitKph({ lat: 43.7, lng })).toBeNull();
    }
    expect(await speedLimitKph({ lat: 43.7, lng: 50.4 })).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3); // the 4th never left the app

    // A busy minute must not cost the driver the sign for the rest of the trip.
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 121_000);
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ elements: [{ tags: { maxspeed: '60' } }] }),
      });
      expect(await speedLimitKph({ lat: 43.7, lng: 50.5 })).toBe(60);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports no limit when the road has no maxspeed tag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ elements: [] }) })
    );

    expect(await speedLimitKph({ lat: 42.5555, lng: 32.6666 })).toBeNull();
  });
});
