import { useAppStore } from '../store/useAppStore';

// Convenience access to the global toast queue.
export function useToast() {
  const toasts = useAppStore((s) => s.toasts);
  const addToast = useAppStore((s) => s.addToast);
  const removeToast = useAppStore((s) => s.removeToast);
  return { toasts, addToast, removeToast };
}
