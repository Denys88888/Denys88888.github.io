import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import i18n from '../i18n';
import { useAppStore } from '../store/useAppStore';
import { ProfileScreen } from './ProfileScreen';
import type { User } from '../types';

// Pi's ecosystem listing asks apps to collect only the data they need. A
// passenger's phone number was asked for here and then used by nothing: calls
// are in-app, and the other side of a ride never receives it. Drivers still
// give one — the admin contacts them about their application.

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ logout: vi.fn() }),
}));
vi.mock('../services/api', () => ({
  api: { publicSettings: () => Promise.resolve({}), updateProfile: vi.fn(), switchRole: vi.fn() },
}));
vi.mock('../services/piSdk', () => ({ piShare: vi.fn() }));
// The theme switch needs the app's ThemeProvider and matchMedia; neither is what this is about.
vi.mock('../components/ui/ThemeToggle', () => ({ ThemeToggle: () => null }));

function signIn(patch: Partial<User>) {
  useAppStore.getState().setAuth(
    { uid: 'u1', name: 'Ola', rating: 5, ratingCount: 1, isBlocked: false, role: 'passenger', ...patch } as unknown as User,
    'token'
  );
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

afterEach(cleanup);

describe('ProfileScreen phone number', () => {
  it('does not ask a passenger for one', () => {
    signIn({ role: 'passenger', phone: '+48500111222' });
    render(<ProfileScreen />);

    expect(screen.queryByLabelText(i18n.t('profile.phone'))).toBeNull();
    expect(screen.queryByText(/2222?$/)).toBeNull();
  });

  it('still asks a driver', () => {
    signIn({ role: 'driver' });
    render(<ProfileScreen />);

    expect(screen.getByLabelText(i18n.t('profile.phone'))).toBeTruthy();
  });

  it('still asks an approved driver who switched to riding', () => {
    signIn({ role: 'passenger', driverInfo: { applicationStatus: 'approved' } as User['driverInfo'] });
    render(<ProfileScreen />);

    expect(screen.getByLabelText(i18n.t('profile.phone'))).toBeTruthy();
  });
});
