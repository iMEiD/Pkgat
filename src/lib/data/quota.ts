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
 *
 * والمستهلك من الحصة يُقرأ من دفتر الحساب (profiles.free_guests_used)
 * لا بعدّ المدعوين الموجودين — لأن العدّ يرجع صفراً بحذف المناسبة
 * فترجع الحصة كاملة، وهي الثغرة التي سدّها الترحيل 0021.
 */
export type QuotaReason = 'demo' | 'subscription' | 'paid_plan' | 'free';

export interface EventQuota {
  /** أقصى عدد مدعوين لهذه المناسبة — null يعني بلا حد */
  limit: number | null;
  /** سبب هذا الحد، لصياغة رسالة مفهومة */
  reason: QuotaReason;
  /** الحصة المجانية الكاملة للحساب */
  freeAllowance: number;
  /** ما استُهلك من الدفتر خارج هذه المناسبة — بما فيه مناسبات محذوفة */
  usedElsewhere: number;
  /** ما بقي للحساب كله من الحصة المجانية */
  remaining: number;
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
    remaining: event.free_quota ?? freeQuota,
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

  /*
   * نطاق الحساب. الحد المعروض لهذه المناسبة = الحصة ناقص ما استُهلك
   * خارجها، ليبقى الكسر «٣ من ١٠» مفهوماً في الواجهة.
   *
   * والمستهلك خارجها = دفتر الحساب ناقص ما تحمله هي من الدفتر. فلو حُذفت
   * مناسبة أخرى بقي استهلاكها في الدفتر ونقص الحد هنا — وهو المقصود.
   */
  const [{ data: profile }, { count: stampedHere }] = await Promise.all([
    supabase.from('profiles').select('free_guests_used').eq('id', userId).maybeSingle(),
    supabase
      .from('guests')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .not('free_seq', 'is', null),
  ]);

  const usedAccount = profile?.free_guests_used ?? 0;
  const usedElsewhere = Math.max(0, usedAccount - (stampedHere ?? 0));

  return {
    ...base,
    usedElsewhere,
    remaining: Math.max(0, base.freeAllowance - usedAccount),
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
    if (quota.remaining === 0) {
      return (
        `خلصت تجربتك المجانية — ${quota.freeAllowance} دعوة للحساب كله، ` +
        'وهي تُحسب مرة واحدة ولا ترجع بحذف المناسبات. اشترك عشان تكمّل.'
      );
    }

    return (
      `الحصة المجانية ${quota.freeAllowance} دعوة للحساب كله` +
      (quota.usedElsewhere > 0 ? `، استهلكت منها ${quota.usedElsewhere} سابقاً` : '') +
      `. تبقّى لك ${quota.remaining}. اشترك لإضافة المزيد.`
    );
  }

  return `الحد المجاني ${quota.limit} مدعو لكل مناسبة. تبقّى لك ${remaining}. فعّل الباقة لإضافة المزيد.`;
}
