/**
 * إعدادات الموقع العامة كما يضبطها الأدمن — مقروءة بأنواع مضمونة.
 *
 * المبدأ: ما لم يُضبط لا يُعرض. الأرقام الافتراضية صفر والروابط فارغة،
 * والواجهة تُخفي عناصرها حينها. رقم مُختلَق في موضع «إثبات اجتماعي»
 * يضرّ الثقة أكثر مما يبنيها.
 */

export interface SocialProof {
  events: number | null;
  guests: number | null;
  rating: number | null;
  ratingCount: number | null;
}

export interface ContactLinks {
  /** رقم واتساب بصيغة دولية بلا رموز — مثال 966512345678 */
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  x: string | null;
}

function num(settings: Record<string, unknown>, key: string): number | null {
  const raw = settings[key];
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function str(settings: Record<string, unknown>, key: string): string | null {
  const raw = settings[key];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export function readSocialProof(settings: Record<string, unknown>): SocialProof {
  return {
    events: num(settings, 'social_proof_events'),
    guests: num(settings, 'social_proof_guests'),
    rating: num(settings, 'social_proof_rating'),
    ratingCount: num(settings, 'social_proof_rating_count'),
  };
}

/** هل يوجد ما يستحق العرض أصلاً؟ */
export function hasSocialProof(proof: SocialProof): boolean {
  return Boolean(proof.events || proof.guests || proof.rating);
}

/**
 * يحوّل رقم الجوال لصيغة wa.me الدولية: أرقام فقط بمفتاح الدولة.
 *
 * wa.me لا يقبل الصيغة المحلية: الرابط wa.me/0551221129 يفتح واتساب
 * ويقول إن الرقم غير صالح — فيبدو الزر معطّلاً بلا سبب ظاهر. ولأن
 * الرقم يُكتب من لوحة الأدمن بأي صيغة يعتادها صاحبه، نصحّحها هنا بدل
 * أن نشترط عليه صيغة يسهل نسيانها:
 *
 *   0551221129      →  966551221129
 *   551221129       →  966551221129
 *   +966 55 122 1129 →  966551221129
 *   00966551221129  →  966551221129
 *
 * أرقام الدول الأخرى تُترك كما هي بعد تنظيفها.
 */
function normalizePhone(value: string | null): string | null {
  if (!value) return null;

  let digits = value.replace(/\D/g, '').replace(/^00/, '');

  if (!digits.startsWith('966')) {
    if (digits.startsWith('0')) {
      // صيغة محلية: نُسقط الصفر ونضع مفتاح السعودية
      digits = `966${digits.replace(/^0+/, '')}`;
    } else if (digits.length === 9 && digits.startsWith('5')) {
      // جوال سعودي بلا صفر ولا مفتاح
      digits = `966${digits}`;
    }
  }

  // أقصر من ذلك ليس رقماً دولياً صالحاً — نُخفي الزر بدل رابط معطوب
  return digits.length >= 11 ? digits : null;
}

export function readContactLinks(settings: Record<string, unknown>): ContactLinks {
  return {
    whatsapp: normalizePhone(str(settings, 'support_whatsapp')),
    email: str(settings, 'support_email'),
    instagram: str(settings, 'instagram_url'),
    x: str(settings, 'x_url'),
  };
}

export function whatsappHref(phone: string, message?: string): string {
  const text = message ? `?text=${encodeURIComponent(message)}` : '';
  return `https://wa.me/${phone}${text}`;
}
