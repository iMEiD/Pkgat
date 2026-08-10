import { Card } from '@/components/ui/Card';
import { Stars } from '@/components/ui/Stars';
import { countAr } from '@/lib/utils/format';
import type { PublishedReview } from '@/lib/types/database';

/**
 * آراء عملاء وافق صاحب المنصة على نشرها.
 *
 * لا اقتباسات مُختلقة ولا نجوم مرسومة بلا مصدر: كل بطاقة هنا رأيٌ كتبه
 * صاحبه أو أذن به، والمتوسط محسوب من المعروض نفسه لا من رقم يُكتب في
 * الإعدادات — فلا يفترق ما يقوله الرأس عمّا تقوله البطاقات.
 */
export function Reviews({
  items,
  average,
  count,
}: {
  items: PublishedReview[];
  average: number;
  count: number;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <Stars rating={average} size="lg" showValue />
        <span className="text-sm text-ink-soft">
          من {countAr(count, 'تقييم', 'تقييمين', 'تقييمات', 'تقييماً')} منشور
        </span>
      </div>

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((review) => (
          <ReviewCard key={review.id} review={review} />
        ))}
      </div>
    </div>
  );
}

function ReviewCard({ review }: { review: PublishedReview }) {
  return (
    <Card className="flex h-full flex-col p-6">
      <Stars rating={review.rating} />

      <blockquote className="mt-4 flex-1 text-[15px] leading-8 text-ink">
        {review.body}
      </blockquote>

      <div className="mt-5 border-t border-sand-200 pt-4">
        <span className="block text-sm font-bold text-ink">{review.author_name}</span>
        {review.author_title && (
          <span className="mt-0.5 block text-xs leading-5 text-ink-faint">
            {review.author_title}
          </span>
        )}
      </div>
    </Card>
  );
}
