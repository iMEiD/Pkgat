import { getSettings } from '@/lib/cms';
import { isMoyasarConfigured } from '@/lib/payments/moyasar';

/** علامة تُوسم بها كل عملية دفع محاكاة — بها تُميَّز وتُنظَّف لاحقاً */
export const SIMULATED_REF = 'simulated';

/**
 * هل الشراء الآن محاكاة؟
 *
 * شرطان معاً، والثاني هو الحارس الحقيقي:
 *   ١. صاحب المنصة فعّل الإعداد payments_test_mode
 *   ٢. مفتاح مُيسّر غير مضبوط أصلاً
 *
 * فلحظة ربط البوابة الحقيقية ينتهي الوضع التجريبي وحده، ولو بقي
 * الإعداد مفتوحاً بالنسيان. إعدادٌ منسيّ في منصة يديرها شخص واحد
 * يعني باقات مجانية للجميع — فلا نجعله ممكناً.
 */
export async function paymentsTestMode(): Promise<boolean> {
  if (isMoyasarConfigured()) return false;

  const settings = await getSettings();
  const value = settings.payments_test_mode;

  return value === true || value === 'true';
}
