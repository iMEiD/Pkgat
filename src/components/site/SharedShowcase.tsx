'use client';

import { useEffect, useRef, useState } from 'react';

import { EVENT_TYPE_LABELS } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { ShowcaseItem } from '@/lib/showcase';

/**
 * تصاميم شاركها أصحابها — تُعرض كدعوة كاملة لا كصورة خلفية.
 *
 * البطاقة تحاكي ما يستلمه المدعو فعلاً: الخلفية، واسمه، وباركوده.
 * عرض الخلفية وحدها كان يُظهر التصميم ناقصاً ولا يشرح ما تفعله المنصة،
 * والباركود هو بيت القصيد.
 *
 * الحركة تدخل من الأسفل بتتابع بسيط، عبر transform وopacity وحدهما —
 * لا حركة على خصائص تُعيد التخطيط، فتبقى ناعمة على الجوال. ومن يفضّل
 * تقليل الحركة يرى البطاقات ظاهرة فوراً بلا انتقال.
 */
export function SharedShowcase({
  items,
  qrDataUrl,
}: {
  items: ShowcaseItem[];
  /** باركود الموقع — يُولَّد على الخادم ويُشارك بين كل البطاقات */
  qrDataUrl: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      setShown(true);
      return;
    }

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      ref={ref}
      className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-3 pk-scrollbar sm:grid sm:grid-cols-2 sm:gap-5 sm:overflow-visible lg:grid-cols-3"
    >
      {items.map((item, i) => (
        <figure
          key={item.id}
          style={{ transitionDelay: reduced ? undefined : `${Math.min(i * 80, 480)}ms` }}
          className={cn(
            'group w-[68vw] shrink-0 overflow-hidden rounded-3xl border border-sand-200 bg-surface shadow-soft sm:w-auto',
            'transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)]',
            'hover:-translate-y-1.5 hover:shadow-lift',
            shown ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
          )}
        >
          <div className="relative aspect-[3/4] overflow-hidden bg-sand-100">
            {/* خلفيات التصاميم من مصادر متعددة — img عادي بدل next/image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.backgroundUrl}
              alt={item.title}
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />

            {/* تعتيم متدرّج أسفل البطاقة ليبقى الاسم والباركود مقروءين
                مهما كانت ألوان التصميم */}
            <div
              className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/75 via-black/35 to-transparent"
              aria-hidden="true"
            />

            <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[0.2em] text-white/70">المدعو الكريم</p>
                <p className="mt-1 truncate font-display text-base font-bold text-white drop-shadow">
                  {item.guestName ?? 'ضيف المناسبة'}
                </p>
              </div>

              {qrDataUrl && (
                <span className="shrink-0 rounded-lg bg-white p-1.5 shadow-lift">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrDataUrl}
                    alt="باركود الدخول"
                    width={44}
                    height={44}
                    className="h-11 w-11"
                  />
                </span>
              )}
            </div>
          </div>

          <figcaption className="px-3.5 py-3">
            <p className="truncate text-sm font-bold text-ink">{item.title}</p>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {EVENT_TYPE_LABELS[item.eventType] ?? item.eventType}
            </p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
