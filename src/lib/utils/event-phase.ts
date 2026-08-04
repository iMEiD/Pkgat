import type { EventRow } from '@/lib/types/database';

export type EventPhase = 'upcoming' | 'active' | 'ended';

/**
 * مرحلة المناسبة كما يحسبها الخادم في SQL (guest_code_state).
 * تُستخدم للعرض فقط — القرار النهائي في المسح يبقى على قاعدة البيانات.
 */
export function computeEventPhase(event: EventRow): EventPhase {
  const now = Date.now();
  const activation = new Date(event.starts_at).getTime() - event.activation_lead_minutes * 60_000;

  const rawEnd = event.ended_manually_at
    ? new Date(event.ended_manually_at).getTime()
    : event.ends_at
      ? new Date(event.ends_at).getTime()
      : new Date(event.starts_at).getTime() + 6 * 3_600_000;

  const expiry = rawEnd + event.expiry_grace_minutes * 60_000;

  if (event.status === 'ended' || event.status === 'archived' || now > expiry) return 'ended';
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

/** متى تتفعّل الباركودات فعلياً */
export function activationMoment(event: EventRow): Date {
  return new Date(new Date(event.starts_at).getTime() - event.activation_lead_minutes * 60_000);
}

/** متى تنتهي صلاحية الباركودات */
export function expiryMoment(event: EventRow): Date {
  const rawEnd = event.ended_manually_at
    ? new Date(event.ended_manually_at).getTime()
    : event.ends_at
      ? new Date(event.ends_at).getTime()
      : new Date(event.starts_at).getTime() + 6 * 3_600_000;
  return new Date(rawEnd + event.expiry_grace_minutes * 60_000);
}
