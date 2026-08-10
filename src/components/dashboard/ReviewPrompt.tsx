'use client';

import { useActionState, useState } from 'react';

import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { submitReview } from '@/lib/actions/reviews';
import { cn } from '@/lib/utils/cn';
import type { ActionResult } from '@/lib/actions/events';
import type { Review } from '@/lib/types/database';

/**
 * بطاقة تقييم الخدمة في لوحة العميل.
 *
 * تُعرض بعد أن يستخدم المنصة فعلاً — سؤال قبل التجربة يزعج ولا يفيد.
 * ومطوية افتراضياً: مساحة اللوحة لمناسباته لا لطلباتنا.
 *
 * والوعد صريح: التقييم يصل صاحب المنصة ولا يظهر للزوار إلا بموافقته.
 * إخفاء هذا يجعل النشر مفاجأة، والمفاجأة في نشر اسم العميل ليست خفيفة.
 */
export function ReviewPrompt({ existing }: { existing: Review | null }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [hover, setHover] = useState(0);
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    submitReview,
    null,
  );

  const sent = state?.ok;
  const shown = hover || rating;

  if (existing && !open && !sent) {
    return <SentCard review={existing} onEdit={() => setOpen(true)} />;
  }

  if (sent && !open) {
    return (
      <Card className="border-mint-100 bg-mint-50 p-5">
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-mint-500 text-white">
            <Icon name="check" className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <div>
            <h2 className="text-base font-bold text-ink">وصل تقييمك — شكراً لك</h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">
              راح نقرأه، وإذا نشرناه في الصفحة الرئيسية بيظهر باسمك اللي في حسابك.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  if (!open) {
    return (
      <Card className="border-sand-300 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-sunny-50 text-sunny-600">
              <Icon name="star" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-ink">كيف كانت تجربتك مع بكجات؟</h2>
              <p className="mt-1 text-sm leading-6 text-ink-soft">
                رأيك يوصل لنا مباشرة — ويساعد غيرك يقرر.
              </p>
            </div>
          </div>

          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            اكتب تقييمك
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <h2 className="text-base font-bold text-ink">
          {existing ? 'عدّل تقييمك' : 'كيف كانت تجربتك مع بكجات؟'}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-ink-faint transition-colors hover:text-ink"
        >
          إغلاق
        </button>
      </div>

      {state?.error && (
        <Alert tone="danger" className="mt-4">
          {state.error}
        </Alert>
      )}

      {existing?.status === 'published' && (
        <Alert tone="warning" className="mt-4">
          تقييمك منشور حالياً. أي تعديل يرجّعه للمراجعة ويختفي من الصفحة الرئيسية حتى نوافق عليه
          من جديد.
        </Alert>
      )}

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="rating" value={rating} />

        <div>
          <span className="mb-2 block text-sm font-bold text-ink">تقييمك</span>
          <div
            className="flex items-center gap-1"
            onMouseLeave={() => setHover(0)}
            role="radiogroup"
            aria-label="تقييمك من ١ إلى ٥"
          >
            {[1, 2, 3, 4, 5].map((i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={rating === i}
                aria-label={`${i} من ٥`}
                onClick={() => setRating(i)}
                onMouseEnter={() => setHover(i)}
                className="rounded-lg p-1 transition-transform hover:scale-110 active:scale-95"
              >
                <Icon
                  name="star"
                  className={cn('h-8 w-8', i <= shown ? 'text-sunny-500' : 'text-sand-300')}
                />
              </button>
            ))}
          </div>
        </div>

        <Field
          label="صفتك"
          htmlFor="author_title"
          hint="تظهر تحت اسمك: صاحب مناسبة زواج · منظّم مؤتمر · اتركها فارغة لو ما تبي"
        >
          <Input
            id="author_title"
            name="author_title"
            maxLength={60}
            defaultValue={existing?.author_title ?? ''}
            placeholder="صاحب مناسبة زواج"
          />
        </Field>

        <Field label="رأيك" htmlFor="body" required>
          <Textarea
            id="body"
            name="body"
            rows={4}
            required
            minLength={10}
            maxLength={1000}
            defaultValue={existing?.body ?? ''}
            placeholder="وش أعجبك؟ وش ينقص؟"
          />
        </Field>

        <p className="text-xs leading-6 text-ink-faint">
          تقييمك يوصل فريق بكجات، وما يظهر في الصفحة الرئيسية إلا بعد موافقتنا — وباسمك اللي
          في حسابك.
        </p>

        <Button type="submit" loading={pending} disabled={rating === 0}>
          {existing ? 'حفظ التعديل' : 'أرسل التقييم'}
        </Button>
      </form>
    </Card>
  );
}

const STATUS_LABELS: Record<string, { label: string; tone: 'sunny' | 'mint' | 'sand'; hint: string }> = {
  pending: {
    label: 'بانتظار المراجعة',
    tone: 'sunny',
    hint: 'وصلنا تقييمك ونقرأه — ما يظهر للزوار قبل موافقتنا.',
  },
  published: {
    label: 'منشور',
    tone: 'mint',
    hint: 'تقييمك ظاهر في الصفحة الرئيسية. شكراً لك.',
  },
  hidden: {
    label: 'غير منشور',
    tone: 'sand',
    hint: 'ما نُشر في الصفحة الرئيسية — وهو محفوظ عندنا ونستفيد منه.',
  },
};

function SentCard({ review, onEdit }: { review: Review; onEdit: () => void }) {
  const meta = STATUS_LABELS[review.status] ?? STATUS_LABELS.pending;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-bold text-ink">تقييمك للخدمة</h2>
            <Badge tone={meta.tone} dot>
              {meta.label}
            </Badge>
          </div>

          <div className="mt-2 flex items-center gap-0.5" aria-hidden="true">
            {[1, 2, 3, 4, 5].map((i) => (
              <Icon
                key={i}
                name="star"
                className={cn('h-4 w-4', i <= review.rating ? 'text-sunny-500' : 'text-sand-300')}
              />
            ))}
          </div>

          <p className="mt-2.5 text-sm leading-7 text-ink-soft">{review.body}</p>
          <p className="mt-2 text-xs leading-5 text-ink-faint">{meta.hint}</p>
        </div>

        <Button type="button" variant="ghost" size="sm" onClick={onEdit}>
          عدّل
        </Button>
      </div>
    </Card>
  );
}
