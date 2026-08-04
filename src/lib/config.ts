/**
 * فحص متغيرات البيئة المطلوبة.
 *
 * الهدف: بدل أن ينهار الخادم برسالة «Application error» غامضة عند نقص
 * متغيّر، نكتشف النقص مبكراً ونعرض رسالة عربية تقول أي متغيّر ناقص
 * وأين يُضاف.
 */

export interface EnvRequirement {
  key: string;
  label: string;
  /** ٣٢ حرفاً على الأقل — للأسرار الموقّعة */
  minLength?: number;
}

export const SUPABASE_ENV: EnvRequirement[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', label: 'رابط مشروع Supabase' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'مفتاح anon العام' },
];

export const SERVICE_ENV: EnvRequirement[] = [
  { key: 'SUPABASE_SERVICE_ROLE_KEY', label: 'مفتاح الخدمة (service_role)' },
];

export const SCANNER_ENV: EnvRequirement[] = [
  ...SERVICE_ENV,
  { key: 'SCANNER_SESSION_SECRET', label: 'سرّ جلسة مسؤولي المسح', minLength: 32 },
];

export const ADMIN_ENV: EnvRequirement[] = [
  ...SERVICE_ENV,
  { key: 'ADMIN_SESSION_SECRET', label: 'سرّ جلسة الأدمن', minLength: 32 },
];

export interface MissingEnv {
  key: string;
  label: string;
  reason: 'missing' | 'too_short';
}

/** يعيد قائمة المتغيرات الناقصة أو القصيرة — فارغة تعني أن الإعداد سليم */
export function checkEnv(requirements: EnvRequirement[]): MissingEnv[] {
  const problems: MissingEnv[] = [];

  for (const req of requirements) {
    const value = process.env[req.key];

    if (!value || value.trim() === '') {
      problems.push({ key: req.key, label: req.label, reason: 'missing' });
      continue;
    }

    if (req.minLength && value.length < req.minLength) {
      problems.push({ key: req.key, label: req.label, reason: 'too_short' });
    }
  }

  return problems;
}

export function describeMissing(problem: MissingEnv): string {
  return problem.reason === 'missing'
    ? `${problem.key} غير مضبوط`
    : `${problem.key} أقصر من الحد المطلوب (٣٢ حرفاً)`;
}

/**
 * ملاحظة على سرّ الأدمن: الكود يقبل السقوط على SCANNER_SESSION_SECRET
 * لو كان ADMIN_SESSION_SECRET غائباً، فنفحص المتاح منهما فعلياً.
 */
export function checkAdminEnv(): MissingEnv[] {
  const problems = checkEnv(SERVICE_ENV);

  const adminSecret = process.env.ADMIN_SESSION_SECRET ?? process.env.SCANNER_SESSION_SECRET;
  if (!adminSecret || adminSecret.length < 32) {
    problems.push({
      key: 'ADMIN_SESSION_SECRET',
      label: 'سرّ جلسة الأدمن',
      reason: !adminSecret ? 'missing' : 'too_short',
    });
  }

  return problems;
}
