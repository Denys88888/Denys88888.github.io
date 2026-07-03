import type { ReactNode } from 'react';
import { cn } from '../../utils/helpers';

type Tone = 'primary' | 'success' | 'danger' | 'warning' | 'info' | 'neutral';

const tones: Record<Tone, string> = {
  primary: 'bg-primary/15 text-primary',
  success: 'bg-success/15 text-success',
  danger: 'bg-danger/15 text-danger',
  warning: 'bg-warning/20 text-[#B37A00]',
  info: 'bg-info/15 text-info',
  neutral: 'bg-black/10 text-text-light/70 dark:bg-white/10 dark:text-text-dark/70',
};

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}
