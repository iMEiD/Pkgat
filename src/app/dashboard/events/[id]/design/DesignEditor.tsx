'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ColorInput, Field, Input, Select, Slider, Switch } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { InvitationPreview, type DragTarget } from '@/components/design/InvitationPreview';
import { TemplatePicker } from '@/components/design/TemplatePicker';
import { UploadDesign } from '@/components/design/UploadDesign';
import { saveDesign } from '@/lib/actions/events';
import { mergeDesign } from '@/lib/design/defaults';
import { FONTS } from '@/lib/design/fonts';
import { checkQrContrast } from '@/lib/design/contrast';
import { clearImageCache } from '@/lib/design/render';
import type {
  DesignConfig,
  EventRow,
  TemplateCategory,
  TemplateRow,
} from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

const SAMPLE_CODE = '00000000-0000-4000-8000-000000000000';

type Mode = 'template' | 'upload';

export function DesignEditor({
  event,
  userId,
  templates,
  categories,
}: {
  event: EventRow;
  userId: string;
  templates: TemplateRow[];
  categories: TemplateCategory[];
}) {
  const router = useRouter();
  const [design, setDesign] = useState<DesignConfig>(() => mergeDesign(event.design));
  const [templateId, setTemplateId] = useState<string | null>(event.template_id);
  const [mode, setMode] = useState<Mode>(design.source === 'upload' ? 'upload' : 'template');
  const [selected, setSelected] = useState<DragTarget>('name');
  const [saved, setSaved] = useState(false);
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

  function onMove(target: 'name' | 'qr', x: number, y: number) {
    patch((d) => {
      if (target === 'name') {
        d.name.x = x;
        d.name.y = y;
      } else {
        d.qr.x = x;
        d.qr.y = y;
      }
      return d;
    });
  }

  /** التكبير بإصبعين — المعاينة ترسل الحجم النهائي مضبوطاً ضمن الحدود */
  function onResize(target: 'name' | 'qr', size: number) {
    patch((d) => {
      if (target === 'name') d.name.fontSize = size;
      else d.qr.size = size;
      return d;
    });
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      {/* ===== المعاينة ===== */}
      <div className="lg:order-2">
        <div className="lg:sticky lg:top-[92px]">
          <InvitationPreview
            design={design}
            sampleCode={SAMPLE_CODE}
            onMove={onMove}
            onResize={onResize}
            selected={selected}
            onSelect={setSelected}
          />
          <p className="mt-3 text-center text-xs leading-6 text-ink-faint">
            اسحب الإطار بإصبع لتحريكه، وباستخدام إصبعين للتكبير والتصغير.
            <br className="sm:hidden" />
            <span className="hidden sm:inline"> </span>
            على الحاسب: الأسهم للتحريك و + و − للحجم.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
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

          {saved && (
            <Alert tone="success" className="mt-3">
              تم حفظ التصميم.
            </Alert>
          )}
          {error && (
            <Alert tone="danger" className="mt-3">
              {error}
            </Alert>
          )}
        </div>
      </div>

      {/* ===== أدوات التحكم ===== */}
      <div className="space-y-5 lg:order-1">
        {/* اختيار مصدر التصميم */}
        <Card>
          <CardHeader title="خلفية الدعوة" description="اختر قالباً جاهزاً أو ارفع تصميمك الخاص." />
          <CardBody>
            <div className="mb-4 grid grid-cols-2 gap-2 rounded-2xl bg-sand-100 p-1.5">
              {(
                [
                  { key: 'template', label: 'قوالب جاهزة', icon: 'palette' },
                  { key: 'upload', label: 'تصميمي الخاص', icon: 'upload' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setMode(tab.key)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-all duration-200',
                    mode === tab.key
                      ? 'bg-white text-grape-600 shadow-soft'
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
              <Select
                value={design.name.fontFamily}
                onChange={(e) =>
                  patch((d) => {
                    d.name.fontFamily = e.target.value;
                    const font = FONTS.find((f) => f.family === e.target.value);
                    // نضبط الوزن على أقرب وزن متاح في الخط الجديد
                    if (font && !font.weights.includes(d.name.weight)) {
                      d.name.weight = font.weights.includes(700) ? 700 : font.weights[0];
                    }
                    return d;
                  })
                }
              >
                {FONTS.map((f) => (
                  <option key={f.family} value={f.family}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="سُمك الخط">
                <Select
                  value={design.name.weight}
                  onChange={(e) =>
                    patch((d) => {
                      d.name.weight = Number(e.target.value);
                      return d;
                    })
                  }
                >
                  {(FONTS.find((f) => f.family === design.name.fontFamily)?.weights ?? [400, 700]).map(
                    (w) => (
                      <option key={w} value={w}>
                        {w}
                      </option>
                    ),
                  )}
                </Select>
              </Field>

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

        {/* الباركود */}
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
      </div>
    </div>
  );
}
