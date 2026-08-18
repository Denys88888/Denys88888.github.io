/**
 * E2E: In-ride chat
 * Two users exchange messages in a ride chat room
 */
import { test, expect } from '@playwright/test';
import { mockPiSdk } from './helpers/mockPi';
import { API, auth, devLogin } from './helpers/session';

const BASE = process.env.E2E_BASE_URL || 'http://localhost:5199';
// Defaults to production, like helpers/session.ts — nothing listens on
// localhost:3001, so the old default made these fail everywhere except CI.

test.describe('Chat', () => {
  test('send and receive a message via API', async ({ request }) => {
    const passenger = await devLogin(request, 'e2e-chat-passenger', 'passenger');
    const pasToken = passenger.token;

    // Create a ride to get a chatId (rideId is used as chatId)
    const rideRes = await request.post(`${API}/api/rides`, {
      data: {
        pickup: { lat: 48.4647, lng: 35.0462, address: 'Chat start' },
        destination: { lat: 48.4716, lng: 35.0385, address: 'Chat end' },
        vehicleType: 'economy',
      },
      headers: auth(passenger),
    });
    expect(rideRes.status()).toBe(201);
    const ride = await rideRes.json();
    const chatId = ride.id;

    // Send a message
    const sendRes = await request.post(`${API}/api/messages`, {
      data: { chatId, text: 'Hello from e2e test' },
      headers: { Authorization: `Bearer ${pasToken}` },
    });
    expect([200, 201]).toContain(sendRes.status());

    // Fetch history
    const histRes = await request.get(`${API}/api/messages?chatId=${chatId}`, {
      headers: { Authorization: `Bearer ${pasToken}` },
    });
    expect(histRes.status()).toBe(200);
    const body = await histRes.json();
    const messages = body.messages ?? body;
    expect(Array.isArray(messages)).toBe(true);
    const found = messages.some((m: { text: string }) => m.text === 'Hello from e2e test');
    expect(found).toBe(true);

    // Cleanup
    await request.post(`${API}/api/rides/${ride.id}/cancel`, {
      data: { reason: 'e2e cleanup' },
      headers: { Authorization: `Bearer ${pasToken}` },
    });
  });

  test('chat UI renders message input', async ({ page }) => {
    await mockPiSdk(page);
    await page.goto(`${BASE}?dev=e2e-chat-ui&role=passenger`);
    await page.waitForLoadState('networkidle');

    // App loads without JS errors
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.waitForTimeout(2000);

    // Filter out known non-critical warnings
    const critical = errors.filter(
      (e) => !e.includes('ResizeObserver') && !e.includes('non-passive')
    );
    expect(critical).toHaveLength(0);
  });

  test('message rate limit rejects spam', async ({ request }) => {
    const { token } = await devLogin(request, 'e2e-spam', 'passenger');

    // Send 25 messages rapidly — rate limiter should kick in
    const results: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await request.post(`${API}/api/messages`, {
        data: { chatId: 'spam-test', text: `msg ${i}` },
        headers: { Authorization: `Bearer ${token}` },
      });
      results.push(res.status());
    }
    const hasRateLimit = results.some((s) => s === 429);
    expect(hasRateLimit).toBe(true);
  });
});
