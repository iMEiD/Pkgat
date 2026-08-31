import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { mergeDesign } from '@/lib/design/defaults';
import type { DesignConfig, EventType, RsvpStatus } from '@/lib/types/database';

/**
 * صفحة الدعوة العامة.
 *
 * كل القراءة تمرّ بدالة invite_view في قاعدة البيانات، ولا نلمس جدول
 * guests من هنا. والسبب أن الصفحة تُفتح بلا جلسة: أي استعلامٍ مباشر
 * كان سيحتاج مفتاح الخدمة، ومفتاح الخدمة في صفحةٍ عامة يعني أن خطأً
 * واحداً في شرطٍ يكشف مدعوّي مناسبةٍ كاملة. أما الدالة فتُعيد حقولاً
 * معدودة، ولا تُعيد الباركود إلا بعد التأكيد.
 */

export interface InviteEvent {
  title: string;
  type: EventType;
  starts_at: string;
  ends_at: string | null;
  venue: string | null;
  map_url: string | null;
  note: string | null;
  design: DesignConfig;
}

export interface InviteView {
  guestName: string;
  seats: number;
  status: RsvpStatus;
  note: string | null;
  respondedAt: string | null;
  /** يصل من الخادم فارغاً ما لم يؤكّد المدعو حضوره */
  code: string | null;
  checkedIn: boolean;
  event: InviteEvent;
}

/**
 * null يعني «لا دعوة هنا» — رمزاً مجهولاً كان أو مناسبةً أُغلقت أو
 * تأكيدَ حضورٍ غير مفعّل. ولا نفرّق بينها في الواجهة عمداً: التفريق
 * يخبر من يجرّب الروابط أيُّ رمزٍ صحيح.
 */
export async function getInvite(token: string): Promise<InviteView | null> {
  // رمز غير صالح الشكل يصل القاعدة كخطأ نوع لا كنتيجة فارغة
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('invite_view', { p_token: token });

  if (error || !data) return null;

  const raw = data;
  if (raw.state !== 'ok' || !raw.event) return null;

  return {
    guestName: raw.guest_name ?? '',
    seats: raw.seats ?? 1,
    status: raw.rsvp_status ?? 'pending',
    note: raw.rsvp_note ?? null,
    respondedAt: raw.responded_at ?? null,
    code: raw.code ?? null,
    checkedIn: Boolean(raw.checked_in),
    event: { ...raw.event, design: mergeDesign(raw.event.design) },
  };
}

export type RespondResult =
  | { ok: true; status: RsvpStatus; code: string | null }
  | { ok: false; reason: 'not_found' | 'closed' | 'already_attended' | 'bad_status' | 'error' };

export async function respondToInvite(
  token: string,
  status: 'confirmed' | 'declined',
  note: string | null,
): Promise<RespondResult> {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { ok: false, reason: 'not_found' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('rsvp_respond', {
    p_token: token,
    p_status: status,
    // نقصّ التهنئة هنا لا في القاعدة: الحدّ قرار واجهة، ورسالة
    // الخطأ من القاعدة لا تُقرأ بالعربية
    p_note: note ? note.slice(0, 500) : null,
  });

  if (error || !data) return { ok: false, reason: 'error' };

  const res = data;
  if (!res.ok) {
    const known = ['not_found', 'closed', 'already_attended', 'bad_status'] as const;
    const reason = known.find((r) => r === res.reason) ?? 'error';
    return { ok: false, reason };
  }

  return { ok: true, status: res.status ?? status, code: res.code ?? null };
}
