import { create } from 'zustand';

const useStore = create((set, get) => ({
  // ── Auth ──────────────────────────────────────────────────────────
  user: null,          // Pi user + profile from our DB
  token: null,         // JWT from our server
  authLoading: true,

  // ── UI ────────────────────────────────────────────────────────────
  mode: 'passenger',   // 'passenger' | 'driver'
  screen: 'home',      // see SCREENS constant below
  theme: localStorage.getItem('taxipro_theme') || 'emerald',

  // ── Ride (passenger view) ─────────────────────────────────────────
  pickup: null,        // { lat, lng, name, address }
  dropoff: null,
  route: null,         // { distanceKm, durationMin, coordinates }
  fare: null,
  surgeMultiplier: 1.0,
  promoDiscount: null,
  ride: null,          // ride object from server
  driverInfo: null,    // driver details when assigned
  driverLocation: null,

  // ── Driver state ──────────────────────────────────────────────────
  isDriverOnline: false,
  currentOffer: null,  // incoming ride offer { rideId, ride, expiresIn }
  offerTimer: null,    // seconds remaining on offer countdown

  // ── Chat ──────────────────────────────────────────────────────────
  unreadChat: 0,       // unread messages while the chat drawer is closed

  // ── Actions ───────────────────────────────────────────────────────
  setUser: user => set({ user }),
  setToken: token => set({ token }),
  setAuthLoading: v => set({ authLoading: v }),

  setMode: mode => set({ mode, screen: mode === 'driver' ? 'driver-home' : 'home' }),
  setScreen: screen => set({ screen }),
  setTheme: theme => {
    localStorage.setItem('taxipro_theme', theme);
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme;
    document.documentElement.classList.remove('dark', 'light', 'emerald');
    document.documentElement.classList.add(resolved);
    document.documentElement.setAttribute('data-theme', resolved);
    set({ theme });
  },

  setPickup: pickup => set({ pickup }),
  setDropoff: dropoff => set({ dropoff }),
  setRoute: route => set({ route }),
  setFare: fare => set({ fare }),
  setSurgeMultiplier: v => set({ surgeMultiplier: v }),
  setPromoDiscount: v => set({ promoDiscount: v }),
  setRide: ride => set({ ride }),
  setDriverInfo: driverInfo => set({ driverInfo }),
  setDriverLocation: loc => set({ driverLocation: loc }),

  setIsDriverOnline: v => set({ isDriverOnline: v }),
  setCurrentOffer: offer => set({ currentOffer: offer }),
  setOfferTimer: v => set({ offerTimer: v }),

  bumpUnread: () => set(s => ({ unreadChat: s.unreadChat + 1 })),
  clearUnread: () => set({ unreadChat: 0 }),

  clearRide: () => set({
    ride: null, driverInfo: null, driverLocation: null,
    route: null, fare: null, surgeMultiplier: 1.0, promoDiscount: null,
    pickup: null, dropoff: null, currentOffer: null, offerTimer: null, unreadChat: 0,
    screen: get().mode === 'driver' ? 'driver-home' : 'home',
  }),
}));

export default useStore;
