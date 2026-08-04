'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ColorInput } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { saveTheme } from '@/lib/actions/admin';
import { contrastRatio } from '@/lib/design/contrast';
import {
  DEFAULT_THEME,
  THEME_PRESETS,
  isValidHex,
  themeToCssVars,
  type Theme,
} from '@/lib/design/theme';
import { cn } from '@/lib/utils/cn';

const FIELDS: { key: keyof Theme; label: string; hint: string }[] = [
  { key: 'primary', label: 'اللون الأساسي', hint: 'الأزرار والروابط والعناصر التفاعلية' },
  { key: 'canvas', label: 'خلفية الموقع', hint: 'يُفضّل أبيض أو بيج فاتح جداً' },
  { key: 'sand', label: 'البيج المساند', hint: 'الحدود والبطاقات والخلفيات الثانوية' },
  { key: 'ink', label: 'لون النص', hint: 'يُفضّل داكن جداً لوضوح القراءة' },
];

export function ThemeEditor({ initial }: { initial: Theme }) {
  const router = useRouter();
  const [theme, setTheme] = useState<Theme>(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const dirty = useMemo(
    () => (Object.keys(theme) as (keyof Theme)[]).some((k) => theme[k] !== initial[k]),
    [theme, initial],
  );

  const valid = (Object.values(theme) as string[]).every(isValidHex);

  /**
   * معاينة حيّة: نحقن متغيرات الهوية في الصفحة فوراً فيرى الأدمن الأثر
   * على لوحته نفسها قبل الحفظ. تُزال عند مغادرة الصفحة.
   */
  useEffect(() => {
    if (!valid) return;

    const style = document.createElement('style');
    style.id = 'pk-theme-preview';
    style.textContent = themeToCssVars(theme);
    document.head.appendChild(style);

    return () => {
      style.remove();
    };
  }, [theme, valid]);

  // تباين النص مع الخلفية — تحذير مبكر من تركيبة غير مقروءة
  const textContrast = valid ? contrastRatio(theme.ink, theme.canvas) : 21;
  const buttonContrast = valid ? contrastRatio('#FFFFFF', theme.primary) : 21;

  function set(key: keyof Theme, value: string) {
    setSaved(false);
    setTheme((t) => ({ ...t, [key]: value }));
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await saveTheme(theme);
      if (!res.ok) {
        setError(res.error ?? 'تعذّر الحفظ.');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">الألوان والهوية</h1>
        <p className="mt-1.5 text-sm leading-7 text-ink-soft">
          تغيير الألوان هنا ينعكس على كل صفحات الموقع فوراً — الرئيسية والصفحات الفرعية
          ولوحات المستخدمين ولوحة المسح — بدون أي تعديل على الكود.
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {saved && !dirty && <Alert tone="success">تم حفظ الألوان وتطبيقها على الموقع.</Alert>}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="مجموعات جاهزة" description="ابدأ من مجموعة ثم عدّل ما تشاء." />
          <CardBody>
            <div className="grid gap-2 sm:grid-cols-2">
              {THEME_PRESETS.map((preset) => {
                const active = (Object.keys(theme) as (keyof Theme)[]).every(
                  (k) => theme[k] === preset.theme[k],
                );
                return (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => {
                      setSaved(false);
                      setTheme(preset.theme);
                    }}
                    className={cn(
                      'flex items-center gap-3 rounded-2xl border-2 p-3 text-right transition-all',
                      active
                        ? 'border-grape-400 bg-grape-50'
                        : 'border-sand-200 hover:border-sand-400',
                    )}
                  >
                    <span className="flex shrink-0 gap-1">
                      {[preset.theme.primary, preset.theme.sand, preset.theme.canvas].map((c) => (
                        <span
                          key={c}
                          className="h-6 w-6 rounded-full border border-black/10"
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink">
                      {preset.name}
                    </span>
                    {active && <Icon name="check" className="h-4 w-4 shrink-0 text-grape-600" />}
                  </button>
                );
              })}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="ألوان مخصّصة" description="اختر أي لون تريده." />
          <CardBody className="space-y-4">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <ColorInput
                  label={field.label}
                  value={theme[field.key]}
                  onChange={(v) => set(field.key, v)}
                />
                <p className="mt-1 text-xs text-ink-faint">{field.hint}</p>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* تحذيرات الوضوح */}
      {textContrast < 7 && (
        <Alert tone={textContrast < 4.5 ? 'danger' : 'warning'} title="وضوح النص ضعيف">
          نسبة التباين بين لون النص وخلفية الموقع {textContrast.toFixed(1)}:1. يُنصح بـ ٧:١ فأعلى
          لسهولة القراءة — اجعل النص أغمق أو الخلفية أفتح.
        </Alert>
      )}
      {buttonContrast < 4.5 && (
        <Alert tone="warning" title="نص الأزرار قد لا يُقرأ">
          الأزرار تكتب نصها بالأبيض فوق اللون الأساسي، والتباين الحالي{' '}
          {buttonContrast.toFixed(1)}:1. اختر لوناً أساسياً أغمق.
        </Alert>
      )}

      {/* معاينة */}
      <Card>
        <CardHeader title="معاينة" description="هكذا ستبدو العناصر على الموقع." />
        <CardBody>
          <div className="rounded-3xl border border-sand-200 bg-canvas p-6">
            <span className="inline-block rounded-full bg-grape-50 px-3 py-1 text-xs font-bold text-grape-600">
              عنوان صغير
            </span>
            <h2 className="mt-3 font-display text-2xl font-bold text-ink">
              مناسبتك تبدأ من دعوة
            </h2>
            <p className="mt-2 text-sm leading-7 text-ink-soft">
              نص توضيحي يوضح كيف تظهر الفقرات العادية بهذه الألوان على خلفية الموقع.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm">زر أساسي</Button>
              <Button size="sm" variant="secondary">
                زر ثانوي
              </Button>
              <Button size="sm" variant="outline">
                زر محدّد
              </Button>
            </div>
            <div className="mt-4 rounded-2xl border border-sand-200 bg-sand-50 p-3 text-xs text-ink-soft">
              بطاقة على الخلفية البيجية المساندة
            </div>
          </div>
        </CardBody>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={submit} loading={pending} disabled={!dirty || !valid}>
          حفظ وتطبيق على الموقع
        </Button>
        {dirty && (
          <Button variant="ghost" onClick={() => setTheme(initial)} disabled={pending}>
            تراجع
          </Button>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            setSaved(false);
            setTheme(DEFAULT_THEME);
          }}
          disabled={pending}
        >
          إرجاع الافتراضي
        </Button>
      </div>

      <p className="text-xs leading-6 text-ink-faint">
        ملاحظة: ألوان الفئات والتنبيهات (أخضر للنجاح، أحمر للتكرار) تبقى ثابتة عمداً — معناها
        متعارف عليه، وتغييرها يربك مسؤولي الاستقبال وقت المناسبة.
      </p>
    </div>
  );
}
