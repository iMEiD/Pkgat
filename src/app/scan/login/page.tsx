import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ScannerLoginForm } from './ScannerLoginForm';
import { getScannerSession } from '@/lib/auth/scanner-session';

export const metadata: Metadata = {
  title: 'دخول مسؤول الاستقبال',
  robots: { index: false, follow: false },
};

/** أسباب وصول مسؤول الاستقبال إلى هنا وهو يظن نفسه داخلاً */
const REASONS: Record<string, string> = {
  event_missing:
    'المناسبة المرتبطة بحسابك ما عادت موجودة — يمكن حُذفت أو انتهت. راجع صاحب المناسبة أو سجّل دخولك بحساب مسح آخر.',
  expired: 'انتهت جلستك. سجّل دخولك من جديد بنفس البيانات.',
};

export default async function ScannerLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const notice = reason ? REASONS[reason] : undefined;

  /*
   * التحويل التلقائي إلى /scan يتوقف حين نصل هنا بسبب معلن.
   *
   * وإلا انعقدت حلقة: /scan يعجز عن تحميل المناسبة فيرسله هنا، وهذه
   * ترى الكوكي سليماً فترسله إلى /scan… ويقف المتصفح عند
   * ERR_TOO_MANY_REDIRECTS فلا تفتح الصفحة إطلاقاً.
   */
  if (!notice) {
    const session = await getScannerSession();
    if (session) redirect('/scan');
  }

  return <ScannerLoginForm notice={notice} />;
}
