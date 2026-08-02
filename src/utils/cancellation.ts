import { LATE_CANCELLATION_FEE_PERCENT } from './constants';
import type { Ride } from '../types';

// Who pays for a cancelled ride. This mirrors cancelRide in the server's
// rideController — the confirm dialog quotes a figure before the request goes
// out, so the two have to agree exactly or the app promises one thing and the
// receipt says another. Kept in its own module so the rule can be tested
// without mounting the whole ride screen.

// Mirrors FREE_CANCELLATION_AFTER_ARRIVAL_MIN (5) on the server.
export const FREE_CANCEL_GRACE_MS = 5 * 60 * 1000;

type CancellableRide = Pick<Ride, 'status' | 'arrivedAt' | 'fare'>;

// How long cancelling stays free after the driver pulled up, in ms. Zero
// outside the window, and zero for any status other than 'arrived' — before
// arrival there is no deadline to count down to, and once the trip is under way
// the window is gone.
export function freeCancelMsLeft(ride: Pick<Ride, 'status' | 'arrivedAt'>, now: number): number {
  if (ride.status !== 'arrived' || !ride.arrivedAt) return 0;
  return Math.max(0, FREE_CANCEL_GRACE_MS - (now - new Date(ride.arrivedAt).getTime()));
}

// The fee is the passenger's alone. It compensates the driver for the trip to
// the pickup point and for time already spent on the road, so when it is the
// driver who calls the ride off there is nothing to compensate and nobody to
// bill — least of all the passenger left standing there.
export function cancellationFeeApplies(
  ride: Pick<Ride, 'status' | 'arrivedAt'>,
  opts: { isDriver: boolean; now: number }
): boolean {
  if (opts.isDriver) return false;
  if (ride.status === 'in_progress') return true;
  // An 'arrived' ride carrying no arrival time is a hole in our own records,
  // not evidence that the passenger kept anyone waiting. Reading the missing
  // stamp as "the window closed long ago" billed them half the fare for a
  // moment the app cannot place.
  return ride.status === 'arrived' && !!ride.arrivedAt && freeCancelMsLeft(ride, opts.now) === 0;
}

// What the passenger would actually be charged, in π.
export function cancellationFee(ride: CancellableRide, opts: { isDriver: boolean; now: number }): number {
  return cancellationFeeApplies(ride, opts) ? (ride.fare * LATE_CANCELLATION_FEE_PERCENT) / 100 : 0;
}
