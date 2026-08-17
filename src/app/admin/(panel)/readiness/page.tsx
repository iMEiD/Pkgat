import type { Metadata } from 'next';

import { ReadinessView } from './ReadinessView';
import { requireAdmin } from '@/lib/auth/session';
import { runHealthCheck } from '@/lib/db-health';
import { runReadinessCheck } from '@/lib/readiness';

export const metadata: Metadata = { title: 'جاهزية الإطلاق' };
// الفحص يصف اللحظة لا نسخة مخزّنة — وإلا أوهم بأن النقص قائم بعد إصلاحه
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminReadinessPage() {
  await requireAdmin();

  // فحص الترحيلات يُلخَّص هنا ولا يُعاد عرضه: صفحته قائمة بذاتها،
  // وتكرار ثلاثين بطاقة هنا يُغرق ما جاء الأدمن من أجله
  const [report, health] = await Promise.all([runReadinessCheck(), runHealthCheck()]);

  return (
    <ReadinessView
      report={report}
      migrationsMissing={health.missing.length}
      migrationsUnknown={health.unknown.length}
    />
  );
}
