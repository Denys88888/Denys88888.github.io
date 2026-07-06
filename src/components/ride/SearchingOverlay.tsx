import { useTranslation } from 'react-i18next';

export function SearchingOverlay() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 py-8">
      <div className="relative h-16 w-16">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/30" />
        <span className="absolute inset-2 animate-pulse rounded-full bg-primary/50" />
        <span className="absolute inset-4 rounded-full bg-primary" />
      </div>
      <p className="text-sm font-medium opacity-70">{t('ride.searchingDriver')}</p>
      <p className="text-xs opacity-40">{t('ride.searchingHint')}</p>
    </div>
  );
}
