import { create } from 'zustand';

// A minimal screen router (react-router isn't part of the stack). Screens are
// identified by name; params carry route data such as a rideId or chatId.
export type ScreenName =
  | 'home'
  | 'driver'
  | 'ride'
  | 'chat'
  | 'history'
  | 'profile'
  | 'register'
  | 'earnings'
  | 'admin';

interface HistoryEntry {
  screen: ScreenName;
  params: Record<string, string>;
}

interface RouterState {
  screen: ScreenName;
  params: Record<string, string>;
  navigate: (screen: ScreenName, params?: Record<string, string>) => void;
  back: () => void;
  history: HistoryEntry[];
}

// back() restores the PARAMS a screen was pushed with (not just its name) —
// otherwise returning to a params-driven screen (RideDetails needing an id,
// Chat needing a chatId) loses that id and falls back to whatever global
// state happens to be around, which is wrong for any ride that isn't the
// single globally-tracked "current" one (e.g. a completed ride opened from
// History).
export const useRouter = create<RouterState>((set, get) => ({
  screen: 'home',
  params: {},
  history: [],
  navigate: (screen, params = {}) =>
    set((s) => {
      if (screen === s.screen && Object.keys(params).length === 0) return s;
      return { screen, params, history: [...s.history, { screen: s.screen, params: s.params }] };
    }),
  back: () => {
    const hist = get().history;
    if (hist.length === 0) {
      set({ screen: 'home', params: {} });
      return;
    }
    const prev = hist[hist.length - 1];
    set({ screen: prev.screen, params: prev.params, history: hist.slice(0, -1) });
  },
}));
