import type { Metadata } from 'next';

import { HealthReportView, type MigrationView } from './HealthReportView';
import { requireAdmin } from '@/lib/auth/session';
import { runHealthCheck } from '@/lib/db-health';
import { migrationSql } from '@/lib/migration-sql';

export const metadata: Metadata = { title: 'فحص قاعدة البيانات' };
// الفحص يجب أن يصف اللحظة لا نسخة مخزّنة — وإلا أوهم بأن النقص قائم بعد إصلاحه
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminHealthPage() {
  await requireAdmin();

  const report = await runHealthCheck();

  // نص SQL يُرسَل للمتصفح فقط لما يحتاجه المستخدم فعلاً — لا داعي
  // لتحميل ٩٠ كيلوبايت من الترحيلات السليمة على جواله
  const migrations: MigrationView[] = report.migrations.map((m) => ({
    ...m,
    sql: m.state === 'ok' ? null : migrationSql(m.file),
  }));

  return <HealthReportView migrations={migrations} allGood={report.allGood} />;
}
