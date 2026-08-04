import { extendTailwindMerge } from 'tailwind-merge';

export type ClassValue = string | number | bigint | boolean | null | undefined | ClassValue[];

/**
 * نعرّف الأصناف المخصصة في نظام التصميم حتى يعرف tailwind-merge أنها
 * تتعارض مع نظيراتها القياسية (مثل shadow-none مقابل shadow-pop).
 * الألوان المخصصة (grape/coral/ink/sand…) تُحسم تلقائياً بلا تعريف.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ['soft', 'lift', 'pop'] }],
      rounded: [{ rounded: ['4xl'] }],
    },
  },
});

/**
 * دمج أسماء أصناف Tailwind مع حسم التعارضات لصالح الأخير.
 *
 * بدون هذا الحسم يفوز الصنف الذي يأتي لاحقاً في ملف CSS المولَّد، لا الذي
 * يكتبه المطوّر أخيراً — وهو ما جعل زر «أنشئ حسابك الآن» يُرسم بنص أبيض
 * على خلفية بيضاء، وأزرار الحذف تظهر رمادية بدل الحمراء.
 * الآن أي className يمرّره المستدعي يتغلّب فعلاً على نمط المكوّن الأساسي.
 */
export function cn(...values: ClassValue[]): string {
  const out: string[] = [];

  for (const v of values) {
    if (!v) continue;
    if (Array.isArray(v)) {
      const nested = cn(...v);
      if (nested) out.push(nested);
    } else if (typeof v === 'string') {
      out.push(v);
    }
  }

  return twMerge(out.join(' '));
}
