'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getEventQuota, quotaMessage } from '@/lib/data/quota';
import type { ActionResult } from '@/lib/actions/events';
import type { EventTag, Guest } from '@/lib/types/database';

export interface GuestInput {
  name: string;
  phone?: string | null;
  tagId?: string | null;
  seats?: number;
}

export interface AddGuestsResult extends ActionResult {
  added?: number;
  skipped?: number;
  /** يُرفع عند تجاوز الحد المجاني — تعرض الواجهة عندها بوابة الدفع */
  paymentRequired?: boolean;
  limit?: number;
  current?: number;
}

const MAX_BATCH = 2000;

/**
 * يضيف مدعوين مع فرض الحد التجريبي المجاني.
 * الحد يُتحقق منه هنا (على الخادم) وليس في الواجهة.
 */
export async function addGuests(
  eventId: string,
  guests: GuestInput[],
): Promise<AddGuestsResult> {
  const session = await requireUser();
  const supabase = await createClient();

  const cleaned = guests
    .map((g) => ({
      name: String(g.name ?? '').trim().replace(/\s+/g, ' '),
      phone: g.phone ? String(g.phone).trim() : null,
      tag_id: g.tagId || null,
      seats: Math.max(1, Math.min(50, Number(g.seats) || 1)),
    }))
    .filter((g) => g.name.length > 0 && g.name.length <= 120);

  if (cleaned.length === 0) return { ok: false, error: 'لا توجد أسماء صالحة للإضافة.' };
  if (cleaned.length > MAX_BATCH) {
    return { ok: false, error: `الحد الأقصى ${MAX_BATCH} مدعو في المرة الواحدة.` };
  }

  const { data: event } = await supabase
    .from('events')
    .select('id, free_quota, is_paid, plan_id, owner_id, is_demo')
    .eq('id', eventId)
    .single();

  if (!event) return { ok: false, error: 'المناسبة غير موجودة.' };

  const { count: currentCount } = await supabase
    .from('guests')
    .select('id', { count: 'exact', head: true })
    .eq('event_id', eventId);

  const current = currentCount ?? 0;

  // المصدر الموحّد نفسه الذي يعرضه التطبيق ويفرضه guest_over_limit في SQL
  const quota = await getEventQuota(event, session.id);
  const limit = quota.limit;

  if (limit !== null && current + cleaned.length > limit) {
    return {
      ok: false,
      paymentRequired: !event.is_paid,
      limit,
      current,
      error: quotaMessage(quota, current),
    };
  }

  const { error } = await supabase
    .from('guests')
    .insert(cleaned.map((g) => ({ ...g, event_id: eventId })));

  if (error) return { ok: false, error: 'تعذّرت إضافة المدعوين. حاول مرة أخرى.' };

  revalidatePath(`/dashboard/events/${eventId}/guests`);
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true, added: cleaned.length, skipped: guests.length - cleaned.length };
}

export async function updateGuest(
  guestId: string,
  eventId: string,
  patch: { name?: string; phone?: string | null; tagId?: string | null; seats?: number },
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const update: Partial<Guest> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { ok: false, error: 'اسم المدعو مطلوب.' };
    update.name = name;
  }
  if (patch.phone !== undefined) update.phone = patch.phone?.trim() || null;
  if (patch.tagId !== undefined) update.tag_id = patch.tagId || null;
  if (patch.seats !== undefined) update.seats = Math.max(1, Math.min(50, patch.seats));

  const { error } = await supabase.from('guests').update(update).eq('id', guestId);
  if (error) return { ok: false, error: 'تعذّر حفظ التعديل.' };

  revalidatePath(`/dashboard/events/${eventId}/guests`);
  return { ok: true };
}

export async function deleteGuests(guestIds: string[], eventId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  if (guestIds.length === 0) return { ok: false, error: 'لم تحدد أي مدعو.' };

  const { error } = await supabase.from('guests').delete().in('id', guestIds);
  if (error) return { ok: false, error: 'تعذّر حذف المدعوين.' };

  revalidatePath(`/dashboard/events/${eventId}/guests`);
  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

/** يعيد باركود المدعو لحالة "غير مستخدم" — لتصحيح مسح خاطئ */
export async function resetGuestCheckin(guestId: string, eventId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from('guests')
    .update({ checked_in_at: null, checked_in_by: null, entries_count: 0 })
    .eq('id', guestId);

  if (error) return { ok: false, error: 'تعذّرت إعادة تعيين حالة المدعو.' };

  revalidatePath(`/dashboard/events/${eventId}/guests`);
  return { ok: true };
}

// ===================== الفئات (Tags) =====================

export async function createTag(
  eventId: string,
  name: string,
  color: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const clean = name.trim();
  if (!clean) return { ok: false, error: 'اسم الفئة مطلوب.' };

  const { data, error } = await supabase
    .from('event_tags')
    .insert({ event_id: eventId, name: clean, color })
    .select('id')
    .single();

  if (error) {
    return {
      ok: false,
      error: error.code === '23505' ? 'هذه الفئة موجودة مسبقاً.' : 'تعذّر إنشاء الفئة.',
    };
  }

  revalidatePath(`/dashboard/events/${eventId}/guests`);
  return { ok: true, id: data.id };
}

export async function updateTag(
  tagId: string,
  eventId: string,
  patch: { name?: string; color?: string },
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const update: Partial<EventTag> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) return { ok: false, error: 'اسم الفئة مطلوب.' };
    update.name = name;
  }
  if (patch.color !== undefined) update.color = patch.color;

  const { error } = await supabase.from('event_tags').update(update).eq('id', tagId);
  if (error) return { ok: false, error: 'تعذّر تعديل الفئة.' };

  revalidatePath(`/dashboard/events/${eventId}/guests`);
  return { ok: true };
}

/** حذف الفئة لا يحذف مدعويها — يصيرون "بدون فئة" */
export async function deleteTag(tagId: string, eventId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from('event_tags').delete().eq('id', tagId);
  if (error) return { ok: false, error: 'تعذّر حذف الفئة.' };

  revalidatePath(`/dashboard/events/${eventId}/guests`);
  return { ok: true };
}

/** إسناد فئة لمجموعة مدعوين دفعة واحدة */
export async function assignTag(
  guestIds: string[],
  tagId: string | null,
  eventId: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  if (guestIds.length === 0) return { ok: false, error: 'لم تحدد أي مدعو.' };

  const { error } = await supabase.from('guests').update({ tag_id: tagId }).in('id', guestIds);
  if (error) return { ok: false, error: 'تعذّر تحديث الفئة.' };

  revalidatePath(`/dashboard/events/${eventId}/guests`);
  return { ok: true };
}
