import { describe, it, expect } from 'vitest';
import { pickActiveRide } from './activeRide';
import type { Ride, RideStatus } from '../types';

// The list always arrives newest-first from the server.
function ride(id: string, status: RideStatus, passengerId: string, driverId?: string): Ride {
  return { id, status, passengerId, driverId } as unknown as Ride;
}

describe('picking the ride that is still under way', () => {
  it('finds the passenger their own live ride', () => {
    const rides = [
      ride('r3', 'completed', 'u1', 'd1'),
      ride('r2', 'assigned', 'u1', 'd1'),
      ride('r1', 'cancelled', 'u1'),
    ];
    expect(pickActiveRide(rides, 'u1', 'passenger')?.id).toBe('r2');
  });

  it('ignores a booking for later — it does not block the order form', () => {
    expect(pickActiveRide([ride('r1', 'scheduled', 'u1')], 'u1', 'passenger')).toBeNull();
  });

  it('counts a ride still looking for a driver as live for the passenger', () => {
    expect(pickActiveRide([ride('r1', 'searching', 'u1')], 'u1', 'passenger')?.id).toBe('r1');
  });

  it('does not count a ride merely looking for a driver as the driver\'s own', () => {
    expect(pickActiveRide([ride('r1', 'searching', 'u9')], 'd1', 'driver')).toBeNull();
  });

  // The bug the per-status loop had: it asked for one row per status, and a
  // driver who had also booked a taxi for themselves got *that* row back, so
  // the job they were actually driving was never found.
  it('finds a driver their job even when their own newer booking sits on top', () => {
    const rides = [
      ride('own_taxi', 'assigned', 'd1', 'd9'),
      ride('the_job', 'in_progress', 'u1', 'd1'),
    ];
    expect(pickActiveRide(rides, 'd1', 'driver')?.id).toBe('the_job');
    // …and on the passenger side of the same account, the booking they made.
    expect(pickActiveRide(rides, 'd1', 'passenger')?.id).toBe('own_taxi');
  });

  it('never hands one user another user\'s ride', () => {
    expect(pickActiveRide([ride('r1', 'assigned', 'u2', 'd2')], 'd1', 'driver')).toBeNull();
  });

  it('returns null when nothing is live', () => {
    expect(pickActiveRide([ride('r1', 'completed', 'u1', 'd1')], 'u1', 'passenger')).toBeNull();
  });
});
