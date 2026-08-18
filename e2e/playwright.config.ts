import { defineConfig, devices } from '@playwright/test';
import { API, API_PORT, BACKEND_DIR, BASE, LOCAL_API, WS } from './helpers/env';

export default defineConfig({
  testDir: '.',
  // Waits for the API, approves the driver fixture, and signs every account in
  // — once, up front, rather than letting whichever test ran first wear the cost
  // and report it as an auth failure.
  globalSetup: './global-setup.ts',
  // The two-party lifecycle test walks a whole ride over a live websocket and
  // sits at ~30s on a warm API, so the old 30s budget failed it on any hiccup —
  // and waiting out the login rate limiter needs room on top of that.
  timeout: 150_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Pixel 7'] },
    },
  ],
  // Start everything the run needs: the API first, then the dev server pointed
  // at it. Playwright waits for each `url` before moving on, so the frontend is
  // never built against an API that isn't listening yet.
  //
  // The API is ours for the duration — its own process, an in-memory SQLite
  // store, sandbox mode on. That is what took the deployed backend out of the
  // loop: no hibernation to wake, no Cloudflare edge deciding a burst of logins
  // is a bot, and no e2e rides landing in the production store. See helpers/env.
  //
  // VITE_E2E=1 is what compiles in src/e2eInit.ts, the module that seeds a
  // session from ?e2eToken/?e2eUser. Without it that injection is dead code and
  // no test gets past the auth screen — which is why the UI tests here were once
  // written to skip themselves when an element wasn't found, and passed while
  // asserting nothing.
  // The API/WS overrides matter as much: .env points the dev server at
  // localhost:10000, so without them the injected token is written and then
  // thrown away when the profile fetch fails, landing the test on the auth
  // screen with no hint as to why.
  //
  // reuseExistingServer stays on so a dev server you already have is not killed,
  // but note it will be reused *with whatever env it was started with* — if
  // login mysteriously fails, check that first (`curl -s localhost:5199/src/e2eInit.ts`
  // prints the resolved import.meta.env).
  webServer: [
    ...(LOCAL_API && BACKEND_DIR
      ? [
          {
            command: 'npx tsx src/index.ts',
            cwd: BACKEND_DIR,
            url: `${API}/api/health`,
            reuseExistingServer: true,
            timeout: 60_000,
            env: {
              PORT: String(API_PORT),
              NODE_ENV: 'development',
              // Never a file: a run must not inherit the last run's rides, and
              // must not leave any behind either.
              SQLITE_PATH: ':memory:',
              // Promotes the account global-setup uses to approve the driver
              // fixture. Nothing else in the suite is an admin.
              ADMIN_UIDS: 'dev_e2e_admin',
              CORS_ORIGINS: BASE,
            },
          },
        ]
      : []),
    {
      command: 'npm run dev',
      env: {
        VITE_E2E: '1',
        VITE_API_URL: API,
        VITE_WS_URL: WS,
      },
      url: BASE,
      reuseExistingServer: true,
      cwd: '..',
      timeout: 60_000,
    },
  ],
});
