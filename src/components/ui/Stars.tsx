import { Icon } from '@/components/ui/Icon';
import { arabicDigits } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

const SIZES = {
  sm: 'h-3.5 w-3.5',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
} as const;

/**
 * خمس نجوم تُملأ حسب التقييم.
 *
 * النجوم وحدها لا تكفي قارئ الشاشة، ولا من يقرأ بسرعة: القيمة الرقمية
 * مكتوبة بجانبها حين تُطلب، والنص البديل يذكرها دائماً.
 */
export function Stars({
  rating,
  size = 'md',
  showValue,
  className,
}: {
  rating: number;
  size?: keyof typeof SIZES;
  showValue?: boolean;
  className?: string;
}) {
  const rounded = Math.round(rating);

  return (
    <span className={cn('flex items-center gap-1.5', className)}>
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <Icon
            key={i}
            name="star"
            className={cn(SIZES[size], i <= rounded ? 'text-sunny-500' : 'text-sand-300')}
          />
        ))}
      </span>

      {showValue && (
        <span className="font-display text-2xl font-bold text-grape-600" aria-hidden="true">
          {arabicDigits(rating.toFixed(1))}
        </span>
      )}

      <span className="sr-only">{`التقييم ${arabicDigits(rating.toFixed(1))} من ٥`}</span>
    </span>
  );
}
