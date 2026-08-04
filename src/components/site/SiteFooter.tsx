import Link from 'next/link';

import { Logo } from '@/components/ui/Logo';

export function SiteFooter({ tagline, note }: { tagline: string; note: string }) {
  return (
    <footer className="mt-24 border-t border-sand-200 bg-sand-50/70">
      <div className="pk-container grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-4">
        <div className="lg:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-7 text-ink-soft">{tagline}</p>
        </div>

        <div>
          <h4 className="text-sm font-bold text-ink">المنصة</h4>
          <ul className="mt-1 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/gallery">معرض الأعمال</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/pricing">الأسعار والباقات</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/about">من نحن</Link></li>
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-bold text-ink">حسابك</h4>
          <ul className="mt-1 text-sm text-ink-soft">
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/signup">إنشاء حساب</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/login">تسجيل الدخول</Link></li>
            <li><Link className="inline-flex min-h-11 items-center transition-colors hover:text-grape-600" href="/scan/login">دخول مسؤول الاستقبال</Link></li>
          </ul>
        </div>
      </div>

      <div className="border-t border-sand-200">
        <div className="pk-container flex flex-col items-center justify-between gap-2 py-6 text-xs text-ink-faint sm:flex-row">
          <p>{note}</p>
          <p dir="ltr" className="font-semibold tracking-[0.2em]">PKGAT</p>
        </div>
      </div>
    </footer>
  );
}
