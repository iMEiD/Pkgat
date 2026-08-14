import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { arabicDigits } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export interface EventStep {
  /** عنوان قصير — ما الذي يفعله في هذه الخطوة */
  label: string;
  /** حالة الخطوة الآن، لا شرحها العام: «١٢ مدعو» لا «أضف مدعوين» */
  hint: string;
  done: boolean;
  href: string;
  /** نصّ الزر حين تكون هذه هي الخطوة التالية */
  cta: string;
  /** خطوة لا تُفتح قبل سابقتها — تُعرض رمادية بلا رابط */
  locked?: boolean;
}

/**
 * خطوات المناسبة من أولها لآخرها.
 *
 * الشكوى التي وُلد منها هذا المكوّن: «عند كل خطوة لازم الشخص يوقف
 * ويسأل نفسه: وش أسوي الحين؟» — وسببها أن الصفحة كانت تعرض كل شيء
 * بنفس الوزن: أرقاماً وبطاقات وقائمة تجهيز، بلا أن يقول شيء منها
 * «هذي خطوتك التالية».
 *
 * القاعدة هنا: في كل لحظة إجراءٌ رئيسي واحد فقط بارز — الخطوة الأولى
 * غير المكتملة. وما بعده مقفل حتى يصل دوره، فلا يُشتّت ولا يُدخِل
 * المستخدم في طريق ناقص. وما قبله مفتوح للرجوع والتعديل دائماً.
 */
export function EventSteps({ steps }: { steps: EventStep[] }) {
  const nextIndex = steps.findIndex((s) => !s.done);
  const allDone = nextIndex === -1;
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200 px-5 py-4">
        <div>
          <h2 className="text-base font-bold text-ink">خطوات تجهيز المناسبة</h2>
          <p className="mt-0.5 text-xs text-ink-soft">
            {allDone
              ? 'كل الخطوات مكتملة — مناسبتك جاهزة.'
              : 'اتبعها بالترتيب، وكل خطوة تفتح اللي بعدها.'}
          </p>
        </div>
        <Badge tone={allDone ? 'mint' : 'grape'} dot={allDone}>
          {arabicDigits(doneCount)} من {arabicDigits(steps.length)}
        </Badge>
      </div>

      <ol className="divide-y divide-sand-200">
        {steps.map((step, i) => {
          const isNext = i === nextIndex;
          // مقفلة: لم يحن دورها بعد — أو أعلنت هي أنها تعتمد على ما قبلها
          const locked = (!step.done && !isNext) || (step.locked && !step.done);

          return (
            <li
              key={step.label}
              className={cn(
                'flex items-center gap-3.5 px-5 py-4 transition-colors',
                isNext && 'bg-grape-50/50',
              )}
            >
              <span
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-2xl text-sm font-bold',
                  step.done
                    ? 'bg-mint-500 text-white'
                    : isNext
                      ? 'bg-grape-500 text-white shadow-pop'
                      : 'bg-sand-100 text-ink-faint',
                )}
              >
                {step.done ? (
                  <Icon name="check" className="h-4 w-4" strokeWidth={2.5} />
                ) : (
                  arabicDigits(i + 1)
                )}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block text-sm font-bold',
                    locked ? 'text-ink-faint' : 'text-ink',
                  )}
                >
                  {step.label}
                </span>
                <span className="block truncate text-xs leading-5 text-ink-soft">{step.hint}</span>
              </span>

              {/* إجراء واحد بارز: الخطوة التالية وحدها تحمل زراً ممتلئاً */}
              {isNext ? (
                <ButtonLink href={step.href} size="sm" className="shrink-0">
                  {step.cta}
                  <Icon name="arrow" className="h-4 w-4" />
                </ButtonLink>
              ) : step.done ? (
                <Link
                  href={step.href}
                  className="shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-ink-soft transition-colors hover:bg-sand-100 hover:text-ink"
                >
                  تعديل
                </Link>
              ) : (
                <span className="shrink-0 text-xs text-ink-faint">لاحقاً</span>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
