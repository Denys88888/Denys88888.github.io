import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

/**
 * Where the suite points, and why it is not production by default any more.
 *
 * Running against the deployed API looked convenient and cost the suite its
 * reliability twice over. The Render instance hibernates, so the first test
 * back wore a 502 and reported it as an auth failure. Worse, the Cloudflare
 * edge in front of it treats a burst of logins from one address as a bot and
 * answers with a `cf-mitigated: challenge` interstitial — on a GitHub runner
 * exactly as readily as on a laptop, which is what ruled out "it's just this
 * machine". Neither is a bug in the app, and no amount of back-off fixes an IP
 * the edge has decided against. Every run also wrote real rides into the
 * production store.
 *
 * The backend boots standalone in about three seconds: no Firebase, no Pi
 * keys, an in-memory SQLite store and PI_SANDBOX on by default. So the suite
 * starts its own. Set E2E_API_URL to aim it somewhere else — that still works,
 * and is the escape hatch for checking a real deployment by hand.
 */

const LOCAL_API_PORT = Number(process.env.E2E_API_PORT ?? 10199);

/** The backend checkout, if it is next to this repo or under $HOME. */
function findBackend(): string | null {
  const candidates = [
    process.env.E2E_BACKEND_DIR,
    'taxi-pro-server',
    join('..', 'taxi-pro-server'),
    join(homedir(), 'taxi-pro-server'),
  ].filter((c): c is string => !!c);

  for (const candidate of candidates) {
    const dir = isAbsolute(candidate) ? candidate : resolve(process.cwd(), candidate);
    if (existsSync(join(dir, 'src', 'index.ts'))) return dir;
  }
  return null;
}

export const BACKEND_DIR = process.env.E2E_API_URL ? null : findBackend();

/** True when this run starts and owns its own API. */
export const LOCAL_API = BACKEND_DIR !== null;

export const API = LOCAL_API
  ? `http://localhost:${LOCAL_API_PORT}`
  : process.env.E2E_API_URL || 'https://taxi-pro-server.onrender.com';

export const WS = API.replace(/^http/, 'ws');

export const BASE = process.env.E2E_BASE_URL || 'http://localhost:5199';

/**
 * The admin the setup step needs to approve the driver fixture.
 *
 * Going online requires an approved driver, and approval is an admin action —
 * on a store that starts empty there is nobody to grant it. ADMIN_UIDS promotes
 * this one dev uid on login, which is the same path the real admin console uses,
 * so the seeding is done through the app's own endpoints rather than by reaching
 * into the database.
 */
export const ADMIN_NAME = 'e2e-admin';
export const ADMIN_UID = 'dev_e2e_admin';

export const API_PORT = LOCAL_API_PORT;
