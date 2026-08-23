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

function panel(position: { lat: number; lng: number }) {
  return <NavigationPanel from={position} to={DESTINATION} position={position} />;
}

function show(props: { steps?: Maneuver[] } = {}) {
  fetchRouteSteps.mockResolvedValue(props.steps ?? [TURN, NEXT]);
  return render(panel(POSITION));
}

describe('NavigationPanel lane guidance', () => {
  it('lights only the lanes that keep the driver on the route', async () => {
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
    show({ steps: [{ ...TURN, lanes: undefined }, NEXT] });

    await screen.findByText(/Turn right/);
    expect(screen.queryByLabelText('Lane guidance')).toBeNull();
  });
});

describe('NavigationPanel routing', () => {
  // The driver position updates once a second or faster. Routing on each one
  // would flood the routing service and restart the instruction that often.
  it('keeps one route while the driver is driving it', async () => {
    fetchRouteSteps.mockResolvedValue([TURN, NEXT]);
    const { rerender } = render(panel(POSITION));
    await screen.findByText(/Turn right/);

    // Two fixes closer to the turn: still on the route.
    rerender(panel({ lat: 52.2262, lng: 21.0122 }));
    rerender(panel({ lat: 52.2275, lng: 21.0122 }));

    expect(fetchRouteSteps).toHaveBeenCalledTimes(1);
  });

  it('moves to the next instruction after a turn taken between two GPS fixes', async () => {
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

describe('NavigationPanel preview', () => {
  it('previews the maneuver after this one', async () => {
    show();

    expect(await screen.findByText('Marszałkowska')).toBeTruthy();
    expect(screen.getByText('Then')).toBeTruthy();
  });

  // The owner's screenshot: the banner stacked distance, instruction, a
  // full-width "then" strip and a speed strip, and the map was left a sliver.
  // The preview is a chip now — it may take only the width of its own text.
  it('keeps the next-turn preview inline, not a full-width strip', async () => {
    show();

    const then = await screen.findByText('Then');
    const chip = then.parentElement!;
    // inline-flex shrinks to its content; the old strip was a block-level row
    // separated by a border, which is what made it cost a whole line of map.
    expect(chip.tagName).toBe('SPAN');
    expect(chip.className).toMatch(/\binline-flex\b/);
    // Anchored on whitespace, not \b: Tailwind's hyphens are word boundaries,
    // so /\bw-full\b/ happily matches inside "max-w-full".
    const classes = chip.className.split(/\s+/);
    expect(classes).not.toContain('w-full');
    expect(classes).not.toContain('border-t');
  });

  // Speed and the limit moved out to a badge over the map; the banner must not
  // grow them back.
  it('does not carry the speed strip any more', async () => {
    show();

    await screen.findByText(/Turn right/);
    expect(screen.queryByLabelText('Your speed')).toBeNull();
    expect(screen.queryByLabelText('Speed limit')).toBeNull();
  });
});

// Reported from a real driver screenshot: the instruction line was clipped to
// "Начните дви…" mid-word. The useful part of an instruction — which street —
// sits at the END of the string ("Turn right · Świętokrzyska"), so truncating
// to one line throws away exactly what the driver needs. It wraps to two lines
// now; these pin that so a future style pass can't quietly put truncate back.
describe('NavigationPanel instruction legibility', () => {
  it('does not clip the instruction to a single line', async () => {
    show();

    const line = await screen.findByText(/Turn right/);
    expect(line.className).not.toMatch(/\btruncate\b/);
    expect(line.className).toMatch(/line-clamp-2/);
  });

  it('keeps the street name, not just the manoeuvre verb', async () => {
    show();

    // Both halves in one node: clipping would drop the road and leave the verb.
    await screen.findByText(/Turn right.*Świętokrzyska/);
  });

  it('announces the closing distance politely for screen readers', async () => {
    const { container } = show();

    await screen.findByText(/Turn right/);
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    // The live region must carry the distance, not the whole panel.
    expect(live!.textContent).toMatch(/\d/);
  });

  it('gives the mute control a 44px touch target', async () => {
    show();

    const mute = await screen.findByLabelText('Mute voice');
    // h-11/w-11 = 44px; anything smaller is unreliable for a driver one-handed.
    expect(mute.className).toMatch(/\bh-11\b/);
    expect(mute.className).toMatch(/\bw-11\b/);
  });

  // The bottom bar's "Exit" already ends navigation. A second control doing the
  // same thing cost 44px of width that the street name needed, on the row the
  // driver reads at speed.
  it('does not duplicate the bottom bar\'s exit control', async () => {
    show();

    await screen.findByText(/Turn right/);
    expect(screen.queryByLabelText('Close')).toBeNull();
  });
});
