/**
 * هوية الموقع اللونية — تُخزَّن كبيانات ويحقنها الخادم كمتغيرات CSS.
 *
 * ألوان Tailwind في هذا المشروع معرَّفة بصيغة rgb(var(--pk-…) / <alpha-value>)
 * فتغيير المتغيّر هنا يغيّر كل الصفحات فوراً بدون إعادة بناء.
 */

export interface Theme {
  /** اللون الأساسي — الأزرار والروابط والعناصر التفاعلية */
  primary: string;
  /** خلفية الموقع الرئيسية */
  canvas: string;
  /** البيج المساند — البطاقات والحدود والخلفيات الثانوية */
  sand: string;
  /** لون النص الأساسي */
  ink: string;
}

export const DEFAULT_THEME: Theme = {
  primary: '#6D4AFF',
  canvas: '#FFFDF9',
  sand: '#E7DAC3',
  ink: '#2A2521',
};

/** مجموعات جاهزة تناسب أنواع مناسبات مختلفة */
export const THEME_PRESETS: { name: string; theme: Theme }[] = [
  { name: 'بنفسجي مرح (الافتراضي)', theme: DEFAULT_THEME },
  { name: 'مرجاني دافئ', theme: { primary: '#FF6B4A', canvas: '#FFFCF8', sand: '#EFDFCE', ink: '#2B2320' } },
  { name: 'أخضر نعناعي', theme: { primary: '#17BE94', canvas: '#FBFEFC', sand: '#DCE7DE', ink: '#1F2A26' } },
  { name: 'أزرق هادئ', theme: { primary: '#2E90FA', canvas: '#FBFDFF', sand: '#DBE4EC', ink: '#1E2733' } },
  { name: 'وردي ناعم', theme: { primary: '#F0518B', canvas: '#FFFBFC', sand: '#EEDCE2', ink: '#2C2126' } },
  { name: 'ذهبي فاخر', theme: { primary: '#B08430', canvas: '#FFFDF6', sand: '#E8DBBE', ink: '#2A2519' } },
];

// ===================== تحويلات الألوان =====================

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean.padEnd(6, '0').slice(0, 6);
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

export function isValidHex(value: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value.trim());
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;

  if (max === min) return [0, 0, l];

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;

  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }

  const hue = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue(p, q, h + 1 / 3) * 255),
    Math.round(hue(p, q, h) * 255),
    Math.round(hue(p, q, h - 1 / 3) * 255),
  ];
}

/** إحداثيات RGB مفصولة بمسافات — الصيغة التي يتوقعها Tailwind مع <alpha-value> */
function triplet(rgb: [number, number, number]): string {
  return rgb.join(' ');
}

/** مزج لونين بنسبة t (0 = الأول، 1 = الثاني) */
function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

const WHITE: [number, number, number] = [255, 255, 255];

/**
 * يبني تدرّجاً من لون واحد بالمزج نحو الأبيض للدرجات الفاتحة ونحو نسخة
 * داكنة منه للدرجات الغامقة.
 *
 * المزج النسبي مقصود: السلالم المبنية على إضاءة مطلقة تنقلب حين يختار
 * الأدمن لوناً فاتحاً أصلاً (فتصير ٤٠٠ أغمق من ٥٠٠). المزج يضمن تدرّجاً
 * متصاعداً دائماً مهما كان اللون المختار.
 */
function buildScale(hex: string, lightStops: Record<number, number>, darkStops: Record<number, number>) {
  const base = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(...base);
  // الطرف الداكن: نفس الدرجة اللونية بإضاءة منخفضة وتشبّع أعلى قليلاً.
  // نضمن ألا يكون أفتح من الأصل مهما كان اللون داكناً من البداية.
  const deep = hslToRgb(h, Math.min(1, s * 1.05), Math.max(0, Math.min(l * 0.42, l - 0.02)));

  const out: Record<number, string> = {};
  for (const [stop, t] of Object.entries(lightStops)) {
    out[Number(stop)] = triplet(mix(base, WHITE, t));
  }
  out[500] = triplet(base);
  for (const [stop, t] of Object.entries(darkStops)) {
    out[Number(stop)] = triplet(mix(base, deep, t));
  }
  return out;
}

const PRIMARY_LIGHT = { 50: 0.94, 100: 0.86, 200: 0.7, 300: 0.5, 400: 0.26 };
const PRIMARY_DARK = { 600: 0.34, 700: 0.62 };
const SAND_LIGHT = { 50: 0.82, 100: 0.66, 200: 0.42, 300: 0.18 };
const SAND_DARK = { 400: 0.3, 500: 0.62 };

/** كل متغيرات الهوية جاهزة للحقن في <style> */
export function themeToCssVars(theme: Theme): string {
  const primary = buildScale(theme.primary, PRIMARY_LIGHT, PRIMARY_DARK);

  // البيج: الدرجة ٣٠٠ هي اللون المختار، وما دونها أفتح
  const sandScale = buildScale(theme.sand, SAND_LIGHT, SAND_DARK);
  delete sandScale[500];
  const sandBase = buildScale(theme.sand, {}, { 400: 0.3, 500: 0.62 });
  const sand: Record<number, string> = {
    50: sandScale[50],
    100: sandScale[100],
    200: sandScale[200],
    300: triplet(hexToRgb(theme.sand)),
    400: sandBase[400],
    500: sandBase[500],
  };

  // درجات النص: مزج لون النص نحو خلفية الموقع — يضمن انسجامها معاً
  const inkRgb = hexToRgb(theme.ink);
  const canvasRgb = hexToRgb(theme.canvas);

  const lines = [
    `--pk-canvas: ${triplet(canvasRgb)};`,
    `--pk-ink: ${triplet(inkRgb)};`,
    `--pk-ink-soft: ${triplet(mix(inkRgb, canvasRgb, 0.32))};`,
    `--pk-ink-faint: ${triplet(mix(inkRgb, canvasRgb, 0.55))};`,
    ...Object.entries(primary).map(([k, v]) => `--pk-primary-${k}: ${v};`),
    ...Object.entries(sand).map(([k, v]) => `--pk-sand-${k}: ${v};`),
  ];

  return `:root{${lines.join('')}}`;
}

/** يقرأ الهوية المخزّنة بأمان ويكمل الناقص من الافتراضي */
export function parseTheme(value: unknown): Theme {
  if (!value || typeof value !== 'object') return DEFAULT_THEME;
  const raw = value as Partial<Record<keyof Theme, unknown>>;

  const pick = (key: keyof Theme): string => {
    const v = raw[key];
    return typeof v === 'string' && isValidHex(v) ? normalizeHex(v) : DEFAULT_THEME[key];
  };

  return { primary: pick('primary'), canvas: pick('canvas'), sand: pick('sand'), ink: pick('ink') };
}

export function normalizeHex(value: string): string {
  const clean = value.trim().replace('#', '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  return `#${full.toUpperCase()}`;
}
