import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

interface Props {
  open: boolean;
  title?: string;
  children: ReactNode;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  cancelLabel?: string;
}

// Centered modal dialog with a scrim. Bottom-sheet-style rounded top on mobile.
export function Modal({
  open,
  title,
  children,
  onClose,
  onConfirm,
  confirmLabel,
  confirmVariant = 'primary',
  cancelLabel,
}: Props) {
  const { t } = useTranslation();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-md surface rounded-t-2xl sm:rounded-2xl p-5 animate-slide-up">
        {title && <h3 className="mb-2">{title}</h3>}
        <div className="text-sm text-text-light/80 dark:text-text-dark/80">{children}</div>
        <div className="mt-5 flex gap-3">
          <Button variant="ghost" fullWidth onClick={onClose}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          {onConfirm && (
            <Button variant={confirmVariant} fullWidth onClick={onConfirm}>
              {confirmLabel ?? t('common.confirm')}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
