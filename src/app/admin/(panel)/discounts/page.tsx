import type { Metadata } from 'next';

import { DiscountsManager } from './DiscountsManager';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import type { DiscountCode, DiscountCodeStats, Plan } from '@/lib/types/database';

export const metadata: Metadata = { title: 'أكواد الخصم' };
export const dynamic = 'force-dynamic';

export default async function AdminDiscountsPage() {
  await requireAdmin();
  const supabase = createServiceClient();

  const [{ data: codes }, { data: stats }, { data: plans }] = await Promise.all([
    supabase.from('discount_codes').select('*').order('created_at', { ascending: false }),
    supabase.from('discount_code_stats').select('*'),
    supabase.from('plans').select('*').order('sort_order'),
  ]);

  return (
    <DiscountsManager
      codes={(codes ?? []) as DiscountCode[]}
      stats={(stats ?? []) as DiscountCodeStats[]}
      plans={(plans ?? []) as Plan[]}
    />
  );
}
