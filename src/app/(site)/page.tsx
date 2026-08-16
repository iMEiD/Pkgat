import { ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { Reveal } from '@/components/ui/Reveal';
import { SectionTitle } from '@/components/ui/Misc';
import { getFreeQuota, getPageContent, getSettings, list, text } from '@/lib/cms';
import { createClient } from '@/lib/supabase/server';
import { arabicDigits, formatPrice } from '@/lib/utils/format';
import { SocialProof } from '@/components/site/SocialProof';
import { Faq, type FaqItem } from '@/components/site/Faq';
import { StickyCta } from '@/components/site/StickyCta';
import { Reviews } from '@/components/site/Reviews';
import { BarcodeShowcase } from '@/components/site/BarcodeShowcase';
import { getPublishedReviews } from '@/lib/data/reviews';
import { getDisplayedProof } from '@/lib/data/platform-stats';
import { cn } from '@/lib/utils/cn';

export const revalidate = 60;

/**
 * أرخص باقة فعّالة — لسطر السعر في البطل.
 *
 * السعر يقلّل التردّد: من لا يعرف كم يكلّفه الشيء يفترض أنه غالٍ ويغادر
 * قبل أن يصل لصفحة الأسعار. ولذلك يُقرأ من الباقات نفسها لا يُكتب في
 * النصوص — فلا يتناقض مع صفحة الأسعار إن غُيّرت الباقة يوماً.
 *
 * وإن لم تكن هناك باقات (أو تعذّرت القراءة) يختفي السطر كله: سعرٌ
 * مُختلَق في موضع وعدٍ أسوأ من لا شيء.
 */
async function getStartingPrice(): Promise<number | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('plans')
      .select('price_halalas')
      .eq('is_active', true)
      .gt('price_halalas', 0)
      .order('price_halalas', { ascending: true })
      .limit(1);

    const halalas = (data as { price_halalas: number }[] | null)?.[0]?.price_halalas;
    return typeof halalas === 'number' && halalas > 0 ? halalas : null;
  } catch {
    return null;
  }
}

interface StatItem { value: string; label: string }
interface FeatureItem { icon: string; color: string; title: string; body: string }
interface StepItem { title: string; body: string }

const FALLBACK_FEATURES: FeatureItem[] = [
  { icon: 'qr', color: 'grape', title: 'باركود فريد لكل مدعو', body: 'معرّف عشوائي غير قابل للتخمين أو النسخ — تحدد مكانه ولونه وحجمه بنفسك.' },
  { icon: 'upload', color: 'coral', title: 'يشتغل مع أي تصميم', body: 'دعوة من مصمم خاص، أو جاهزة، أو من قوالبنا — النظام يتكيف مع تصميمك، مو العكس.' },
  { icon: 'shield', color: 'rose', title: 'منع الدخول المكرر تلقائياً', body: 'الباركود يُستهلك بعد أول مسح، مع زر تجاوز مسجَّل باسم المسؤول للحالات الاستثنائية.' },
  { icon: 'users', color: 'mint', title: 'فريق استقبال بلا تعقيد', body: 'كل مسؤول دخول يفتح رابط المسح من جواله مباشرة، وكل عملية تُسجَّل باسمه.' },
  { icon: 'chart', color: 'sunny', title: 'تقرير حضور جاهز فور انتهاء المناسبة', body: 'نسبة الحضور، تفصيل حسب الفئة، جاهز للطباعة أو حفظ PDF.' },
  { icon: 'edit', color: 'sky', title: 'تعديلات خفيفة وقت الحاجة', body: 'غيّرت اسم مدعو أو أضفت تفصيل؟ تعديل بسيط على دعوتك، مو مشروع تصميم من الصفر.' },
];

/**
 * أربعة أسئلة مختارة من أسئلة صفحة الأسعار — نصّها هو نصّها هناك حرفياً
 * حتى لا يتناقض الجوابان. وبقيتها خلف رابط في آخر القسم.
 */
