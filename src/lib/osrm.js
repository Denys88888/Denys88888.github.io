// OSRM public routing API — free, no key needed
const BASE = 'http://router.project-osrm.org/route/v1/driving';

export async function getRoute(from, to) {
  const url = `${BASE}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('OSRM request failed');
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) throw new Error('No route found');
  return {
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    geometry: route.geometry, // GeoJSON LineString
    coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]), // Leaflet wants [lat, lng]
  };
}
