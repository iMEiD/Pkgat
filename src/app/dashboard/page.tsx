import type { Metadata } from 'next';
import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, ProgressBar, Stat } from '@/components/ui/Misc';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { PlanBanner } from '@/components/dashboard/PlanBanner';
import { NextEventCard } from '@/components/dashboard/NextEventCard';
import { AttentionList } from '@/components/dashboard/AttentionList';
import { QuickLinks } from '@/components/dashboard/QuickLinks';
import { GettingStarted, type StartStep } from '@/components/dashboard/GettingStarted';
import { getPlanStatus } from '@/lib/data/subscription';
import { collectIssues, loadReadiness, pickNextEvent } from '@/lib/data/dashboard';
import { getSettings } from '@/lib/cms';
import { readContactLinks } from '@/lib/site-settings';
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

  async function loadEvents() {
    const { data } = await supabase
      .from('events')
      .select('*')
      .eq('owner_id', session.id)
      .order('starts_at', { ascending: false });
    return (data ?? []) as EventRow[];
  }

  let rows = await loadEvents();
  const planStatus = await getPlanStatus(session.id);

  // أول زيارة بلا مناسبات: نزرع مناسبة تجريبية ليجرّب المسح فوراً.
  // seedDemoEvent يحرس نفسه بعلامة demo_seeded فلا يتكرر الزرع.
  if (rows.length === 0) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('demo_seeded')
      .eq('id', session.id)
      .maybeSingle();

    if (profile && !profile.demo_seeded) {
      const { seedDemoEvent } = await import('@/lib/data/demo-event');
      if (await seedDemoEvent(session.id)) rows = await loadEvents();
    }
  }

  // الجاهزية والنواقص تُحسب مرة واحدة لكل المناسبات
  const [readiness, settings] = await Promise.all([loadReadiness(rows, session.id), getSettings()]);

  const enriched: EventWithCounts[] = readiness.map((r) => ({
    ...r.event,
    guestCount: r.guestCount,
    attendedCount: r.attendedCount,
  }));

  const nextEvent = pickNextEvent(readiness);
  const issues = collectIssues(readiness, nextEvent?.event.id);
  const contact = readContactLinks(settings);

  const realEvents = readiness.filter((r) => !r.event.is_demo);
  const first = realEvents[0];
  const startSteps: StartStep[] = [
    {
      label: 'أنشئ مناسبتك',
      hint: 'اسمها ونوعها وتاريخها وموقعها',
      done: realEvents.length > 0,
      href: '/dashboard/events/new',
    },
    {
      label: 'صمّم الدعوة',
      hint: 'قالب جاهز أو تصميمك الخاص، وحدّد مكان الاسم والباركود',
      done: Boolean(first?.hasDesign),
      href: first ? `/dashboard/events/${first.event.id}/design` : '/dashboard/events/new',
    },
    {
      label: 'أضف المدعوين',
      hint: 'يدوي أو لصق قائمة أو استيراد ملف',
      done: (first?.guestCount ?? 0) > 0,
      href: first ? `/dashboard/events/${first.event.id}/guests` : '/dashboard/events/new',
    },
    {
      label: 'جرّب المسح',
      hint: 'أنشئ حساب مسح وامسح باركوداً من جوال ثانٍ',
      done: (first?.scannerCount ?? 0) > 0,
      href: first ? `/dashboard/events/${first.event.id}/scanners` : '/dashboard/events/new',
    },
  ];

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

      {/* الباقة أولاً: يعرفها المستخدم قبل أن يصطدم بحدّها وهو يضيف مدعوين */}
      <PlanBanner status={planStatus} />

      {/* الدليل يختفي وحده بعد إتمام خطواته */}
      <GettingStarted steps={startSteps} />

      {/* ما الذي عليّ فعله الآن؟ — سؤال صاحب المناسبة الأول */}
      {nextEvent && <NextEventCard item={nextEvent} />}

      <AttentionList issues={issues} />

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
      {enriched.length > 0 && (
        <QuickLinks
          scanUrl={`${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://pkgat.com'}/scan/login`}
          supportWhatsapp={contact.whatsapp}
        />
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
