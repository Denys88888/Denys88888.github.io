import { useEffect } from 'react';
import { useToast } from '../../hooks/useToast';
import type { ToastMessage } from '../../types';
import { cn } from '../../utils/helpers';

const tones: Record<ToastMessage['type'], string> = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-info text-white',
  warning: 'bg-warning text-black',
};

function ToastItem({ toast }: { toast: ToastMessage }) {
  const { removeToast } = useToast();
  useEffect(() => {
    const t = setTimeout(() => removeToast(toast.id), 4000);
    return () => clearTimeout(t);
  }, [toast.id, removeToast]);
  return (
    <div
      className={cn(
        'pointer-events-auto rounded-xl px-4 py-3 text-sm font-medium shadow-card animate-toast-in',
        tones[toast.type]
      )}
      onClick={() => removeToast(toast.id)}
      role="alert"
    >
      {toast.message}
    </div>
  );
}

// Fixed top-center stack; each toast auto-dismisses after 4s.
export function ToastContainer() {
  const { toasts } = useToast();
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}
