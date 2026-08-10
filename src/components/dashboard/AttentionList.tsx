import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { arabicDigits, countAr } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { Issue } from '@/lib/data/dashboard';

const ICONS: Record<Issue['kind'], string> = {
  quota: 'shield',
  guests: 'users',
  design: 'palette',
  scanner: 'scan',
};

/**
 * نواقص كل المناسبات في مكان واحد.
 *
 * كانت الشارات مدفونة داخل بطاقة كل مناسبة، فمن عنده ثلاث مناسبات لا
 * يرى ما ينقصها إلا بفتحها واحدة واحدة. وما يمنع الدخول فعلاً يُعرض
 * أولاً — لا الأسهل إصلاحاً.
 */
export function AttentionList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;

  const blocking = issues.filter((i) => i.blocking).length;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-bold text-ink-faint">يحتاج انتباهك</h2>
        <span className="text-xs text-ink-faint">
          {countAr(issues.length, 'بند', 'بندان', 'بنود', 'بنداً')}
          {blocking > 0 && (
            <>
              {/* مسافة حول الفاصل: بلا فراغ يلتصق بالرقم فيُقرأ جزءاً منه */}
              <span className="px-1.5">·</span>
              <span className="font-bold text-coral-700">
                منها {arabicDigits(blocking)} يمنع الدخول
              </span>
            </>
          )}
        </span>
      </div>

      <Card className="divide-y divide-sand-200 p-0">
        {issues.map((issue) => (
          <Link
            key={`${issue.eventId}-${issue.kind}`}
            href={issue.href}
            className="flex items-start gap-3 p-4 transition-colors hover:bg-sand-50"
          >
            <span
              className={cn(
                'grid h-9 w-9 shrink-0 place-items-center rounded-xl',
                issue.blocking ? 'bg-coral-50 text-coral-700' : 'bg-sunny-50 text-sunny-600',
              )}
            >
              <Icon name={ICONS[issue.kind]} className="h-4.5 w-4.5" />
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-bold text-ink">{issue.label}</span>
                <span className="truncate text-xs text-ink-faint">{issue.eventTitle}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                {issue.consequence}
              </span>
            </span>

            <Icon name="arrow" className="mt-2 h-4 w-4 shrink-0 text-ink-faint" />
          </Link>
        ))}
      </Card>
    </section>
  );
}
