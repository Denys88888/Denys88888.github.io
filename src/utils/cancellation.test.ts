import { describe, it, expect } from 'vitest';
import { cancellationFee, cancellationFeeApplies, freeCancelMsLeft } from './cancellation';
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
