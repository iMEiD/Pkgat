'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Field';
import { adminDeleteEvent, adminSetEventPaid } from '@/lib/actions/admin';
import { EVENT_TYPE_LABELS, formatDateTime, formatNumber } from '@/lib/utils/format';
import { PHASE_LABELS, PHASE_TONES, computeEventPhase } from '@/lib/utils/event-phase';
import type { AdminEventRow } from './page';

export function AdminEventsTable({ events }: { events: AdminEventRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'paid' | 'free' | 'active'>('all');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      if (
        q &&
        !event.title.toLowerCase().includes(q) &&
        !event.owner_name.toLowerCase().includes(q) &&
        !event.owner_email.toLowerCase().includes(q)
      )
        return false;

      if (filter === 'paid') return event.is_paid;
      if (filter === 'free') return !event.is_paid;
      if (filter === 'active') return computeEventPhase(event) === 'active';
      return true;
    });
  }, [events, query, filter]);

  function togglePaid(event: AdminEventRow) {
    setError(null);
    startTransition(async () => {
      const res = await adminSetEventPaid(event.id, !event.is_paid);
      if (!res.ok) setError(res.error ?? 'تعذّر التحديث.');
      else router.refresh();
    });
  }

  function remove(event: AdminEventRow) {
    if (!confirm(`حذف «${event.title}» نهائياً مع كل بياناتها؟`)) return;
    setError(null);
    startTransition(async () => {
      const res = await adminDeleteEvent(event.id);
      if (!res.ok) setError(res.error ?? 'تعذّر الحذف.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">كل المناسبات</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          {formatNumber(events.length)} مناسبة لكل المستخدمين. تقدر تدخل على أي مناسبة وتعدّل
          عليها نيابة عن صاحبها.
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader title={`النتائج (${formatNumber(filtered.length)})`} />
        <CardBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث باسم المناسبة أو صاحبها…"
            />
            <Select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
              <option value="all">كل المناسبات</option>
              <option value="active">جارية الآن</option>
              <option value="paid">مدفوعة</option>
              <option value="free">تجريبية</option>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-soft">لا نتائج.</p>
          ) : (
            <div className="overflow-x-auto pk-scrollbar">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-sand-200 text-right text-xs text-ink-faint">
                    <th className="py-2.5 font-semibold">المناسبة</th>
                    <th className="py-2.5 font-semibold">صاحبها</th>
                    <th className="py-2.5 font-semibold">الحالة</th>
                    <th className="py-2.5 font-semibold">المدعوون</th>
                    <th className="py-2.5 font-semibold">الباقة</th>
                    <th className="w-56 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((event) => {
                    const phase = computeEventPhase(event);
                    return (
                      <tr key={event.id} className="border-b border-sand-100 hover:bg-sand-50">
                        <td className="py-3">
                          <p className="font-semibold text-ink">{event.title}</p>
                          <p className="text-xs text-ink-faint">
                            {EVENT_TYPE_LABELS[event.event_type] ?? 'مناسبة'} ·{' '}
                            {formatDateTime(event.starts_at)}
                          </p>
                        </td>
                        <td className="py-3">
                          <p className="text-ink-soft">{event.owner_name}</p>
                          <p className="text-xs text-ink-faint" dir="ltr">
                            {event.owner_email}
                          </p>
                        </td>
                        <td className="py-3">
                          <Badge tone={PHASE_TONES[phase]} dot>
                            {PHASE_LABELS[phase]}
                          </Badge>
                        </td>
                        <td className="py-3 tabular-nums text-ink-soft">
                          {formatNumber(event.attended_count)} / {formatNumber(event.guest_count)}
                        </td>
                        <td className="py-3">
                          <Badge tone={event.is_paid ? 'mint' : 'sand'}>
                            {event.is_paid ? 'مدفوعة' : 'تجريبية'}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Link
                              href={`/dashboard/events/${event.id}`}
                              className="rounded-full bg-sand-100 px-3 py-1 text-xs font-bold text-ink-soft transition-colors hover:bg-sand-200"
                            >
                              فتح
                            </Link>
                            <button
                              type="button"
                              onClick={() => togglePaid(event)}
                              disabled={pending}
                              className="rounded-full bg-sand-100 px-3 py-1 text-xs font-bold text-ink-soft transition-colors hover:bg-sand-200"
                            >
                              {event.is_paid ? 'إلغاء التفعيل' : 'تفعيل يدوي'}
                            </button>
                            <button
                              type="button"
                              onClick={() => remove(event)}
                              disabled={pending}
                              className="rounded-full bg-coral-50 px-3 py-1 text-xs font-bold text-coral-600 transition-colors hover:opacity-80"
                            >
                              حذف
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
