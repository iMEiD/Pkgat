import type { Metadata } from 'next';

import { PrintButton } from './PrintButton';
import { LogoMark } from '@/components/ui/Logo';
import { getEventCounts, getEventGuests, getEventTags, getOwnedEvent } from '@/lib/data/event';
import { createClient } from '@/lib/supabase/server';
import {
  EVENT_TYPE_LABELS,
  formatDate,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatTime,
} from '@/lib/utils/format';
import { tagHex } from '@/lib/design/defaults';

export const metadata: Metadata = {
  title: 'تقرير الحضور',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function PrintReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [event, counts, guests, tags] = await Promise.all([
    getOwnedEvent(id),
    getEventCounts(id),
    getEventGuests(id),
    getEventTags(id),
  ]);

  const { data: overrides } = await supabase
    .from('checkins')
    .select('scanner_name, created_at, note, guest_id')
    .eq('event_id', id)
    .eq('is_override', true)
    .order('created_at');

  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const guestMap = new Map(guests.map((g) => [g.id, g]));

  const byTag = [...tags, null]
    .map((tag) => {
      const list = guests.filter((g) => (tag ? g.tag_id === tag.id : !g.tag_id));
      return {
        name: tag?.name ?? 'بدون فئة',
        color: tag?.color ?? 'sand',
        invited: list.length,
        attended: list.filter((g) => g.checked_in_at).length,
      };
    })
    .filter((r) => r.invited > 0);

  const sorted = [...guests].sort((a, b) => a.name.localeCompare(b.name, 'ar'));

  return (
    <div className="min-h-screen bg-sand-100 py-8 print:bg-white print:py-0">
      <PrintButton />

      <article className="pk-print-sheet mx-auto max-w-[820px] bg-white p-10 shadow-lift print:shadow-none">
        {/* الترويسة */}
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">تقرير حضور المناسبة</h1>
            <p className="mt-1.5 text-lg font-bold text-ink">{event.title}</p>
            <p className="mt-1 text-sm text-ink-soft">
              {EVENT_TYPE_LABELS[event.event_type] ?? 'مناسبة'} · {formatDate(event.starts_at)}
              {event.venue ? ` · ${event.venue}` : ''}
            </p>
          </div>
          <div className="text-left">
            <LogoMark className="h-11 w-11 rounded-2xl" />
            <p className="mt-2 text-[10px] font-bold tracking-[0.2em] text-ink-faint" dir="ltr">
              PKGAT
            </p>
          </div>
        </header>

        {/* الملخّص */}
        <section className="pk-avoid-break mt-6 grid grid-cols-4 gap-3">
          <SummaryBox label="إجمالي المدعوين" value={formatNumber(counts.total)} />
          <SummaryBox label="الحاضرون" value={formatNumber(counts.attended)} />
          <SummaryBox
            label="لم يحضروا"
            value={formatNumber(Math.max(0, counts.total - counts.attended))}
          />
          <SummaryBox
            label="نسبة الحضور"
            value={formatPercent(counts.attended, counts.total)}
            highlight
          />
        </section>

        {/* حسب الفئة */}
        {byTag.length > 0 && (
          <section className="pk-avoid-break mt-8">
            <h2 className="font-display text-lg font-bold text-ink">الحضور حسب الفئة</h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-ink/20 text-right text-xs text-ink-soft">
                  <th className="py-2 font-semibold">الفئة</th>
                  <th className="py-2 font-semibold">المدعوون</th>
                  <th className="py-2 font-semibold">الحاضرون</th>
                  <th className="py-2 font-semibold">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {byTag.map((row) => (
                  <tr key={row.name} className="border-b border-ink/10">
                    <td className="py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: tagHex(row.color) }}
                        />
                        <span className="font-semibold text-ink">{row.name}</span>
                      </span>
                    </td>
                    <td className="py-2 tabular-nums text-ink-soft">{formatNumber(row.invited)}</td>
                    <td className="py-2 tabular-nums text-ink-soft">{formatNumber(row.attended)}</td>
                    <td className="py-2 font-bold tabular-nums text-ink">
                      {formatPercent(row.attended, row.invited)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* التفصيل */}
        <section className="mt-8">
          <h2 className="font-display text-lg font-bold text-ink">
            القائمة التفصيلية ({formatNumber(sorted.length)})
          </h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-ink/20 text-right text-xs text-ink-soft">
                <th className="w-10 py-2 font-semibold">#</th>
                <th className="py-2 font-semibold">الاسم</th>
                <th className="py-2 font-semibold">الفئة</th>
                <th className="py-2 font-semibold">الحضور</th>
                <th className="py-2 font-semibold">وقت الدخول</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((guest, i) => {
                const tag = guest.tag_id ? tagMap.get(guest.tag_id) : null;
                return (
                  <tr key={guest.id} className="border-b border-ink/10">
                    <td className="py-1.5 tabular-nums text-ink-faint">{i + 1}</td>
                    <td className="py-1.5 font-semibold text-ink">
                      {guest.name}
                      {guest.seats > 1 && (
                        <span className="mr-1.5 text-xs font-normal text-ink-faint">
                          ({guest.seats} أشخاص)
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-ink-soft">{tag?.name ?? '—'}</td>
                    <td className="py-1.5">
                      {guest.checked_in_at ? (
                        <span className="font-bold text-mint-600">حضر ✓</span>
                      ) : (
                        <span className="text-ink-faint">لم يحضر</span>
                      )}
                    </td>
                    <td className="py-1.5 tabular-nums text-ink-soft">
                      {guest.checked_in_at ? formatTime(guest.checked_in_at) : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* التجاوزات */}
        {(overrides ?? []).length > 0 && (
          <section className="pk-avoid-break mt-8">
            <h2 className="font-display text-lg font-bold text-ink">
              حالات التجاوز اليدوي ({formatNumber((overrides ?? []).length)})
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              دخول سُمح به رغم تنبيه النظام — مسجَّل لأغراض المراجعة.
            </p>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-ink/20 text-right text-xs text-ink-soft">
                  <th className="py-2 font-semibold">المدعو</th>
                  <th className="py-2 font-semibold">نفّذها</th>
                  <th className="py-2 font-semibold">الوقت</th>
                </tr>
              </thead>
              <tbody>
                {(overrides ?? []).map((row, i) => (
                  <tr key={i} className="border-b border-ink/10">
                    <td className="py-1.5 text-ink">
                      {row.guest_id ? (guestMap.get(row.guest_id)?.name ?? '—') : '—'}
                    </td>
                    <td className="py-1.5 text-ink-soft">{row.scanner_name ?? '—'}</td>
                    <td className="py-1.5 tabular-nums text-ink-soft">
                      {formatTime(row.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <footer className="mt-10 border-t border-ink/20 pt-4 text-center text-[11px] text-ink-faint">
          صدر هذا التقرير من منصة بكجات في {formatDateTime(new Date())}
        </footer>
      </article>
    </div>
  );
}

function SummaryBox({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 text-center ${
        highlight ? 'border-grape-300 bg-grape-50' : 'border-ink/15 bg-sand-50'
      }`}
    >
      <p className="text-[11px] font-semibold text-ink-soft">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  );
}
