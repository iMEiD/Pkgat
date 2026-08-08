'use server';

import { createServiceClient } from '@/lib/supabase/server';

/**
 * هل رقم الجوال مستخدم في حساب آخر؟
 *
 * الحارس الحقيقي فهرس تفرّد في قاعدة البيانات، لكن انتهاكه يقع داخل
 * مُشغّل إنشاء الملف فيُرجع Supabase «Database error saving new user» —
 * رسالة لا تدل المستخدم على شيء. فنفحص قبل التسجيل لنعطيه سبباً مفهوماً.
 */
export async function isPhoneTaken(phone: string): Promise<boolean> {
  const clean = phone.replace(/\D/g, '');
  if (!clean) return false;

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .eq('phone', clean)
      .limit(1);

    if (error) return false; // لا نمنع التسجيل بسبب عطل في الفحص
    return (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
