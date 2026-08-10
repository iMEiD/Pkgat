import { createClient } from '@/lib/supabase/server';
import { getFreeQuota, getSettings } from '@/lib/cms';
import type { EventRow } from '@/lib/types/database';

/**
 * حدّ المدعوين — مصدر واحد للحقيقة في التطبيق.
 *
 * كان محسوباً في موضعين (getGuestLimit للعرض و effectiveGuestLimit
 * للمنع)، وهو نفس نوع الازدواج الذي جعل الواجهة تسمح بما تُبطله قاعدة
 * البيانات. الترتيب هنا مطابق لـ guest_over_limit في SQL حرفياً:
 *
 *   مناسبة تجريبية   ⇒ بلا حد
 *   اشتراك فعّال      ⇒ بلا حد
 *   مناسبة مدفوعة     ⇒ حدّ الباقة (null = بلا حد)
 *   غير ذلك          ⇒ الحصة المجانية، على الحساب كله أو على المناسبة
 *                       حسب إعداد free_quota_scope
 */
export type QuotaReason = 'demo' | 'subscription' | 'paid_plan' | 'free';

export interface EventQuota {
  /** أقصى عدد مدعوين لهذه المناسبة — null يعني بلا حد */
  limit: number | null;
  /** سبب هذا الحد، لصياغة رسالة مفهومة */
  reason: QuotaReason;
  /** الحصة المجانية الكاملة للحساب */
  freeAllowance: number;
  /** ما استُهلك منها في مناسبات أخرى غير مدفوعة (في نطاق الحساب فقط) */
  usedElsewhere: number;
  accountScope: boolean;
}

export async function getEventQuota(
  event: Pick<EventRow, 'id' | 'is_paid' | 'plan_id' | 'free_quota' | 'is_demo'>,
  userId: string,
): Promise<EventQuota> {
  const supabase = await createClient();
  const [settings, freeQuota] = await Promise.all([getSettings(), getFreeQuota()]);

  const accountScope =
    (typeof settings.free_quota_scope === 'string' ? settings.free_quota_scope : 'per_account') ===
    'per_account';

  const base: Omit<EventQuota, 'limit' | 'reason'> = {
    freeAllowance: event.free_quota ?? freeQuota,
    usedElsewhere: 0,
    accountScope,
  };

  // التجريبية للتعرّف على المنصة — لا تُحاسَب ولا تَستهلك
  if (event.is_demo) return { ...base, limit: null, reason: 'demo' };

  const { data: subs } = await supabase
    .from('subscriptions')
    .select('current_period_end')
    .eq('user_id', userId)
    .eq('status', 'active');

  const hasActiveSub = (subs ?? []).some(
    (s) => !s.current_period_end || new Date(s.current_period_end) > new Date(),
  );
  if (hasActiveSub) return { ...base, limit: null, reason: 'subscription' };

  if (event.is_paid) {
    if (!event.plan_id) return { ...base, limit: null, reason: 'paid_plan' };
    const { data: plan } = await supabase
      .from('plans')
      .select('guests_limit')
      .eq('id', event.plan_id)
      .maybeSingle();
    return { ...base, limit: plan?.guests_limit ?? null, reason: 'paid_plan' };
  }

  if (!accountScope) {
    return { ...base, limit: base.freeAllowance, reason: 'free' };
  }

  // نطاق الحساب: ما استُهلك في بقية المناسبات غير المدفوعة يخصم من الحد
  const { data: others } = await supabase
    .from('events')
    .select('id')
    .eq('owner_id', userId)
    .eq('is_paid', false)
    .eq('is_demo', false)
    .neq('id', event.id);

  const otherIds = (others ?? []).map((e) => e.id);
  let usedElsewhere = 0;

  if (otherIds.length > 0) {
    const { count } = await supabase
      .from('guests')
      .select('id', { count: 'exact', head: true })
      .in('event_id', otherIds);
    usedElsewhere = count ?? 0;
  }

  return {
    ...base,
    usedElsewhere,
    limit: Math.max(0, base.freeAllowance - usedElsewhere),
    reason: 'free',
  };
}

/** رسالة عربية تشرح الحد ولماذا */
export function quotaMessage(quota: EventQuota, current: number): string {
  const remaining = quota.limit === null ? null : Math.max(0, quota.limit - current);

  if (quota.reason === 'paid_plan') {
    return `باقة هذه المناسبة تسمح بـ ${quota.limit} مدعو. تبقّى لك ${remaining}.`;
  }

  if (quota.accountScope) {
    return (
      `الحصة المجانية ${quota.freeAllowance} مدعو للحساب كله` +
      (quota.usedElsewhere > 0 ? `، استهلكت منها ${quota.usedElsewhere} في مناسبات أخرى` : '') +
      `. تبقّى لك ${remaining}. اشترك لإضافة المزيد.`
    );
  }

  return `الحد المجاني ${quota.limit} مدعو لكل مناسبة. تبقّى لك ${remaining}. فعّل الباقة لإضافة المزيد.`;
}
