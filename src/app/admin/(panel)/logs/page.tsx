import type { Metadata } from 'next';

import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/Misc';
import { createServiceClient } from '@/lib/supabase/server';
import { formatDateTime, formatNumber } from '@/lib/utils/format';
import type { AuditLog, ErrorLog } from '@/lib/types/database';

export const metadata: Metadata = { title: 'السجلات' };
export const dynamic = 'force-dynamic';

const LEVEL_TONES: Record<string, string> = {
  error: 'coral',
  warn: 'sunny',
  info: 'sky',
};

export default async function AdminLogsPage() {
  const supabase = createServiceClient();

  const [{ data: errors }, { data: audits }] = await Promise.all([
    supabase
      .from('error_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const errorRows = (errors ?? []) as ErrorLog[];
  const auditRows = (audits ?? []) as AuditLog[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black text-ink">السجلات</h1>
        <p className="mt-1.5 text-sm text-ink-soft">
          الأخطاء التقنية العامة للمنصة، وسجل الإجراءات الإدارية.
        </p>
      </div>

      <Card>
        <CardHeader
          title={`سجل الأخطاء (${formatNumber(errorRows.length)})`}
          description="أخطاء الخادم المسجَّلة تلقائياً — آخر ١٠٠."
        />
        <CardBody>
          {errorRows.length === 0 ? (
            <EmptyState
              icon="✅"
              title="ما فيه أخطاء مسجّلة"
              description="المنصة تعمل بدون أخطاء مسجّلة حتى الآن."
            />
          ) : (
            <ul className="divide-y divide-sand-100">
              {errorRows.map((log) => (
                <li key={log.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-ink" dir="ltr">
                        {log.source}
                      </p>
                      <p className="mt-1 break-words text-xs text-ink-soft" dir="ltr">
                        {log.message}
                      </p>
                      {log.context && (
                        <pre
                          dir="ltr"
                          className="mt-2 overflow-x-auto rounded-xl bg-sand-50 p-2 text-[10px] text-ink-faint pk-scrollbar"
                        >
                          {JSON.stringify(log.context, null, 2)}
                        </pre>
                      )}
                    </div>
                    <div className="shrink-0 text-left">
                      <Badge tone={LEVEL_TONES[log.level] ?? 'sand'}>{log.level}</Badge>
                      <p className="mt-1 text-[11px] text-ink-faint">
                        {formatDateTime(log.created_at)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={`سجل الإجراءات الإدارية (${formatNumber(auditRows.length)})`}
          description="كل إجراء حسّاس نُفّذ من لوحة الأدمن."
        />
        <CardBody>
          {auditRows.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-soft">ما فيه إجراءات مسجّلة.</p>
          ) : (
            <ul className="divide-y divide-sand-100">
              {auditRows.map((log) => (
                <li key={log.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink" dir="ltr">
                      {log.action}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {log.actor_name ?? log.actor_type}
                      {log.target_table ? ` · ${log.target_table}` : ''}
                    </p>
                  </div>
                  <p className="shrink-0 text-[11px] text-ink-faint">
                    {formatDateTime(log.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
