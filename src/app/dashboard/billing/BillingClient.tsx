'use client';

import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/Misc';
import { previewCode, startCheckout } from '@/lib/actions/billing';
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
  testMode,
}: {
  plans: Plan[];
  events: EventRow[];
  payments: Payment[];
  activeSubscription: Subscription | null;
  activePlanName: string | null;
  preselectedEvent: string | null;
  gatewayReady: boolean;
  /** شراء محاكاة بلا بوابة — لاختبار ما بعد الدفع قبل ربط مُيسّر */
  testMode: boolean;
}) {
  const [eventId, setEventId] = useState(preselectedEvent ?? events[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  /*
   * كود الخصم يقع داخل الشراء لا في بطاقة منفصلة أعلى الصفحة.
   *
   * كان حقلاً عاماً يُكتب فيه الكود ثم يُضغط «تحقق» على كل باقة على
   * حدة — وهو ترتيب مقلوب: الكود لا معنى له إلا مع باقة بعينها ولحظة
   * شرائها. فصار الضغط على الباقة يفتح تأكيداً يعرض السعر والكود
   * والمجموع، والدفع من هناك.
   */
  const [checkoutPlan, setCheckoutPlan] = useState<Plan | null>(null);

  const paidPlans = plans.filter((p) => p.price_halalas > 0);
  const oneTime = paidPlans.filter((p) => p.billing_period === 'one_time');
  const recurring = paidPlans.filter((p) => p.billing_period !== 'one_time');

  function checkout(plan: Plan, code: string | null) {
    setError(null);
    setBusyPlan(plan.id);

    startTransition(async () => {
      const res = await startCheckout(
        plan.id,
        plan.billing_period === 'one_time' ? eventId : null,
        code,
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
        <h1 className="font-display text-3xl font-bold text-ink">الاشتراك والدفع</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          ادفع لمناسبة واحدة، أو اشترك لمناسبات غير محدودة.
        </p>
      </div>

      {/* الوعد يسبق الضغط: لا أحد يضغط «اشترك» وهو يظن أنه يدفع فعلاً */}
      {testMode && (
        <Alert tone="warning" title="وضع اختبار — ما ينخصم أي مبلغ">
          الشراء هنا محاكاة كاملة: الباقة راح تنفتح فعلاً وتقدر تجرّب كل شي بعدها، بلا بوابة
          دفع وبلا أي خصم.
        </Alert>
      )}

      {!gatewayReady && (
        <Alert tone="warning" title="بوابة الدفع غير مفعّلة">
          لم تُضبط مفاتيح مُيسّر في هذه البيئة بعد. الباقات معروضة للاطلاع، والدفع سيعمل فور
          إضافة المفاتيح.
        </Alert>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      {checkoutPlan && (
        <CheckoutModal
          plan={checkoutPlan}
          busy={busyPlan === checkoutPlan.id}
          testMode={testMode}
          onClose={() => setCheckoutPlan(null)}
          onPay={(code) => checkout(checkoutPlan, code)}
        />
      )}

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
                      onSelect={() => setCheckoutPlan(plan)}
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
                  onSelect={() => setCheckoutPlan(plan)}
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
          : 'border-sand-200 bg-surface hover:border-sand-400',
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
        <span className="font-display text-2xl font-bold text-ink">
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


/**
 * تأكيد الشراء — الباقة والكود والمجموع في مكان واحد.
 *
 * هنا موضع كود الخصم الطبيعي: لحظة الشراء ومع الباقة التي يشتريها، لا
 * حقلاً عاماً أعلى الصفحة يُضغط بعده «تحقق» على كل باقة. والعميل يرى
 * المبلغ الذي سيُخصم منه قبل أن يترك الموقع للبوابة.
 *
 * والسعر المعروض هنا للعرض لا للتسعير: الخادم يعيد التحقق من الكود
 * ويحسب المبلغ عند الشراء. من يستطيع نداء إجراء المعاينة يستطيع تزوير
 * ردّه — فلا يُبنى على ما يظهر هنا ريال واحد.
 */
function CheckoutModal({
  plan,
  busy,
  testMode,
  onClose,
  onPay,
}: {
  plan: Plan;
  busy: boolean;
  testMode: boolean;
  onClose: () => void;
  onPay: (code: string | null) => void;
}) {
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState<{ discount: number; final: number } | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [checking, startCheck] = useTransition();

  const total = applied?.final ?? plan.price_halalas;

  function apply() {
    setCodeError(null);
    setApplied(null);

    startCheck(async () => {
      const res = await previewCode(code, plan.id);
      if (!res.ok) return setCodeError(res.error ?? 'تعذّر التحقق من الكود.');

      setApplied({
        discount: res.discountHalalas ?? 0,
        final: res.finalHalalas ?? plan.price_halalas,
      });
    });
  }

  return (
    <Modal open onClose={onClose} title="تأكيد الشراء">
      <div className="space-y-4">
        <div className="rounded-2xl border border-sand-200 p-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-ink-soft">الباقة</span>
            <span className="text-sm font-bold text-ink">{plan.name}</span>
          </div>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <span className="text-sm text-ink-soft">{billingLabel(plan.billing_period)}</span>
            <span className="text-sm font-bold text-ink">
              {formatPrice(plan.price_halalas, plan.currency)}
            </span>
          </div>

          {applied && applied.discount > 0 && (
            <div className="mt-2.5 flex items-center justify-between gap-3">
              <span className="text-sm text-mint-600">الخصم</span>
              <span className="text-sm font-bold text-mint-600">
                −{formatPrice(applied.discount, plan.currency)}
              </span>
            </div>
          )}

          <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-sand-200 pt-3">
            <span className="text-sm font-bold text-ink">المجموع</span>
            <span className="font-display text-2xl font-bold text-ink">
              {formatPrice(total, plan.currency)}
            </span>
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink">كود خصم (اختياري)</span>
          <div className="flex gap-2">
            <Input
              dir="ltr"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setApplied(null);
                setCodeError(null);
              }}
              placeholder="SUMMER25"
              className="flex-1"
              aria-label="كود الخصم"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={apply}
              loading={checking}
              disabled={!code.trim() || Boolean(applied)}
            >
              تطبيق
            </Button>
          </div>

          {codeError && (
            <Alert tone="danger" className="mt-3">
              {codeError}
            </Alert>
          )}
          {applied && (
            <Alert tone="success" className="mt-3">
              {total === 0
                ? 'الكود يغطي المبلغ كاملاً — الباقة تنفتح بلا دفع.'
                : `تم تطبيق الكود — وفّرت ${formatPrice(applied.discount, plan.currency)}.`}
            </Alert>
          )}
        </div>

        {testMode && (
          <Alert tone="warning">
            وضع اختبار: ما ينخصم أي مبلغ، والباقة تنفتح فعلاً.
          </Alert>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            size="lg"
            className="flex-1"
            loading={busy}
            onClick={() => onPay(code.trim() || null)}
          >
            {total === 0 ? 'فعّل الباقة' : `ادفع ${formatPrice(total, plan.currency)}`}
            <Icon name="arrow" className="h-4 w-4" />
          </Button>
          <Button type="button" variant="secondary" size="lg" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </Modal>
  );
}
