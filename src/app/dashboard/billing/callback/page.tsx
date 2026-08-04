import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { confirmPayment } from '@/lib/actions/billing';

export const metadata: Metadata = { title: 'نتيجة الدفع' };
export const dynamic = 'force-dynamic';

export default async function PaymentCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{ payment?: string }>;
}) {
  const { payment } = await searchParams;

  if (!payment) {
    return (
      <Card className="mx-auto max-w-lg p-8 text-center">
        <p className="text-4xl">🤔</p>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">صفحة غير مكتملة</h1>
        <p className="mt-2 text-sm text-ink-soft">لم نستلم معرّف عملية الدفع.</p>
        <ButtonLink href="/dashboard/billing" className="mt-6">
          العودة لصفحة الدفع
        </ButtonLink>
      </Card>
    );
  }

  const result = await confirmPayment(payment);

  const visual =
    result.status === 'paid'
      ? { emoji: '🎉', title: 'تم الدفع بنجاح', tone: 'success' as const }
      : result.status === 'pending'
        ? { emoji: '⏳', title: 'الدفع قيد المعالجة', tone: 'info' as const }
        : { emoji: '😕', title: 'لم تكتمل عملية الدفع', tone: 'danger' as const };

  return (
    <Card className="mx-auto max-w-lg p-8 text-center">
      <p className="text-5xl">{visual.emoji}</p>
      <h1 className="mt-4 font-display text-2xl font-bold text-ink">{visual.title}</h1>

      <Alert tone={visual.tone} className="mt-5 text-right">
        {result.message}
      </Alert>

      {result.status === 'paid' && (
        <p className="mt-4 text-sm leading-7 text-ink-soft">
          تم تفعيل باقتك. تقدر الآن تضيف بقية المدعوين، وتتفعّل باركوداتهم تلقائياً وقت
          المناسبة.
        </p>
      )}

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink href="/dashboard">مناسباتي</ButtonLink>
        {result.status !== 'paid' && (
          <ButtonLink href="/dashboard/billing" variant="secondary">
            رجوع لصفحة الدفع
          </ButtonLink>
        )}
      </div>

      {result.status === 'pending' && (
        <p className="mt-5 text-xs text-ink-faint">
          إن تأخّر التأكيد،{' '}
          <Link href={`/dashboard/billing/callback?payment=${payment}`} className="font-bold text-grape-600">
            حدّث هذه الصفحة
          </Link>{' '}
          بعد دقيقة.
        </p>
      )}
    </Card>
  );
}
