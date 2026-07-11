import { TOKEN_KEY, USER_KEY } from './utils/constants';

// E2E-only session injection. Compiled in only when the build sets VITE_E2E=1;
// production builds never define it, so this module is dead-code-eliminated.
// Must be imported before any module that reads auth state at import time
// (useAppStore initializes from localStorage during module evaluation).
if (import.meta.env.VITE_E2E === '1') {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('e2eToken');
  const user = params.get('e2eUser');
  if (token && user) {
    try { localStorage.setItem(TOKEN_KEY, token); } catch { /* private browsing / quota */ }
    try { localStorage.setItem(USER_KEY, user); } catch { /* private browsing / quota */ }
  }
}

export {};
