'use server';

import { revalidatePath } from 'next/cache';
import bcrypt from 'bcryptjs';

import { createClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/auth/session';
import type { ActionResult } from '@/lib/actions/events';

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

export interface ScannerActionResult extends ActionResult {
  username?: string;
}

/**
 * ينشئ حساب مسؤول استقبال مرتبط بمناسبة واحدة.
 * اسم المستخدم فريد على مستوى المنصة كلها لأن شاشة الدخول واحدة.
 */
export async function createScannerAccount(
  eventId: string,
  displayName: string,
  username: string,
  password: string,
): Promise<ScannerActionResult> {
  await requireUser();
  const supabase = await createClient();

  const name = displayName.trim();
  const user = username.trim().toLowerCase();

  if (!name) return { ok: false, error: 'اسم المسؤول مطلوب.' };
  if (!USERNAME_RE.test(user)) {
    return {
      ok: false,
      error: 'اسم المستخدم: ٣-٣٢ حرفاً إنجليزياً صغيراً أو أرقاماً أو . _ - فقط.',
    };
  }
  if (password.length < 6) return { ok: false, error: 'كلمة المرور ٦ أحرف على الأقل.' };

  // نتحقق من ملكية المناسبة صراحةً قبل أي كتابة
  const { data: event } = await supabase.from('events').select('id').eq('id', eventId).single();
  if (!event) return { ok: false, error: 'المناسبة غير موجودة.' };

  const password_hash = await bcrypt.hash(password, 10);

  const { error } = await supabase.from('scanner_accounts').insert({
    event_id: eventId,
    username: user,
    display_name: name,
    password_hash,
  });

  if (error) {
    return {
      ok: false,
      error:
        error.code === '23505'
          ? 'اسم المستخدم محجوز. اختر اسماً آخر (مثلاً: بإضافة اسم المناسبة).'
          : 'تعذّر إنشاء حساب المسح.',
    };
  }

  revalidatePath(`/dashboard/events/${eventId}/scanners`);
  return { ok: true, username: user };
}

export async function updateScannerPassword(
  scannerId: string,
  eventId: string,
  password: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  if (password.length < 6) return { ok: false, error: 'كلمة المرور ٦ أحرف على الأقل.' };

  const password_hash = await bcrypt.hash(password, 10);
  const { error } = await supabase
    .from('scanner_accounts')
    .update({ password_hash })
    .eq('id', scannerId)
    .eq('event_id', eventId);

  if (error) return { ok: false, error: 'تعذّر تغيير كلمة المرور.' };

  revalidatePath(`/dashboard/events/${eventId}/scanners`);
  return { ok: true };
}

export async function toggleScannerActive(
  scannerId: string,
  eventId: string,
  isActive: boolean,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from('scanner_accounts')
    .update({ is_active: isActive })
    .eq('id', scannerId)
    .eq('event_id', eventId);

  if (error) return { ok: false, error: 'تعذّر تغيير حالة الحساب.' };

  revalidatePath(`/dashboard/events/${eventId}/scanners`);
  return { ok: true };
}

export async function deleteScannerAccount(
  scannerId: string,
  eventId: string,
): Promise<ActionResult> {
  await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from('scanner_accounts')
    .delete()
    .eq('id', scannerId)
    .eq('event_id', eventId);

  if (error) return { ok: false, error: 'تعذّر حذف الحساب.' };

  revalidatePath(`/dashboard/events/${eventId}/scanners`);
  return { ok: true };
}
