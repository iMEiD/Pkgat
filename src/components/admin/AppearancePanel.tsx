'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { saveAppearance } from '@/lib/actions/admin';
import {
  DEFAULT_APPEARANCE,
  type Appearance,
  type ColorModeSetting,
  type GlassStrength,
  type SurfaceStyle,
} from '@/lib/design/appearance';
import { cn } from '@/lib/utils/cn';

const MODES: { value: ColorModeSetting; label: string; hint: string }[] = [
  { value: 'auto', label: 'حسب جهاز الزائر', hint: 'من جواله ليلي يشوف الليلي — ومعه زر يبدّل' },
  { value: 'light', label: 'نهاري دائماً', hint: 'كل الزوار يشوفون الفاتح، والزر يختفي' },
  { value: 'dark', label: 'ليلي دائماً', hint: 'كل الزوار يشوفون الداكن، والزر يختفي' },
];

const SURFACES: { value: SurfaceStyle; label: string; hint: string }[] = [
  { value: 'classic', label: 'كلاسيكي', hint: 'شكل الموقع الحالي — بطاقات وظلال ناعمة' },
  { value: 'glass', label: 'زجاجي', hint: 'ألواح شفافة مضبّبة وهالات ضوء ولمسات بيج' },
];

const STRENGTHS: { value: GlassStrength; label: string }[] = [
  { value: 'soft', label: 'خفيف' },
  { value: 'medium', label: 'متوسط' },
  { value: 'strong', label: 'قوي' },
];

/**
 * قسم المظهر.
 *
 * الفكرة كلها في زر الإطفاء: الشكل الزجاجي طبقة تُضاف فوق الموقع لا
 * تستبدله، فالرجوع عنه ليس «استعادة نسخة» ولا يحتاجني — ضغطة على
 * «كلاسيكي» وحفظ، فيعود الموقع إلى ما كان عليه بالضبط.
 *
 * ولذلك يُعرض الحفظ لا التطبيق الفوري: الأدمن يجرّب على شاشته أولاً
 * (المعاينة تحت)، ولا يصل الزوار شيء قبل أن يضغط.
 */
