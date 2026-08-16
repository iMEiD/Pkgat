'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Input } from '@/components/ui/Field';
import { saveSocialProofMode } from '@/lib/actions/admin';
import { arabicDigits } from '@/lib/utils/format';
import type { SocialProofMode } from '@/lib/site-settings';
import { cn } from '@/lib/utils/cn';

/**
 * مصدر أرقام الإثبات الاجتماعي.
 *
 * الوضعان معروضان معاً والرقم الحقيقي مكتوب أمامهما، فيرى الأدمن كم
 * بلغت منصته فعلاً قبل أن يقرّر. وهذا وحده يكفي غالباً: من رأى رقمه
 * الحقيقي قلّ أن يكتب غيره.
 */
export function SocialProofPanel({
  mode: initialMode,
  min: initialMin,
  real,
}: {
  mode: SocialProofMode;
  min: number;
  /** الأرقام كما تحسبها قاعدة البيانات الآن — للعرض لا للحفظ */
  real: { events: number; guests: number } | null;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<SocialProofMode>(initialMode);
  const [min, setMin] = useState(String(initialMin));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = mode !== initialMode || Number(min) !== initialMin;
  const hidden = real !== null && mode === 'auto' && real.events < Number(min || 0);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveSocialProofMode(mode, Number(min) || 0);
      if (!res.ok) {
        setError(res.error ?? 'تعذّر الحفظ.');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader
        title="أرقام الإثبات الاجتماعي"
        description="الشريط اللي يعرض عدد المناسبات والمدعوين في الصفحة الرئيسية."
      />
      <CardBody className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {saved && !dirty && <Alert tone="success">تم الحفظ وتطبيقه على الموقع.</Alert>}

        {/* الرقم الحقيقي أولاً — قبل أي خيار */}
        {real && (
          <div className="rounded-2xl bg-sand-50 p-4">
            <p className="text-xs font-bold text-ink-faint">أرقامك الحقيقية الآن</p>
            <div className="mt-2 flex flex-wrap gap-6">
              <div>
                <p className="font-display text-2xl font-bold text-ink">
                  {arabicDigits(real.events)}
                </p>
                <p className="text-xs text-ink-soft">مناسبة (بلا التجريبية والمسوّدات)</p>
              </div>
              <div>
                <p className="font-display text-2xl font-bold text-ink">
                  {arabicDigits(real.guests)}
                </p>
                <p className="text-xs text-ink-soft">مدعو دخل فعلاً بباركوده</p>
              </div>
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-bold text-ink">من وين تجي الأرقام؟</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <ModeCard
              active={mode === 'auto'}
              onClick={() => {
                setSaved(false);
                setMode('auto');
              }}
              title="تلقائي — من قاعدة البيانات"
              body="تُحسب من مناسباتك الحقيقية وتكبر معك. ما تقدر تُزوَّر ولا تُنسى."
            />
            <ModeCard
              active={mode === 'manual'}
              onClick={() => {
                setSaved(false);
                setMode('manual');
              }}
              title="يدوي — أنا أكتبها"
              body="ما تكتبه في حقول الأرقام بالأسفل. للتجربة والمعاينة."
            />
          </div>
        </div>

        {mode === 'auto' && (
          <div>
            <p className="mb-2 text-sm font-bold text-ink">لا تُظهر الشريط قبل</p>
            <div className="flex items-center gap-3">
              <Input
                type="number"
                min={0}
                value={min}
                onChange={(e) => {
                  setSaved(false);
                  setMin(e.target.value);
                }}
                className="w-28"
              />
              <span className="text-sm text-ink-soft">مناسبة</span>
            </div>
            <p className="mt-2 text-xs leading-6 text-ink-faint">
              «٣ مناسبات» أسوأ من الصمت — تقول للزائر إن أحداً ما جرّبها بعد. فالشريط
              يسكت لين يصير الرقم مقنعاً بنفسه.
            </p>
            {hidden && (
              <Alert tone="warning" className="mt-3">
                الشريط <span className="font-bold">مخفي الآن</span> — عندك{' '}
                {arabicDigits(real?.events ?? 0)} مناسبة والحد {arabicDigits(Number(min) || 0)}.
                نزّل الحد أو بدّل للوضع اليدوي عشان تشوفه.
              </Alert>
            )}
          </div>
        )}

        {mode === 'manual' && (
          <Alert tone="warning" title="تنبيه قبل ما تكتب رقماً">
            بكجات تبيع التحقق ومنع التزوير. ورقمٌ مُختلَق هنا لو انكشف — وينكشف بأول
            سؤال «وش أشهر مناسبة اشتغلتوا عليها؟» — ما يهدم ثقة الزائر في الرقم، يهدمها
            في المنتج كله. استعمل هذا الوضع للتجربة، وارجع للتلقائي قبل الإطلاق.
          </Alert>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
          <Button onClick={submit} loading={pending} disabled={!dirty}>
            حفظ
          </Button>
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => {
                setMode(initialMode);
                setMin(String(initialMin));
              }}
              disabled={pending}
            >
              تراجع
            </Button>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function ModeCard({
  active,
  onClick,
  title,
  body,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-2xl border-2 p-3 text-right transition-all',
        active ? 'border-grape-400 bg-grape-50' : 'border-sand-200 hover:border-sand-400',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 text-sm font-bold text-ink">{title}</span>
        {active && <Icon name="check" className="h-4 w-4 shrink-0 text-grape-600" />}
      </span>
      <span className="mt-1 block text-xs leading-6 text-ink-faint">{body}</span>
    </button>
  );
}
