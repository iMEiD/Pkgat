'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { confirmEventSetup } from '@/lib/actions/events';
import { EVENT_TYPE_LABELS, formatDateTime, formatNumber } from '@/lib/utils/format';
import type { EventRow } from '@/lib/types/database';

/**
 * مراجعة أخيرة ثم تأكيد.
 *
 * كانت الخطوة تُحسب مكتملة باستنتاج من الحقول، فمن ترك الموقع فارغاً
 * تبقى ناقصة أبداً مهما ضغط «حفظ» — يفتح ويحفظ ويرجع فلا يتغيّر شيء.
 *
 * وهي أصلاً قرار لا حالة: «راجعت بياناتي وأقررت أنها صحيحة». فتُعرض
 * البيانات مجموعة في مكان واحد ليقرأها قراءة أخيرة، ثم يؤكّد بفعل
 * صريح — قبل أن يوزّع دعواتٍ لا رجعة فيها.
 */
export function ConfirmSetup({
  event,
  guestCount,
  scannerCount,
}: {
  event: EventRow;
  guestCount: number;
  scannerCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const confirmed = Boolean(event.setup_confirmed_at);

  const rows: { label: string; value: string; missing?: boolean }[] = [
    { label: 'اسم المناسبة', value: event.title },
    { label: 'النوع', value: EVENT_TYPE_LABELS[event.event_type] ?? event.event_type },
    { label: 'البداية', value: formatDateTime(event.starts_at) },
    {
      label: 'النهاية',
      value: event.ends_at ? formatDateTime(event.ends_at) : '٦ ساعات بعد البداية (افتراضي)',
    },
    { label: 'الموقع', value: event.venue || 'لم يُحدَّد', missing: !event.venue },
    { label: 'المدعوون', value: `${formatNumber(guestCount)} مدعو`, missing: guestCount === 0 },
    {
      label: 'حسابات المسح',
      value: `${formatNumber(scannerCount)} حساب`,
      missing: scannerCount === 0,
    },
  ];

  function confirm() {
    startTransition(async () => {
      await confirmEventSetup(event.id);
      router.push(`/dashboard/events/${event.id}/guests`);
      router.refresh();
    });
  }

  return (
    <Card className={confirmed ? 'border-mint-100' : 'border-grape-200'}>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            راجع بيانات المناسبة
            {confirmed && (
              <Badge tone="mint" dot>
                مؤكَّدة
              </Badge>
            )}
          </span>
        }
        description="اقرأها قراءة أخيرة — بعدها توزّع الدعوات وما فيه رجعة."
      />
      <CardBody>
        <dl className="divide-y divide-sand-200 rounded-2xl border border-sand-200">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between gap-3 px-4 py-3">
              <dt className="text-xs text-ink-soft">{row.label}</dt>
              <dd
                className={
                  row.missing ? 'text-sm font-bold text-coral-600' : 'text-sm font-bold text-ink'
                }
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        {rows.some((r) => r.missing) && (
          <Alert tone="warning" className="mt-4">
            فيه بيانات ناقصة بالأحمر. تقدر تأكّد بدونها، لكن راجعها أولاً — عدّلها من النموذج
            بالأعلى.
          </Alert>
        )}

        {confirmed ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => router.push(`/dashboard/events/${event.id}/guests`)}
            >
              حمّل الدعوات
              <Icon name="arrow" className="h-4 w-4" />
            </Button>
            <span className="text-xs text-ink-faint">
              أكّدتها في {formatDateTime(event.setup_confirmed_at)}
            </span>
          </div>
        ) : (
          <Button size="lg" fullWidth className="mt-4" onClick={confirm} loading={pending}>
            أكّد البيانات وانتقل لتحميل الدعوات
            <Icon name="arrow" className="h-4 w-4" />
          </Button>
        )}
      </CardBody>
    </Card>
  );
}
