'use client';

import { useEffect } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LogoMark } from '@/components/ui/Logo';

/**
 * حاجز الأخطاء العام — يستبدل رسالة Next.js الإنجليزية الغامضة
 * («Application error: a server-side exception has occurred») بصفحة عربية
 * تشرح الوضع وتعرض معرّف الخطأ للرجوع إليه في السجلات.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // يظهر في سجلات المتصفح ويساعد على الربط مع سجل الخادم
    console.error('PKGAT error:', error.digest ?? '', error.message);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <LogoMark className="h-12 w-12 rounded-2xl" />

      <Card className="mt-6 w-full max-w-md p-7 text-center">
        <p className="text-4xl">⚠️</p>
        <h1 className="mt-4 font-display text-xl font-bold text-ink">صار خطأ غير متوقّع</h1>
        <p className="mt-2 text-sm leading-7 text-ink-soft">
          تعذّر تحميل هذه الصفحة. جرّب مرة أخرى، وإذا تكرّر الخطأ فغالباً هناك متغيّر إعداد
          ناقص على الاستضافة.
        </p>

        {error.digest && (
          <p className="mt-4 rounded-xl bg-sand-50 px-3 py-2 text-xs text-ink-faint">
            معرّف الخطأ: <code dir="ltr">{error.digest}</code>
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>حاول مرة أخرى</Button>
          <Link
            href="/"
            className="inline-flex h-11 items-center rounded-full border border-sand-300 px-6 text-[15px] font-semibold text-ink-soft transition-colors hover:bg-sand-100"
          >
            الصفحة الرئيسية
          </Link>
        </div>
      </Card>
    </div>
  );
}
