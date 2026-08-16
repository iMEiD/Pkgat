'use client';

import { useEffect, useRef, useState } from 'react';

import { arabicDigits } from '@/lib/utils/format';

const groupFmt = new Intl.NumberFormat('en-US');

/**
 * رقم يعدّ صاعداً حين يدخل الشاشة.
 *
 * ثلاثة قرارات:
 *
 * ١) يبدأ عند الظهور لا عند تحميل الصفحة. الشريط أسفل الصفحة، ولو عدّ
 *    قبل أن يصل إليه الزائر لرأى الرقم النهائي ساكناً — أي لا حركة
 *    أصلاً، مع تكلفتها.
 *
 * ٢) يعدّ مرة واحدة. التكرار في كل تمريرة يحوّل الأثر من لمسة إلى
 *    إزعاج، ويسرق الانتباه من المحتوى كلما مرّ عليه.
 *
 * ٣) المنحنى يبطئ في آخره (easeOutExpo): البداية سريعة تلفت العين،
 *    والنهاية هادئة تُقرأ. والتباطؤ الخطي يجعل الرقم يقف فجأة.
 *
 * ويُرسم الرقم النهائي في الخادم ثم يُستبدل بالعدّاد بعد التركيب، فمن
 * عطّل الجافاسكربت أو زحف محرك بحث يرى الرقم كاملاً لا صفراً.
 */
export function CountUp({
  value,
  duration = 1400,
  className,
}: {
  value: number;
  /** بالمللي ثانية — أطول من ثانيتين يصير انتظاراً لا حركة */
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [shown, setShown] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // من طلب تقليل الحركة يُعطى الرقم مباشرة
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }

    let frame = 0;
    let started = false;

    const run = () => {
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min((now - start) / duration, 1);
        // easeOutExpo
        const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
        setShown(Math.round(value * eased));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || started) return;
        started = true;
        io.disconnect();
        run();
      },
      { threshold: 0.4 },
    );

    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      {/* قبل التركيب: الرقم النهائي كما رسمه الخادم */}
      {arabicDigits(groupFmt.format(shown ?? value))}
    </span>
  );
}
