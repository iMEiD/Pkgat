import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { ScannerDashboard } from './ScannerDashboard';
import { SetupRequired } from '@/components/SetupRequired';
import { getScannerSession } from '@/lib/auth/scanner-session';
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
  if (!session) redirect('/scan/login');

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

  const { data: event } = await supabase
    .from('events')
    .select('id, title, starts_at, venue, status')
    .eq('id', session.eventId)
    .single();

  if (!event) redirect('/scan/login');

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
