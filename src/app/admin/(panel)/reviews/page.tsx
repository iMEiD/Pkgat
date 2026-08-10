import type { Metadata } from 'next';

import { ReviewsInbox } from './ReviewsInbox';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import type { Review } from '@/lib/types/database';

export const metadata: Metadata = { title: 'التقييمات' };
export const dynamic = 'force-dynamic';

export default async function AdminReviewsPage() {
  await requireAdmin();
  const supabase = createServiceClient();

  // الجديد أولاً: ما ينتظر مراجعتك هو أول ما تريد رؤيته
  const { data } = await supabase
    .from('reviews')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  return <ReviewsInbox items={(data ?? []) as Review[]} />;
}
