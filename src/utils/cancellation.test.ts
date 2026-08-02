import { describe, it, expect } from 'vitest';
import {
  cancellationFee,
  cancellationFeeApplies,
  driverEarned,
  freeCancelMsLeft,
  settledAmount,
} from './cancellation';
import type { Ride, RideStatus } from '../types';

// The confirm dialog quotes a figure in red before anything is sent to the
// server. These lock that figure to the server's own rule in
// rideController.cancelRide, and above all to who is doing the cancelling.

const NOW = new Date('2026-08-02T12:00:00Z').getTime();
const minutesAgo = (m: number) => new Date(NOW - m * 60 * 1000).toISOString();

function ride(status: RideStatus, arrivedMinAgo?: number): Pick<Ride, 'status' | 'arrivedAt' | 'fare'> {
  return {
    status,
    fare: 10,
    ...(arrivedMinAgo === undefined ? {} : { arrivedAt: minutesAgo(arrivedMinAgo) }),
  };
}

describe('cancellationFeeApplies', () => {
  it('bills the passenger who calls off a trip already under way', () => {
    expect(cancellationFeeApplies(ride('in_progress'), { isDriver: false, now: NOW })).toBe(true);
    expect(cancellationFee(ride('in_progress'), { isDriver: false, now: NOW })).toBe(5);
  });

  it('bills nobody when the driver is the one walking away mid-trip', () => {
    expect(cancellationFeeApplies(ride('in_progress'), { isDriver: true, now: NOW })).toBe(false);
    expect(cancellationFee(ride('in_progress'), { isDriver: true, now: NOW })).toBe(0);
  });

  it('bills nobody when the driver gives up long after arriving', () => {
    expect(cancellationFeeApplies(ride('arrived', 10), { isDriver: true, now: NOW })).toBe(false);
    expect(cancellationFee(ride('arrived', 10), { isDriver: true, now: NOW })).toBe(0);
  });

  it('bills the passenger who keeps the driver waiting past the grace window', () => {
    expect(cancellationFeeApplies(ride('arrived', 10), { isDriver: false, now: NOW })).toBe(true);
    expect(cancellationFee(ride('arrived', 10), { isDriver: false, now: NOW })).toBe(5);
  });

  it('leaves the passenger free inside the grace window', () => {
    expect(cancellationFeeApplies(ride('arrived', 1), { isDriver: false, now: NOW })).toBe(false);
  });

  it('leaves the passenger free before the driver has arrived', () => {
    for (const s of ['searching', 'scheduled', 'assigned'] as RideStatus[]) {
      expect(cancellationFeeApplies(ride(s), { isDriver: false, now: NOW })).toBe(false);
    }
  });

  it('charges nothing on an arrived ride that never recorded an arrival time', () => {
    // Defensive: a missing arrivedAt must not read as "the window closed long
    // ago" and bill somebody for a moment the app cannot actually place.
    expect(cancellationFeeApplies(ride('arrived'), { isDriver: false, now: NOW })).toBe(false);
  });
});

describe('freeCancelMsLeft', () => {
  it('counts down from five minutes after arrival', () => {
    expect(freeCancelMsLeft(ride('arrived', 0), NOW)).toBe(5 * 60 * 1000);
    expect(freeCancelMsLeft(ride('arrived', 2), NOW)).toBe(3 * 60 * 1000);
  });

  it('floors at zero rather than going negative', () => {
    expect(freeCancelMsLeft(ride('arrived', 30), NOW)).toBe(0);
  });

  it('is zero when there is no window to count: before arrival and after pickup', () => {
    expect(freeCancelMsLeft(ride('assigned'), NOW)).toBe(0);
    expect(freeCancelMsLeft(ride('in_progress', 1), NOW)).toBe(0);
  });
});

describe('driverEarned', () => {
  // The earnings dashboard sums this over every ride, so a ride that paid the
  // driver nothing has to come out as zero rather than as a hopeful number.
  it('pays out the fare cut plus the whole tip on a ride that ran', () => {
    expect(driverEarned({ status: 'completed', fare: 8, driverEarnings: 7.2, tipAmount: 1 })).toBe(8.2);
  });

  it('pays out a collected cancellation fee, not the fare or the tip', () => {
    expect(
      driverEarned({
        status: 'cancelled',
        fare: 8,
        driverEarnings: 7.2,
        tipAmount: 1,
        cancellationFee: 4,
        cancellationFeeStatus: 'paid',
        cancellationFeeDriverEarnings: 3.6,
      })
    ).toBe(3.6);
  });

  it('pays out nothing for a fee the passenger has not paid yet', () => {
    // Counting an outstanding fee as income put money in the dashboard that had
    // never reached the driver, and put the app at odds with the server's total.
    expect(
      driverEarned({
        status: 'cancelled',
        fare: 8,
        driverEarnings: 7.2,
        cancellationFee: 4,
        cancellationFeeStatus: 'outstanding',
        cancellationFeeDriverEarnings: 3.6,
      })
    ).toBe(0);
  });

  it('pays out nothing at all for a free cancellation', () => {
    expect(driverEarned({ status: 'cancelled', fare: 8, driverEarnings: 7.2 })).toBe(0);
  });
});

describe('settledAmount', () => {
  // The history card used to print ride.fare on every row. On a cancelled ride
  // that fare was refunded and never charged, so the number was fiction — and
  // the fee that really was taken appeared nowhere.
  const cancelled = (extra: Partial<Ride>): Parameters<typeof settledAmount>[0] => ({
    status: 'cancelled',
    fare: 8,
    ...extra,
  });

  it('shows the passenger the fare on a ride that actually ran', () => {
    expect(settledAmount({ status: 'completed', fare: 8 }, false)).toEqual({ amount: 8 });
  });

  it('shows the driver their own cut of that ride, never the fare', () => {
    // 8 π is what the passenger paid; the driver never sees the platform's cut.
    const money = settledAmount(
      { status: 'completed', fare: 8, driverEarnings: 7.2, tipAmount: 1 },
      true
    );
    expect(money).toEqual({ amount: 8.2 });
  });

  it('shows the passenger what the cancellation cost them, not the fare', () => {
    const money = settledAmount(
      cancelled({ cancellationFee: 4, cancellationFeeStatus: 'paid', cancellationFeeDriverEarnings: 3.6 }),
      false
    );
    expect(money).toEqual({ amount: 4, label: 'earnings.cancelFee', tone: 'text-warning' });
  });

  it('shows the driver their share of the same fee', () => {
    const money = settledAmount(
      cancelled({ cancellationFee: 4, cancellationFeeStatus: 'paid', cancellationFeeDriverEarnings: 3.6 }),
      true
    );
    expect(money?.amount).toBe(3.6);
  });

  it('shows the passenger a fee they still owe, since it blocks their next ride', () => {
    const money = settledAmount(
      cancelled({ cancellationFee: 4, cancellationFeeStatus: 'outstanding' }),
      false
    );
    expect(money).toEqual({ amount: 4, label: 'home.feeDueTitle', tone: 'text-danger' });
  });

  it('shows the driver nothing for a fee nobody has paid yet', () => {
    expect(
      settledAmount(cancelled({ cancellationFee: 4, cancellationFeeStatus: 'outstanding' }), true)
    ).toBeNull();
  });

  it('shows no amount at all when the cancellation was free', () => {
    expect(settledAmount(cancelled({}), false)).toBeNull();
    expect(settledAmount(cancelled({}), true)).toBeNull();
  });
});
