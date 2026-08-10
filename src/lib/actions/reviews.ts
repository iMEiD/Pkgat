'use server';

import { revalidatePath } from 'next/cache';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { describeDbError } from '@/lib/db-errors';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { emailShell, sendEmail } from '@/lib/email';
import { getSettings } from '@/lib/cms';
import { logAdminAction } from '@/lib/audit';
import type { ActionResult } from '@/lib/actions/events';
import type { Review, ReviewStatus } from '@/lib/types/database';

const MIN_BODY = 10;
const MAX_BODY = 1000;

function cleanRating(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function validateBody(body: string): string | null {
  if (body.length < MIN_BODY) return 'اكتب رأيك بتفصيل أكثر — ١٠ أحرف على الأقل.';
  if (body.length > MAX_BODY) return 'التقييم طويل. اختصره في ١٠٠٠ حرف.';
  return null;
}

/**
 * إرسال تقييم العميل.
 *
 * لا ينشر شيئاً: يصل صاحب المنصة بحالة «بانتظار المراجعة» ولا يظهر
 * للزوار قبل موافقته. وحارس قاعدة البيانات يفرض هذا بنفسه، فحتى لو
 * التفّ أحد على هذا المسار لا يستطيع نشر نفسه.
 *
 * والتقييم واحد لكل حساب: إعادة الإرسال تحديثٌ للرأي لا رأيٌ ثانٍ.
 */
export async function submitReview(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUser();

  const rating = cleanRating(formData.get('rating'));
  const body = String(formData.get('body') ?? '').trim();
  const title = String(formData.get('author_title') ?? '').trim();

  if (rating === null) return { ok: false, error: 'اختر تقييمك من نجمة إلى خمس.' };

  const bodyError = validateBody(body);
  if (bodyError) return { ok: false, error: bodyError };
  if (title.length > 60) return { ok: false, error: 'الصفة طويلة. اختصرها في ٦٠ حرفاً.' };

  const supabase = await createClient();

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', session.id)
    .maybeSingle();

  const authorName = (profile?.full_name ?? '').trim() || 'عميل بكجات';

  // مفتاح الخدمة: نريد خطأ قاعدة البيانات الحقيقي لا رفضاً صامتاً من RLS
  const service = createServiceClient();

  const { data: existing } = await service
    .from('reviews')
    .select('id')
    .eq('user_id', session.id)
    .maybeSingle();

  const payload = {
    author_name: authorName,
    author_title: title || null,
    rating,
    body,
    // المراجعة تبدأ من جديد مع كل رأي جديد — ولو كان السابق منشوراً
    status: 'pending' as ReviewStatus,
    published_at: null,
    updated_at: new Date().toISOString(),
  };

  const { error } = existing
    ? await service.from('reviews').update(payload).eq('id', existing.id)
    : await service.from('reviews').insert({ ...payload, user_id: session.id, source: 'customer' });

  if (error) return { ok: false, error: describeDbError(error, 'تعذّر إرسال التقييم.') };

  await notifyAdmin(authorName, rating, body, Boolean(existing));

  revalidatePath('/dashboard');
  return { ok: true };
}

/** إشعار صاحب المنصة — لا نُفشل الإرسال لو تعذّر البريد، فالتقييم محفوظ */
async function notifyAdmin(name: string, rating: number, body: string, updated: boolean) {
  const settings = await getSettings();
  const supportEmail = typeof settings.support_email === 'string' ? settings.support_email : '';
  if (!supportEmail) return;

  await sendEmail({
    to: supportEmail,
    subject: `${updated ? 'تحديث تقييم' : 'تقييم جديد'} — ${rating}/5`,
    html: emailShell(
      `${updated ? 'عميل حدّث تقييمه' : 'تقييم جديد بانتظار مراجعتك'}`,
      `<p style="line-height:1.9;margin:0 0 12px">
         <strong>من:</strong> ${escapeHtml(name)}<br>
         <strong>التقييم:</strong> ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}
       </p>
       <div style="background:#F5F1EA;border-radius:12px;padding:14px;line-height:1.9;
                   white-space:pre-wrap">${escapeHtml(body)}</div>
       <p style="line-height:1.9;margin:14px 0 0;font-size:13px;color:#6B6472">
         لن يظهر للزوار قبل موافقتك عليه من لوحة الأدمن ← التقييمات.
       </p>`,
    ),
  });
}

/** يمنع محتوى المستخدم من كسر قالب البريد أو حقن وسوم */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===================== إجراءات الأدمن =====================

/** نشر التقييم للزوار أو إخفاؤه أو إعادته للمراجعة */
export async function setReviewStatus(id: string, status: ReviewStatus): Promise<ActionResult> {
  await requireAdmin();

  if (!['pending', 'published', 'hidden'].includes(status)) {
    return { ok: false, error: 'حالة غير صالحة.' };
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from('reviews')
    .update({
      status,
      // وقت النشر يُثبَّت عند النشر ويُمحى عند سحبه — وعليه يقوم ترتيب العرض
      published_at: status === 'published' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) return { ok: false, error: 'تعذّر تغيير حالة التقييم.' };

  await logAdminAction(`review.${status}`, 'reviews', id);
  revalidateReviews();
  return { ok: true };
}

/**
 * تقييم يضيفه صاحب المنصة بنفسه.
 *
 * لأعمال نُفِّذت فعلاً وأذن أصحابها بعرض رأيهم — مكالمة أو رسالة واتساب
 * لا تمرّ بنموذج الموقع. ولهذا يُنشر مباشرة: صاحب المنصة هو المراجِع.
 */
export async function adminCreateReview(input: {
  authorName: string;
  authorTitle: string;
  rating: number;
  body: string;
  publish: boolean;
}): Promise<ActionResult> {
  await requireAdmin();

  const authorName = input.authorName.trim();
  const authorTitle = input.authorTitle.trim();
  const body = input.body.trim();
  const rating = cleanRating(input.rating);

  if (!authorName) return { ok: false, error: 'اسم صاحب الرأي مطلوب.' };
  if (authorName.length > 80) return { ok: false, error: 'الاسم طويل. اختصره في ٨٠ حرفاً.' };
  if (authorTitle.length > 60) return { ok: false, error: 'الصفة طويلة. اختصرها في ٦٠ حرفاً.' };
  if (rating === null) return { ok: false, error: 'اختر تقييماً من نجمة إلى خمس.' };

  const bodyError = validateBody(body);
  if (bodyError) return { ok: false, error: bodyError };

  const supabase = createServiceClient();

  const { error } = await supabase.from('reviews').insert({
    user_id: null,
    author_name: authorName,
    author_title: authorTitle || null,
    rating,
    body,
    source: 'admin',
    status: input.publish ? 'published' : 'pending',
    published_at: input.publish ? new Date().toISOString() : null,
  });

  if (error) return { ok: false, error: describeDbError(error, 'تعذّرت إضافة التقييم.') };

  await logAdminAction('review.created', 'reviews', null, { author: authorName });
  revalidateReviews();
  return { ok: true };
}

/** تعديل نص التقييم أو اسمه أو ترتيبه — بلا مساس بحالته */
export async function adminUpdateReview(
  id: string,
  patch: { authorName?: string; authorTitle?: string; rating?: number; body?: string; sortOrder?: number },
): Promise<ActionResult> {
  await requireAdmin();

  const update: Partial<Review> = { updated_at: new Date().toISOString() };

  if (patch.authorName !== undefined) {
    const name = patch.authorName.trim();
    if (!name) return { ok: false, error: 'اسم صاحب الرأي مطلوب.' };
    update.author_name = name;
  }
  if (patch.authorTitle !== undefined) update.author_title = patch.authorTitle.trim() || null;
  if (patch.rating !== undefined) {
    const rating = cleanRating(patch.rating);
    if (rating === null) return { ok: false, error: 'تقييم غير صالح.' };
    update.rating = rating;
  }
  if (patch.body !== undefined) {
    const body = patch.body.trim();
    const bodyError = validateBody(body);
    if (bodyError) return { ok: false, error: bodyError };
    update.body = body;
  }
  if (patch.sortOrder !== undefined) {
    if (!Number.isInteger(patch.sortOrder)) return { ok: false, error: 'الترتيب لازم يكون رقماً.' };
    update.sort_order = Math.max(-999, Math.min(999, patch.sortOrder));
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from('reviews').update(update).eq('id', id);
  if (error) return { ok: false, error: 'تعذّر حفظ التعديل.' };

  await logAdminAction('review.updated', 'reviews', id);
  revalidateReviews();
  return { ok: true };
}

export async function deleteReview(id: string): Promise<ActionResult> {
  await requireAdmin();

  const supabase = createServiceClient();
  const { error } = await supabase.from('reviews').delete().eq('id', id);
  if (error) return { ok: false, error: 'تعذّر الحذف.' };

  await logAdminAction('review.deleted', 'reviews', id);
  revalidateReviews();
  return { ok: true };
}

function revalidateReviews() {
  revalidatePath('/admin/reviews');
  revalidatePath('/');
}
