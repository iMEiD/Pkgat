/**
 * معرض «دعوات صمّمها عملاؤنا» في الصفحة الرئيسية.
 *
 * القاعدة: القسم يَعِد بتصاميم عملاء حقيقيين، فإما أن يفي أو يختفي.
 * عنصر واحد — أو عنصر تجريبي — أسوأ من لا شيء، لأنه يُكذّب العنوان
 * ويقول للزائر إن أحداً لم يستخدم المنصة بعد.
 *
 * المصدران:
 * ١. تصاميم وافق أصحابها على مشاركتها (من قاعدة البيانات).
 * ٢. تصاميم مختارة يضيفها صاحب المنصة يدوياً هنا — لأعمال نُفِّذت
 *    فعلاً وأذن أصحابها بعرضها، لكنها ليست في قاعدة البيانات.
 *
 * لا يجوز أن يُوضع هنا قالب من قوالب المنصة الجاهزة: القسم عن أعمال
 * العملاء، وقالب المنصة ليس عمل عميل.
 */

import type { DesignConfig, EventType, SharedDesign } from '@/lib/types/database';

export interface ShowcaseItem {
  id: string;
  /** اسم المناسبة كما يظهر تحت البطاقة */
  title: string;
  eventType: EventType | string;
  backgroundUrl: string;
  /** الاسم المطبوع على الدعوة — للعرض فقط، لا يخصّ مدعوّاً حقيقياً */
  guestName?: string;
  /**
   * التصميم كاملاً. حين يوجد تُرسم الدعوة بكل نصوصها كما صنعها صاحبها؛
   * وحين يغيب (تصميم مُضاف يدوياً بصورة جاهزة) تُعرض الصورة كما هي.
   */
  design?: DesignConfig;
}

/** أقل عدد يُعرض به القسم. دونه يختفي بالكامل. */
export const SHOWCASE_MIN = 3;

/** أكثر ما تستوعبه الشبكة بشكل مرتب (صفّان × ثلاثة) */
export const SHOWCASE_MAX = 6;

/**
 * تصاميم مختارة يدوياً.
 *
 * لإضافة تصميم: ارفع الصورة، ثم أضف كائناً بالشكل التالي —
 *   {
 *     id: 'wedding-alqahtani',
 *     title: 'زواج آل قحطاني',
 *     eventType: 'wedding',            // wedding | graduation | party | other
 *     backgroundUrl: 'https://…',      // رابط صورة التصميم
 *     guestName: 'أبو محمد القحطاني',  // اسم للعرض على الدعوة
 *   }
 *
 * ⚠️ لا تُضف تصميماً إلا بإذن صاحبه.
 */
export const CURATED_SHOWCASE: ShowcaseItem[] = [];

/** أسماء عرض تتناوب على البطاقات التي لم يُحدَّد لها اسم */
const SAMPLE_NAMES = ['أبو عبدالله', 'أم سلطان', 'فهد العتيبي', 'نورة السالم', 'سعد الدوسري', 'لطيفة المطيري'];

function fromShared(item: SharedDesign, index: number): ShowcaseItem {
  return {
    id: item.id,
    title: item.title,
    eventType: item.event_type,
    backgroundUrl: item.background_url,
    guestName: item.design?.name?.sample || SAMPLE_NAMES[index % SAMPLE_NAMES.length],
    design: item.design ?? undefined,
  };
}

/**
 * يدمج المصدرين ويقصّ على الحد الأعلى.
 * المشاركات الحقيقية أولاً — فهي الأحدث والأصدق تمثيلاً.
 */
export function buildShowcase(shared: SharedDesign[]): ShowcaseItem[] {
  const merged = [...shared.map(fromShared), ...CURATED_SHOWCASE].filter(
    (item) => Boolean(item.backgroundUrl) && Boolean(item.title),
  );

  return merged.slice(0, SHOWCASE_MAX);
}

/** هل نعرض القسم أصلاً؟ */
export function showcaseIsReady(items: ShowcaseItem[]): boolean {
  return items.length >= SHOWCASE_MIN;
}
