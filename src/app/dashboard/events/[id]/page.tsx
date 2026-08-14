import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { ButtonLink } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { EventSteps, type EventStep } from '@/components/dashboard/EventSteps';
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

  /*
   * خطوات التجهيز بالترتيب الذي يمشي به صاحب المناسبة فعلاً.
   *
   * «إتمام التجهيز» خطوة قائمة بذاتها عمداً: هي اللحظة التي يراجع فيها
   * توقيت المناسبة وموقعها قبل أن يوزّع دعواتٍ لا رجعة فيها. وبعدها
   * التحميل والتوزيع — آخر ما يُفعل لأنه أول ما لا يُتراجَع عنه.
   */
  const settingsDone = Boolean(event.venue) && hasDesign && counts.total > 0 && scanners > 0;

  const steps: EventStep[] = [
    {
      label: 'صمّم الدعوة',
      hint: hasDesign ? 'التصميم جاهز' : 'اختر قالباً جاهزاً أو ارفع تصميمك',
      done: hasDesign,
      href: `/dashboard/events/${id}/design`,
      cta: 'ابدأ التصميم',
    },
    {
      label: 'أضف المدعوين',
      hint:
        counts.total > 0
          ? `${formatNumber(counts.total)} مدعو — لكل واحد باركود خاص فيه`
          : 'اكتب أسماءهم أو استورد ملفاً',
      done: counts.total > 0,
      href: `/dashboard/events/${id}/guests`,
      cta: 'أضف المدعوين',
    },
    {
      label: 'أضف مسؤولي المسح',
      hint:
        scanners > 0
          ? `${formatNumber(scanners)} حساب — يمسحون الباركودات على الباب`
          : 'حساب لكل شخص يستقبل الضيوف على الباب',
      done: scanners > 0,
      href: `/dashboard/events/${id}/scanners`,
      cta: 'أنشئ حساب مسح',
    },
    {
      label: 'أتمم التجهيز',
      hint: settingsDone
        ? 'الموقع والتوقيت مضبوطان'
        : 'راجع الموقع والتوقيت قبل ما توزّع الدعوات',
      done: settingsDone,
      href: `/dashboard/events/${id}/settings`,
      cta: 'راجع البيانات',
    },
    {
      label: 'حمّل الدعوات ووزّعها',
      hint: settingsDone
        ? 'نزّلها صوراً وأرسلها لكل مدعو'
        : 'تُفتح بعد ما تكمل الخطوات السابقة',
      done: false,
      href: `/dashboard/events/${id}/guests`,
      cta: 'حمّل الدعوات',
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

      {/* الخطوات أولاً: هي جواب «وش أسوي الحين» — والأرقام تجي بعدها */}
      <EventSteps steps={steps} />

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

      <div className="grid gap-5">
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
