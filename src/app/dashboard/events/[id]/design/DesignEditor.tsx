'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ColorInput, Field, Input, Select, Slider, Switch, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { InvitationPreview, extraIdOf, type DragTarget } from '@/components/design/InvitationPreview';
import { FontPicker } from '@/components/design/FontPicker';
import { TemplatePicker } from '@/components/design/TemplatePicker';
import { UploadDesign } from '@/components/design/UploadDesign';
import { saveDesign } from '@/lib/actions/events';
import { mergeDesign } from '@/lib/design/defaults';
import {
  allFontOptions,
  registerAllCustomFonts,
  setCustomFonts,
  type CustomFont,
} from '@/lib/design/fonts';
import { checkQrContrast } from '@/lib/design/contrast';
import { clearImageCache } from '@/lib/design/render';
import type {
  DesignConfig,
  EventRow,
  TemplateCategory,
  TemplateRow,
  TextLayer,
} from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

const SAMPLE_CODE = '00000000-0000-4000-8000-000000000000';

type Mode = 'template' | 'upload';

export function DesignEditor({
  event,
  userId,
  templates,
  categories,
  customFonts,
}: {
  event: EventRow;
  userId: string;
  templates: TemplateRow[];
  categories: TemplateCategory[];
  customFonts: CustomFont[];
}) {
  /*
   * الخطوط المرفوعة تُسجَّل قبل أول رسم على الكانفس.
   * setCustomFonts أثناء العرض لا في تأثير جانبي، لأن قائمة الاختيار
   * وresolveWeight يقرآنها فوراً في نفس دورة الرسم.
   */
  setCustomFonts(customFonts);

  useEffect(() => {
    void registerAllCustomFonts();
  }, []);

  const fontOptions = allFontOptions();
  const router = useRouter();
  const [design, setDesign] = useState<DesignConfig>(() => mergeDesign(event.design));
  const [templateId, setTemplateId] = useState<string | null>(event.template_id);
  /*
   * الافتراضي «ارفع دعوتي» لمن لم يبدأ بعد: هو الطريق الأصلي للمنصة.
   * ومن اختار قالباً سابقاً يعود إلى قالبه لا إلى الرفع.
   */
  const [mode, setMode] = useState<Mode>(
    design.source === 'template' && design.backgroundUrl ? 'template' : 'upload',
  );
  const [selected, setSelected] = useState<DragTarget>('name');
  const [saved, setSaved] = useState(false);
  // وضع الإضافة الحرّة: الضغطة التالية على التصميم تضع نصاً في موضعها
  const [placing, setPlacing] = useState(false);
  /** الطبقة التي تنتظر لوناً من التصميم — null يعني القطّارة مطفأة */
  const [picking, setPicking] = useState<'name' | 'qr-fg' | 'qr-bg' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const contrast = useMemo(
    () => checkQrContrast(design.qr.foreground, design.qr.background),
    [design.qr.foreground, design.qr.background],
  );

  function patch(updater: (d: DesignConfig) => DesignConfig) {
    setSaved(false);
    setDesign((d) => updater(structuredClone(d)));
  }

  function onMove(target: Exclude<DragTarget, null>, x: number, y: number) {
    patch((d) => {
      if (target === 'name') {
        d.name.x = x;
        d.name.y = y;
      } else if (target === 'qr') {
        d.qr.x = x;
        d.qr.y = y;
      } else {
        const extra = (d.extras ?? []).find((e) => e.id === extraIdOf(target));
        if (extra) {
          extra.x = x;
          extra.y = y;
        }
      }
      return d;
    });
  }

  /** التكبير بإصبعين — المعاينة ترسل الحجم النهائي مضبوطاً ضمن الحدود */
  function onResize(target: Exclude<DragTarget, null>, size: number) {
    patch((d) => {
      if (target === 'name') d.name.fontSize = size;
      else if (target === 'qr') d.qr.size = size;
      else {
        const extra = (d.extras ?? []).find((e) => e.id === extraIdOf(target));
        if (extra) extra.fontSize = size;
      }
      return d;
    });
  }

  /**
   * نص إضافي جديد. بلا إحداثيات يُوضع أعلى الدعوة حيث تكون الخلفية عادةً
   * أهدأ؛ ومع إحداثيات يُوضع حيث ضغط المستخدم بالضبط.
   */
  function addExtra(at?: { x: number; y: number }) {
    const id = crypto.randomUUID().slice(0, 8);
    patch((d) => {
      const extras = d.extras ?? [];
      extras.push({
        id,
        label: `نص ${extras.length + 1}`,
        text: 'نتشرّف بدعوتكم',
        x: at ? at.x : 0.5,
        y: at ? at.y : 0.28 + extras.length * 0.06,
        fontFamily: d.name.fontFamily,
        fontSize: 0.045,
        color: d.name.color,
        weight: 600,
        align: 'center',
        direction: 'rtl',
        lineHeight: 1.35,
        letterSpacing: 0,
        shadow: false,
      });
      d.extras = extras;
      return d;
    });
    setSelected(`extra:${id}`);
    setPlacing(false);
  }

  function updateExtra(id: string, patchLayer: Partial<TextLayer>) {
    patch((d) => {
      const extra = (d.extras ?? []).find((e) => e.id === id);
      if (extra) Object.assign(extra, patchLayer);
      return d;
    });
  }

  function removeExtra(id: string) {
    patch((d) => {
      d.extras = (d.extras ?? []).filter((e) => e.id !== id);
      return d;
    });
    setSelected('name');
  }

  function applyTemplate(template: TemplateRow) {
    const merged = mergeDesign({
      ...template.config,
      source: 'template',
      backgroundUrl: template.background_url,
    });
    // نحافظ على تخصيصات المستخدم للباركود إن سبق وعدّلها
    clearImageCache();
    setTemplateId(template.id);
    setSaved(false);
    setDesign(merged);
    setMode('template');
  }

  function applyUpload(url: string, width: number, height: number) {
    clearImageCache();
    setTemplateId(null);
    setSaved(false);
    setDesign((d) => ({
      ...d,
      source: 'upload',
      backgroundUrl: url,
      width,
      height,
    }));
    setMode('upload');
  }

  function onSave() {
    setError(null);
    startTransition(async () => {
      const res = await saveDesign(event.id, design, templateId);
      if (!res.ok) {
        setError(res.error ?? 'تعذّر الحفظ.');
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  const activeLayer = selected === 'qr' ? 'qr' : 'name';

  // الأوزان المتاحة في الخط المختار — يحدّد إن كان لعنصر السُمك معنى أصلاً
  const nameWeights =
    fontOptions.find((f) => f.family === design.name.fontFamily)?.weights ?? [400, 700];

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:pb-0">
      {/* ===== المعاينة ===== */}
      {/*
        min-w-0 ضروري لا تجميلي.

        عناصر الشبكة تأخذ min-width: auto افتراضياً، أي أنها ترفض أن
        تضيق دون عرض محتواها. فيكفي عنصر واحد عريض بالداخل — صفّ خطوط
        لا يلتفّ مثلاً — ليتمدّد العمود، ويتجاوز عرض الصفحة عرض الشاشة،
        فيصغّر المتصفح التخطيط كله ليُظهره. النتيجة: الصفحة كاملة تنكمش
        في شريط ضيّق، وهو ما ظهر على الجوال.
      */}
      <div className="min-w-0 lg:order-2">
        <div className="lg:sticky lg:top-[92px]">
          <InvitationPreview
            design={design}
            sampleCode={SAMPLE_CODE}
            onMove={onMove}
            onResize={onResize}
            selected={selected}
            onSelect={setSelected}
            placing={placing}
            onPlace={(x, y) => addExtra({ x, y })}
            picking={picking !== null}
            onPick={(hex) => {
              patch((d) => {
                if (picking === 'name') d.name.color = hex;
                else if (picking === 'qr-fg') d.qr.foreground = hex;
                else if (picking === 'qr-bg') d.qr.background = hex;
                return d;
              });
              setPicking(null);
            }}
          />
          <p className="mt-3 text-center text-xs leading-6 text-ink-faint">
            اسحب الإطار بإصبع لتحريكه، وباستخدام إصبعين للتكبير والتصغير.
            <br className="sm:hidden" />
            <span className="hidden sm:inline"> </span>
            على الحاسب: الأسهم للتحريك و + و − للحجم.
          </p>

          {saved && (
            <Alert tone="success" className="mt-4">
              تم حفظ التصميم.
            </Alert>
          )}

          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}

          {/* على الحاسب الأزرار هنا تحت المعاينة؛ وعلى الجوال في شريط ثابت أسفل الشاشة */}
          <div className="mt-4 hidden flex-wrap items-center gap-2 lg:flex">
            <Button onClick={onSave} loading={pending} size="lg" className="flex-1">
              حفظ التصميم
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => router.push(`/dashboard/events/${event.id}/guests`)}
            >
              المدعوون
              <Icon name="arrow" className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ===== أدوات التحكم ===== */}
      <div className="min-w-0 space-y-5 lg:order-1">
        {/* اختيار مصدر التصميم */}
        <Card>
          {/*
            دعوتك أولاً.

            المنصة تضيف باركود دخول فريد إلى دعوة جاهزة عند صاحبها —
            هذي قيمتها. والقوالب مخرجٌ لمن لا دعوة عنده، لا الطريق
            الأصلي. وتقديم «قوالب جاهزة» كان يوحي بعكس ذلك: أن عليه أن
            يصمّم دعوته هنا من الصفر.
          */}
          <CardHeader
            title="دعوتك"
            description="ارفع تصميم دعوتك الجاهز ونضيف عليه الباركود — أو ابدأ من قالب لو ما عندك تصميم."
          />
          <CardBody>
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-sand-100 p-1.5">
              {(
                [
                  { key: 'upload', label: 'ارفع دعوتي', icon: 'upload' },
                  { key: 'template', label: 'ابدأ من قالب', icon: 'palette' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMode(tab.key)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all duration-200',
                    mode === tab.key
                      ? 'bg-surface text-grape-600 shadow-soft'
                      : 'text-ink-soft hover:text-ink',
                  )}
                >
                  <Icon name={tab.icon} className="h-4 w-4" />
                  {tab.label}
                </button>
              ))}
            </div>

            {mode === 'template' ? (
              <TemplatePicker
                templates={templates}
                categories={categories}
                selectedId={templateId}
                onSelect={applyTemplate}
              />
            ) : (
              <UploadDesign
                userId={userId}
                currentUrl={design.source === 'upload' ? design.backgroundUrl : null}
                onUploaded={applyUpload}
              />
            )}
          </CardBody>
        </Card>

        {/* نص اسم المدعو */}
        <Card>
          <CardHeader
            title="نص اسم المدعو"
            description="هذا النص يُستبدل باسم كل مدعو عند التوليد."
            action={
              <button
                type="button"
                onClick={() => setSelected('name')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-bold transition-colors',
                  activeLayer === 'name'
                    ? 'bg-grape-500 text-white'
                    : 'bg-sand-100 text-ink-soft hover:bg-sand-200',
                )}
              >
                تحديد
              </button>
            }
          />
          <CardBody className="space-y-4">
            <Field label="نص المعاينة" hint="للمعاينة فقط — لا يظهر في الدعوات النهائية">
              <Input
                value={design.name.sample}
                onChange={(e) =>
                  patch((d) => {
                    d.name.sample = e.target.value;
                    return d;
                  })
                }
                placeholder="اسم المدعو"
              />
            </Field>

            <Field label="الخط">
              <FontPicker
                fonts={fontOptions}
                value={design.name.fontFamily}
                sample={design.name.sample || 'اسم المدعو'}
                onChange={(family) =>
                  patch((d) => {
                    d.name.fontFamily = family;
                    const font = fontOptions.find((f) => f.family === family);
                    // نضبط الوزن على أقرب وزن متاح في الخط الجديد
                    if (font && !font.weights.includes(d.name.weight)) {
                      d.name.weight = font.weights.includes(700) ? 700 : font.weights[0];
                    }
                    return d;
                  })
                }
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              {/*
                السُمك يظهر فقط حين يوجد أكثر من خيار فعلاً.
                خطٌّ بوزن واحد كان يعرض قائمة بخيار وحيد لا يفعل شيئاً —
                عنصر يشغل مساحة ويوحي بتحكّم غير موجود.
              */}
              {nameWeights.length > 1 && (
                <Field label="سُمك الخط">
                  <div className="grid grid-cols-2 gap-2 rounded-2xl bg-sand-100 p-1.5">
                    {[
                      { w: nameWeights.find((w) => w <= 500) ?? nameWeights[0], label: 'عادي' },
                      {
                        w: nameWeights.find((w) => w >= 600) ?? nameWeights[nameWeights.length - 1],
                        label: 'عريض',
                      },
                    ].map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() =>
                          patch((d) => {
                            d.name.weight = option.w;
                            return d;
                          })
                        }
                        style={{ fontWeight: option.w }}
                        className={cn(
                          'rounded-xl py-2 text-sm transition-all',
                          design.name.weight === option.w
                            ? 'bg-surface text-ink shadow-soft'
                            : 'text-ink-soft',
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Field>
              )}

              <Field label="المحاذاة">
                <Select
                  value={design.name.align}
                  onChange={(e) =>
                    patch((d) => {
                      d.name.align = e.target.value as 'center' | 'right' | 'left';
                      return d;
                    })
                  }
                >
                  <option value="center">توسيط</option>
                  <option value="right">لليمين</option>
                  <option value="left">لليسار</option>
                </Select>
              </Field>
            </div>

            <Slider
              label="حجم الخط"
              min={1}
              max={20}
              step={0.5}
              value={design.name.fontSize * 100}
              display={`${(design.name.fontSize * 100).toFixed(1)}٪ من عرض التصميم`}
              onChange={(v) =>
                patch((d) => {
                  d.name.fontSize = v / 100;
                  return d;
                })
              }
            />

            <EyedropperButton
              active={picking === 'name'}
              onToggle={() => setPicking((p) => (p === 'name' ? null : 'name'))}
            />

            <Slider
              label="شفافية النص"
              min={10}
              max={100}
              step={5}
              value={Math.round((design.name.opacity ?? 1) * 100)}
              display={`${Math.round((design.name.opacity ?? 1) * 100)}٪`}
              onChange={(v) =>
                patch((d) => {
                  d.name.opacity = v / 100;
                  return d;
                })
              }
            />

            <ColorInput
              label="لون الخط"
              value={design.name.color}
              onChange={(v) =>
                patch((d) => {
                  d.name.color = v;
                  return d;
                })
              }
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="محاذاة الاسم">
                <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-sand-100 p-1.5">
                  {(
                    [
                      { value: 'right', label: 'يمين' },
                      { value: 'center', label: 'توسيط' },
                      { value: 'left', label: 'يسار' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        patch((d) => {
                          d.name.align = opt.value;
                          return d;
                        })
                      }
                      className={cn(
                        'rounded-xl py-2 text-xs font-bold transition-all',
                        design.name.align === opt.value
                          ? 'bg-surface text-grape-600 shadow-soft'
                          : 'text-ink-soft hover:text-ink',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="اتجاه الكتابة" hint="للأسماء الإنجليزية">
                <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-sand-100 p-1.5">
                  {(
                    [
                      { value: 'rtl', label: 'عربي ←' },
                      { value: 'ltr', label: '→ English' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        patch((d) => {
                          d.name.direction = opt.value;
                          return d;
                        })
                      }
                      className={cn(
                        'rounded-xl py-2 text-xs font-bold transition-all',
                        (design.name.direction ?? 'rtl') === opt.value
                          ? 'bg-surface text-grape-600 shadow-soft'
                          : 'text-ink-soft hover:text-ink',
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            <Switch
              checked={Boolean(design.name.shadow)}
              onChange={(v) =>
                patch((d) => {
                  d.name.shadow = v;
                  return d;
                })
              }
              label="ظل خفيف خلف النص"
              description="يساعد على وضوح الاسم فوق الخلفيات المزخرفة."
            />
          </CardBody>
        </Card>

        {/* نصوص إضافية */}
        <Card>
          <CardHeader
            title="نصوص إضافية"
            description="تهنئة أو اسم المضيف أو أي نص ثابت يظهر على كل الدعوات."
            action={
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={placing ? 'primary' : 'secondary'}
                  onClick={() => setPlacing((v) => !v)}
                >
                  {placing ? 'ألغِ التحديد' : 'ضع نصاً بالضغط'}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => addExtra()}>
                  <Icon name="plus" className="h-4 w-4" />
                  إضافة
                </Button>
              </div>
            }
          />
          <CardBody className="space-y-5">
            {(design.extras ?? []).length === 0 ? (
              <p className="text-sm leading-7 text-ink-soft">
                ما أضفت نصوصاً إضافية. النص الإضافي ثابت على كل الدعوات — بعكس اسم المدعو
                الذي يتغيّر لكل واحد.
              </p>
            ) : (
              (design.extras ?? []).map((extra) => {
                const active = selected === `extra:${extra.id}`;
                return (
                  <div
                    key={extra.id}
                    className={cn(
                      'space-y-4 rounded-2xl border-2 p-4 transition-colors',
                      active ? 'border-mint-400 bg-mint-50/40' : 'border-sand-200',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelected(`extra:${extra.id}`)}
                        className={cn(
                          'rounded-full px-3 py-1 text-xs font-bold transition-colors',
                          active ? 'bg-mint-500 text-white' : 'bg-sand-100 text-ink-soft hover:bg-sand-200',
                        )}
                      >
                        {active ? 'محدَّد' : 'تحديد'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeExtra(extra.id)}
                        className="rounded-full px-3 py-1 text-xs font-bold text-coral-600 transition-colors hover:bg-coral-50"
                      >
                        حذف
                      </button>
                    </div>

                    <Field
                      label="النص"
                      htmlFor={`t-${extra.id}`}
                      hint="اضغط Enter لسطر جديد"
                    >
                      <Textarea
                        id={`t-${extra.id}`}
                        rows={2}
                        value={extra.text}
                        onChange={(e) => updateExtra(extra.id, { text: e.target.value })}
                        placeholder={'مثال: نتشرّف بدعوتكم\nلحضور حفل الزفاف'}
                      />
                    </Field>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="محاذاة النص">
                        <div className="grid grid-cols-3 gap-1.5 rounded-2xl bg-sand-100 p-1.5">
                          {(
                            [
                              { value: 'right', label: 'يمين' },
                              { value: 'center', label: 'توسيط' },
                              { value: 'left', label: 'يسار' },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateExtra(extra.id, { align: opt.value })}
                              className={cn(
                                'rounded-xl py-2 text-xs font-bold transition-all',
                                extra.align === opt.value
                                  ? 'bg-surface text-grape-600 shadow-soft'
                                  : 'text-ink-soft hover:text-ink',
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </Field>

                      <Field label="اتجاه الكتابة" hint="يهم عند خلط الأرقام أو الإنجليزية">
                        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-sand-100 p-1.5">
                          {(
                            [
                              { value: 'rtl', label: 'عربي ←' },
                              { value: 'ltr', label: '→ English' },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => updateExtra(extra.id, { direction: opt.value })}
                              className={cn(
                                'rounded-xl py-2 text-xs font-bold transition-all',
                                (extra.direction ?? 'rtl') === opt.value
                                  ? 'bg-surface text-grape-600 shadow-soft'
                                  : 'text-ink-soft hover:text-ink',
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </Field>
                    </div>

                    <Slider
                      label="تباعد الأسطر"
                      min={90}
                      max={220}
                      step={5}
                      value={(extra.lineHeight ?? 1.35) * 100}
                      display={`${Math.round((extra.lineHeight ?? 1.35) * 100)}٪`}
                      onChange={(v) => updateExtra(extra.id, { lineHeight: v / 100 })}
                    />

                    <Field label="الخط" htmlFor={`f-${extra.id}`}>
                      <Select
                        id={`f-${extra.id}`}
                        value={extra.fontFamily}
                        onChange={(e) => updateExtra(extra.id, { fontFamily: e.target.value })}
                      >
                        {fontOptions.map((f) => (
                          <option key={f.family} value={f.family}>
                            {f.label}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Slider
                      label="حجم الخط"
                      min={1}
                      max={20}
                      step={0.1}
                      value={extra.fontSize * 100}
                      display={`${(extra.fontSize * 100).toFixed(1)}٪ من عرض التصميم`}
                      onChange={(v) => updateExtra(extra.id, { fontSize: v / 100 })}
                    />

                    <ColorInput
                      label="لون النص"
                      value={extra.color}
                      onChange={(v) => updateExtra(extra.id, { color: v })}
                    />

                    <Switch
                      checked={Boolean(extra.shadow)}
                      onChange={(v) => updateExtra(extra.id, { shadow: v })}
                      label="ظل خفيف خلف النص"
                      description="يساعد على وضوحه فوق الخلفيات المزخرفة."
                    />
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>

        {/*
          في وضع تأكيد الحضور لا باركود في الصورة أصلاً — يُعرض للمدعو
          في صفحته بعد أن يؤكّد. وإبقاء ضبطه هنا يعني ساعةً يقضيها
          صاحب المناسبة في تلوين شيءٍ لن يُطبع.
        */}
        {event.rsvp_enabled ? (
          <Card>
            <CardHeader title="الباركود" description="مكانه تغيّر مع تفعيل تأكيد الحضور." />
            <CardBody>
              <p className="rounded-2xl bg-sand-50 px-4 py-3 text-sm leading-7 text-ink-soft">
                تأكيد الحضور مفعّل لهذي المناسبة، فالباركود ما يُرسم داخل الصورة —
                يطلع للمدعو في صفحة دعوته بعد ما يأكّد حضوره. صمّم الدعوة بدون ما
                تحسب له مكان.
              </p>
              <Link
                href={`/dashboard/events/${event.id}/settings`}
                className="mt-3 inline-block text-sm font-bold text-grape-600"
              >
                إطفاء تأكيد الحضور من الإعدادات ←
              </Link>
            </CardBody>
          </Card>
        ) : (
        <Card>
          <CardHeader
            title="شكل الباركود"
            description="حجمه ولونه وخلفيته — مع تنبيه إذا صار المسح غير موثوق."
            action={
              <button
                type="button"
                onClick={() => setSelected('qr')}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-bold transition-colors',
                  activeLayer === 'qr'
                    ? 'bg-coral-500 text-white'
                    : 'bg-sand-100 text-ink-soft hover:bg-sand-200',
                )}
              >
                تحديد
              </button>
            }
          />
          <CardBody className="space-y-4">
            <Switch
              checked={design.qr.visible}
              onChange={(v) =>
                patch((d) => {
                  d.qr.visible = v;
                  return d;
                })
              }
              label="إظهار الباركود على الدعوة"
              description="إخفاؤه يعني أن المدعو لن يملك ما يُمسح عند الباب."
            />

            {design.qr.visible && (
              <>
                <Slider
                  label="حجم الباركود"
                  min={8}
                  max={55}
                  step={1}
                  value={design.qr.size * 100}
                  display={`${Math.round(design.qr.size * 100)}٪ من عرض التصميم`}
                  onChange={(v) =>
                    patch((d) => {
                      d.qr.size = v / 100;
                      return d;
                    })
                  }
                />

                <ColorInput
                  label="لون الباركود"
                  value={design.qr.foreground}
                  onChange={(v) =>
                    patch((d) => {
                      d.qr.foreground = v;
                      return d;
                    })
                  }
                />

                <ColorInput
                  label="خلفية الباركود"
                  value={design.qr.background}
                  allowTransparent
                  onChange={(v) =>
                    patch((d) => {
                      d.qr.background = v;
                      return d;
                    })
                  }
                />

                <Slider
                  label="الهامش حول الباركود"
                  min={0}
                  max={6}
                  step={1}
                  value={design.qr.margin}
                  display={`${design.qr.margin} وحدة`}
                  onChange={(v) =>
                    patch((d) => {
                      d.qr.margin = v;
                      return d;
                    })
                  }
                />

                <Switch
                  checked={design.qr.rounded}
                  onChange={(v) =>
                    patch((d) => {
                      d.qr.rounded = v;
                      return d;
                    })
                  }
                  label="زوايا دائرية"
                  description="شكل أنعم — مستوى تصحيح الأخطاء العالي يحافظ على قابلية المسح."
                />

                <Alert
                  tone={
                    contrast.risk === 'safe'
                      ? 'success'
                      : contrast.risk === 'warning'
                        ? 'warning'
                        : 'danger'
                  }
                  title={`نسبة التباين: ${contrast.ratio.toFixed(1)}:1`}
                >
                  {contrast.message}
                </Alert>
              </>
            )}
          </CardBody>
        </Card>
        )}
      </div>

      {/*
        شريط ثابت أسفل الشاشة على الجوال.

        كانت أزرار الحفظ والمدعوين تقع تحت المعاينة مباشرة — أي في منتصف
        صفحة طويلة — فتتوسّط الأدوات ويبدو كأن الصفحة انتهت عندها. مكانها
        الطبيعي أسفل الشاشة دائماً: الحفظ في متناول الإبهام مهما نزل
        المستخدم في الأدوات.
      */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-sand-200 bg-canvas/95 p-3 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <Button onClick={onSave} loading={pending} size="lg" className="flex-1">
            حفظ التصميم
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => router.push(`/dashboard/events/${event.id}/guests`)}
          >
            المدعوون
            <Icon name="arrow" className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * زرّ القطّارة.
 *
 * منتقي ألوان النظام يعرض ألوان الشاشة كلها، والمستخدم يريد لوناً من
 * تصميمه هو — ذهب الإطار أو خضرة الخلفية. وعلى الجوال لا توجد قطّارة
 * نظام أصلاً، فالمخرج الوحيد كان تخمين الرمز اللوني.
 */
function EyedropperButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-2xl border-2 py-2.5 text-sm font-bold transition-all',
        active
          ? 'border-grape-500 bg-grape-50 text-grape-600'
          : 'border-sand-200 text-ink-soft hover:border-sand-400',
      )}
    >
      <Icon name="palette" className="h-4 w-4" />
      {active ? 'اضغط على التصميم لالتقاط اللون' : 'اختر لوناً من التصميم'}
    </button>
  );
}
