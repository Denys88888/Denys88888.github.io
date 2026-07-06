import type { GeoPoint } from '../types';

export function isValidCoord(p: Partial<GeoPoint> | null | undefined): p is GeoPoint {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    p.lat >= -90 &&
    p.lat <= 90 &&
    p.lng >= -180 &&
    p.lng <= 180
  );
}

export function isNonEmpty(s: string | undefined | null): s is string {
  return !!s && s.trim().length > 0;
}

export function isValidPlate(plate: string): boolean {
  return /^[A-Za-z0-9\s-]{2,12}$/.test(plate.trim());
}

export function isValidPhone(phone: string): boolean {
  return /^\+?[0-9\s-]{6,18}$/.test(phone.trim());
}

// Enforce the 500-char chat limit and strip ASCII control characters
// (below space, except newline). Avoids a control-char regex literal.
export function clampMessage(text: string, max = 500): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code >= 32 || ch === '\n' || ch === '\t') out += ch;
  }
  return out.slice(0, max);
}
