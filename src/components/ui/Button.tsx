import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/helpers';

type Variant = 'primary' | 'success' | 'danger' | 'ghost' | 'outline';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  fullWidth?: boolean;
  loading?: boolean;
  children: ReactNode;
}

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:brightness-110',
  success: 'bg-success text-white hover:brightness-110',
  danger: 'bg-danger text-white hover:brightness-110',
  ghost: 'bg-transparent text-primary hover:bg-primary/10',
  outline: 'border border-primary text-primary hover:bg-primary/10',
};

// Primary button primitive: 24px radius, press-scale feedback, loading state.
export function Button({
  variant = 'primary',
  fullWidth,
  loading,
  disabled,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-btn px-6 py-3.5 text-base font-semibold',
        'transition-transform duration-100 active:scale-95 hover:scale-[1.02]',
        'disabled:opacity-50 disabled:pointer-events-none',
        variants[variant],
        fullWidth && 'w-full',
        className
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      )}
      {children}
    </button>
  );
}
