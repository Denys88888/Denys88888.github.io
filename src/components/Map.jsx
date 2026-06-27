import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import useStore from '../store.js';

// Dark tiles for emerald/dark themes or at night; light tiles by day otherwise.
function getTileUrl(theme) {
  const hour = new Date().getHours();
  const dark = theme === 'emerald' || theme === 'dark' || hour >= 19 || hour < 6;
  return dark
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
}

// Read the active theme's accent for canvas-drawn elements (Leaflet polylines
// can't take a CSS var directly).
function accentColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#1FD884';
}

// Markers are HTML divIcons styled via globals.css so they re-theme automatically.
// Driver uses a directional arrow (rotates to heading); the <svg> is rotated in JS.
const DRIVER_HTML = '<div class="map-pin-driver"><svg viewBox="0 0 24 24" width="20" height="20"><path d="M12 2 L20 21 L12 16.5 L4 21 Z" fill="currentColor"/></svg></div>';
const carIcon = L.divIcon({ className: 'map-div-icon', html: DRIVER_HTML, iconSize: [40, 40], iconAnchor: [20, 20] });
const pickupIcon = L.divIcon({ className: 'map-div-icon', html: '<div class="map-pin-pickup"></div>', iconSize: [36, 36], iconAnchor: [18, 18] });
const dropIcon = L.divIcon({ className: 'map-div-icon', html: '<div class="map-pin-drop-wrap"><div class="map-pin-drop"></div></div>', iconSize: [30, 40], iconAnchor: [15, 36] });

// Initial compass bearing from point a to point b, in degrees (0 = north).
function bearing(a, b) {
  const toRad = d => (d * Math.PI) / 180;
  const dLng = toRad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(toRad(b.lat));
  const x = Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
            Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export default function Map({
  center = [48.8566, 2.3522],
  zoom = 14,
  pickup,
  dropoff,
  driverLocation,
  routeCoords,
  onlineDrivers = [],
  onMapClick,
  style,
}) {
  const theme = useStore(s => s.theme);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const polylineRef = useRef(null);
  const glowRef = useRef(null);
  const tileRef = useRef(null);
  const driverAnimRef = useRef(0);

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    tileRef.current = L.tileLayer(getTileUrl(theme), { maxZoom: 19 }).addTo(map);

    if (onMapClick) map.on('click', e => onMapClick(e.latlng));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line

  // Swap tiles when the theme changes (emerald/dark → dark tiles)
  useEffect(() => {
    if (tileRef.current) tileRef.current.setUrl(getTileUrl(theme));
  }, [theme]);

  // Update center when it changes
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setView(center, zoom, { animate: true });
  }, [center[0], center[1], zoom]); // eslint-disable-line

  // Update pickup marker
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.pickup?.remove();
    if (pickup) {
      markersRef.current.pickup = L.marker([pickup.lat, pickup.lng], { icon: pickupIcon })
        .addTo(mapRef.current);
    }
  }, [pickup?.lat, pickup?.lng]); // eslint-disable-line

  // Update dropoff marker
  useEffect(() => {
    if (!mapRef.current) return;
    markersRef.current.dropoff?.remove();
    if (dropoff) {
      markersRef.current.dropoff = L.marker([dropoff.lat, dropoff.lng], { icon: dropIcon })
        .addTo(mapRef.current);
    }
  }, [dropoff?.lat, dropoff?.lng]); // eslint-disable-line

  // Animate driver marker smoothly: interpolate position over ~1s with rAF and
  // rotate the arrow to the heading instead of jumping between GPS fixes.
  useEffect(() => {
    if (!mapRef.current || !driverLocation) return;
    const to = { lat: driverLocation.lat, lng: driverLocation.lng };

    if (!markersRef.current.driver) {
      markersRef.current.driver = L.marker([to.lat, to.lng], { icon: carIcon }).addTo(mapRef.current);
      return;
    }

    const marker = markersRef.current.driver;
    const fromLL = marker.getLatLng();
    const from = { lat: fromLL.lat, lng: fromLL.lng };
    const moved = Math.abs(to.lat - from.lat) + Math.abs(to.lng - from.lng);
    if (moved < 1e-7) return;

    // Rotate the arrow toward the direction of travel.
    const svg = marker.getElement()?.querySelector('svg');
    if (svg) svg.style.transform = `rotate(${bearing(from, to)}deg)`;

    // Interpolate position.
    cancelAnimationFrame(driverAnimRef.current);
    const duration = 1000;
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      marker.setLatLng([from.lat + (to.lat - from.lat) * t, from.lng + (to.lng - from.lng) * t]);
      if (t < 1) driverAnimRef.current = requestAnimationFrame(step);
    };
    driverAnimRef.current = requestAnimationFrame(step);

    return () => cancelAnimationFrame(driverAnimRef.current);
  }, [driverLocation?.lat, driverLocation?.lng]); // eslint-disable-line

  // Draw route polyline (glow underlay + crisp accent line on top)
  useEffect(() => {
    if (!mapRef.current) return;
    polylineRef.current?.remove();
    glowRef.current?.remove();
    if (routeCoords?.length) {
      const accent = accentColor();
      glowRef.current = L.polyline(routeCoords, { color: accent, weight: 12, opacity: 0.22, lineCap: 'round', lineJoin: 'round' })
        .addTo(mapRef.current);
      polylineRef.current = L.polyline(routeCoords, { color: accent, weight: 5, opacity: 0.95, lineCap: 'round', lineJoin: 'round' })
        .addTo(mapRef.current);
      mapRef.current.fitBounds(polylineRef.current.getBounds(), { padding: [50, 50] });
    }
  }, [routeCoords]); // eslint-disable-line

  // Online driver icons
  useEffect(() => {
    if (!mapRef.current) return;
    // Remove old online driver markers
    Object.entries(markersRef.current).forEach(([key, m]) => {
      if (key.startsWith('od_')) { m.remove(); delete markersRef.current[key]; }
    });
    onlineDrivers.forEach(driver => {
      if (driver.location) {
        markersRef.current[`od_${driver.id}`] = L.marker(
          [driver.location.lat, driver.location.lng], { icon: carIcon }
        ).addTo(mapRef.current);
      }
    });
  }, [onlineDrivers]); // eslint-disable-line

  return <div ref={containerRef} style={{ width: '100%', height: '100%', ...style }} />;
}
