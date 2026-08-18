/**
 * The two-party ride, driven through both UIs at once.
 *
 * This is the flow that had never been covered: the existing "full ride flow"
 * spec wrapped every interaction in `if (await el.isVisible())`, so when login
 * silently failed it asserted nothing and still went green. Verifying it by
 * hand meant two Android emulators, and that cost hours to ANRs, stale service
 * workers and mis-scaled tap coordinates. Here it is seconds.
 *
 * Both sides run in their own browser context so each has its own session,
 * exactly like two phones.
 */
import { test, expect, type Page } from '@playwright/test';
import {
  devLogin,
  openAs,
  auth,
  cancelActiveRides,
  withWakeRetry,
  API,
  type DevSession,
} from './helpers/session';

// Warsaw. Pickup and destination are ~1.8 km apart, well inside the dispatch
// radius, so the driver actually receives the request.
const DESTINATION = { lat: 52.2405, lng: 21.0175, address: 'E2E Destination' };

/**
 * A pickup labelled uniquely per test.
 *
 * The driver's queue holds every open request, including leftovers from earlier
 * runs, so clicking "the first Accept" takes an arbitrary ride — and then every
 * later assertion reads a ride this driver never joined (getRide 403s and the
 * status polls as undefined). Locating the card by its own address is what makes
 * this deterministic.
 */
