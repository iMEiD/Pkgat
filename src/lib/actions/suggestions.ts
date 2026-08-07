'use server';

import { revalidatePath } from 'next/cache';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireAdmin, requireUser } from '@/lib/auth/session';
import { emailShell, sendEmail } from '@/lib/email';
import { getSettings } from '@/lib/cms';
import type { ActionResult } from '@/lib/actions/events';
import { SUGGESTION_CATEGORIES, SUGGESTION_CATEGORY_VALUES } from '@/lib/suggestions-meta';


/**
 * إرسال اقتراح.
 *
 * بيانات التواصل تُنسخ من الملف وقت الإرسال ولا تُترك مرجعاً حيّاً: لو
 * غيّر صاحبها بريده أو حذف حسابه لاحقاً، يبقى الاقتراح مفهوماً وقابلاً
 * للرد عليه.
 */
export async function submitSuggestion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUser();

  const category = String(formData.get('category') ?? 'other');
  const message = String(formData.get('message') ?? '').trim();

  if (!SUGGESTION_CATEGORY_VALUES.has(category)) return { ok: false, error: 'التصنيف غير صالح.' };
  if (message.length < 10) {
    return { ok: false, error: 'اكتب اقتراحك بتفصيل أكثر — ١٠ أحرف على الأقل.' };
  }
  if (message.length > 4000) {
    return { ok: false, error: 'الاقتراح طويل جداً. اختصره في ٤٠٠٠ حرف.' };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, phone')
    .eq('id', session.id)
    .maybeSingle();

  const { error } = await supabase.from('suggestions').insert({
    user_id: session.id,
    name: profile?.full_name ?? null,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    category,
    message,
  });

  if (error) return { ok: false, error: 'تعذّر إرسال الاقتراح. حاول مرة أخرى.' };

  // إشعار الدعم — لا نُفشل الإرسال لو تعذّر البريد، فالاقتراح محفوظ أصلاً
  const settings = await getSettings();
  const supportEmail = typeof settings.support_email === 'string' ? settings.support_email : '';

  if (supportEmail) {
    const label =
      SUGGESTION_CATEGORIES.find((c) => c.value === category)?.label ?? category;

    await sendEmail({
      to: supportEmail,
      subject: `اقتراح جديد — ${label}`,
      html: emailShell(
        `اقتراح جديد: ${label}`,
        `<p style="line-height:1.9;margin:0 0 12px">
           <strong>من:</strong> ${escapeHtml(profile?.full_name ?? 'بلا اسم')}<br>
           <strong>البريد:</strong> ${escapeHtml(profile?.email ?? '—')}<br>
           <strong>الجوال:</strong> ${escapeHtml(profile?.phone ?? '—')}
         </p>
         <div style="background:#F5F1EA;border-radius:12px;padding:14px;line-height:1.9;
                     white-space:pre-wrap">${escapeHtml(message)}</div>`,
      ),
    });
  }

  return { ok: true };
}

/** يمنع محتوى المستخدم من كسر قالب البريد أو حقن وسوم */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function setSuggestionStatus(
  id: string,
  status: 'new' | 'reviewed' | 'done' | 'dismissed',
): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('suggestions').update({ status }).eq('id', id);
  if (error) return { ok: false, error: 'تعذّر تحديث الحالة.' };

  revalidatePath('/admin/suggestions');
  return { ok: true };
}

export async function deleteSuggestion(id: string): Promise<ActionResult> {
  await requireAdmin();
  const supabase = createServiceClient();

  const { error } = await supabase.from('suggestions').delete().eq('id', id);
  if (error) return { ok: false, error: 'تعذّر الحذف.' };

  revalidatePath('/admin/suggestions');
  return { ok: true };
}
