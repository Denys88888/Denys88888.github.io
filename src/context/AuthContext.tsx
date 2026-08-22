import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isAxiosError } from 'axios';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { wsService } from '../services/wsService';
import { authenticateWithPi, ensurePiPayments, initPi } from '../services/piSdk';
import { initNotifications } from '../services/notificationService';
import { apiErrorKey } from '../utils/apiError';

interface AuthCtx {
  login: () => Promise<void>;
  devLogin: (name: string, role?: 'passenger' | 'driver' | 'admin') => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

// Owns session lifecycle: restores an existing token (connects the WebSocket +
// fetches server health), and exposes Pi login / logout.
export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useAppStore((s) => s.token);
  const user = useAppStore((s) => s.user);
  const setAuth = useAppStore((s) => s.setAuth);
  const storeLogout = useAppStore((s) => s.logout);
  const setHealth = useAppStore((s) => s.setHealth);
  const addToast = useAppStore((s) => s.addToast);
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  // The login screen is the one place where a failure has to explain itself: a
  // driver who cannot get in has no app at all, and no other screen to read.
  // Axios' own text ("Request failed with status code 503") is English, and
  // untranslated, and says nothing a driver can act on. Errors thrown by the Pi
  // SDK keep their own wording — "user cancelled" is more use than any of ours.
  const authErrorMessage = (err: unknown, fallback: string): string => {
    if (isAxiosError(err)) return t(apiErrorKey(err));
    return err instanceof Error && err.message ? err.message : fallback;
  };

  useEffect(() => {
    initPi();
    api.health().then(setHealth).catch((err) => {
      console.error('[auth] health check (non-critical, server may be cold-starting):', err);
    });
  }, [setHealth]);

  // A session restored from storage never went through Pi.authenticate, and the
  // SDK will not create a payment for an instance that hasn't — so the fare, a
  // tip and the cancellation fee all failed for anyone who simply reopened the
  // app. Arming it here rather than from a pay button keeps the click's user
  // activation intact. Dev logins have no Pi identity to authenticate.
  const uid = user?.uid;
  useEffect(() => {
    if (!uid || uid.startsWith('dev_')) return;
    ensurePiPayments().catch((err) => {
      console.error('[auth] Pi payments unavailable until re-login:', err);
    });
  }, [uid]);

  // Connect / disconnect the WebSocket as the token changes.
  useEffect(() => {
    if (token) {
      wsService.connect(token);
      initNotifications();
    } else {
      wsService.disconnect();
    }
  }, [token]);

  // The server closes the socket with 1008 when the JWT is rejected (expired /
  // revoked). Treat that as a hard logout so the UI returns to the login screen.
  useEffect(
    () =>
      wsService.on('__close', ({ code }) => {
        if (code === 1008 && useAppStore.getState().token) {
          wsService.disconnect();
          storeLogout();
        }
      }),
    [storeLogout]
  );

  const login = async (): Promise<void> => {
    setLoading(true);
    try {
      const piResult = await authenticateWithPi();
      const { token: jwt, user } = await api.piAuth(piResult.accessToken);
      setAuth(user, jwt);
    } catch (err) {
      addToast('error', authErrorMessage(err, t('common.error')));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const devLogin = async (name: string, role?: 'passenger' | 'driver' | 'admin'): Promise<void> => {
    setLoading(true);
    try {
      const { token: jwt, user } = await api.devAuth(name, role);
      setAuth(user, jwt);
    } catch (err) {
      addToast('error', authErrorMessage(err, t('common.error')));
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = (): void => {
    wsService.disconnect();
    storeLogout();
  };

  return <Ctx.Provider value={{ login, devLogin, logout, loading }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
