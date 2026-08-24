import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  MapContainer as LeafletMap,
  TileLayer,
  Marker,
  Polyline,
  Circle,
  useMap,
  useMapEvents,
} from 'react-leaflet';
import L from 'leaflet';
// Patches L with real rotation support (setBearing, and the drag/zoom/
// projection math that goes with it). Must come after the leaflet import:
// it augments that same instance. Opt-in per map via the `rotate` option,
// so the passenger and driver home maps are untouched.
import 'leaflet-rotate';
import type { GeoPoint, HeatmapPoint } from '../../types';
import { fetchRoute } from '../../services/mapService';
import { haversineKm } from '../../utils/helpers';

// Colored pin built from a divIcon so we don't depend on Leaflet's image assets
// (which break under a non-root base path on GitHub Pages).
// Compass bearing (degrees clockwise from north) from point a to point b.
function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

// `heading` rotates the marker to face the direction of travel, the way Uber
// and Bolt do — a car that always points north reads as a stuck pin. The
// arrow (rather than the side-on car glyph) is what actually conveys heading;
// null heading falls back to the neutral car silhouette.
function carIcon(small = false, heading: number | null = null, stale = false): L.DivIcon {
  const size = small ? 28 : 36;
  const svg = small ? 14 : 18;
  // Grey and faded when the position stopped arriving. A car drawn in
  // living green on a spot it left five minutes ago is worse than no car:
  // the passenger reads it as "he is right there" and stops watching.
  const bg = stale ? '#9E9E9E' : small ? '#0F6E56' : '#00C853';
  const glyph =
    heading === null
      ? `<svg width="${svg}" height="${svg}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.4A2 2 0 0 0 13.7 6H10.3a2 2 0 0 0-1.6.8L6 10l-2.5 1.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2"/>
        <circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>
      </svg>`
      : `<svg width="${svg}" height="${svg}" viewBox="0 0 24 24" fill="#fff" stroke="#fff" stroke-width="1.5" stroke-linejoin="round" style="transform:rotate(${heading}deg);transition:transform .4s ease-out">
        <path d="M12 2.5 19 20l-7-4-7 4z"/>
      </svg>`;
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35);opacity:${stale ? 0.55 : 1}">${glyph}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function pin(color: string, pulse = false): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="position:relative">
      ${pulse ? `<span style="position:absolute;inset:-8px;border-radius:9999px;background:${color};opacity:.3;animation:tp-pulse 1.6s ease-out infinite"></span>` : ''}
      <span style="display:block;width:18px;height:18px;border-radius:9999px;background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></span>
    </div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

// How far down the screen the car sits while navigating.
const NAV_CAR_Y = 0.72; // 0.5 = centred, 1 = bottom edge

// Recenter the map imperatively when the focus point changes. `nonce` lets a
// "my location" button force a recenter even when the coordinates are unchanged.
//
// While navigating the car does NOT go in the middle. Centred, half the screen
// is road already driven — Google Maps keeps you near the bottom so the space
// goes to what is coming. The map is rotated so `heading` points at the top of
// the screen, which makes "further down the screen" the same thing as "behind
// the car along its heading": shift the centre that far forward and the car
// falls back to where it should be.
function Recenter({
  center,
  nonce,
  heading,
  navMode,
  enabled = true,
}: {
  center: GeoPoint;
  nonce?: number;
  heading?: number | null;
  navMode?: boolean;
  // False while the driver is looking around the map themselves.
  enabled?: boolean;
}) {
  const map = useMap();
  useEffect(() => {
    if (!enabled) return;
    const zoom = map.getZoom();
    const ll = L.latLng(center.lat, center.lng);
    if (!navMode) {
      map.setView(ll, zoom, { animate: true });
      return;
    }
    // Screen pixels to push the car below centre. Rotation preserves distance,
    // so a screen pixel is a projected pixel — no scale to undo any more.
    const ahead = (NAV_CAR_Y - 0.5) * map.getSize().y;
    const rad = ((heading ?? 0) * Math.PI) / 180;
    const p = map.project(ll, zoom);
    // Map pixel y grows southward, so a bearing of 0 (north) is -y.
    const shifted = map.unproject(
      L.point(p.x + Math.sin(rad) * ahead, p.y - Math.cos(rad) * ahead),
      zoom
    );
    // animate: false, and it matters. A GPS fix lands every second, so an
    // animated pan is interrupted by the next one before it can finish and
    // fire `moveend` — and `moveend` is what tells Leaflet's SVG renderer to
    // reposition. The route line kept the coordinates of a pane that had since
    // moved and slid off the side of the screen: the driver was navigating
    // with no route drawn, and only while actually driving, which is why
    // standing still it looked fine. Each fix moves the map a few metres;
    // there is nothing here worth animating anyway.
    map.setView(shifted, zoom, { animate: false });
  }, [center.lat, center.lng, nonce, heading, navMode, enabled, map]);
  return null;
}

