import type { Metadata } from 'next';

import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { getSettings } from '@/lib/cms';

export const metadata: Metadata = { title: 'الحساب موقوف' };

export default async function SuspendedPage() {
  const settings = await getSettings();
  const email = typeof settings.support_email === 'string' ? settings.support_email : 'hello@pkgat.com';

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4">
      <Logo />
      <Card className="mt-8 max-w-md p-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-coral-50 text-3xl">
          🔒
        </div>
        <h1 className="mt-5 font-display text-2xl font-bold text-ink">حسابك موقوف مؤقتاً</h1>
        <p className="mt-3 text-sm leading-8 text-ink-soft">
          تم إيقاف هذا الحساب من قِبل إدارة المنصة. للاستفسار أو إعادة التفعيل تواصل معنا على:
        </p>
        <a
          href={`mailto:${email}`}
          dir="ltr"
          className="mt-4 inline-block font-bold text-grape-600 hover:text-grape-700"
        >
          {email}
        </a>
      </Card>
    </div>
  );
}
