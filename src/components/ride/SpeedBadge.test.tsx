import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18n from '../../i18n';
import { SpeedBadge } from './SpeedBadge';

// A speed shown next to a limit has to be honest about which one is which: the
// driver reads this at a glance, and a number that looks like the limit but is
// actually their speed is worse than showing nothing.

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

afterEach(cleanup);

describe('SpeedBadge', () => {
  it('shows the current speed in km/h and the posted limit', () => {
    render(<SpeedBadge speed={12.5} limitKph={50} />); // 12.5 m/s = 45 km/h

    const speed = screen.getByLabelText('Your speed');
    expect(speed.textContent).toContain('45');
    expect(screen.getByLabelText('Speed limit').textContent).toBe('50');
    // Under the limit: the reading stays neutral.
    expect(speed.querySelector('span')?.className).not.toContain('text-danger');
  });

  it('marks the speed as speeding only past the tolerance', () => {
    const { rerender } = render(<SpeedBadge speed={15.2} limitKph={50} />); // 55 km/h
    // 5 km/h over is inside the tolerance — GPS speed is not that precise, and
    // a badge that cries wolf at every fix stops being read.
    expect(
      screen.getByLabelText('Your speed').querySelector('span')?.className
    ).not.toContain('text-danger');

    rerender(<SpeedBadge speed={20} limitKph={50} />); // 72 km/h
    expect(
      screen.getByLabelText('Your speed').querySelector('span')?.className
    ).toContain('text-danger');
  });

  it('shows the limit alone when the device reports no speed', () => {
    render(<SpeedBadge speed={null} limitKph={50} />);

    expect(screen.getByLabelText('Speed limit').textContent).toBe('50');
    expect(screen.queryByLabelText('Your speed')).toBeNull();
  });

  it('shows the speed alone when OSM has no limit for the road', () => {
    render(<SpeedBadge speed={12.5} limitKph={null} />);

    expect(screen.getByLabelText('Your speed').textContent).toContain('45');
    expect(screen.queryByLabelText('Speed limit')).toBeNull();
  });

  // Renders nothing rather than an empty pill floating over the map: an
  // unexplained white blob in the corner is worse than a clean corner.
  it('disappears entirely when it knows neither number', () => {
    const { container } = render(<SpeedBadge speed={null} limitKph={null} />);
    expect(container.firstChild).toBeNull();
  });

  // A negative speed is what some devices report when they have no fix yet.
  it('treats a device reporting a negative speed as no speed at all', () => {
    render(<SpeedBadge speed={-1} limitKph={50} />);
    expect(screen.queryByLabelText('Your speed')).toBeNull();
  });

  // It sits over a moving map: a tap meant for the road underneath must not
  // land on the badge instead.
  it('does not swallow taps meant for the map', () => {
    const { container } = render(<SpeedBadge speed={12.5} limitKph={50} />);
    expect((container.firstChild as HTMLElement).className).toContain('pointer-events-none');
  });
});
