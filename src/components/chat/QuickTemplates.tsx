import { useTranslation } from 'react-i18next';
import { QUICK_TEMPLATE_KEYS } from '../../utils/constants';

interface Props {
  onSelect: (text: string) => void;
}

// Horizontal row of tappable quick-reply chips ("I'm here", "Waiting…", etc).
export function QuickTemplates({ onSelect }: Props) {
  const { t } = useTranslation();
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 pb-2">
      {QUICK_TEMPLATE_KEYS.map((k) => (
        <button
          key={k}
          onClick={() => onSelect(t(k))}
          className="whitespace-nowrap rounded-full bg-black/5 dark:bg-white/10 px-3 py-1.5 text-xs"
        >
          {t(k)}
        </button>
      ))}
    </div>
  );
}
