'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Stat } from '@/components/ui/Misc';
import {
  adminCreateReview,
  adminUpdateReview,
  deleteReview,
  setReviewStatus,
} from '@/lib/actions/reviews';
import { formatDateTime, formatNumber } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { Review, ReviewStatus } from '@/lib/types/database';

const STATUS_LABELS: Record<ReviewStatus, string> = {
  pending: 'بانتظار المراجعة',
  published: 'منشور للزوار',
  hidden: 'غير منشور',
};

const STATUS_TONES: Record<ReviewStatus, 'sunny' | 'mint' | 'sand'> = {
  pending: 'sunny',
  published: 'mint',
  hidden: 'sand',
};

export function ReviewsInbox({ items }: { items: Review[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<'all' | ReviewStatus>('all');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Review | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(
    () => (filter === 'all' ? items : items.filter((r) => r.status === filter)),
    [items, filter],
  );

  const pendingCount = items.filter((r) => r.status === 'pending').length;
  const publishedCount = items.filter((r) => r.status === 'published').length;

  const average = publishedCount
    ? items.filter((r) => r.status === 'published').reduce((s, r) => s + r.rating, 0) /
      publishedCount
    : 0;

  function changeStatus(id: string, status: ReviewStatus) {
    setError(null);
    startTransition(async () => {
      const res = await setReviewStatus(id, status);
      if (!res.ok) setError(res.error ?? 'تعذّر التحديث.');
      else router.refresh();
    });
  }

  function remove(review: Review) {
    if (!confirm(`حذف تقييم «${review.author_name}» نهائياً؟`)) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteReview(review.id);
      if (!res.ok) setError(res.error ?? 'تعذّر الحذف.');
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-ink">التقييمات</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            آراء العملاء تصل هنا أولاً — ولا شيء يظهر في الصفحة الرئيسية إلا بموافقتك.
          </p>
        </div>
        <Button type="button" onClick={() => setCreating(true)}>
          <Icon name="plus" className="h-4 w-4" />
          تقييم من عندي
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <Stat label="الإجمالي" value={formatNumber(items.length)} tone="grape" />
        <Stat label="بانتظار مراجعتك" value={formatNumber(pendingCount)} tone="coral" />
        <Stat label="منشور للزوار" value={formatNumber(publishedCount)} tone="mint" />
        <Stat
          label="متوسط المنشور"
          value={publishedCount ? average.toFixed(1) : '—'}
          hint={publishedCount ? 'من ٥' : 'ما فيه منشور بعد'}
          tone="sunny"
        />
      </div>

      {publishedCount === 1 && (
        <Alert tone="warning">
          تقييم واحد منشور — والقسم ما يظهر في الرئيسية قبل تقييمين. انشر واحداً آخر أو أضف
          تقييماً من عندك.
        </Alert>
      )}

      {error && <Alert tone="danger">{error}</Alert>}

      <Select
        aria-label="تصفية"
        value={filter}
        onChange={(e) => setFilter(e.target.value as 'all' | ReviewStatus)}
        className="max-w-xs"
      >
        <option value="all">كل التقييمات</option>
        <option value="pending">بانتظار المراجعة</option>
        <option value="published">المنشورة</option>
        <option value="hidden">غير المنشورة</option>
      </Select>

      {filtered.length === 0 ? (
        <EmptyState
          icon="⭐"
          title="ما فيه تقييمات"
          description="لما يقيّم العملاء الخدمة من لوحاتهم بتوصل هنا — وتقدر تضيف تقييمات من عندك."
          action={
            <Button type="button" onClick={() => setCreating(true)}>
              أضف تقييماً
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {filtered.map((review) => (
            <ReviewRow
              key={review.id}
              review={review}
              pending={pending}
              onStatus={changeStatus}
              onEdit={() => setEditing(review)}
              onDelete={() => remove(review)}
            />
          ))}
        </div>
      )}

      {editing && <EditModal review={editing} onClose={() => setEditing(null)} />}
      {creating && <CreateModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function ReviewRow({
  review,
  pending,
  onStatus,
  onEdit,
  onDelete,
}: {
  review: Review;
  pending: boolean;
  onStatus: (id: string, status: ReviewStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONES[review.status]} dot>
            {STATUS_LABELS[review.status]}
          </Badge>
          {review.source === 'admin' && <Badge tone="sky">أضفته أنت</Badge>}
          <span className="text-xs text-ink-faint">{formatDateTime(review.created_at)}</span>
        </div>

        <div className="flex items-center gap-0.5" aria-label={`${review.rating} من ٥`}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Icon
              key={i}
              name="star"
              className={cn('h-4 w-4', i <= review.rating ? 'text-sunny-500' : 'text-sand-300')}
            />
          ))}
        </div>
      </div>

      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-8 text-ink">{review.body}</p>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-sand-200 pt-3 text-xs text-ink-soft">
        <span className="font-bold text-ink">{review.author_name}</span>
        {review.author_title && <span>{review.author_title}</span>}
        {review.sort_order !== 0 && <span>ترتيب العرض: {review.sort_order}</span>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {review.status !== 'published' && (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => onStatus(review.id, 'published')}
          >
            انشره للزوار
          </Button>
        )}
        {review.status === 'published' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => onStatus(review.id, 'hidden')}
          >
            اسحبه من الرئيسية
          </Button>
        )}
        {review.status !== 'hidden' && review.status !== 'published' && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => onStatus(review.id, 'hidden')}
          >
            لا تنشره
          </Button>
        )}
        <Button size="sm" variant="secondary" disabled={pending} onClick={onEdit}>
          تعديل
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-coral-600"
          disabled={pending}
          onClick={onDelete}
        >
          حذف
        </Button>
      </div>
    </Card>
  );
}

