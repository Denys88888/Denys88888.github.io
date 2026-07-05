import type { GeoPoint } from '../types';
import { haversineKm } from '../utils/helpers';

// Geocoding via OpenStreetMap Nominatim (no API key). Be a good citizen: results
// are debounced by the caller and requests carry a descriptive UA-equivalent.

const NOMINATIM = 'https://nominatim.openstreetmap.org';
const LOCAL_RADIUS_KM = 50;

export interface AddressResult {
  displayName: string;
  lat: number;
  lng: number;
}

// Approx bounding box (in degrees) around a point for a given radius in km.
function bbox(near: GeoPoint, radiusKm: number) {
  const dLat = radiusKm / 111;
  const dLng = radiusKm / (111 * Math.cos((near.lat * Math.PI) / 180) || 1);
  return {
    left: near.lng - dLng,
    right: near.lng + dLng,
    top: near.lat + dLat,
    bottom: near.lat - dLat,
  };
}

// Forward geocode. When `near` is given, results are constrained to the user's
// region: Nominatim is asked for a bounded viewbox, then results are filtered to
// within 50 km so only local matches (no far-away global hits) are returned.
export async function searchAddress(
  query: string,
  near?: GeoPoint | null,
  countryCodes?: string
): Promise<AddressResult[]> {
  if (query.trim().length < 3) return [];
  const params = new URLSearchParams({ format: 'json', limit: '8', q: query });
  if (near) {
    const b = bbox(near, LOCAL_RADIUS_KM);
    params.set('viewbox', `${b.left},${b.top},${b.right},${b.bottom}`);
    params.set('bounded', '1');
  }
  if (countryCodes) params.set('countrycodes', countryCodes);

  const res = await fetch(`${NOMINATIM}/search?${params.toString()}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  let results = data.map((d) => ({
    displayName: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
  // Hard local filter: drop anything beyond the local radius from the user.
  if (near) {
    results = results.filter(
      (r) => haversineKm(near.lat, near.lng, r.lat, r.lng) <= LOCAL_RADIUS_KM
    );
  }
  // Nominatim often returns the same place twice (e.g. a city node and its
  // administrative boundary share one display name) — keep the first of each.
  const seen = new Set<string>();
  return results.filter((r) => !seen.has(r.displayName) && seen.add(r.displayName));
}

// Reverse geocode to a 2-letter country code, for constraining searches by country.
export async function countryCodeAt(point: GeoPoint): Promise<string | undefined> {
  const url = `${NOMINATIM}/reverse?format=json&zoom=3&lat=${point.lat}&lon=${point.lng}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { address?: { country_code?: string } };
    return data.address?.country_code;
  } catch {
    return undefined;
  }
}

// ── Road routing via the public OSRM demo server (no API key) ──

const OSRM = 'https://router.project-osrm.org';

export interface RouteResult {
  points: [number, number][]; // [lat, lng] pairs following the road network
  distanceKm: number;
  durationMin: number;
}

// Cache by waypoint key: the same pickup/stops/destination combination is
// requested repeatedly as the user pans the map or the screen re-renders.
const routeCache = new Map<string, RouteResult>();

// Fetch the driving route through the given waypoints (2+). Returns null on
// any failure — callers should fall back to a straight line.
export async function fetchRoute(waypoints: GeoPoint[]): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;
  const key = waypoints.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');
  const cached = routeCache.get(key);
  if (cached) return cached;

  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  try {
    const res = await fetch(
      `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }>;
    };
    const route = data.code === 'Ok' && data.routes?.[0];
    if (!route) return null;
    const result: RouteResult = {
      // GeoJSON is [lng, lat]; Leaflet wants [lat, lng].
      points: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: route.distance / 1000,
      durationMin: route.duration / 60,
    };
    if (routeCache.size > 50) routeCache.clear();
    routeCache.set(key, result);
    return result;
  } catch {
    return null;
  }
}

// Reverse geocode: coordinates → human-readable address.
export async function reverseGeocode(point: GeoPoint): Promise<string> {
  const url = `${NOMINATIM}/reverse?format=json&lat=${point.lat}&lon=${point.lng}`;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return '';
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? '';
  } catch {
    return '';
  }
}
