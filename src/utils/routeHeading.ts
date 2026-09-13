import type { GeoPoint } from '../types';

// Compass bearing (degrees clockwise from north) from point a to point b.
export function bearingDeg(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const φ1 = toRad(a.lat);
  const φ2 = toRad(b.lat);
  const Δλ = toRad(b.lng - a.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (Math.atan2(y, x) * 180) / Math.PI;
}

const EARTH_RADIUS_M = 6371000;

// How far along the road to look. Long enough that the dense vertices OSRM
// puts at every junction don't turn a bearing into GPS noise, short enough
// that the map only starts turning for a corner as the car reaches it.
const LOOKAHEAD_M = 40;

// When the route passes the same spot twice — out along a street and back down
// it — both legs sit almost on top of the car. The one that comes first is the
// one being driven, so any segment within this much of the closest wins by
// order rather than by a metre of GPS error.
const SAME_ROAD_TOLERANCE_M = 10;

/**
 * The direction the route itself runs where the car is, as a compass bearing
 * in [0, 360) — the thing the driver's map puts at the top of the screen, so
 * the road ahead reads bottom-to-top. Null when there is no road left ahead.
 *
 * This is deliberately about the route and not about the car. The car is
 * projected onto the nearest segment and the bearing is read along the road
 * from there, so a fix that lands twenty metres off to the side still yields
 * the road's direction, not the direction from the car to some vertex.
 */
export function routeBearingAhead(
  route: [number, number][],
  car: GeoPoint,
  lookaheadM: number = LOOKAHEAD_M
): number | null {
  if (route.length < 2) return null;

  // Local flat metres centred on the car. At these distances the curvature
  // error is nothing, and it keeps a degree of longitude from counting as a
  // degree of latitude (a 1.6x distortion at Warsaw's latitude).
  const kx = EARTH_RADIUS_M * Math.cos((car.lat * Math.PI) / 180) * (Math.PI / 180);
  const ky = EARTH_RADIUS_M * (Math.PI / 180);
  const pts = route.map(([lat, lng]) => ({ x: (lng - car.lng) * kx, y: (lat - car.lat) * ky }));

  // Distance from the car (the origin) to each segment, and where on it the
  // car projects.
  const hits: Array<{ i: number; t: number; d: number }> = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) continue;
    const t = Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len2));
    hits.push({ i, t, d: Math.hypot(a.x + t * dx, a.y + t * dy) });
  }
  if (hits.length === 0) return null;

  const closest = Math.min(...hits.map((h) => h.d));
  const on = hits.find((h) => h.d <= closest + SAME_ROAD_TOLERANCE_M)!;

  const start = {
    x: pts[on.i].x + on.t * (pts[on.i + 1].x - pts[on.i].x),
    y: pts[on.i].y + on.t * (pts[on.i + 1].y - pts[on.i].y),
  };

  // Walk forward along the road from where the car sits on it. A corner inside
  // the lookahead gives a chord across it, which is what makes the turn come in
  // gradually instead of the map snapping round at the vertex.
  let cur = start;
  let end = start;
  let remaining = lookaheadM;
  for (let i = on.i; i < pts.length - 1 && remaining > 0; i++) {
    const to = pts[i + 1];
    const seg = Math.hypot(to.x - cur.x, to.y - cur.y);
    if (seg >= remaining) {
      const f = remaining / seg;
      end = { x: cur.x + (to.x - cur.x) * f, y: cur.y + (to.y - cur.y) * f };
      remaining = 0;
    } else {
      remaining -= seg;
      cur = to;
      end = to;
    }
  }

  const ex = end.x - start.x;
  const ey = end.y - start.y;
  // Under a metre of road left means the car is at the end of it; there is no
  // direction to show, and the map keeps whatever it was last given.
  if (Math.hypot(ex, ey) < 1) return null;
  // atan2(east, north) is a compass bearing.
  return ((Math.atan2(ex, ey) * 180) / Math.PI + 360) % 360;
}
