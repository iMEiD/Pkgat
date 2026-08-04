import type { Metadata } from 'next';

import { LiveLog } from './LiveLog';
import { getEventCounts, getOwnedEvent } from '@/lib/data/event';
import { createClient } from '@/lib/supabase/server';
import type { Checkin } from '@/lib/types/database';

export const metadata: Metadata = { title: 'السجل المباشر' };
export const dynamic = 'force-dynamic';

export default async function LivePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const [event, counts, { data: checkins }] = await Promise.all([
    getOwnedEvent(id),
    getEventCounts(id),
    supabase
      .from('checkins')
      .select('*')
      .eq('event_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  // نربط كل عملية مسح باسم المدعو لعرضه في السجل
  const guestIds = [...new Set((checkins ?? []).map((c) => c.guest_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();

  if (guestIds.length > 0) {
    const { data: guests } = await supabase.from('guests').select('id, name').in('id', guestIds);
    for (const g of guests ?? []) names.set(g.id, g.name);
  }

  const entries = (checkins ?? []).map((c) => ({
    ...(c as Checkin),
    guest_name: c.guest_id ? (names.get(c.guest_id) ?? 'مدعو محذوف') : null,
  }));

  return <LiveLog eventId={event.id} initialEntries={entries} initialCounts={counts} />;
}
