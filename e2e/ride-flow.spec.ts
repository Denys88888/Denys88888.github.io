/**
 * E2E: ride API contract.
 *
 * The UI half of this now lives in ride-lifecycle.spec.ts — see the note below.
 */
import { test, expect } from '@playwright/test';
import type { APIResponse } from '@playwright/test';
import { API, auth, cancelActiveRides, devLogin } from './helpers/session';

test.describe('Full ride flow', () => {
  // The UI walkthrough that used to live here asserted nothing: `?dev=name` only
  // reveals the dev-login buttons, it does not sign anyone in, so the page sat on
  // the auth screen — and every interaction was wrapped in
  // `if (await el.isVisible())`, which made "element missing" indistinguishable
  // from "step passed". It went green for as long as it existed.
  //
  // Replaced by ride-lifecycle.spec.ts, which signs both parties in for real and
  // fails when the flow breaks (verified by reintroducing the WS regression it
  // covers). The API-level checks below are still worth keeping.

  test('health check returns ok', async ({ request }) => {
    const res = await request.get(`${API}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('dev login works and returns JWT', async ({ request }) => {
    // Through the helper rather than a raw POST: logins are rate limited to 10
    // a minute for the whole run, and a hand-rolled one here spends from that
    // budget without the helper's back-off. devLogin throws on any non-200, so
    // the response-code check this test used to make is still being made.
    const body = await devLogin(request, 'e2e-test-user', 'passenger');
    expect(body.token).toBeTruthy();
    expect(body.user.role).toBe('passenger');
  });

  test('create ride via API', async ({ request }) => {
    const session = await devLogin(request, 'e2e-ride-passenger', 'passenger');

    // Start from a clean account. The suite runs against the shared deployed
    // API, where this uid outlives the run, and the server allows one live ride
    // per passenger — so anything left behind by an earlier run, or by a run
    // still going on another commit, is refused here as a 409. Four commits
    // pushed minutes apart is enough to overlap two runs and turn this test red
    // for reasons that have nothing to do with the code under test.
    await cancelActiveRides(request, session);

    const create = (): Promise<APIResponse> =>
      request.post(`${API}/api/rides`, {
        data: {
          pickup: { lat: 48.4647, lng: 35.0462, address: 'Start' },
          destination: { lat: 48.4716, lng: 35.0385, address: 'End' },
          vehicleType: 'economy',
        },
        headers: auth(session),
      });

    // A concurrent run can take the slot between the cleanup and the create, so
    // one retry — and if it is still refused, say which rule refused it. The
    // bare `expect(201)` this replaces reported "Received: 409" and left the
    // reader to guess between a stuck ride and an unpaid cancellation fee.
    let rideRes = await create();
    if (rideRes.status() === 409) {
      await cancelActiveRides(request, session);
      rideRes = await create();
    }
    if (rideRes.status() === 409) {
      const body = (await rideRes.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };
      throw new Error(
        `ride creation refused: ${body.code ?? 'unknown'} — ${body.error ?? '(no message)'}`
      );
    }
    expect(rideRes.status()).toBe(201);
    const ride = await rideRes.json();
    expect(ride.id).toBeTruthy();
    expect(ride.status).toBe('searching');

    // Cancel it
    const cancelRes = await request.post(`${API}/api/rides/${ride.id}/cancel`, {
      data: { reason: 'e2e test cleanup' },
      headers: auth(session),
    });
    expect(cancelRes.status()).toBe(200);
  });
});
