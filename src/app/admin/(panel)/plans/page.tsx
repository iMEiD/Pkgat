import type { Metadata } from 'next';

import { PlansManager } from './PlansManager';
import { createServiceClient } from '@/lib/supabase/server';
import type { Plan } from '@/lib/types/database';

export const metadata: Metadata = { title: 'الباقات والأسعار' };
export const dynamic = 'force-dynamic';

export default async function AdminPlansPage() {
  const supabase = createServiceClient();
  const { data } = await supabase.from('plans').select('*').order('sort_order');

  return <PlansManager plans={(data ?? []) as Plan[]} />;
}
