import { Stars } from '@/components/ui/Stars';
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
            <Stars rating={proof.rating} showValue className="justify-center" />
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
