import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { EventTabs } from '@/components/dashboard/EventTabs';
import { getOwnedEvent } from '@/lib/data/event';
import { EVENT_TYPE_LABELS, formatDateTime } from '@/lib/utils/format';
import { PHASE_LABELS, PHASE_TONES, computeEventPhase } from '@/lib/utils/event-phase';

export default async function EventLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const event = await getOwnedEvent(id);
  const phase = computeEventPhase(event);

  return (
    <div>
      <div className="mb-5">
        <Link
          href="/dashboard"
          className="text-xs font-semibold text-ink-faint transition-colors hover:text-grape-600"
        >
          ← كل المناسبات
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-ink sm:text-3xl">{event.title}</h1>
          <Badge tone={PHASE_TONES[phase]} dot>
            {PHASE_LABELS[phase]}
          </Badge>
          {!event.is_paid && <Badge tone="sunny">تجربة مجانية</Badge>}
        </div>
        <p className="mt-1.5 text-sm text-ink-soft">
          {EVENT_TYPE_LABELS[event.event_type] ?? 'مناسبة'} · {formatDateTime(event.starts_at)}
          {event.venue && ` · ${event.venue}`}
        </p>
      </div>

      <EventTabs eventId={id} />

      {children}
    </div>
  );
}
