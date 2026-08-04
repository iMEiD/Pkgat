/**
 * قائمة الخطوط المتاحة لرسم أسماء المدعوين على التصميم.
 * كلها تدعم العربية والإنجليزية وتُحمَّل من Google Fonts في الـ layout.
 *
 * مهم: أي خط يُضاف هنا يجب أن يكون ضمن رابط الخطوط في `src/app/layout.tsx`
 * وإلا لن يُحمَّل ولن يظهر على الكانفس.
 */
export interface FontOption {
  /** الاسم المستخدم في CSS font-family — يجب أن يطابق اسم Google Font بالضبط */
  family: string;
  label: string;
  weights: number[];
  /** خط زخرفي/عريض يناسب العناوين */
  display?: boolean;
}

export const FONTS: FontOption[] = [
  { family: 'Tajawal', label: 'تجوّل — عصري واضح', weights: [400, 500, 700, 900] },
  { family: 'Cairo', label: 'القاهرة — حديث', weights: [400, 600, 700, 900] },
  { family: 'Almarai', label: 'المراعي — بسيط', weights: [400, 700, 800] },
  { family: 'IBM Plex Sans Arabic', label: 'IBM بلكس — أنيق', weights: [400, 500, 600, 700] },
  { family: 'Noto Kufi Arabic', label: 'نوتو كوفي — هندسي', weights: [400, 600, 700, 900] },
  { family: 'Reem Kufi', label: 'ريم كوفي — زخرفي', weights: [400, 600, 700], display: true },
  { family: 'Amiri', label: 'أميري — نسخ كلاسيكي', weights: [400, 700], display: true },
  { family: 'Aref Ruqaa', label: 'عارف رقعة — فاخر', weights: [400, 700], display: true },
  { family: 'Lalezar', label: 'لالزار — مرح', weights: [400], display: true },
  { family: 'Marhey', label: 'مرحى — احتفالي', weights: [400, 600, 700], display: true },
  { family: 'Playfair Display', label: 'Playfair — إنجليزي فاخر', weights: [400, 600, 700], display: true },
  { family: 'Poppins', label: 'Poppins — إنجليزي عصري', weights: [400, 500, 600, 700] },
];

export const DEFAULT_FONT = 'Tajawal';

/** رابط Google Fonts موحّد يغطي كل الخطوط أعلاه */
export function googleFontsHref(): string {
  const families = FONTS.map(
    (f) => `family=${f.family.replace(/ /g, '+')}:wght@${f.weights.join(';')}`,
  ).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}

/**
 * ينتظر تحميل الخط فعلياً قبل الرسم على الكانفس.
 *
 * هذه الخطوة أساسية: بدونها يرسم المتصفح بخط بديل (fallback) لأن الخط
 * لم يكن جاهزاً وقت استدعاء fillText — وهي سبب مشكلة "الخط لا يتغير".
 * ملاحظة: `document.fonts.ready` وحده لا يكفي لأن الخط لا يبدأ التحميل
 * أصلاً إلا عند استخدامه، لذلك نطلبه صراحة عبر `document.fonts.load`.
 */
/**
 * أقرب وزن تدعمه العائلة فعلاً.
 *
 * لو طلبنا وزناً غير موجود (مثل Lalezar 700) فالمتصفح «يزوّر» السُمك
 * (faux bold) بدل استخدام وجه حقيقي — والنتيجة تختلف عن الخط الأصلي.
 * تثبيت الوزن على وجه متاح يجعل المعاينة والتوليد متطابقين ومتوقّعين.
 */
export function resolveWeight(family: string, weight: number): number {
  const font = FONTS.find((f) => f.family === family);
  if (!font || font.weights.includes(weight)) return weight;

  return font.weights.reduce((best, w) =>
    Math.abs(w - weight) < Math.abs(best - weight) ? w : best,
  );
}

export async function ensureFontLoaded(family: string, weight: number = 400): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) return;

  // عينة عربية وإنجليزية وأرقام لضمان تحميل كل المحارف المطلوبة
  const SAMPLE = 'الدعوة Invitation ٠١٢٣';

  try {
    await document.fonts.load(`${resolveWeight(family, weight)} 64px "${family}"`, SAMPLE);
    await document.fonts.ready;
  } catch {
    // إن فشل التحميل نكمل بالخط البديل بدل أن نُعطّل التوليد بالكامل
  }
}

/** ينتظر كل الخطوط المستخدمة في تصميم واحد */
export async function ensureFontsLoaded(specs: { family: string; weight?: number }[]) {
  await Promise.all(specs.map((s) => ensureFontLoaded(s.family, s.weight ?? 400)));
}
