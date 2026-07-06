import { describe, it, expect } from 'vitest';
import { SUPPORTED_LANGUAGES } from './utils/constants';

// Every declared language must ship a translation.json with the core keys the UI
// renders. Missing keys would fall back to English, but core screens should be
// localized, so we assert their presence here.
const modules = import.meta.glob('./locales/*/translation.json', { eager: true });

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
});
