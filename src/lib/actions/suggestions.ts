'use server';

import { revalidatePath } from 'next/cache';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { describeDbError } from '@/lib/db-errors';
import { getSessionUser, requireAdmin } from '@/lib/auth/session';
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
  // مفتوحة للزائر: أنفع الملاحظات تأتي ممن جرّب الموقع ولم يُكمل التسجيل
  const session = await getSessionUser();

  const category = String(formData.get('category') ?? 'other');
  const message = String(formData.get('message') ?? '').trim();

  if (!SUGGESTION_CATEGORY_VALUES.has(category)) return { ok: false, error: 'التصنيف غير صالح.' };
  if (message.length < 10) {
    return { ok: false, error: 'اكتب اقتراحك بتفصيل أكثر — ١٠ أحرف على الأقل.' };
  }
  if (message.length > 4000) {
    return { ok: false, error: 'الاقتراح طويل جداً. اختصره في ٤٠٠٠ حرف.' };
  }

  // المسجّل تُؤخذ بياناته من ملفه؛ والزائر يكتبها بنفسه
  let name: string | null = null;
  let email: string | null = null;
  let phone: string | null = null;

  if (session) {
    const supabaseUser = await createClient();
    const { data: profile } = await supabaseUser
      .from('profiles')
      .select('full_name, email, phone')
      .eq('id', session.id)
      .maybeSingle();

    name = profile?.full_name ?? null;
    email = profile?.email ?? session.email ?? null;
    phone = profile?.phone ?? null;
  } else {
    name = String(formData.get('name') ?? '').trim() || null;
    email = String(formData.get('email') ?? '').trim() || null;
    phone = String(formData.get('phone') ?? '').trim() || null;

    if (!name) return { ok: false, error: 'اكتب اسمك حتى نعرف من نرد عليه.' };
    if (!email && !phone) {
      return { ok: false, error: 'اكتب بريدك أو جوالك حتى نقدر نرد عليك.' };
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'صيغة البريد غير صحيحة.' };
    }
  }

  // مفتاح الخدمة: الزائر بلا جلسة لا تسمح له سياسات القراءة بشيء، ونريد
  // خطأ قاعدة البيانات الحقيقي لا رفضاً صامتاً من RLS
  const supabase = createServiceClient();

  const { error } = await supabase.from('suggestions').insert({
    user_id: session?.id ?? null,
    name,
    email,
    phone,
    category,
    message,
  });

  if (error) {
    // نُظهر السبب الفعلي مترجماً: الرسالة العامة أخفت الخلل مرة وأضاعت
    // جلسة كاملة، ونصّ Postgres الخام لا يفيد من يقرأه
    return { ok: false, error: describeDbError(error, 'تعذّر إرسال الاقتراح.') };
  }

  // إشعار الدعم — لا نُفشل الإرسال لو تعذّر البريد، فالاقتراح محفوظ أصلاً
  const settings = await getSettings();
  const supportEmail = typeof settings.support_email === 'string' ? settings.support_email : '';

  if (supportEmail) {
    const label = SUGGESTION_CATEGORIES.find((c) => c.value === category)?.label ?? category;

    await sendEmail({
      to: supportEmail,
      subject: `اقتراح جديد — ${label}`,
      html: emailShell(
        `اقتراح جديد: ${label}`,
        `<p style="line-height:1.9;margin:0 0 12px">
           <strong>من:</strong> ${escapeHtml(name ?? 'بلا اسم')}<br>
           <strong>البريد:</strong> ${escapeHtml(email ?? '—')}<br>
           <strong>الجوال:</strong> ${escapeHtml(phone ?? '—')}<br>
           <strong>الحالة:</strong> ${session ? 'مستخدم مسجّل' : 'زائر'}
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
