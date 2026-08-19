import { api } from '../services/api';
import type { Ride, RideStatus } from '../types';

// Statuses that mean the trip is still happening. A passenger counts
// 'searching' — they are waiting for a driver and must not order a second car.
// A driver does not: nothing is theirs until they have accepted it.
const PASSENGER_LIVE: RideStatus[] = ['searching', 'assigned', 'arrived', 'in_progress'];
const DRIVER_LIVE: RideStatus[] = ['assigned', 'arrived', 'in_progress'];

// The newest live ride belonging to this user, or null.
//
// One request, not one per status. Asking per status looked cheaper, but the
// server cannot OR across passengerId/driverId in Firestore, so *every* call
// reads the user's entire ride history twice and filters in memory — the old
// loop cost eight queries on every visit to Home, on both home screens, and
// that read volume is what took the API down when the free quota ran out.
//
// The per-status loop also missed rides outright: `limit: 1` returned the
// newest ride with that status for *either* role, so a driver who had also
// booked a taxi as a passenger got that row back, the driverId check rejected
// it, and their own job was never found. Filtering by role here fixes it.
//
// Two attempts, because a single 429 or a dropped connection would otherwise
// hide the banner until the user thought to reload — with a trip under way.
//
// Returns `null` for "there is no active ride" and `undefined` for "could not
// find out". The difference matters: this runs again on every ride_status_update,
// and answering a failed request with null blanked the banner of a ride that
// was still running.
export async function fetchActiveRide(
  uid: string | undefined,
  as: 'passenger' | 'driver'
): Promise<Ride | null | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      // Newest first, so the first match is the current one.
      const { rides } = await api.listRides({ limit: 20 });
      return pickActiveRide(rides, uid, as);
    } catch (err) {
      console.error(`[${as}] fetchActiveRide:`, err);
      if (attempt === 0) await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return undefined;
}

// Split out from the fetch so the choice itself is testable without a network.
export function pickActiveRide(
  rides: Ride[],
  uid: string | undefined,
  as: 'passenger' | 'driver'
): Ride | null {
  const live = as === 'driver' ? DRIVER_LIVE : PASSENGER_LIVE;
  return (
    rides.find(
      (r) =>
        live.includes(r.status) &&
        (as === 'driver' ? r.driverId === uid : !uid || r.passengerId === uid)
    ) ?? null
  );
}
