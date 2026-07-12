import { useTranslation } from 'react-i18next';
import { useLanguage } from '../../hooks/useLanguage';

// Dropdown of all 20 supported languages with flags.
export function LanguageSelector() {
  const { t } = useTranslation();
  const { language, languages, setLanguage } = useLanguage();
  const base = language.split('-')[0];
  return (
    <select
      value={base}
      onChange={(e) => setLanguage(e.target.value)}
      className="rounded-lg border border-[#E0E0E0] dark:border-white/15 bg-surface-light dark:bg-surface-dark px-3 py-2 text-base text-text-light dark:text-text-dark outline-none focus:ring-2 focus:ring-primary/40"
      aria-label={t('common.language')}
    >
      {languages.map((l) => (
        <option key={l.code} value={l.code}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
