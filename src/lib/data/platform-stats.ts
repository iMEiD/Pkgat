import { createClient } from '@/lib/supabase/server';
import {
  readSocialProof,
  readSocialProofMin,
  readSocialProofMode,
  type SocialProof,
} from '@/lib/site-settings';

/**
 * أرقام الإثبات الاجتماعي كما تُعرض فعلاً.
 *
 * الوضع اليدوي يعرض ما كتبه الأدمن — للتجربة والمعاينة قبل الإطلاق.
 * والوضع التلقائي يقرأ الأرقام من قاعدة البيانات عبر دالة مجمِّعة، فلا
 * يمكن تزويرها ولا نسيان تحديثها.
 *
 * والتقييم يبقى يدوياً في الوضعين: المنصة لا تجمع تقييمات مرقّمة بعد،
 * وحسابه من التقييمات المعتمَدة يحتاج بناءً مستقلاً — واختلاقُه هنا
 * هو بعينه ما نتجنّبه.
 */
export async function getDisplayedProof(
  settings: Record<string, unknown>,
): Promise<SocialProof> {
  const manual = readSocialProof(settings);
  if (readSocialProofMode(settings) === 'manual') return manual;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('platform_stats');
    if (error || !data) return { ...manual, events: null, guests: null };

    const stats = data as unknown as { events?: number; guests?: number };
    const events = Number(stats.events ?? 0);
    const guests = Number(stats.guests ?? 0);

    // تحت الحدّ الأدنى يسكت الرقمان — ويبقى التقييم إن ضُبط
    if (events < readSocialProofMin(settings)) {
      return { ...manual, events: null, guests: null };
    }

    return {
      ...manual,
      events: events > 0 ? events : null,
      guests: guests > 0 ? guests : null,
    };
  } catch {
    // تعذّرت القراءة (قبل تنفيذ الترحيل مثلاً) — لا نخترع رقماً
    return { ...manual, events: null, guests: null };
  }
}
