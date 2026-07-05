import { useEffect, useState } from 'react';
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
import type { GeoPoint, HeatmapPoint } from '../../types';
import { fetchRoute } from '../../services/mapService';

// Colored pin built from a divIcon so we don't depend on Leaflet's image assets
// (which break under a non-root base path on GitHub Pages).
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

// Recenter the map imperatively when the focus point changes. `nonce` lets a
// "my location" button force a recenter even when the coordinates are unchanged.
function Recenter({ center, nonce }: { center: GeoPoint; nonce?: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: true });
  }, [center.lat, center.lng, nonce, map]);
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
  // The user's own live GPS position — rendered as a pulsing blue dot.
  me?: GeoPoint | null;
  // One-off recenter target (e.g. the "my location" button); bump focusNonce
  // to re-trigger with unchanged coordinates.
  focus?: GeoPoint | null;
  focusNonce?: number;
  // Demand hotspots (driver map): translucent colored circles.
  heatmap?: HeatmapPoint[];
  stops?: GeoPoint[];
  onMapClick?: (p: GeoPoint) => void;
  // When provided, the destination pin is draggable and reports its new position.
  onDestinationDrag?: (p: GeoPoint) => void;
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
  focus,
  focusNonce,
  heatmap = [],
  stops = [],
  onMapClick,
  onDestinationDrag,
  className,
}: Props) {
  const waypoints: GeoPoint[] = [];
  if (pickup) waypoints.push(pickup);
  waypoints.push(...stops);
  if (destination) waypoints.push(destination);
  const waypointKey = waypoints.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';');

  // Road-following geometry from OSRM; until it arrives (or if it fails) the
  // straight waypoint line keeps the route visible.
  const [roadRoute, setRoadRoute] = useState<[number, number][] | null>(null);
  useEffect(() => {
    let stale = false;
    setRoadRoute(null);
    if (waypoints.length >= 2) {
      fetchRoute(waypoints).then((r) => {
        if (!stale && r) setRoadRoute(r.points);
      });
    }
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waypointKey]);

  const route: [number, number][] =
    roadRoute ?? waypoints.map((p) => [p.lat, p.lng] as [number, number]);

  return (
    <div className={className ?? 'h-full w-full overflow-hidden rounded-card'}>
      <LeafletMap
        center={[center.lat, center.lng]}
        zoom={14}
        zoomControl={false}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          subdomains={['a', 'b', 'c']}
        />
        <SizeInvalidator />
        <Recenter center={focus ?? driver ?? pickup ?? center} nonce={focusNonce} />
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
        {driver && <Marker position={[driver.lat, driver.lng]} icon={pin('#00C853')} />}
        {me && <Marker position={[me.lat, me.lng]} icon={pin('#2979FF', true)} zIndexOffset={500} />}
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
        {route.length >= 2 && (
          <Polyline positions={route} pathOptions={{ color: '#7B3FE4', weight: 4 }} />
        )}
      </LeafletMap>
    </div>
  );
}
