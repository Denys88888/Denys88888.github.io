import type { Page } from '@playwright/test';

/** Inject a Pi SDK mock that auto-approves payments. */
export async function mockPiSdk(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).Pi = {
      authenticate: (_scopes: string[], _opts: unknown) =>
        Promise.resolve({
          user: { uid: 'test-uid', username: 'testuser' },
          accessToken: 'mock-access-token',
        }),
      createPayment: (
        _data: unknown,
        callbacks: {
          onReadyForServerApproval: (id: string) => void;
          onReadyForServerCompletion: (id: string, txid: string) => void;
          onCancel: (id: string) => void;
          onError: (err: Error, payment: unknown) => void;
        }
      ) => {
        const fakeId = 'mock-pi-payment-' + Math.random().toString(36).slice(2);
        setTimeout(() => callbacks.onReadyForServerApproval(fakeId), 100);
        setTimeout(() => callbacks.onReadyForServerCompletion(fakeId, 'mock-txid-123'), 500);
        return { identifier: fakeId };
      },
      openShareDialog: () => {},
    };
  });
}

/** Dev-login via the ?dev=<name>&role=<role> URL param that AuthScreen supports. */
export function devUrl(base: string, name: string, role = 'passenger') {
  return `${base}?dev=${encodeURIComponent(name)}&role=${role}`;
}
