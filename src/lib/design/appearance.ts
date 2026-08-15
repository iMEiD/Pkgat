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
 * السكربت الذي يضبط الوضع قبل أول رسم.
 *
 * حين يفرض الأدمن وضعاً نتجاهل ما في التخزين المحلي: قراره أعلى من
 * تفضيل الزائر، وإلا ظهر الموقع لزوّار سابقين بغير ما يريد صاحبه.
 * وحين يتركه تلقائياً يعود الترتيب: اختيار الزائر ثم تفضيل نظامه.
 */
export function colorModeScript(mode: ColorModeSetting): string {
  if (mode === 'light' || mode === 'dark') {
    return `document.documentElement.dataset.theme='${mode}';`;
  }

  return `
(function(){
  try {
    var saved = localStorage.getItem('pk-color-mode');
    document.documentElement.dataset.theme =
      saved === 'dark' || saved === 'light'
        ? saved
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  } catch (e) {
    document.documentElement.dataset.theme = 'light';
  }
})();`.trim();
}
