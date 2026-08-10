import { notFound } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { getEventQuota } from '@/lib/data/quota';
import { requireUser } from '@/lib/auth/session';
import { mergeDesign } from '@/lib/design/defaults';
import type { EventRow, EventTag, GuestState } from '@/lib/types/database';

/** يجلب المناسبة ويتحقق من ملكيتها (RLS تتكفل بالمنع، وnotFound يخفي وجودها) */
export async function getOwnedEvent(eventId: string): Promise<EventRow> {
  await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase.from('events').select('*').eq('id', eventId).single();

  if (error || !data) notFound();

  return { ...(data as EventRow), design: mergeDesign(data.design) };
}

export async function getEventTags(eventId: string): Promise<EventTag[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('event_tags')
    .select('*')
    .eq('event_id', eventId)
    .order('sort_order')
    .order('name');
  return (data ?? []) as EventTag[];
}

export async function getEventGuests(eventId: string): Promise<GuestState[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from('guest_states')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at');
  return (data ?? []) as GuestState[];
}

export interface EventCounts {
  total: number;
  attended: number;
  overrides: number;
}

export async function getEventCounts(eventId: string): Promise<EventCounts> {
  const supabase = await createClient();

  const [{ count: total }, { count: attended }, { count: overrides }] = await Promise.all([
    supabase.from('guests').select('id', { count: 'exact', head: true }).eq('event_id', eventId),
    supabase
      .from('guests')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .not('checked_in_at', 'is', null),
    supabase
      .from('checkins')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', eventId)
      .eq('is_override', true),
  ]);

  return { total: total ?? 0, attended: attended ?? 0, overrides: overrides ?? 0 };
}

/**
 * الحد الأقصى للمدعوين المسموح به حالياً — null يعني غير محدود.
 * يراعي: الاشتراك الفعّال ← الباقة المدفوعة ← الحد التجريبي المجاني.
 */
export async function getGuestLimit(event: EventRow, userId: string): Promise<number | null> {
  return (await getEventQuota(event, userId)).limit;
}

