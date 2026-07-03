import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { LANG_KEY } from './utils/constants';

// Bundle every locale at build time so the PWA works fully offline. English is
// the source of truth; other languages fall back to it per-key for any gaps.
const modules = import.meta.glob('./locales/*/translation.json', { eager: true });

const resources: Record<string, { translation: Record<string, unknown> }> = {};
for (const [path, mod] of Object.entries(modules)) {
  const match = path.match(/\.\/locales\/([^/]+)\/translation\.json$/);
  if (!match) continue;
  resources[match[1]] = {
    translation: (mod as { default: Record<string, unknown> }).default,
  };
}

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    supportedLngs: Object.keys(resources),
    nonExplicitSupportedLngs: true,
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: LANG_KEY,
      caches: ['localStorage'],
    },
  });

export default i18n;
