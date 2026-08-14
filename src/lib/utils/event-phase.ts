import type { EventRow } from '@/lib/types/database';

export type EventPhase = 'upcoming' | 'active' | 'ended';

/**
 * مرحلة المناسبة كما يحسبها الخادم في SQL (guest_code_state).
 * تُستخدم للعرض فقط — القرار النهائي في المسح يبقى على قاعدة البيانات.
 */
export function computeEventPhase(event: EventRow): EventPhase {
  // إيقاف يدوي صريح
  if (event.activation_override === 'closed') return 'ended';

  /*
   * الإنهاء الصريح يسبق التفعيل اليدوي — مطابق لترتيب guest_code_state
   * بعد الترحيل 0026. من فعّل الباركودات يدوياً ثم أنهى مناسبته كانت
   * اللوحة تقول له «الباركودات مفعّلة» وهو أنهاها بنفسه.
   */
  if (event.status === 'ended' || event.status === 'archived') return 'ended';
  if (event.ended_manually_at) return 'ended';

  // التفعيل اليدوي يتجاوز التوقيت وحده
  if (event.activation_override === 'open') return 'active';

  const now = Date.now();
  const activation = new Date(event.starts_at).getTime() - event.activation_lead_minutes * 60_000;

  const rawEnd = event.ended_manually_at
    ? new Date(event.ended_manually_at).getTime()
    : event.ends_at
      ? new Date(event.ends_at).getTime()
      : new Date(event.starts_at).getTime() + 6 * 3_600_000;

  const expiry = rawEnd + event.expiry_grace_minutes * 60_000;

  // الحالة والإنهاء اليدوي فُحصا أعلاه — يبقى انقضاء الوقت وحده
  if (now > expiry) return 'ended';
  if (now >= activation) return 'active';
  return 'upcoming';
}

export const PHASE_LABELS: Record<EventPhase, string> = {
  upcoming: 'قادمة',
  active: 'الباركودات مفعّلة',
  ended: 'منتهية',
};

export const PHASE_TONES: Record<EventPhase, string> = {
  upcoming: 'sky',
  active: 'mint',
  ended: 'sand',
};

/**
 * النهاية الاسمية للمناسبة — قبل مهلة التسامح.
 * مهلة التسامح تمدّد صلاحية الباركود، لكنها لا تجعل الوصول «في الوقت».
 */
export function nominalEnd(event: EventRow): Date {
  if (event.ended_manually_at) return new Date(event.ended_manually_at);
  return event.ends_at
    ? new Date(event.ends_at)
    : new Date(new Date(event.starts_at).getTime() + 6 * 3_600_000);
}

/**
 * هل دخل هذا المدعو بعد نهاية المناسبة؟
 *
 * محسوبة عند العرض لا مخزّنة، ولا تمسّ مسار المسح إطلاقاً: الباركود
 * يُقبل كما هو داخل مهلة التسامح، وهذا مجرد تمييز في التقرير بين من
 * حضر في وقته ومن جاء متأخراً — معلومة يحتاجها صاحب المناسبة عند
 * ضبط مهلة التسامح للمرة القادمة.
 */
export function isLateArrival(event: EventRow, checkedInAt: string | null): boolean {
  if (!checkedInAt) return false;
  return new Date(checkedInAt).getTime() > nominalEnd(event).getTime();
}

/** متى تتفعّل الباركودات فعلياً */
export function activationMoment(event: EventRow): Date {
  return new Date(new Date(event.starts_at).getTime() - event.activation_lead_minutes * 60_000);
}

/**
 * متى تنتهي صلاحية الباركودات.
 *
 * الإنهاء اليدوي يوقف المسح في لحظته بلا مهلة — المهلة معناها التسامح مع
 * المدعوين المتأخرين عن النهاية التلقائية، لا تمديد إنهاء صريح.
 */
export function expiryMoment(event: EventRow): Date {
  if (event.ended_manually_at) return new Date(event.ended_manually_at);

  const rawEnd = event.ends_at
    ? new Date(event.ends_at).getTime()
    : new Date(event.starts_at).getTime() + 6 * 3_600_000;

  return new Date(rawEnd + event.expiry_grace_minutes * 60_000);
}
