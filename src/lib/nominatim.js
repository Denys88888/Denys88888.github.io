// Nominatim geocoding — OpenStreetMap, free forever
const BASE = 'https://nominatim.openstreetmap.org';
const HEADERS = { 'Accept-Language': 'en', 'User-Agent': 'TaxiProApp/2.0' };

let _searchTimer = null;

export async function searchPlaces(query) {
  if (!query || query.length < 2) return [];
  const url = `${BASE}/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map(p => ({
    name: p.display_name.split(',').slice(0, 2).join(', '),
    fullName: p.display_name,
    lat: parseFloat(p.lat),
    lng: parseFloat(p.lon),
  }));
}

export function debouncedSearch(query, callback, delay = 400) {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(async () => {
    const results = await searchPlaces(query);
    callback(results);
  }, delay);
}

export async function reverseGeocode(lat, lng) {
  const url = `${BASE}/reverse?lat=${lat}&lon=${lng}&format=json`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.display_name) return null;
  return {
    name: data.address?.road || data.display_name.split(',')[0],
    fullName: data.display_name,
    address: [data.address?.road, data.address?.city || data.address?.town].filter(Boolean).join(', '),
    lat,
    lng,
  };
}
