import { cn } from '../../utils/helpers';

interface Props {
  name: string;
  src?: string;
  size?: number;
  className?: string;
}

// Circular avatar with an initials fallback derived from the name.
export function Avatar({ name, src, size = 40, className }: Props) {
  const initials = name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary/20 font-semibold text-primary overflow-hidden',
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {src ? (
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        initials || '?'
      )}
    </div>
  );
}
