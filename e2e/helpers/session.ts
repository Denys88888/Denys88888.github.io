import type { APIRequestContext, Page } from '@playwright/test';

export const API = process.env.E2E_API_URL || 'https://taxi-pro-server.onrender.com';
export const BASE = process.env.E2E_BASE_URL || 'http://localhost:5199';

export interface DevSession {
  token: string;
  user: { uid: string; role: string; name: string };
}

// Logging in is rate limited to 10 attempts a minute per IP, and the whole CI
// job is one IP. Every test that logs in again for a name it already used spends
// part of that budget for nothing, so the sessions are kept for the life of the
// worker. Retries reuse the same process, which is exactly when the budget is
// thinnest.
const sessions = new Map<string, Promise<DevSession>>();

/**
 * Mint a dev session against the API. Dev auth derives the uid from the name,
 * so a per-test name gives a per-test account — important here because the
 * server allows one active ride per passenger, and a leftover ride from another
 * test would surface as a confusing 409 rather than a clear failure.
 */
export function devLogin(
  request: APIRequestContext,
  name: string,
  role: 'passenger' | 'driver' = 'passenger'
): Promise<DevSession> {
  const key = `${name}:${role}`;
  const existing = sessions.get(key);
  if (existing) return existing;
  const minted = mintSession(request, name, role).catch((err) => {
    sessions.delete(key);
    throw err;
  });
  sessions.set(key, minted);
  return minted;
}

async function mintSession(
  request: APIRequestContext,
  name: string,
  role: 'passenger' | 'driver'
): Promise<DevSession> {
  // Two workers plus retries can still crowd the limiter even with the cache.
  // A 429 is the server working as intended, so wait it out rather than failing
  // the run. The limiter sends standard headers, so it says when the window
  // rolls — guessing would either give up too early or idle for a full minute.
  for (let attempt = 0; ; attempt++) {
    const res = await request.post(`${API}/api/auth/dev`, { data: { name, role } });
    if (res.ok()) return res.json();
    if (res.status() !== 429 || attempt === 2) {
      throw new Error(`dev login failed for ${name}: ${res.status()} ${await res.text()}`);
    }
    const resetSec = Number(res.headers()['ratelimit-reset'] ?? res.headers()['retry-after']);
    const waitMs = Number.isFinite(resetSec) && resetSec > 0 ? resetSec * 1000 : 30_000;
    await new Promise((r) => setTimeout(r, Math.min(waitMs, 60_000) + 500));
  }
}

/**
 * Open the app already signed in as `session`.
 *
 * Goes through ?e2eToken/?e2eUser, which src/e2eInit.ts reads into localStorage
 * before the store initializes — and which only exists when the dev server was
 * started with VITE_E2E=1 (playwright.config.ts does that).
 */
export async function openAs(page: Page, session: DevSession, path = ''): Promise<void> {
  // A signed-in session still lands on the onboarding carousel, which renders
  // ahead of the app for anyone who hasn't dismissed it — so a test would sit
  // on "Book rides with Pi" waiting for a screen it can never reach.
  await page.addInitScript(() => {
    try {
      localStorage.setItem('taxi_pro_onboarded', '1');
    } catch {
      /* private mode — the carousel just shows, and the test will say so */
    }
  });
  const url = new URL(`${BASE}${path}`);
  url.searchParams.set('e2eToken', session.token);
  url.searchParams.set('e2eUser', JSON.stringify(session.user));
  await page.goto(url.toString());
}

/** Authorization header for direct API calls as this session. */
export function auth(session: DevSession): Record<string, string> {
  return { Authorization: `Bearer ${session.token}` };
}

/**
 * Leave no active ride behind: the one-active-ride rule would make the next
 * test's create fail with a 409 that looks nothing like the real problem.
 */
export async function cancelActiveRides(
  request: APIRequestContext,
  session: DevSession
): Promise<void> {
  for (const status of ['searching', 'assigned', 'arrived', 'in_progress']) {
    const res = await request.get(`${API}/api/rides?status=${status}&limit=10`, {
      headers: auth(session),
    });
    if (!res.ok()) continue;
    const { rides = [] } = await res.json();
    for (const ride of rides) {
      await request
        .post(`${API}/api/rides/${ride.id}/cancel`, {
          data: { reason: 'e2e cleanup' },
          headers: auth(session),
        })
        .catch(() => undefined);
    }
  }
}
