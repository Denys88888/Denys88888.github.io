# Genymotion test — results & findings

**Device:** Genymotion "Google Pixel 6", Android **15** (API 35), **1080×2400**
(matches the requested Pixel 6 profile). Serial `127.0.0.1:6555`.
**Pi Browser:** installed (`pi.browser`, Chromium/WebView 124).

## What was verified ✅

| # | Check | Result |
|---|-------|--------|
| 1 | Genymotion device running | ✅ Pixel 6 / Android 15 / 1080×2400 |
| 2 | Pi Browser installed & loads web apps | ✅ loads `denys88888.github.io` (see `screenshots/01`) |
| 3 | **Latest build renders on the real device** | ✅ Auth screen with the **Lucide Car icon (no emoji)**, purple theme, text-only language selector, "π Login with Pi" (`screenshots/02`) — served locally over `adb reverse` and loaded in the on-device Chromium WebView (same engine as Pi Browser). Confirmed by server-log fetches of the JS bundle + `manifest.webmanifest`. |
| 4 | App interactive & stable on-device | ✅ no crash; `Login with Pi` handled gracefully when `window.Pi` is absent |

## Bugs found & FIXED 🐛→✅

- **[HIGH] Map not visible ("карту не вижу").** On the device (and Pi Browser),
  the Leaflet map rendered **blank** on the passenger home / ride / driver screens.
  **Cause:** Leaflet caches its container size at init; the map mounts during the
  splash→app transition before the container has its final (%-of-flex) height, so
  it initializes at height 0 and never repaints. Works on fast desktop, fails on a
  slower device — which is why it wasn't caught earlier.
  **Fix:** added a `SizeInvalidator` in `MapView` that calls `map.invalidateSize()`
  after mount, on short delays, and on resize/orientation change. Applies to every
  map instance. **Verified on the device — map now renders with OSM tiles**
  (`screenshots/04-home-map-fixed-on-device.png`).

## Blockers 🚧

1. **[HIGH] Live site serves the OLD build.** The latest build (Lucide icons,
   PWA-via-plugin, robots/sitemap) is **stuck on the GitHub Pages deploy** — the
   branch-based "pages build and deployment" was erroring; I switched Pages to the
   official Actions method, but the final `deploy-pages` publish is hanging on
   GitHub's side. So opening `denys88888.github.io/taxi-pro/` in Pi Browser shows
   the *previous* app, not the latest.
   **Repro:** open the URL in Pi Browser → green "Standard/Comfort" UI (old), not
   the purple Lucide UI. **Fix:** re-run the "Deploy" workflow until it publishes.

2. **[ENV] Real Pi Browser automation blocked by emulator lag.** Driving Pi
   Browser to a custom `localhost` URL via adb repeatedly triggered
   "Pi Browser isn't responding" (ANR); its ecosystem-home has no address bar.
   Full screen-by-screen driving + the real `Pi.authenticate`/payment flow needs a
   responsive device **and a signed-in Pi testnet account** — not automatable here.

## Cannot verify from this setup

- `window.Pi` login and the create→approve→complete→txid payment cycle: require
  the actual Pi Browser (present, but not reliably drivable on this laggy VM) plus
  a logged-in Pi account. Rendering will match the WebView (same Chromium engine),
  so once the deploy publishes, testing in Pi Browser is a matter of tapping through.

## How it was tested

```
ADB=/Applications/Genymotion.app/Contents/MacOS/player.app/Contents/MacOS/tools/adb
# serve the latest production build with base /taxi-pro/
npx vite preview --port 4173        # or: python3 -m http.server (logs requests)
$ADB reverse tcp:4173 tcp:4173      # device localhost -> Mac
# load in the on-device WebView (Chromium, same engine as Pi Browser):
$ADB shell am start -n org.chromium.webview_shell/.WebViewBrowserActivity \
  -d "http://localhost:4173/taxi-pro/"
$ADB exec-out screencap -p > shot.png
```
