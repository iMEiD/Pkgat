import type { DiscountCode, Plan } from '@/lib/types/database';

/**
 * حساب الخصم — مصدر واحد للحقيقة، يعمل في الخادم وحده.
 *
 * لا يُستدعى من المتصفح إطلاقاً: العميل يرسل نص الكود لا أكثر، والخادم
 * يقرأ الباقة ويطبّق ويبني الفاتورة. أي حساب في المتصفح يعني كوداً
 * بنسبة ١٠٠٪ يصنعه المشتري بنفسه.
 */

export interface DiscountResult {
  originalHalalas: number;
  discountHalalas: number;
  finalHalalas: number;
  commissionHalalas: number;
}

/** يُطبّع الكود: الحروف كبيرة والمسافات تُزال — «صيف٢٥» و«صيف ٢٥» واحد */
export function normalizeCode(raw: string): string {
  return raw.trim().replace(/\s+/g, '').toUpperCase();
}

export function applyDiscount(code: DiscountCode, priceHalalas: number): DiscountResult {
  const original = Math.max(0, priceHalalas);

  const raw =
    code.kind === 'percent'
      ? Math.floor((original * code.value) / 100)
      : code.value;

  // الخصم لا يتجاوز السعر: كودٌ بمئتي ريال على باقة بمئة يُنزلها للصفر لا للسالب
  const discount = Math.min(raw, original);
  const final = original - discount;

  const commission = code.commission_percent
    ? Math.floor((final * Number(code.commission_percent)) / 100)
    : 0;

  return {
    originalHalalas: original,
    discountHalalas: discount,
    finalHalalas: final,
    commissionHalalas: commission,
  };
}

export type CodeRejection =
  | 'not_found'
  | 'inactive'
  | 'not_started'
  | 'expired'
  | 'exhausted'
  | 'user_limit'
  | 'wrong_plan';

export const REJECTION_MESSAGES: Record<CodeRejection, string> = {
  not_found: 'الكود غير صحيح.',
  inactive: 'هذا الكود موقوف.',
  not_started: 'هذا الكود ما بدأ صلاحيته بعد.',
  expired: 'انتهت صلاحية هذا الكود.',
  exhausted: 'خلص عدد استعمالات هذا الكود.',
  user_limit: 'استعملت هذا الكود من قبل.',
  wrong_plan: 'هذا الكود ما ينطبق على هذه الباقة.',
};

/**
 * صلاحية الكود لهذه الباقة ولهذا المستخدم.
 *
 * الترتيب مقصود: نقول له «انتهت صلاحيته» لا «ما ينطبق على الباقة» حين
 * يكون الاثنان صحيحين — الأقرب لسبب الرفض أنفع من أوّل شرط يفشل.
 */
export function checkCode(
  code: DiscountCode,
  plan: Pick<Plan, 'id'>,
  usesByUser: number,
  now = new Date(),
): CodeRejection | null {
  if (!code.is_active) return 'inactive';
  if (code.starts_at && new Date(code.starts_at) > now) return 'not_started';
  if (code.expires_at && new Date(code.expires_at) < now) return 'expired';
  if (code.max_uses !== null && code.used_count >= code.max_uses) return 'exhausted';
  if (usesByUser >= code.max_uses_per_user) return 'user_limit';

  // الفراغ يعني كل الباقات
  if (code.plan_ids.length > 0 && !code.plan_ids.includes(plan.id)) return 'wrong_plan';

  return null;
}
