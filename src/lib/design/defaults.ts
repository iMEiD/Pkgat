import type { DesignConfig, NameLayer, QrLayer } from '@/lib/types/database';
import { DEFAULT_FONT } from './fonts';

export const DEFAULT_CANVAS = { width: 1080, height: 1920 };

export const DEFAULT_NAME_LAYER: NameLayer = {
  sample: 'اسم المدعو',
  x: 0.5,
  y: 0.62,
  fontFamily: DEFAULT_FONT,
  fontSize: 0.06,
  color: '#2A2521',
  weight: 700,
  align: 'center',
  letterSpacing: 0,
  shadow: false,
};

export const DEFAULT_QR_LAYER: QrLayer = {
  x: 0.5,
  y: 0.84,
  size: 0.24,
  foreground: '#000000',
  background: '#FFFFFF',
  margin: 2,
  rounded: false,
  visible: true,
};

export function defaultDesign(): DesignConfig {
  return {
    source: 'template',
    backgroundUrl: null,
    width: DEFAULT_CANVAS.width,
    height: DEFAULT_CANVAS.height,
    name: { ...DEFAULT_NAME_LAYER },
    qr: { ...DEFAULT_QR_LAYER },
    extras: [],
  };
}

/** يدمج إعدادات قالب جاهز فوق الافتراضيات بأمان */
export function mergeDesign(base: Partial<DesignConfig> | null | undefined): DesignConfig {
  const d = defaultDesign();
  if (!base) return d;
  return {
    ...d,
    ...base,
    name: { ...d.name, ...(base.name ?? {}) },
    qr: { ...d.qr, ...(base.qr ?? {}) },
    extras: base.extras ?? [],
  };
}

export const EVENT_TYPES = [
  { value: 'wedding', label: 'عرس', emoji: '💍', color: 'rose' },
  { value: 'graduation', label: 'تخرج', emoji: '🎓', color: 'grape' },
  { value: 'party', label: 'حفل', emoji: '🎉', color: 'coral' },
  { value: 'other', label: 'أخرى', emoji: '✨', color: 'mint' },
] as const;

/** الفئات المقترحة تلقائياً حسب نوع المناسبة */
export const SUGGESTED_TAGS: Record<string, { name: string; color: string }[]> = {
  wedding: [
    { name: 'طرف المعرس', color: 'sky' },
    { name: 'طرف العروس', color: 'rose' },
  ],
  graduation: [
    { name: 'العائلة', color: 'grape' },
    { name: 'الأصدقاء', color: 'mint' },
  ],
  party: [
    { name: 'الأصدقاء', color: 'coral' },
    { name: 'زملاء العمل', color: 'sky' },
  ],
  other: [],
};

export const TAG_COLORS = [
  { value: 'grape', label: 'بنفسجي', hex: '#6D4AFF' },
  { value: 'coral', label: 'مرجاني', hex: '#FF6B4A' },
  { value: 'mint', label: 'نعناعي', hex: '#17BE94' },
  { value: 'sky', label: 'سماوي', hex: '#2E90FA' },
  { value: 'rose', label: 'وردي', hex: '#F0518B' },
  { value: 'sunny', label: 'ذهبي', hex: '#F5B01B' },
  { value: 'sand', label: 'بيج', hex: '#C2AC88' },
];

export function tagHex(color: string): string {
  return TAG_COLORS.find((c) => c.value === color)?.hex ?? '#6D4AFF';
}
