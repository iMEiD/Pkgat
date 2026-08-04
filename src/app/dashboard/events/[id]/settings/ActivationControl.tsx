'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Icon } from '@/components/ui/Icon';
import { setActivationOverride } from '@/lib/actions/events';
import { formatDateTime } from '@/lib/utils/format';
import { activationMoment, expiryMoment } from '@/lib/utils/event-phase';
import type { EventRow } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

type Override = 'auto' | 'open' | 'closed';

const OPTIONS: { value: Override; label: string; hint: string; icon: string; tone: string }[] = [
  {
    value: 'auto',
    label: 'تلقائي',
    hint: 'تتفعّل وتنتهي حسب توقيت المناسبة',
    icon: 'calendar',
    tone: 'border-grape-400 bg-grape-50 text-grape-600',
  },
  {
    value: 'open',
    label: 'مفعّلة الآن',
    hint: 'اسمح بالمسح فوراً مهما كان الوقت',
    icon: 'check',
    tone: 'border-mint-300 bg-mint-50 text-mint-600',
  },
  {
    value: 'closed',
    label: 'موقوفة الآن',
    hint: 'أوقف المسح فوراً مهما كان الوقت',
    icon: 'shield',
    tone: 'border-coral-300 bg-coral-50 text-coral-600',
  },
];

export function ActivationControl({ event }: { event: EventRow }) {
  const router = useRouter();
  const [current, setCurrent] = useState<Override>(event.activation_override ?? 'auto');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(value: Override) {
    if (value === current) return;
    setError(null);
    const previous = current;
    setCurrent(value);

    startTransition(async () => {
      const res = await setActivationOverride(event.id, value);
      if (!res.ok) {
        setCurrent(previous);
        setError(res.error ?? 'تعذّر التغيير.');
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      <div className="grid gap-2 sm:grid-cols-3">
        {OPTIONS.map((option) => {
          const active = current === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => choose(option.value)}
              disabled={pending}
              className={cn(
                'rounded-2xl border-2 p-4 text-right transition-all duration-200 disabled:opacity-60',
                active ? option.tone : 'border-sand-200 bg-white hover:border-sand-400',
              )}
            >
              <span className="flex items-center gap-2">
                <Icon
                  name={option.icon}
                  className={cn('h-4 w-4', active ? '' : 'text-ink-faint')}
                />
                <span className={cn('text-sm font-bold', active ? '' : 'text-ink')}>
                  {option.label}
                </span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-ink-soft">{option.hint}</span>
            </button>
          );
        })}
      </div>

      {current === 'auto' ? (
        <div className="space-y-1 rounded-2xl bg-sand-50 p-4 text-xs text-ink-soft">
          <p>
            تتفعّل الباركودات:{' '}
            <span className="font-bold text-ink">{formatDateTime(activationMoment(event))}</span>
          </p>
          <p>
            تنتهي صلاحيتها:{' '}
            <span className="font-bold text-ink">{formatDateTime(expiryMoment(event))}</span>
          </p>
        </div>
      ) : (
        <Alert tone={current === 'open' ? 'success' : 'warning'}>
          {current === 'open'
            ? 'الباركودات مفعّلة يدوياً الآن — التوقيت التلقائي متجاوَز حتى ترجعه لـ«تلقائي».'
            : 'الباركودات موقوفة يدوياً — لن يدخل أي مدعو حتى ترجعها لـ«تلقائي» أو «مفعّلة».'}
        </Alert>
      )}
    </div>
  );
}
