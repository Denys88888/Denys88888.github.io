import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';
import { usePublicSettings } from './usePublicSettings';
import { estimateFare, setFareOverrides } from '../utils/helpers';

// The half of the pricing fix that unit-testing estimateFare alone can't reach:
// the admin's numbers have to actually travel from the settings endpoint into
// the quote. They previously didn't — the endpoint withheld them — and the
// failure was invisible, since a stale quote looks exactly like a correct one.

const publicSettings = vi.fn();

vi.mock('../services/api', () => ({
  api: { publicSettings: () => publicSettings() },
}));

function Probe() {
  usePublicSettings();
  return null;
}

describe('usePublicSettings', () => {
  afterEach(() => {
    cleanup();
    setFareOverrides({});
    vi.clearAllMocks();
  });

  it('feeds the fetched fare knobs into the quote', async () => {
    // Baseline off the built-in table: 1.0 + 10*0.5 + 20*0.1 = 8.
    expect(estimateFare('economy', 10, 20)).toBe(8);

    publicSettings.mockResolvedValue({
      appName: 'Taxi Pro',
      appLogo: '',
      contactEmail: '',
      maintenanceMode: false,
      minFare: 1.5,
      baseFarePerKm: 1.0, // admin doubled the per-km rate
      surgeEnabled: true,
    });
    render(<Probe />);

    await waitFor(() => expect(estimateFare('economy', 10, 20)).toBe(13));
  });

  it('leaves the quote on table defaults when the endpoint fails', async () => {
    publicSettings.mockRejectedValue(new Error('offline'));
    render(<Probe />);

    await waitFor(() => expect(publicSettings).toHaveBeenCalled());
    expect(estimateFare('economy', 10, 20)).toBe(8);
  });

  it('does not zero fares when an older server omits the knobs', async () => {
    publicSettings.mockResolvedValue({
      appName: 'Taxi Pro',
      appLogo: '',
      contactEmail: '',
      maintenanceMode: false,
    });
    render(<Probe />);

    await waitFor(() => expect(publicSettings).toHaveBeenCalled());
    expect(estimateFare('economy', 10, 20)).toBe(8);
  });
});
