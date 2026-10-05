import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import i18n from '../i18n';

// Pi's ecosystem listing allows one way in: Pi authentication. The developer
// buttons are a second one — dead in production, since the server refuses
// them, but still on screen for anyone who tapped the logo five times or added
// ?dev to the address.

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn(), devLogin: vi.fn(), loading: false }),
}));

async function renderAuth(devBuild: boolean, search = '') {
  vi.stubEnv('DEV', devBuild);
  window.history.replaceState({}, '', `/${search}`);
  vi.resetModules();
  const { AuthScreen } = await import('./AuthScreen');
  return render(<AuthScreen />);
}

beforeAll(async () => {
  await i18n.changeLanguage('en');
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

describe('AuthScreen sign-in options', () => {
  it('offers only Pi sign-in in the build people use, even with ?dev', async () => {
    await renderAuth(false, '?dev');

    expect(screen.getByText(i18n.t('auth.login'))).toBeTruthy();
    expect(screen.queryByText(i18n.t('auth.devPassenger'))).toBeNull();
    expect(screen.queryByText(i18n.t('auth.devDriver'))).toBeNull();
  });

  it('ignores the five-tap shortcut in the build people use', async () => {
    const { container } = await renderAuth(false);
    const logoTile = container.querySelector('.rounded-3xl') as HTMLElement;

    for (let i = 0; i < 5; i++) fireEvent.click(logoTile);

    expect(localStorage.getItem('taxi_pro_dev')).toBeNull();
  });

  it('still shows the developer buttons in a dev build', async () => {
    await renderAuth(true, '?dev');

    expect(screen.getByText(i18n.t('auth.devPassenger'))).toBeTruthy();
  });
});
