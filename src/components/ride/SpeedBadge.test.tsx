import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18n from '../../i18n';
import { SpeedBadge } from './SpeedBadge';

const KMH50 = { value: 50, unit: 'kmh' } as const;

// A speed shown next to a limit has to be honest about which one is which: the
// driver reads this at a glance, and a number that looks like the limit but is
// actually their speed is worse than showing nothing.

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

afterEach(cleanup);

describe('SpeedBadge', () => {
  it('shows the current speed in km/h and the posted limit', () => {
    render(<SpeedBadge speed={12.5} limit={KMH50} />); // 12.5 m/s = 45 km/h

    const speed = screen.getByLabelText('Your speed');
    expect(speed.textContent).toContain('45');
    expect(screen.getByLabelText('Speed limit').textContent).toBe('50');
    // Under the limit: the reading stays neutral.
    expect(speed.querySelector('span')?.className).not.toContain('text-danger');
  });

  it('marks the speed as speeding only past the tolerance', () => {
    const { rerender } = render(<SpeedBadge speed={15.2} limit={KMH50} />); // 55 km/h
    // 5 km/h over is inside the tolerance — GPS speed is not that precise, and
    // a badge that cries wolf at every fix stops being read.
    expect(
      screen.getByLabelText('Your speed').querySelector('span')?.className
    ).not.toContain('text-danger');

    rerender(<SpeedBadge speed={20} limit={KMH50} />); // 72 km/h
    expect(
      screen.getByLabelText('Your speed').querySelector('span')?.className
    ).toContain('text-danger');
  });

  it('shows the limit alone when the device reports no speed', () => {
    render(<SpeedBadge speed={null} limit={KMH50} />);

    expect(screen.getByLabelText('Speed limit').textContent).toBe('50');
    expect(screen.queryByLabelText('Your speed')).toBeNull();
  });

  it('shows the speed alone when OSM has no limit for the road', () => {
    render(<SpeedBadge speed={12.5} limit={null} />);

    expect(screen.getByLabelText('Your speed').textContent).toContain('45');
    expect(screen.queryByLabelText('Speed limit')).toBeNull();
  });

  // Renders nothing rather than an empty pill floating over the map: an
  // unexplained white blob in the corner is worse than a clean corner.
  it('disappears entirely when it knows neither number', () => {
    const { container } = render(<SpeedBadge speed={null} limit={null} />);
    expect(container.firstChild).toBeNull();
  });

  // A negative speed is what some devices report when they have no fix yet.
  it('treats a device reporting a negative speed as no speed at all', () => {
    render(<SpeedBadge speed={-1} limit={KMH50} />);
    expect(screen.queryByLabelText('Your speed')).toBeNull();
  });

  // Reported from a recording in San Francisco: a "25 mph" street came out as
  // a "40" sign next to a speed in km/h. A US driver reads both in miles.
  it('shows the sign and the speed in mph on an mph road', () => {
    render(<SpeedBadge speed={12.5} limit={{ value: 30, unit: 'mph' }} />); // 12.5 m/s = 28 mph

    expect(screen.getByLabelText('Speed limit').textContent).toBe('30');
    const speed = screen.getByLabelText('Your speed');
    expect(speed.textContent).toContain('28');
    expect(speed.textContent).toContain('mph');
    expect(speed.querySelector('span')?.className).not.toContain('text-danger');
  });

  it('judges speeding against an mph limit in mph', () => {
    render(<SpeedBadge speed={16} limit={{ value: 30, unit: 'mph' }} />); // 36 mph
    expect(
      screen.getByLabelText('Your speed').querySelector('span')?.className
    ).toContain('text-danger');
  });

  it('keeps the speed in mph on a stretch with no sign, once told to', () => {
    render(<SpeedBadge speed={12.5} limit={null} unit="mph" />);
    expect(screen.getByLabelText('Your speed').textContent).toContain('28');
    expect(screen.getByLabelText('Your speed').textContent).toContain('mph');
  });

  // It sits over a moving map: a tap meant for the road underneath must not
  // land on the badge instead.
  it('does not swallow taps meant for the map', () => {
    const { container } = render(<SpeedBadge speed={12.5} limit={KMH50} />);
    expect((container.firstChild as HTMLElement).className).toContain('pointer-events-none');
  });
});
