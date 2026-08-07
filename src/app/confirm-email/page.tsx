import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/Card';
import { Logo } from '@/components/ui/Logo';
import { ResendConfirmation } from './ResendConfirmation';
import { getSessionUser } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'فعّل بريدك' };
export const dynamic = 'force-dynamic';

/**
 * صفحة الحساب غير المؤكَّد.
 *
 * لا تستدعي requireUser — هي وجهة إعادة التوجيه منه، فاستدعاؤها يعني
 * حلقة لا تنتهي. تقرأ الجلسة مباشرة، وتُخرج المؤكَّد للوحته والزائر
 * لصفحة الدخول.
 */
export default async function ConfirmEmailPage() {
  const session = await getSessionUser();

  if (!session) redirect('/login');
  if (session.emailConfirmed) redirect('/dashboard');

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <Logo />
      <Card className="mt-8 w-full max-w-md p-8 text-center">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-sunny-50 text-3xl">
          ✉️
        </div>

        <h1 className="mt-5 font-display text-2xl font-bold text-ink">فعّل بريدك أولاً</h1>

        <p className="mt-3 text-sm leading-8 text-ink-soft">
          أرسلنا رابط تأكيد إلى{' '}
          <span className="font-bold text-ink" dir="ltr">
            {session.email}
          </span>
          . افتح الرابط لتفعيل حسابك — لا تقدر تنشئ مناسبات قبل ذلك.
        </p>

        <div className="mt-4 rounded-2xl bg-sand-50 p-4 text-xs leading-6 text-ink-soft">
          ما وصلتك الرسالة؟ تحقق من مجلد <span className="font-bold text-ink">الرسائل غير المرغوبة</span> —
          وقد تتأخر دقيقة أو دقيقتين.
        </div>

        <ResendConfirmation email={session.email} />

        <form action="/api/auth/signout" method="post" className="mt-6">
          <button
            type="submit"
            className="text-sm font-bold text-ink-faint transition-colors hover:text-ink"
          >
            تسجيل الخروج
          </button>
        </form>
      </Card>
    </div>
  );
}
