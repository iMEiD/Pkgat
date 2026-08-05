/**
 * قائمة الدول لاختيار مفتاح الجوال عند التسجيل.
 *
 * السعودية أولاً ثم دول الخليج ثم بقية الدول العربية — لأن هؤلاء هم
 * جمهور المنصة الفعلي، ولا فائدة من قائمة عالمية كاملة يبحث فيها
 * المستخدم عن بلده وسط ٢٠٠ خيار.
 *
 * `digits` هو طول الرقم المحلي بعد حذف الصفر الأول، ويُستخدم في التحقق.
 */
export interface Country {
  code: string;   // ISO-3166 alpha-2
  dial: string;   // مفتاح الدولة بدون +
  name: string;
  flag: string;
  digits: number[]; // الأطوال المقبولة للرقم المحلي
}

export const COUNTRIES: Country[] = [
  { code: 'SA', dial: '966', name: 'السعودية',      flag: '🇸🇦', digits: [9] },
  { code: 'AE', dial: '971', name: 'الإمارات',       flag: '🇦🇪', digits: [9] },
  { code: 'KW', dial: '965', name: 'الكويت',        flag: '🇰🇼', digits: [8] },
  { code: 'QA', dial: '974', name: 'قطر',           flag: '🇶🇦', digits: [8] },
  { code: 'BH', dial: '973', name: 'البحرين',       flag: '🇧🇭', digits: [8] },
  { code: 'OM', dial: '968', name: 'عُمان',          flag: '🇴🇲', digits: [8] },
  { code: 'YE', dial: '967', name: 'اليمن',         flag: '🇾🇪', digits: [9] },
  { code: 'JO', dial: '962', name: 'الأردن',        flag: '🇯🇴', digits: [9] },
  { code: 'EG', dial: '20',  name: 'مصر',           flag: '🇪🇬', digits: [10] },
  { code: 'IQ', dial: '964', name: 'العراق',        flag: '🇮🇶', digits: [10] },
  { code: 'SY', dial: '963', name: 'سوريا',         flag: '🇸🇾', digits: [9] },
  { code: 'LB', dial: '961', name: 'لبنان',         flag: '🇱🇧', digits: [7, 8] },
  { code: 'PS', dial: '970', name: 'فلسطين',        flag: '🇵🇸', digits: [9] },
  { code: 'SD', dial: '249', name: 'السودان',       flag: '🇸🇩', digits: [9] },
  { code: 'LY', dial: '218', name: 'ليبيا',          flag: '🇱🇾', digits: [9] },
  { code: 'TN', dial: '216', name: 'تونس',          flag: '🇹🇳', digits: [8] },
  { code: 'DZ', dial: '213', name: 'الجزائر',       flag: '🇩🇿', digits: [9] },
  { code: 'MA', dial: '212', name: 'المغرب',        flag: '🇲🇦', digits: [9] },
  { code: 'TR', dial: '90',  name: 'تركيا',          flag: '🇹🇷', digits: [10] },
  { code: 'GB', dial: '44',  name: 'بريطانيا',       flag: '🇬🇧', digits: [10] },
  { code: 'US', dial: '1',   name: 'أمريكا',        flag: '🇺🇸', digits: [10] },
];

export const DEFAULT_COUNTRY = 'SA';

export function findCountry(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

/** يحذف كل ما ليس رقماً، ثم الأصفار البادئة (٠٥٥ → ٥٥) */
export function normalizeLocalNumber(raw: string): string {
  return raw.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * يتحقق من الرقم ويُرجع الصيغة الدولية بالأرقام فقط (٩٦٦٥xxxxxxxx)
 * — نفس الصيغة التي يتوقعها رابط واتساب في لوحة الأدمن.
 */
export function buildPhone(
  countryCode: string,
  localRaw: string,
): { ok: true; phone: string } | { ok: false; error: string } {
  const country = findCountry(countryCode);
  const local = normalizeLocalNumber(localRaw);

  if (!local) return { ok: false, error: 'رقم الجوال مطلوب.' };

  if (!country.digits.includes(local.length)) {
    const expected = country.digits.join(' أو ');
    return {
      ok: false,
      error: `رقم ${country.name} لازم يكون ${expected} أرقام بعد المفتاح — أدخلت ${local.length}.`,
    };
  }

  // خصوصية السعودية: الجوال يبدأ بـ ٥ دائماً، وهذا أكثر خطأ متوقع
  if (country.code === 'SA' && !local.startsWith('5')) {
    return { ok: false, error: 'رقم الجوال السعودي لازم يبدأ بـ ٥ (مثال: 512345678).' };
  }

  return { ok: true, phone: `${country.dial}${local}` };
}
