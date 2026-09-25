// Generates every app icon from one definition, so the tile on a phone's home
// screen, the favicon and the mark inside the app cannot drift apart.
//
// Run: node scripts/make-icons.mjs   (needs the dev dependency playwright)
//
// The mark: π, for the currency every fare is paid in. Three solid shapes, so
// it still reads at the 32 px of a browser tab.
//
// It was drawn as a taxi to begin with — a roof lamp on top of the crossbar and
// a road underneath — and on screen that read unmistakably as a waste bin: the
// lamp became a lid and the road became the base. Hence a plain π, with a thin
// bar and long legs well apart, which cannot collapse into a container shape.
//
// Keep in sync with src/components/ui/Logo.tsx, which draws the same mark for
// the splash and login screens. The duplication is deliberate: this file is a
// build script that must not import from the app bundle.

import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const iconsDir = resolve(here, '../public/icons');

const GREEN_LIGHT = '#12876A';
const GREEN_DEEP = '#0A4E3C';

// The mark itself, on a 512 canvas. Everything sits inside a 220×232 box
// centred on the tile, which keeps it within the inner 80% that Android's
// maskable shapes are allowed to crop to.
const mark = `
  <rect x="146" y="161" width="220" height="30" rx="15" fill="#fff"/>
  <rect x="184" y="191" width="32" height="160" rx="16" fill="#fff"/>
  <rect x="296" y="191" width="32" height="160" rx="16" fill="#fff"/>
`;

// rx 0 gives the full-bleed square a maskable icon needs — Android cuts its own
// circle or squircle out of it, and a pre-rounded tile would show the white
// corners of the old icon inside that cut. rx 112 (22%) is the rounded tile
// everything else uses.
const tile = (rx) => `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${GREEN_LIGHT}"/>
      <stop offset="1" stop-color="${GREEN_DEEP}"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>
${mark}</svg>
`;

const rounded = tile(112);
const maskable = tile(0);

const targets = [
  { file: 'icon-512.png', svg: rounded, size: 512 },
  { file: 'icon-192.png', svg: rounded, size: 192 },
  { file: 'icon-maskable-512.png', svg: maskable, size: 512 },
  { file: 'favicon-32.png', svg: rounded, size: 32 },
];

mkdirSync(iconsDir, { recursive: true });
// Written alongside the PNGs: an SVG is what app stores and listings ask for
// when they want the logo, and it is the thing to hand anyone who needs it big.
writeFileSync(resolve(iconsDir, 'logo.svg'), rounded);

const browser = await chromium.launch();
try {
  for (const { file, svg, size } of targets) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;padding:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
    );
    await page.screenshot({ path: resolve(iconsDir, file), omitBackground: true });
    await page.close();
    console.log(`wrote ${file} (${size}px)`);
  }
} finally {
  await browser.close();
}
