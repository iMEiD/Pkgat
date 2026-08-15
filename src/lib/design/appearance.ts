/**
 * مظهر الموقع — مفتاحان مستقلان يضبطهما الأدمن من لوحته.
 *
 * الفصل بينهما مقصود:
 *
 *   mode    — نهاري أم ليلي. وهذا موجود في الموقع أصلاً ويعمل، لكنه كان
 *             بيد الزائر وحده؛ فنُعطي الأدمن حقّ فرضه أو تركه للزائر.
 *
 *   surface — شكل الأسطح: «كلاسيكي» هو ما عليه الموقع اليوم بالضبط،
 *             و«زجاجي» يستبدله بألواح شفافة مضبّبة وهالات ضوء.
 *
 * ولأنهما مستقلان يمكن تجربة الزجاج في النهار أو الكلاسيكي في الليل،
 * والأهم: إطفاء الزجاج يُرجع الموقع إلى شكله السابق حرفياً — لا نحذف
 * الأنماط القديمة ولا نستبدلها، بل نضيف طبقة فوقها تُفعَّل بسمة على
 * عنصر html. وما لا يُطفَأ بضغطة لا يجرؤ صاحب الموقع على تجربته أصلاً.
 */

export type ColorModeSetting = 'auto' | 'light' | 'dark';
export type SurfaceStyle = 'classic' | 'glass';
/** قوة الضباب — الزجاج ذوق، وما يعجب واحداً يزعج آخر */
export type GlassStrength = 'soft' | 'medium' | 'strong';

export interface Appearance {
  mode: ColorModeSetting;
  surface: SurfaceStyle;
  glass: GlassStrength;
  /**
   * هل يختار الزائر شكل الأسطح بنفسه؟
   *
   * الوضع الليلي كان دائماً بيد الزائر — لأنه راحة عين لا هوية. والشكل
   * كذلك: ما يراه أحدهم «عصرياً» يراه آخر مشوّشاً، والفرق ذوقٌ لا صواب.
   * فيضبط الأدمن ما يبدأ به الزائر، ويبقى للزائر أن يبدّل.
   *
   * ومن أراد شكلاً واحداً لموقعه أطفأ هذا، فاختفى الزر عن الجميع.
   */
  visitorChoice: boolean;
}

/**
 * الافتراضي هو الوضع الراهن للموقع بالضبط: الوضع يتبع جهاز الزائر،
 * والأسطح كلاسيكية. فترحيل قاعدة البيانات وحده لا يغيّر شكل الموقع
 * ولا بكسل — التغيير لا يقع إلا بقرار من اللوحة.
 */
export const DEFAULT_APPEARANCE: Appearance = {
  mode: 'auto',
  surface: 'classic',
  glass: 'medium',
  visitorChoice: true,
};

const MODES: ColorModeSetting[] = ['auto', 'light', 'dark'];
const SURFACES: SurfaceStyle[] = ['classic', 'glass'];
const STRENGTHS: GlassStrength[] = ['soft', 'medium', 'strong'];

export function parseAppearance(value: unknown): Appearance {
  if (!value || typeof value !== 'object') return DEFAULT_APPEARANCE;
  const raw = value as Record<string, unknown>;

  const pick = <T extends string>(key: string, allowed: T[], fallback: T): T =>
    allowed.includes(raw[key] as T) ? (raw[key] as T) : fallback;

  return {
    mode: pick('mode', MODES, DEFAULT_APPEARANCE.mode),
    surface: pick('surface', SURFACES, DEFAULT_APPEARANCE.surface),
    glass: pick('glass', STRENGTHS, DEFAULT_APPEARANCE.glass),
    visitorChoice:
      typeof raw.visitorChoice === 'boolean'
        ? raw.visitorChoice
        : DEFAULT_APPEARANCE.visitorChoice,
  };
}

/** بكسلات الضباب لكل درجة — تُحقن كمتغيّر فيقرأها الـ CSS */
const BLUR: Record<GlassStrength, number> = { soft: 14, medium: 22, strong: 32 };

/**
 * متغيّرات الزجاج. تُحقن دائماً (رخيصة)، ولا تُستعمل إلا حين
 * data-surface='glass' — فالقرار في مكان واحد لا في كل قاعدة.
 */
export function appearanceToCssVars(appearance: Appearance): string {
  const blur = BLUR[appearance.glass];
  // الضباب على الجوال أثقل حساباً؛ نُنزله درجة هناك عبر استعلام في globals.css
  return `:root{--pk-glass-blur:${blur}px;--pk-glass-blur-sm:${Math.round(blur * 0.7)}px;}`;
}

/**
 * السكربت الذي يضبط المظهر قبل أول رسم.
 *
 * يضبط الاثنين معاً — الوضع والشكل — لأن كليهما سمة على عنصر html،
 * وتأخيرُ أيّهما إلى ما بعد ترطيب React يعني وميضاً: ترسم الصفحة
 * بشكلٍ ثم تقفز إلى آخر في كل تنقّل.
 *
 * وقرار الأدمن أعلى من تفضيل الزائر: حين يفرض وضعاً أو يمنع اختيار
 * الشكل نتجاهل المحفوظ في المتصفح تماماً، وإلا ظهر الموقع لزوّار
 * سابقين بغير ما يريد صاحبه.
 */
export function appearanceScript(appearance: Appearance): string {
  const mode =
    appearance.mode === 'auto'
      ? `(function(){var s=localStorage.getItem('pk-color-mode');
           return s==='dark'||s==='light' ? s
             : (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');})()`
      : `'${appearance.mode}'`;

  const surface = appearance.visitorChoice
    ? `(function(){var s=localStorage.getItem('pk-surface');
         return s==='glass'||s==='classic' ? s : '${appearance.surface}';})()`
    : `'${appearance.surface}'`;

  return `
(function(){
  var r = document.documentElement;
  try {
    r.dataset.theme = ${mode};
    r.dataset.surface = ${surface};
  } catch (e) {
    r.dataset.theme = 'light';
    r.dataset.surface = '${appearance.surface}';
  }
})();`.trim();
}
