import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import DOMPurify from 'dompurify';

// Tailwind-aware className combiner.
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// Sanitize any user-generated text before it touches the DOM (Rule 8).
export function sanitize(text: string): string {
  return DOMPurify.sanitize(text, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}

// Client-side mirror of the server fare model (services/fareCalculator.ts on the
// backend): total = (base + km * perKm + min * perMin) * surge, floored at
// minFare. Indicative only — the server computes the authoritative fare (admin
// settings can scale perKm / raise minFare at runtime).
const FARE_TABLE: Record<string, { base: number; perKm: number; perMin: number; minFare: number }> = {
  economy: { base: 1.0, perKm: 0.5, perMin: 0.1, minFare: 1.5 },
  comfort: { base: 1.5, perKm: 0.7, perMin: 0.12, minFare: 2.0 },
  business: { base: 2.5, perKm: 1.0, perMin: 0.18, minFare: 3.5 },
  xl: { base: 2.0, perKm: 0.9, perMin: 0.15, minFare: 3.0 },
};

export function estimateFare(
  vehicleType: string,
  distanceKm: number,
  durationMin: number,
  surge = 1
): number {
  const t = FARE_TABLE[vehicleType] ?? FARE_TABLE.economy;
  const raw = (t.base + distanceKm * t.perKm + durationMin * t.perMin) * (surge > 0 ? surge : 1);
  return Math.round(Math.max(raw, t.minFare) * 100) / 100;
}

// Great-circle distance in km (client-side estimate for UI only).
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Total path length in km across an ordered list of points (multi-stop routes).
export function routeDistanceKm(points: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineKm(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return total;
}

export function chatIdForRide(rideId: string): string {
  return `chat_${rideId}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
