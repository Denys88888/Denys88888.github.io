import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES } from '../utils/constants';
import { storage } from '../services/storageService';

// Language selection + persistence.
export function useLanguage() {
  const { i18n } = useTranslation();

  const setLanguage = useCallback(
    (code: string) => {
      void i18n.changeLanguage(code);
      storage.setLang(code);
    },
    [i18n]
  );

  return {
    language: i18n.language,
    languages: SUPPORTED_LANGUAGES,
    setLanguage,
  };
}
