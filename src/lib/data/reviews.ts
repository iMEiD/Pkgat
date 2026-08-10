import { createClient } from '@/lib/supabase/server';
import type { PublishedReview, Review } from '@/lib/types/database';

/**
 * قسم التقييمات في الصفحة الرئيسية.
 *
 * القاعدة نفسها التي حكمت معرض التصاميم: القسم يَعِد بآراء عملاء، فإما
 * أن يفي أو يختفي. تقييم واحد يتيم تحت عنوان «وش يقولون؟» يقول للزائر
 * إن أحداً لم يستخدم المنصة — وهو أسوأ من غياب القسم.
 */
export const REVIEWS_MIN = 2;

/** أكثر ما تستوعبه الشبكة بشكل مرتب (صفّان × ثلاثة) */
export const REVIEWS_MAX = 6;

export interface ReviewsBlock {
  items: PublishedReview[];
  /** متوسط التقييم المنشور — يُحسب من المعروض نفسه لا من رقم مكتوب يدوياً */
  average: number;
  count: number;
  ready: boolean;
}

export async function getPublishedReviews(): Promise<ReviewsBlock> {
  const empty: ReviewsBlock = { items: [], average: 0, count: 0, ready: false };

  try {
    const supabase = await createClient();
    const { data } = await supabase.from('published_reviews').select('*').limit(REVIEWS_MAX);

    const items = (data ?? []) as PublishedReview[];
    if (items.length === 0) return empty;

    const average = items.reduce((sum, r) => sum + r.rating, 0) / items.length;

    return {
      items,
      average,
      count: items.length,
      ready: items.length >= REVIEWS_MIN,
    };
  } catch {
    // القسم يختفي بدل أن تسقط الصفحة كلها — الترحيل قد لا يكون نُفِّذ بعد
    return empty;
  }
}

/** تقييم المستخدم الحالي إن كتبه — لتعرف اللوحة أتسأله أم تعرض حالته */
export async function getMyReview(userId: string): Promise<Review | null> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('reviews')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    return (data as Review) ?? null;
  } catch {
    return null;
  }
}
