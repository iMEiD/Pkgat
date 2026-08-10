import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { countAr, formatDate } from '@/lib/utils/format';
import type { PlanStatus } from '@/lib/data/subscription';

/**
 * باقة المستخدم في أعلى لوحته.
 *
 * كان لا شيء في اللوحة يقول له على أي باقة هو ولا كم بقي منها — يعرفه
 * فقط حين يصطدم بالحد وهو يضيف مدعوين. البطاقة تقول حالته الآن، وما
 * يعنيه ذلك عملياً بعدد المدعوين، ومتى ينتهي.
 */
export function PlanBanner({ status }: { status: PlanStatus }) {
  return status.subscribed ? <Subscribed status={status} /> : <FreeTier status={status} />;
}

function Subscribed({ status }: { status: PlanStatus }) {
  const { planName, periodEnd, daysLeft, expiringSoon } = status;

  return (
    <Card
      className={
        expiringSoon
          ? 'border-sunny-200 bg-sunny-50/60 p-5'
          : 'border-grape-200 bg-grape-50/50 p-5'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-grape-500 text-white shadow-pop">
            <Icon name="sparkle" className="h-5 w-5" />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-ink">
                {planName ? `باقة ${planName}` : 'اشتراك فعّال'}
              </h2>
              <Badge tone={expiringSoon ? 'sunny' : 'mint'} dot>
                {expiringSoon ? 'قارب على الانتهاء' : 'فعّال'}
              </Badge>
            </div>

            <p className="mt-1 text-sm leading-6 text-ink-soft">
              مدعوون بلا حد في كل مناسباتك
              {periodEnd && (
                <>
                  {' · '}
                  {daysLeft !== null && daysLeft >= 0 ? (
                    <>
                      يتجدد بعد{' '}
                      <span className="font-bold text-ink">
                        {countAr(daysLeft, 'يوم', 'يومين', 'أيام', 'يوماً')}
                      </span>{' '}
                      ({formatDate(periodEnd)})
                    </>
                  ) : (
                    <>حتى {formatDate(periodEnd)}</>
                  )}
                </>
              )}
            </p>
          </div>
        </div>

        <ButtonLink href="/dashboard/billing" variant="secondary" size="sm">
          إدارة الاشتراك
        </ButtonLink>
      </div>
    </Card>
  );
}

function FreeTier({ status }: { status: PlanStatus }) {
  const { freeQuota, paidEvents } = status;

  return (
    <Card className="border-sand-300 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sand-100 text-ink-soft">
            <Icon name="sparkle" className="h-5 w-5" />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-ink">التجربة المجانية</h2>
              <Badge tone="sand">بدون اشتراك</Badge>
            </div>

            <p className="mt-1 text-sm leading-6 text-ink-soft">
              أول{' '}
              <span className="font-bold text-ink">
                {countAr(freeQuota, 'مدعو', 'مدعوين', 'مدعوين', 'مدعواً')}
              </span>{' '}
              مجاناً قبل أي دفع
              {paidEvents > 0 && (
                <>
                  <span className="px-1.5 text-ink-faint">·</span>
                  دفعت لـ{' '}
                  <span className="font-bold text-ink">
                    {countAr(paidEvents, 'مناسبة', 'مناسبتين', 'مناسبات', 'مناسبة')}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        <ButtonLink href="/pricing" size="sm">
          شوف الباقات
          <Icon name="arrow" className="h-4 w-4" />
        </ButtonLink>
      </div>
    </Card>
  );
}
