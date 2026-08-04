import type { ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

type Tone = 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, { box: string; icon: string; path: ReactNode }> = {
  info: {
    box: 'border-sky-100 bg-sky-50 text-sky-600',
    icon: 'text-sky-500',
    path: <path d="M12 16v-5m0-3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  },
  success: {
    box: 'border-mint-100 bg-mint-50 text-mint-600',
    icon: 'text-mint-500',
    path: <path d="m8 12.5 2.5 2.5L16 9.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  },
  warning: {
    box: 'border-sunny-100 bg-sunny-50 text-sunny-600',
    icon: 'text-sunny-500',
    path: <path d="M12 9v4m0 3h.01M10.3 3.8 2.4 17.4A2 2 0 0 0 4.1 20.4h15.8a2 2 0 0 0 1.7-3L13.7 3.8a2 2 0 0 0-3.4 0Z" />,
  },
  danger: {
    box: 'border-coral-100 bg-coral-50 text-coral-600',
    icon: 'text-coral-500',
    path: <path d="M12 8v4m0 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
  },
};

export function Alert({
  tone = 'info',
  title,
  children,
  className,
  action,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const t = tones[tone];
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-2xl border p-4 animate-pop-in', t.box, className)}
    >
      <svg
        className={cn('mt-0.5 h-5 w-5 shrink-0', t.icon)}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {t.path}
      </svg>
      <div className="min-w-0 flex-1 text-sm">
        {title && <p className="font-bold">{title}</p>}
        {children && <div className={cn('leading-6', title && 'mt-1 opacity-90')}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}
