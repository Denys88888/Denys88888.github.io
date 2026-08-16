import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import i18n from '../../i18n';
import { NavigationPanel } from './NavigationPanel';
import type { Maneuver } from '../../services/mapService';

// The driver reads this panel at speed, with one hand on the wheel: the lane to
// be in has to be visibly different from the lanes that lead off the route, and
// a speed shown next to a limit has to be honest about which one is which.

const fetchRouteSteps = vi.fn();
const speedLimitKph = vi.fn();

vi.mock('../../services/mapService', () => ({
  fetchRouteSteps: (...args: unknown[]) => fetchRouteSteps(...args),
  speedLimitKph: (...args: unknown[]) => speedLimitKph(...args),
}));

const TURN: Maneuver = {
  type: 'turn',
  modifier: 'right',
  road: 'Świętokrzyska',
  distanceM: 400,
  lat: 52.2297,
  lng: 21.0122,
  lanes: [
    { valid: false, indications: ['straight'] },
    { valid: false, indications: ['straight'] },
    { valid: true, indications: ['right'] },
  ],
};

const NEXT: Maneuver = {
  type: 'turn',
  modifier: 'left',
  road: 'Marszałkowska',
  distanceM: 900,
  lat: 52.2333,
  lng: 21.0155,
};

// ~500 m short of the turn, so nothing auto-advances mid-assertion.
const POSITION = { lat: 52.2252, lng: 21.0122 };

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DESTINATION = { lat: 52.2333, lng: 21.0155 };

function panel(position: { lat: number; lng: number }, speed?: number | null) {
  return (
    <NavigationPanel
      from={position}
      to={DESTINATION}
      position={position}
      speed={speed}
      onClose={() => {}}
    />
  );
}

function show(props: { speed?: number | null; steps?: Maneuver[] } = {}) {
  fetchRouteSteps.mockResolvedValue(props.steps ?? [TURN, NEXT]);
  return render(panel(POSITION, props.speed));
}

describe('NavigationPanel lane guidance', () => {
  it('lights only the lanes that keep the driver on the route', async () => {
    speedLimitKph.mockResolvedValue(null);
    const { container } = show();

    await screen.findByLabelText('Lane guidance');
    const lanes = Array.from(container.querySelectorAll('[data-lane]'));

    // Three lanes on the road means three boxes — a missing box would make the
    // strip point at the wrong lane of the real junction.
    expect(lanes.map((l) => l.getAttribute('data-lane'))).toEqual([
      'invalid',
      'invalid',
      'valid',
    ]);
  });

  it('shows no lane strip where OSM has no lane data', async () => {
    speedLimitKph.mockResolvedValue(null);
    show({ steps: [{ ...TURN, lanes: undefined }, NEXT] });

    await screen.findByText(/Turn right/);
    expect(screen.queryByLabelText('Lane guidance')).toBeNull();
  });
});

describe('NavigationPanel routing', () => {
  // The driver position updates once a second or faster. Routing on each one
  // would flood the routing service and restart the instruction that often.
  it('keeps one route while the driver is driving it', async () => {
    speedLimitKph.mockResolvedValue(null);
    fetchRouteSteps.mockResolvedValue([TURN, NEXT]);
    const { rerender } = render(panel(POSITION));
    await screen.findByText(/Turn right/);

    // Two fixes closer to the turn: still on the route.
    rerender(panel({ lat: 52.2262, lng: 21.0122 }));
    rerender(panel({ lat: 52.2275, lng: 21.0122 }));

    expect(fetchRouteSteps).toHaveBeenCalledTimes(1);
  });

  it('moves to the next instruction after a turn taken between two GPS fixes', async () => {
    speedLimitKph.mockResolvedValue(null);
    fetchRouteSteps.mockResolvedValue([TURN, NEXT]);
    // 60 m short of the junction, then 110 m past it — the car never reported a
    // fix inside the 30 m circle, but it plainly went through the turn.
    const { rerender } = render(panel({ lat: 52.22916, lng: 21.0122 }));
    await screen.findByText(/Turn right/);

    rerender(panel({ lat: 52.2307, lng: 21.0122 }));

    expect(await screen.findByText(/Turn left/)).toBeTruthy();
    expect(fetchRouteSteps).toHaveBeenCalledTimes(1); // passing a turn is not a reroute
  });

  it('asks for a new route once the driver has left this one', async () => {
    speedLimitKph.mockResolvedValue(null);
    fetchRouteSteps.mockResolvedValue([TURN, NEXT]);
    const { rerender } = render(panel(POSITION));
    await screen.findByText(/Turn right/);

    rerender(panel({ lat: 52.2262, lng: 21.0122 })); // closing in on the turn
    rerender(panel({ lat: 52.2240, lng: 21.0122 })); // then driving away from it

    await waitFor(() => expect(fetchRouteSteps).toHaveBeenCalledTimes(2));
    // The new route starts where the driver actually is, not where they were.
    expect(fetchRouteSteps.mock.calls[1][0]).toEqual([
      { lat: 52.224, lng: 21.0122 },
      DESTINATION,
    ]);
  });
});