const HOME_FAQ: FaqItem[] = [
  {
    q: 'هل الباركود يحتاج إنترنت؟',
    a: 'نعم، لوحة المسح تحتاج اتصال خفيف للتحقق الفوري ومنع التكرار — وهي مصممة تشتغل حتى مع شبكة ضعيفة.',
  },
  {
    q: 'وش معنى الدعوات المجانية؟',
    a: 'أول ١٠ مدعوين مجاناً بالكامل — تولد دعواتهم وتجرب النظام فعلياً قبل أي دفع.',
  },
  {
    q: 'أقدر أضيف أكثر من مسؤول استقبال؟',
    a: 'نعم، حساب مسح مستقل لكل مدخل، وكل عملية مسح مسجّلة باسم المسؤول.',
  },
  {
    q: 'هل المدعو يحمّل تطبيق؟',
    a: 'لا. يستلم دعوته كصورة عادية، ومسؤول الاستقبال يمسحها من متصفح جواله — بدون تطبيق على الطرفين.',
  },
];

const ACCENT: Record<string, string> = {
  grape: 'bg-grape-50 text-grape-600',
  coral: 'bg-coral-50 text-coral-600',
  mint: 'bg-mint-50 text-mint-600',
  sky: 'bg-sky-50 text-sky-600',
  rose: 'bg-rose-50 text-rose-600',
  sunny: 'bg-sunny-50 text-sunny-600',
};

