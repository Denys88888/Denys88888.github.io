import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import i18n from '../i18n';
import { useAppStore } from '../store/useAppStore';
import type { User } from '../types';

// Both RideProvider and notificationService listen to 'ride_assigned'. Each
// used to toast "Driver found!", so the passenger got the same message twice on
// every ride — spotted in a screen recording, two green pills stacked.

const listeners = new Map<string, Set<(msg: Record<string, unknown>) => void>>();

vi.mock('../services/wsService', () => ({
  wsService: {
    on: (type: string, fn: (msg: Record<string, unknown>) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
      return () => listeners.get(type)?.delete(fn);
    },
  },
}));

vi.mock('../services/api', () => ({
  api: { getRide: () => Promise.resolve({ id: 'ride_1', status: 'assigned' }) },
}));

const { RideProvider } = await import('./RideContext');
const { initNotifications } = await import('../services/notificationService');

function signIn(uid: string, role: User['role']) {
  useAppStore.getState().setAuth({ uid, role, username: uid } as unknown as User, 'token');
}

function assign(driverId: string) {
  act(() => {
    listeners.get('ride_assigned')?.forEach((fn) => fn({ rideId: 'ride_1', driverId }));
  });
}

const toastTexts = () => useAppStore.getState().toasts.map((t) => t.message);

beforeAll(async () => {
  await i18n.changeLanguage('en');
  initNotifications();
});

beforeEach(() => {
  cleanup();
  useAppStore.setState({ toasts: [] });
});

describe('ride_assigned toasts', () => {
  it('tells the passenger once that a driver was found', () => {
    signIn('passenger_1', 'passenger');
    render(<RideProvider>{null}</RideProvider>);

    assign('driver_1');

    expect(toastTexts().filter((m) => m === 'Driver found!')).toHaveLength(1);
  });

  it('tells the driver their offer was accepted, and nothing about a driver being found', () => {
    signIn('driver_1', 'driver');
    render(<RideProvider>{null}</RideProvider>);

    assign('driver_1');

    expect(toastTexts()).toContain(i18n.t('driver.offerAccepted'));
    expect(toastTexts()).not.toContain('Driver found!');
  });
});
