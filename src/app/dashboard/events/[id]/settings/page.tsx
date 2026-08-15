import type { Metadata } from 'next';

import { EventSettingsForm } from './EventSettingsForm';
import { ConfirmSetup } from '@/components/dashboard/ConfirmSetup';
import { getEventCounts, getGuestLimit, getOwnedEvent } from '@/lib/data/event';
import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'إعدادات المناسبة' };
export const dynamic = 'force-dynamic';

export default async function EventSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [session, event] = await Promise.all([requireUser(), getOwnedEvent(id)]);
  const supabase = await createClient();

  // التفعيل اليدوي لا يتجاوز حدّ الباقة، فنحتاج العدد والحد معاً حتى لا
  // تقول اللوحة «مفعّلة» بينما جزء من الباركودات غير مفعّل فعلياً
  const [counts, limit, { count: scanners }] = await Promise.all([
    getEventCounts(id),
    getGuestLimit(event, session.id),
    supabase
      .from('scanner_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id)
      .eq('is_active', true),
  ]);

  return (
    <div className="space-y-6">
      <EventSettingsForm event={event} guestCount={counts.total} guestLimit={limit} />

      {/* المراجعة والتأكيد بعد النموذج: يعدّل أولاً ثم يقرأ ويؤكّد */}
      <ConfirmSetup event={event} guestCount={counts.total} scannerCount={scanners ?? 0} />
    </div>
  );
}
