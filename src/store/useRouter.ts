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

interface RouterState {
  screen: ScreenName;
  params: Record<string, string>;
  navigate: (screen: ScreenName, params?: Record<string, string>) => void;
  back: () => void;
  history: ScreenName[];
}

export const useRouter = create<RouterState>((set, get) => ({
  screen: 'home',
  params: {},
  history: [],
  navigate: (screen, params = {}) =>
    set((s) => {
      if (screen === s.screen && Object.keys(params).length === 0) return s;
      return { screen, params, history: [...s.history, s.screen] };
    }),
  back: () => {
    const hist = get().history;
    if (hist.length === 0) {
      set({ screen: 'home', params: {} });
      return;
    }
    const prev = hist[hist.length - 1];
    set({ screen: prev, params: {}, history: hist.slice(0, -1) });
  },
}));