/** اختيار التقييم بالنجوم — نفس أداة العميل حتى لا يختلف المعنى */
function RatingPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <span className="mb-2 block text-sm font-bold text-ink">التقييم</span>
      <div className="flex items-center gap-1" role="radiogroup" aria-label="التقييم من ١ إلى ٥">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            aria-label={`${i} من ٥`}
            onClick={() => onChange(i)}
            className="rounded-lg p-1 transition-transform hover:scale-110 active:scale-95"
          >
            <Icon
              name="star"
              className={cn('h-7 w-7', i <= value ? 'text-sunny-500' : 'text-sand-300')}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

function EditModal({ review, onClose }: { review: Review; onClose: () => void }) {
  const router = useRouter();
  const [authorName, setAuthorName] = useState(review.author_name);
  const [authorTitle, setAuthorTitle] = useState(review.author_title ?? '');
  const [rating, setRating] = useState(review.rating);
  const [body, setBody] = useState(review.body);
  const [sortOrder, setSortOrder] = useState(String(review.sort_order));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await adminUpdateReview(review.id, {
        authorName,
        authorTitle,
        rating,
        body,
        sortOrder: Number(sortOrder) || 0,
      });
      if (!res.ok) return setError(res.error ?? 'تعذّر الحفظ.');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title="تعديل التقييم">
      <form onSubmit={save} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {review.source === 'customer' && (
          <Alert tone="warning">
            هذا التقييم كتبه عميل باسمه. تعديل نصّه يغيّر كلاماً منسوباً إليه — عدّل الصياغة
            بحذر، أو اكتفِ بعدم النشر.
          </Alert>
        )}

        <Field label="اسم صاحب الرأي" htmlFor="author_name" required>
          <Input
            id="author_name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            maxLength={80}
            required
          />
        </Field>

        <Field label="الصفة" htmlFor="author_title" hint="تظهر تحت الاسم — اختيارية">
          <Input
            id="author_title"
            value={authorTitle}
            onChange={(e) => setAuthorTitle(e.target.value)}
            maxLength={60}
            placeholder="صاحب مناسبة زواج"
          />
        </Field>

        <RatingPicker value={rating} onChange={setRating} />

        <Field label="نص التقييم" htmlFor="body" required>
          <Textarea
            id="body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={10}
            maxLength={1000}
            required
          />
        </Field>

        <Field
          label="ترتيب العرض"
          htmlFor="sort_order"
          hint="الأصغر يظهر أولاً في الرئيسية. صفر = الترتيب الافتراضي حسب وقت النشر."
        >
          <Input
            id="sort_order"
            type="number"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>

        <div className="flex gap-2 pt-1">
          <Button type="submit" loading={pending}>
            حفظ
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [authorName, setAuthorName] = useState('');
  const [authorTitle, setAuthorTitle] = useState('');
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState('');
  const [publish, setPublish] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const res = await adminCreateReview({ authorName, authorTitle, rating, body, publish });
      if (!res.ok) return setError(res.error ?? 'تعذّرت الإضافة.');
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal open onClose={onClose} title="تقييم من عندك">
      <form onSubmit={submit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <p className="text-xs leading-6 text-ink-faint">
          لرأي وصلك خارج الموقع — مكالمة أو رسالة واتساب. لا تنشر رأياً لم يأذن صاحبه بعرضه
          باسمه.
        </p>

        <Field label="اسم صاحب الرأي" htmlFor="new_name" required>
          <Input
            id="new_name"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            maxLength={80}
            placeholder="أبو عبدالله"
            required
          />
        </Field>

        <Field label="الصفة" htmlFor="new_title" hint="تظهر تحت الاسم — اختيارية">
          <Input
            id="new_title"
            value={authorTitle}
            onChange={(e) => setAuthorTitle(e.target.value)}
            maxLength={60}
            placeholder="صاحب مناسبة زواج"
          />
        </Field>

        <RatingPicker value={rating} onChange={setRating} />

        <Field label="نص التقييم" htmlFor="new_body" required>
          <Textarea
            id="new_body"
            rows={5}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            minLength={10}
            maxLength={1000}
            placeholder="وش قال عن التجربة؟"
            required
          />
        </Field>

        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            checked={publish}
            onChange={(e) => setPublish(e.target.checked)}
            className="h-4 w-4 rounded border-sand-300 accent-grape-500"
          />
          انشره في الصفحة الرئيسية مباشرة
        </label>

        <div className="flex gap-2 pt-1">
          <Button type="submit" loading={pending}>
            أضف
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </form>
    </Modal>
  );
}
