# Taxi Pro

**Ride-hailing that runs on Pi.** Passengers book real rides and pay the fare in π;
drivers keep about 90% of every fare. One app for both sides, built for the
Pi Browser and running on Pi Mainnet.

- **Open in the Pi Browser:** `taxipro5198.pinet.com`
- **Web:** https://denys88888.github.io
- **Backend:** [Denys88888/taxi-pro-server](https://github.com/Denys88888/taxi-pro-server)

## What it does

**Passengers**
- Search any address, see the route and a fixed fare in π for each vehicle
  class (Economy, Comfort, Business, XL) before ordering
- Order now or schedule for later, add up to five stops, or name your own price
  and choose between driver offers
- Watch the driver approach live, chat with quick replies and translation, or
  call inside the app without sharing phone numbers
- Share the ride with someone, press SOS, report a problem
- Pay in π at the end, tip, and rate the ride

**Drivers**
- Register with the vehicle; an admin verifies every driver before they can go online
- Requests arrive in real time with the distance to pickup and the fare
- Turn-by-turn navigation that starts by itself: heading-up map, voice prompts,
  lane guidance and speed limits where map data has them
- Earnings per ride and per day, the platform fee, and payout status

**Admins** — driver verification, users, rides, reports, payouts, analytics, fare settings and commission.

## How Pi is used

| | |
| --- | --- |
| Sign-in | `Pi.authenticate` (username, payments, wallet_address); the server verifies the access token with `/v2/me` |
| Ride fare, tips, cancellation fees | User-to-app payments: the server approves and completes each one through the Pi Platform API |
| Driver payouts | App-to-user payments from the app wallet; the driver is told when a payout is sent or delayed, and a failed one is kept for an admin to re-send |

Fares are in π. The fare is frozen when the passenger books; surcharges for
night, peak hours and bad weather are shown before ordering.

## Tech

- React 18 + TypeScript + Vite, installable PWA, Tailwind
- Leaflet with OpenStreetMap tiles, OSRM routing, Nominatim search
- Real-time updates over WebSockets; in-app voice calls over WebRTC
- 20 languages, including right-to-left Arabic
- Node.js + Express API (separate repo), SQLite or Firestore storage
- Vitest unit tests and Playwright end-to-end tests that drive a whole ride
  through both apps against a local API

## Run it locally

```bash
npm install
npm run dev            # http://localhost:5199
npm test               # unit tests
npx playwright test --config e2e/playwright.config.ts   # starts its own API from ../taxi-pro-server
```

Outside the Pi Browser there is no Pi SDK, so sign-in and payments only work
inside it.
