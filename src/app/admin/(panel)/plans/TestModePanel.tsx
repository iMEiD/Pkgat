'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Switch } from '@/components/ui/Field';
import { clearTestPayments, setPaymentsTestMode } from '@/lib/actions/admin';
import { countAr } from '@/lib/utils/format';

/**
 * اختبار الشراء قبل ربط بوابة الدفع.
 *
 * السؤال الذي لا جواب له قبل هذا: بعد ما يدفع العميل — هل يُرفع الحد
 * فعلاً؟ هل تشتغل الباركودات؟ هل تتغيّر بطاقة الباقة في لوحته؟ الوضع
 * التجريبي يمرّ بنفس الطريق كاملاً بلا بوابة، فيُجاب السؤال قبل أن
 * يدفع أول عميل حقيقي لا بعده.
 */
export function TestModePanel({
  enabled,
  gatewayReady,
  testPayments,
}: {
  enabled: boolean;
  gatewayReady: boolean;
  testPayments: number;
}) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [clearing, startClear] = useTransition();

  function toggle(value: boolean) {
    setOn(value);
    setMsg(null);
    setError(null);

    startTransition(async () => {
      const res = await setPaymentsTestMode(value);
      if (!res.ok) {
        setOn(!value);
        return setError(res.error ?? 'تعذّر الحفظ.');
      }
      router.refresh();
    });
  }

  function clear() {
    if (
      !confirm(
        'مسح كل الاشتراكات والمناسبات اللي فُعّلت بالشراء التجريبي؟ ما راح يتأثر أي دفع حقيقي.',
      )
    )
      return;

    setMsg(null);
    setError(null);

    startClear(async () => {
      const res = (await clearTestPayments()) as {
        ok: boolean;
        error?: string;
        cleared?: { payments: number; events: number; subscriptions: number };
      };
      if (!res.ok) return setError(res.error ?? 'تعذّر المسح.');

      const c = res.cleared;
      setMsg(
        c
          ? `تم مسح ${countAr(c.payments, 'عملية', 'عمليتين', 'عمليات', 'عملية')}` +
            (c.subscriptions ? ` و${countAr(c.subscriptions, 'اشتراك', 'اشتراكين', 'اشتراكات', 'اشتراكاً')}` : '') +
            (c.events ? ` و${countAr(c.events, 'مناسبة', 'مناسبتين', 'مناسبات', 'مناسبة')} رجعت غير مدفوعة` : '')
          : 'تم المسح.',
      );
      router.refresh();
    });
  }

  return (
    <Card className={on && !gatewayReady ? 'border-sunny-100 bg-sunny-50 p-5' : 'p-5'}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold text-ink">اختبار الشراء</h2>
        {gatewayReady ? (
          <Badge tone="mint" dot>
            بوابة مُيسّر مربوطة
          </Badge>
        ) : on ? (
          <Badge tone="sunny" dot>
            الوضع التجريبي شغّال
          </Badge>
        ) : (
          <Badge tone="sand">البوابة غير مربوطة</Badge>
        )}
      </div>

      {error && (
        <Alert tone="danger" className="mt-4">
          {error}
        </Alert>
      )}
      {msg && (
        <Alert tone="success" className="mt-4">
          {msg}
        </Alert>
      )}

      {gatewayReady ? (
        <p className="mt-3 text-sm leading-7 text-ink-soft">
          مفتاح مُيسّر مضبوط، فالدفع حقيقي والوضع التجريبي معطّل تلقائياً — حتى لو كان الإعداد
          مفتوحاً. ما فيه احتمال أن يمرّ شراء بلا دفع.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm leading-7 text-ink-soft">
            يحاكي شراءً ناجحاً بنفس الطريق كاملاً — نفس سجل الدفع، ونفس التفعيل، ونفس صفحة
            النتيجة — بلا اتصال ببوابة الدفع وبلا خصم أي مبلغ. تقدر تجرّب الباقات من أي حساب
            كأنك اشتريت فعلاً.
          </p>

          <div className="mt-4">
            <Switch
              checked={on}
              onChange={(value) => {
                if (!pending) toggle(value);
              }}
              label="فعّل الوضع التجريبي"
              description="ينتهي وحده لحظة ما تربط مُيسّر — ما يحتاج تتذكّر تطفيه."
            />
          </div>

          {on && (
            <Alert tone="warning" className="mt-4">
              وهو شغّال، أي مستخدم يضغط «اشترك» تنفتح له الباقة بلا دفع. خلّه للاختبار فقط،
              وامسح آثاره قبل الإطلاق.
            </Alert>
          )}
        </>
      )}

      <div className="mt-5 border-t border-sand-200 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-ink">آثار الاختبار</h3>
            <p className="mt-1 text-[11px] leading-5 text-ink-faint">
              {testPayments === 0
                ? 'ما فيه أي شراء تجريبي مسجّل.'
                : `${countAr(testPayments, 'عملية شراء تجريبية', 'عمليتا شراء تجريبيتان', 'عمليات شراء تجريبية', 'عملية شراء تجريبية')} — والاشتراكات والمناسبات اللي فتحتها ما زالت فعّالة.`}
            </p>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={clear}
            loading={clearing}
            disabled={testPayments === 0}
          >
            امسح آثار الاختبار
          </Button>
        </div>

        {testPayments > 0 && (
          <p className="mt-3 text-[11px] leading-5 text-ink-faint">
            امسحها قبل الإطلاق: بدونها تبقى حسابات تجريبية مفتوحة الباقة بلا أن يكون دُفع لها
            ريال — ولا شيء في اللوحة يميّزها عن المشتركين الحقيقيين.
          </p>
        )}
      </div>
    </Card>
  );
}
