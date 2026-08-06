'use client';

import { useEffect, useRef, useState } from 'react';

import { EVENT_TYPE_LABELS } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { SharedDesign } from '@/lib/types/database';

/**
 * تصاميم شاركها أصحابها.
 *
 * الحركة تدخل من الأسفل عند الوصول للقسم بتتابع بسيط بين البطاقات، وترتفع
 * البطاقة قليلاً عند المرور عليها. كل الحركة عبر transition على transform
 * وopacity وحدهما — لا حركة على خصائص تُعيد التخطيط، فتبقى ناعمة على الجوال.
 *
 * ومن يفضّل تقليل الحركة يرى البطاقات ظاهرة فوراً بلا انتقال.
 */
export function SharedShowcase({ items }: { items: SharedDesign[] }) {
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
    <div ref={ref} className="-mx-1 flex gap-4 overflow-x-auto px-1 pb-3 pk-scrollbar sm:grid sm:grid-cols-3 sm:gap-5 sm:overflow-visible lg:grid-cols-4">
      {items.map((item, i) => (
        <figure
          key={item.id}
          style={{ transitionDelay: reduced ? undefined : `${Math.min(i * 80, 480)}ms` }}
          className={cn(
            'group w-[62vw] shrink-0 overflow-hidden rounded-3xl border border-sand-200 bg-surface shadow-soft sm:w-auto',
            'transition-all duration-700 ease-[cubic-bezier(.22,1,.36,1)]',
            'hover:-translate-y-1.5 hover:shadow-lift',
            shown ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0',
          )}
        >
          <div className="aspect-[3/4] overflow-hidden bg-sand-100">
            {/* خلفيات التصاميم من مصادر متعددة — img عادي بدل next/image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.background_url}
              alt={item.title}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
          <figcaption className="px-3 py-2.5">
            <p className="truncate text-sm font-bold text-ink">{item.title}</p>
            <p className="mt-0.5 text-[11px] text-ink-faint">
              {EVENT_TYPE_LABELS[item.event_type] ?? item.event_type}
            </p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
