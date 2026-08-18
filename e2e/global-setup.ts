import { request } from '@playwright/test';
import { API } from './helpers/session';

/**
 * Wake the API before any test runs.
 *
 * The Render instance hibernates when idle and the first requests back get
 * `x-render-routing: hibernate-wake-error` — a 502, or a 503 with an empty
 * body. Whichever test happened to go first wore that failure, and the error it
 * reported ("dev login failed: 502") pointed at auth, which had nothing to do
 * with it. Cloudflare sits in front and answers 429 to a burst while the origin
 * is still coming up, so the polling here is deliberately unhurried.
 *
 * This is not papering over a flake: waking the service is a real precondition,
 * and doing it once here is what stops eleven tests from each discovering it.
 */
async function globalSetup(): Promise<void> {
  const ctx = await request.newContext();
  const deadline = Date.now() + 120_000;
  let last = '';

  try {
    while (Date.now() < deadline) {
      try {
        const res = await ctx.get(`${API}/api/health`, { timeout: 30_000 });
        if (res.ok()) {
          const body = await res.json();
          console.log(`[e2e] API awake — commit ${body.commit}, store ${body.store}`);
          return;
        }
        last = `${res.status()} ${res.headers()['x-render-routing'] ?? ''}`.trim();
      } catch (err) {
        last = err instanceof Error ? err.message : String(err);
      }
      await new Promise((r) => setTimeout(r, 5_000));
    }
    // Don't fail the run here. A suite that reports "API never woke" against the
    // test that needed it is more useful than one that dies in setup with no
    // indication of which behaviour was actually broken.
    console.warn(`[e2e] API did not wake within 120s (last: ${last}) — running anyway`);
  } finally {
    await ctx.dispose();
  }
}

export default globalSetup;
