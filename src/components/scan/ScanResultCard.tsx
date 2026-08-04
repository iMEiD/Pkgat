'use client';

import { useEffect } from 'react';

import { Button } from '@/components/ui/Button';
import { formatTime } from '@/lib/utils/format';
import { tagHex } from '@/lib/design/defaults';
import type { ScanResponse } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

/**
 * بطاقة نتيجة المسح — الألوان هي الرسالة الأساسية:
 * أخضر = دخول ناجح | أحمر = مكرر/ممنوع | رمادي = غير صالح أو خارج التوقيت.
 */
const STYLES: Record<
  ScanResponse['result'],
  { box: string; badge: string; icon: string; title: string }
> = {
  granted: {
    box: 'bg-mint-500 text-white',
    badge: 'bg-white/20',
    icon: '✓',
    title: 'دخول ناجح',
  },
  override: {
    box: 'bg-sunny-500 text-ink',
    badge: 'bg-ink/10',
    icon: '!',
    title: 'سُمح بالدخول (تجاوز يدوي)',
  },
  duplicate: {
    box: 'bg-coral-500 text-white',
    badge: 'bg-white/20',
    icon: '✕',
    title: 'مستخدم مسبقاً',
  },
  inactive: {
    box: 'bg-ink-soft text-white',
    badge: 'bg-white/15',
    icon: '⏳',
    title: 'الباركود غير مفعّل بعد',
  },
  expired: {
    box: 'bg-ink-soft text-white',
    badge: 'bg-white/15',
    icon: '⌛',
    title: 'انتهت صلاحية الباركود',
  },
  invalid: {
    box: 'bg-ink-soft text-white',
    badge: 'bg-white/15',
    icon: '?',
    title: 'باركود غير صالح',
  },
};

export function ScanResultCard({
  result,
  busy,
  onDismiss,
  onOverride,
}: {
  result: ScanResponse;
  busy?: boolean;
  onDismiss: () => void;
  onOverride?: () => void;
}) {
  const style = STYLES[result.result] ?? STYLES.invalid;

  // النتائج الناجحة تختفي تلقائياً حتى يستمر الطابور بلا ضغطات إضافية.
  // الحالات التي تحتاج قراراً (مكرر/تجاوز) تبقى حتى يغلقها المسؤول.
  useEffect(() => {
    if (result.result !== 'granted') return;
    const timer = setTimeout(onDismiss, 2600);
    return () => clearTimeout(timer);
  }, [result, onDismiss]);

  return (
    <div className={cn('rounded-3xl p-4 shadow-lift animate-pop-in', style.box)}>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl font-bold',
            style.badge,
          )}
        >
          {style.icon}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{style.title}</p>

          {result.guest ? (
            <>
              <p className="mt-0.5 truncate font-display text-xl font-bold">
                {result.guest.name}
              </p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                {result.guest.tag && (
                  <span
                    className="rounded-full px-2 py-0.5 font-bold text-white"
                    style={{ backgroundColor: tagHex(result.guest.tag.color) }}
                  >
                    {result.guest.tag.name}
                  </span>
                )}
                {result.guest.seats > 1 && (
                  <span className={cn('rounded-full px-2 py-0.5 font-bold', style.badge)}>
                    {result.guest.seats} أشخاص
                  </span>
                )}
                {result.result === 'duplicate' && result.guest.checked_in_at && (
                  <span className="opacity-90">
                    دخل الساعة {formatTime(result.guest.checked_in_at)}
                  </span>
                )}
              </div>
            </>
          ) : (
            <p className="mt-1 text-sm opacity-90">
              {result.message ?? 'هذا الباركود لا يخص هذه المناسبة.'}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          aria-label="إغلاق"
          className={cn('rounded-full p-1.5 transition-opacity hover:opacity-70', style.badge)}
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {onOverride && (
        <div className="mt-3 border-t border-white/25 pt-3">
          <p className="text-xs opacity-90">
            لحالات مثل دخول عائلة كاملة بباركود واحد. كل تجاوز يُسجَّل باسمك ووقته للمراجعة.
          </p>
          <Button
            onClick={onOverride}
            loading={busy}
            size="sm"
            className="mt-2 w-full bg-white text-ink shadow-none hover:bg-white/90"
          >
            تجاوز والسماح بالدخول
          </Button>
        </div>
      )}
    </div>
  );
}
