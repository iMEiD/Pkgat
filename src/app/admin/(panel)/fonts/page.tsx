import type { Metadata } from 'next';

import { FontsManager } from './FontsManager';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';
import type { CustomFontRow } from '@/lib/types/database';

export const metadata: Metadata = { title: 'الخطوط' };
export const dynamic = 'force-dynamic';

export default async function AdminFontsPage() {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('custom_fonts')
    .select('*')
    .order('sort_order')
    .order('created_at');

  return <FontsManager fonts={(data ?? []) as CustomFontRow[]} />;
}
