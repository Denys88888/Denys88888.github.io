import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import i18n from '../../i18n';
import { RideProgressSteps } from './RideProgressSteps';
import type { RideStatus } from '../../types';

// A booking used to share step 0 with 'searching', so opening a ride booked for
// tomorrow showed "Searching for a driver" lit up as the current step. The
// passenger read that as a driver hunt already under way, then watched nothing
// happen until the booked time. A booking has not reached any step yet.

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

afterEach(cleanup);

function steps(status: RideStatus) {
  const { container } = render(<RideProgressSteps status={status} />);
  // The only spans in this component are the five step labels. The current step
  // is the one drawn in full colour; every other label is dimmed to 40%.
  const labels = Array.from(container.querySelectorAll('span'));
  return {
    all: labels.map((s) => s.textContent),
    active: labels.filter((s) => !s.className.includes('opacity-40')).map((s) => s.textContent),
  };
}

describe('RideProgressSteps', () => {
  it('marks no step as current for a ride that is only booked', () => {
    const { all, active } = steps('scheduled');

    // The timeline still shows what is coming...
    expect(all).toEqual([
      'Searching for a driver',
      'Driver on the way',
      'Driver has arrived',
      'On the trip',
      'Ride completed',
    ]);
    // ...but none of it has started.
    expect(active).toEqual([]);
  });

  it('marks the search as current once the ride is actually searching', () => {
    expect(steps('searching').active).toEqual(['Searching for a driver']);
  });

  it('advances the current step as the ride progresses', () => {
    expect(steps('assigned').active).toEqual(['Driver on the way']);
    expect(steps('in_progress').active).toEqual(['On the trip']);
    expect(steps('completed').active).toEqual(['Ride completed']);
  });

  it('draws no timeline at all for a cancelled ride', () => {
    const { container } = render(<RideProgressSteps status="cancelled" />);
    expect(container.innerHTML).toBe('');
  });
});
