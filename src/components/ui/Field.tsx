import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

const control =
  'w-full rounded-2xl border border-sand-300 bg-white px-4 py-3 text-[15px] text-ink ' +
  'placeholder:text-ink-faint transition-colors duration-200 ' +
  'hover:border-sand-400 focus:border-grape-400 disabled:bg-sand-50 disabled:text-ink-faint';

export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
          {label}
          {required && <span className="text-coral-500"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-coral-600">{error}</p>
      ) : (
        hint && <p className="text-xs text-ink-faint">{hint}</p>
      )}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(control, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(control, 'min-h-28 resize-y leading-7', className)} {...props} />;
}

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select className={cn(control, 'cursor-pointer appearance-none bg-white pl-10', className)} {...props}>
      {children}
    </select>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-sand-200 bg-white p-4 text-right transition-colors hover:border-sand-300"
    >
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-ink-soft">{description}</span>}
      </span>
      <span
        className={cn(
          'relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
          checked ? 'bg-grape-500' : 'bg-sand-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200',
            checked ? 'right-0.5' : 'right-[22px]',
          )}
        />
      </span>
    </button>
  );
}

export function Slider({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  display,
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  label: ReactNode;
  display?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="tabular-nums text-ink-soft">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-sand-200 accent-grape-500"
      />
    </div>
  );
}

export function ColorInput({
  value,
  onChange,
  label,
  allowTransparent,
}: {
  value: string;
  onChange: (v: string) => void;
  label: ReactNode;
  allowTransparent?: boolean;
}) {
  const isTransparent = value === 'transparent';
  return (
    <div className="space-y-1.5">
      <span className="block text-sm font-semibold text-ink">{label}</span>
      <div className="flex items-center gap-2">
        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-sand-300">
          {isTransparent ? (
            <div
              className="h-full w-full"
              style={{
                backgroundImage:
                  'linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%)',
                backgroundSize: '10px 10px',
                backgroundPosition: '0 0,0 5px,5px -5px,-5px 0',
              }}
            />
          ) : (
            <input
              type="color"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="absolute inset-[-25%] h-[150%] w-[150%] cursor-pointer border-0 p-0"
              aria-label={typeof label === 'string' ? label : undefined}
            />
          )}
        </div>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          dir="ltr"
          className={cn(control, 'py-2.5 font-mono text-sm')}
        />
        {allowTransparent && (
          <button
            type="button"
            onClick={() => onChange(isTransparent ? '#FFFFFF' : 'transparent')}
            className={cn(
              'h-11 shrink-0 rounded-xl border px-3 text-xs font-semibold transition-colors',
              isTransparent
                ? 'border-grape-400 bg-grape-50 text-grape-600'
                : 'border-sand-300 text-ink-soft hover:bg-sand-50',
            )}
          >
            شفاف
          </button>
        )}
      </div>
    </div>
  );
}
