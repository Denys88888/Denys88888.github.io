// Renders every app icon from the two SVG sources in public/icons, so the
// home-screen tile, the favicon and the mark inside the app cannot drift apart.
//
// Run: node scripts/make-icons.mjs   (needs the dev dependency playwright)
//
// The mark: a yellow taxi on the app's green. It used to be a π, and before
// that a taxi drawn so plainly it read as a waste bin. The π went because Pi's
// brand rules keep its symbol for Pi itself, and because a π says nothing about
// taxis. logo.svg has rounded corners; logo-maskable.svg is the same drawing
// edge to edge, for Android's maskable icon and for listings that round it
// themselves.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const icons = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons');
const jobs = [
  ['logo.svg', 'favicon-32.png', 32],
  ['logo.svg', 'icon-192.png', 192],
  ['logo.svg', 'icon-512.png', 512],
  ['logo-maskable.svg', 'icon-maskable-512.png', 512],
];

const browser = await chromium.launch();
for (const [src, out, size] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const svg = readFileSync(resolve(icons, src), 'utf8').replace(/width="\d+" height="\d+"/, `width="${size}" height="${size}"`);
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg}</body></html>`);
  await page.screenshot({ path: resolve(icons, out), omitBackground: true });
  await page.close();
}
await browser.close();
console.log('icons written to', icons);
