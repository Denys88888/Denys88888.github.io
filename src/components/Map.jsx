import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Decide tile layer based on time (night = dark tiles, day = light tiles)
function getTileUrl() {
  const hour = new Date().getHours();
  return hour >= 19 || hour < 6
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
}

// Simple car SVG marker for driver icons
const CAR_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="15" fill="#7B5EA7" stroke="white" stroke-width="2"/>
  <text x="16" y="21" text-anchor="middle" font-size="16">🚗</text>
</svg>`;
const carIcon = L.divIcon({ className: '', html: CAR_SVG, iconSize: [32, 32], iconAnchor: [16, 16] });

const PICKUP_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <circle cx="14" cy="14" r="13" fill="#22C55E" stroke="white" stroke-width="2"/>
  <text x="14" y="19" text-anchor="middle" font-size="14">📍</text>
</svg>`;
const pickupIcon = L.divIcon({ className: '', html: PICKUP_SVG, iconSize: [28, 28], iconAnchor: [14, 28] });

const DROP_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28">
  <circle cx="14" cy="14" r="13" fill="#EF4444" stroke="white" stroke-width="2"/>
  <text x="14" y="19" text-anchor="middle" font-size="14">🏁</text>
</svg>`;
const dropIcon = L.divIcon({ className: '', html: DROP_SVG, iconSize: [28, 28], iconAnchor: [14, 28] });

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
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef({});
  const polylineRef = useRef(null);
  const tileRef = useRef(null);

  // Init map once
  useEffect(() => {
    if (mapRef.current || !containerRef.current) return;

    const map = L.map(containerRef.current, {
      center,
      zoom,
      zoomControl: false,
      attributionControl: false,
    });

    tileRef.current = L.tileLayer(getTileUrl(), { maxZoom: 19 }).addTo(map);

    if (onMapClick) map.on('click', e => onMapClick(e.latlng));
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []); // eslint-disable-line

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

  // Animate driver marker smoothly
  useEffect(() => {
    if (!mapRef.current || !driverLocation) return;
    if (markersRef.current.driver) {
      markersRef.current.driver.setLatLng([driverLocation.lat, driverLocation.lng]);
    } else {
      markersRef.current.driver = L.marker([driverLocation.lat, driverLocation.lng], { icon: carIcon })
        .addTo(mapRef.current);
    }
  }, [driverLocation?.lat, driverLocation?.lng]); // eslint-disable-line

  // Draw route polyline
  useEffect(() => {
    if (!mapRef.current) return;
    polylineRef.current?.remove();
    if (routeCoords?.length) {
      polylineRef.current = L.polyline(routeCoords, { color: '#7B5EA7', weight: 4, opacity: 0.8, dashArray: '8, 4' })
        .addTo(mapRef.current);
      mapRef.current.fitBounds(polylineRef.current.getBounds(), { padding: [40, 40] });
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
