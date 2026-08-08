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

/**
 * خطوط واجهة الموقع نفسه (مستقلة عن قائمة خطوط الدعوات أعلاه).
 *
 * - El Messiri: العناوين والشعار وعناوين الأقسام البارزة.
 * - IBM Plex Sans Arabic: النصوص العادية والفقرات وكل عناصر الواجهة.
 *
 * كلاهما يغطي العربية والإنجليزية والأرقام العربية والهندية بأوزان
 * ٤٠٠ و٥٠٠ و٦٠٠ و٧٠٠ — وهذه أثقل الأوزان المتاحة فيهما، فلا يُطلب
 * وزن أعلى منها في أي مكان حتى لا يزوّر المتصفح السُمك.
 */
export const UI_FONTS: FontOption[] = [
  { family: 'El Messiri', label: 'المصيري — عناوين', weights: [400, 500, 600, 700], display: true },
  { family: 'IBM Plex Sans Arabic', label: 'IBM بلكس — نصوص', weights: [400, 500, 600, 700] },
];

/** أثقل وزن متاح في خطوط الواجهة — تُبنى عليه أدوات Tailwind */
export const UI_MAX_WEIGHT = 700;

/**
 * رابط Google Fonts موحّد يغطي خطوط الواجهة وخطوط الدعوات معاً.
 * العائلات المكرّرة تُدمج بأوزانها مجتمعة حتى لا يتكرر التحميل.
 */
export function googleFontsHref(): string {
  const byFamily = new Map<string, Set<number>>();

  for (const font of [...UI_FONTS, ...FONTS]) {
    const weights = byFamily.get(font.family) ?? new Set<number>();
    font.weights.forEach((w) => weights.add(w));
    byFamily.set(font.family, weights);
  }

  const families = [...byFamily.entries()]
    .map(([family, weights]) => {
      const sorted = [...weights].sort((a, b) => a - b).join(';');
      return `family=${family.replace(/ /g, '+')}:wght@${sorted}`;
    })
    .join('&');

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
  // الخط المرفوع له وجه واحد فقط — نلزمه به وإلا زوّر المتصفح السُمك
  const custom = customFonts.find((f) => f.family === family);
  if (custom) return custom.weight;

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

  // الخط المرفوع لا وسم <link> له — نسجّله قبل انتظار تحميله
  const custom = customFonts.find((f) => f.family === family);
  if (custom) await registerCustomFont(custom);

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

// ===================== الخطوط المرفوعة =====================

export interface CustomFont {
  family: string;
  label: string;
  file_url: string;
  format: string;
  weight: number;
}

/**
 * الخطوط المرفوعة من لوحة الأدمن.
 *
 * تُملأ مرة واحدة عند تحميل محرّر التصميم، ثم تُقرأ من هنا في كل مكان
 * يحتاج قائمة الخطوط — بدل تمريرها عبر خمس طبقات من الخصائص.
 */
let customFonts: CustomFont[] = [];
const registered = new Set<string>();

export function setCustomFonts(fonts: CustomFont[]) {
  customFonts = fonts;
}

export function getCustomFonts(): CustomFont[] {
  return customFonts;
}

/** الخطوط الجاهزة والمرفوعة معاً — هذي التي تظهر في قائمة الاختيار */
export function allFontOptions(): FontOption[] {
  return [
    ...FONTS,
    ...customFonts.map((f) => ({
      family: f.family,
      label: `${f.label} — مرفوع`,
      weights: [f.weight],
    })),
  ];
}

/**
 * يسجّل خطاً مرفوعاً في المستند عبر FontFace.
 *
 * الخطوط الجاهزة تصل عبر وسم <link> في التخطيط، أما المرفوعة فلا رابط
 * لها — فنبنيها يدوياً ونضيفها لـ document.fonts، وإلا رسم الكانفس بخط
 * بديل بلا أي خطأ ظاهر.
 */
async function registerCustomFont(font: CustomFont): Promise<void> {
  if (typeof document === 'undefined' || registered.has(font.family)) return;
  registered.add(font.family);

  try {
    const face = new FontFace(
      font.family,
      `url("${font.file_url}") format("${font.format}")`,
      { weight: String(font.weight) },
    );
    await face.load();
    document.fonts.add(face);
  } catch {
    // خط تالف أو رابط معطّل لا يجوز أن يُعطّل توليد الدعوات كلها
    registered.delete(font.family);
  }
}

/** يسجّل كل الخطوط المرفوعة — يُستدعى مرة عند فتح المحرّر */
export async function registerAllCustomFonts(): Promise<void> {
  await Promise.all(customFonts.map(registerCustomFont));
}
