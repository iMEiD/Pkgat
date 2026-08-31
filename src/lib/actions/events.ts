'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import { getFreeQuota } from '@/lib/cms';
import { defaultDesign, SUGGESTED_TAGS } from '@/lib/design/defaults';
import type { DesignConfig, EventType } from '@/lib/types/database';
import { parseEventLocal } from '@/lib/utils/time';

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

const EVENT_TYPES = new Set(['wedding', 'graduation', 'party', 'other']);

/**
 * تسامح مع الماضي القريب عند إنشاء المناسبة.
 * ساعتان تكفيان لمن يسجّل مناسبة بدأت للتو، وتمنع رفض الإدخال لمجرد
 * فارق دقائق بين ساعة جهازه والخادم.
 */
const PAST_TOLERANCE_MS = 2 * 60 * 60 * 1000;

/** ينشئ مناسبة جديدة مع فئاتها المقترحة */
export async function createEvent(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const session = await requireUser();
  const supabase = await createClient();

  const title = String(formData.get('title') ?? '').trim();
  const eventType = String(formData.get('event_type') ?? 'other');
  const startsAt = String(formData.get('starts_at') ?? '');
  const endsAt = String(formData.get('ends_at') ?? '');
  const venue = String(formData.get('venue') ?? '').trim();

  if (!title) return { ok: false, error: 'اسم المناسبة مطلوب.' };
  if (!EVENT_TYPES.has(eventType)) return { ok: false, error: 'نوع المناسبة غير صالح.' };
  if (!startsAt) return { ok: false, error: 'تاريخ ووقت المناسبة مطلوب.' };

  // الوقت المُدخل يُفسَّر بتوقيت السعودية دائماً — لا بتوقيت خادم Vercel (UTC)
  const startDate = parseEventLocal(startsAt);
  if (!startDate) return { ok: false, error: 'تاريخ غير صالح.' };

  // مناسبة بتاريخ ماضٍ تولد منتهية: حالة الباركود تُحسب من now()، فتخرج
  // كل الباركودات 'expired' ولا يُمسح أحد — والمستخدم يظن أن المسح معطّل.
  // نمنعها عند الإنشاء بدل أن يكتشفها على الباب.
  if (startDate.getTime() < Date.now() - PAST_TOLERANCE_MS) {
    return { ok: false, error: 'تاريخ المناسبة في الماضي. اختر تاريخاً ووقتاً قادمين.' };
  }

  const endDate = endsAt ? parseEventLocal(endsAt) : null;
  if (endsAt && !endDate) return { ok: false, error: 'وقت الانتهاء غير صالح.' };
  if (endDate && endDate <= startDate) {
    return { ok: false, error: 'وقت انتهاء المناسبة يجب أن يكون بعد وقت البداية.' };
  }

  // حصة خاصة منحها الأدمن لهذا المستخدم تسبق الإعداد العام
  const { data: profile } = await supabase
    .from('profiles')
    .select('free_quota_override')
    .eq('id', session.id)
    .maybeSingle();

  const freeQuota = profile?.free_quota_override ?? (await getFreeQuota());

  const { data, error } = await supabase
    .from('events')
    .insert({
      owner_id: session.id,
      title,
      event_type: eventType as EventType,
      starts_at: startDate.toISOString(),
      ends_at: endDate ? endDate.toISOString() : null,
      venue: venue || null,
      free_quota: freeQuota,
      design: defaultDesign() as unknown as DesignConfig,
    })
    .select('id')
    .single();

  if (error || !data) {
    return { ok: false, error: 'تعذّر إنشاء المناسبة. حاول مرة أخرى.' };
  }

  // الفئات المقترحة حسب نوع المناسبة (قابلة للتعديل والحذف لاحقاً)
  const suggested = SUGGESTED_TAGS[eventType] ?? [];
  if (suggested.length > 0) {
    await supabase.from('event_tags').insert(
      suggested.map((t, i) => ({
        event_id: data.id,
        name: t.name,
        color: t.color,
        sort_order: i,
      })),
    );
  }

  revalidatePath('/dashboard');
  redirect(`/dashboard/events/${data.id}/design`);
}

