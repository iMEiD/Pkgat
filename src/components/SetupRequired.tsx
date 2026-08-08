import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { LogoMark } from '@/components/ui/Logo';
import { FloatingThemeToggle } from '@/components/ui/ThemeToggle';
import { describeMissing, type MissingEnv } from '@/lib/config';

/**
 * شاشة تُعرض بدل انهيار الخادم عندما تنقص متغيرات البيئة.
 * تقول بالضبط أي متغيّر ناقص وأين يُضاف، بدل رسالة «Application error».
 */
export function SetupRequired({
  title,
  problems,
  backHref = '/dashboard',
  backLabel = 'العودة للوحة',
}: {
  title: string;
  problems: MissingEnv[];
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <FloatingThemeToggle />
      <LogoMark className="h-12 w-12 rounded-2xl" />

      <Card className="mt-6 w-full max-w-lg p-7">
        <h1 className="font-display text-xl font-bold text-ink">{title}</h1>
        <p className="mt-2 text-sm leading-7 text-ink-soft">
          هذا القسم يحتاج متغيرات بيئة غير مضبوطة على الاستضافة. أضفها ثم أعد النشر.
        </p>

        <ul className="mt-5 space-y-2">
          {problems.map((problem) => (
            <li
              key={problem.key}
              className="rounded-2xl border border-coral-100 bg-coral-50 px-4 py-3"
            >
              <code dir="ltr" className="block text-sm font-bold text-coral-600">
                {problem.key}
              </code>
              <span className="mt-0.5 block text-xs text-ink-soft">
                {problem.label} — {describeMissing(problem)}
              </span>
            </li>
          ))}
        </ul>

        <div className="mt-6 space-y-2 rounded-2xl bg-sand-50 p-4 text-xs leading-6 text-ink-soft">
          <p className="font-bold text-ink">كيف تضبطها على Vercel</p>
          <p>
            Settings ← Environment Variables ← أضف كل متغيّر أعلاه ← اختر
            <span className="font-semibold text-ink"> Production and Preview</span> ← Save.
          </p>
          <p>
            ثم من تبويب Deployments اضغط <span className="font-semibold text-ink">Redeploy</span> —
            التغييرات لا تسري على النشر الحالي.
          </p>
          <p className="text-ink-faint">
            لتوليد الأسرار: <code dir="ltr">openssl rand -base64 48</code>
          </p>
        </div>

        <Link
          href={backHref}
          className="mt-6 inline-block text-sm font-bold text-grape-600 hover:text-grape-700"
        >
          ← {backLabel}
        </Link>
      </Card>
    </div>
  );
}
