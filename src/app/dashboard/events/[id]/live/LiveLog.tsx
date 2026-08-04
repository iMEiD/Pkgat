'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState, ProgressBar, Stat } from '@/components/ui/Misc';
import { Switch } from '@/components/ui/Field';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/utils/format';
import type { Checkin, CheckinResult } from '@/lib/types/database';
import type { EventCounts } from '@/lib/data/event';

export interface LogEntry extends Checkin {
  guest_name: string | null;
}

const RESULT_LABELS: Record<CheckinResult, string> = {
  granted: 'دخول ناجح',
  override: 'تجاوز يدوي',
  duplicate: 'محاولة مكررة',
  invalid: 'باركود غير صالح',
  inactive: 'باركود غير مفعّل',
  expired: 'باركود منتهي',
};

const RESULT_TONES: Record<CheckinResult, string> = {
  granted: 'mint',
  override: 'sunny',
  duplicate: 'coral',
  invalid: 'sand',
  inactive: 'sand',
  expired: 'sand',
};

const REFRESH_MS = 15_000;

export function LiveLog({
  eventId,
  initialEntries,
  initialCounts,
}: {
  eventId: string;
  initialEntries: LogEntry[];
  initialCounts: EventCounts;
}) {
  const router = useRouter();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<'all' | 'granted' | 'issues'>('all');

  // تحديث دوري خفيف: نعيد تحميل بيانات الخادم فقط، بدون اشتراك دائم
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, router]);

  const entries = initialEntries.filter((e) => {
    if (filter === 'granted') return e.result === 'granted' || e.result === 'override';
    if (filter === 'issues') return e.result !== 'granted';
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="الحضور الفعلي" value={formatNumber(initialCounts.attended)} tone="mint" />
        <Stat
          label="نسبة الحضور"
          value={formatPercent(initialCounts.attended, initialCounts.total)}
          hint={`من ${formatNumber(initialCounts.total)} مدعو`}
          tone="grape"
        />
        <Stat
          label="حالات التجاوز"
          value={formatNumber(initialCounts.overrides)}
          hint="مسجَّلة للمراجعة"
          tone="sunny"
        />
      </div>

      <Card>
        <CardBody className="pt-5">
          <ProgressBar value={initialCounts.attended} max={initialCounts.total || 1} tone="mint" />
        </CardBody>
      </Card>

      <Switch
        checked={autoRefresh}
        onChange={setAutoRefresh}
        label="تحديث تلقائي"
        description={`يحدّث السجل كل ${REFRESH_MS / 1000} ثانية أثناء المناسبة.`}
      />

      <Card>
        <CardHeader
          title="سجل عمليات المسح"
          description="آخر ١٠٠ عملية — تشمل المحاولات المرفوضة وحالات التجاوز."
          action={
            <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
              تحديث الآن
            </Button>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex gap-2">
            {(
              [
                { key: 'all', label: 'الكل' },
                { key: 'granted', label: 'دخول ناجح' },
                { key: 'issues', label: 'مشاكل ومحاولات مرفوضة' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setFilter(tab.key)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors ${
                  filter === tab.key
                    ? 'bg-grape-500 text-white'
                    : 'bg-sand-100 text-ink-soft hover:bg-sand-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {entries.length === 0 ? (
            <EmptyState
              icon="📋"
              title="ما فيه عمليات مسح بعد"
              description="السجل يبدأ بالتعبئة أول ما يمسح مسؤولو الاستقبال أول باركود."
            />
          ) : (
            <ul className="divide-y divide-sand-100">
              {entries.map((entry) => (
                <li key={entry.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {entry.guest_name ?? (
                        <span className="text-ink-faint">
                          رمز غير معروف{entry.raw_code ? ` (${entry.raw_code.slice(0, 12)}…)` : ''}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      {entry.scanner_name ?? 'مسؤول محذوف'} · {formatDateTime(entry.created_at)}
                    </p>
                    {entry.note && (
                      <p className="mt-1 text-xs text-sunny-600">{entry.note}</p>
                    )}
                  </div>
                  <Badge tone={RESULT_TONES[entry.result]} dot>
                    {RESULT_LABELS[entry.result]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <p className="text-center text-xs text-ink-faint">
        معرّف المناسبة: <code dir="ltr">{eventId}</code>
      </p>
    </div>
  );
}
