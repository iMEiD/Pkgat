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

/** أرقام الجوال تصل بصيغ مختلفة — واتساب يقبل الأرقام وحدها */
function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '').replace(/^00/, '');
  return digits.length >= 9 ? digits : null;
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
