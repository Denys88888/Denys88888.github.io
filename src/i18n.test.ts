import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES } from './utils/constants';

// Every declared language must ship a translation.json with the core keys the UI
// renders. Missing keys would fall back to English, but core screens should be
// localized, so we assert their presence here.
const modules = import.meta.glob('./locales/*/translation.json', { eager: true });
// Raw sources, so the tests below can check what the screens actually ask for.
const sources = import.meta.glob('./**/*.{ts,tsx}', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const REQUIRED = ['auth.login', 'nav.home', 'home.order', 'ride.statusSearching', 'vehicle.economy'];

function get(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], obj);
}

// Flatten a nested translation object into dotted keys (arrays are leaf values).
function flatKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' && !Array.isArray(v)
      ? flatKeys(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`]
  );
}

describe('i18n locales', () => {
  const byLang: Record<string, Record<string, unknown>> = {};
  for (const [path, mod] of Object.entries(modules)) {
    const code = path.match(/\.\/locales\/([^/]+)\//)![1];
    byLang[code] = (mod as { default: Record<string, unknown> }).default;
  }

  it('ships a file for all 20 supported languages', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      expect(byLang[lang.code], `missing locale ${lang.code}`).toBeTruthy();
    }
  });

  it('has all required core keys translated in every language', () => {
    for (const [code, dict] of Object.entries(byLang)) {
      for (const key of REQUIRED) {
        expect(get(dict, key), `${code} missing ${key}`).toBeTruthy();
      }
    }
  });

  it('every language has the complete English key set (100% coverage)', () => {
    const enKeys = flatKeys(byLang.en).sort();
    for (const [code, dict] of Object.entries(byLang)) {
      const keys = flatKeys(dict).sort();
      const missing = enKeys.filter((k) => !keys.includes(k));
      expect(missing, `${code} is missing keys: ${missing.join(', ')}`).toHaveLength(0);
    }
  });

  // Key parity above only proves the keys exist. Two features shipped with the
  // English text copied into all 20 files, and two keys were used by a screen
  // without ever being added — both passed every check we had, and both showed
  // raw English (or a raw key name) to real users. The next two tests are for
  // exactly those two failures.

  it('every t() key used in the app exists in English', () => {
    const missing = new Map<string, string[]>();
    for (const [file, src] of Object.entries(sources)) {
      if (/\.test\.tsx?$/.test(file)) continue;
      // Static single-quoted keys only — a template literal like
      // t(`earnings.${k}`) cannot be resolved without running the screen.
      for (const [, key] of (src as string).matchAll(/\bt\(\s*'(\w+(?:\.\w+)+)'/g)) {
        if (get(byLang.en, key) === undefined) {
          missing.set(key, [...(missing.get(key) ?? []), file]);
        }
      }
    }
    const report = [...missing].map(([k, f]) => `${k} (${f.join(', ')})`);
    expect(report, `keys used but never translated: ${report.join('; ')}`).toHaveLength(0);
  });

  it('languages in another script contain no leftover English strings', () => {
    // In a language that does not use the Latin alphabet, a value byte-identical
    // to English is a copy-paste placeholder, never a coincidence. Latin-script
    // languages are excluded because plenty of their words genuinely match
    // ("Chat" in German, "Distance" in French).
    const OTHER_SCRIPT = ['ru', 'uk', 'ar', 'hi', 'ja', 'ko', 'th', 'zh'];
    const enFlat = flatKeys(byLang.en);
    for (const code of OTHER_SCRIPT) {
      const dict = byLang[code];
      const english = enFlat.filter((k) => {
        const v = get(byLang.en, k);
        // Short all-caps tokens and bare symbols are shared across scripts.
        return typeof v === 'string' && /[a-zA-Z]{4}/.test(v) && get(dict, k) === v;
      });
      expect(english, `${code} still shows English for: ${english.join(', ')}`).toHaveLength(0);
    }
  });
});
