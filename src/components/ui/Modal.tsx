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
    <div className="fixed inset-0 z-modal flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50"
        role="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={onClose}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') && onClose()}
      />
      {/* On a phone this is a bottom sheet (items-end above), so its buttons
          land exactly where Android draws the system navigation bar — Confirm
          was sitting under the home button and could not be tapped. --safe-bottom
          is 0 on desktop, where the dialog is centred, so the padding stays p-5
          there. */}
      {/* role/aria-modal: without them this is a div that happens to look like
          a dialog — a screen reader announces neither that one opened nor what
          it is asking, and anything looking for a dialog (a test, an assistive
          tool) finds nothing. aria-labelledby gives it the title as its name. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? 'modal-title' : undefined}
        className="relative z-10 w-full sm:max-w-md surface rounded-t-2xl sm:rounded-2xl p-5 animate-slide-up"
        style={{ paddingBottom: 'calc(1.25rem + var(--safe-bottom))' }}
      >
        {title && (
          <h3 id="modal-title" className="mb-2">
            {title}
          </h3>
        )}
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
