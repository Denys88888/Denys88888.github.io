import { chromium } from 'playwright';

const OUT = '/private/tmp/claude-501/-Users-mac/724bf2cd-02eb-4732-bd8b-b22c9553f0f4/scratchpad/mainnet_photos';

async function tokenFor(name, role) {
  const res = await fetch('https://taxi-pro-server.onrender.com/api/auth/dev', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, role }),
  });
  return res.json();
}

async function loggedInPage(context, name, role) {
  const { token, user } = await tokenFor(name, role);
  const page = await context.newPage();
  await page.goto('https://denys88888.github.io/?dev=1', { waitUntil: 'domcontentloaded' });
  await page.evaluate(
    ([t, u]) => {
      localStorage.setItem('taxipro_token', t);
      localStorage.setItem('taxipro_user', JSON.stringify(u));
      localStorage.setItem('taxi_pro_onboarded', '1');
    },
    [token, user]
  );
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  return page;
}

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 750, height: 1600 },
  geolocation: { latitude: 52.2297, longitude: 21.0122 },
  permissions: ['geolocation'],
  locale: 'en-US',
});

// Passenger: home screen with pickup already set from GPS.
const passenger = await loggedInPage(context, 'ScreenshotDemoP2', 'passenger');
await passenger.screenshot({ path: `${OUT}/home.jpg`, type: 'jpeg', quality: 92 });
console.log('home.jpg done');

// Tap the map at a second point to drop a destination pin and draw a route.
const map = await passenger.$('.leaflet-container');
const box = await map.boundingBox();
await passenger.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.75);
await passenger.waitForTimeout(2000);
await passenger.click('text=Confirm').catch((e) => console.log('confirm click failed:', e.message));
await passenger.waitForTimeout(2000); // route + fare fetch
await passenger.screenshot({ path: `${OUT}/route.jpg`, type: 'jpeg', quality: 92 });
console.log('route.jpg done');

// Driver: driver home screen.
const driver = await loggedInPage(context, 'ScreenshotDemoD2', 'driver');
await driver.waitForTimeout(1500);
await driver.screenshot({ path: `${OUT}/driver.jpg`, type: 'jpeg', quality: 92 });
console.log('driver.jpg done');

await browser.close();
