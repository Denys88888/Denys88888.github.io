/**
 * The session-injection path every UI test depends on.
 *
 * Kept separate and asserted hard: when this breaks, every other UI spec starts
 * "passing" on the auth screen instead of the app, which is exactly how the
 * suite ended up full of tests that asserted nothing.
 */
import { test, expect } from '@playwright/test';
import { devLogin, openAs } from './helpers/session';

test.describe('dev session injection', () => {
  test('a passenger lands on the order form, not the auth screen', async ({ page, request }) => {
    const session = await devLogin(request, 'e2e-session-passenger', 'passenger');
    await openAs(page, session);

    // The order form's two address fields are the passenger home screen and
    // appear nowhere else — a far better signal than "body is visible".
    // By role, not by text: "Where to?" is the placeholder, which getByText
    // does not see.
    await expect(page.getByRole('textbox', { name: 'To' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByRole('textbox', { name: 'From' })).toBeVisible();
    await expect(page.getByRole('button', { name: /login with pi/i })).toHaveCount(0);
  });

  test('a driver lands on the driver screen', async ({ page, request }) => {
    const session = await devLogin(request, 'e2e-session-driver', 'driver');
    await openAs(page, session);

    // Drivers are routed to their own home; "Available rides" is unique to it.
    await expect(page.getByText(/available rides/i)).toBeVisible({ timeout: 20000 });
  });
});
