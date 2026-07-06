import { cn } from '../../utils/helpers';

export function LoadingSpinner({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        'inline-block animate-spin rounded-full border-2 border-primary/30 border-t-primary',
        className
      )}
      style={{ width: size, height: size }}
      role="status"
      aria-label="Loading"
    />
  );
}
