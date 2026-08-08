'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils/cn';

/**
 * زر «ابدأ مجاناً» ثابت أثناء التمرير.
 *
 * يظهر بعد تجاوز قسم البطل — فيه الزر نفسه، وتكراره فوقه ضجيج — ويختفي
 * عند بلوغ الدعوة النهائية والفوتر، لأن هناك دعوة أوضح منه.
 *
 * مثبّت في الزاوية المقابلة لزر الواتساب حتى لا يتزاحما على الجوال.
 */
export function StickyCta({
  heroId,
  hideAtId,
  label = 'ابدأ مجاناً',
  href = '/signup',
}: {
  /** قسم البطل — يظهر الزر بعد تجاوزه */
  heroId: string;
  /** القسم الذي يختفي عنده — الدعوة النهائية عادةً */
  hideAtId: string;
  label?: string;
  href?: string;
}) {
  const [pastHero, setPastHero] = useState(false);
  const [atCta, setAtCta] = useState(false);
  const [atFooter, setAtFooter] = useState(false);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];

    const watch = (
      node: Element | null,
      set: (visible: boolean) => void,
      rootMargin?: string,
    ) => {
      if (!node) return;
      const o = new IntersectionObserver(([entry]) => set(entry.isIntersecting), {
        threshold: 0,
        rootMargin,
      });
      o.observe(node);
      observers.push(o);
    };

    watch(document.getElementById(heroId), (visible) => setPastHero(!visible));

    // هامش سفلي موجب: يُخفى قبل وصول الدعوة النهائية بقليل، فلا يلتقي
    // زران بنفس الدعوة في لقطة واحدة
    watch(document.getElementById(hideAtId), setAtCta, '0px 0px 120px 0px');

    // الفوتر يُراقَب أيضاً: عند أسفل الصفحة تكون الدعوة النهائية قد
    // خرجت من أعلى النافذة، فيعود الزر للظهور فوق الفوتر لولا هذا.
    watch(document.querySelector('footer'), setAtFooter);

    return () => observers.forEach((o) => o.disconnect());
  }, [heroId, hideAtId]);

  const shown = pastHero && !atCta && !atFooter;

  return (
    <Link
      href={href}
      aria-hidden={!shown}
      tabIndex={shown ? undefined : -1}
      className={cn(
        'fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-grape-500 py-3 pe-3.5 ps-5',
        'text-sm font-bold text-white shadow-pop transition-all duration-300',
        'hover:bg-grape-600 hover:shadow-lift active:scale-[0.97]',
        shown ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
      )}
    >
      {label}
      <Icon name="arrow" className="h-4 w-4" />
    </Link>
  );
}
