import { useEffect, useRef, useState } from 'react';
import { speedLimitAt, type SpeedLimit, type SpeedUnit } from '../services/mapService';
import { haversineKm } from '../utils/helpers';
import type { GeoPoint } from '../types';

const MIN_GAP_MS = 15000; // don't ask OSM about the speed limit faster than this
const MIN_MOVE_KM = 0.15; // …nor before the driver has actually gone somewhere

/**
 * The posted limit for the road under the car, or null while it is unknown,
 * and the unit the driver's own speed should be shown in.
 *
 * Overpass is a shared public service with no SLA, so this asks sparingly —
 * only once the car has moved a block and at most once every fifteen seconds —
 * and treats every failure as "unknown" rather than surfacing an error. A
 * missing limit costs the driver a sign; a hammered Overpass costs everyone.
 *
 * The unit outlives the sign. Plenty of streets carry no limit in OSM, and a
 * driver in the US whose speed flipped from mph to km/h on every such block
 * would stop trusting the number. The last sign seen sets it; km/h until then.
 */
export function useSpeedLimit(position: GeoPoint | null): { limit: SpeedLimit | null; unit: SpeedUnit } {
  const [limit, setLimit] = useState<SpeedLimit | null>(null);
  const [unit, setUnit] = useState<SpeedUnit>('kmh');
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
    speedLimitAt(position).then((found) => {
      if (stale) return;
      setLimit(found);
      if (found) setUnit(found.unit);
    });
    return () => {
      stale = true;
    };
  }, [position?.lat, position?.lng]);

  return { limit, unit };
}
