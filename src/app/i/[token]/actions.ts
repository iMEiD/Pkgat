'use server';

import { respondToInvite } from '@/lib/data/invite';
import type { RsvpStatus } from '@/lib/types/database';

export interface RespondState {
  ok: boolean;
  status?: RsvpStatus;
  code?: string | null;
  error?: string;
}

/**
 * رسائل الخطأ بالعربية هنا لا في القاعدة: القاعدة تُعيد سبباً واحداً
 * قصيراً، والصياغة شأن الواجهة — ولأن هذه الصفحة يفتحها من ليس عميلاً
 * ولا يعرف المنصة، فأي نصٍّ إنجليزيٍّ يظهر له يبدو عطلاً لا رسالة.
 */
const MESSAGES: Record<string, string> = {
  not_found: 'الرابط غير صحيح أو انتهت صلاحيته.',
  closed: 'باب الرد على هذه الدعوة مقفل حالياً.',
  already_attended: 'سُجّل دخولك للمناسبة فعلاً، ولا يمكن تغيير الرد بعدها.',
  bad_status: 'رد غير مفهوم.',
  error: 'صار خلل مؤقت. جرّب مرة ثانية.',
};

export async function respondAction(
  token: string,
  status: 'confirmed' | 'declined',
  note: string | null,
): Promise<RespondState> {
  const result = await respondToInvite(token, status, note);

  if (!result.ok) {
    return { ok: false, error: MESSAGES[result.reason] ?? MESSAGES.error };
  }

  return { ok: true, status: result.status, code: result.code };
}