// Snap to a tighter zoom when turn-by-turn guidance starts, the way Google
// Maps zooms in for active navigation — only on that transition, so it
// doesn't fight a zoom level the driver sets manually afterward.
function NavZoom({ active }: { active: boolean }) {
  const map = useMap();
  const wasActive = useRef(false);
  useEffect(() => {
    if (active && !wasActive.current) {
      map.setView(map.getCenter(), 17, { animate: true });
    }
    wasActive.current = active;
  }, [active, map]);
  return null;
}

// Heading-up rotation for active navigation: turns the map so the direction of
// travel points at the top of the screen, like Google Maps and Waze.
//
// This used to CSS-rotate Leaflet's container and scale it up to cover the
// corners. It looked right and was unusable: Leaflet knew nothing about the
// transform, so a finger dragging in rotated screen space was interpreted in
// unrotated map space — the map went the wrong way — pinch anchored on the
// wrong point, and tiles rendered at 1.8x were soft. Panning had to be turned
// off entirely to hide it. leaflet-rotate does the rotation inside Leaflet, so
// drag, zoom, hit-testing and marker placement all stay correct.
//
// Bearing is the compass direction we want at the top, which is the heading
// itself — not its negative; the sign flip belonged to the CSS hack.
function RotateMap({ heading, active }: { heading: number | null; active: boolean }) {
  const map = useMap();
  useEffect(() => {
    // No cleanup resetting this to 0. The body already sets 0 whenever
    // navigation is off, and on unmount Leaflet has torn its panes down first —
    // setBearing then reads the map pane's position off undefined and takes the
    // whole screen with it ("Cannot read properties of undefined (reading
    // '_leaflet_pos')").
    map.setBearing(active && heading !== null ? heading : 0);
  }, [active, heading, map]);
  return null;
}

// Stop following the car the moment the driver moves the map themselves.
//
// Re-enabling drag during navigation would otherwise be pointless: a GPS fix
// lands every second, and each one snapped the view straight back, so the map
// twitched and refused to be looked at. Google Maps does the same — pan away
// and it stops chasing you until you tap the locate button. `dragstart` and
// `zoomstart` only fire for real gestures; our own setView calls do not
// trigger them, so this cannot pause itself.
function FollowPauser({ onUserMove }: { onUserMove: () => void }) {
  useMapEvents({
    dragstart: onUserMove,
    zoomstart: onUserMove,
  });
  return null;
}

// Leaflet caches the container size at init. If the map mounts before its
// container has its final height (splash→app transition, flex/%-height layout
// settling — common on mobile / Pi Browser), tiles never paint and the map looks
// blank. Re-measure after mount, after short delays, and on resize.
function SizeInvalidator() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize({ animate: false });
    fix();
    const timers = [50, 250, 600, 1200].map((ms) => setTimeout(fix, ms));
    window.addEventListener('resize', fix);
    window.addEventListener('orientationchange', fix);
    return () => {
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', fix);
      window.removeEventListener('orientationchange', fix);
    };
  }, [map]);
  return null;
}

