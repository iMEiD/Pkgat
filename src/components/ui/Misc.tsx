import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-sand-300 bg-sand-50/60 px-6 py-14 text-center',
        className,
      )}
    >
      {icon && <div className="mb-4 text-4xl">{icon}</div>}
      <h3 className="text-base font-bold text-ink">{title}</h3>
      {description && <p className="mt-1.5 max-w-sm text-sm text-ink-soft">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = 'grape',
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'grape' | 'coral' | 'mint' | 'sky' | 'sunny' | 'rose';
  className?: string;
}) {
  const bars: Record<string, string> = {
    grape: 'bg-grape-500',
    coral: 'bg-coral-500',
    mint: 'bg-mint-500',
    sky: 'bg-sky-500',
    sunny: 'bg-sunny-500',
    rose: 'bg-rose-500',
  };
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-2xl border border-sand-200 bg-white p-4 shadow-soft',
        className,
      )}
    >
      <span className={cn('absolute inset-y-0 right-0 w-1', bars[tone])} />
      <p className="text-xs font-semibold text-ink-faint">{label}</p>
      <p className="mt-1 font-display text-2xl font-black tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-soft">{hint}</p>}
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  tone = 'grape',
  className,
}: {
  value: number;
  max: number;
  tone?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const bars: Record<string, string> = {
    grape: 'bg-grape-500',
    coral: 'bg-coral-500',
    mint: 'bg-mint-500',
    sky: 'bg-sky-500',
    sunny: 'bg-sunny-500',
    rose: 'bg-rose-500',
    sand: 'bg-sand-400',
  };
  return (
    <div
      className={cn('h-2 w-full overflow-hidden rounded-full bg-sand-200', className)}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn('h-full rounded-full transition-all duration-500', bars[tone] ?? bars.grape)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function SectionTitle({
  eyebrow,
  title,
  subtitle,
  center,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  center?: boolean;
  className?: string;
}) {
  return (
    <div className={cn(center && 'mx-auto max-w-2xl text-center', className)}>
      {eyebrow && (
        <span className="inline-block rounded-full bg-grape-50 px-3 py-1 text-xs font-bold text-grape-600">
          {eyebrow}
        </span>
      )}
      <h2 className="mt-3 font-display text-3xl font-black leading-tight text-ink pk-balance sm:text-4xl">
        {title}
      </h2>
      {subtitle && <p className="mt-3 text-base leading-8 text-ink-soft">{subtitle}</p>}
    </div>
  );
}
