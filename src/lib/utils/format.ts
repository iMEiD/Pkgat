import { EVENT_TIME_ZONE, toEventLocalInput } from './time';

const AR_LOCALE = 'ar-SA';

const dateTimeFmt = new Intl.DateTimeFormat(AR_LOCALE, {
  dateStyle: 'full',
  timeStyle: 'short',
  numberingSystem: 'latn',
  calendar: 'gregory',
  timeZone: EVENT_TIME_ZONE,
});

const dateFmt = new Intl.DateTimeFormat(AR_LOCALE, {
  dateStyle: 'long',
  numberingSystem: 'latn',
  calendar: 'gregory',
  timeZone: EVENT_TIME_ZONE,
});

const timeFmt = new Intl.DateTimeFormat(AR_LOCALE, {
  timeStyle: 'short',
  numberingSystem: 'latn',
  timeZone: EVENT_TIME_ZONE,
});

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dateTimeFmt.format(new Date(value));
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return dateFmt.format(new Date(value));
}

export function formatTime(value: string | Date | null | undefined): string {
  if (!value) return '—';
  return timeFmt.format(new Date(value));
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(AR_LOCALE, { numberingSystem: 'latn' }).format(value);
}

export function formatPercent(part: number, total: number): string {
  if (!total) return '٠٪';
  return `${Math.round((part / total) * 100)}٪`;
}

/** السعر بالهللات → نص بالريال */
export function formatPrice(halalas: number, currency = 'SAR'): string {
  if (halalas === 0) return 'مجاناً';
  return new Intl.NumberFormat(AR_LOCALE, {
    style: 'currency',
    currency,
    numberingSystem: 'latn',
    maximumFractionDigits: halalas % 100 === 0 ? 0 : 2,
  }).format(halalas / 100);
}

export function billingLabel(period: string): string {
  switch (period) {
    case 'monthly':
      return '/ شهرياً';
    case 'yearly':
      return '/ سنوياً';
    default:
      return 'لمرة واحدة';
  }
}

/** فرق زمني مقروء: "بعد ٣ أيام" / "قبل ساعتين" */
export function relativeTime(value: string | Date): string {
  const target = new Date(value).getTime();
  const diffMs = target - Date.now();
  const rtf = new Intl.RelativeTimeFormat(AR_LOCALE, { numeric: 'auto' });
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000000],
    ['month', 2592000000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ];
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return 'الآن';
}

/** لتعبئة حقول datetime-local — بتوقيت المناسبة لا بتوقيت جهاز المستخدم */
export const toLocalInputValue = toEventLocalInput;

export const EVENT_TYPE_LABELS: Record<string, string> = {
  wedding: 'عرس',
  graduation: 'تخرج',
  party: 'حفل',
  other: 'مناسبة',
};

export const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  ready: 'جاهزة',
  live: 'جارية',
  ended: 'منتهية',
  archived: 'مؤرشفة',
};

export const CODE_STATE_LABELS: Record<string, string> = {
  inactive: 'غير مفعّل',
  active: 'صالح',
  used: 'مستخدم',
  expired: 'منتهي',
};
