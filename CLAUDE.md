# Taxi Pro — working notes

Ride-hailing PWA on Pi Network. React 18 + Vite + Tailwind + Leaflet, 20 locales.
Backend is a **separate repo**: `~/taxi-pro-server` → `Denys88888/taxi-pro-server`
(Express + ws + Firestore, deployed on Render). Most features touch both — check
whether a change belongs on the server before implementing it here.

## Network: testnet, and it stays there

`PI_SANDBOX=true` on Render is **correct and deliberate**. The owner's decision:
no mainnet until the app is fully tested, and they will say when. Do not advise
switching it, and do not set `VITE_PI_SANDBOX: 'true'` on the frontend either —
`Pi.init({sandbox:true})` makes `Pi.authenticate` hang forever inside the real
Pi Browser. Testnet vs mainnet is decided by which Developer Portal registration
serves the URL, not by that flag.

The Mainnet registration (`taxi-pro-rhse`) is an empty shell: no URL, no wallet
connected. Connecting a wallet needs the owner's own signature.

## Verifying a deploy actually landed

`GET https://taxi-pro-server.onrender.com/api/health` reports:
- `commit` — the short sha actually running (a failed build leaves the old
  instance answering 200, so `status: ok` proves nothing on its own)
- `wallet` — whether `PI_WALLET_SEED` is set. Without it every driver payout
  parks as `no_wallet_configured` and drivers are silently never paid.

Frontend deploys via GitHub Actions. `gh` CLI is **not installed** — check runs
with `curl -s "https://api.github.com/repos/OWNER/REPO/actions/runs?branch=main"`.

## Push convention

`git push origin HEAD:main` — never `git push origin main`.

## CSS: verify it reached the bundle

**`src/styles/globals.css` is imported by nothing.** Every rule in it is dead.
Global CSS belongs in **`src/index.css`** (the sheet main.tsx imports).

This is not hypothetical: `--safe-bottom` was defined in globals.css, so
`max(var(--safe-bottom), 12px)` referenced an undefined custom property, which
makes the whole declaration invalid and drops `padding-bottom` to 0 — worse than
the 12px it replaced, and invisible until a real phone showed the tab bar buried
under the Android nav buttons.

After any styling change, confirm the class actually shipped:
```bash
curl -s https://denys88888.github.io/ | grep -o 'assets/index-[^"]*\.css'   # then grep that file
```
A project hook (`.claude/hooks/css-reaches-bundle.sh`) warns about unimported
sheets, but it only catches this one shape of the mistake.

## Testing

**Prefer the Playwright suite over the Android emulators.** `e2e/` runs against
a dev server on :5199 (auto-started) plus the production API:
```bash
npx playwright test --config e2e/playwright.config.ts
```
Dev-login works in a **plain browser** — Pi Browser is only needed for real Pi
payments. So both passenger and driver flows can be driven end-to-end without an
emulator, which is far more reliable than fighting one.

Dev accounts: `TestPassenger` / `TestDriver` are safe to use freely. Mint tokens
with `POST /api/auth/dev {"name":"...","role":"..."}` (they expire quickly —
re-mint rather than debugging a 401). **Never touch real users' accounts or
driver applications** — the Approved list is full of real people.

Enabling dev mode in the UI: **tap the car logo 5 times within 2 seconds** on the
auth screen. Separate `adb` taps are too slow; use one shell:
`adb shell "for i in 1 2 3 4 5; do input tap X Y; done"`.

## Android emulator (last resort)

- Genymotion `127.0.0.1:6555`; plain AVD via `~/android-sdk/emulator`.
- **Never `pm clear pi.browser`.** `am force-stop` is fine.
- Never type in the Pi Browser URL bar — it reliably ANRs. Deep-link instead:
  `adb shell am start -a android.intent.action.VIEW -d "https://taxipro9284.pinet.com" -n pi.browser/com.pinetwork.MainActivity`
  Paths work (`/reset.html`); query strings do not. The browser must be idle
  first — a deep link sent during cold start is swallowed.
- A stale service worker serves an **old build**, which silently invalidates any
  visual check. Load `/reset.html` first; it wipes caches and redirects to `/`.
- Screenshots are 1080×2400 shown at 900×2000 — **multiply coordinates by 1.2**.
  Getting this wrong mis-taps onto the map underneath. Crop-and-zoom with PIL to
  locate a control rather than eyeballing it.

## The bug pattern worth grepping for

Several real holes here shared one shape: **ownership is checked, state is not.**
An endpoint verifies you own the ride, then acts regardless of what state it is
in — relying on the client hiding the button rather than the server refusing.
Found in `acceptOffer` (re-accepting silently swapped the assigned driver) and
`registerDriver` (re-registering demoted an approved driver mid-shift).

A second shape: `if (ride && ride.passengerId !== uid)` — a lookup miss
short-circuits the whole condition and skips authorization entirely. Use
`if (!ride || ...)`. Cleared across the backend, but worth re-checking in new code.

## Conventions

- Comments explain **why**, not what. Match the surrounding density.
- Tests pin the bug, not the implementation — and after writing one for a bug you
  cannot reproduce by hand, temporarily remove the fix to confirm the test fails.
  (Careful: `git checkout <file>` to undo that reverts the real fix too.)
- The owner reads Russian. Report in Russian.
