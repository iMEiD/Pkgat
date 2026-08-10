import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { arabicDigits } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export interface StartStep {
  label: string;
  hint: string;
  done: boolean;
  href: string;
}

/**
 * دليل الخطوات الأربع لمن لم يُتمّ مناسبته الأولى.
 *
 * أسوأ فراغ في اللوحة هو أول دخول: مناسبة تجريبية وحدها وبطاقات
 * إحصاء أصفار، ولا شيء يقول من أين يبدأ. يختفي الدليل تلقائياً بعد
 * إتمام خطواته فلا يزاحم من تجاوزها.
 */
export function GettingStarted({ steps }: { steps: StartStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <Card className="border-grape-200 bg-grape-50 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-ink">ابدأ من هنا</h2>
        <span className="text-xs font-bold text-ink-soft">
          {arabicDigits(done)} من {arabicDigits(steps.length)}
        </span>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        أربع خطوات من التسجيل لأول باركود يُمسح على الباب.
      </p>

      <ol className="mt-4 space-y-1">
        {steps.map((step, i) => {
          const isNext = i === nextIndex;

          return (
            <li key={step.label}>
              <Link
                href={step.href}
                className={cn(
                  'flex items-start gap-3 rounded-2xl px-3 py-2.5 transition-colors',
                  isNext ? 'bg-surface shadow-soft' : 'hover:bg-surface/60',
                )}
              >
                <span
                  className={cn(
                    'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                    step.done
                      ? 'bg-mint-500 text-white'
                      : isNext
                        ? 'bg-grape-500 text-white'
                        : 'border border-sand-300 text-ink-soft',
                  )}
                >
                  {step.done ? (
                    <Icon name="check" className="h-4 w-4" strokeWidth={3} />
                  ) : (
                    arabicDigits(i + 1)
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'block text-sm font-bold',
                      step.done ? 'text-ink-soft line-through' : 'text-ink',
                    )}
                  >
                    {step.label}
                  </span>
                  {!step.done && (
                    <span className="mt-0.5 block text-xs leading-5 text-ink-soft">
                      {step.hint}
                    </span>
                  )}
                </span>

                {isNext && <Icon name="arrow" className="mt-1.5 h-4 w-4 shrink-0 text-grape-500" />}
              </Link>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
