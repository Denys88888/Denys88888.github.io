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

// driverEarnings is required on a Ride but optional here: a ride that never
// reached a driver carries no such figure, and the rule below has to hold for
// one anyway.
type SettledRide = Pick<
  Ride,
  'status' | 'fare' | 'cancellationFee' | 'cancellationFeeStatus' | 'cancellationFeeDriverEarnings'
> &
  Partial<Pick<Ride, 'driverEarnings' | 'tipAmount'>>;

// What the driver actually pockets from a ride: their cut of the fare plus the
// whole tip. A ride cancelled on them late pays only their share of the fee —
// they were paid for driving to the pickup, not for a trip that never ran.
export function driverEarned(ride: SettledRide): number {
  if (ride.status === 'cancelled') {
    return ride.cancellationFeeStatus === 'paid' ? ride.cancellationFeeDriverEarnings || 0 : 0;
  }
  return (ride.driverEarnings || 0) + (ride.tipAmount || 0);
}

// What actually changed hands on a finished ride, from one side of it, plus the
// translation key that says what the number is. Null when nothing moved.
//
// A cancelled ride never charged its fare, so printing that number told a
// passenger they had paid 8 π for a trip that cost them 4 — or, after a free
// cancellation, for one that cost them nothing at all. The driver is shown
// their own money throughout, never the passenger's side of it.
export function settledAmount(
  ride: SettledRide,
  isDriver: boolean
): { amount: number; label?: string; tone?: string } | null {
  if (ride.status !== 'cancelled') {
    return { amount: isDriver ? driverEarned(ride) : ride.fare };
  }
  if (ride.cancellationFeeStatus === 'paid') {
    // The passenger paid the whole fee; the driver received their share of it.
    const amount = isDriver ? ride.cancellationFeeDriverEarnings : ride.cancellationFee;
    return amount ? { amount, label: 'earnings.cancelFee', tone: 'text-warning' } : null;
  }
  // Raised and still owed. It blocks the passenger's next booking, so it is the
  // one thing on the card they need to see; the driver is owed nothing until it
  // is collected.
  if (!isDriver && ride.cancellationFeeStatus === 'outstanding' && ride.cancellationFee) {
    return { amount: ride.cancellationFee, label: 'home.feeDueTitle', tone: 'text-danger' };
  }
  return null;
}
