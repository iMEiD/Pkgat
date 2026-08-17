'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { arabicDigits } from '@/lib/utils/format';
import type { ReadinessItem, ReadinessReport } from '@/lib/readiness';
import { cn } from '@/lib/utils/cn';

const TONE: Record<ReadinessItem['level'], string> = {
  ok: 'mint',
  warning: 'sunny',
  blocker: 'coral',
  unknown: 'sand',
};

const LABEL: Record<ReadinessItem['level'], string> = {
  ok: 'جاهز',
  warning: 'يُنصح',
  blocker: 'مانع',
  unknown: 'غير مؤكّد',
};

export function ReadinessView({
  report,
  migrationsMissing,
  migrationsUnknown,
}: {
  report: ReadinessReport;
  migrationsMissing: number;
  migrationsUnknown: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const ready = report.blockers === 0 && migrationsMissing === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">جاهزية الإطلاق</h1>
          <p className="mt-1.5 max-w-2xl text-sm leading-7 text-ink-soft">
            صفحة فحص قاعدة البيانات تسأل: أي تحديث وصل؟ وهذه تسأل سؤالاً آخر — لو أطلقت
            الموقع اليوم واشترك أول عميل، وش اللي بينكسر؟
          </p>
        </div>
        <Button
          variant="secondary"
          loading={pending}
          onClick={() => startTransition(() => router.refresh())}
        >
          <Icon name="refresh" className="h-4 w-4" />
          أعد الفحص
        </Button>
      </div>

      {ready ? (
        <Alert tone="success" title="جاهز للإطلاق">
          ما فيه أي مانع. راجع بنود «يُنصح» بالأسفل — ما توقف الإطلاق، لكنها تفرق في
          التجربة والثقة.
        </Alert>
      ) : (
        <Alert
          tone="danger"
          title={`${arabicDigits(report.blockers + (migrationsMissing > 0 ? 1 : 0))} مانع قبل الإطلاق`}
        >
          البنود المعلَّمة <span className="font-bold">«مانع»</span> تكسر شيئاً يستعمله
          العميل فعلاً. كل واحد منها مكتوب تحته وش يتعطّل وكيف تصلحه.
        </Alert>
      )}

      {/* قاعدة البيانات: ملخّص ورابط، لا تكرار لثلاثين بطاقة */}
      <Card>
        <CardHeader title="تحديثات قاعدة البيانات" description="ملخّص من صفحة الفحص." />
        <CardBody>
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={migrationsMissing > 0 ? 'coral' : migrationsUnknown > 0 ? 'sunny' : 'mint'} dot>
              {migrationsMissing > 0
                ? `${arabicDigits(migrationsMissing)} تحديث ناقص`
                : migrationsUnknown > 0
                  ? `${arabicDigits(migrationsUnknown)} غير مؤكّد`
                  : 'كلها وصلت'}
            </Badge>
            <Link
              href="/admin/health"
              className="text-sm font-bold text-grape-600 underline underline-offset-4"
            >
              افتح صفحة الفحص
            </Link>
          </div>
          {migrationsMissing > 0 && (
            <p className="mt-3 rounded-2xl bg-coral-50 px-4 py-3 text-sm leading-6 text-coral-700">
              <span className="font-bold">وش يتعطّل: </span>
              مزايا نُشرت في الموقع وما وصلت قاعدة بياناتك — تظهر كأخطاء غامضة في صفحات
              لا علاقة لها ببعض.
            </p>
          )}
        </CardBody>
      </Card>

      {report.groups.map((group) => (
        <Card key={group.title}>
          <CardHeader title={group.title} description={group.description} />
          <CardBody className="space-y-3">
            {group.items.map((item) => (
              <div
                key={item.label}
                className={cn(
                  'rounded-2xl border p-4',
                  item.level === 'ok'
                    ? 'border-sand-200'
                    : item.level === 'blocker'
                      ? 'border-coral-100 bg-coral-50'
                      : item.level === 'warning'
                        ? 'border-sunny-100 bg-sunny-50'
                        : 'border-sand-200 bg-sand-50',
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-ink">{item.label}</span>
                  <Badge tone={TONE[item.level]} dot>
                    {LABEL[item.level]}
                  </Badge>
                </div>

                {item.breaks && (
                  <p className="mt-2 text-sm leading-6 text-ink-soft">
                    <span className="font-bold">وش يتعطّل: </span>
                    {item.breaks}
                  </p>
                )}
                {item.fix && (
                  <p className="mt-1.5 text-sm leading-6 text-ink-soft">
                    <span className="font-bold">الحل: </span>
                    {item.fix}
                  </p>
                )}
                {item.detail && (
                  <code dir="ltr" className="mt-2 block break-all text-xs text-ink-faint">
                    {item.detail}
                  </code>
                )}
              </div>
            ))}
          </CardBody>
        </Card>
      ))}

      {/*
        ما لا يستطيع الخادم فحصه بنفسه.

        باقة Supabase وترخيص Vercel لا يظهران في أي استعلام من داخل
        التطبيق — ولا يجوز السكوت عنهما، فأخطرهما (توقّف المشروع بعد
        أسبوع خمول) هو الذي يوقف مناسبةً على الباب.
      */}
      <Card>
        <CardHeader
          title="أشياء ما أقدر أفحصها من هنا"
          description="تتأكد منها بنفسك — وهي أخطر ما في القائمة."
        />
        <CardBody className="space-y-3 text-sm leading-7 text-ink-soft">
          <p>
            <span className="font-bold text-ink">باقة Supabase: </span>
            الباقة المجانية <span className="font-bold">توقف مشروعك بعد ٧ أيام بلا نشاط</span>،
            وما فيها نسخ احتياطي يومي. لو صار هذا ليلة مناسبة عميل، مسؤول الاستقبال يقف
            على الباب وما يقدر يمسح. الترقية لـ Pro تحل الاثنين.
          </p>
          <p>
            <span className="font-bold text-ink">ترخيص Vercel: </span>
            باقة Hobby المجانية تمنع الاستعمال التجاري. أول ما تقبض ريالاً من عميل تحتاج
            Pro — وإلا أنت مخالف لشروطهم.
          </p>
          <p>
            <span className="font-bold text-ink">تجربة كاملة بنفسك: </span>
            أنشئ مناسبة حقيقية، صمّمها، أضف مدعوين، وامسح باركوداً من جوال ثانٍ. لا يوجد
            فحص آلي يعوّض هذي.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
