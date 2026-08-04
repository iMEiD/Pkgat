import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-all duration-200 ' +
  'active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 select-none whitespace-nowrap';

const variants: Record<Variant, string> = {
  primary: 'bg-grape-500 text-white shadow-pop hover:bg-grape-600 hover:-translate-y-0.5',
  secondary: 'bg-sand-100 text-ink border border-sand-300 hover:bg-sand-200 hover:-translate-y-0.5',
  ghost: 'text-ink-soft hover:bg-sand-100 hover:text-ink',
  outline: 'border-2 border-grape-500 text-grape-600 hover:bg-grape-50',
  danger: 'bg-coral-500 text-white hover:bg-coral-600 hover:-translate-y-0.5',
  success: 'bg-mint-500 text-white hover:bg-mint-600 hover:-translate-y-0.5',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-6 text-[15px]',
  lg: 'h-14 px-8 text-base',
};

interface CommonProps {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  children?: ReactNode;
  className?: string;
}

function classes({ variant = 'primary', size = 'md', fullWidth, className }: CommonProps) {
  return cn(base, variants[variant], sizes[size], fullWidth && 'w-full', className);
}

export function Button({
  variant,
  size,
  loading,
  fullWidth,
  className,
  children,
  disabled,
  ...props
}: CommonProps & ComponentProps<'button'>) {
  return (
    <button
      className={classes({ variant, size, fullWidth, className })}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  children,
  ...props
}: CommonProps & ComponentProps<typeof Link>) {
  return (
    <Link className={classes({ variant, size, fullWidth, className })} {...props}>
      {children}
    </Link>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn('h-4 w-4 animate-spin', className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path
        d="M22 12a10 10 0 0 1-10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
