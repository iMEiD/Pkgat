import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export function Card({
  className,
  interactive,
  ...props
}: ComponentProps<'div'> & { interactive?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-sand-200 bg-white/85 shadow-soft backdrop-blur-sm',
        interactive && 'transition-all duration-300 hover:-translate-y-1 hover:shadow-lift',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 p-5 sm:p-6', className)}>
      <div className="min-w-0">
        <h3 className="text-lg font-bold text-ink">{title}</h3>
        {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pb-5 sm:px-6 sm:pb-6', className)} {...props} />;
}

export function CardDivider() {
  return <div className="h-px bg-sand-200" />;
}