describe('NavigationPanel speed', () => {
  it('shows the current speed in km/h and the posted limit', async () => {
    speedLimitKph.mockResolvedValue(50);
    show({ speed: 12.5 }); // 45 km/h

    const speed = await screen.findByLabelText('Your speed');
    expect(speed.textContent).toContain('45');
    await waitFor(() => expect(screen.getByLabelText('Speed limit').textContent).toBe('50'));
    // Under the limit: the reading stays neutral.
    expect(speed.querySelector('span')?.className).not.toContain('text-danger');
  });

  it('marks the speed as speeding only past the tolerance', async () => {
    speedLimitKph.mockResolvedValue(50);
    show({ speed: 20 }); // 72 km/h

    const speed = await screen.findByLabelText('Your speed');
    expect(speed.textContent).toContain('72');
    await waitFor(() =>
      expect(speed.querySelector('span')?.className).toContain('text-danger')
    );
  });

  it('hides the speed when the device does not report one', async () => {
    speedLimitKph.mockResolvedValue(null);
    show({ speed: null });

    await screen.findByText(/Turn right/);
    expect(screen.queryByLabelText('Your speed')).toBeNull();
    expect(screen.queryByLabelText('Speed limit')).toBeNull();
  });

  it('previews the maneuver after this one', async () => {
    speedLimitKph.mockResolvedValue(null);
    show();

    expect(await screen.findByText('Marszałkowska')).toBeTruthy();
    expect(screen.getByText('Then')).toBeTruthy();
  });
});

// Reported from a real driver screenshot: the instruction line was clipped to
// "Начните дви…" mid-word. The useful part of an instruction — which street —
// sits at the END of the string ("Turn right · Świętokrzyska"), so truncating
// to one line throws away exactly what the driver needs. It wraps to two lines
// now; these pin that so a future style pass can't quietly put truncate back.
describe('NavigationPanel instruction legibility', () => {
  it('does not clip the instruction to a single line', async () => {
    speedLimitKph.mockResolvedValue(null);
    show();

    const line = await screen.findByText(/Turn right/);
    expect(line.className).not.toMatch(/\btruncate\b/);
    expect(line.className).toMatch(/line-clamp-2/);
  });

  it('keeps the street name, not just the manoeuvre verb', async () => {
    speedLimitKph.mockResolvedValue(null);
    show();

    // Both halves in one node: clipping would drop the road and leave the verb.
    await screen.findByText(/Turn right.*Świętokrzyska/);
  });

  it('announces the closing distance politely for screen readers', async () => {
    speedLimitKph.mockResolvedValue(null);
    const { container } = show();

    await screen.findByText(/Turn right/);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    // The live region must carry the distance, not the whole panel.
    expect(live!.textContent).toMatch(/\d/);
  });

  it('gives both controls a 44px touch target', async () => {
    speedLimitKph.mockResolvedValue(null);
    show();

    const mute = await screen.findByLabelText('Mute voice');
    const close = screen.getByLabelText('Close');
    // h-11/w-11 = 44px; anything smaller is unreliable for a driver one-handed.
    for (const btn of [mute, close]) {
      expect(btn.className).toMatch(/\bh-11\b/);
      expect(btn.className).toMatch(/\bw-11\b/);
    }
  });
});
