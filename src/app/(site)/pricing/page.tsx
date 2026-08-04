import type { Metadata } from 'next';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { Reveal } from '@/components/ui/Reveal';
import { SectionTitle } from '@/components/ui/Misc';
import { ButtonLink } from '@/components/ui/Button';
import { getPageContent, list, text } from '@/lib/cms';
import { createClient } from '@/lib/supabase/server';
import { billingLabel, formatPrice } from '@/lib/utils/format';
import type { Plan } from '@/lib/types/database';
import { cn } from '@/lib/utils/cn';

export const revalidate = 60;

export const metadata: Metadata = {
  title: 'الأسعار والباقات',
  description: 'باقات بكجات: دفعة واحدة لكل مناسبة، أو اشتراك شهري/سنوي لمنظمي المناسبات.',
};

interface FaqItem { q: string; a: string }

async function getPlans(): Promise<Plan[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('plans')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    return (data ?? []) as Plan[];
  } catch {
    return [];
  }
}

export default async function PricingPage() {
  const [c, plans] = await Promise.all([getPageContent('pricing'), getPlans()]);
  const faq = list<FaqItem>(c, 'pricing.faq', []);

  const oneTime = plans.filter((p) => p.billing_period === 'one_time');
  const recurring = plans.filter((p) => p.billing_period !== 'one_time');

  return (
    <div className="pk-container py-16 lg:py-24">
      <Reveal>
        <SectionTitle
          center
          eyebrow="الأسعار"
          title={text(c, 'pricing.title', 'باقات بسيطة وواضحة')}
          subtitle={text(c, 'pricing.subtitle', '')}
        />
      </Reveal>

      {plans.length === 0 ? (
        <Card className="mx-auto mt-12 max-w-lg p-8 text-center text-sm text-ink-soft">
          الباقات غير متاحة حالياً. تأكد من تشغيل ملفات الترحيل (migrations) على قاعدة البيانات.
        </Card>
      ) : (
        <>
          <PlanGrid plans={oneTime} title="لكل مناسبة" subtitle="ادفع مرة واحدة لمناسبة واحدة." />
          {recurring.length > 0 && (
            <PlanGrid
              plans={recurring}
              title="لمنظمي المناسبات"
              subtitle="مناسبات غير محدودة طوال فترة الاشتراك."
              className="mt-16"
            />
          )}
        </>
      )}

      <p className="mt-10 text-center text-xs text-ink-faint">
        {text(c, 'pricing.note', '')}
      </p>

      {faq.length > 0 && (
        <div className="mx-auto mt-20 max-w-3xl">
          <Reveal>
            <SectionTitle center title="أسئلة شائعة" />
          </Reveal>
          <div className="mt-8 space-y-3">
            {faq.map((item, i) => (
              <Reveal key={item.q} delay={i * 70}>
                <details className="group rounded-2xl border border-sand-200 bg-white/85 p-5 shadow-soft transition-colors open:border-grape-200">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-bold text-ink">
                    {item.q}
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-sand-100 text-ink-soft transition-transform duration-300 group-open:rotate-45">
                      <Icon name="plus" className="h-4 w-4" />
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-8 text-ink-soft">{item.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PlanGrid({
  plans,
  title,
  subtitle,
  className,
}: {
  plans: Plan[];
  title: string;
  subtitle: string;
  className?: string;
}) {
  if (plans.length === 0) return null;

  return (
    <div className={cn('mt-12', className)}>
      <div className="mb-6 text-center">
        <h3 className="font-display text-xl font-black text-ink">{title}</h3>
        <p className="mt-1 text-sm text-ink-soft">{subtitle}</p>
      </div>

      <div
        className={cn(
          'grid gap-5',
          plans.length >= 3 ? 'md:grid-cols-3' : 'mx-auto max-w-3xl md:grid-cols-2',
        )}
      >
        {plans.map((plan, i) => (
          <Reveal key={plan.id} delay={i * 80}>
            <Card
              interactive
              className={cn(
                'flex h-full flex-col p-6',
                plan.is_featured && 'border-grape-300 ring-2 ring-grape-200',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-lg font-bold text-ink">{plan.name}</h4>
                {plan.is_featured && <Badge tone="grape">الأكثر طلباً</Badge>}
              </div>

              {plan.description && (
                <p className="mt-2 text-sm leading-7 text-ink-soft">{plan.description}</p>
              )}

              <p className="mt-5 flex items-baseline gap-2">
                <span className="font-display text-3xl font-black text-ink">
                  {formatPrice(plan.price_halalas, plan.currency)}
                </span>
                {plan.price_halalas > 0 && (
                  <span className="text-xs text-ink-faint">{billingLabel(plan.billing_period)}</span>
                )}
              </p>

              <ul className="mt-6 flex-1 space-y-2.5">
                {(plan.features ?? []).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-soft">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-mint-500" strokeWidth={2.5} />
                    {f}
                  </li>
                ))}
              </ul>

              <ButtonLink
                href={plan.price_halalas === 0 ? '/signup' : `/signup?plan=${plan.code}`}
                variant={plan.is_featured ? 'primary' : 'secondary'}
                fullWidth
                className="mt-6"
              >
                {plan.price_halalas === 0 ? 'ابدأ مجاناً' : 'اختر هذه الباقة'}
              </ButtonLink>
            </Card>
          </Reveal>
        ))}
      </div>
    </div>
  );
}