// Relays map tap AND long-press coordinates to the parent. On touch devices
// Leaflet fires `contextmenu` for a long-press, so both gestures select a point.
function ClickCapture({ onClick }: { onClick: (p: GeoPoint) => void }) {
  useMapEvents({
    click(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
    contextmenu(e) {
      onClick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

// Demand heatmap cell color by weight: green → yellow → red.
function heatColor(weight: number): string {
  if (weight >= 5) return '#FF1744';
  if (weight >= 3) return '#FFAB00';
  return '#00C853';
}

interface Props {
  center: GeoPoint;
  pickup?: GeoPoint | null;
  destination?: GeoPoint | null;
  driver?: GeoPoint | null;
  // Route start when it isn't the pickup point (e.g. the driver's own live
  // position while en route to collect the passenger) — feeds the polyline
  // like `pickup` does, but never draws its own pin (the `driver` car icon,
  // or nothing, already marks that spot).
  routeFrom?: GeoPoint | null;
  // The user's own live GPS position — rendered as a pulsing blue dot.
  me?: GeoPoint | null;
  // One-off recenter target (e.g. the "my location" button); bump focusNonce
  // to re-trigger with unchanged coordinates.
  focus?: GeoPoint | null;
  focusNonce?: number;
  // Demand hotspots (driver map): translucent colored circles.
  heatmap?: HeatmapPoint[];
  // Nearby available drivers shown on passenger map before booking.
  nearbyDrivers?: Array<{ uid: string; location: GeoPoint }>;
  stops?: GeoPoint[];
  onMapClick?: (p: GeoPoint) => void;
  // When provided, the destination pin is draggable and reports its new position.
  onDestinationDrag?: (p: GeoPoint) => void;
  // Active turn-by-turn guidance: tightens the zoom and rotates the map to
  // face the direction of travel (see NavZoom/RotateMap above).
  navMode?: boolean;
  // The driver's position has stopped arriving — draw it as the old news
  // it is rather than as a car that happens not to be moving.
  driverStale?: boolean;
  className?: string;
}

// The map surface: OSM tiles, pickup/stops/destination/driver markers, and a
// route line that threads through any intermediate stops.
export function MapView({
  center,
  pickup,
  destination,
  driver,
  me,
  routeFrom,
  focus,
  focusNonce,
  heatmap = [],
  nearbyDrivers = [],
  stops = [],
  onMapClick,
  onDestinationDrag,
  navMode = false,
  driverStale = false,
  className,
}: Props) {
  const { t } = useTranslation();
  const recalcLabel = t('nav.recalculating');
  // Two distinct legs, each its own color: the approach (routeFrom → pickup —
  // e.g. the driver's own live position while heading to collect the
  // passenger) and the trip itself (pickup → stops → destination — where the
  // passenger is actually going). Split so a driver deciding whether to take
  // a ride can see both "how far to get there" and "where it actually goes"
  // at a glance, instead of one same-colored line blurring the two together.
  const approachWaypoints: GeoPoint[] = [];
  if (routeFrom) approachWaypoints.push(routeFrom);
  if (pickup) approachWaypoints.push(pickup);
  const approachKey = approachWaypoints.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');

  const tripWaypoints: GeoPoint[] = [];
  if (pickup) tripWaypoints.push(pickup);
  tripWaypoints.push(...stops);
  if (destination) tripWaypoints.push(destination);
  const tripKey = tripWaypoints.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');

  // Road-following geometry from OSRM; until it arrives (or if it fails) the
  // straight waypoint line keeps the route visible.
  const [approachRoad, setApproachRoad] = useState<[number, number][] | null>(null);
  useEffect(() => {
    let stale = false;
    setApproachRoad(null);
    if (approachWaypoints.length >= 2) {
      fetchRoute(approachWaypoints).then((r) => {
        if (!stale && r) setApproachRoad(r.points);
      });
    }
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approachKey]);

  const [tripRoad, setTripRoad] = useState<[number, number][] | null>(null);
  useEffect(() => {
    let stale = false;
    setTripRoad(null);
    if (tripWaypoints.length >= 2) {
      fetchRoute(tripWaypoints).then((r) => {
        if (!stale && r) setTripRoad(r.points);
      });
    }
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripKey]);

  // Live rerouting during a trip: once a destination is set (the ride is under
  // way) the route should lead from the driver's CURRENT position, not the
  // original pickup, and rebuild if they leave it. Keyed to a ~110 m-quantised
  // driver position so it only refetches when the car has actually moved a
  // block — cheaper and steadier than a fixed 30 s timer. Skipped in the last
  // ~400 m so the line doesn't thrash right at the destination.
  const navKey =
    driver && destination
      ? `${driver.lat.toFixed(3)},${driver.lng.toFixed(3)}`
      : null;
  const [navRoad, setNavRoad] = useState<[number, number][] | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  useEffect(() => {
    if (!driver || !destination) {
      setNavRoad(null);
      setRecalculating(false);
      return;
    }
    if (haversineKm(driver.lat, driver.lng, destination.lat, destination.lng) < 0.4) {
      setNavRoad(null);
      setRecalculating(false);
      return;
    }
    let stale = false;
    setRecalculating(true);
    fetchRoute([driver, ...stops, destination]).then((r) => {
      if (stale) return;
      if (r) setNavRoad(r.points);
      setRecalculating(false);
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navKey]);

  const approachRoute: [number, number][] =
    approachRoad ?? approachWaypoints.map((p) => [p.lat, p.lng] as [number, number]);
  // Prefer the live-rerouted geometry (driver's current position → destination)
  // once it's available; fall back to the static pickup→destination route, then
  // to a straight waypoint line. navRoad already starts at the car, so the
  // grey/colour split below leaves nothing "travelled" on it — exactly right,
  // since a freshly rebuilt route is entirely still-to-drive.
  const tripRoute: [number, number][] =
    navRoad ?? tripRoad ?? tripWaypoints.map((p) => [p.lat, p.lng] as [number, number]);

  // Heading for the car marker, derived from successive driver positions. The
  // last known direction is kept in state so a re-render with an unchanged
  // position doesn't snap the arrow back to north. Updated in an effect rather
  // than during render — render must stay pure, and StrictMode's double
  // invocation would otherwise consume the previous position twice.
  const prevDriverRef = useRef<GeoPoint | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const driverLat = driver?.lat;
  const driverLng = driver?.lng;
  useEffect(() => {
    if (driverLat === undefined || driverLng === undefined) return;
    const here = { lat: driverLat, lng: driverLng };
    const prev = prevDriverRef.current;
    // Ignore GPS jitter: only re-derive heading once the car has actually
    // moved a few metres, otherwise the arrow spins on standstill noise.
    if (prev && (Math.abs(prev.lat - here.lat) > 1e-5 || Math.abs(prev.lng - here.lng) > 1e-5)) {
      setHeading(bearingDeg(prev, here));
      prevDriverRef.current = here;
    } else if (!prev) {
      prevDriverRef.current = here;
    }
  }, [driverLat, driverLng]);

  // Grey out the part of the trip already driven, like Google Maps and Waze —
  // the remaining leg is what the user is actually reading. Split at the route
  // vertex nearest the car; without a driver position nothing is greyed.
  const splitIndex = (() => {
    if (!driver || tripRoute.length < 2) return 0;
    // A degree of longitude is shorter than a degree of latitude everywhere but
    // the equator, so compare in roughly-metric space or the nearest vertex is
    // biased east-west (~1.6x off at Warsaw's latitude).
    const lngScale = Math.cos((driver.lat * Math.PI) / 180);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < tripRoute.length; i++) {
      const dLat = tripRoute[i][0] - driver.lat;
      const dLng = (tripRoute[i][1] - driver.lng) * lngScale;
      const d = dLat * dLat + dLng * dLng;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  })();
  const travelledRoute = splitIndex > 0 ? tripRoute.slice(0, splitIndex + 1) : [];
  const remainingRoute = splitIndex > 0 ? tripRoute.slice(splitIndex) : tripRoute;

  // A heading derived from movement needs the car to move. Waiting at a light,
  // or on the very first fix of a shift, there is nothing to derive it from —
  // and that is exactly when the map was snapping back to north-up and drawing
  // the route off sideways, at the one moment the driver is actually studying
  // the junction. The road ahead points where the car is about to go, so read
  // the bearing off the route whenever movement can't supply one.
  const routeHeading = useMemo(() => {
    if (!driver || remainingRoute.length < 2) return null;
    // Skip vertices sitting on top of the car: OSM route lines are dense at
    // junctions, and a bearing taken across three metres is mostly GPS noise.
    const AHEAD_KM = 0.03;
    for (const [lat, lng] of remainingRoute) {
      if (haversineKm(driver.lat, driver.lng, lat, lng) >= AHEAD_KM) {
        return bearingDeg(driver, { lat, lng });
      }
    }
    return null;
    // remainingRoute is rebuilt on every render; its endpoints are what matter.
  }, [driver?.lat, driver?.lng, remainingRoute.length, remainingRoute[0]?.[0], remainingRoute[0]?.[1]]);

  // Movement wins when there is any: it says which way the car physically
  // points, where the route only says which way it ought to.
  const navHeading = heading ?? routeHeading;

  // Following the car is the default; a drag or a pinch suspends it, and the
  // "my location" button (which bumps focusNonce) turns it back on.
  const [following, setFollowing] = useState(true);
  useEffect(() => {
    if (focusNonce) setFollowing(true);
  }, [focusNonce]);

  return (
    // `isolate`: Leaflet numbers its own panes up to 1000, and nothing between
    // them and <body> made a stacking context — so a fixed overlay elsewhere in
    // the app lost to the map and simply never appeared. Toasts were invisible
    // on every screen with a map. Keeping the map's numbering to itself is the
    // fix; the app's own layers are in tailwind.config.js.
    <div className={`relative isolate overflow-hidden ${className ?? 'h-full w-full rounded-card'}`}>
      {/* "Recalculating" only on a genuine reroute — a route already existed and
          is being rebuilt after the driver moved off it. Not shown for the very
          first route fetch, where the line is simply appearing. */}
      {recalculating && navRoad && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-map flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/75 px-3 py-1.5 text-xs font-medium text-white shadow-card">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          {recalcLabel}
        </div>
      )}
      <LeafletMap
        center={[center.lat, center.lng]}
        zoom={14}
        zoomControl={false}
        attributionControl={false}
        // Rotation is real now, so dragging no longer lies about which way the
        // finger went and there is nothing to hide by disabling it. A driver
        // who wants to look up the road ahead can.
        dragging
        rotate
        rotateControl={false}
        touchRotate={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          subdomains={['a', 'b', 'c']}
        />
        <SizeInvalidator />
        <NavZoom active={navMode} />
        <RotateMap heading={navHeading} active={navMode} />
        <FollowPauser onUserMove={() => setFollowing(false)} />
        <Recenter
          center={focus ?? driver ?? pickup ?? center}
          nonce={focusNonce}
          heading={navHeading}
          navMode={navMode && !!driver}
          enabled={following}
        />
        {onMapClick && <ClickCapture onClick={onMapClick} />}
        {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pin('#2979FF', true)} />}
        {stops.map((s, i) => (
          <Marker key={`stop-${i}`} position={[s.lat, s.lng]} icon={pin('#FFAB00')} />
        ))}
        {destination && (
          <Marker
            position={[destination.lat, destination.lng]}
            icon={pin('#FF1744')}
            draggable={!!onDestinationDrag}
            eventHandlers={
              onDestinationDrag
                ? {
                    dragend: (e) => {
                      const ll = e.target.getLatLng();
                      onDestinationDrag({ lat: ll.lat, lng: ll.lng });
                    },
                  }
                : undefined
            }
          />
        )}
        {nearbyDrivers.map((d) => (
          <Marker key={d.uid} position={[d.location.lat, d.location.lng]} icon={carIcon(true)} />
        ))}
        {driver && (
          <Marker position={[driver.lat, driver.lng]} icon={carIcon(false, navHeading, driverStale)} />
        )}
        {/* Distinct from the pickup pin (also blue): the user's own position is
            violet, so a driver testing against their own pickup point can still
            tell the two apart. */}
        {me && <Marker position={[me.lat, me.lng]} icon={pin('#7C4DFF', true)} zIndexOffset={500} />}
        {heatmap.map((h, i) => (
          <Circle
            key={`heat-${i}`}
            center={[h.lat, h.lng]}
            radius={500}
            pathOptions={{
              color: heatColor(h.weight),
              fillColor: heatColor(h.weight),
              fillOpacity: Math.min(0.5, 0.15 + h.weight * 0.07),
              weight: 1,
            }}
          />
        ))}
        {approachRoute.length >= 2 && (
          <Polyline positions={approachRoute} pathOptions={{ color: '#0F6E56', weight: 4 }} />
        )}
        {travelledRoute.length >= 2 && (
          <Polyline
            positions={travelledRoute}
            pathOptions={{ color: '#9E9E9E', weight: 4, opacity: 0.55, lineCap: 'round' }}
          />
        )}
        {remainingRoute.length >= 2 && (
          <Polyline
            positions={remainingRoute}
            pathOptions={{
              // Distinct from the emerald approach leg and from the emerald
              // primary color used elsewhere in the UI.
              color: '#00B8D4',
              weight: 4,
              // Dashed when shown alongside the approach leg, so the two
              // colors read as distinct legs even for red-green colorblind
              // users, not just via hue.
              dashArray: approachRoute.length >= 2 ? '1 10' : undefined,
              lineCap: 'round',
            }}
          />
        )}
      </LeafletMap>
    </div>
  );
}
