import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { ProgressBar, Stat } from '@/components/ui/Misc';
import { getEventCounts, getEventTags, getGuestLimit, getOwnedEvent } from '@/lib/data/event';
import { requireUser } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/utils/format';
import { activationMoment, computeEventPhase, expiryMoment } from '@/lib/utils/event-phase';
import { cn } from '@/lib/utils/cn';

export const dynamic = 'force-dynamic';

export default async function EventOverview({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireUser();
  const supabase = await createClient();

  const [event, counts, tags] = await Promise.all([
    getOwnedEvent(id),
    getEventCounts(id),
    getEventTags(id),
  ]);

  const [limit, { count: scannerCount }] = await Promise.all([
    getGuestLimit(event, session.id),
    supabase
      .from('scanner_accounts')
      .select('id', { count: 'exact', head: true })
      .eq('event_id', id),
  ]);

  const phase = computeEventPhase(event);
  const hasDesign = Boolean(event.design?.backgroundUrl);
  const scanners = scannerCount ?? 0;

  const checklist = [
    {
      done: true,
      label: 'إنشاء المناسبة',
      hint: formatDateTime(event.starts_at),
      href: `/dashboard/events/${id}/settings`,
    },
    {
      done: hasDesign,
      label: 'تصميم الدعوة',
      hint: hasDesign ? 'التصميم جاهز' : 'اختر قالباً أو ارفع تصميمك',
      href: `/dashboard/events/${id}/design`,
    },
    {
      done: counts.total > 0,
      label: 'إضافة المدعوين',
      hint: counts.total > 0 ? `${formatNumber(counts.total)} مدعو` : 'لم تُضف أي مدعو بعد',
      href: `/dashboard/events/${id}/guests`,
    },
    {
      done: scanners > 0,
      label: 'حسابات مسؤولي المسح',
      hint: scanners > 0 ? `${formatNumber(scanners)} حساب` : 'أنشئ حساباً واحداً على الأقل',
      href: `/dashboard/events/${id}/scanners`,
    },
  ];

  const remaining = limit === null ? null : Math.max(0, limit - counts.total);

  return (
    <div className="space-y-6">
      {/* تنبيهات الحالة */}
      {phase === 'upcoming' && (
        <Alert tone="info" title="الباركودات غير مفعّلة بعد">
          تتفعّل تلقائياً على الخادم في{' '}
          <span className="font-bold">{formatDateTime(activationMoment(event))}</span>، وتنتهي
          صلاحيتها في <span className="font-bold">{formatDateTime(expiryMoment(event))}</span>.
        </Alert>
      )}
      {phase === 'active' && (
        <Alert tone="success" title="الباركودات مفعّلة الآن">
          مسؤولو الاستقبال يقدرون يمسحون. تنتهي الصلاحية في{' '}
          <span className="font-bold">{formatDateTime(expiryMoment(event))}</span>.
        </Alert>
      )}
      {phase === 'ended' && (
        <Alert tone="info" title="المناسبة انتهت">
          تقدر تصدّر تقرير الحضور الكامل من{' '}
          <Link href={`/dashboard/events/${id}/report`} className="font-bold underline">
            صفحة التقرير
          </Link>
          .
        </Alert>
      )}

      {remaining !== null && !event.is_paid && (
        <Alert
          tone={remaining === 0 ? 'warning' : 'info'}
          title={remaining === 0 ? 'استهلكت الدعوات المجانية' : 'أنت على التجربة المجانية'}
          action={
            <ButtonLink href={`/dashboard/billing?event=${id}`} size="sm">
              فعّل الباقة
            </ButtonLink>
          }
        >
          {remaining === 0
            ? `وصلت للحد المجاني (${formatNumber(limit!)} دعوة). فعّل الباقة لإضافة مدعوين جدد وتفعيل الباركودات وقت المناسبة.`
            : `تبقّى لك ${formatNumber(remaining)} دعوة مجانية من أصل ${formatNumber(limit!)}.`}
        </Alert>
      )}

      {/* الأرقام */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="المدعوون" value={formatNumber(counts.total)} tone="sky" />
        <Stat
          label="الحضور"
          value={formatNumber(counts.attended)}
          hint={`نسبة ${formatPercent(counts.attended, counts.total)}`}
          tone="mint"
        />
        <Stat
          label="لم يحضروا"
          value={formatNumber(Math.max(0, counts.total - counts.attended))}
          tone="coral"
        />
        <Stat
          label="حالات التجاوز اليدوي"
          value={formatNumber(counts.overrides)}
          hint="دخول رغم تنبيه التكرار"
          tone="sunny"
        />
      </div>

      <Card>
        <CardHeader
          title="نسبة الحضور"
          description={`${formatNumber(counts.attended)} من ${formatNumber(counts.total)} مدعو`}
        />
        <CardBody>
          <ProgressBar value={counts.attended} max={counts.total || 1} tone="mint" />
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* قائمة التجهيز */}
        <Card>
          <CardHeader title="جاهزية المناسبة" description="أكمل الخطوات قبل موعد المناسبة." />
          <CardBody className="space-y-2">
            {checklist.map((item) => (
              <Link
                key={item.label}
                href={item.href}
                className="flex items-center gap-3 rounded-2xl border border-sand-200 p-3.5 transition-colors hover:border-grape-200 hover:bg-grape-50/40"
              >
                <span
                  className={cn(
                    'grid h-8 w-8 shrink-0 place-items-center rounded-xl',
                    item.done ? 'bg-mint-500 text-white' : 'bg-sand-100 text-ink-faint',
                  )}
                >
                  {item.done ? (
                    <Icon name="check" className="h-4 w-4" strokeWidth={2.5} />
                  ) : (
                    <Icon name="plus" className="h-4 w-4" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink">{item.label}</span>
                  <span className="block truncate text-xs text-ink-soft">{item.hint}</span>
                </span>
                <Icon name="arrow" className="h-4 w-4 shrink-0 text-ink-faint" />
              </Link>
            ))}
          </CardBody>
        </Card>

        {/* الفئات */}
        <Card>
          <CardHeader
            title="فئات المدعوين"
            description="تُستخدم في تفصيل نسب الحضور بالتقرير."
            action={
              <ButtonLink href={`/dashboard/events/${id}/guests`} variant="ghost" size="sm">
                إدارة
              </ButtonLink>
            }
          />
          <CardBody>
            {tags.length === 0 ? (
              <p className="text-sm text-ink-soft">
                ما فيه فئات. تقدر تضيف فئات مخصصة من صفحة المدعوين.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <Badge key={tag.id} tone={tag.color} dot>
                    {tag.name}
                  </Badge>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
