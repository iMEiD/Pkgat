import Link from 'next/link';

import { Card } from '@/components/ui/Card';
import { LogoMark } from '@/components/ui/Logo';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <LogoMark className="h-12 w-12 rounded-2xl" />

      <Card className="mt-6 w-full max-w-md p-7 text-center">
        <p className="font-display text-5xl font-bold text-grape-200">٤٠٤</p>
        <h1 className="mt-3 font-display text-xl font-bold text-ink">الصفحة غير موجودة</h1>
        <p className="mt-2 text-sm leading-7 text-ink-soft">
          الرابط اللي فتحته غير صحيح، أو أن المحتوى انحذف.
        </p>

        <Link
          href="/"
          className="mt-6 inline-flex h-11 items-center rounded-full bg-grape-500 px-6 text-[15px] font-semibold text-white shadow-pop transition-colors hover:bg-grape-600"
        >
          العودة للرئيسية
        </Link>
      </Card>
    </div>
  );
}
