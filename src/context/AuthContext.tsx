import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAppStore } from '../store/useAppStore';
import { api } from '../services/api';
import { wsService } from '../services/wsService';
import { authenticateWithPi, initPi } from '../services/piSdk';

interface AuthCtx {
  login: () => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);

// Owns session lifecycle: restores an existing token (connects the WebSocket +
// fetches server health), and exposes Pi login / logout.
export function AuthProvider({ children }: { children: ReactNode }) {
  const token = useAppStore((s) => s.token);
  const setAuth = useAppStore((s) => s.setAuth);
  const storeLogout = useAppStore((s) => s.logout);
  const setHealth = useAppStore((s) => s.setHealth);
  const addToast = useAppStore((s) => s.addToast);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    initPi();
    api.health().then(setHealth).catch(() => {
      /* backend may be cold-starting; health is non-critical */
    });
  }, [setHealth]);

  // Connect / disconnect the WebSocket as the token changes.
  useEffect(() => {
    if (token) wsService.connect(token);
    else wsService.disconnect();
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
      addToast('error', err instanceof Error ? err.message : 'Login failed');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = (): void => {
    wsService.disconnect();
    storeLogout();
  };

  return <Ctx.Provider value={{ login, logout, loading }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
