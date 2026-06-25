// Dynamic fare calculation — all amounts in Pi
export const FARES = {
  BASE: 0.5,
  PER_KM: 0.3,
  PER_MIN: 0.05,
};

export function calcFare(distanceKm, durationMin, surgeMultiplier = 1.0) {
  const base = FARES.BASE + distanceKm * FARES.PER_KM + durationMin * FARES.PER_MIN;
  return Math.round(base * surgeMultiplier * 100) / 100;
}

// Returns surge multiplier based on number of nearby online drivers
export function getSurgeMultiplier(nearbyDriverCount) {
  return nearbyDriverCount < 3 ? 1.5 : 1.0;
}

export function applyPromoDiscount(fare, promo) {
  if (!promo) return fare;
  if (promo.type === 'percent') return Math.round(fare * (1 - promo.discount / 100) * 100) / 100;
  if (promo.type === 'fixed') return Math.max(0, Math.round((fare - promo.discount) * 100) / 100);
  return fare;
}

export function formatPi(amount) {
  return `${Number(amount).toFixed(2)} π`;
}
