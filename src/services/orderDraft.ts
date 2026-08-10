import type { GeoPoint, VehicleType } from '../types';

// The order form's pickup/destination/stops/vehicle live in PassengerHomeScreen's
// own useState, and App.tsx unmounts that screen entirely on any tab switch
// (`<Active />` swaps the whole component, it doesn't just hide it) — so
// stepping into History or Profile to check something and coming back wiped
// out whatever the passenger had already picked. Address search in particular
// is the slowest part of ordering a ride; losing it on an incidental tab away
// is the kind of thing that makes people give up partway through.
//
// sessionStorage, not localStorage: a draft is worth restoring within the
// session it was typed in, not days later with coordinates that may no longer
// make sense.
const KEY = 'taxipro_order_draft';

interface OrderDraft {
  pickup: GeoPoint | null;
  destination: GeoPoint | null;
  stops: GeoPoint[];
  vehicle: VehicleType;
}

export function loadOrderDraft(): OrderDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as OrderDraft) : null;
  } catch {
    return null; // corrupt or inaccessible storage — start from a blank form
  }
}

export function saveOrderDraft(draft: OrderDraft): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft));
  } catch {
    /* storage full/blocked — the form just won't survive a tab switch this time */
  }
}

export function clearOrderDraft(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* nothing to clean up if this throws */
  }
}
