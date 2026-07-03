import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/helpers';

interface Props extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function Card({ className, children, ...rest }: Props) {
  return (
    <div className={cn('card', className)} {...rest}>
      {children}
    </div>
  );
}
