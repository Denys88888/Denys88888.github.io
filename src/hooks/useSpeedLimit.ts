import { useEffect, useRef, useState } from 'react';
import { speedLimitKph } from '../services/mapService';
import { haversineKm } from '../utils/helpers';
import type { GeoPoint } from '../types';

const MIN_GAP_MS = 15000; // don't ask OSM about the speed limit faster than this
const MIN_MOVE_KM = 0.15; // …nor before the driver has actually gone somewhere

/**
 * The posted limit for the road under the car, or null while it is unknown.
 *
 * Overpass is a shared public service with no SLA, so this asks sparingly —
 * only once the car has moved a block and at most once every fifteen seconds —
 * and treats every failure as "unknown" rather than surfacing an error. A
 * missing limit costs the driver a sign; a hammered Overpass costs everyone.
 */
export function useSpeedLimit(position: GeoPoint | null): number | null {
  const [limitKph, setLimitKph] = useState<number | null>(null);
  const askedRef = useRef<{ lat: number; lng: number; at: number } | null>(null);

  useEffect(() => {
    if (!position) return;
    const asked = askedRef.current;
    if (
      asked &&
      (Date.now() - asked.at < MIN_GAP_MS ||
        haversineKm(asked.lat, asked.lng, position.lat, position.lng) < MIN_MOVE_KM)
    ) {
      return;
    }
    askedRef.current = { lat: position.lat, lng: position.lng, at: Date.now() };
    let stale = false;
    speedLimitKph(position).then((kph) => {
      if (!stale) setLimitKph(kph);
    });
    return () => {
      stale = true;
    };
  }, [position?.lat, position?.lng]);

  return limitKph;
}
