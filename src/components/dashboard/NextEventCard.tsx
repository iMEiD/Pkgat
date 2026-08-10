import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { countAr, formatDateTime, relativeTime } from '@/lib/utils/format';
import { PHASE_LABELS, PHASE_TONES } from '@/lib/utils/event-phase';
import { cn } from '@/lib/utils/cn';
import type { EventReadiness } from '@/lib/data/dashboard';

/**
 * أقرب مناسبة، وما ينقصها لتكون جاهزة.
 *
 * اللوحة كانت تعرض المناسبات كبطاقات متساوية، فلا شيء يقول لصاحبها
 * «هذه بعد ثلاثة أيام وينقصها مسؤول مسح». هذه البطاقة تجيب سؤاله
 * الأول: ما الذي عليّ فعله الآن؟
 */
export function NextEventCard({ item }: { item: EventReadiness }) {
  const { event, guestCount, scannerCount, hasDesign, phase, overQuota } = item;
  const href = `/dashboard/events/${event.id}`;

  const steps = [
    { done: hasDesign, label: 'التصميم', href: `${href}/design` },
    { done: guestCount > 0, label: 'المدعوون', href: `${href}/guests` },
    { done: scannerCount > 0, label: 'مسؤول المسح', href: `${href}/scanners` },
  ];
  const ready = steps.every((s) => s.done) && !overQuota;

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-ink-faint">مناسبتك القادمة</span>
            <Badge tone={PHASE_TONES[phase]} dot>
              {PHASE_LABELS[phase]}
            </Badge>
          </div>

          <h2 className="mt-1.5 truncate font-display text-2xl font-bold text-ink">
            <Link href={href} className="transition-colors hover:text-grape-600">
              {event.title}
            </Link>
          </h2>

          <p className="mt-1 text-sm text-ink-soft">
            {formatDateTime(event.starts_at)}
            <span className="px-1.5 text-ink-faint">·</span>
            <span className="font-bold text-grape-600">{relativeTime(event.starts_at)}</span>
          </p>
        </div>

        <ButtonLink href={href} variant={ready ? 'secondary' : 'primary'} size="sm">
          {ready ? 'افتح المناسبة' : 'أكمل الناقص'}
          <Icon name="arrow" className="h-4 w-4" />
        </ButtonLink>
      </div>

      <div className="border-t border-sand-200 bg-sand-50/60 px-5 py-4 sm:px-6">
        {ready ? (
          <p className="flex items-center gap-2 text-sm font-bold text-mint-600">
            <Icon name="check" className="h-4 w-4" strokeWidth={2.5} />
            جاهزة — التصميم والمدعوون ومسؤول المسح كلها مكتملة
          </p>
        ) : (
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2.5">
            {steps.map((s) => (
              <li key={s.label}>
                {s.done ? (
                  <span className="flex items-center gap-1.5 text-sm text-ink-soft">
                    <Icon name="check" className="h-4 w-4 text-mint-500" strokeWidth={2.5} />
                    {s.label}
                  </span>
                ) : (
                  <Link
                    href={s.href}
                    className="flex min-h-11 items-center gap-1.5 text-sm font-bold text-ink transition-colors hover:text-grape-600"
                  >
                    <span
                      className="h-4 w-4 shrink-0 rounded-full border-2 border-dashed border-coral-400"
                      aria-hidden="true"
                    />
                    {s.label}
                    <span className="text-xs font-normal text-ink-faint">— ناقص</span>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}

        {overQuota && (
          <p
            className={cn(
              'mt-3 flex flex-wrap items-center gap-1.5 rounded-2xl bg-coral-50 px-3.5 py-2.5',
              'text-sm leading-6 text-coral-700',
            )}
          >
            <Icon name="shield" className="h-4 w-4 shrink-0" />
            <span>
              <span className="font-bold">
                {countAr(guestCount - (item.limit ?? 0), 'مدعو', 'مدعوين', 'مدعوين', 'مدعواً')} خارج
                الحصة
              </span>{' '}
              — باركوداتهم لن تعمل على الباب.
            </span>
            <Link href="/pricing" className="font-bold underline underline-offset-4">
              شوف الباقات
            </Link>
          </p>
        )}
      </div>
    </Card>
  );
}