export function AppearancePanel({ initial }: { initial: Appearance }) {
  const router = useRouter();
  const [value, setValue] = useState<Appearance>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty =
    value.mode !== initial.mode ||
    value.surface !== initial.surface ||
    value.glass !== initial.glass ||
    value.visitorChoice !== initial.visitorChoice;

  /**
   * معاينة حيّة على لوحة الأدمن نفسها.
   *
   * نكتب السمات على عنصر html مباشرة — وهي نفسها التي يكتبها الخادم —
   * فما تراه هنا هو ما سيراه الزائر حرفياً، لا محاكاة له. وتُرجَع عند
   * مغادرة الصفحة حتى لا تعلق اللوحة على شكل لم يُحفظ.
   */
  useEffect(() => {
    const root = document.documentElement;
    const prevSurface = root.dataset.surface;
    const prevTheme = root.dataset.theme;

    root.dataset.surface = value.surface;
    if (value.mode !== 'auto') root.dataset.theme = value.mode;

    return () => {
      if (prevSurface) root.dataset.surface = prevSurface;
      else delete root.dataset.surface;
      if (prevTheme) root.dataset.theme = prevTheme;
    };
  }, [value.surface, value.mode]);

  // قوة الضباب متغيّر CSS، فنحقنه بنفس الطريقة أثناء المعاينة
  useEffect(() => {
    const blur = { soft: 14, medium: 22, strong: 32 }[value.glass];
    const style = document.createElement('style');
    style.textContent = `:root{--pk-glass-blur:${blur}px;--pk-glass-blur-sm:${Math.round(blur * 0.7)}px}`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [value.glass]);

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveAppearance(value);
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
        title="المظهر"
        description="الوضع الليلي وشكل الأسطح. كل شي هنا قابل للإطفاء والرجوع بضغطة."
      />
      <CardBody className="space-y-6">
        {error && <Alert tone="danger">{error}</Alert>}
        {saved && !dirty && (
          <Alert tone="success">تم حفظ المظهر وتطبيقه على الموقع لكل الزوار.</Alert>
        )}

        <Choice
          label="وضع الموقع"
          options={MODES}
          value={value.mode}
          onChange={(v) => {
            setSaved(false);
            setValue((s) => ({ ...s, mode: v }));
          }}
        />

        <Choice
          label="شكل الأسطح"
          options={SURFACES}
          value={value.surface}
          onChange={(v) => {
            setSaved(false);
            setValue((s) => ({ ...s, surface: v }));
          }}
        />

        {/*
          الشكل ذوقٌ لا صواب: ما يراه أحدهم «عصرياً» يراه آخر مشوّشاً.
          فيضبط الأدمن ما يبدأ به الزائر، ويبقى للزائر أن يبدّل — إلا
          أن يُطفأ هذا الخيار، فيختفي الزر عن الجميع ويثبت شكل واحد.
        */}
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-sand-200 p-3 transition-colors hover:border-sand-400">
          <input
            type="checkbox"
            checked={value.visitorChoice}
            onChange={(e) => {
              setSaved(false);
              setValue((s) => ({ ...s, visitorChoice: e.target.checked }));
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-grape-500"
          />
          <span className="min-w-0">
            <span className="block text-sm font-bold text-ink">
              خلّي المستخدم يختار الثيم بنفسه
            </span>
            <span className="mt-1 block text-xs leading-6 text-ink-faint">
              يظهر زر «عصري / كلاسيكي» في ترويسة الموقع ولوحة التحكم، واختياره يُحفظ في
              متصفحه. واللي تختاره أنت فوق يبقى الافتراضي لمن ما بدّل. ولو أطفيته اختفى
              الزر عن الجميع وثبت شكل واحد.
            </span>
          </span>
        </label>

        {value.surface === 'glass' && (
          <div>
            <p className="mb-2 text-sm font-bold text-ink">قوة الزجاج</p>
            <div className="flex flex-wrap gap-2">
              {STRENGTHS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => {
                    setSaved(false);
                    setValue((v) => ({ ...v, glass: s.value }));
                  }}
                  className={cn(
                    'rounded-full border-2 px-4 py-1.5 text-sm font-bold transition-colors',
                    value.glass === s.value
                      ? 'border-grape-400 bg-grape-50 text-grape-600'
                      : 'border-sand-200 text-ink-soft hover:border-sand-400',
                  )}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-6 text-ink-faint">
              الضباب أثقل شي على الجوال — الموقع ينزّله درجة تلقائياً على الشاشات الصغيرة.
              لو حسّيت التمرير ثقيل، اختر «خفيف».
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-sand-200 pt-4">
          <Button onClick={submit} loading={pending} disabled={!dirty}>
            حفظ وتطبيق على الموقع
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setValue(initial)} disabled={pending}>
              تراجع
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setSaved(false);
              setValue(DEFAULT_APPEARANCE);
            }}
            disabled={pending}
          >
            إرجاع الشكل السابق
          </Button>
        </div>

        <p className="text-xs leading-6 text-ink-faint">
          «إرجاع الشكل السابق» يرجّع الموقع لشكله قبل هذا القسم: أسطح كلاسيكية، والوضع
          حسب جهاز الزائر. ولا يمسّ ألوان الهوية اللي فوق.
        </p>
      </CardBody>
    </Card>
  );
}

/** صفّ خيارات — بطاقة لكل خيار مع شرح، لا قائمة منسدلة تخفي الفروق */
function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; hint: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-bold text-ink">{label}</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              className={cn(
                'rounded-2xl border-2 p-3 text-right transition-all',
                active ? 'border-grape-400 bg-grape-50' : 'border-sand-200 hover:border-sand-400',
              )}
            >
              <span className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm font-bold text-ink">{o.label}</span>
                {active && <Icon name="check" className="h-4 w-4 shrink-0 text-grape-600" />}
              </span>
              <span className="mt-1 block text-xs leading-6 text-ink-faint">{o.hint}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
