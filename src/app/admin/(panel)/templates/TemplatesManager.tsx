'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { ColorInput, Field, Input, Select, Slider, Switch } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/Misc';
import { AssetUpload } from '@/components/admin/AssetUpload';
import { InvitationPreview } from '@/components/design/InvitationPreview';
import {
  deleteTemplate,
  deleteTemplateCategory,
  saveTemplate,
  saveTemplateCategory,
} from '@/lib/actions/admin';
import { mergeDesign } from '@/lib/design/defaults';
import { FONTS } from '@/lib/design/fonts';
import type { DesignConfig, TemplateCategory, TemplateRow } from '@/lib/types/database';

const SAMPLE_CODE = '00000000-0000-4000-8000-000000000000';

export function TemplatesManager({
  templates,
  categories,
}: {
  templates: TemplateRow[];
  categories: TemplateCategory[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<TemplateRow | 'new' | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  function remove(template: TemplateRow) {
    if (!confirm(`حذف قالب «${template.name}»؟ المناسبات التي تستخدمه تحتفظ بتصميمها.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteTemplate(template.id);
      if (!res.ok) setError(res.error ?? 'تعذّر الحذف.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">القوالب الجاهزة</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            تظهر للمستخدمين في خطوة اختيار التصميم عند إنشاء المناسبة.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setCategoriesOpen(true)}>
            التصنيفات ({categories.length})
          </Button>
          <Button onClick={() => setEditing('new')}>
            <Icon name="plus" className="h-4 w-4" />
            قالب جديد
          </Button>
        </div>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {templates.length === 0 ? (
        <EmptyState
          icon="🎨"
          title="ما فيه قوالب بعد"
          description="أضف أول قالب — سيظهر مباشرة لكل المستخدمين في خطوة التصميم."
          action={<Button onClick={() => setEditing('new')}>إضافة قالب</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((template) => (
            <Card key={template.id} className="overflow-hidden p-0">
              <div className="relative aspect-[3/4] bg-sand-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={template.thumbnail_url || template.background_url}
                  alt={template.name}
                  className="h-full w-full object-cover"
                />
                {!template.is_active && (
                  <span className="absolute right-3 top-3">
                    <Badge tone="coral">مخفي</Badge>
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="truncate font-bold text-ink">{template.name}</h3>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {template.category_id
                    ? (categoryMap.get(template.category_id)?.name ?? 'بدون تصنيف')
                    : 'بدون تصنيف'}{' '}
                  · ترتيب {template.sort_order}
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(template)}>
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-coral-600"
                    onClick={() => remove(template)}
                    disabled={pending}
                  >
                    حذف
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <TemplateModal
          template={editing === 'new' ? null : editing}
          categories={categories}
          onClose={() => setEditing(null)}
        />
      )}

      {categoriesOpen && (
        <CategoriesModal categories={categories} onClose={() => setCategoriesOpen(false)} />
      )}
    </div>
  );
}

function TemplateModal({
  template,
  categories,
  onClose,
}: {
  template: TemplateRow | null;
  categories: TemplateCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(template?.name ?? '');
  const [categoryId, setCategoryId] = useState(template?.category_id ?? '');
  const [isActive, setIsActive] = useState(template?.is_active ?? true);
  const [sortOrder, setSortOrder] = useState(template?.sort_order ?? 0);
  const [design, setDesign] = useState<DesignConfig>(() =>
    mergeDesign({ ...template?.config, backgroundUrl: template?.background_url ?? null }),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function patch(updater: (d: DesignConfig) => DesignConfig) {
    setDesign((d) => updater(structuredClone(d)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!design.backgroundUrl) {
      setError('ارفع صورة خلفية القالب أولاً.');
      return;
    }

    startTransition(async () => {
      const res = await saveTemplate({
        id: template?.id,
        name,
        categoryId: categoryId || null,
        backgroundUrl: design.backgroundUrl!,
        thumbnailUrl: template?.thumbnail_url ?? null,
        // نخزّن إعدادات التصميم كاملة ليرثها المستخدم عند اختيار القالب
        config: design,
        isActive,
        sortOrder,
      });

      if (!res.ok) {
        setError(res.error ?? 'تعذّر الحفظ.');
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={template ? 'تعديل القالب' : 'قالب جديد'}
      description="حدّد الخلفية وموضع اسم المدعو والباركود — هذي القيم تصير الافتراضية للمستخدم."
    >
      <form onSubmit={submit} className="space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="grid gap-5 md:grid-cols-2">
          <div className="space-y-4">
            <Field label="اسم القالب" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </Field>

            <Field label="التصنيف">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">بدون تصنيف</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <AssetUpload
              bucket="templates"
              label="خلفية القالب"
              hint="يُفضّل مقاس عمودي ١٠٨٠×١٩٢٠"
              value={design.backgroundUrl}
              onUploaded={(url, width, height) =>
                patch((d) => {
                  d.backgroundUrl = url;
                  d.width = width;
                  d.height = height;
                  d.source = 'template';
                  return d;
                })
              }
            />

            <Field label="ترتيب العرض" hint="الأصغر يظهر أولاً">
              <Input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </Field>

            <Switch
              checked={isActive}
              onChange={setIsActive}
              label="ظاهر للمستخدمين"
              description="أطفئه لإخفاء القالب مؤقتاً بدون حذفه."
            />
          </div>

          <div>
            <InvitationPreview
              design={design}
              sampleCode={SAMPLE_CODE}
              onMove={(target, x, y) =>
                patch((d) => {
                  if (target === 'name') {
                    d.name.x = x;
                    d.name.y = y;
                  } else {
                    d.qr.x = x;
                    d.qr.y = y;
                  }
                  return d;
                })
              }
              onResize={(target, size) =>
                patch((d) => {
                  if (target === 'name') d.name.fontSize = size;
                  else d.qr.size = size;
                  return d;
                })
              }
            />
            <p className="mt-2 text-center text-xs leading-6 text-ink-faint">
              اسحب بإصبع للتحريك، وبإصبعين للتكبير والتصغير
            </p>
          </div>
        </div>

        <div className="space-y-4 border-t border-sand-200 pt-5">
          <h3 className="text-sm font-bold text-ink">الإعدادات الافتراضية للنص</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الخط">
              <Select
                value={design.name.fontFamily}
                onChange={(e) =>
                  patch((d) => {
                    d.name.fontFamily = e.target.value;
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
          </div>

          <Slider
            label="حجم الخط"
            min={1}
            max={20}
            step={0.5}
            value={design.name.fontSize * 100}
            display={`${(design.name.fontSize * 100).toFixed(1)}٪`}
            onChange={(v) =>
              patch((d) => {
                d.name.fontSize = v / 100;
                return d;
              })
            }
          />

          <Slider
            label="حجم الباركود"
            min={8}
            max={55}
            step={1}
            value={design.qr.size * 100}
            display={`${Math.round(design.qr.size * 100)}٪`}
            onChange={(v) =>
              patch((d) => {
                d.qr.size = v / 100;
                return d;
              })
            }
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" loading={pending}>
            حفظ القالب
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CategoriesModal({
  categories,
  onClose,
}: {
  categories: TemplateCategory[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await saveTemplateCategory({
        name,
        slug,
        sortOrder: (categories.at(-1)?.sort_order ?? 0) + 10,
      });
      if (!res.ok) {
        setError(res.error ?? 'تعذّر الحفظ.');
        return;
      }
      setName('');
      setSlug('');
      router.refresh();
    });
  }

  function remove(category: TemplateCategory) {
    if (!confirm(`حذف تصنيف «${category.name}»؟ قوالبه تصير بدون تصنيف.`)) return;
    startTransition(async () => {
      await deleteTemplateCategory(category.id);
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title="تصنيفات القوالب">
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <div className="space-y-2">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-sand-200 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{category.name}</p>
                <code dir="ltr" className="text-[11px] text-ink-faint">
                  {category.slug}
                </code>
              </div>
              <button
                type="button"
                onClick={() => remove(category)}
                disabled={pending}
                aria-label="حذف"
                className="rounded-lg p-1.5 text-ink-faint transition-colors hover:bg-coral-50 hover:text-coral-600"
              >
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="py-4 text-center text-sm text-ink-soft">ما فيه تصنيفات.</p>
          )}
        </div>

        <form onSubmit={add} className="space-y-3 border-t border-sand-200 pt-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="اسم التصنيف" required>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                }}
                placeholder="قوالب أعراس"
                required
              />
            </Field>
            <Field label="المعرّف" hint="إنجليزي بدون مسافات" required>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                dir="ltr"
                placeholder="wedding"
                required
              />
            </Field>
          </div>
          <Button type="submit" fullWidth loading={pending}>
            <Icon name="plus" className="h-4 w-4" />
            إضافة تصنيف
          </Button>
        </form>
      </div>
    </Modal>
  );
}
