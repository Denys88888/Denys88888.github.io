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
  // 502/503 are a different animal: the Render instance hibernates and drops the
  // first requests back with `x-render-routing: hibernate-wake-error`. Neither
  // says anything about auth, and reporting either as "dev login failed" sent
  // every past investigation off after the wrong thing.
  for (let attempt = 0; ; attempt++) {
    const res = await request.post(`${API}/api/auth/dev`, { data: { name, role } });
    if (res.ok()) return res.json();
    const status = res.status();
    // A Cloudflare challenge is not something waiting out will clear, and it is
    // not our limiter either — it is the edge deciding this IP looks like a bot.
    // Retrying it burns two minutes and then reports "rate limited", which reads
    // as an app problem and is not one. Say what it actually is and stop.
    if (!RETRYABLE.has(status) || challenged(res.headers()) || attempt === 3) {
      throw new Error(`dev login failed for ${name}: ${status} ${describe(res.headers())}`);
    }
    await new Promise((r) => setTimeout(r, backoffMs(res.headers(), status, attempt)));
  }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

const waking = (h: Record<string, string>): boolean =>
  (h['x-render-routing'] ?? '').includes('hibernate');

/** Cloudflare's managed challenge, served as a 429 with an HTML interstitial. */
const challenged = (h: Record<string, string>): boolean =>
  !!h['cf-mitigated'] || (h['content-type'] ?? '').includes('text/html');

/** Why the call failed, in the terms that point at the right thing to fix. */
function describe(h: Record<string, string>): string {
  if (challenged(h)) return 'blocked by the Cloudflare edge (this IP is being challenged)';
  if (waking(h)) return 'the API was hibernating and did not wake in time';
  return "the API's own rate limiter";
}

/** How long to hold off: what the limiter says, or a short wake-up wait. */
function backoffMs(headers: Record<string, string>, status: number, attempt: number): number {
  if (status === 429) {
    const resetSec = Number(headers['ratelimit-reset'] ?? headers['retry-after']);
    const waitMs = Number.isFinite(resetSec) && resetSec > 0 ? resetSec * 1000 : 30_000;
    return Math.min(waitMs, 60_000) + 500;
  }
  // Waking takes tens of seconds, so climb rather than hammer a booting process.
  return Math.min(3_000 * 2 ** attempt, 20_000);
}

/**
 * Run an API call, retrying the statuses that mean "the platform, not the app".
 *
 * Used by the setup steps a test depends on but is not testing — a hibernating
 * instance dropping `POST /drivers/online` should not read as "driver could not
 * go online", which is a claim about the app.
 */
export async function withWakeRetry(
  call: () => Promise<import('@playwright/test').APIResponse>,
  attempts = 4
): Promise<import('@playwright/test').APIResponse> {
  let res = await call();
  for (let attempt = 0; attempt < attempts - 1 && !res.ok() && RETRYABLE.has(res.status()); attempt++) {
    await new Promise((r) => setTimeout(r, backoffMs(res.headers(), res.status(), attempt)));
    res = await call();
  }
  return res;
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
