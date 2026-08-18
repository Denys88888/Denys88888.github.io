import { rmSync, writeFileSync } from 'node:fs';
import { request, type APIRequestContext } from '@playwright/test';
import { ADMIN_NAME, ADMIN_UID, API, LOCAL_API } from './helpers/env';
import { ACCOUNTS, SESSIONS_FILE, sessionKey, type DevSession } from './helpers/session';

/**
 * Bring the API to a state the tests can start from, once, before any of them run.
 *
 * Three things have to be true and none of them is what any single test is about:
 * the API answers, the driver fixture is approved, and every account has a token.
 * Leaving them to whichever test happened to go first is what made failures read
 * as app bugs when they were nothing of the sort.
 *
 * Logins in particular: parallel workers each opening their own looked like a
 * burst to both the app's own limiter and, against the deployed API, to the
 * Cloudflare edge in front of it. One unhurried sequence here is never mistaken
 * for an attack, and the tokens last 24h so the workers just read them.
 */
async function globalSetup(): Promise<void> {
  // A previous run's file would otherwise be picked up whole. Against a local
  // API that is worse than having none: the store starts empty, so those tokens
  // verify and then name users who no longer exist.
  rmSync(SESSIONS_FILE, { force: true });

  const ctx = await request.newContext();
  try {
    if (!(await waitForApi(ctx))) return;
    if (LOCAL_API) await seedApprovedDriver(ctx);

    const minted: Record<string, DevSession> = {};
    for (const [name, role] of ACCOUNTS) {
      const session = await login(ctx, name, role);
      if (session) minted[sessionKey(name, role)] = session;
    }

    writeFileSync(SESSIONS_FILE, JSON.stringify(minted));
    console.log(`[e2e] signed in ${Object.keys(minted).length}/${ACCOUNTS.length} accounts`);
  } finally {
    await ctx.dispose();
  }
}

/** Sign in, waiting out the login limiter rather than giving the account up. */
async function login(
  ctx: APIRequestContext,
  name: string,
  role: string
): Promise<DevSession | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await ctx.post(`${API}/api/auth/dev`, { data: { name, role } });
    if (res.ok()) return (await res.json()) as DevSession;

    if (res.status() === 429) {
      // The limiter says when its window rolls; guessing would either give up
      // early or idle for a full minute on a run that needed two seconds.
      const reset = Number(res.headers()['ratelimit-reset'] ?? res.headers()['retry-after']);
      const waitMs = Number.isFinite(reset) && reset > 0 ? Math.min(reset * 1000, 60_000) : 20_000;
      await sleep(waitMs + 500);
      continue;
    }
    // Anything else is not going to change by asking again.
    console.warn(`[e2e] could not sign in ${name} (${role}): ${res.status()}`);
    return null;
  }
  // Don't abort the run: a test whose account is missing mints its own, and the
  // one that then fails is the one that says so.
  console.warn(`[e2e] could not sign in ${name} (${role}): still rate limited`);
  return null;
}

/**
 * Make the shared driver fixture an approved driver on a store that starts empty.
 *
 * Approval is an admin decision, so this goes the way a real one does: an account
 * ADMIN_UIDS promotes calls the same verify endpoint the admin console calls.
 * Nothing reaches into the database, which means the seeding also exercises —
 * and would notice the breakage of — driver registration and admin approval.
 */
async function seedApprovedDriver(ctx: APIRequestContext): Promise<void> {
  const admin = await login(ctx, ADMIN_NAME, 'passenger');
  const driver = await login(ctx, DRIVER_FIXTURE_NAME, 'driver');
  if (!admin || !driver) {
    console.warn('[e2e] could not seed the driver fixture — no admin or driver session');
    return;
  }
  if (admin.user.role !== 'admin') {
    console.warn(
      `[e2e] ${ADMIN_NAME} came back as '${admin.user.role}', not admin — ` +
        `the API needs ADMIN_UIDS=${ADMIN_UID}`
    );
    return;
  }

  const bearer = (s: DevSession) => ({ Authorization: `Bearer ${s.token}` });

  // 409 means already approved, which is exactly the state we want.
  const registered = await ctx.post(`${API}/api/drivers/register`, {
    headers: bearer(driver),
    data: {
      vehicleType: 'economy',
      brand: 'Toyota',
      model: 'Corolla',
      color: 'White',
      number: 'E2E-001',
      vehicleYear: 2018,
      seats: 4,
    },
  });
  if (!registered.ok() && registered.status() !== 409) {
    console.warn(`[e2e] driver registration failed: ${registered.status()}`);
    return;
  }

  const verified = await ctx.post(`${API}/api/admin/drivers/${driver.user.uid}/verify`, {
    headers: bearer(admin),
    data: { approve: true },
  });
  console.log(
    verified.ok()
      ? `[e2e] ${DRIVER_FIXTURE_NAME} approved and ready to go online`
      : `[e2e] could not approve ${DRIVER_FIXTURE_NAME}: ${verified.status()}`
  );
}

/** The driver the ride tests share; approval is per-account, so it is one name. */
const DRIVER_FIXTURE_NAME = 'TestDriver';

/** Poll until the API is serving — a local boot, or a hibernating instance. */
async function waitForApi(ctx: APIRequestContext): Promise<boolean> {
  // A local server is up in seconds or not at all; the deployed one wakes slowly.
  const deadline = Date.now() + (LOCAL_API ? 30_000 : 120_000);
  let last = '';

  while (Date.now() < deadline) {
    try {
      const res = await ctx.get(`${API}/api/health`, { timeout: 15_000 });
      if (res.ok()) {
        const body = await res.json();
        console.log(
          `[e2e] API ready at ${API} — store ${body.store}${body.commit ? `, commit ${body.commit}` : ''}`
        );
        return true;
      }
      last = `${res.status()} ${res.headers()['x-render-routing'] ?? ''}`.trim();
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    await sleep(2_000);
  }
  // Running anyway: a suite that fails on the test which needed the API says
  // more than one that dies in setup with no indication of what was broken.
  console.warn(`[e2e] API at ${API} never answered (last: ${last}) — running anyway`);
  return false;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export default globalSetup;
