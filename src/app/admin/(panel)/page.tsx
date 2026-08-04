import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Stat } from '@/components/ui/Misc';
import { createServiceClient } from '@/lib/supabase/server';
import { formatDateTime, formatNumber, formatPrice } from '@/lib/utils/format';

export const metadata: Metadata = { title: 'لوحة الأدمن' };
export const dynamic = 'force-dynamic';

export default async function AdminOverview() {
  const supabase = createServiceClient();

  const [
    { count: users },
    { count: events },
    { count: guests },
    { count: checkins },
    { data: payments },
    { data: recentEvents },
    { data: recentErrors },
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('events').select('id', { count: 'exact', head: true }),
    supabase.from('guests').select('id', { count: 'exact', head: true }),
    supabase.from('checkins').select('id', { count: 'exact', head: true }).eq('result', 'granted'),
    supabase.from('payments').select('amount_halalas').eq('status', 'paid'),
    supabase
      .from('events')
      .select('id, title, starts_at, status, is_paid, owner_id')
      .order('created_at', { ascending: false })
      .limit(6),
    supabase
      .from('error_logs')
      .select('id, level, source, message, created_at')
      .order('created_at', { ascending: false })
      .limit(5),
  ]);

  const revenue = (payments ?? []).reduce((sum, p) => sum + p.amount_halalas, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-black text-ink">لوحة الأدمن</h1>
        <p className="mt-1.5 text-sm text-ink-soft">نظرة شاملة على المنصة.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="المستخدمون" value={formatNumber(users ?? 0)} tone="grape" />
        <Stat label="المناسبات" value={formatNumber(events ?? 0)} tone="sky" />
        <Stat label="المدعوون" value={formatNumber(guests ?? 0)} tone="mint" />
        <Stat label="عمليات دخول ناجحة" value={formatNumber(checkins ?? 0)} tone="sunny" />
        <Stat label="إجمالي المدفوعات" value={formatPrice(revenue)} tone="coral" />
      </div>

      {(recentErrors ?? []).length > 0 && (
        <Alert tone="warning" title="أخطاء تقنية حديثة">
          آخر خطأ: {recentErrors![0].source} — {recentErrors![0].message.slice(0, 120)}.{' '}
          <Link href="/admin/logs" className="font-bold underline">
            افتح السجلات
          </Link>
        </Alert>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="أحدث المناسبات"
            action={
              <Link href="/admin/events" className="text-xs font-bold text-grape-600">
                عرض الكل
              </Link>
            }
          />
          <CardBody>
            {(recentEvents ?? []).length === 0 ? (
              <p className="py-6 text-center text-sm text-ink-soft">ما فيه مناسبات بعد.</p>
            ) : (
              <ul className="divide-y divide-sand-100">
                {(recentEvents ?? []).map((event) => (
                  <li key={event.id} className="flex items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{event.title}</p>
                      <p className="text-xs text-ink-faint">{formatDateTime(event.starts_at)}</p>
                    </div>
                    <Badge tone={event.is_paid ? 'mint' : 'sand'}>
                      {event.is_paid ? 'مدفوعة' : 'تجريبية'}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="اختصارات الإدارة" />
          <CardBody className="grid grid-cols-2 gap-2">
            {[
              { href: '/admin/content', label: 'تعديل نصوص الموقع', icon: 'edit' },
              { href: '/admin/templates', label: 'إدارة القوالب', icon: 'palette' },
              { href: '/admin/gallery', label: 'معرض الأعمال', icon: 'sparkle' },
              { href: '/admin/plans', label: 'الباقات والأسعار', icon: 'settings' },
              { href: '/admin/users', label: 'المستخدمون', icon: 'users' },
              { href: '/admin/logs', label: 'سجل الأخطاء', icon: 'shield' },
            ].map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-2.5 rounded-2xl border border-sand-200 p-3 text-sm font-semibold text-ink-soft transition-colors hover:border-grape-200 hover:bg-grape-50/40 hover:text-ink"
              >
                <Icon name={item.icon} className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
