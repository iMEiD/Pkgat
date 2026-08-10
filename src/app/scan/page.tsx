import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ScannerDashboard } from './ScannerDashboard';
import { ScanUnavailable } from './ScanUnavailable';
import { SetupRequired } from '@/components/SetupRequired';
import { getScannerSession, hasScannerCookie } from '@/lib/auth/scanner-session';
import { createServiceClient } from '@/lib/supabase/server';
import { SCANNER_ENV, checkEnv } from '@/lib/config';

export const metadata: Metadata = {
  title: 'مسح الدعوات',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  // بدون جلسة صالحة نعيده للدخول — وهناك تظهر رسالة الإعداد الناقص إن وُجد
  const session = await getScannerSession();
  if (!session) {
    // كوكي موجود لكنه لم يعد صالحاً ⇒ انتهت الجلسة، لا «لم يسجّل بعد»
    const stale = await hasScannerCookie();
    redirect(stale ? '/scan/login?reason=expired' : '/scan/login');
  }

  const problems = checkEnv(SCANNER_ENV);
  if (problems.length > 0) {
    return (
      <SetupRequired
        title="لوحة المسح تحتاج إعداداً"
        problems={problems}
        backHref="/scan/login"
        backLabel="العودة لصفحة الدخول"
      />
    );
  }

  const supabase = createServiceClient();

  const { data: event, error } = await supabase
    .from('events')
    .select('id, title, starts_at, venue, status')
    .eq('id', session.eventId)
    .maybeSingle();

  /*
   * تعذّر الوصول لقاعدة البيانات ليس سبباً لإخراج مسؤول الاستقبال.
   *
   * كان الفشل هنا — أياً كان سببه — يعيده إلى /scan/login، وصفحة الدخول
   * ترى كوكي جلسته سليماً فتعيده إلى /scan… وهكذا حتى يوقف المتصفح
   * الحلقة برسالة ERR_TOO_MANY_REDIRECTS. وهذا بالضبط ما يعنيه أن
   * «الصفحة ما تفتح أحياناً»: انقطاع لحظة واحدة يقفل اللوحة على من
   * يقف بالباب، ويبقى مقفولاً ما دام الكوكي صالحاً.
   *
   * فنفرّق الآن: خللٌ عابر ⇒ صفحة إعادة محاولة تحفظ الجلسة، ومناسبة
   * غير موجودة ⇒ خروج بسبب معلن لا حلقة صامتة.
   */
  if (error) {
    return <ScanUnavailable reason="connection" />;
  }

  if (!event) {
    redirect('/scan/login?reason=event_missing');
  }

  const [{ count: total }, { count: attended }] = await Promise.all([
    supabase.from('guests').select('id', { count: 'exact', head: true }).eq('event_id', event.id),
    supabase
      .from('guests')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', event.id)
      .not('checked_in_at', 'is', null),
  ]);

  return (
    <ScannerDashboard
      scannerName={session.displayName}
      eventTitle={event.title}
      eventVenue={event.venue}
      initialStats={{ total: total ?? 0, attended: attended ?? 0 }}
    />
  );
}
