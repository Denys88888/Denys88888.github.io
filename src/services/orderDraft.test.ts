import { describe, it, expect, afterEach } from 'vitest';
import { loadOrderDraft, saveOrderDraft, clearOrderDraft } from './orderDraft';

// App.tsx unmounts PassengerHomeScreen entirely on any tab switch (<Active />
// swaps the whole component), so without this the order form's pickup/
// destination/stops/vehicle vanished the moment a passenger glanced at
// History or Profile mid-booking. This is the persistence layer that survives
// that unmount; PassengerHomeScreen wires it into useState initializers +
// a save effect + a clear-on-order-success call.
describe('orderDraft', () => {
  afterEach(() => sessionStorage.clear());

  it('returns null when nothing was ever saved', () => {
    expect(loadOrderDraft()).toBeNull();
  });

  it('round-trips exactly what was saved', () => {
    const draft = {
      pickup: { lat: 52.23, lng: 21.01 },
      destination: { lat: 52.24, lng: 21.02 },
      stops: [{ lat: 52.235, lng: 21.015 }],
      vehicle: 'comfort' as const,
    };
    saveOrderDraft(draft);
    expect(loadOrderDraft()).toEqual(draft);
  });

  it('clears for real, not just to an empty-looking value', () => {
    saveOrderDraft({ pickup: { lat: 1, lng: 1 }, destination: null, stops: [], vehicle: 'economy' });
    clearOrderDraft();
    expect(loadOrderDraft()).toBeNull();
  });

  it('does not throw on corrupt storage — the form just starts blank', () => {
    sessionStorage.setItem('taxipro_order_draft', '{not json');
    expect(loadOrderDraft()).toBeNull();
  });
});
