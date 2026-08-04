'use client';

import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/Misc';
import { startCheckout } from '@/lib/actions/billing';
import { billingLabel, formatDate, formatDateTime, formatPrice } from '@/lib/utils/format';
import type { EventRow, Payment, Plan, Subscription } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

const PAYMENT_STATUS: Record<string, { label: string; tone: string }> = {
  initiated: { label: 'قيد المعالجة', tone: 'sunny' },
  paid: { label: 'مدفوع', tone: 'mint' },
  failed: { label: 'فشل', tone: 'coral' },
  refunded: { label: 'مُسترجع', tone: 'sand' },
};

export function BillingClient({
  plans,
  events,
  payments,
  activeSubscription,
  activePlanName,
  preselectedEvent,
  gatewayReady,
}: {
  plans: Plan[];
  events: EventRow[];
  payments: Payment[];
  activeSubscription: Subscription | null;
  activePlanName: string | null;
  preselectedEvent: string | null;
  gatewayReady: boolean;
}) {
  const [eventId, setEventId] = useState(preselectedEvent ?? events[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const paidPlans = plans.filter((p) => p.price_halalas > 0);
  const oneTime = paidPlans.filter((p) => p.billing_period === 'one_time');
  const recurring = paidPlans.filter((p) => p.billing_period !== 'one_time');

  function checkout(plan: Plan) {
    setError(null);
    setBusyPlan(plan.id);

    startTransition(async () => {
      const res = await startCheckout(
        plan.id,
        plan.billing_period === 'one_time' ? eventId : null,
      );

      if (!res.ok || !res.url) {
        setError(res.error ?? 'تعذّر بدء الدفع.');
        setBusyPlan(null);
        return;
      }

      window.location.href = res.url;
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black text-ink">الاشتراك والدفع</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          ادفع لمناسبة واحدة، أو اشترك لمناسبات غير محدودة.
        </p>
      </div>

      {!gatewayReady && (
        <Alert tone="warning" title="بوابة الدفع غير مفعّلة">
          لم تُضبط مفاتيح مُيسّر في هذه البيئة بعد. الباقات معروضة للاطلاع، والدفع سيعمل فور
          إضافة المفاتيح.
        </Alert>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {activeSubscription && (
        <Alert tone="success" title={`اشتراكك فعّال: ${activePlanName ?? 'باقة المنظّم'}`}>
          مناسبات ومدعوون غير محدودين
          {activeSubscription.current_period_end
            ? ` حتى ${formatDate(activeSubscription.current_period_end)}.`
            : '.'}
        </Alert>
      )}

      {/* باقات المناسبة الواحدة */}
      {oneTime.length > 0 && (
        <Card>
          <CardHeader
            title="تفعيل مناسبة واحدة"
            description="اختر المناسبة ثم الباقة المناسبة لعدد مدعويك."
          />
          <CardBody className="space-y-5">
            {events.length === 0 ? (
              <EmptyState
                icon="📅"
                title="ما عندك مناسبات"
                description="أنشئ مناسبة أولاً ثم ارجع لتفعيلها."
              />
            ) : (
              <>
                <Field label="المناسبة" required>
                  <Select value={eventId} onChange={(e) => setEventId(e.target.value)}>
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.title} — {formatDate(ev.starts_at)}
                        {ev.is_paid ? ' (مفعّلة)' : ''}
                      </option>
                    ))}
                  </Select>
                </Field>

                <div className="grid gap-4 md:grid-cols-2">
                  {oneTime.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      busy={busyPlan === plan.id}
                      disabled={!gatewayReady || !eventId}
                      onSelect={() => checkout(plan)}
                    />
                  ))}
                </div>
              </>
            )}
          </CardBody>
        </Card>
      )}

      {/* الاشتراكات */}
      {recurring.length > 0 && (
        <Card>
          <CardHeader
            title="اشتراك المنظّمين"
            description="مناسبات ومدعوون غير محدودين طوال فترة الاشتراك."
          />
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2">
              {recurring.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  busy={busyPlan === plan.id}
                  disabled={!gatewayReady}
                  onSelect={() => checkout(plan)}
                  ctaLabel={activeSubscription ? 'تجديد / ترقية' : 'اشترك الآن'}
                />
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {/* سجل المدفوعات */}
      <Card>
        <CardHeader title="سجل المدفوعات" />
        <CardBody>
          {payments.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft">ما فيه عمليات دفع بعد.</p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {payments.map((payment) => {
                const status = PAYMENT_STATUS[payment.status] ?? PAYMENT_STATUS.initiated;
                return (
                  <li key={payment.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink">
                        {formatPrice(payment.amount_halalas, payment.currency)}
                      </p>
                      <p className="text-xs text-ink-faint">
                        {formatDateTime(payment.created_at)}
                      </p>
                    </div>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="text-center text-xs text-ink-faint">
        الدفع يتم عبر بوابة مُيسّر — تدعم مدى وApple Pay والبطاقات الائتمانية. بيانات بطاقتك
        لا تمر على خوادم بكجات.
      </p>
    </div>
  );
}

function PlanCard({
  plan,
  busy,
  disabled,
  onSelect,
  ctaLabel,
}: {
  plan: Plan;
  busy: boolean;
  disabled: boolean;
  onSelect: () => void;
  ctaLabel?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col rounded-3xl border-2 p-5 transition-all duration-200',
        plan.is_featured
          ? 'border-grape-300 bg-grape-50/40'
          : 'border-sand-200 bg-white hover:border-sand-400',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-bold text-ink">{plan.name}</h3>
        {plan.is_featured && <Badge tone="grape">الأنسب</Badge>}
      </div>

      {plan.description && (
        <p className="mt-1.5 text-xs leading-6 text-ink-soft">{plan.description}</p>
      )}

      <p className="mt-4 flex items-baseline gap-2">
        <span className="font-display text-2xl font-black text-ink">
          {formatPrice(plan.price_halalas, plan.currency)}
        </span>
        <span className="text-xs text-ink-faint">{billingLabel(plan.billing_period)}</span>
      </p>

      <ul className="mt-4 flex-1 space-y-2">
        {(plan.features ?? []).map((f) => (
          <li key={f} className="flex items-start gap-2 text-xs text-ink-soft">
            <Icon name="check" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-mint-500" strokeWidth={2.5} />
            {f}
          </li>
        ))}
      </ul>

      <Button
        className="mt-5"
        fullWidth
        loading={busy}
        disabled={disabled}
        variant={plan.is_featured ? 'primary' : 'secondary'}
        onClick={onSelect}
      >
        {ctaLabel ?? 'ادفع الآن'}
      </Button>
    </div>
  );
}
