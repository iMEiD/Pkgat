'use server';

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
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