function uniquePickup() {
  return {
    lat: 52.2297,
    lng: 21.0122,
    address: `E2E Pickup ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  };
}

/** Put the driver online at the pickup, so dispatch reaches them. */
async function goOnline(request: Parameters<typeof devLogin>[0], driver: DevSession) {
  const res = await withWakeRetry(() =>
    request.post(`${API}/api/drivers/online`, {
      data: { lat: 52.2297, lng: 21.0122 },
      headers: auth(driver),
    })
  );
  expect(
    res.ok(),
    `driver could not go online: ${res.status()} ${await res.text()}`
  ).toBeTruthy();
}

/** The ride the passenger is tracking, as the server sees it. */
async function rideStatus(
  request: Parameters<typeof devLogin>[0],
  session: DevSession,
  rideId: string
): Promise<string> {
  const res = await request.get(`${API}/api/rides/${rideId}`, { headers: auth(session) });
  return (await res.json()).status;
}

// Going online requires an approved driver, and approval is an admin action no
// dev-auth account can perform on itself — so a freshly-named driver is stuck
// at "Driver not verified". TestDriver is the fixture that is already approved.
// It is therefore shared, which is why these run serially: two tests putting the
// same driver online and racing for the same ride request would flake.
const DRIVER_FIXTURE = 'TestDriver';

test.describe.serial('two-party ride lifecycle', () => {
  test('driver sees a new request, takes it, and the passenger is told — without a reload', async ({
    browser,
    request,
  }) => {
    const passenger = await devLogin(request, 'e2e-lc-passenger', 'passenger');
    const driver = await devLogin(request, DRIVER_FIXTURE, 'driver');
    await cancelActiveRides(request, passenger);
    await goOnline(request, driver);

    const PICKUP = uniquePickup();

    const passengerCtx = await browser.newContext();
    const driverCtx = await browser.newContext();
    const passengerPage: Page = await passengerCtx.newPage();
    const driverPage: Page = await driverCtx.newPage();

    try {
      await openAs(driverPage, driver);
      await expect(driverPage.getByText(/available rides/i)).toBeVisible({ timeout: 20000 });

      await openAs(passengerPage, passenger);
      await expect(passengerPage.getByRole('textbox', { name: 'To' })).toBeVisible({
        timeout: 20000,
      });

      // Order through the API rather than the map: tapping a Leaflet tile to
      // pick a destination is a test of Leaflet, and the point here is what
      // both screens do once a ride exists.
      const created = await withWakeRetry(() =>
        request.post(`${API}/api/rides`, {
          data: { pickup: PICKUP, destination: DESTINATION, vehicleType: 'economy' },
          headers: auth(passenger),
        })
      );
      expect(created.status(), await created.text()).toBe(201);
      const ride = await created.json();

      // The driver's list is fed by a WebSocket broadcast — no reload here on
      // purpose. A driver who has to pull-to-refresh loses the ride.
      await expect(driverPage.getByText(new RegExp(PICKUP.address, 'i'))).toBeVisible({
        timeout: 20000,
      });

      // Accept from the driver's own UI, the way a driver would.
      // The card carrying OUR pickup, not whichever request happens to be first.
      await driverPage
        .locator('div')
        .filter({ hasText: PICKUP.address })
        .getByRole('button', { name: /accept/i })
        .last()
        .click();
      await expect
        .poll(() => rideStatus(request, passenger, ride.id), { timeout: 20000 })
        .toBe('assigned');

      // And the passenger, who has been sitting on Home the whole time, must be
      // told. This is the regression that prompted the fix: findActiveRide ran
      // only on mount, so a ride going live while Home was already open stayed
      // invisible until the app was restarted.
      await expect(passengerPage.getByRole('button', { name: /active ride/i })).toBeVisible({
        timeout: 20000,
      });
    } finally {
      await cancelActiveRides(request, passenger);
      await passengerCtx.close();
      await driverCtx.close();
    }
  });

  test('the driver walks the ride to completion from their own screen', async ({
    browser,
    request,
  }) => {
    // Four server round-trips against the live API plus a cold Render start do
    // not fit the 30s default.
    test.setTimeout(120000);

    const passenger = await devLogin(request, 'e2e-lc2-passenger', 'passenger');
    const driver = await devLogin(request, DRIVER_FIXTURE, 'driver');
    await cancelActiveRides(request, passenger);
    await goOnline(request, driver);

    const PICKUP = uniquePickup();
    const created = await withWakeRetry(() =>
      request.post(`${API}/api/rides`, {
        data: { pickup: PICKUP, destination: DESTINATION, vehicleType: 'economy' },
        headers: auth(passenger),
      })
    );
    expect(created.status(), await created.text()).toBe(201);
    const ride = await created.json();

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await openAs(page, driver);
      await page
        .locator('div')
        .filter({ hasText: PICKUP.address })
        .getByRole('button', { name: /accept/i })
        .last()
        .click({ timeout: 20000 });
      await expect.poll(() => rideStatus(request, passenger, ride.id), { timeout: 20000 }).toBe(
        'assigned'
      );

      // One button carries the whole progression, relabelling itself at each
      // step (arrived → start → complete). Clicking it three times is the
      // driver's entire job, and each transition is WebSocket-only — there is
      // no REST route that does this, so only a real click exercises it.
      // Labels come from the en locale: "I've arrived" / "Start ride" /
      // "Complete ride". Matched by their distinctive word rather than the whole
      // phrase, so an apostrophe or a copy tweak doesn't silently stop matching
      // and leave the loop clicking nothing.
      const steps = [
        { label: /arrived/i, expected: 'arrived' },
        { label: /start ride/i, expected: 'in_progress' },
        { label: /complete ride/i, expected: 'completed' },
      ] as const;

      for (const { label, expected } of steps) {
        const btn = page.getByRole('button', { name: label });
        await expect(btn, `no "${label}" button on the driver's screen`).toBeVisible({
          timeout: 20000,
        });
        await btn.click();
        await expect
          .poll(() => rideStatus(request, passenger, ride.id), { timeout: 20000 })
          .toBe(expected);
      }
    } finally {
      await cancelActiveRides(request, passenger);
      await ctx.close();
    }
  });

  test('navigation says it needs location instead of guiding from nowhere', async ({
    browser,
    request,
  }) => {
    // With no position fix the navigation view opened anyway and contradicted
    // itself: the instruction panel fell back to the pickup point, so it drew a
    // zero-length route and announced "0 m — start driving" as though the car
    // were already there, while the ETA bar underneath — which has no such
    // fallback — sat on "building route…" for good. A browser context with
    // geolocation simply not granted is exactly that state.
    const passenger = await devLogin(request, 'e2e-nav-passenger', 'passenger');
    const driver = await devLogin(request, DRIVER_FIXTURE, 'driver');
    await cancelActiveRides(request, passenger);
    await goOnline(request, driver);

    const PICKUP = uniquePickup();
    const created = await withWakeRetry(() =>
      request.post(`${API}/api/rides`, {
        data: { pickup: PICKUP, destination: DESTINATION, vehicleType: 'economy' },
        headers: auth(passenger),
      })
    );
    expect(created.status(), await created.text()).toBe(201);

    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    try {
      await openAs(page, driver);
      await page
        .locator('div')
        .filter({ hasText: PICKUP.address })
        .getByRole('button', { name: /accept/i })
        .last()
        .click({ timeout: 20000 });

      const navBtn = page.getByRole('button', { name: /navigation/i });
      await expect(navBtn).toBeVisible({ timeout: 20000 });
      await navBtn.click();

      await expect(page.getByText(/location/i).first()).toBeVisible({ timeout: 10000 });
      await expect(page.getByRole('region', { name: /navigation/i })).toHaveCount(0);
      await expect(page.getByText(/building route/i)).toHaveCount(0);
    } finally {
      await cancelActiveRides(request, passenger);
      await ctx.close();
    }
  });
});