export async function updateEventDetails(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const id = String(formData.get('id') ?? '');
  const title = String(formData.get('title') ?? '').trim();
  const eventType = String(formData.get('event_type') ?? 'other');
  const startsAt = String(formData.get('starts_at') ?? '');
  const endsAt = String(formData.get('ends_at') ?? '');
  const venue = String(formData.get('venue') ?? '').trim();
  const mapUrl = String(formData.get('map_url') ?? '').trim();
  const notes = String(formData.get('notes') ?? '').trim();
  const guestNote = String(formData.get('guest_note') ?? '').trim();
  const rsvpEnabled = formData.get('rsvp_enabled') === 'on';
  const lead = Number(formData.get('activation_lead_minutes') ?? 15);
  const grace = Number(formData.get('expiry_grace_minutes') ?? 1440);

  if (!id) return { ok: false, error: 'مناسبة غير معروفة.' };
  if (!title) return { ok: false, error: 'اسم المناسبة مطلوب.' };
  if (!EVENT_TYPES.has(eventType)) return { ok: false, error: 'نوع المناسبة غير صالح.' };

  const startDate = parseEventLocal(startsAt);
  if (!startDate) return { ok: false, error: 'تاريخ غير صالح.' };

  const endDate = endsAt ? parseEventLocal(endsAt) : null;
  if (endsAt && !endDate) return { ok: false, error: 'وقت الانتهاء غير صالح.' };
  if (endDate && endDate <= startDate) {
    return { ok: false, error: 'وقت الانتهاء يجب أن يكون بعد وقت البداية.' };
  }

  /*
   * الرابط يُفتح في جهاز المدعو، فلا يجوز أن يكون javascript: أو data:.
   * وقبولُ نصٍّ حرٍّ هنا لأن العميل ينسخ من خرائط جوجل أو آبل أو مختصِر
   * روابط — والتحقق يقتصر على البروتوكول لا على النطاق.
   */
  if (mapUrl && !/^https?:\/\//i.test(mapUrl)) {
    return { ok: false, error: 'رابط الخريطة لازم يبدأ بـ https://' };
  }

  const { error } = await supabase
    .from('events')
    .update({
      title,
      event_type: eventType as EventType,
      starts_at: startDate.toISOString(),
      ends_at: endDate ? endDate.toISOString() : null,
      venue: venue || null,
      map_url: mapUrl || null,
      notes: notes || null,
      guest_note: guestNote.slice(0, 400) || null,
      rsvp_enabled: rsvpEnabled,
      activation_lead_minutes: Number.isFinite(lead) ? Math.max(0, Math.min(10080, lead)) : 15,
      expiry_grace_minutes: Number.isFinite(grace) ? Math.max(0, Math.min(20160, grace)) : 1440,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { ok: false, error: 'تعذّر حفظ التعديلات.' };

  revalidatePath(`/dashboard/events/${id}`);
  revalidatePath('/dashboard');
  return { ok: true };
}

/** يحفظ إعدادات التصميم (القالب/الرفع + موضع الاسم + الباركود) */
export async function saveDesign(
  eventId: string,
  design: DesignConfig,
  templateId: string | null,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  // تحقق من القيم قبل الحفظ حتى لا تُخزَّن إحداثيات خارج التصميم
  const clamp01 = (n: number) => Math.min(1, Math.max(0, Number(n) || 0));
  const safe: DesignConfig = {
    ...design,
    width: Math.min(4000, Math.max(200, Math.round(design.width) || 1080)),
    height: Math.min(4000, Math.max(200, Math.round(design.height) || 1920)),
    name: {
      ...design.name,
      x: clamp01(design.name.x),
      y: clamp01(design.name.y),
      fontSize: Math.min(0.3, Math.max(0.01, design.name.fontSize)),
    },
    qr: {
      ...design.qr,
      x: clamp01(design.qr.x),
      y: clamp01(design.qr.y),
      size: Math.min(0.6, Math.max(0.05, design.qr.size)),
      margin: Math.min(8, Math.max(0, Math.round(design.qr.margin))),
    },
    extras: (design.extras ?? []).map((e) => ({
      ...e,
      x: clamp01(e.x),
      y: clamp01(e.y),
      fontSize: Math.min(0.3, Math.max(0.01, e.fontSize)),
    })),
  };

  const { error } = await supabase
    .from('events')
    .update({
      design: safe,
      template_id: templateId,
      status: safe.backgroundUrl ? 'ready' : 'draft',
      updated_at: new Date().toISOString(),
    })
    .eq('id', eventId);

  if (error) return { ok: false, error: 'تعذّر حفظ التصميم.' };

  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

/**
 * تحكم يدوي بحالة الباركودات يتجاوز التوقيت التلقائي.
 * open = مفعّلة الآن · closed = موقوفة الآن · auto = حسب توقيت المناسبة
 */
export async function setActivationOverride(
  eventId: string,
  override: 'auto' | 'open' | 'closed',
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  if (!['auto', 'open', 'closed'].includes(override)) {
    return { ok: false, error: 'حالة غير صالحة.' };
  }

  const { error } = await supabase
    .from('events')
    .update({ activation_override: override, updated_at: new Date().toISOString() })
    .eq('id', eventId);

  if (error) return { ok: false, error: 'تعذّر تغيير حالة الباركودات.' };

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath(`/dashboard/events/${eventId}/settings`);
  return { ok: true };
}

export async function endEvent(eventId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from('events')
    .update({ status: 'ended', ended_manually_at: new Date().toISOString() })
    .eq('id', eventId);

  if (error) return { ok: false, error: 'تعذّر إنهاء المناسبة.' };

  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

export async function reopenEvent(eventId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from('events')
    .update({ status: 'ready', ended_manually_at: null })
    .eq('id', eventId);

  if (error) return { ok: false, error: 'تعذّر إعادة فتح المناسبة.' };

  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase.from('events').delete().eq('id', eventId);
  if (error) return { ok: false, error: 'تعذّر حذف المناسبة.' };

  revalidatePath('/dashboard');
  redirect('/dashboard');
}

/**
 * تأكيد صحّة بيانات المناسبة — الخطوة الرابعة.
 *
 * فعل صريح لا استنتاج: كانت الخطوة تُحسب مكتملة إن امتلأت حقول بعينها،
 * فمن ترك الموقع فارغاً تبقى ناقصة أبداً مهما ضغط «حفظ». وهي أصلاً
 * قرارٌ لا حالة — «راجعت بياناتي وأقررت أنها صحيحة».
 */
export async function confirmEventSetup(eventId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from('events')
    .update({ setup_confirmed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', eventId);

  if (error) return { ok: false, error: 'تعذّر تأكيد البيانات.' };

  revalidatePath(`/dashboard/events/${eventId}`);
  revalidatePath(`/dashboard/events/${eventId}/settings`);
  return { ok: true };
}

/** يُختم أول تحميل للدعوات — به تكتمل الخطوة الأخيرة */
export async function markInvitationsDownloaded(eventId: string): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { data: event } = await supabase
    .from('events')
    .select('invitations_downloaded_at')
    .eq('id', eventId)
    .maybeSingle();

  // الختم للمرة الأولى فقط: تاريخ أول توزيع أنفع من تاريخ آخر تحميل
  if (event?.invitations_downloaded_at) return { ok: true };

  await supabase
    .from('events')
    .update({ invitations_downloaded_at: new Date().toISOString() })
    .eq('id', eventId);

  revalidatePath(`/dashboard/events/${eventId}`);
  return { ok: true };
}
