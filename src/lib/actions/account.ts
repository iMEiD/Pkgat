'use server';

import { revalidatePath } from 'next/cache';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/actions/events';

export async function updateProfile(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requireUser();
  const supabase = await createClient();

  const fullName = String(formData.get('full_name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!fullName) return { ok: false, error: 'الاسم مطلوب.' };

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName, phone: phone || null, updated_at: new Date().toISOString() })
    .eq('id', session.id);

  if (error) return { ok: false, error: 'تعذّر حفظ البيانات.' };

  revalidatePath('/dashboard/settings');
  return { ok: true };
}

export async function changePassword(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const password = String(formData.get('password') ?? '');
  const confirm = String(formData.get('confirm') ?? '');

  if (password.length < 8) return { ok: false, error: 'كلمة المرور ٨ أحرف على الأقل.' };
  if (password !== confirm) return { ok: false, error: 'كلمتا المرور غير متطابقتين.' };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: 'تعذّر تغيير كلمة المرور.' };

  return { ok: true };
}

/**
 * حذف الحساب نهائياً بناءً على طلب صاحبه.
 *
 * سياسة الخصوصية تَعِد بحق الحذف، فلا بد أن يكون الحذف فعلياً لا تعطيلاً.
 * حذف المستخدم من auth.users يجرّ خلفه — عبر on delete cascade — الملف
 * والمناسبات والمدعوين وسجل المسح وحسابات المسؤولين والاشتراكات.
 * التصاميم المرفوعة لا تتبع المفاتيح الأجنبية فنحذف مجلد المستخدم يدوياً،
 * قبل حذف الحساب لأن بعده لن نعرف ما الذي كان يملكه.
 */
export async function deleteMyAccount(confirmation: string): Promise<ActionResult> {
  const session = await requireUser();

  if (confirmation.trim() !== 'حذف') {
    return { ok: false, error: 'اكتب كلمة «حذف» للتأكيد.' };
  }

  const supabase = createServiceClient();

  // الأدمن الوحيد لو حذف حسابه ضاعت إدارة المنصة بلا رجعة
  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', session.id)
    .maybeSingle();

  if (profile?.is_super_admin) {
    return {
      ok: false,
      error: 'حساب الأدمن ما ينحذف من هنا — انقل الصلاحية لحساب آخر أولاً.',
    };
  }

  const { data: files } = await supabase.storage.from('designs').list(session.id, { limit: 1000 });
  if (files?.length) {
    await supabase.storage
      .from('designs')
      .remove(files.map((f) => `${session.id}/${f.name}`));
  }

  const { error } = await supabase.auth.admin.deleteUser(session.id);
  if (error) return { ok: false, error: 'تعذّر حذف الحساب. تواصل مع الدعم.' };

  return { ok: true };
}
