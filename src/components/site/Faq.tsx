import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { Reveal } from '@/components/ui/Reveal';
import { cn } from '@/lib/utils/cn';

export interface FaqItem {
  q: string;
  a: string;
}

/**
 * أسئلة شائعة قابلة للطي.
 *
 * مبنية على <details> لا على حالة في جافاسكربت: تعمل قبل تحميل أي
 * سكربت، ويجدها بحث المتصفح داخل الصفحة حتى وهي مطوية.
 *
 * كانت مكرّرة في صفحة الأسعار وحدها؛ استُخرجت لتُعرض مختصرة في
 * الرئيسية أيضاً، فأكثر أسئلة الزائر تسبق وصوله لصفحة الأسعار.
 */
export function Faq({
  items,
  className,
  moreHref,
  moreLabel = 'شوف باقي الأسئلة',
}: {
  items: FaqItem[];
  className?: string;
  /** رابط لبقية الأسئلة — يظهر حين تكون المعروضة مختصرة */
  moreHref?: string;
  moreLabel?: string;
}) {
  if (items.length === 0) return null;

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((item, i) => (
        <Reveal key={item.q} delay={i * 70}>
          <details className="group rounded-2xl border border-sand-200 bg-white/85 p-5 shadow-soft transition-colors open:border-grape-200">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-ink">
              {item.q}
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sand-100 text-ink-soft transition-transform duration-300 group-open:rotate-45">
                <Icon name="plus" className="h-4 w-4" />
              </span>
            </summary>
            <p className="mt-3 text-sm leading-8 text-ink-soft">{item.a}</p>
          </details>
        </Reveal>
      ))}

      {moreHref && (
        <Reveal delay={items.length * 70}>
          <div className="pt-2 text-center">
            <Link
              href={moreHref}
              className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-grape-600 transition-colors hover:text-grape-700"
            >
              {moreLabel}
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        </Reveal>
      )}
    </div>
  );
}
