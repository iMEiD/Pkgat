import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

const tones: Record<string, string> = {
  grape: 'bg-grape-50 text-grape-700 border-grape-200',
  coral: 'bg-coral-50 text-coral-600 border-coral-100',
  mint: 'bg-mint-50 text-mint-600 border-mint-100',
  sky: 'bg-sky-50 text-sky-600 border-sky-100',
  rose: 'bg-rose-50 text-rose-600 border-rose-100',
  sunny: 'bg-sunny-50 text-sunny-600 border-sunny-100',
  sand: 'bg-sand-100 text-ink-soft border-sand-300',
};

export function Badge({
  tone = 'sand',
  children,
  className,
  dot,
}: {
  tone?: keyof typeof tones | string;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold',
        tones[tone] ?? tones.sand,
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

const statusTone: Record<string, string> = {
  draft: 'sand',
  ready: 'sky',
  live: 'mint',
  ended: 'grape',
  archived: 'sand',
  inactive: 'sand',
  active: 'mint',
  used: 'coral',
  expired: 'sand',
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <Badge tone={statusTone[status] ?? 'sand'} dot>
      {label}
    </Badge>
  );
}
