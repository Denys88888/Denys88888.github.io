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
  const trimmed = query.trim();
  // Two characters is enough to start suggesting — three shut out short street
  // names and made the field feel unresponsive. The cache below keeps the extra
  // keystroke from costing an extra Nominatim request.
  if (trimmed.length < 2) return [];

  // Nominatim asks callers to keep request volume low, and users retype and
  // backspace through the same prefixes constantly. Serve repeats from cache.
  const cacheKey = `${trimmed.toLowerCase()}|${countryCodes ?? ''}|${
    near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ''
  }`;
  const cached = readSearchCache(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({ format: 'json', limit: '8', addressdetails: '1', q: query });
  if (near) {
    const b = bbox(near, LOCAL_RADIUS_KM);
    params.set('viewbox', `${b.left},${b.top},${b.right},${b.bottom}`);
    params.set('bounded', '1');
  }
  if (countryCodes) params.set('countrycodes', countryCodes);

  try {
    const res = await fetch(`${NOMINATIM}/search?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      address?: { postcode?: string };
    }>;
    let results = data.map((d) => ({
      // Drop the postcode: it is noise in a ride address, and Nominatim lists
      // long streets once per postcode zone — without it the dedupe below
      // collapses those segments into a single suggestion.
      displayName: d.address?.postcode
        ? d.display_name.replace(`, ${d.address.postcode}`, '')
        : d.display_name,
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
    const deduped = results.filter((r) => !seen.has(r.displayName) && seen.add(r.displayName));
    writeSearchCache(cacheKey, deduped);
    return deduped;
  } catch {
    return []; // offline / Nominatim unreachable — empty dropdown, not an unhandled rejection
  }
}

// ── Search cache ────────────────────────────────────────────────────────────
// Survives reloads (Pi Browser reloads the PWA often) but expires, so a place
// that opens or moves isn't remembered wrongly forever.

const SEARCH_CACHE_KEY = 'tp_addr_cache';
const SEARCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_CACHE_MAX = 80;

type CacheEntry = { at: number; results: AddressResult[] };

function loadCache(): Record<string, CacheEntry> {
  try {
    return JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY) ?? '{}') as Record<string, CacheEntry>;
  } catch {
    return {};
  }
}

function readSearchCache(key: string): AddressResult[] | null {
  const entry = loadCache()[key];
  if (!entry) return null;
  if (Date.now() - entry.at > SEARCH_CACHE_TTL_MS) return null;
  return entry.results;
}

function writeSearchCache(key: string, results: AddressResult[]): void {
  try {
    const cache = loadCache();
    cache[key] = { at: Date.now(), results };
    const keys = Object.keys(cache);
    if (keys.length > SEARCH_CACHE_MAX) {
      // Drop the oldest entries rather than clearing everything, so a heavy
      // session doesn't repeatedly throw away still-useful recent lookups.
      keys
        .sort((a, b) => cache[a].at - cache[b].at)
        .slice(0, keys.length - SEARCH_CACHE_MAX)
        .forEach((k) => delete cache[k]);
    }
    localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota or private mode — the cache is an optimisation, never required */
  }
}

// ── Recently used addresses ─────────────────────────────────────────────────
// Every competitor offers the last few destinations the moment the field is
// focused; it is the fastest path for the trips people actually repeat, and it
// costs no geocoding request at all.

const RECENT_KEY = 'tp_addr_recent';
const RECENT_MAX = 6;

export function recentAddresses(): AddressResult[] {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as AddressResult[];
    return Array.isArray(list) ? list.slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

export function rememberAddress(entry: AddressResult): void {
  try {
    const list = recentAddresses().filter((r) => r.displayName !== entry.displayName);
    list.unshift(entry);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    /* non-fatal */
  }
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

// ── Turn-by-turn maneuvers (OSRM steps) ──

// One lane of the road as it approaches a maneuver, in left-to-right order.
export interface Lane {
  // Where this lane lets you go: 'straight', 'left', 'slight right',
  // 'sharp left', 'uturn', 'merge to left', 'none', … (OSM turn:lanes values).
  indications: string[];
  // True when staying in this lane keeps you on the route.
  valid: boolean;
}

export interface Maneuver {
  // OSRM maneuver type ('turn', 'depart', 'arrive', 'roundabout', …) +
  // modifier ('left', 'right', 'straight', …).
  type: string;
  modifier?: string;
  road: string;
  distanceM: number; // length of the step following this maneuver
  lat: number;
  lng: number;
  // Lane layout at the maneuver, when OSM has turn:lanes for that junction.
  lanes?: Lane[];
}

// Fetch the maneuver list for a route (driver turn-by-turn navigation).
export async function fetchRouteSteps(waypoints: GeoPoint[]): Promise<Maneuver[] | null> {
  if (waypoints.length < 2) return null;
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(';');
  try {
    const res = await fetch(
      `${OSRM}/route/v1/driving/${coords}?overview=false&steps=true`,
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      code?: string;
      routes?: Array<{
        legs: Array<{
          steps: Array<{
            distance: number;
            name: string;
            maneuver: { type: string; modifier?: string; location: [number, number] };
            intersections?: Array<{ lanes?: Array<{ valid?: boolean; indications?: string[] }> }>;
          }>;
        }>;
      }>;
    };
    const route = data.code === 'Ok' && data.routes?.[0];
    if (!route) return null;
    return route.legs.flatMap((leg) =>
      leg.steps.map((s) => ({
        type: s.maneuver.type,
        modifier: s.maneuver.modifier,
        road: s.name,
        distanceM: s.distance,
        lat: s.maneuver.location[1],
        lng: s.maneuver.location[0],
        // The step's first intersection is the junction the maneuver happens
        // at, so its lanes are the ones the driver has to pick between now.
        lanes: s.intersections?.[0]?.lanes?.map((l) => ({
          indications: l.indications?.length ? l.indications : ['none'],
          valid: l.valid === true,
        })),
      }))
    );
  } catch {
    return null;
  }
}

// ── Legal speed limit from OpenStreetMap (Overpass API, no API key) ──
// OSRM's demo server can tell us how fast a road is normally driven but not
// what the sign says, so the limit itself comes from the raw OSM maxspeed tag.

const OVERPASS = 'https://overpass-api.de/api/interpreter';
const MPH_TO_KPH = 1.609344;

// OSM maxspeed values are free-form: "50", "30 mph", "DE:urban", "none",
// "walk". Only an explicit number is worth showing on a speed-limit sign.
export function parseMaxspeed(raw: string | undefined): number | null {
  if (!raw) return null;
  const match = /^(\d+(?:\.\d+)?)\s*(mph|knots)?$/i.exec(raw.trim());
  if (!match) return null;
  const value = parseFloat(match[1]);
  if (!value) return null;
  const unit = match[2]?.toLowerCase();
  if (unit === 'knots') return null;
  return Math.round(unit === 'mph' ? value * MPH_TO_KPH : value);
}

// Keyed by a ~110 m grid cell, so driving down one street is a single lookup
// rather than one per GPS tick. Entries hold the in-flight promise too, so
// overlapping calls for the same cell share one request.
const limitCache = new Map<string, Promise<number | null>>();
let overpassFailures = 0;
let overpassPausedUntil = 0;
const MAX_OVERPASS_FAILURES = 3;
const OVERPASS_PAUSE_MS = 120_000;

// Speed limit in km/h for the road at `point`, or null when OSM does not say.
// Never throws and never blocks the caller: navigation works without it.
export async function speedLimitKph(point: GeoPoint): Promise<number | null> {
  const cell = `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
  const cached = limitCache.get(cell);
  if (cached) return cached;
  // A public instance that is down or throttling us stays down for a while, so
  // back off instead of firing a request every time the driver moves — but only
  // for a couple of minutes: a busy minute must not cost the sign for the whole
  // trip.
  if (Date.now() < overpassPausedUntil) return null;

  const query =
    `[out:json][timeout:10];way(around:35,${point.lat},${point.lng})` +
    `["highway"]["maxspeed"];out tags 1;`;
  const request = (async () => {
    try {
      const res = await fetch(OVERPASS, { method: 'POST', body: query });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as {
        elements?: Array<{ tags?: { maxspeed?: string } }>;
      };
      overpassFailures = 0;
      return parseMaxspeed(data.elements?.[0]?.tags?.maxspeed);
    } catch {
      overpassFailures += 1;
      if (overpassFailures >= MAX_OVERPASS_FAILURES) {
        overpassPausedUntil = Date.now() + OVERPASS_PAUSE_MS;
        overpassFailures = 0; // fresh strikes once the pause is over
      }
      // Don't remember a failure as "this road has no limit" — drop the entry
      // so the next cell the driver enters can try again.
      limitCache.delete(cell);
      return null;
    }
  })();

  if (limitCache.size > 200) limitCache.clear();
  limitCache.set(cell, request);
  return request;
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