export default async function HomePage() {
  const [c, settings, reviews, startingPrice, freeQuota] = await Promise.all([
    getPageContent('home'),
    getSettings(),
    getPublishedReviews(),
    getStartingPrice(),
    getFreeQuota(),
  ]);

  // الأرقام: محسوبة من قاعدة البيانات أو مكتوبة يدوياً — حسب إعداد الأدمن
  const proof = await getDisplayedProof(settings);

  const stats = list<StatItem>(c, 'home.stats', [
    { value: 'ارفعها كما هي', label: 'أي تصميم من مصمّمك أو جاهز' },
    { value: 'باركود لكل مدعو', label: 'فريد وغير قابل للتخمين' },
    { value: 'بدون تطبيق', label: 'المسح من متصفح الجوال مباشرة' },
  ]);

  // السعر كان غائباً عن الصفحة الرئيسية كلها — والزائر يسأل عنه أولاً.
  // نُلحقه ببطاقات البطل بدل إضافته داخل home.stats، حتى يظهر ولو كانت
  // القائمة في لوحة الأدمن ما زالت ثلاث بطاقات.
  const heroStats =
    stats.length >= 4
      ? stats
      : [
          ...stats,
          {
            // تُصاغ بإيجاز أشقائها («٣ دقائق»، «بدون تطبيق») فلا تنكسر سطرين
            value: text(c, 'home.stats.free_value', '١٠ دعوات'),
            label: text(c, 'home.stats.free_label', 'قبل أي التزام مالي'),
          },
        ];
  // مختارات من أسئلة صفحة الأسعار — أكثر ما يسأل عنه الزائر يسبق وصوله لها
  const faq = list<FaqItem>(c, 'home.faq', HOME_FAQ);

  const features = list<FeatureItem>(c, 'home.features.items', FALLBACK_FEATURES);
  const steps = list<StepItem>(c, 'home.steps.items', [
    { title: 'ارفع دعوتك', body: 'جاهزة عندك، أو ابدأ من قالب.' },
    { title: 'حدد مكان الباركود', body: 'اسحبه بإصبعك، مع اسم المدعو.' },
    { title: 'أضف قائمة المدعوين', body: 'اكتبها، الصقها، أو استورد ملف.' },
    { title: 'وزّع وامسح', body: 'حمّل الدعوات وأرسلها، وامسح على الباب.' },
  ]);

  return (
    <>
      {/* ===== البطل ===== */}
      <section id="pk-hero" className="relative overflow-hidden">
        <div className="pk-dots absolute inset-0 -z-10 opacity-60" aria-hidden="true" />
        <div className="pk-container grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_.95fr] lg:py-24">
          <div className="animate-fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-sand-300 bg-surface/80 px-4 py-1.5 text-xs font-bold text-grape-600 shadow-soft">
              <Icon name="sparkle" className="h-3.5 w-3.5" />
              {text(c, 'home.hero.eyebrow', 'باركود دخول لكل مدعو')}
            </span>

            <h1 className="mt-5 font-display text-4xl/[1.3] font-bold text-ink pk-balance sm:text-5xl/[1.26] lg:text-6xl/[1.24]">
              {text(c, 'home.hero.title', 'كل مدعو بباركوده، وتعرف مين حضر')}
            </h1>

            <p className="mt-5 max-w-xl text-lg leading-9 text-ink-soft">
              {text(
                c,
                'home.hero.subtitle',
                'ارفع دعوتك الحالية بأي تصميم، ونولّد باركود دخول فريد لكل مدعو باسمه. على الباب تمسحه من جوالك وبس، وتشوف الحضور لحظة بلحظة — بدون طابعة، بدون تطبيق، بدون فوضى.',
              )}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/signup" size="lg">
                {text(c, 'home.hero.primary_cta', 'ابدأ مجاناً')}
                <Icon name="arrow" className="h-4 w-4" />
              </ButtonLink>
              {/*
                ينزل لقسم الخطوات في الصفحة نفسها لا يغادرها.
                
                كان يذهب إلى /gallery — أي يخرج الزائر من صفحة البيع قبل
                أن يفهم كيف تشتغل، وهو أوّل ما يسأل عنه. والتمرير الناعم
                مضبوط في globals.css فلا يحتاج جافاسكربت.
              */}
              <ButtonLink href="#how" variant="secondary" size="lg">
                {text(c, 'home.hero.secondary_cta', 'شاهد كيف تشتغل')}
              </ButtonLink>
            </div>

            {/*
              سطر السعر تحت الأزرار مباشرة: من لا يعرف الكلفة يفترض أنها
              عالية ويغادر قبل صفحة الأسعار. ويختفي السطر كله إن لم تكن
              هناك باقات — لا نَعِد بسعرٍ لا وجود له.
            */}
            <PriceNote
              template={text(
                c,
                'home.hero.price_note',
                'الباقات تبدأ من {price} — وأول {free} دعوات مجاناً قبلها.',
              )}
              price={startingPrice}
              free={freeQuota}
            />

            <dl className="mt-12 grid max-w-xl grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-4">
              {heroStats.map((s, i) => (
                <Reveal key={s.label} delay={i * 90}>
                  <dt className="font-display text-xl font-bold text-grape-600">{s.value}</dt>
                  <dd className="mt-1 text-xs leading-5 text-ink-soft">{s.label}</dd>
                </Reveal>
              ))}
            </dl>
          </div>

          <HeroArtwork />
        </div>
      </section>

      {/* ===== قبل وبعد: الفكرة في صورة ===== */}
      <section className="pk-container pb-4 lg:pb-8">
        <Reveal>
          <div className="pk-panel mx-auto max-w-4xl rounded-3xl border border-sand-200 bg-surface/70 p-6 shadow-soft sm:p-9">
            <p className="mb-2 text-center text-xs font-bold text-grape-600">
              {text(c, 'home.showcase.eyebrow', 'نفس التصميم، بإضافة واحدة بسيطة')}
            </p>
            <BarcodeShowcase />
            {/* الشرح تحت الصورة لا فوقها: العين تقرأ الصورة أولاً ثم تسأل عنها */}
            <p className="mx-auto mt-6 max-w-2xl text-center text-sm leading-7 text-ink-soft">
              {text(
                c,
                'home.showcase.body',
                'ما نعيد تصميم دعوتك. نضيف عليها طبقة ذكية: باركود مربوط باسم المدعو، تتحكم بمكانه وحجمه ولونه بنفسك.',
              )}
            </p>
          </div>
        </Reveal>
      </section>

      {/* ===== المميزات ===== */}
      <section className="pk-container py-16 lg:py-24">
        <Reveal>
          <SectionTitle
            center
            eyebrow={text(c, 'home.features.eyebrow', 'المميزات')}
            title={text(c, 'home.features.title', 'مصمم عشان يحل مشكلة حقيقية، مو بس يبهرك')}
          />
        </Reveal>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 70}>
              <Card interactive className="h-full p-6">
                <span
                  className={cn(
                    'inline-grid h-12 w-12 place-items-center rounded-2xl',
                    ACCENT[f.color] ?? ACCENT.grape,
                  )}
                >
                  <Icon name={f.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-ink">{f.title}</h3>
                <p className="mt-2 text-sm leading-7 text-ink-soft">{f.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== الخطوات ===== */}
      <section id="how" className="scroll-mt-24 border-y border-sand-200 bg-sand-50/60 py-16 lg:py-24">
        <div className="pk-container">
          <Reveal>
            <SectionTitle
              center
              eyebrow={text(c, 'home.steps.eyebrow', 'كيف تشتغل')}
              title={text(c, 'home.steps.title', 'من الرفع للباب، أربع خطوات وخلصت')}
            />
          </Reveal>

          <ol className="mt-12 grid gap-6 md:grid-cols-4">
            {steps.map((s, i) => (
              <Reveal key={s.title} delay={i * 90} as="li">
                <div className="relative">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-grape-500 font-display text-lg font-bold text-white shadow-pop">
                    {i + 1}
                  </span>
                  {i < steps.length - 1 && (
                    <span
                      className="absolute right-14 top-5 hidden h-px w-[calc(100%-2.75rem)] bg-gradient-to-l from-sand-300 to-transparent md:block"
                      aria-hidden="true"
                    />
                  )}
                  <h3 className="mt-4 text-base font-bold text-ink">{s.title}</h3>
                  <p className="mt-1.5 text-sm leading-7 text-ink-soft">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ===== آراء العملاء ===== */}
      {reviews.ready && (
        <section className="bg-sand-50/60 py-16 lg:py-24">
          <div className="pk-container">
            <Reveal>
              <SectionTitle
                center
                eyebrow={text(c, 'home.reviews.eyebrow', 'رأي عملائنا')}
                title={text(c, 'home.reviews.title', 'وش يقولون اللي جرّبوا بكجات؟')}
                subtitle={text(
                  c,
                  'home.reviews.subtitle',
                  'تقييمات كتبها أصحاب مناسبات نُظِّمت فعلاً على المنصة.',
                )}
              />
            </Reveal>

            <div className="mt-12">
              <Reviews items={reviews.items} average={reviews.average} count={reviews.count} />
            </div>
          </div>
        </section>
      )}

      {/* ===== أسئلة شائعة مختصرة ===== */}
      {faq.length > 0 && (
        <section className="pk-container py-16 lg:py-24">
          <Reveal>
            <SectionTitle
              center
              eyebrow={text(c, 'home.faq.eyebrow', 'أسئلة شائعة')}
              title={text(c, 'home.faq.title', 'أكثر ما يُسأل عنه')}
            />
          </Reveal>
          <Faq items={faq} className="mx-auto mt-10 max-w-3xl" moreHref="/pricing" />
        </section>
      )}

      {/* ===== إثبات اجتماعي — يختفي ما لم تُضبط أرقامه ===== */}
      <SocialProof proof={proof} className="pt-4" />

      {/* ===== دعوة نهائية ===== */}
      <section id="pk-final-cta" className="pk-container py-16 lg:py-24">
        <Reveal>
          <div className="relative overflow-hidden rounded-4xl bg-grape-500 px-6 py-14 text-center text-white sm:px-12">
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(600px 300px at 15% 0%, #FF6B4A, transparent 60%), radial-gradient(600px 300px at 85% 100%, #17BE94, transparent 60%)',
              }}
              aria-hidden="true"
            />
            <div className="relative">
              <h2 className="font-display text-3xl/snug font-bold pk-balance sm:text-4xl/snug">
                {text(c, 'home.cta.title', 'جرّبها الآن بلا مخاطرة')}
              </h2>
              <p className="mx-auto mt-4 max-w-lg text-base leading-8 text-white/95">
                {text(c, 'home.cta.body', 'ارفع دعوتك وولّد أول ١٠ باركودات فعلياً — قبل ما تدفع ريال واحد.')}
              </p>
              <div className="mt-8 flex flex-wrap justify-center gap-3">
                <ButtonLink
                  href="/signup"
                  size="lg"
                  className="bg-surface text-grape-600 shadow-none hover:bg-sand-50"
                >
                  {text(c, 'home.cta.primary', 'أنشئ حسابك')}
                </ButtonLink>
                <ButtonLink
                  href="/pricing"
                  size="lg"
                  className="border-2 border-white/40 bg-transparent text-white shadow-none hover:bg-white/10"
                >
                  {text(c, 'home.cta.secondary', 'شاهد الباقات')}
                </ButtonLink>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* يظهر بعد قسم البطل ويختفي عند الدعوة النهائية — فيها دعوة أوضح منه */}
      <StickyCta heroId="pk-hero" hideAtId="pk-final-cta" />
    </>
  );
}

