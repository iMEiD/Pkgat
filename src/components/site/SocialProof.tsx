import { Icon } from '@/components/ui/Icon';
import { arabicDigits } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { hasSocialProof, type SocialProof as SocialProofData } from '@/lib/site-settings';

/**
 * شريط إثبات اجتماعي — أرقام وتقييم.
 *
 * كل رقم يأتي من إعدادات الأدمن، وما لم يُضبط لا يُعرض. إن لم يُضبط
 * شيء اختفى الشريط كاملاً: موضع «إثبات» فارغ أو برقم مُختلَق يهدم
 * الثقة بدل أن يبنيها.
 */
export function SocialProof({
  proof,
  className,
}: {
  proof: SocialProofData;
  className?: string;
}) {
  if (!hasSocialProof(proof)) return null;

  return (
    <section className={cn('pk-container', className)} aria-label="أرقام بكجات">
      <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6 rounded-3xl border border-sand-200 bg-sand-50/70 px-6 py-7">
        {proof.events && <Figure value={proof.events} label="مناسبة نُظِّمت ببكجات" />}
        {proof.guests && <Figure value={proof.guests} label="مدعو دخل بباركوده" />}
        {proof.rating && (
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5">
              <Stars rating={proof.rating} />
              <span className="font-display text-2xl font-bold text-grape-600">
                {arabicDigits(proof.rating.toFixed(1))}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-ink-soft">
              {proof.ratingCount
                ? `تقييم ${arabicDigits(proof.ratingCount)} من العملاء`
                : 'تقييم العملاء'}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

/** آلاف مفصولة ثم أرقام عربية: ١٤٬٢٠٠ أسهل قراءة من ١٤٢٠٠ */
const groupFmt = new Intl.NumberFormat('en-US');

function Figure({ value, label }: { value: number; label: string }) {
  return (
    <div className="text-center">
      {/* dir=ltr يُبقي علامة الزائد قبل الرقم كوحدة واحدة؛ بدونها
          يقذفها ترتيب الاتجاهين لآخر العدد فتُقرأ متأخرة */}
      <p dir="ltr" className="font-display text-2xl font-bold text-grape-600">
        +{arabicDigits(groupFmt.format(value)).replace(/,/g, '٬')}
      </p>
      <p className="mt-1.5 text-xs leading-5 text-ink-soft">{label}</p>
    </div>
  );
}

/** خمس نجوم، تُملأ حسب التقييم — والقيمة الرقمية مكتوبة بجانبها للوضوح */
function Stars({ rating }: { rating: number }) {
  const rounded = Math.round(rating);

  return (
    <span className="flex items-center gap-0.5" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon
          key={i}
          name="star"
          className={cn('h-4 w-4', i <= rounded ? 'text-sunny-500' : 'text-sand-300')}
        />
      ))}
    </span>
  );
}
