import { createClient } from '@/lib/supabase/server';
import { getFreeQuota } from '@/lib/cms';
import type { BillingPeriod } from '@/lib/types/database';

/**
 * حالة اشتراك المستخدم كما تظهر له في لوحته.
 *
 * ترتيب الأولويات هنا هو نفسه في guest_over_limit داخل SQL وفي
 * getGuestLimit في التطبيق — اشتراك فعّال يرفع الحد أولاً، ثم باقة
 * المناسبة المدفوعة، ثم الحصة المجانية. اختلاف هذه المصادر هو ما جعل
 * الواجهة تسمح بإضافة مدعوين بينما تُبطل قاعدة البيانات باركوداتهم،
 * فلا يُحسب الحدّ هنا حساباً موازياً.
 */
export interface PlanStatus {
  /** مشترك باشتراك فعّال، أم على الحصة المجانية */
  subscribed: boolean;
  planName: string | null;
  billingPeriod: BillingPeriod | null;
  /** نهاية الفترة الحالية — null يعني اشتراكاً بلا نهاية محددة */
  periodEnd: string | null;
  /** أيام متبقية على التجديد، أو null إن لم تكن هناك نهاية */
  daysLeft: number | null;
  /** أوشك على الانتهاء — أقل من أسبوع */
  expiringSoon: boolean;
  /** الحصة المجانية للحساب */
  freeQuota: number;
  /** عدد المناسبات التي دُفع لها منفردة */
  paidEvents: number;
}

const DAY = 24 * 60 * 60 * 1000;

export async function getPlanStatus(userId: string): Promise<PlanStatus> {
  const supabase = await createClient();

  const [{ data: subs }, { data: paid }, freeQuota] = await Promise.all([
    supabase
      .from('subscriptions')
      .select('current_period_end, plans(name, billing_period)')
      .eq('user_id', userId)
      .eq('status', 'active'),
    supabase.from('events').select('id').eq('owner_id', userId).eq('is_paid', true),
    getFreeQuota(),
  ]);

  const now = Date.now();

  // اشتراك فعّال = لم تنتهِ فترته، أو بلا نهاية محددة
  const active = (subs ?? []).find(
    (s) => !s.current_period_end || new Date(s.current_period_end).getTime() > now,
  );

  const paidEvents = (paid ?? []).length;

  if (!active) {
    return {
      subscribed: false,
      planName: null,
      billingPeriod: null,
      periodEnd: null,
      daysLeft: null,
      expiringSoon: false,
      freeQuota,
      paidEvents,
    };
  }

  // العلاقة تصل ككائن أو مصفوفة حسب استنتاج العميل للنوع
  const rel = (active as { plans?: unknown }).plans;
  const plan = (Array.isArray(rel) ? rel[0] : rel) as
    | { name?: string; billing_period?: BillingPeriod }
    | undefined;

  const end = active.current_period_end;
  const daysLeft = end ? Math.ceil((new Date(end).getTime() - now) / DAY) : null;

  return {
    subscribed: true,
    planName: plan?.name ?? null,
    billingPeriod: plan?.billing_period ?? null,
    periodEnd: end,
    daysLeft,
    expiringSoon: daysLeft !== null && daysLeft <= 7,
    freeQuota,
    paidEvents,
  };
}
