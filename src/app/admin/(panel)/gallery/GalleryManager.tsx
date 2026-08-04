'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, Select, Switch, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmptyState } from '@/components/ui/Misc';
import { AssetUpload } from '@/components/admin/AssetUpload';
import { deleteGalleryItem, saveGalleryItem } from '@/lib/actions/admin';
import { EVENT_TYPES } from '@/lib/design/defaults';
import { EVENT_TYPE_LABELS } from '@/lib/utils/format';
import type { GalleryItem } from '@/lib/types/database';

export function GalleryManager({ items }: { items: GalleryItem[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<GalleryItem | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function remove(item: GalleryItem) {
    if (!confirm(`حذف «${item.title}» من معرض الأعمال؟`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteGalleryItem(item.id);
      if (!res.ok) setError(res.error ?? 'تعذّر الحذف.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-black text-ink">معرض الأعمال</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            نماذج تسويقية تظهر لكل زائر في صفحة «أعمالنا» — حتى قبل التسجيل.
          </p>
        </div>
        <Button onClick={() => setEditing('new')}>
          <Icon name="plus" className="h-4 w-4" />
          عمل جديد
        </Button>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {items.length === 0 ? (
        <EmptyState
          icon="🖼️"
          title="المعرض فاضي"
          description="أضف نماذج من دعوات أُنجزت فعلياً عبر بكجات لإقناع الزوار."
          action={<Button onClick={() => setEditing('new')}>إضافة عمل</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id} className="overflow-hidden p-0">
              <div className="relative aspect-[3/4] bg-sand-100">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.image_url} alt={item.title} className="h-full w-full object-cover" />
                {!item.is_published && (
                  <span className="absolute right-3 top-3">
                    <Badge tone="coral">غير منشور</Badge>
                  </span>
                )}
              </div>
              <div className="p-4">
                <h3 className="truncate font-bold text-ink">{item.title}</h3>
                <p className="mt-0.5 text-xs text-ink-faint">
                  {item.event_type ? (EVENT_TYPE_LABELS[item.event_type] ?? item.event_type) : 'عام'}{' '}
                  · ترتيب {item.sort_order}
                </p>
                {item.description && (
                  <p className="mt-1.5 line-clamp-2 text-xs leading-6 text-ink-soft">
                    {item.description}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setEditing(item)}>
                    تعديل
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-coral-600"
                    onClick={() => remove(item)}
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
        <GalleryModal
          item={editing === 'new' ? null : editing}
          nextSort={(items.at(-1)?.sort_order ?? 0) + 10}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function GalleryModal({
  item,
  nextSort,
  onClose,
}: {
  item: GalleryItem | null;
  nextSort: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(item?.title ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [imageUrl, setImageUrl] = useState(item?.image_url ?? '');
  const [eventType, setEventType] = useState(item?.event_type ?? '');
  const [isPublished, setIsPublished] = useState(item?.is_published ?? true);
  const [sortOrder, setSortOrder] = useState(item?.sort_order ?? nextSort);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await saveGalleryItem({
        id: item?.id,
        title,
        description: description.trim() || null,
        imageUrl,
        eventType: eventType || null,
        isPublished,
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
    <Modal open onClose={onClose} title={item ? 'تعديل العمل' : 'عمل جديد'}>
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <AssetUpload
          bucket="gallery"
          label="صورة العمل"
          hint="يُفضّل مقاس عمودي بجودة عالية"
          value={imageUrl || null}
          onUploaded={(url) => setImageUrl(url)}
        />

        <Field label="العنوان" required>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="مثال: دعوة زواج — تصميم ذهبي"
            required
          />
        </Field>

        <Field label="الوصف" hint="اختياري — سطر أو سطرين">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="نوع المناسبة">
            <Select value={eventType} onChange={(e) => setEventType(e.target.value)}>
              <option value="">عام</option>
              {EVENT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="ترتيب العرض" hint="الأصغر يظهر أولاً">
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(Number(e.target.value))}
            />
          </Field>
        </div>

        <Switch
          checked={isPublished}
          onChange={setIsPublished}
          label="منشور في الصفحة العامة"
          description="أطفئه لإخفاء العمل مؤقتاً."
        />

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit" loading={pending} disabled={!imageUrl}>
            حفظ
          </Button>
        </div>
      </form>
    </Modal>
  );
}
