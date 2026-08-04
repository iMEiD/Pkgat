import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, ProgressBar, Stat } from '@/components/ui/Misc';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { EVENT_TYPE_LABELS, formatDateTime, formatNumber, formatPercent, relativeTime } from '@/lib/utils/format';
import { PHASE_LABELS, PHASE_TONES, computeEventPhase } from '@/lib/utils/event-phase';
import type { EventRow } from '@/lib/types/database';

export const metadata: Metadata = { title: 'مناسباتي' };
export const dynamic = 'force-dynamic';

interface EventWithCounts extends EventRow {
  guestCount: number;
  attendedCount: number;
}

export default async function DashboardHome() {
  const session = await requireUser('/dashboard');
  const supabase = await createClient();

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('owner_id', session.id)
    .order('starts_at', { ascending: false });

  const rows = (events ?? []) as EventRow[];

  // نجلب عدّادات المدعوين لكل المناسبات في استعلام واحد
  const ids = rows.map((e) => e.id);
  const counts = new Map<string, { total: number; attended: number }>();

  if (ids.length > 0) {
    const { data: guests } = await supabase
      .from('guests')
      .select('event_id, checked_in_at')
      .in('event_id', ids);

    for (const g of guests ?? []) {
      const entry = counts.get(g.event_id) ?? { total: 0, attended: 0 };
      entry.total += 1;
      if (g.checked_in_at) entry.attended += 1;
      counts.set(g.event_id, entry);
    }
  }

  const enriched: EventWithCounts[] = rows.map((e) => ({
    ...e,
    guestCount: counts.get(e.id)?.total ?? 0,
    attendedCount: counts.get(e.id)?.attended ?? 0,
  }));

  const upcoming = enriched.filter((e) => computeEventPhase(e) !== 'ended');
  const past = enriched.filter((e) => computeEventPhase(e) === 'ended');
  const totalGuests = enriched.reduce((sum, e) => sum + e.guestCount, 0);
  const totalAttended = enriched.reduce((sum, e) => sum + e.attendedCount, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">مناسباتي</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            أنشئ مناسبة، صمّم دعوتها، وولّد باركود لكل مدعو.
          </p>
        </div>
        <ButtonLink href="/dashboard/events/new">
          <Icon name="plus" className="h-4 w-4" />
          مناسبة جديدة
        </ButtonLink>
      </div>

      {enriched.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="إجمالي المناسبات" value={formatNumber(enriched.length)} tone="grape" />
          <Stat label="إجمالي المدعوين" value={formatNumber(totalGuests)} tone="sky" />
          <Stat
            label="إجمالي الحضور"
            value={formatNumber(totalAttended)}
            hint={totalGuests > 0 ? `نسبة ${formatPercent(totalAttended, totalGuests)}` : undefined}
            tone="mint"
          />
        </div>
      )}

      {enriched.length === 0 ? (
        <EmptyState
          icon="🎉"
          title="ما عندك مناسبات بعد"
          description="ابدأ بإنشاء أول مناسبة — التصميم والباركودات تجي بعدها مباشرة."
          action={<ButtonLink href="/dashboard/events/new">أنشئ أول مناسبة</ButtonLink>}
        />
      ) : (
        <>
          {upcoming.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-bold text-ink-faint">المناسبات النشطة والقادمة</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {upcoming.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="mb-4 text-sm font-bold text-ink-faint">المناسبات المنتهية</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {past.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function EventCard({ event }: { event: EventWithCounts }) {
  const phase = computeEventPhase(event);
  const hasDesign = Boolean(event.design?.backgroundUrl);

  return (
    <Link href={`/dashboard/events/${event.id}`} className="block">
      <Card interactive className="h-full p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-bold text-ink">{event.title}</h3>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
              <span>{EVENT_TYPE_LABELS[event.event_type] ?? 'مناسبة'}</span>
              <span className="text-ink-faint">·</span>
              <span>{formatDateTime(event.starts_at)}</span>
            </p>
          </div>
          <Badge tone={PHASE_TONES[phase]} dot>
            {PHASE_LABELS[phase]}
          </Badge>
        </div>

        {event.venue && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-faint">
            <Icon name="location" className="h-3.5 w-3.5" />
            <span className="truncate">{event.venue}</span>
          </p>
        )}

        <div className="mt-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-soft">
              الحضور: <span className="font-bold text-ink">{formatNumber(event.attendedCount)}</span>{' '}
              من {formatNumber(event.guestCount)}
            </span>
            <span className="font-bold text-ink-soft">
              {formatPercent(event.attendedCount, event.guestCount)}
            </span>
          </div>
          <ProgressBar
            value={event.attendedCount}
            max={event.guestCount || 1}
            tone={phase === 'ended' ? 'grape' : 'mint'}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-sand-200 pt-4">
          {!hasDesign && <Badge tone="sunny">التصميم ناقص</Badge>}
          {event.guestCount === 0 && <Badge tone="sunny">لا يوجد مدعوون</Badge>}
          {!event.is_paid && <Badge tone="sand">تجربة مجانية</Badge>}
          {phase === 'upcoming' && (
            <span className="text-xs text-ink-faint">تبدأ {relativeTime(event.starts_at)}</span>
          )}
        </div>
      </Card>
    </Link>
  );
}
