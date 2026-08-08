'use client';

import { useEffect, useRef, useState } from 'react';

import { renderInvitation } from '@/lib/design/render';
import { SITE_QR_TARGET } from '@/lib/site-qr';
import { EVENT_TYPE_LABELS } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { ShowcaseItem } from '@/lib/showcase';

/**
 * تصاميم شاركها أصحابها — تُرسم دعوةً كاملة لا خلفية مقتطعة.
 *
 * البطاقة تمرّ بنفس دالة renderInvitation التي تولّد الدعوات الحقيقية،
 * فيظهر ما صنعه العميل كما هو: اسم المناسبة وتاريخها ومكانها وكل نص
 * أضافه، بخطوطه وألوانه ومواضعه. عرض الخلفية وحدها كان يُظهر ورقة
 * فارغة تُنسب لعميل — وهي ليست عمله.
 *
 * الباركود يشير لموقع بكجات لا لمدعوّ حقيقي، فالشكل صادق ومن يمسحه
 * يصل للموقع.
 *
 * الرسم يبدأ عند دخول القسم الشاشة فقط: ست لوحات رسم دفعةً واحدة عند
 * فتح الصفحة تُثقل الجوال بلا داعٍ.
 */
export function SharedShowcase({ items }: { items: ShowcaseItem[] }) {
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
          <InvitationCard item={item} render={shown} />

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

/**
 * الدعوة الواحدة.
 * تُرسم على لوحة رسم متى توفّر التصميم، وإلا عُرضت صورة الخلفية —
 * فالتصاميم المُضافة يدوياً قد تكون صوراً جاهزة بلا كائن تصميم.
 */
function InvitationCard({ item, render }: { item: ShowcaseItem; render: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  const design = item.design;
  const ratio = design ? `${design.width || 1080} / ${design.height || 1920}` : '3 / 4';

  useEffect(() => {
    if (!render || !design) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    let alive = true;
    void renderInvitation(
      { design, guestName: item.guestName || design.name.sample || 'ضيف المناسبة', code: SITE_QR_TARGET },
      canvas,
    ).catch(() => {
      // خلفية متعذّرة أو خط لم يُحمَّل — نسقط للصورة بدل بطاقة فارغة
      if (alive) setFailed(true);
    });

    return () => {
      alive = false;
    };
  }, [render, design, item.guestName]);

  if (!design || failed) {
    return (
      <div className="aspect-[3/4] overflow-hidden bg-sand-100">
        {/* خلفيات التصاميم من مصادر متعددة — img عادي بدل next/image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={item.backgroundUrl}
          alt={item.title}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-sand-100" style={{ aspectRatio: ratio }}>
      <canvas
        ref={canvasRef}
        aria-label={`دعوة ${item.title}`}
        role="img"
        className="block h-full w-full transition-transform duration-500 group-hover:scale-105"
      />
    </div>
  );
}
