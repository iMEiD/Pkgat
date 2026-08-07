/**
 * تصنيفات الاقتراحات.
 *
 * في ملف مستقل لا في ملف الإجراءات: ملف يبدأ بـ 'use server' لا يجوز أن
 * يُصدّر إلا دوالاً غير متزامنة، وتصدير ثابت منه يُسقط أي صفحة تستورده
 * وقت التشغيل — حتى لو نجح البناء.
 */
export const SUGGESTION_CATEGORIES = [
  { value: 'feature', label: 'ميزة جديدة' },
  { value: 'bug', label: 'خلل أو مشكلة' },
  { value: 'design', label: 'ملاحظة على التصميم' },
  { value: 'other', label: 'شيء آخر' },
] as const;

export const SUGGESTION_CATEGORY_VALUES = new Set(
  SUGGESTION_CATEGORIES.map((c) => c.value as string),
);
