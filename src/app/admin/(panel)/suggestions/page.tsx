import type { Metadata } from 'next';

import { SuggestionsInbox } from './SuggestionsInbox';
import { createServiceClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'الاقتراحات' };
export const dynamic = 'force-dynamic';

export interface SuggestionRow {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  category: string;
  message: string;
  status: string;
  created_at: string;
}

export default async function AdminSuggestionsPage() {
  await requireAdmin();
  const supabase = createServiceClient();

  const { data } = await supabase
    .from('suggestions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(300);

  return <SuggestionsInbox items={(data ?? []) as SuggestionRow[]} />;
}
