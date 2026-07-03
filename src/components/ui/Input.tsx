import type { InputHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/helpers';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: ReactNode;
  error?: string;
}

// Text input primitive: 8px radius, primary focus ring, optional leading icon.
export function Input({ label, icon, error, className, ...rest }: Props) {
  return (
    <label className="block">
      {label && (
        <span className="mb-1 block text-sm font-medium text-text-light/70 dark:text-text-dark/70">
          {label}
        </span>
      )}
      <span className="relative flex items-center">
        {icon && <span className="absolute left-3 text-text-light/50 dark:text-text-dark/50">{icon}</span>}
        <input
          className={cn(
            'w-full rounded-lg border border-[#E0E0E0] dark:border-white/15 bg-surface-light dark:bg-surface-dark',
            'px-3 py-2.5 text-base outline-none transition',
            'focus:border-primary focus:ring-2 focus:ring-primary/40',
            icon && 'pl-9',
            error && 'border-danger focus:ring-danger/40',
            className
          )}
          {...rest}
        />
      </span>
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}
