import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  // The two-party lifecycle test walks a whole ride over a live websocket and
  // sits at ~30s on a warm API, so the old 30s budget failed it on any hiccup —
  // and waiting out the login rate limiter needs room on top of that.
  timeout: 150_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5199',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  // Start the dev server automatically when not in CI.
  //
  // VITE_E2E=1 is what compiles in src/e2eInit.ts, the module that seeds a
  // session from ?e2eToken/?e2eUser. Without it that injection is dead code and
  // no test can get past the auth screen — which is why the UI tests here were
  // written to skip themselves when an element wasn't found, and passed while
  // asserting nothing.
  // The API/WS overrides matter as much as VITE_E2E: .env points the dev server
  // at localhost:10000, so without them the injected token is written and then
  // immediately thrown away when the profile fetch fails — landing the test on
  // the auth screen with no hint as to why. CI passes the same three.
  //
  // reuseExistingServer stays on so a dev server you already have is not killed,
  // but note it will be reused *with whatever env it was started with* — if
  // login mysteriously fails, check that first (`curl -s localhost:5199/src/e2eInit.ts`
  // prints the resolved import.meta.env).
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        env: {
          VITE_E2E: '1',
          VITE_API_URL: process.env.E2E_API_URL || 'https://taxi-pro-server.onrender.com',
          VITE_WS_URL: (process.env.E2E_API_URL || 'https://taxi-pro-server.onrender.com').replace(
            /^http/,
            'ws'
          ),
        },
        url: 'http://localhost:5199',
        reuseExistingServer: true,
        cwd: '..',
        timeout: 30000,
      },
});