/** رسم توضيحي: بطاقة دعوة مع باركود ونتيجة مسح */
function HeroArtwork() {
  return (
    <div className="relative mx-auto w-full max-w-sm animate-fade-up [animation-delay:150ms]">
      <div className="pk-hero-glow absolute -inset-6 -z-10 rounded-[3rem] blur-2xl" aria-hidden="true" />

      <Card className="overflow-hidden p-0">
        <div className="relative aspect-[3/4] bg-gradient-to-b from-sand-100 to-surface p-6">
          <div className="flex h-full flex-col items-center justify-between text-center">
            <div>
              <p className="text-[11px] font-bold tracking-[0.3em] text-ink-faint">دعوة خاصة</p>
              <p className="mt-6 font-display text-2xl font-bold text-ink">حفل زواج</p>
              <p className="mt-1 text-xs text-ink-soft">الجمعة ١٢ سبتمبر · قاعة الماسة</p>
            </div>

            <div>
              <p className="text-[11px] text-ink-faint">المدعو الكريم</p>
              <p className="mt-1 font-display text-xl font-bold text-grape-600">عبدالله الشمري</p>
            </div>

            {/* الباركود يُثبَّت داكناً على فاتح: هكذا يُطبع ويُمسح فعلاً */}
            <div className="rounded-2xl bg-[#FFFDF9] p-3 shadow-soft">
              <FakeQr />
            </div>
          </div>
        </div>
      </Card>

      {/* بطاقة نتيجة المسح */}
      <div className="absolute -bottom-5 -left-4 flex items-center gap-3 rounded-2xl border border-mint-100 bg-surface px-4 py-3 shadow-lift animate-float sm:-left-10">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-mint-500 text-white">
          <Icon name="check" className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <span>
          <span className="block text-sm font-bold text-ink">دخول ناجح</span>
          <span className="block text-[11px] text-ink-faint">طرف المعرس · ٢١:٠٤</span>
        </span>
      </div>
    </div>
  );
}

