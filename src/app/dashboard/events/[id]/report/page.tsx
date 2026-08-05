import type { Metadata } from 'next';
import Link from 'next/link';

import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';
import { Stat } from '@/components/ui/Misc';
import { EndEventControls } from './EndEventControls';
import { ExportAttendance } from './ExportAttendance';
import { getEventCounts, getEventGuests, getEventTags, getOwnedEvent } from '@/lib/data/event';
import { formatDateTime, formatNumber, formatPercent } from '@/lib/utils/format';
import { computeEventPhase, isLateArrival } from '@/lib/utils/event-phase';
import { Icon } from '@/components/ui/Icon';

export const metadata: Metadata = { title: 'تقرير المناسبة' };
export const dynamic = 'force-dynamic';

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [event, counts, guests, tags] = await Promise.all([
    getOwnedEvent(id),
    getEventCounts(id),
    getEventGuests(id),
    getEventTags(id),
  ]);

  const phase = computeEventPhase(event);
  const tagMap = new Map(tags.map((t) => [t.id, t]));
  const lateCount = guests.filter((g) => isLateArrival(event, g.checked_in_at)).length;

  const byTag = [...tags, null].map((tag) => {
    const list = guests.filter((g) => (tag ? g.tag_id === tag.id : !g.tag_id));
    return {
      name: tag?.name ?? 'بدون فئة',
      color: tag?.color ?? 'sand',
      invited: list.length,
      attended: list.filter((g) => g.checked_in_at).length,
    };
  }).filter((row) => row.invited > 0);

  return (
    <div className="space-y-6">
      {phase !== 'ended' && (
        <Alert tone="info" title="المناسبة ما انتهت بعد">
          التقرير متاح الآن، لكن الأرقام تتغير مع كل عملية مسح. تقدر تنهي المناسبة يدوياً من
          الأسفل، أو تنتظر انتهاءها تلقائياً حسب التوقيت المحدد.
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="المدعوون" value={formatNumber(counts.total)} tone="sky" />
        <Stat label="حضروا" value={formatNumber(counts.attended)} tone="mint" />
        <Stat
          label="لم يحضروا"
          value={formatNumber(Math.max(0, counts.total - counts.attended))}
          tone="coral"
        />
        <Stat
          label="نسبة الحضور"
          value={formatPercent(counts.attended, counts.total)}
          tone="grape"
        />
      </div>

      <Card>
        <CardHeader
          title="تصدير التقرير"
          description="نسخة مرتبة جاهزة للطباعة أو الحفظ كملف PDF."
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/dashboard/events/${id}/report/print`} target="_blank" size="lg">
              <Icon name="download" className="h-4 w-4" />
              افتح التقرير للطباعة / الحفظ PDF
            </ButtonLink>
            <ExportAttendance event={event} guests={guests} tags={tags} />
          </div>

          <p className="text-xs leading-6 text-ink-soft">
            ملف Excel يعطيك قائمة الأسماء بحالة كل مدعو ووقت دخوله — للفرز والتصفية
            والتسويات، بينما ملف PDF للعرض والأرشفة.
          </p>

          <p className="text-xs leading-6 text-ink-soft">
            التقرير يفتح في تبويب جديد بتنسيق مخصص للطباعة (A4). من نافذة الطباعة اختر
            «حفظ كملف PDF» للحصول على نسخة إلكترونية — هذا يحفظ النص العربي بشكل صحيح وقابل
            للبحث.
          </p>

          <div className="rounded-2xl bg-sand-50 p-4">
            <p className="text-xs font-bold text-ink-faint">يحتوي التقرير على:</p>
            <ul className="mt-2 space-y-1 text-xs text-ink-soft">
              <li>· العدد الكلي للمدعوين مقابل الحاضرين مع النسبة المئوية</li>
              <li>· قائمة تفصيلية بكل مدعو: حضر أم لا، ووقت الدخول الفعلي</li>
              <li>· تفصيل نسب الحضور حسب كل فئة على حدة</li>
              <li>· عدد حالات التجاوز اليدوي المسجَّلة</li>
            </ul>
          </div>
        </CardBody>
      </Card>

      {byTag.length > 0 && (
        <Card>
          <CardHeader title="الحضور حسب الفئة" />
          <CardBody>
            <div className="space-y-4">
              {byTag.map((row) => (
                <div key={row.name}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-bold text-ink">{row.name}</span>
                    <span className="text-ink-soft">
                      {formatNumber(row.attended)} من {formatNumber(row.invited)} ·{' '}
                      <span className="font-bold">{formatPercent(row.attended, row.invited)}</span>
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-sand-200">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${row.invited ? (row.attended / row.invited) * 100 : 0}%`,
                        backgroundColor: colorHex(row.color),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}

      {lateCount > 0 && (
        <Alert tone="info" title={`${formatNumber(lateCount)} مدعو دخلوا بعد نهاية المناسبة`}>
          دخلوا داخل مهلة التسامح ({formatNumber(event.expiry_grace_minutes)} دقيقة بعد النهاية)
          فقُبلت باركوداتهم. لو كان العدد كبيراً، فالمهلة عندك أوسع من اللازم — أو أن المناسبة
          امتدت فعلياً بعد وقتها المسجّل. تقدر تضبط المهلة من إعدادات المناسبة.
        </Alert>
      )}

      {counts.overrides > 0 && (
        <Alert tone="warning" title={`${formatNumber(counts.overrides)} حالة تجاوز يدوي`}>
          سُمح بالدخول رغم تنبيه التكرار أو خارج نافذة التوقيت.{' '}
          <Link href={`/dashboard/events/${id}/live`} className="font-bold underline">
            راجع السجل المباشر
          </Link>{' '}
          لمعرفة من نفّذها ومتى.
        </Alert>
      )}

      <Card>
        <CardHeader
          title="إنهاء المناسبة"
          description="يوقف صلاحية كل الباركودات فوراً ويثبّت أرقام التقرير."
        />
        <CardBody>
          <EndEventControls
            eventId={id}
            isEnded={event.status === 'ended'}
            endedAt={event.ended_manually_at}
          />
        </CardBody>
      </Card>

      <p className="text-center text-xs text-ink-faint">
        آخر تحديث: {formatDateTime(new Date())} · {tagMap.size} فئة
      </p>
    </div>
  );
}

function colorHex(color: string): string {
  const map: Record<string, string> = {
    grape: '#6D4AFF',
    coral: '#FF6B4A',
    mint: '#17BE94',
    sky: '#2E90FA',
    rose: '#F0518B',
    sunny: '#F5B01B',
    sand: '#C2AC88',
  };
  return map[color] ?? map.grape;
}
