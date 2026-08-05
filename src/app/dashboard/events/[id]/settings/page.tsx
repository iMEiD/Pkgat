import type { Metadata } from 'next';

import { EventSettingsForm } from './EventSettingsForm';
import { getEventCounts, getGuestLimit, getOwnedEvent } from '@/lib/data/event';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'إعدادات المناسبة' };
export const dynamic = 'force-dynamic';

export default async function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, event] = await Promise.all([requireUser(), getOwnedEvent(id)]);

  // التفعيل اليدوي لا يتجاوز حدّ الباقة، فنحتاج العدد والحد معاً حتى لا
  // تقول اللوحة «مفعّلة» بينما جزء من الباركودات غير مفعّل فعلياً
  const [counts, limit] = await Promise.all([
    getEventCounts(id),
    getGuestLimit(event, session.id),
  ]);

  return (
    <EventSettingsForm
      event={event}
      guestCount={counts.total}
      guestLimit={limit}
    />
  );
}