/** نمط QR زخرفي ثابت (ليس باركوداً حقيقياً — للعرض فقط) */
function FakeQr() {
  const cells = 13;
  const pattern: boolean[] = [];
  for (let i = 0; i < cells * cells; i++) {
    const r = Math.floor(i / cells);
    const col = i % cells;
    const corner =
      (r < 4 && col < 4) || (r < 4 && col > cells - 5) || (r > cells - 5 && col < 4);
    pattern.push(corner ? (r % 3 !== 1 || col % 3 !== 1) && !(r === 1 && col === 1) : (r * 7 + col * 5) % 3 === 0);
  }
  return (
    <div
      className="grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${cells}, 6px)` }}
      aria-hidden="true"
    >
      {pattern.map((on, i) => (
        <span key={i} className={cn('h-1.5 w-1.5 rounded-[1px]', on ? 'bg-[#141019]' : 'bg-transparent')} />
      ))}
    </div>
  );
}

/**
 * سطر السعر تحت أزرار البطل.
 *
 * نصّه من لوحة الأدمن، ورقماه من قاعدة البيانات: {price} سعر أرخص باقة
 * فعّالة، و{free} عدد الدعوات المجانية. فتبقى الأرقام صادقة مهما غُيّرت
 * الباقة أو الحصة، ويبقى الكلام حولها بيد صاحب الموقع.
 *
 * ويختفي السطر في حالتين: أن يُفرغ الأدمن النص، أو ألّا تكون هناك باقة
 * أصلاً — فوعدٌ بسعرٍ لا وجود له أسوأ من السكوت عنه.
 */
function PriceNote({
  template,
  price,
  free,
}: {
  template: string;
  price: number | null;
  free: number;
}) {
  if (!template.trim()) return null;

  const withFree = template.replace(/\{free\}/g, arabicDigits(free));

  // لا سعر: نُخفي السطر إن كان يَعِد بسعر، ونعرضه إن كان لا يذكره
  if (price === null) {
    return withFree.includes('{price}') ? null : (
      <p className="mt-4 text-sm text-ink-faint">{withFree}</p>
    );
  }

  // السعر يُبرز داخل الجملة، فيُقسم النص عنده بدل استبداله نصّياً
  const parts = withFree.split('{price}');

  return (
    <p className="mt-4 text-sm text-ink-faint">
      {parts.map((part, i) => (
        <span key={i}>
          {part}
          {i < parts.length - 1 && (
            <span className="font-bold text-ink-soft">{formatPrice(price)}</span>
          )}
        </span>
      ))}
    </p>
  );
}
